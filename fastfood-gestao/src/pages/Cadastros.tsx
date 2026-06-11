import { useState, useEffect } from 'react'
import { getProducts, saveProduct, deleteProduct, getIngredients, saveIngredient, id } from '../store/storage'
import type { Product, ProductIngredient, Ingredient } from '../types'
import { Plus, Trash2, X, Settings, Edit2, FileText, Check, AlertCircle } from 'lucide-react'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const categories = [
  { value: 'macarrao', label: 'Macarrão na Chapa' },
  { value: 'hamburguer', label: 'Hambúrguer' },
  { value: 'cachorro_quente', label: 'Cachorro Quente' },
  { value: 'bebida', label: 'Bebida' },
  { value: 'outro', label: 'Outro' },
]

const emptyProduct = (): Product => ({
  id: id(),
  name: '',
  category: 'hamburguer',
  salePrice: 0,
  ingredients: [],
  active: true,
})

interface ParsedLine {
  name: string
  quantity: number
  unit: string
  ok: boolean
}

function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|L|l|ml|un|pct|cx)\s+(.+)$/i)
  if (!match) return { name: trimmed, quantity: 0, unit: 'un', ok: false }
  const quantity = parseFloat(match[1].replace(',', '.'))
  const unit = match[2].toLowerCase() === 'l' ? 'L' : match[2].toLowerCase()
  return { name: match[3].trim(), quantity, unit, ok: true }
}

