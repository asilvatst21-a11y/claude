import { useState, useRef } from 'react'
import { Camera, Upload, X, Check, AlertCircle, Loader, Key } from 'lucide-react'
import { getIngredients, getSuppliers, saveIngredient, saveSupplier, savePurchase, id } from '../store/storage'
import type { Purchase, PurchaseItem, Ingredient, Supplier } from '../types'

interface ExtractedItem {
  name: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  ingredientId?: string
}

interface ExtractedReceipt {
  storeName: string
  date: string
  items: ExtractedItem[]
  total: number
}

function getApiKey() {
  return localStorage.getItem('ff_vision_api_key') || ''
}

function saveApiKey(key: string) {
  localStorage.setItem('ff_vision_api_key', key)
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseBRPrice(s: string): number {
  const cleaned = s.replace(/[^\d,]/g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

function parseReceipt(text: string): ExtractedReceipt {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Nome do estabelecimento: geralmente nas primeiras linhas antes do CNPJ
  let storeName = ''
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    if (/cnpj/i.test(lines[i])) {
      storeName = lines.slice(0, i).find(l => l.length > 3) || lines[0]
      break
    }
  }
  if (!storeName) storeName = lines[0] || 'Fornecedor'
  storeName = storeName.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, '').trim()

  // Data
  const dateMatch = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2,4})/)
  let date = new Date().toISOString().slice(0, 10)
  if (dateMatch) {
    const [, d, m, y] = dateMatch
    const year = y.length === 2 ? `20${y}` : y
    date = `${year}-${m}-${d}`
  }

  // Total
  const totalMatch = text.match(/total[^\d]*(\d[\d.,]+)/i)
  const total = totalMatch ? parseBRPrice(totalMatch[1]) : 0

  // Itens: detecta padrões comuns de cupom fiscal brasileiro
  const items: ExtractedItem[] = []
  const pricePattern = /(\d+[.,]\d{2})/g
  const unitPattern = /(\d+[.,]?\d*)\s*(kg|g|l|ml|lt|un|pct|cx|fd|sc|bd|pc|cj|fr|lata|garrafa)/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Ignora linhas de cabeçalho/rodapé comuns
    if (/cnpj|cpf|ie:|insc|total|subtotal|troco|desconto|acrescimo|taxa|dinheiro|cartao|pix|recibo|nota|fiscal|obrigado|cliente|documento/i.test(line)) continue
    if (line.length < 4) continue

    const unitMatch = line.match(unitPattern)
    const prices = line.match(pricePattern)

    if (unitMatch && prices) {
      const quantity = parseFloat(unitMatch[1].replace(',', '.'))
      const unit = unitMatch[2].toLowerCase()
      const normalizedUnit = unit === 'l' || unit === 'lt' ? 'L'
        : unit === 'ml' ? 'ml'
        : unit === 'kg' ? 'kg'
        : unit === 'g' ? 'g'
        : unit === 'pct' ? 'pct'
        : unit === 'cx' ? 'cx'
        : 'un'

      const priceValues = prices.map(parseBRPrice).filter(v => v > 0)
      const totalPrice = priceValues[priceValues.length - 1] || 0
      const unitPrice = quantity > 0 ? totalPrice / quantity : totalPrice

      // Nome do produto: texto antes do padrão de quantidade
      const nameRaw = line.split(unitMatch[0])[0].trim()
      const name = nameRaw.replace(/^\d+\s*/, '').replace(/[^a-zA-ZÀ-ÿ0-9\s\-]/g, '').trim()

      if (name.length > 1 && totalPrice > 0) {
        items.push({ name, quantity, unit: normalizedUnit, unitPrice, totalPrice })
      }
    } else if (prices && prices.length >= 2) {
      // Tenta extrair item com preço unitário e total na mesma linha
      const priceValues = prices.map(parseBRPrice).filter(v => v > 0)
      if (priceValues.length < 2) continue

      const totalPrice = priceValues[priceValues.length - 1]
      const unitPrice = priceValues[0]

      const nameRaw = line.replace(pricePattern, '').replace(/[^a-zA-ZÀ-ÿ0-9\s\-]/g, '').trim()
      const qtyMatch = nameRaw.match(/^(\d+)\s+(.+)/)
      const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1
      const name = qtyMatch ? qtyMatch[2].trim() : nameRaw

      if (name.length > 1 && totalPrice > 0 && name !== storeName) {
        items.push({ name, quantity, unit: 'un', unitPrice, totalPrice })
      }
    }
  }

  return { storeName, date, items, total }
}

