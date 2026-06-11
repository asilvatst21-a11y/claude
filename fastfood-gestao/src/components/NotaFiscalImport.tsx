import { useState, useRef } from 'react'
import { Camera, Upload, X, Check, AlertCircle, Loader, QrCode } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
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

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

async function readQRCode(file: File): Promise<string | null> {
  const tmpId = 'qr-reader-tmp-' + Date.now()
  const div = document.createElement('div')
  div.id = tmpId
  div.style.display = 'none'
  document.body.appendChild(div)
  try {
    const scanner = new Html5Qrcode(tmpId)
    const result = await scanner.scanFile(file, false)
    return result || null
  } catch {
    return null
  } finally {
    document.getElementById(tmpId)?.remove()
  }
}

async function fetchSefaz(url: string): Promise<ExtractedReceipt> {
  const response = await fetch('/api/sefaz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error || 'Erro ao consultar a Sefaz.')
  }
  return response.json()
}

async function callClaudeOCR(base64Image: string, mediaType: string): Promise<ExtractedReceipt> {
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image, mediaType })
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err.error || 'Erro ao processar a imagem.')
  }
  return response.json()
}

function toBase64(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const [header, data] = result.split(',')
      const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
      resolve({ data, mediaType })
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
  const [step, setStep] = useState<'capture' | 'processing' | 'review'>('capture')
  const [error, setError] = useState('')
  const [processingMsg, setProcessingMsg] = useState('')
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null)
  const [editItems, setEditItems] = useState<ExtractedItem[]>([])
  const [editStoreName, setEditStoreName] = useState('')
  const [editDate, setEditDate] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const qrFileRef = useRef<HTMLInputElement>(null)

  const ingredients = getIngredients()
  const suppliers = getSuppliers()

  function applyReceipt(receipt: ExtractedReceipt) {
    setExtracted(receipt)
    setEditItems(receipt.items.map(item => ({
      ...item,
      ingredientId: ingredients.find(i =>
        i.name.toLowerCase().includes(item.name.toLowerCase().slice(0, 5))
      )?.id || ''
    })))
    setEditStoreName(receipt.storeName)
    setEditDate(receipt.date)
    setStep('review')
  }

  async function handleQRFile(file: File) {
    setStep('processing')
    setProcessingMsg('Lendo QR Code da imagem...')
    setError('')
    try {
      const url = await readQRCode(file)
      if (!url) throw new Error('QR Code não encontrado na imagem. Tente uma foto mais próxima e nítida.')
      if (!url.startsWith('http')) throw new Error('QR Code não contém uma URL válida da nota fiscal.')
      setProcessingMsg('Consultando a Sefaz...')
      const receipt = await fetchSefaz(url)
      if (!receipt.items || receipt.items.length === 0) throw new Error('Não foi possível extrair os produtos da nota.')
      applyReceipt(receipt)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      setStep('capture')
    }
  }

  async function handleQRUrl() {
    if (!qrUrl.startsWith('http')) { setError('Cole uma URL válida.'); return }
    setStep('processing')
    setProcessingMsg('Consultando a Sefaz...')
    setError('')
    try {
      const receipt = await fetchSefaz(qrUrl)
      if (!receipt.items || receipt.items.length === 0) throw new Error('Não foi possível extrair os produtos.')
      applyReceipt(receipt)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      setStep('capture')
    }
  }

  async function handleOCRFile(file: File) {
    setStep('processing')
    setProcessingMsg('Lendo a nota com IA...')
    setError('')
    try {
      const { data, mediaType } = await toBase64(file)
      const receipt = await callClaudeOCR(data, mediaType)
      if (!receipt.items || receipt.items.length === 0) throw new Error('Não foi possível extrair os produtos da imagem.')
      applyReceipt(receipt)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      setStep('capture')
    }
  }

  function updateItem(idx: number, field: keyof ExtractedItem, value: string | number) {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [field]: value }
      if (field === 'quantity' || field === 'unitPrice') updated.totalPrice = Number(updated.quantity) * Number(updated.unitPrice)
      return updated
    }))
  }

  function removeItem(idx: number) {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
  }

  function saveImport() {
    const validItems = editItems.filter(item => item.name && item.totalPrice > 0)
    if (validItems.length === 0) return

    let supplierId = suppliers.find(s => s.name.toLowerCase() === editStoreName.toLowerCase())?.id || ''
    if (!supplierId) {
      const newSupplier: Supplier = { id: id(), name: editStoreName, contact: '', notes: 'Importado por nota fiscal' }
      saveSupplier(newSupplier)
      supplierId = newSupplier.id
    }

    const purchaseItems: PurchaseItem[] = validItems.map(item => {
      let ingredientId = item.ingredientId
      if (!ingredientId) {
        const existing = ingredients.find(i => i.name.toLowerCase() === item.name.toLowerCase())
        if (existing) {
          ingredientId = existing.id
          saveIngredient({ ...existing, currentStock: existing.currentStock + item.quantity })
        } else {
          const newIng: Ingredient = { id: id(), name: item.name, unit: item.unit, currentStock: item.quantity, minStock: 0 }
          saveIngredient(newIng)
          ingredientId = newIng.id
        }
      } else {
        const ing = ingredients.find(i => i.id === ingredientId)
        if (ing) saveIngredient({ ...ing, currentStock: ing.currentStock + item.quantity })
      }
      return { ingredientId, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, totalPrice: item.totalPrice }
    })

    savePurchase({
      id: id(), supplierId, supplierName: editStoreName, date: editDate,
      items: purchaseItems,
      totalValue: purchaseItems.reduce((s, i) => s + i.totalPrice, 0),
      notes: 'Importado por nota fiscal'
    } as Purchase)
    onImported()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-800">Importar Nota Fiscal</h2>
            <p className="text-xs text-gray-400">Leia o QR Code ou tire foto da nota</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="p-5">
          {step === 'capture' && (
            <div className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 items-start">
                  <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* QR Code */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                  <QrCode size={16} /> QR Code da Nota (Recomendado)
                </p>

                <input ref={qrFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => e.target.files?.[0] && handleQRFile(e.target.files[0])} />

                <button onClick={() => qrFileRef.current?.click()}
                  className="w-full border-2 border-dashed border-green-300 rounded-xl p-5 text-center hover:bg-green-100 transition-colors mb-3">
                  <QrCode size={28} className="text-green-500 mx-auto mb-2" />
                  <p className="font-medium text-gray-700 text-sm">Fotografar o QR Code da nota</p>
                  <p className="text-xs text-gray-400 mt-1">Busca direto na Sefaz — mais preciso</p>
                </button>

                <div className="flex gap-2">
                  <input type="text" value={qrUrl} onChange={e => setQrUrl(e.target.value)}
                    placeholder="Ou cole a URL do QR Code aqui..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" />
                  <button onClick={handleQRUrl} disabled={!qrUrl}
                    className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-green-700">
                    Buscar
                  </button>
                </div>
              </div>

              {/* Foto da nota */}
              <div className="border border-gray-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-600 mb-1 flex items-center gap-2">
                  <Camera size={16} /> Foto da Nota (IA)
                </p>
                <p className="text-xs text-gray-400 mb-3">Use quando não há QR Code ou a leitura falhar</p>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => e.target.files?.[0] && handleOCRFile(e.target.files[0])} />
                <div className="flex gap-2">
                  <button onClick={() => fileRef.current?.click()}
                    className="flex-1 border border-dashed border-gray-300 rounded-lg p-3 text-center hover:bg-gray-50 text-sm text-gray-500">
                    <Camera size={18} className="mx-auto mb-1 text-gray-400" /> Câmera
                  </button>
                  <label className="flex-1 border border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:bg-gray-50 text-sm text-gray-500">
                    <Upload size={18} className="mx-auto mb-1 text-gray-400" /> Galeria
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => e.target.files?.[0] && handleOCRFile(e.target.files[0])} />
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-16">
              <Loader size={40} className="text-green-500 mx-auto mb-4 animate-spin" />
              <p className="font-medium text-gray-700">{processingMsg}</p>
            </div>
          )}

          {step === 'review' && extracted && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Estabelecimento</label>
                  <input value={editStoreName} onChange={e => setEditStoreName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C542]" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Data da compra</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C542]" />
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
                          <input value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#F5C542]" />
                        </div>
                        <input type="number" min={0} step="0.001" value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none" />
                        <div className="flex gap-1 items-center">
                          <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                            className="flex-1 border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none">
                            {['kg', 'g', 'L', 'ml', 'un', 'pct', 'cx'].map(u => <option key={u}>{u}</option>)}
                          </select>
                          <button onClick={() => removeItem(idx)}><X size={14} className="text-red-400" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-gray-400">Preço unit.</label>
                          <input type="number" min={0} step="0.01" value={item.unitPrice}
                            onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400">Total</label>
                          <p className="text-xs font-semibold text-green-600 pt-1">{fmt(item.totalPrice)}</p>
                        </div>
                        <div>
                          <label className="text-xs text-gray-400">Vincular ingrediente</label>
                          <select value={item.ingredientId || ''} onChange={e => updateItem(idx, 'ingredientId', e.target.value)}
                            className="w-full border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none">
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
                <p className="text-sm font-semibold text-gray-700">
                  Total: <span className="text-[#c49a20]">{fmt(editItems.reduce((s, i) => s + i.totalPrice, 0))}</span>
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setStep('capture')} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                    Voltar
                  </button>
                  <button onClick={saveImport} disabled={editItems.length === 0}
                    className="flex items-center gap-2 bg-[#F5C542] text-[#0F0F0F] px-5 py-2 rounded-lg hover:bg-[#d4a72c] text-sm font-medium disabled:opacity-40">
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
