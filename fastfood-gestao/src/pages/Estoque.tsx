import { useState, useEffect } from 'react'
import {
  getPurchases, savePurchase, deletePurchase,
  getIngredients, saveIngredient,
  getSuppliers, saveSupplier,
  id
} from '../store/storage'
import type { Purchase, Ingredient, Supplier, PurchaseItem } from '../types'
import { Plus, Trash2, X, Package, ShoppingBag, Clock, ChevronDown, ChevronUp, ScanLine } from 'lucide-react'
import NotaFiscalImport from '../components/NotaFiscalImport'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function durationLabel(purchase: Purchase): string {
  if (!purchase.depletedDate) return 'Em uso'
  const start = new Date(purchase.date)
  const end = new Date(purchase.depletedDate)
  const days = Math.round((end.getTime() - start.getTime()) / 86400000)
  return `${days} dia${days !== 1 ? 's' : ''}`
}

const emptyIngredient = (): Ingredient => ({ id: id(), name: '', unit: 'kg', currentStock: 0, minStock: 0 })
const emptySupplier = (): Supplier => ({ id: id(), name: '', contact: '', notes: '' })

export default function Estoque() {
  const [tab, setTab] = useState<'compras' | 'ingredientes' | 'fornecedores' | 'comparativo'>('compras')
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null)
  const [showNotaImport, setShowNotaImport] = useState(false)

  // Formulário compra
  const [showPurchaseForm, setShowPurchaseForm] = useState(false)
  const [purchaseSupplier, setPurchaseSupplier] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [purchaseNotes, setPurchaseNotes] = useState('')
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([])
  const [purchaseDuration, setPurchaseDuration] = useState('')

  // Formulário ingrediente
  const [editIngredient, setEditIngredient] = useState<Ingredient | null>(null)

  // Formulário fornecedor
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)

  function reload() {
    setPurchases(getPurchases())
    setIngredients(getIngredients())
    setSuppliers(getSuppliers())
  }

  useEffect(() => { reload() }, [])

  function addPurchaseItem() {
    setPurchaseItems(prev => [...prev, { ingredientId: '', quantity: 0, unit: 'kg', unitPrice: 0, totalPrice: 0 }])
  }

  function updatePurchaseItem(idx: number, field: keyof PurchaseItem, value: string | number) {
    setPurchaseItems(prev => {
      const next = [...prev]
      const item = { ...next[idx], [field]: value }
      if (field === 'quantity' || field === 'unitPrice') {
        item.totalPrice = Number(item.quantity) * Number(item.unitPrice)
      }
      if (field === 'ingredientId') {
        const ing = ingredients.find(i => i.id === value)
        if (ing) item.unit = ing.unit
      }
      next[idx] = item
      return next
    })
  }

  function removePurchaseItem(idx: number) {
    setPurchaseItems(prev => prev.filter((_, i) => i !== idx))
  }

  function submitPurchase() {
    if (!purchaseSupplier || purchaseItems.length === 0) return
    const supplier = suppliers.find(s => s.id === purchaseSupplier)
    const purchase: Purchase = {
      id: id(),
      supplierId: purchaseSupplier,
      supplierName: supplier?.name || purchaseSupplier,
      date: purchaseDate,
      items: purchaseItems,
      totalValue: purchaseItems.reduce((s, i) => s + i.totalPrice, 0),
      notes: purchaseNotes,
      estimatedDurationDays: purchaseDuration ? Number(purchaseDuration) : undefined,
    }
    savePurchase(purchase)

    // Atualiza estoque dos ingredientes
    purchaseItems.forEach(item => {
      const ing = ingredients.find(i => i.id === item.ingredientId)
      if (ing) {
        saveIngredient({ ...ing, currentStock: ing.currentStock + item.quantity })
      }
    })

    reload()
    setShowPurchaseForm(false)
    setPurchaseItems([])
    setPurchaseSupplier('')
    setPurchaseNotes('')
    setPurchaseDuration('')
  }

  function markDepleted(purchaseId: string) {
    const p = purchases.find(x => x.id === purchaseId)
    if (!p) return
    savePurchase({ ...p, depletedDate: new Date().toISOString().slice(0, 10) })
    reload()
  }

  const totalMonth = purchases
    .filter(p => p.date.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, p) => s + p.totalValue, 0)

  // Comparativo: preço médio por ingrediente por fornecedor
  const comparativo: Record<string, { supplierName: string; avgPrice: number; unit: string }[]> = {}
  purchases.forEach(p => {
    p.items.forEach(item => {
      const ing = ingredients.find(i => i.id === item.ingredientId)
      if (!ing) return
      if (!comparativo[ing.name]) comparativo[ing.name] = []
      const existing = comparativo[ing.name].find(x => x.supplierName === p.supplierName)
      if (existing) {
        existing.avgPrice = (existing.avgPrice + item.unitPrice) / 2
      } else {
        comparativo[ing.name].push({ supplierName: p.supplierName, avgPrice: item.unitPrice, unit: ing.unit })
      }
    })
  })

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Estoque</h1>
        <p className="text-gray-500 text-sm">Compras mês atual: <strong className="text-red-500">{fmt(totalMonth)}</strong></p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {(['compras', 'ingredientes', 'fornecedores', 'comparativo'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'comparativo' ? 'Comparativo Preços' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* COMPRAS */}
      {tab === 'compras' && (
        <div>
          <div className="flex justify-end gap-2 mb-4">
            <button
              onClick={() => setShowNotaImport(true)}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium text-sm"
            >
              <ScanLine size={16} /> Importar Nota Fiscal
            </button>
            <button
              onClick={() => setShowPurchaseForm(true)}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-medium text-sm"
            >
              <Plus size={16} /> Registrar Compra
            </button>
          </div>

          {showPurchaseForm && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-semibold text-gray-700 flex items-center gap-2"><ShoppingBag size={18} /> Nova Compra</h2>
                <button onClick={() => setShowPurchaseForm(false)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="lg:col-span-2">
                  <label className="text-xs text-gray-600 mb-1 block">Fornecedor</label>
                  <select
                    value={purchaseSupplier}
                    onChange={e => setPurchaseSupplier(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  >
                    <option value="">Selecione...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Data</label>
                  <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Duração estimada (dias)</label>
                  <input type="number" placeholder="Ex: 7" value={purchaseDuration} onChange={e => setPurchaseDuration(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
                </div>
              </div>

              <p className="text-xs font-medium text-gray-600 mb-2">Itens da compra:</p>
              {purchaseItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 mb-2 items-end">
                  <div className="col-span-2">
                    <select
                      value={item.ingredientId}
                      onChange={e => updatePurchaseItem(idx, 'ingredientId', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-orange-400"
                    >
                      <option value="">Ingrediente...</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                  </div>
                  <div>
                    <input type="number" placeholder="Qtd" value={item.quantity || ''} min={0} step="0.01"
                      onChange={e => updatePurchaseItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-orange-400" />
                  </div>
                  <div>
                    <input type="number" placeholder="R$ unit" value={item.unitPrice || ''} min={0} step="0.01"
                      onChange={e => updatePurchaseItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-orange-400" />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-semibold text-green-600 flex-1">{fmt(item.totalPrice)}</span>
                    <button onClick={() => removePurchaseItem(idx)}><X size={14} className="text-red-400" /></button>
                  </div>
                </div>
              ))}
              <button onClick={addPurchaseItem} className="text-orange-500 text-sm flex items-center gap-1 mb-4 hover:text-orange-700">
                <Plus size={14} /> Adicionar item
              </button>

              <textarea placeholder="Observações..." value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)} rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-orange-400 resize-none" />

              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700">
                  Total: <span className="text-orange-600">{fmt(purchaseItems.reduce((s, i) => s + i.totalPrice, 0))}</span>
                </span>
                <button onClick={submitPurchase}
                  className="bg-orange-500 text-white px-5 py-2 rounded-lg hover:bg-orange-600 font-medium text-sm">
                  Salvar Compra
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {[...purchases].sort((a, b) => b.date.localeCompare(a.date)).map(p => (
              <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => setExpandedPurchase(expandedPurchase === p.id ? null : p.id)}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium text-gray-700">{p.supplierName}</p>
                      <p className="text-xs text-gray-400">{p.date} · {p.items.length} item(s)</p>
                    </div>
                    {p.estimatedDurationDays && (
                      <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                        <Clock size={12} /> {durationLabel(p)} {p.depletedDate ? 'durou' : `/ ${p.estimatedDurationDays}d est.`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-red-500">{fmt(p.totalValue)}</span>
                    {!p.depletedDate && (
                      <button
                        onClick={e => { e.stopPropagation(); markDepleted(p.id) }}
                        className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded hover:bg-yellow-200"
                      >
                        Esgotou
                      </button>
                    )}
                    <button onClick={e => { e.stopPropagation(); deletePurchase(p.id); reload() }}>
                      <Trash2 size={14} className="text-red-300 hover:text-red-500" />
                    </button>
                    {expandedPurchase === p.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </div>
                {expandedPurchase === p.id && (
                  <div className="border-t border-gray-50 px-4 pb-4 pt-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 text-left">
                          <th className="pb-1">Ingrediente</th>
                          <th className="pb-1">Qtd</th>
                          <th className="pb-1">Unit.</th>
                          <th className="pb-1 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.items.map((item, i) => {
                          const ing = ingredients.find(x => x.id === item.ingredientId)
                          return (
                            <tr key={i} className="border-t border-gray-50">
                              <td className="py-1">{ing?.name || item.ingredientId}</td>
                              <td>{item.quantity} {item.unit}</td>
                              <td>{fmt(item.unitPrice)}</td>
                              <td className="text-right font-medium">{fmt(item.totalPrice)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {p.notes && <p className="text-xs text-gray-400 mt-2">{p.notes}</p>}
                  </div>
                )}
              </div>
            ))}
            {purchases.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-12">Nenhuma compra registrada.</p>
            )}
          </div>
        </div>
      )}

      {/* INGREDIENTES */}
      {tab === 'ingredientes' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setEditIngredient(emptyIngredient())}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-medium text-sm">
              <Plus size={16} /> Novo Ingrediente
            </button>
          </div>
          {editIngredient && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
              <div className="flex justify-between mb-3">
                <h2 className="font-semibold text-gray-700">Ingrediente</h2>
                <button onClick={() => setEditIngredient(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-600 mb-1 block">Nome</label>
                  <input value={editIngredient.name} onChange={e => setEditIngredient({ ...editIngredient, name: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" placeholder="Ex: Macarrão" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Unidade</label>
                  <select value={editIngredient.unit} onChange={e => setEditIngredient({ ...editIngredient, unit: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400">
                    {['kg', 'g', 'L', 'ml', 'un', 'pct', 'cx'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Estoque atual</label>
                  <input type="number" value={editIngredient.currentStock} min={0} step="0.01"
                    onChange={e => setEditIngredient({ ...editIngredient, currentStock: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Estoque mínimo</label>
                  <input type="number" value={editIngredient.minStock} min={0} step="0.01"
                    onChange={e => setEditIngredient({ ...editIngredient, minStock: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
                </div>
              </div>
              <button onClick={() => { saveIngredient(editIngredient); reload(); setEditIngredient(null) }}
                className="bg-orange-500 text-white px-5 py-2 rounded-lg hover:bg-orange-600 text-sm font-medium">
                Salvar
              </button>
            </div>
          )}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            {ingredients.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-12">Nenhum ingrediente cadastrado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr className="text-xs text-gray-500 text-left">
                    <th className="p-4">Ingrediente</th>
                    <th className="p-4">Estoque</th>
                    <th className="p-4">Mínimo</th>
                    <th className="p-4">Status</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map(i => (
                    <tr key={i.id} className="border-b border-gray-50 last:border-0">
                      <td className="p-4 font-medium text-gray-700">{i.name}</td>
                      <td className="p-4">{i.currentStock} {i.unit}</td>
                      <td className="p-4 text-gray-400">{i.minStock} {i.unit}</td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          i.currentStock <= i.minStock ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                        }`}>
                          {i.currentStock <= i.minStock ? 'Crítico' : 'OK'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button onClick={() => setEditIngredient(i)} className="text-blue-400 hover:text-blue-600 text-xs">Editar</button>
                          <button onClick={() => { if(confirm('Excluir?')) { import('../store/storage').then(m => { m.deleteIngredient(i.id); reload() }) } }} className="text-red-400 hover:text-red-600 text-xs">Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* FORNECEDORES */}
      {tab === 'fornecedores' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setEditSupplier(emptySupplier())}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-medium text-sm">
              <Plus size={16} /> Novo Fornecedor
            </button>
          </div>
          {editSupplier && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
              <div className="flex justify-between mb-3">
                <h2 className="font-semibold text-gray-700">Fornecedor</h2>
                <button onClick={() => setEditSupplier(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Nome</label>
                  <input value={editSupplier.name} onChange={e => setEditSupplier({ ...editSupplier, name: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" placeholder="Nome do fornecedor" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Contato</label>
                  <input value={editSupplier.contact} onChange={e => setEditSupplier({ ...editSupplier, contact: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" placeholder="WhatsApp, telefone..." />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Observações</label>
                  <input value={editSupplier.notes} onChange={e => setEditSupplier({ ...editSupplier, notes: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" placeholder="Ex: entrega às terças" />
                </div>
              </div>
              <button onClick={() => { saveSupplier(editSupplier); reload(); setEditSupplier(null) }}
                className="bg-orange-500 text-white px-5 py-2 rounded-lg hover:bg-orange-600 text-sm font-medium">
                Salvar
              </button>
            </div>
          )}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            {suppliers.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-12">Nenhum fornecedor cadastrado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr className="text-xs text-gray-500 text-left">
                    <th className="p-4">Nome</th>
                    <th className="p-4">Contato</th>
                    <th className="p-4">Notas</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map(s => (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0">
                      <td className="p-4 font-medium text-gray-700">{s.name}</td>
                      <td className="p-4 text-gray-500">{s.contact}</td>
                      <td className="p-4 text-gray-400 text-xs">{s.notes}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button onClick={() => setEditSupplier(s)} className="text-blue-400 hover:text-blue-600 text-xs">Editar</button>
                          <button onClick={() => { if(confirm('Excluir?')) { import('../store/storage').then(m => { m.deleteSupplier(s.id); reload() }) } }} className="text-red-400 hover:text-red-600 text-xs">Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* COMPARATIVO */}
      {tab === 'comparativo' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Comparativo de preço médio por ingrediente e fornecedor, baseado nas compras registradas.</p>
          {Object.keys(comparativo).length === 0 ? (
            <p className="text-gray-400 text-center py-12">Registre compras para ver o comparativo.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(comparativo).map(([ingName, entries]) => {
                const best = entries.reduce((a, b) => a.avgPrice < b.avgPrice ? a : b)
                return (
                  <div key={ingName} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                    <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <Package size={16} className="text-orange-500" /> {ingName}
                    </h3>
                    <div className="space-y-2">
                      {[...entries].sort((a, b) => a.avgPrice - b.avgPrice).map(entry => (
                        <div key={entry.supplierName} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{entry.supplierName}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700">
                              {fmt(entry.avgPrice)}/{entry.unit}
                            </span>
                            {entry.supplierName === best.supplierName && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Melhor preço</span>
                            )}
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
      )}
      {showNotaImport && (
        <NotaFiscalImport
          onClose={() => setShowNotaImport(false)}
          onImported={() => { reload(); setShowNotaImport(false) }}
        />
      )}
    </div>
  )
}