async function callVisionAPI(base64Image: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
      })
    }
  )
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error?.message || 'Erro na API do Google Vision')
  }
  const data = await response.json()
  return data.responses?.[0]?.fullTextAnnotation?.text || ''
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface Props {
  onClose: () => void
  onImported: () => void
}

export default function NotaFiscalImport({ onClose, onImported }: Props) {
  const [step, setStep] = useState<'config' | 'capture' | 'processing' | 'review'>('capture')
  const [apiKey, setApiKey] = useState(getApiKey)
  const [error, setError] = useState('')
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null)
  const [editItems, setEditItems] = useState<ExtractedItem[]>([])
  const [editStoreName, setEditStoreName] = useState('')
  const [editDate, setEditDate] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const ingredients = getIngredients()
  const suppliers = getSuppliers()

  const savedKey = getApiKey()

  async function handleFile(file: File) {
    const key = apiKey || savedKey
    if (!key) { setStep('config'); return }

    setStep('processing')
    setError('')
    try {
      const base64 = await toBase64(file)
      const text = await callVisionAPI(base64, key)
      if (!text) throw new Error('Não foi possível ler o texto da imagem.')
      const receipt = parseReceipt(text)
      setExtracted(receipt)
      setEditItems(receipt.items.map(item => ({
        ...item,
        ingredientId: ingredients.find(i => i.name.toLowerCase().includes(item.name.toLowerCase().slice(0, 5)))?.id || ''
      })))
      setEditStoreName(receipt.storeName)
      setEditDate(receipt.date)
      setStep('review')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      setStep('capture')
    }
  }

  function updateItem(idx: number, field: keyof ExtractedItem, value: string | number) {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [field]: value }
      if (field === 'quantity' || field === 'unitPrice') {
        updated.totalPrice = Number(updated.quantity) * Number(updated.unitPrice)
      }
      return updated
    }))
  }

  function removeItem(idx: number) {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
  }

  function saveImport() {
    const validItems = editItems.filter(item => item.name && item.totalPrice > 0)
    if (validItems.length === 0) return

    // Cria ou encontra fornecedor
    let supplierId = suppliers.find(s => s.name.toLowerCase() === editStoreName.toLowerCase())?.id || ''
    if (!supplierId) {
      const newSupplier: Supplier = { id: id(), name: editStoreName, contact: '', notes: 'Importado por nota fiscal' }
      saveSupplier(newSupplier)
      supplierId = newSupplier.id
    }

    // Cria ingredientes novos que não existem
    const purchaseItems: PurchaseItem[] = validItems.map(item => {
      let ingredientId = item.ingredientId
      if (!ingredientId) {
        const existing = ingredients.find(i => i.name.toLowerCase() === item.name.toLowerCase())
        if (existing) {
          ingredientId = existing.id
        } else {
          const newIng: Ingredient = {
            id: id(), name: item.name, unit: item.unit, currentStock: item.quantity, minStock: 0
          }
          saveIngredient(newIng)
          ingredientId = newIng.id
        }
      } else {
        // Atualiza estoque
        const ing = ingredients.find(i => i.id === ingredientId)
        if (ing) saveIngredient({ ...ing, currentStock: ing.currentStock + item.quantity })
      }
      return { ingredientId, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, totalPrice: item.totalPrice }
    })

    const purchase: Purchase = {
      id: id(),
      supplierId,
      supplierName: editStoreName,
      date: editDate,
      items: purchaseItems,
      totalValue: purchaseItems.reduce((s, i) => s + i.totalPrice, 0),
      notes: 'Importado por nota fiscal (OCR)'
    }
    savePurchase(purchase)
    onImported()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-800">Importar Nota Fiscal</h2>
            <p className="text-xs text-gray-400">Tire foto da nota e o sistema preenche automaticamente</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="p-5">
          {/* Config API Key */}
          {step === 'config' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <Key size={20} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Chave da API necessária</p>
                  <p className="text-xs text-amber-600 mt-1">
                    Para usar o Google Vision, você precisa de uma chave de API gratuita do Google Cloud.
                    Acesse <strong>console.cloud.google.com</strong>, ative a Vision API e crie uma chave.
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Chave da API Google Vision</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <button
                onClick={() => { saveApiKey(apiKey); setStep('capture') }}
                disabled={!apiKey}
                className="w-full bg-orange-500 text-white py-2.5 rounded-lg font-medium disabled:opacity-40 hover:bg-orange-600"
              >
                Salvar e continuar
              </button>
            </div>
          )}

          {/* Captura */}
          {step === 'capture' && (
            <div className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 items-start">
                  <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {!savedKey && !apiKey && (
                <button
                  onClick={() => setStep('config')}
                  className="w-full border border-dashed border-amber-300 bg-amber-50 rounded-xl p-4 text-center text-amber-700 text-sm font-medium hover:bg-amber-100"
                >
                  <Key size={16} className="mx-auto mb-1" />
                  Configurar chave da API Google Vision
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />

              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-orange-300 rounded-xl p-8 text-center hover:bg-orange-50 transition-colors"
              >
                <Camera size={32} className="text-orange-400 mx-auto mb-2" />
                <p className="font-medium text-gray-700">Tirar foto da nota</p>
                <p className="text-xs text-gray-400 mt-1">Abre a câmera do dispositivo</p>
              </button>

              <label className="w-full border border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:bg-gray-50 flex items-center justify-center gap-2 text-gray-600 text-sm font-medium">
                <Upload size={18} className="text-gray-400" />
                Ou selecionar imagem da galeria
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
            </div>
          )}

          {/* Processando */}
          {step === 'processing' && (
            <div className="text-center py-12">
              <Loader size={40} className="text-orange-500 mx-auto mb-4 animate-spin" />
              <p className="font-medium text-gray-700">Lendo a nota fiscal...</p>
              <p className="text-sm text-gray-400 mt-1">Isso pode levar alguns segundos</p>
            </div>
          )}

          {/* Revisão */}
          {step === 'review' && extracted && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Nome do estabelecimento</label>
                  <input
                    value={editStoreName}
                    onChange={e => setEditStoreName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Data da compra</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">{editItems.length} item(s) detectado(s)</p>
                  <p className="text-xs text-gray-400">Revise antes de salvar</p>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {editItems.map((item, idx) => (
                    <div key={idx} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        <div className="col-span-2">
                          <input
                            value={item.name}
                            onChange={e => updateItem(idx, 'name', e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-400"
                            placeholder="Nome do produto"
                          />
                        </div>
                        <div>
                          <input
                            type="number" min={0} step="0.001"
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-orange-400"
                          />
                        </div>
                        <div className="flex gap-1 items-center">
                          <select
                            value={item.unit}
                            onChange={e => updateItem(idx, 'unit', e.target.value)}
                            className="flex-1 border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none"
                          >
                            {['kg','g','L','ml','un','pct','cx'].map(u => <option key={u}>{u}</option>)}
                          </select>
                          <button onClick={() => removeItem(idx)}><X size={14} className="text-red-400" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-gray-400">Preço unit.</label>
                          <input
                            type="number" min={0} step="0.01"
                            value={item.unitPrice}
                            onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400">Total</label>
                          <p className="text-xs font-semibold text-green-600 pt-1">{fmt(item.totalPrice)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-400">Vincular ingrediente</label>
                          <select
                            value={item.ingredientId || ''}
                            onChange={e => updateItem(idx, 'ingredientId', e.target.value)}
                            className="w-full border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none"
                          >
                            <option value="">Criar novo</option>
                            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700">
                    Total importado: <span className="text-orange-600">{fmt(editItems.reduce((s, i) => s + i.totalPrice, 0))}</span>
                  </p>
                  {extracted.total > 0 && (
                    <p className="text-xs text-gray-400">Total da nota: {fmt(extracted.total)}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setStep('capture')} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                    Tirar outra foto
                  </button>
                  <button
                    onClick={saveImport}
                    disabled={editItems.length === 0}
                    className="flex items-center gap-2 bg-orange-500 text-white px-5 py-2 rounded-lg hover:bg-orange-600 text-sm font-medium disabled:opacity-40"
                  >
                    <Check size={16} /> Salvar compra
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
