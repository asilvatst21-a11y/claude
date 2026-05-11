import { useState, useEffect } from 'react'
import { getProducts, saveProduct, deleteProduct, getIngredients, id } from '../store/storage'
import type { Product, ProductIngredient } from '../types'
import { Plus, Trash2, X, Settings, Edit2 } from 'lucide-react'

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

export default function Cadastros() {
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState(getIngredients())
  const [editProduct, setEditProduct] = useState<Product | null>(null)

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
        <button
          onClick={() => setEditProduct(emptyProduct())}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-medium text-sm"
        >
          <Plus size={16} /> Novo Produto
        </button>
      </div>

      {/* Formulário de produto */}
      {editProduct && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Settings size={18} className="text-orange-500" />
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
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Categoria</label>
              <select
                value={editProduct.category}
                onChange={e => setEditProduct({ ...editProduct, category: e.target.value as Product['category'] })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
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
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>

          {/* Ingredientes do produto */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Ingredientes (para precificação)</label>
              <button onClick={addIngredientLine} className="text-orange-500 text-xs flex items-center gap-1 hover:text-orange-700">
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
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-orange-400"
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
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-orange-400"
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
                className="accent-orange-500"
              />
              Produto ativo no cardápio
            </label>
            <div className="flex gap-2">
              <button onClick={() => setEditProduct(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
              <button
                onClick={() => saveAndClose(editProduct)}
                disabled={!editProduct.name || editProduct.salePrice <= 0}
                className="bg-orange-500 text-white px-5 py-2 rounded-lg hover:bg-orange-600 text-sm font-medium disabled:opacity-40"
              >
                Salvar Produto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de produtos por categoria */}
      {products.length === 0 ? (
        <div className="text-center py-20">
          <Settings size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Nenhum produto cadastrado.</p>
          <p className="text-gray-400 text-sm">Adicione seus lanches para começar a registrar vendas.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map(cat => {
            const prods = grouped[cat.value]
            if (!prods || prods.length === 0) return null
            return (
              <div key={cat.value} className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="px-5 py-3 border-b border-gray-50">
                  <h3 className="font-semibold text-orange-600 text-sm uppercase tracking-wide">{cat.label}</h3>
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
                        <span className="font-semibold text-orange-600">{fmt(p.salePrice)}</span>
                        <button
                          onClick={() => setEditProduct({ ...p })}
                          className="text-blue-400 hover:text-blue-600"
                        >
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
