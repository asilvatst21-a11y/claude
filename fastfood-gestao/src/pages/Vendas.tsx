import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { getProducts, getSales, saveSale, deleteSale, getCustomers, saveCustomer, getCashbackConfig, getPixConfig, savePixConfig, getIngredients, id } from '../store/storage'
import type { PixConfig } from '../store/storage'
import type { Sale, SaleItem, Customer } from '../types'
import { Trash2, ShoppingCart, X, Check, ClipboardList, Minus, Plus, User, Gift, ChevronDown, QrCode, Settings2, Bike, UtensilsCrossed } from 'lucide-react'
import { supabase, getBusinessId } from '../store/supabase'

// PIX BRCode (EMV Merchant Presented Mode) com CRC16-CCITT
function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// PIX spec (BCB) exige ASCII puro nos campos nome e cidade — remove acentos
function toAscii(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').trim()
}

function buildPixPayload(pixKey: string, amount: number, merchantName: string, city: string): string {
  const f = (id: string, v: string) => `${id}${String(v.length).padStart(2, '0')}${v}`
  const name = (toAscii(merchantName) || 'Estabelecimento').slice(0, 25)
  const cty  = (toAscii(city) || 'Brasil').slice(0, 15)
  const key  = pixKey.trim()
  const mai = f('00', 'BR.GOV.BCB.PIX') + f('01', key)
  let p = f('00', '01') + f('26', mai) + f('52', '0000') + f('53', '986')
  if (amount > 0) p += f('54', amount.toFixed(2))
  p += f('58', 'BR') + f('59', name) + f('60', cty)
  p += f('62', f('05', '***')) + '6304'
  return p + crc16(p)
}

