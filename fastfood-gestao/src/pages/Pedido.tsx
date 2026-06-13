import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { fetchPublicMenu, fetchBusinessIdBySlug, submitOnlineOrder, DEFAULT_DELIVERY_CONFIG } from '../store/delivery'
import { buildPixPayload } from '../store/pix'
import type { DeliveryConfig, OnlineOrder, Product, SaleItem } from '../types'
import {
  ShoppingBag, Plus, Minus, X, MapPin, User, Loader2, Check,
  ChevronRight, QrCode as QrIcon, Copy, Bike, Clock, Store, ArrowLeft,
} from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  macarrao: 'Macarrão', hamburguer: 'Hambúrguer', cachorro_quente: 'Cachorro Quente',
  bebida: 'Bebida', outro: 'Outros',
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
}

type Stage = 'loading' | 'closed' | 'menu' | 'success'

export default function Pedido() {
  const { bid = '' } = useParams()
  const [stage, setStage] = useState<Stage>('loading')
  const [config, setConfig] = useState<DeliveryConfig>(DEFAULT_DELIVERY_CONFIG)
  const [products, setProducts] = useState<Product[]>([])
  const [resolvedBid, setResolvedBid] = useState('')

  const [cart, setCart] = useState<SaleItem[]>([])
  const [activeCat, setActiveCat] = useState('all')
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<OnlineOrder | null>(null)

  // Checkout form
  const [name, setName] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [complement, setComplement] = useState('')
  const [reference, setReference] = useState('')
  const [payment, setPayment] = useState<OnlineOrder['payment']>('pix')
  const [trocoPara, setTrocoPara] = useState('')
  const [notes, setNotes] = useState('')

  const [pixQr, setPixQr] = useState('')

  useEffect(() => {
    if (!bid) { setStage('closed'); return }

    async function load() {
      // Tenta resolver slug → business_id; se falhar, assume que bid já é um UUID
      const isUuid = /^[0-9a-f-]{36}$/i.test(bid)
      let businessId = bid
      if (!isUuid) {
        const found = await fetchBusinessIdBySlug(bid)
        if (found) businessId = found
      }
      setResolvedBid(businessId)

      const { config, products } = await fetchPublicMenu(businessId)
      if (!config || !config.enabled) { setStage('closed'); if (config) setConfig(config); return }
      setConfig(config)
      setProducts(products)
      setStage('menu')
    }

    load()
  }, [bid])

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(products.map(p => p.category)))],
    [products]
  )
  const visible = activeCat === 'all' ? products : products.filter(p => p.category === activeCat)

  const subtotal = cart.reduce((s, x) => s + x.total, 0)
  const zone = config.zones.find(z => z.neighborhood === neighborhood)
  const deliveryFee = zone?.fee ?? 0
  const total = subtotal + deliveryFee
  const cartCount = cart.reduce((s, x) => s + x.quantity, 0)
  const belowMin = config.minOrder > 0 && subtotal < config.minOrder

  function addToCart(p: Product) {
    setCart(prev => {
      const idx = prev.findIndex(x => x.productId === p.id)
      if (idx >= 0) {
        const next = [...prev]
        const q = next[idx].quantity + 1
        next[idx] = { ...next[idx], quantity: q, total: q * next[idx].unitPrice }
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
  function qtyOf(productId: string) {
    return cart.find(x => x.productId === productId)?.quantity ?? 0
  }

  async function generatePixQr(amount: number) {
    if (!config.pixKey) return
    try {
      const payload = buildPixPayload(config.pixKey, amount, config.pixName || config.storeName, config.pixCity)
      const url = await QRCode.toDataURL(payload, { width: 240, margin: 2 })
      setPixQr(url)
    } catch { /* ignore */ }
  }

  async function handleSubmit() {
    setError('')
    if (!name.trim()) { setError('Informe seu nome'); return }
    if (phoneInput.replace(/\D/g, '').length < 10) { setError('Informe um WhatsApp válido'); return }
    if (!street.trim() || !number.trim()) { setError('Informe o endereço completo'); return }
    if (config.zones.length > 0 && !neighborhood) { setError('Selecione o bairro de entrega'); return }
    if (belowMin) { setError(`Pedido mínimo de ${fmt(config.minOrder)}`); return }

    const order: OnlineOrder = {
      id: genId(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      customerName: name.trim(),
      customerPhone: phoneInput.replace(/\D/g, ''),
      address: {
        street: street.trim(), number: number.trim(), neighborhood,
        complement: complement.trim() || undefined,
        reference: reference.trim() || undefined,
      },
      items: cart,
      subtotal, deliveryFee, total,
      payment,
      trocoPara: payment === 'dinheiro' && trocoPara ? parseFloat(trocoPara) : undefined,
      notes: notes.trim() || undefined,
    }

    setSending(true)
    const ok = await submitOnlineOrder(resolvedBid, order)
    setSending(false)
    if (!ok) { setError('Não foi possível enviar. Tente novamente.'); return }

    if (payment === 'pix') generatePixQr(total)
    setConfirmed(order)
    setStage('success')
  }

  // ---------- LOADING ----------
  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#F5C542]" />
      </div>
    )
  }

  // ---------- CLOSED ----------
  if (stage === 'closed') {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-[#1a1a1a] flex items-center justify-center mx-auto">
            <Store size={28} className="text-[#F5C542]" />
          </div>
          <h1 className="text-xl font-bold text-white">{config.storeName || 'Loja'}</h1>
          <p className="text-gray-400 text-sm">Os pedidos online estão fechados no momento. Volte mais tarde! 🙏</p>
        </div>
      </div>
    )
  }

  // ---------- SUCCESS ----------
  if (stage === 'success' && confirmed) {
    const waLink = config.whatsapp
      ? `https://wa.me/55${config.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(
          `Olá! Acabei de fazer um pedido no site (${fmt(confirmed.total)}) em nome de ${confirmed.customerName}.`
        )}`
      : ''
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-white">
        <div className="max-w-md mx-auto p-5 space-y-5">
          <div className="text-center pt-8 space-y-3">
            <div className="w-20 h-20 rounded-full bg-[#F5C542] flex items-center justify-center mx-auto animate-[pulse_1.5s_ease-in-out_infinite]">
              <Check size={40} className="text-[#0F0F0F]" strokeWidth={3} />
            </div>
            <h1 className="text-2xl font-black">Pedido enviado! 🎉</h1>
            <p className="text-gray-400 text-sm">
              {config.storeName} recebeu seu pedido e já está preparando.
              Acompanhe pelo WhatsApp.
            </p>
          </div>

          {payment === 'pix' && pixQr && (
            <div className="bg-[#1a1a1a] border border-[#F5C542]/30 rounded-2xl p-5 text-center space-y-3">
              <p className="font-bold text-[#F5C542] flex items-center justify-center gap-2"><QrIcon size={16} /> Pague com PIX</p>
              <img src={pixQr} alt="QR Code PIX" className="mx-auto rounded-xl bg-white p-2" width={200} height={200} />
              <p className="text-2xl font-black">{fmt(confirmed.total)}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(buildPixPayload(config.pixKey, confirmed.total, config.pixName || config.storeName, config.pixCity)) }}
                className="text-xs text-[#F5C542] flex items-center justify-center gap-1 mx-auto hover:underline"
              >
                <Copy size={12} /> Copiar código PIX
              </button>
            </div>
          )}

          <div className="bg-[#1a1a1a] rounded-2xl p-5 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resumo</p>
            {confirmed.items.map(i => (
              <div key={i.productId} className="flex justify-between text-sm">
                <span className="text-gray-300">{i.quantity}× {i.productName}</span>
                <span className="text-gray-400">{fmt(i.total)}</span>
              </div>
            ))}
            <div className="border-t border-white/10 pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-sm text-gray-400"><span>Subtotal</span><span>{fmt(confirmed.subtotal)}</span></div>
              <div className="flex justify-between text-sm text-gray-400"><span>Entrega</span><span>{fmt(confirmed.deliveryFee)}</span></div>
              <div className="flex justify-between font-bold"><span>Total</span><span className="text-[#F5C542]">{fmt(confirmed.total)}</span></div>
            </div>
          </div>

          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="block w-full bg-[#25D366] text-white text-center py-3.5 rounded-xl font-bold">
              Falar no WhatsApp
            </a>
          )}
          <button onClick={() => window.location.reload()}
            className="block w-full text-center text-gray-500 text-sm py-2">
            Fazer outro pedido
          </button>
        </div>
      </div>
    )
  }

  // ---------- MENU ----------
  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <header className="bg-[#0F0F0F] text-white px-5 pt-7 pb-6">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#F5C542] flex items-center justify-center shrink-0">
              <Store size={22} className="text-[#0F0F0F]" />
            </div>
            <div>
              <h1 className="text-xl font-black leading-tight">{config.storeName || 'Cardápio'}</h1>
              <p className="text-xs text-gray-400 flex items-center gap-1"><Bike size={11} /> Peça pelo delivery</p>
            </div>
          </div>
          {config.notice && (
            <div className="mt-3 bg-[#F5C542]/10 border border-[#F5C542]/30 rounded-lg px-3 py-2 text-xs text-[#F5C542] flex items-center gap-2">
              <Clock size={13} /> {config.notice}
            </div>
          )}
        </div>
      </header>

      {/* Categorias */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-md mx-auto flex gap-2 px-4 py-3 overflow-x-auto">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${activeCat === cat ? 'bg-[#F5C542] text-[#0F0F0F]' : 'bg-gray-100 text-gray-500'}`}>
              {cat === 'all' ? 'Todos' : CATEGORY_LABELS[cat] || cat}
            </button>
          ))}
        </div>
      </div>

      {/* Produtos */}
      <div className="max-w-md mx-auto p-4 space-y-3">
        {visible.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">Nenhum item disponível.</p>
        ) : visible.map(p => {
          const q = qtyOf(p.id)
          return (
            <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 leading-tight">{p.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{CATEGORY_LABELS[p.category] || p.category}</p>
                <p className="text-lg font-black text-[#0F0F0F] mt-1">{fmt(p.salePrice)}</p>
              </div>
              {q === 0 ? (
                <button onClick={() => addToCart(p)}
                  className="shrink-0 w-10 h-10 rounded-xl bg-[#F5C542] text-[#0F0F0F] flex items-center justify-center active:scale-90 transition-transform shadow">
                  <Plus size={20} strokeWidth={2.5} />
                </button>
              ) : (
                <div className="shrink-0 flex items-center gap-2 bg-[#0F0F0F] rounded-xl px-1.5 py-1">
                  <button onClick={() => changeQty(p.id, -1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white"><Minus size={15} /></button>
                  <span className="text-white font-bold w-5 text-center text-sm">{q}</span>
                  <button onClick={() => changeQty(p.id, 1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#F5C542]"><Plus size={15} /></button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Barra flutuante do carrinho */}
      {cartCount > 0 && !showCart && !showCheckout && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-30">
          <div className="max-w-md mx-auto">
            <button onClick={() => setShowCart(true)}
              className="w-full bg-[#F5C542] text-[#0F0F0F] rounded-2xl py-3.5 px-5 flex items-center justify-between shadow-xl active:scale-[0.98] transition-transform">
              <span className="flex items-center gap-2 font-bold">
                <span className="bg-[#0F0F0F] text-[#F5C542] w-6 h-6 rounded-full flex items-center justify-center text-xs">{cartCount}</span>
                Ver sacola
              </span>
              <span className="font-black">{fmt(subtotal)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Sacola (bottom sheet) */}
      {showCart && (
        <CartSheet
          cart={cart} subtotal={subtotal} minOrder={config.minOrder} belowMin={belowMin}
          onClose={() => setShowCart(false)}
          onChangeQty={changeQty}
          onCheckout={() => { setShowCart(false); setShowCheckout(true) }}
        />
      )}

      {/* Checkout (bottom sheet) */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl max-h-[92vh] flex flex-col">
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 shrink-0">
              <button onClick={() => { setShowCheckout(false); setShowCart(true) }}><ArrowLeft size={20} className="text-gray-500" /></button>
              <h2 className="font-bold text-gray-800">Finalizar pedido</h2>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {/* Dados */}
              <Section icon={<User size={14} />} title="Seus dados">
                <Input value={name} onChange={setName} placeholder="Nome completo" />
                <Input value={phoneInput} onChange={v => setPhoneInput(formatPhone(v))} placeholder="WhatsApp (com DDD)" inputMode="numeric" />
              </Section>

              {/* Endereço */}
              <Section icon={<MapPin size={14} />} title="Endereço de entrega">
                <div className="flex gap-2">
                  <div className="flex-1"><Input value={street} onChange={setStreet} placeholder="Rua / Avenida" /></div>
                  <div className="w-24"><Input value={number} onChange={setNumber} placeholder="Nº" inputMode="numeric" /></div>
                </div>
                {config.zones.length > 0 ? (
                  <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C542] bg-white">
                    <option value="">Selecione o bairro...</option>
                    {config.zones.map(z => (
                      <option key={z.id} value={z.neighborhood}>{z.neighborhood} — {fmt(z.fee)}</option>
                    ))}
                  </select>
                ) : (
                  <Input value={neighborhood} onChange={setNeighborhood} placeholder="Bairro" />
                )}
                <Input value={complement} onChange={setComplement} placeholder="Complemento (apto, bloco...)" />
                <Input value={reference} onChange={setReference} placeholder="Ponto de referência" />
              </Section>

              {/* Pagamento */}
              <Section icon={<QrIcon size={14} />} title="Forma de pagamento">
                <div className="grid grid-cols-3 gap-2">
                  {([['pix', 'PIX'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão']] as const).map(([val, label]) => (
                    <button key={val} type="button" onClick={() => setPayment(val)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${payment === val ? 'border-[#F5C542] bg-yellow-50 text-[#0F0F0F]' : 'border-gray-200 text-gray-400'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {payment === 'dinheiro' && (
                  <Input value={trocoPara} onChange={setTrocoPara} placeholder="Troco para quanto? (opcional)" inputMode="numeric" />
                )}
                {payment === 'cartao' && (
                  <p className="text-xs text-gray-400">💳 Maquininha levada pelo entregador.</p>
                )}
              </Section>

              {/* Obs */}
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Observações (ex: sem cebola, troco...)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C542] resize-none" />

              {/* Totais */}
              <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                <div className="flex justify-between text-sm text-gray-500"><span>Taxa de entrega</span><span>{neighborhood ? fmt(deliveryFee) : '—'}</span></div>
                <div className="flex justify-between font-bold text-gray-800 pt-1 border-t border-gray-200"><span>Total</span><span className="text-[#0F0F0F]">{fmt(total)}</span></div>
              </div>

              {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center">{error}</p>}
            </div>

            <div className="p-4 border-t border-gray-100 shrink-0">
              <button onClick={handleSubmit} disabled={sending}
                className="w-full bg-[#F5C542] text-[#0F0F0F] py-3.5 rounded-xl font-black flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform">
                {sending ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <>Enviar pedido · {fmt(total)}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CartSheet({ cart, subtotal, minOrder, belowMin, onClose, onChangeQty, onCheckout }: {
  cart: SaleItem[]; subtotal: number; minOrder: number; belowMin: boolean
  onClose: () => void; onChangeQty: (id: string, d: number) => void; onCheckout: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
      <div className="bg-white w-full max-w-md rounded-t-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-800 flex items-center gap-2"><ShoppingBag size={18} /> Sua sacola</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {cart.map(item => (
            <div key={item.productId} className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-1.5 py-1">
                <button onClick={() => onChangeQty(item.productId, -1)} className="w-7 h-7 flex items-center justify-center text-gray-500"><Minus size={14} /></button>
                <span className="font-bold w-5 text-center text-sm">{item.quantity}</span>
                <button onClick={() => onChangeQty(item.productId, 1)} className="w-7 h-7 flex items-center justify-center text-[#c49a20]"><Plus size={14} /></button>
              </div>
              <span className="flex-1 text-sm text-gray-700">{item.productName}</span>
              <span className="text-sm font-semibold text-gray-800">{fmt(item.total)}</span>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-100 shrink-0 space-y-3">
          {belowMin && (
            <p className="text-xs text-orange-500 text-center">Pedido mínimo de {fmt(minOrder)} — faltam {fmt(minOrder - subtotal)}</p>
          )}
          <div className="flex justify-between font-bold text-gray-800">
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          <button onClick={onCheckout} disabled={belowMin}
            className="w-full bg-[#F5C542] text-[#0F0F0F] py-3.5 rounded-xl font-black flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform">
            Continuar <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <span className="text-[#F5C542]">{icon}</span> {title}
      </p>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, inputMode }: {
  value: string; onChange: (v: string) => void; placeholder: string; inputMode?: 'numeric'
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <input
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C542]"
    />
  )
}
