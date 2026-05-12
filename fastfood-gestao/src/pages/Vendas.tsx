import { useState, useEffect } from 'react'
import { getProducts, getSales, saveSale, deleteSale, id } from '../store/storage'
import type { Sale, SaleItem } from '../types'
import { Plus, Trash2, ShoppingCart, X, Check } from 'lucide-react'

const paymentOptions = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Débito' },
  { value: 'cartao_credito', label: 'Crédito' },
]

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5)
}

export default function Vendas() {
  const [sales, setSales] = useState<Sale[]>([])
  const [products] = useState(getProducts)
  const [filterDate, setFilterDate] = useState(today())
  const [filterProduct, setFilterProduct] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [cart, setCart] = useState<SaleItem[]>([])
  const [payment, setPayment] = useState<Sale['paymentMethod']>('dinheiro')
  const [notes, setNotes] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => { setSales(getSales()) }, [showForm])

  const byDate = filterDate ? sales.filter(s => s.date === filterDate) : sales
  const filtered = filterProduct
    ? byDate.filter(s => s.items.some(i => i.productId === filterProduct))
    : byDate

  const productQtySold = filterProduct
    ? filtered.reduce((sum, s) => sum + s.items.filter(i => i.productId === filterProduct).reduce((q, i) => q + i.quantity, 0), 0)
    : 0
  const totalDay = filtered.reduce((s, x) => s + x.total, 0)

  function addToCart(productId: string) {
    const p = products.find(x => x.id === productId)
    if (!p) return
    setCart(prev => {
      const idx = prev.findIndex(x => x.productId === productId)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1, total: (next[idx].quantity + 1) * next[idx].unitPrice }
        return next
      }
      return [...prev, { productId: p.id, productName: p.name, quantity: 1, unitPrice: p.salePrice, total: p.salePrice }]
    })
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(x => x.productId !== productId))
  }

  function changeQty(productId: string, delta: number) {
    setCart(prev => prev.flatMap(x => {
      if (x.productId !== productId) return [x]
      const q = x.quantity + delta
      if (q <= 0) return []
      return [{ ...x, quantity: q, total: q * x.unitPrice }]
    }))
  }

  function submitSale() {
    if (cart.length === 0) return
    const sale: Sale = {
      id: id(),
      date: today(),
      time: nowTime(),
      items: cart,
      total: cart.reduce((s, x) => s + x.total, 0),
      paymentMethod: payment,
      notes,
    }
    saveSale(sale)
    setSales(getSales())
    setCart([])
    setNotes('')
    setPayment('dinheiro')
    setSuccess(true)
    setTimeout(() => setSuccess(false), 2000)
  }

  function removeSale(sid: string) {
    deleteSale(sid)
    setSales(getSales())
  }

  const paymentLabel: Record<string, string> = {
    dinheiro: 'Dinheiro', pix: 'PIX', cartao_debito: 'Débito', cartao_credito: 'Crédito'
  }

  const categoryLabel: Record<string, string> = {
    macarrao: 'Macarrão', hamburguer: 'Hambúrguer', cachorro_quente: 'Cachorro Quente',
    bebida: 'Bebida', outro: 'Outro'
  }

  const grouped = products.filter(p => p.active).reduce<Record<string, typeof products>>((acc, p) => {
    acc[p.category] = acc[p.category] || []
    acc[p.category].push(p)
    return acc
  }, {})

  const cartTotal = cart.reduce((s, x) => s + x.total, 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vendas</h1>
          <p className="text-gray-500 text-sm">Registro de pedidos</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 font-medium"
        >
          <Plus size={18} /> Novo Pedido
        </button>
      </div>

      {/* Painel de novo pedido */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2"><ShoppingCart size={18} /> Novo Pedido</h2>
            <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cardápio */}
            <div>
              <p className="text-sm font-medium text-gray-600 mb-3">Selecione os itens:</p>
              {Object.entries(grouped).map(([cat, prods]) => (
                <div key={cat} className="mb-4">
                  <p className="text-xs font-semibold text-orange-600 uppercase mb-2">{categoryLabel[cat]}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {prods.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p.id)}
                        className="text-left border border-gray-200 rounded-lg p-3 hover:border-orange-400 hover:bg-orange-50 transition-colors"
                      >
                        <p className="text-sm font-medium text-gray-700">{p.name}</p>
                        <p className="text-xs text-orange-600 font-semibold">{fmt(p.salePrice)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(grouped).length === 0 && (
                <p className="text-gray-400 text-sm">Nenhum produto cadastrado. Vá em Cadastros.</p>
              )}
            </div>

            {/* Carrinho */}
            <div>
              <p className="text-sm font-medium text-gray-600 mb-3">Carrinho:</p>
              {cart.length === 0 ? (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
                  Clique nos itens para adicionar
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {cart.map(item => (
                    <div key={item.productId} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <span className="text-sm font-medium text-gray-700 flex-1">{item.productName}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => changeQty(item.productId, -1)} className="w-6 h-6 rounded bg-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-300">−</button>
                        <span className="text-sm font-semibold w-5 text-center">{item.quantity}</span>
                        <button onClick={() => changeQty(item.productId, 1)} className="w-6 h-6 rounded bg-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-300">+</button>
                      </div>
                      <span className="text-sm font-semibold text-green-600 w-20 text-right">{fmt(item.total)}</span>
                      <button onClick={() => removeFromCart(item.productId)} className="ml-2 text-red-400 hover:text-red-600"><X size={14} /></button>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-gray-800 pt-2 border-t">
                    <span>Total</span>
                    <span className="text-orange-600 text-lg">{fmt(cartTotal)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setPayment(opt.value as Sale['paymentMethod'])}
                        className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                          payment === opt.value
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'border-gray-200 text-gray-600 hover:border-orange-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  placeholder="Observações do pedido..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none"
                />
                <button
                  onClick={submitSale}
                  disabled={cart.length === 0}
                  className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors ${
                    cart.length === 0
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : success
                      ? 'bg-green-500 text-white'
                      : 'bg-orange-500 text-white hover:bg-orange-600'
                  }`}
                >
                  {success ? <><Check size={18} /> Pedido Registrado!</> : <><ShoppingCart size={18} /> Registrar Pedido · {fmt(cartTotal)}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtro e lista */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400"
          />
          <select
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400 flex-1 min-w-0"
          >
            <option value="">Todos os produtos</option>
            {[...new Map(sales.flatMap(s => s.items).map(i => [i.productId, i])).values()].map(i => (
              <option key={i.productId} value={i.productId}>{i.productName}</option>
            ))}
          </select>
          {(filterProduct || filterDate) && (
            <button onClick={() => { setFilterProduct(''); setFilterDate(today()) }} className="text-xs text-gray-400 hover:text-orange-500 underline whitespace-nowrap">
              Limpar
            </button>
          )}
        </div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">
            {filtered.length} pedido{filtered.length !== 1 ? 's' : ''}
            {filterProduct && ` · ${productQtySold} unid. vendidas`}
          </span>
          <div className="font-semibold text-green-600">{fmt(totalDay)}</div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">Nenhum pedido nesta data.</p>
        ) : (
          <div className="space-y-2">
            {[...filtered].reverse().map(sale => (
              <div key={sale.id} className="flex items-start justify-between py-3 border-b border-gray-50 last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">
                    {sale.items.map(i => `${i.quantity}x ${i.productName}`).join(' · ')}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {sale.time} · {paymentLabel[sale.paymentMethod]}
                    {sale.notes && ` · ${sale.notes}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className="font-semibold text-green-600">{fmt(sale.total)}</span>
                  <button onClick={() => removeSale(sale.id)} className="text-red-300 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
