import { useState, useEffect } from 'react'
import { getProducts, getSales, saveSale, deleteSale, id } from '../store/storage'
import type { Sale, SaleItem } from '../types'
import { Trash2, ShoppingCart, X, Check, ClipboardList, Minus, Plus } from 'lucide-react'

const PAYMENT_OPTIONS = [
  { value: 'pix', label: 'PIX', color: 'bg-green-500' },
  { value: 'dinheiro', label: 'Dinheiro', color: 'bg-yellow-500' },
  { value: 'cartao_debito', label: 'Débito', color: 'bg-blue-500' },
  { value: 'cartao_credito', label: 'Crédito', color: 'bg-purple-500' },
]

const CATEGORY_LABELS: Record<string, string> = {
  macarrao: 'Macarrão', hamburguer: 'Hambúrguer', cachorro_quente: 'Cachorro Quente',
  bebida: 'Bebida', outro: 'Outro',
}

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', cartao_debito: 'Débito', cartao_credito: 'Crédito',
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function today() { return new Date().toISOString().slice(0, 10) }
function nowTime() { return new Date().toTimeString().slice(0, 5) }

export default function Vendas() {
  const [view, setView] = useState<'pdv' | 'historico'>('pdv')
  const [products] = useState(getProducts)
  const [sales, setSales] = useState<Sale[]>(() => getSales())
  const [cart, setCart] = useState<SaleItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [payment, setPayment] = useState<Sale['paymentMethod']>('pix')
  const [notes, setNotes] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [success, setSuccess] = useState(false)
  const [filterDate, setFilterDate] = useState(today())
  const [filterProduct, setFilterProduct] = useState('')

  useEffect(() => { setSales(getSales()) }, [view])

  const activeProducts = products.filter(p => p.active)
  const categories = ['all', ...Array.from(new Set(activeProducts.map(p => p.category)))]
  const visibleProducts = activeCategory === 'all'
    ? activeProducts
    : activeProducts.filter(p => p.category === activeCategory)

  const cartTotal = cart.reduce((s, x) => s + x.total, 0)
  const cartCount = cart.reduce((s, x) => s + x.quantity, 0)

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
    saveSale({
      id: id(), date: today(), time: nowTime(),
      items: cart, total: cartTotal, paymentMethod: payment, notes,
    })
    setSales(getSales())
    setCart([])
    setNotes('')
    setPayment('pix')
    setSuccess(true)
    setShowCheckout(false)
    setTimeout(() => setSuccess(false), 2500)
  }

  // Histórico
  const byDate = filterDate ? sales.filter(s => s.date === filterDate) : sales
  const filtered = filterProduct
    ? byDate.filter(s => s.items.some(i => i.productId === filterProduct))
    : byDate
  const totalDay = filtered.reduce((s, x) => s + x.total, 0)
  const productQtySold = filterProduct
    ? filtered.reduce((sum, s) => sum + s.items.filter(i => i.productId === filterProduct).reduce((q, i) => q + i.quantity, 0), 0)
    : 0

  function removeSale(sid: string) {
    deleteSale(sid)
    setSales(getSales())
  }

  return (
    <div className="flex flex-col h-full">
      {/* Abas PDV / Histórico */}
      <div className="flex border-b border-gray-200 bg-white px-4 pt-4 gap-1 shrink-0">
        <button
          onClick={() => setView('pdv')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${view === 'pdv' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <ShoppingCart size={15} /> PDV
        </button>
        <button
          onClick={() => setView('historico')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${view === 'historico' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <ClipboardList size={15} /> Histórico
        </button>
      </div>

      {/* PDV */}
      {view === 'pdv' && (
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Cardápio */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Categorias */}
            <div className="flex gap-2 px-4 py-3 overflow-x-auto shrink-0 bg-white border-b border-gray-100">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeCategory === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {cat === 'all' ? 'Todos' : CATEGORY_LABELS[cat] || cat}
                </button>
              ))}
            </div>

            {/* Produtos */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <ShoppingCart size={40} className="mb-3 opacity-30" />
                  <p className="text-sm">Nenhum produto cadastrado.</p>
                  <p className="text-xs mt-1">Vá em Cadastros para adicionar produtos.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleProducts.map(p => {
                    const inCart = cart.find(x => x.productId === p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p.id)}
                        className={`relative flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all active:scale-95 ${inCart ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50'}`}
                      >
                        {inCart && (
                          <span className="absolute top-2 right-2 w-6 h-6 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                            {inCart.quantity}
                          </span>
                        )}
                        <span className="text-sm font-semibold text-gray-800 leading-tight mb-1 pr-6">{p.name}</span>
                        <span className="text-base font-bold text-orange-500">{fmt(p.salePrice)}</span>
                        <span className="text-xs text-gray-400 mt-0.5">{CATEGORY_LABELS[p.category]}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Carrinho — desktop lateral, mobile barra fixa */}
          <div className="hidden md:flex flex-col w-80 border-l border-gray-200 bg-white">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                <ShoppingCart size={16} /> Pedido atual
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Toque nos produtos para adicionar</p>
              ) : cart.map(item => (
                <div key={item.productId} className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeQty(item.productId, -1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Minus size={12} /></button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => changeQty(item.productId, 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Plus size={12} /></button>
                  </div>
                  <span className="flex-1 text-sm text-gray-700 truncate">{item.productName}</span>
                  <span className="text-sm font-semibold text-orange-600">{fmt(item.total)}</span>
                </div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="p-4 border-t border-gray-100 space-y-3">
                <div className="flex justify-between font-bold text-gray-800">
                  <span>Total</span>
                  <span className="text-orange-500 text-lg">{fmt(cartTotal)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPayment(opt.value as Sale['paymentMethod'])}
                      className={`py-2 rounded-lg text-xs font-semibold text-white transition-opacity ${opt.color} ${payment === opt.value ? 'opacity-100 ring-2 ring-offset-1 ring-gray-400' : 'opacity-60 hover:opacity-80'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <textarea placeholder="Obs..." value={notes} onChange={e => setNotes(e.target.value)} rows={1}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-orange-400 resize-none" />
                <button onClick={submitSale}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                  <Check size={16} /> Confirmar · {fmt(cartTotal)}
                </button>
                <button onClick={() => setCart([])} className="w-full text-xs text-gray-400 hover:text-red-400">Limpar carrinho</button>
              </div>
            )}
          </div>

          {/* Barra inferior mobile */}
          {cart.length > 0 && (
            <div className="md:hidden shrink-0 bg-white border-t border-gray-200 p-3">
              <button
                onClick={() => setShowCheckout(true)}
                className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold flex items-center justify-between px-5"
              >
                <span className="bg-white text-orange-500 rounded-full w-6 h-6 text-xs font-bold flex items-center justify-center">{cartCount}</span>
                <span>Ver pedido</span>
                <span>{fmt(cartTotal)}</span>
              </button>
            </div>
          )}

          {/* Modal checkout mobile */}
          {showCheckout && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:hidden">
              <div className="bg-white w-full rounded-t-2xl p-5 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-800">Confirmar Pedido</h2>
                  <button onClick={() => setShowCheckout(false)}><X size={20} className="text-gray-400" /></button>
                </div>
                <div className="overflow-y-auto flex-1 space-y-2 mb-4">
                  {cart.map(item => (
                    <div key={item.productId} className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => changeQty(item.productId, -1)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Minus size={13} /></button>
                        <span className="w-6 text-center font-bold">{item.quantity}</span>
                        <button onClick={() => changeQty(item.productId, 1)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Plus size={13} /></button>
                      </div>
                      <span className="flex-1 text-sm text-gray-700">{item.productName}</span>
                      <span className="font-semibold text-orange-600">{fmt(item.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-bold text-gray-800 mb-4 text-lg border-t pt-3">
                  <span>Total</span>
                  <span className="text-orange-500">{fmt(cartTotal)}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {PAYMENT_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setPayment(opt.value as Sale['paymentMethod'])}
                      className={`py-2.5 rounded-xl text-xs font-bold text-white ${opt.color} ${payment === opt.value ? 'ring-2 ring-offset-1 ring-gray-500' : 'opacity-60'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <textarea placeholder="Observações..." value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none mb-3" />
                <button onClick={submitSale}
                  className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold text-base">
                  ✓ Confirmar Pedido · {fmt(cartTotal)}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feedback de sucesso */}
      {success && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg font-semibold flex items-center gap-2">
          <Check size={18} /> Pedido registrado!
        </div>
      )}

      {/* Histórico */}
      {view === 'historico' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400" />
              <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400 flex-1 min-w-0">
                <option value="">Todos os produtos</option>
                {[...new Map(sales.flatMap(s => s.items).map(i => [i.productId, i])).values()].map(i => (
                  <option key={i.productId} value={i.productId}>{i.productName}</option>
                ))}
              </select>
              {(filterProduct || filterDate !== today()) && (
                <button onClick={() => { setFilterProduct(''); setFilterDate(today()) }} className="text-xs text-gray-400 hover:text-orange-500 underline">Limpar</button>
              )}
            </div>
            <div className="flex justify-between text-sm mb-3">
              <span className="text-gray-500">{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}{filterProduct && ` · ${productQtySold} unid.`}</span>
              <span className="font-semibold text-green-600">{fmt(totalDay)}</span>
            </div>
            {filtered.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Nenhum pedido encontrado.</p>
            ) : (
              <div className="space-y-2">
                {[...filtered].reverse().map(sale => (
                  <div key={sale.id} className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">
                        {sale.items.map(i => `${i.quantity}x ${i.productName}`).join(' · ')}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {sale.time} · {PAYMENT_LABEL[sale.paymentMethod]}{sale.notes && ` · ${sale.notes}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-3">
                      <span className="font-semibold text-green-600">{fmt(sale.total)}</span>
                      <button onClick={() => removeSale(sale.id)} className="text-red-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