export default function Cadastros() {
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState(getIngredients())
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [showImport, setShowImport] = useState(false)

  // Import form state
  const [importName, setImportName] = useState('')
  const [importCategory, setImportCategory] = useState<Product['category']>('macarrao')
  const [importPrice, setImportPrice] = useState('')
  const [importText, setImportText] = useState('')
  const [importSaved, setImportSaved] = useState(false)

  function reload() {
    setProducts(getProducts())
    setIngredients(getIngredients())
  }

  useEffect(() => { reload() }, [])

  function saveAndClose(p: Product) {
    saveProduct(p)
    reload()
    setEditProduct(null)
  }

  function addIngredientLine() {
    if (!editProduct) return
    const line: ProductIngredient = { ingredientId: '', quantity: 0, unit: 'g' }
    setEditProduct({ ...editProduct, ingredients: [...editProduct.ingredients, line] })
  }

  function updateIngLine(idx: number, field: keyof ProductIngredient, value: string | number) {
    if (!editProduct) return
    const next = editProduct.ingredients.map((ing, i) => {
      if (i !== idx) return ing
      const updated = { ...ing, [field]: value }
      if (field === 'ingredientId') {
        const found = ingredients.find(x => x.id === value)
        if (found) updated.unit = found.unit
      }
      return updated
    })
    setEditProduct({ ...editProduct, ingredients: next })
  }

  function removeIngLine(idx: number) {
    if (!editProduct) return
    setEditProduct({ ...editProduct, ingredients: editProduct.ingredients.filter((_, i) => i !== idx) })
  }

  // Parse preview
  const parsedLines = importText
    .split('\n')
    .map(parseLine)
    .filter(Boolean) as ParsedLine[]

  const validLines = parsedLines.filter(l => l.ok)

  function saveImport() {
    if (!importName || validLines.length === 0) return
    const currentIngs = getIngredients()
    const recipeLinks: ProductIngredient[] = []

    for (const line of validLines) {
      let ing = currentIngs.find(i => i.name.toLowerCase() === line.name.toLowerCase())
      if (!ing) {
        ing = { id: id(), name: line.name, unit: line.unit, currentStock: 0, minStock: 0 } as Ingredient
        saveIngredient(ing)
        currentIngs.push(ing)
      }
      recipeLinks.push({ ingredientId: ing.id, quantity: line.quantity, unit: line.unit })
    }

    saveProduct({
      id: id(),
      name: importName,
      category: importCategory,
      salePrice: parseFloat(importPrice) || 0,
      ingredients: recipeLinks,
      active: true,
    })

    reload()
    setImportSaved(true)
    setTimeout(() => {
      setShowImport(false)
      setImportName('')
      setImportCategory('macarrao')
      setImportPrice('')
      setImportText('')
      setImportSaved(false)
    }, 1500)
  }

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    acc[p.category] = acc[p.category] || []
    acc[p.category].push(p)
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cadastros</h1>
          <p className="text-gray-500 text-sm">Produtos e cardápio</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 font-medium text-sm"
          >
            <FileText size={16} /> Importar Receita
          </button>
          <button
            onClick={() => setEditProduct(emptyProduct())}
            className="flex items-center gap-2 bg-[#F5C542] text-[#0F0F0F] px-4 py-2 rounded-lg hover:bg-[#d4a72c] font-medium text-sm"
          >
            <Plus size={16} /> Novo Produto
          </button>
        </div>
      </div>

      {/* Modal Importar Receita */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-800">Importar Receita</h2>
                <p className="text-xs text-gray-400">Digite os ingredientes linha por linha</p>
              </div>
              <button onClick={() => setShowImport(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-600 mb-1 block">Nome do prato</label>
                  <input
                    value={importName}
                    onChange={e => setImportName(e.target.value)}
                    placeholder="Ex: Macarrão, X-Burguer..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Categoria</label>
                  <select
                    value={importCategory}
                    onChange={e => setImportCategory(e.target.value as Product['category'])}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  >
                    {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Preço de venda (R$)</label>
                  <input
                    type="number" min={0} step="0.01"
                    value={importPrice}
                    onChange={e => setImportPrice(e.target.value)}
                    placeholder="0,00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-600 mb-1 block">
                  Ingredientes — um por linha no formato: <span className="font-mono bg-gray-100 px-1 rounded">350 g Macarrão</span>
                </label>
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  rows={10}
                  placeholder={`350 g Macarrão\n100 g Bacon\n100 g Calabresa\n120 g Frango\n120 g Pernil\n100 g Cebola\n50 g Pimentão\n200 g Tomate\n30 g Alho\n200 g Queijo Parmesão\n200 ml Shoyu`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>

              {/* Preview */}
              {parsedLines.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-gray-600 mb-2">{validLines.length} ingrediente(s) reconhecido(s):</p>
                  {parsedLines.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {l.ok
                        ? <Check size={12} className="text-green-500 shrink-0" />
                        : <AlertCircle size={12} className="text-red-400 shrink-0" />
                      }
                      <span className={l.ok ? 'text-gray-700' : 'text-red-400'}>
                        {l.ok ? `${l.quantity} ${l.unit} — ${l.name}` : `Linha inválida: "${l.name}"`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowImport(false)} className="flex-1 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
                  Cancelar
                </button>
                <button
                  onClick={saveImport}
                  disabled={!importName || validLines.length === 0 || importSaved}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-blue-700"
                >
                  {importSaved
                    ? <><Check size={15} /> Salvo!</>
                    : <><FileText size={15} /> Cadastrar Receita</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formulário de edição */}
      {editProduct && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Settings size={18} className="text-[#F5C542]" />
              {products.find(p => p.id === editProduct.id) ? 'Editar Produto' : 'Novo Produto'}
            </h2>
            <button onClick={() => setEditProduct(null)}><X size={20} className="text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4">
            <div className="lg:col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Nome do produto</label>
              <input
                value={editProduct.name}
                onChange={e => setEditProduct({ ...editProduct, name: e.target.value })}
                placeholder="Ex: X-Burguer, Macarrão Bolonhesa..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C542]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Categoria</label>
              <select
                value={editProduct.category}
                onChange={e => setEditProduct({ ...editProduct, category: e.target.value as Product['category'] })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C542]"
              >
                {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Preço de venda (R$)</label>
              <input
                type="number" min={0} step="0.01"
                value={editProduct.salePrice || ''}
                onChange={e => setEditProduct({ ...editProduct, salePrice: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#F5C542]"
              />
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Ingredientes (para precificação)</label>
              <button onClick={addIngredientLine} className="text-[#F5C542] text-xs flex items-center gap-1 hover:text-orange-700">
                <Plus size={12} /> Adicionar ingrediente
              </button>
            </div>
            {editProduct.ingredients.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nenhum ingrediente. Adicione para usar a precificação automática.</p>
            ) : (
              <div className="space-y-2">
                {editProduct.ingredients.map((ing, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-2 items-center">
                    <div className="col-span-2">
                      <select
                        value={ing.ingredientId}
                        onChange={e => updateIngLine(idx, 'ingredientId', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-[#F5C542]"
                      >
                        <option value="">Selecione...</option>
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <input
                        type="number" placeholder="Qtd" min={0} step="0.001"
                        value={ing.quantity || ''}
                        onChange={e => updateIngLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-[#F5C542]"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400 flex-1">{ing.unit}</span>
                      <button onClick={() => removeIngLine(idx)}><X size={14} className="text-red-400" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox" checked={editProduct.active}
                onChange={e => setEditProduct({ ...editProduct, active: e.target.checked })}
                className="accent-[#F5C542]"
              />
              Produto ativo no cardápio
            </label>
            <div className="flex gap-2">
              <button onClick={() => setEditProduct(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
              <button
                onClick={() => saveAndClose(editProduct)}
                disabled={!editProduct.name}
                className="bg-[#F5C542] text-[#0F0F0F] px-5 py-2 rounded-lg hover:bg-[#d4a72c] text-sm font-medium disabled:opacity-40"
              >
                Salvar Produto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de produtos */}
      {products.length === 0 ? (
        <div className="text-center py-20">
          <Settings size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Nenhum produto cadastrado.</p>
          <p className="text-gray-400 text-sm">Clique em "Importar Receita" ou "Novo Produto" para começar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map(cat => {
            const prods = grouped[cat.value]
            if (!prods || prods.length === 0) return null
            return (
              <div key={cat.value} className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="px-5 py-3 border-b border-gray-50">
                  <h3 className="font-semibold text-[#c49a20] text-sm uppercase tracking-wide">{cat.label}</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {prods.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${p.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                        <div>
                          <p className="font-medium text-gray-700 text-sm">{p.name}</p>
                          <p className="text-xs text-gray-400">
                            {p.ingredients.length} ingrediente(s) · {p.active ? 'Ativo' : 'Inativo'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-semibold text-[#c49a20]">{fmt(p.salePrice)}</span>
                        <button onClick={() => setEditProduct({ ...p })} className="text-blue-400 hover:text-blue-600">
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Excluir "${p.name}"?`)) { deleteProduct(p.id); reload() } }}
                          className="text-red-300 hover:text-red-500"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