const PAYMENT_OPTIONS = [
  { value: 'pix',            label: 'PIX',    color: 'bg-green-500' },
  { value: 'dinheiro',       label: 'Dinheiro', color: 'bg-yellow-500' },
  { value: 'cartao_debito',  label: 'Débito', color: 'bg-blue-500' },
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

function CustomerPicker({
  customers, selected, onSelect,
}: { customers: Customer[]; selected: Customer | null; onSelect: (c: Customer | null) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase()) ||
    c.phone.includes(q.replace(/\D/g, ''))
  ).slice(0, 8)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 border rounded-xl px-3 py-2.5 text-sm transition-colors ${selected ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
      >
        <User size={15} className={selected ? 'text-orange-500' : 'text-gray-400'} />
        <span className={`flex-1 text-left truncate ${selected ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
          {selected ? selected.name : 'Cliente (opcional)'}
        </span>
        {selected
          ? <button type="button" onClick={e => { e.stopPropagation(); onSelect(null) }}><X size={14} className="text-gray-400" /></button>
          : <ChevronDown size={14} className="text-gray-400" />
        }
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full text-sm px-2 py-1.5 focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? <p className="text-xs text-gray-400 text-center py-3">Nenhum cliente encontrado</p>
              : filtered.map(c => (
                <button
                  key={c.id} type="button"
                  onClick={() => { onSelect(c); setOpen(false); setQ('') }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-50 text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <span className="text-orange-600 font-bold text-xs">{c.name.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                    {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                  </div>
                  {c.cashbackBalance > 0 && (
                    <span className="text-xs text-green-600 font-semibold flex items-center gap-0.5 shrink-0">
                      <Gift size={11} />{fmt(c.cashbackBalance)}
                    </span>
                  )}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

// Chave única por item do carrinho (mesmo produto pode ter specs diferentes)
function cartItemKey(productId: string, removed?: Array<{ id: string; name: string }>) {
  if (!removed || removed.length === 0) return productId
  return `${productId}:${removed.map(r => r.id).sort().join(',')}`
}

export default function Vendas() {
  const [view, setView] = useState<'pdv' | 'historico'>('pdv')
  const [products] = useState(getProducts)
  const [ingredients] = useState(getIngredients)
  const [customers, setCustomers] = useState<Customer[]>(getCustomers)
  const [sales, setSales] = useState<Sale[]>(() => getSales())
  const [cart, setCart] = useState<SaleItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [payment, setPayment] = useState<Sale['paymentMethod']>('pix')
  const [notes, setNotes] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [useCashback, setUseCashback] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [success, setSuccess] = useState(false)
  const [filterMode, setFilterMode] = useState<'day' | 'range'>('day')
  const [filterDate, setFilterDate] = useState(today())
  const [filterDateFrom, setFilterDateFrom] = useState(today())
  const [filterDateTo, setFilterDateTo] = useState(today())
  const [filterProduct, setFilterProduct] = useState('')

  // Troco
  const [receivedAmount, setReceivedAmount] = useState('')
  // PIX QR
  const [pixConfig, setPixConfig] = useState<PixConfig | null>(() => getPixConfig())
  const [showPixQR, setShowPixQR] = useState(false)
  const [pixQrUrl, setPixQrUrl] = useState('')
  const [editPixConfig, setEditPixConfig] = useState(false)
  const [pixKeyInput, setPixKeyInput] = useState('')
  const [pixNameInput, setPixNameInput] = useState('')
  const [pixCityInput, setPixCityInput] = useState('')

  const cashbackConfig = getCashbackConfig()

  // Delivery
  const [orderType, setOrderType] = useState<'balcao' | 'delivery'>('balcao')
  const [deliveryFee, setDeliveryFee] = useState('')

  // Modal de personalização de ingredientes
  const [pendingProduct, setPendingProduct] = useState<(typeof products)[0] | null>(null)
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set())

  useEffect(() => { setSales(getSales()); setCustomers(getCustomers()) }, [view])

  const activeProducts = products.filter(p => p.active)
  const categories = ['all', ...Array.from(new Set(activeProducts.map(p => p.category)))]
  const visibleProducts = activeCategory === 'all'
    ? activeProducts
    : activeProducts.filter(p => p.category === activeCategory)

  const cartSubtotal = cart.reduce((s, x) => s + x.total, 0)
  const cashbackDiscount = useCashback && selectedCustomer ? Math.min(selectedCustomer.cashbackBalance, cartSubtotal) : 0
  const cartTotal = Math.max(0, cartSubtotal - cashbackDiscount)
  const deliveryFeeAmount = orderType === 'delivery' ? (parseFloat(deliveryFee) || 0) : 0
  const saleTotal = cartTotal + deliveryFeeAmount
  const cashbackEarned = cashbackConfig.enabled && !useCashback ? cartSubtotal * (cashbackConfig.percentage / 100) : 0
  const cartCount = cart.reduce((s, x) => s + x.quantity, 0)

  const received = parseFloat(receivedAmount) || 0
  const troco = payment === 'dinheiro' && received > 0 ? Math.max(0, received - saleTotal) : 0
  const trocoBadge = payment === 'dinheiro' && received > 0 && received < saleTotal

  async function openPixQR() {
    if (!pixConfig) return
    const payload = buildPixPayload(pixConfig.key, saleTotal, pixConfig.merchantName, pixConfig.city)
    const url = await QRCode.toDataURL(payload, { width: 260, margin: 2, color: { dark: '#111', light: '#fff' } })
    setPixQrUrl(url)
    setShowPixQR(true)
  }

  function savePixCfg() {
    const cfg: PixConfig = { key: pixKeyInput.trim(), merchantName: pixNameInput.trim() || 'Estabelecimento', city: pixCityInput.trim() || 'Cidade' }
    savePixConfig(cfg)
    setPixConfig(cfg)
    setEditPixConfig(false)
  }

  function handleProductTap(productId: string) {
    const p = products.find(x => x.id === productId)
    if (!p) return
    // Produto sem ingredientes cadastrados → adiciona direto
    if (p.ingredients.length === 0) {
      addToCartDirect(p, [])
      return
    }
    setPendingProduct(p)
    setPendingRemovals(new Set())
  }

  function addToCartDirect(p: (typeof products)[0], removed: Array<{ id: string; name: string }>) {
    const key = cartItemKey(p.id, removed)
    setCart(prev => {
      const idx = prev.findIndex(x => cartItemKey(x.productId, x.removedIngredients) === key)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1, total: (next[idx].quantity + 1) * next[idx].unitPrice }
        return next
      }
      return [...prev, {
        productId: p.id, productName: p.name, quantity: 1, unitPrice: p.salePrice, total: p.salePrice,
        removedIngredients: removed.length > 0 ? removed : undefined,
      }]
    })
  }

  function confirmAddToCart() {
    if (!pendingProduct) return
    const removed = pendingProduct.ingredients
      .filter(pi => pendingRemovals.has(pi.ingredientId))
      .map(pi => {
        const ing = ingredients.find(i => i.id === pi.ingredientId)
        return { id: pi.ingredientId, name: ing?.name ?? pi.ingredientId }
      })
    addToCartDirect(pendingProduct, removed)
    setPendingProduct(null)
  }

  function changeQty(key: string, delta: number) {
    setCart(prev => prev.flatMap(x => {
      if (cartItemKey(x.productId, x.removedIngredients) !== key) return [x]
      const q = x.quantity + delta
      if (q <= 0) return []
      return [{ ...x, quantity: q, total: q * x.unitPrice }]
    }))
  }

  function submitSale() {
    if (cart.length === 0) return
    const sale: Sale = {
      id: id(), date: today(), time: nowTime(),
      items: cart, total: saleTotal, paymentMethod: payment, notes,
      orderType,
      deliveryFee: deliveryFeeAmount || undefined,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      cashbackUsed: cashbackDiscount || undefined,
      cashbackEarned: cashbackEarned || undefined,
    }
    saveSale(sale)

    if (selectedCustomer) {
      const updated: Customer = {
        ...selectedCustomer,
        totalSpent: selectedCustomer.totalSpent + saleTotal,
        cashbackBalance: Math.max(0, selectedCustomer.cashbackBalance - cashbackDiscount) + cashbackEarned,
      }
      saveCustomer(updated)
      setCustomers(getCustomers())
    }

    setSales(getSales())
    setCart([])
    setNotes('')
    setPayment('pix')
    setOrderType('balcao')
    setDeliveryFee('')
    setSelectedCustomer(null)
    setUseCashback(false)
    setReceivedAmount('')
    setSuccess(true)
    setShowCheckout(false)
    setTimeout(() => setSuccess(false), 2500)
  }

  // Histórico
  const byDate = filterMode === 'day'
    ? (filterDate ? sales.filter(s => s.date === filterDate) : sales)
    : sales.filter(s => s.date >= filterDateFrom && s.date <= filterDateTo)
  const filtered = filterProduct
    ? byDate.filter(s => s.items.some(i => i.productId === filterProduct))
    : byDate
  const totalDay = filtered.reduce((s, x) => s + x.total, 0)
  const productQtySold = filterProduct
    ? filtered.reduce((sum, s) => sum + s.items.filter(i => i.productId === filterProduct).reduce((q, i) => q + i.quantity, 0), 0)
    : 0

  function clearDateFilter() {
    setFilterDate(today())
    setFilterDateFrom(today())
    setFilterDateTo(today())
    setFilterProduct('')
  }
  const dateFilterActive = filterMode === 'day'
    ? filterDate !== today()
    : filterDateFrom !== today() || filterDateTo !== today()

  function removeSale(sid: string) {
    deleteSale(sid)
    setSales(getSales())
  }

  const [clearingAll, setClearingAll] = useState(false)
  const [clearedAll, setClearedAll] = useState(false)

  async function clearAllSales() {
    if (!confirm(`Apagar TODAS as ${sales.length} vendas do histórico? Esta ação não pode ser desfeita.`)) return
    setClearingAll(true)
    const allSales = getSales()
    if (supabase && allSales.length > 0) {
      // Bulk upsert marcando todas como deleted=true (contorna restrição de DELETE no RLS)
      const records = allSales.map(s => ({
        id: `sales_${s.id}`,
        business_id: getBusinessId(),
        entity_type: 'sales',
        entity_id: s.id,
        data: {} as Record<string, unknown>,
        deleted: true,
        synced_at: new Date().toISOString(),
      }))
      await supabase.from('ff_sync').upsert(records)
    }
    localStorage.removeItem('ff_sales')
    setSales([])
    setClearingAll(false)
    setClearedAll(true)
    setTimeout(() => setClearedAll(false), 3000)
  }

  // Bloco reutilizável do checkout (desktop + mobile)
  function CheckoutPanel({ mobile = false }: { mobile?: boolean }) {
    return (
      <div className={mobile ? 'p-5 space-y-4' : 'p-4 border-t border-gray-100 space-y-3'}>

        {/* Canal de venda */}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setOrderType('balcao'); setDeliveryFee('') }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${orderType === 'balcao' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
            <UtensilsCrossed size={15} /> Balcão
          </button>
          <button type="button" onClick={() => setOrderType('delivery')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${orderType === 'delivery' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
            <Bike size={15} /> Delivery
          </button>
        </div>

        {orderType === 'delivery' && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
            <Bike size={14} className="text-blue-500 shrink-0" />
            <span className="text-xs text-blue-700 font-medium shrink-0">Taxa de entrega</span>
            <input type="number" min={0} step="0.50" value={deliveryFee}
              onChange={e => setDeliveryFee(e.target.value)}
              placeholder="R$ 0,00"
              className="flex-1 text-right text-sm font-semibold text-blue-700 bg-transparent focus:outline-none placeholder:text-blue-300 min-w-0" />
          </div>
        )}

        {/* Cliente */}
        <CustomerPicker customers={customers} selected={selectedCustomer} onSelect={c => { setSelectedCustomer(c); setUseCashback(false) }} />

        {/* Cashback disponível */}
        {selectedCustomer && selectedCustomer.cashbackBalance > 0 && cashbackConfig.enabled && (
          <button
            type="button"
            onClick={() => setUseCashback(v => !v)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${useCashback ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:border-green-300'}`}
          >
            <Gift size={15} className={useCashback ? 'text-green-600' : 'text-gray-400'} />
            <span className="flex-1 text-left">
              {useCashback ? `Desconto de ${fmt(cashbackDiscount)} aplicado` : `Usar cashback: ${fmt(selectedCustomer.cashbackBalance)}`}
            </span>
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${useCashback ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
              {useCashback && <Check size={10} className="text-white" />}
            </div>
          </button>
        )}

        {/* Total */}
        <div className="space-y-1">
          {cashbackDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Desconto cashback</span>
              <span>−{fmt(cashbackDiscount)}</span>
            </div>
          )}
          {deliveryFeeAmount > 0 && (
            <div className="flex justify-between text-sm text-blue-600">
              <span className="flex items-center gap-1"><Bike size={12} /> Taxa de entrega</span>
              <span>+{fmt(deliveryFeeAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-800">
            <span>Total</span>
            <span className="text-orange-500 text-lg">{fmt(saleTotal)}</span>
          </div>
          {cashbackEarned > 0 && selectedCustomer && (
            <p className="text-xs text-green-600 text-right flex items-center justify-end gap-1">
              <Gift size={11} />+{fmt(cashbackEarned)} de cashback para {selectedCustomer.name.split(' ')[0]}
            </p>
          )}
        </div>

        {/* Pagamento */}
        <div className="grid grid-cols-4 gap-2">
          {PAYMENT_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => { setPayment(opt.value as Sale['paymentMethod']); setReceivedAmount('') }}
              className={`py-2 rounded-xl text-xs font-bold text-white ${opt.color} ${payment === opt.value ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-60 hover:opacity-80'}`}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Calculadora de troco */}
        {payment === 'dinheiro' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-yellow-700">Calculadora de Troco</p>
            <div className="flex gap-2">
              <input
                type="number" min={0} step="0.50"
                value={receivedAmount}
                onChange={e => setReceivedAmount(e.target.value)}
                placeholder="Valor recebido (R$)"
                className="flex-1 border border-yellow-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500 bg-white"
              />
            </div>
            {received > 0 && (
              <div className={`flex justify-between items-center rounded-lg px-3 py-2 ${trocoBadge ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                <span className="text-sm font-medium">{trocoBadge ? 'Valor insuficiente' : 'Troco'}</span>
                <span className="text-lg font-bold">{trocoBadge ? `−${fmt(saleTotal - received)}` : fmt(troco)}</span>
              </div>
            )}
          </div>
        )}

        {/* PIX QR Code */}
        {payment === 'pix' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            {!editPixConfig && pixConfig ? (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-green-700">Chave PIX configurada</p>
                  <p className="text-xs text-green-600 truncate max-w-[160px]">{pixConfig.key}</p>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => { setPixKeyInput(pixConfig.key); setPixNameInput(pixConfig.merchantName); setPixCityInput(pixConfig.city); setEditPixConfig(true) }}
                    className="p-1.5 text-green-500 hover:text-green-700"><Settings2 size={14} /></button>
                  <button type="button" onClick={openPixQR}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                    <QrCode size={13} /> Gerar QR Code
                  </button>
                </div>
              </div>
            ) : !editPixConfig ? (
              <div>
                <p className="text-xs text-green-700 font-medium mb-2">Configure a chave PIX para gerar QR Code</p>
                <button type="button" onClick={() => setEditPixConfig(true)}
                  className="text-xs text-green-600 underline hover:text-green-800">Configurar agora</button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-green-700">Configurar chave PIX</p>
                <input value={pixKeyInput} onChange={e => setPixKeyInput(e.target.value)}
                  placeholder="Chave PIX (email, CPF, telefone ou aleatória)"
                  className="w-full border border-green-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none bg-white" />
                <input value={pixNameInput} onChange={e => setPixNameInput(e.target.value)}
                  placeholder="Nome do estabelecimento"
                  className="w-full border border-green-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none bg-white" />
                <input value={pixCityInput} onChange={e => setPixCityInput(e.target.value)}
                  placeholder="Cidade"
                  className="w-full border border-green-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none bg-white" />
                <div className="flex gap-2">
                  <button type="button" onClick={savePixCfg} disabled={!pixKeyInput.trim()}
                    className="flex-1 bg-green-600 disabled:opacity-40 text-white rounded-lg py-1.5 text-xs font-bold">Salvar</button>
                  <button type="button" onClick={() => setEditPixConfig(false)}
                    className="text-xs text-gray-400 hover:text-gray-600 px-2">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        <textarea placeholder="Obs..." value={notes} onChange={e => setNotes(e.target.value)} rows={mobile ? 2 : 1}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-orange-400 resize-none" />

        <button type="button" onClick={submitSale} disabled={payment === 'dinheiro' && received > 0 && trocoBadge}
          className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
          <Check size={16} /> Confirmar · {fmt(saleTotal)}
        </button>
        <button type="button" onClick={() => { setCart([]); setUseCashback(false); setSelectedCustomer(null) }}
          className="w-full text-xs text-gray-400 hover:text-red-400">Limpar carrinho</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Abas */}
      <div className="flex border-b border-gray-200 bg-white px-4 pt-4 gap-1 shrink-0">
        <button onClick={() => setView('pdv')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${view === 'pdv' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
          <ShoppingCart size={15} /> PDV
        </button>
        <button onClick={() => setView('historico')}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${view === 'historico' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
          <ClipboardList size={15} /> Histórico
        </button>
      </div>

      {/* PDV */}
      {view === 'pdv' && (
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Cardápio */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex gap-2 px-4 py-3 overflow-x-auto shrink-0 bg-white border-b border-gray-100">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeCategory === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {cat === 'all' ? 'Todos' : CATEGORY_LABELS[cat] || cat}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <ShoppingCart size={40} className="mb-3 opacity-30" />
                  <p className="text-sm">Nenhum produto cadastrado.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleProducts.map(p => {
                    const cartQty = cart.filter(x => x.productId === p.id).reduce((s, x) => s + x.quantity, 0)
                    return (
                      <button key={p.id} onClick={() => handleProductTap(p.id)}
                        className={`relative flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all active:scale-95 ${cartQty > 0 ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50'}`}>
                        {cartQty > 0 && (
                          <span className="absolute top-2 right-2 w-6 h-6 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                            {cartQty}
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

          {/* Carrinho desktop */}
          <div className="hidden md:flex flex-col w-80 border-l border-gray-200 bg-white overflow-y-auto">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                <ShoppingCart size={16} /> Pedido atual
              </h2>
            </div>

            {cart.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8 px-4">Toque nos produtos para adicionar</p>
            ) : (
              <>
                <div className="flex-1 p-4 space-y-2">
                  {cart.map(item => {
                    const key = cartItemKey(item.productId, item.removedIngredients)
                    return (
                      <div key={key} className="flex items-start gap-2">
                        <div className="flex items-center gap-1 mt-0.5">
                          <button onClick={() => changeQty(key, -1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Minus size={12} /></button>
                          <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                          <button onClick={() => changeQty(key, 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Plus size={12} /></button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-700 truncate block">{item.productName}</span>
                          {item.removedIngredients && item.removedIngredients.length > 0 && (
                            <span className="text-xs text-red-400">sem {item.removedIngredients.map(r => r.name).join(', sem ')}</span>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-orange-600 mt-0.5">{fmt(item.total)}</span>
                      </div>
                    )
                  })}
                </div>
                {CheckoutPanel({})}
              </>
            )}
          </div>

          {/* Barra inferior mobile */}
          {cart.length > 0 && (
            <div className="md:hidden shrink-0 bg-white border-t border-gray-200 p-3">
              <button onClick={() => setShowCheckout(true)}
                className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold flex items-center justify-between px-5">
                <span className="bg-white text-orange-500 rounded-full w-6 h-6 text-xs font-bold flex items-center justify-center">{cartCount}</span>
                <span>Ver pedido{selectedCustomer ? ` · ${selectedCustomer.name.split(' ')[0]}` : ''}</span>
                <span>{fmt(saleTotal)}</span>
              </button>
            </div>
          )}

          {/* Modal checkout mobile */}
          {showCheckout && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:hidden">
              <div className="bg-white w-full rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
                  <h2 className="font-bold text-gray-800">Confirmar Pedido</h2>
                  <button onClick={() => setShowCheckout(false)}><X size={20} className="text-gray-400" /></button>
                </div>
                <div className="overflow-y-auto flex-1 px-5 pt-3 space-y-2">
                  {cart.map(item => {
                    const key = cartItemKey(item.productId, item.removedIngredients)
                    return (
                      <div key={key} className="flex items-start gap-3">
                        <div className="flex items-center gap-1 mt-0.5">
                          <button onClick={() => changeQty(key, -1)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Minus size={13} /></button>
                          <span className="w-6 text-center font-bold">{item.quantity}</span>
                          <button onClick={() => changeQty(key, 1)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Plus size={13} /></button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-700 block">{item.productName}</span>
                          {item.removedIngredients && item.removedIngredients.length > 0 && (
                            <span className="text-xs text-red-400">sem {item.removedIngredients.map(r => r.name).join(', sem ')}</span>
                          )}
                        </div>
                        <span className="font-semibold text-orange-600 mt-0.5">{fmt(item.total)}</span>
                      </div>
                    )
                  })}
                </div>
                {CheckoutPanel({ mobile: true })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal PIX QR Code */}
      {showPixQR && pixQrUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <QrCode size={18} className="text-green-600" />
                <h2 className="font-bold text-gray-800">QR Code PIX</h2>
              </div>
              <button onClick={() => setShowPixQR(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="p-5 text-center">
              <img src={pixQrUrl} alt="QR Code PIX" className="mx-auto rounded-xl" width={220} height={220} />
              <div className="mt-4 bg-green-50 rounded-xl px-4 py-3">
                <p className="text-2xl font-bold text-green-600">{fmt(saleTotal)}</p>
                <p className="text-xs text-green-500 mt-0.5">Escaneie com qualquer banco</p>
              </div>
              {pixConfig && (
                <p className="text-xs text-gray-400 mt-3 truncate">Chave: {pixConfig.key}</p>
              )}
              <button onClick={() => { setShowPixQR(false); submitSale() }}
                className="mt-4 w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                <Check size={16} /> Confirmar pagamento recebido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: retirar ingredientes */}
      {pendingProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-800">{pendingProduct.name}</h2>
                <p className="text-sm text-orange-500 font-semibold">{fmt(pendingProduct.salePrice)}</p>
              </div>
              <button onClick={() => setPendingProduct(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Retirar ingredientes</p>
              <div className="space-y-2">
                {pendingProduct.ingredients.map(pi => {
                  const ing = ingredients.find(i => i.id === pi.ingredientId)
                  if (!ing) return null
                  const checked = pendingRemovals.has(pi.ingredientId)
                  return (
                    <button
                      key={pi.ingredientId}
                      type="button"
                      onClick={() => setPendingRemovals(prev => {
                        const next = new Set(prev)
                        next.has(pi.ingredientId) ? next.delete(pi.ingredientId) : next.add(pi.ingredientId)
                        return next
                      })}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-sm transition-colors ${checked ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
                    >
                      <span>{ing.name}</span>
                      <span className="text-xs font-medium">{checked ? '✕ retirar' : '✓ incluir'}</span>
                    </button>
                  )
                })}
              </div>
              <button
                onClick={confirmAddToCart}
                className="mt-4 w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
              >
                <Plus size={15} /> Adicionar ao pedido
                {pendingRemovals.size > 0 && <span className="text-orange-200 font-normal text-xs">· sem {pendingRemovals.size} ingrediente{pendingRemovals.size > 1 ? 's' : ''}</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback sucesso */}
      {success && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg font-semibold flex items-center gap-2">
          <Check size={18} /> Pedido registrado!
        </div>
      )}

      {/* Histórico */}
      {view === 'historico' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-2 mb-3">
              {/* Modo: Dia / Período */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm shrink-0">
                <button
                  onClick={() => setFilterMode('day')}
                  className={`px-3 py-1.5 font-medium transition-colors ${filterMode === 'day' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >Dia</button>
                <button
                  onClick={() => setFilterMode('range')}
                  className={`px-3 py-1.5 font-medium transition-colors ${filterMode === 'range' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                >Período</button>
              </div>

              {filterMode === 'day' ? (
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400" />
              ) : (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400" />
                  <span className="text-gray-400 text-xs shrink-0">até</span>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-orange-400" />
                </div>
              )}

              <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400 flex-1 min-w-0">
                <option value="">Todos os produtos</option>
                {[...new Map(sales.flatMap(s => s.items).map(i => [i.productId, i])).values()].map(i => (
                  <option key={i.productId} value={i.productId}>{i.productName}</option>
                ))}
              </select>
              {(filterProduct || dateFilterActive) && (
                <button onClick={clearDateFilter} className="text-xs text-gray-400 hover:text-orange-500 underline">Limpar</button>
              )}
            </div>
            <div className="flex justify-between items-center text-sm mb-3">
              <span className="text-gray-500">{filtered.length} pedido{filtered.length !== 1 ? 's' : ''}{filterProduct && ` · ${productQtySold} unid.`}</span>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-green-600">{fmt(totalDay)}</span>
                {sales.length > 0 && (
                  <button
                    onClick={clearAllSales}
                    disabled={clearingAll || clearedAll}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${clearedAll ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
                  >
                    {clearedAll ? <><Check size={11} /> Apagado!</> : clearingAll ? 'Apagando...' : <><Trash2 size={11} /> Apagar tudo</>}
                  </button>
                )}
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Nenhum pedido encontrado.</p>
            ) : (
              <div className="space-y-2">
                {[...filtered].reverse().map(sale => (
                  <div key={sale.id} className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {sale.orderType === 'delivery' && (
                          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0">
                            <Bike size={10} /> Delivery
                          </span>
                        )}
                        <p className="text-sm font-medium text-gray-700">
                          {sale.items.map(i => {
                            const sem = i.removedIngredients?.length ? ` (sem ${i.removedIngredients.map(r => r.name).join(', ')})` : ''
                            return `${i.quantity}x ${i.productName}${sem}`
                          }).join(' · ')}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {sale.time} · {PAYMENT_LABEL[sale.paymentMethod]}
                        {sale.deliveryFee ? ` · entrega ${fmt(sale.deliveryFee)}` : ''}
                        {sale.customerName && <span className="text-orange-500"> · {sale.customerName}</span>}
                        {sale.cashbackUsed ? ` · cashback −${fmt(sale.cashbackUsed)}` : ''}
                        {sale.notes && ` · ${sale.notes}`}
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
