import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { fetchPublicMenu, fetchBusinessIdBySlug, submitOnlineOrder, DEFAULT_DELIVERY_CONFIG } from '../store/delivery'
import { buildPixPayload } from '../store/pix'
import type { DeliveryConfig, OnlineOrder, Product, SaleItem } from '../types'
import {
  ShoppingBag, Plus, Minus, X, MapPin, User, Loader2, Check,
  ChevronRight, QrCode as QrIcon, Copy, Bike, Clock, Store, ArrowLeft, Phone,
} from 'lucide-react'

// ── Category display ──────────────────────────────────────────────────────────
const CAT: Record<string, { label: string; emoji: string; color: string }> = {
  macarrao:        { label: 'Macarrão',        emoji: '🍝', color: '#F97316' },
  hamburguer:      { label: 'Hambúrguer',      emoji: '🍔', color: '#EF4444' },
  cachorro_quente: { label: 'Cachorro Quente', emoji: '🌭', color: '#EAB308' },
  bebida:          { label: 'Bebida',          emoji: '🥤', color: '#3B82F6' },
  outro:           { label: 'Outros',          emoji: '🍽️', color: '#8B5CF6' },
}

// ── Customer profile (localStorage) ──────────────────────────────────────────
interface Profile {
  name: string; phone: string
  street: string; houseNumber: string; neighborhood: string
  complement: string; reference: string
}
const PKEY = 'ff_cust_v1'

function lookupProfile(phone: string): Profile | null {
  try {
    const clean = phone.replace(/\D/g, '')
    if (!clean) return null
    const all = JSON.parse(localStorage.getItem(PKEY) || '{}')
    return all[clean] ?? null
  } catch { return null }
}
function saveProfile(p: Profile) {
  const clean = p.phone.replace(/\D/g, '')
  if (!clean) return
  try {
    const all = JSON.parse(localStorage.getItem(PKEY) || '{}')
    all[clean] = { ...p, phone: clean }
    localStorage.setItem(PKEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function fmtPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
}

type Stage = 'loading' | 'closed' | 'menu' | 'success'
type CheckStep = 'id' | 'address' | 'payment'
const STEPS: CheckStep[] = ['id', 'address', 'payment']

// ── Main component ────────────────────────────────────────────────────────────
export default function Pedido() {
  const { bid = '' } = useParams()
  const [stage, setStage] = useState<Stage>('loading')
  const [config, setConfig] = useState<DeliveryConfig>(DEFAULT_DELIVERY_CONFIG)
  const [products, setProducts] = useState<Product[]>([])
  const [resolvedBid, setResolvedBid] = useState('')

  // Cart
  const [cart, setCart] = useState<SaleItem[]>([])
  const [activeCat, setActiveCat] = useState('all')
  const [showCart, setShowCart] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkStep, setCheckStep] = useState<CheckStep>('id')

  // Customer fields
  const [phoneInput, setPhoneInput] = useState('')
  const [profileFound, setProfileFound] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [street, setStreet] = useState('')
  const [houseNumber, setHouseNumber] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [complement, setComplement] = useState('')
  const [reference, setReference] = useState('')
  const [payment, setPayment] = useState<OnlineOrder['payment']>('pix')
  const [trocoPara, setTrocoPara] = useState('')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<OnlineOrder | null>(null)
  const [pixQr, setPixQr] = useState('')

  // Load menu
  useEffect(() => {
    if (!bid) { setStage('closed'); return }
    async function load() {
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

  // Phone auto-lookup
  useEffect(() => {
    const clean = phoneInput.replace(/\D/g, '')
    if (clean.length >= 10) {
      const p = lookupProfile(clean)
      setProfileFound(p)
      if (p) {
        setName(p.name); setStreet(p.street); setHouseNumber(p.houseNumber)
        setNeighborhood(p.neighborhood); setComplement(p.complement || '')
        setReference(p.reference || '')
      }
    } else {
      setProfileFound(null)
    }
  }, [phoneInput])

  // Computed
  const categories = useMemo(() => ['all', ...Array.from(new Set(products.map(p => p.category)))], [products])
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
  function qtyOf(id: string) { return cart.find(x => x.productId === id)?.quantity ?? 0 }

  async function generatePixQr(amount: number) {
    if (!config.pixKey) return
    try {
      const payload = buildPixPayload(config.pixKey, amount, config.pixName || config.storeName, config.pixCity)
      setPixQr(await QRCode.toDataURL(payload, { width: 240, margin: 2 }))
    } catch { /* ignore */ }
  }

  function validateStep(): string | null {
    if (checkStep === 'id') {
      if (!name.trim()) return 'Informe seu nome'
      if (phoneInput.replace(/\D/g, '').length < 10) return 'Informe um WhatsApp válido'
    }
    if (checkStep === 'address') {
      if (!street.trim() || !houseNumber.trim()) return 'Informe o endereço completo'
      if (config.zones.length > 0 && !neighborhood) return 'Selecione o bairro de entrega'
      if (belowMin) return `Pedido mínimo de ${fmt(config.minOrder)}`
    }
    return null
  }

  function nextStep() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    const idx = STEPS.indexOf(checkStep)
    if (idx < STEPS.length - 1) setCheckStep(STEPS[idx + 1])
  }

  function prevStep() {
    const idx = STEPS.indexOf(checkStep)
    if (idx === 0) { setShowCheckout(false); setShowCart(true) }
    else setCheckStep(STEPS[idx - 1])
  }

  async function handleSubmit() {
    setError('')
    const order: OnlineOrder = {
      id: genId(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      customerName: name.trim(),
      customerPhone: phoneInput.replace(/\D/g, ''),
      address: {
        street: street.trim(), number: houseNumber.trim(), neighborhood,
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
    saveProfile({ name: name.trim(), phone: phoneInput.replace(/\D/g, ''), street: street.trim(), houseNumber: houseNumber.trim(), neighborhood, complement: complement.trim(), reference: reference.trim() })
    if (payment === 'pix') generatePixQr(total)
    setConfirmed(order)
    setStage('success')
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-[#0F0F0F]">
        <div className="h-52 bg-[#181818] animate-pulse" />
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-[88px] bg-[#1a1a1a] rounded-2xl animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </div>
    )
  }

  // ── Closed ───────────────────────────────────────────────────────────────────
  if (stage === 'closed') {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-20 h-20 rounded-3xl bg-[#1e1e1e] border border-white/8 flex items-center justify-center mx-auto">
            <Store size={32} className="text-[#F5C542]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">{config.storeName || 'Loja'}</h1>
            <p className="text-gray-500 text-sm mt-1 leading-relaxed">
              Pedidos online fechados no momento.<br />Volte mais tarde! 🙏
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  if (stage === 'success' && confirmed) {
    const waLink = config.whatsapp
      ? `https://wa.me/55${config.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Fiz um pedido pelo site (${fmt(confirmed.total)}) — nome: ${confirmed.customerName}.`)}`
      : ''
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-white">
        <div className="max-w-md mx-auto p-5 pb-12 space-y-5">
          <div className="text-center pt-10 space-y-4">
            <div className="w-24 h-24 rounded-full bg-[#F5C542] flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(245,197,66,0.35)]">
              <Check size={44} className="text-[#0F0F0F]" strokeWidth={3} />
            </div>
            <div>
              <h1 className="text-2xl font-black">Pedido enviado! 🎉</h1>
              <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                {config.storeName} recebeu e já está preparando.<br />Acompanhe pelo WhatsApp.
              </p>
            </div>
          </div>

          {payment === 'pix' && pixQr && (
            <div className="bg-[#1a1a1a] border border-[#F5C542]/20 rounded-2xl p-5 text-center space-y-3">
              <p className="font-bold text-[#F5C542] flex items-center justify-center gap-2 text-sm">
                <QrIcon size={15} /> Pague com PIX
              </p>
              <img src={pixQr} alt="QR Code PIX" className="mx-auto rounded-xl bg-white p-2" width={180} height={180} />
              <p className="text-3xl font-black">{fmt(confirmed.total)}</p>
              <button
                onClick={() => navigator.clipboard.writeText(buildPixPayload(config.pixKey, confirmed.total, config.pixName || config.storeName, config.pixCity))}
                className="text-xs text-[#F5C542] flex items-center justify-center gap-1.5 mx-auto hover:underline"
              >
                <Copy size={12} /> Copiar código PIX
              </button>
            </div>
          )}

          <div className="bg-[#1a1a1a] rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Resumo do pedido</p>
            {confirmed.items.map(i => (
              <div key={i.productId} className="flex justify-between text-sm">
                <span className="text-gray-300">{i.quantity}× {i.productName}</span>
                <span className="text-gray-500">{fmt(i.total)}</span>
              </div>
            ))}
            <div className="border-t border-white/8 pt-2 mt-1 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(confirmed.subtotal)}</span></div>
              <div className="flex justify-between text-sm text-gray-500"><span>Entrega</span><span>{fmt(confirmed.deliveryFee)}</span></div>
              <div className="flex justify-between font-black text-base pt-1">
                <span>Total</span><span className="text-[#F5C542]">{fmt(confirmed.total)}</span>
              </div>
            </div>
          </div>

          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full bg-[#25D366] text-white py-4 rounded-2xl font-bold">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.135.561 4.136 1.535 5.872L.057 23.998l6.305-1.654A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.924 0-3.72-.524-5.257-1.434l-.378-.224-3.92 1.028 1.045-3.816-.247-.393A9.966 9.966 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
              </svg>
              Falar no WhatsApp
            </a>
          )}
          <button onClick={() => window.location.reload()} className="w-full text-center text-gray-600 text-sm py-2">
            Fazer outro pedido
          </button>
        </div>
      </div>
    )
  }

  // ── Menu ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* Header */}
      <header className="bg-[#0F0F0F] text-white px-5 pt-8 pb-7 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 90% 40%, rgba(245,197,66,0.12) 0%, transparent 65%)' }} />
        <div className="max-w-md mx-auto relative">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F5C542] flex items-center justify-center shrink-0"
              style={{ boxShadow: '0 0 24px rgba(245,197,66,0.35)' }}>
              <Store size={26} className="text-[#0F0F0F]" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black tracking-tight leading-tight truncate">{config.storeName || 'Cardápio'}</h1>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  <span className="text-green-400 font-medium">Aberto</span>
                </span>
                <span className="text-gray-600 text-xs">·</span>
                <span className="flex items-center gap-1 text-xs text-gray-400"><Bike size={11} /> Delivery</span>
              </div>
            </div>
          </div>
          {config.notice && (
            <div className="mt-4 flex items-center gap-2 bg-[#F5C542]/10 border border-[#F5C542]/20 rounded-xl px-4 py-2.5 text-xs text-[#F5C542]">
              <Clock size={13} className="shrink-0" /> {config.notice}
            </div>
          )}
        </div>
      </header>

      {/* Category bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-md mx-auto flex gap-2 px-4 py-3 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}>
          <button onClick={() => setActiveCat('all')}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${activeCat === 'all' ? 'bg-[#0F0F0F] text-[#F5C542]' : 'bg-gray-100 text-gray-500'}`}>
            Todos
          </button>
          {categories.filter(c => c !== 'all').map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)}
              className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 ${activeCat === cat ? 'bg-[#0F0F0F] text-[#F5C542]' : 'bg-gray-100 text-gray-500'}`}>
              <span>{CAT[cat]?.emoji}</span>
              {CAT[cat]?.label || cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div className="max-w-md mx-auto p-4 space-y-3">
        {visible.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-4xl">🍽️</p>
            <p className="text-gray-400 text-sm">Nenhum item disponível.</p>
          </div>
        ) : visible.map(p => {
          const q = qtyOf(p.id)
          const cat = CAT[p.category]
          return (
            <div key={p.id} className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
              <div className="h-1" style={{ background: cat?.color || '#6B7280' }} />
              <div className="p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: `${cat?.color || '#6B7280'}18` }}>
                  {cat?.emoji || '🍽️'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 leading-tight">{p.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{cat?.label || p.category}</p>
                  <p className="text-base font-black text-gray-900 mt-1.5">{fmt(p.salePrice)}</p>
                </div>
                {q === 0 ? (
                  <button onClick={() => addToCart(p)}
                    className="shrink-0 w-10 h-10 rounded-xl bg-[#F5C542] text-[#0F0F0F] flex items-center justify-center active:scale-90 transition-transform">
                    <Plus size={20} strokeWidth={2.5} />
                  </button>
                ) : (
                  <div className="shrink-0 flex items-center gap-1 bg-[#0F0F0F] rounded-xl px-1.5 py-1">
                    <button onClick={() => changeQty(p.id, -1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white"><Minus size={14} /></button>
                    <span className="text-white font-bold w-5 text-center text-sm">{q}</span>
                    <button onClick={() => changeQty(p.id, 1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#F5C542]"><Plus size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating cart bar */}
      {cartCount > 0 && !showCart && !showCheckout && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-30 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button onClick={() => setShowCart(true)}
              className="w-full bg-[#F5C542] text-[#0F0F0F] rounded-2xl py-4 px-5 flex items-center justify-between shadow-2xl active:scale-[0.98] transition-transform">
              <span className="flex items-center gap-3 font-bold text-sm">
                <span className="bg-[#0F0F0F] text-[#F5C542] w-7 h-7 rounded-full flex items-center justify-center text-xs font-black">{cartCount}</span>
                Ver sacola
              </span>
              <span className="font-black text-base">{fmt(subtotal)}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Cart sheet ──────────────────────────────────────────────────────── */}
      {showCart && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={() => setShowCart(false)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="font-black text-gray-900 text-lg flex items-center gap-2.5">
                <ShoppingBag size={19} /> Sua sacola
              </h2>
              <button onClick={() => setShowCart(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
              {cart.map(item => (
                <div key={item.productId} className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-gray-100 rounded-xl px-1.5 py-1 shrink-0">
                    <button onClick={() => changeQty(item.productId, -1)} className="w-7 h-7 flex items-center justify-center text-gray-500 rounded-lg"><Minus size={14} /></button>
                    <span className="font-black w-5 text-center text-sm">{item.quantity}</span>
                    <button onClick={() => changeQty(item.productId, 1)} className="w-7 h-7 flex items-center justify-center text-[#c49a20] rounded-lg"><Plus size={14} /></button>
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-700">{item.productName}</span>
                  <span className="text-sm font-bold text-gray-900">{fmt(item.total)}</span>
                </div>
              ))}
            </div>

            <div className="px-5 pb-6 pt-3 border-t border-gray-100 shrink-0 space-y-3">
              {belowMin && (
                <div className="bg-orange-50 text-orange-600 text-xs text-center rounded-xl py-2 font-medium">
                  Mínimo {fmt(config.minOrder)} — faltam {fmt(config.minOrder - subtotal)}
                </div>
              )}
              <div className="flex justify-between font-black text-gray-900 text-base">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              <button onClick={() => { setShowCart(false); setShowCheckout(true); setCheckStep('id') }} disabled={belowMin}
                className="w-full bg-[#F5C542] text-[#0F0F0F] py-4 rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform text-sm">
                Continuar <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout sheet ──────────────────────────────────────────────────── */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl max-h-[93vh] flex flex-col">

            {/* Step header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
              <button onClick={prevStep} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <ArrowLeft size={16} />
              </button>
              <div className="flex-1">
                <p className="font-black text-gray-900 text-base">
                  {checkStep === 'id' ? 'Identificação' : checkStep === 'address' ? 'Endereço de entrega' : 'Forma de pagamento'}
                </p>
                <p className="text-xs text-gray-400">
                  {checkStep === 'id' ? 'Passo 1 de 3' : checkStep === 'address' ? 'Passo 2 de 3' : 'Passo 3 de 3'}
                </p>
              </div>
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((s, i) => {
                  const current = STEPS.indexOf(checkStep)
                  return (
                    <div key={s} className={`rounded-full transition-all duration-300 ${
                      i === current ? 'w-6 h-2 bg-[#F5C542]' :
                      i < current ? 'w-2 h-2 bg-[#c49a20]' : 'w-2 h-2 bg-gray-200'
                    }`} />
                  )
                })}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">

              {/* ── Step 1: Identificação ─────────────────────────────────── */}
              {checkStep === 'id' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Phone size={11} className="text-[#F5C542]" /> WhatsApp
                    </label>
                    <input
                      value={phoneInput}
                      onChange={e => setPhoneInput(fmtPhone(e.target.value))}
                      placeholder="(22) 99999-8888"
                      inputMode="numeric"
                      autoFocus
                      className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-4 py-3.5 text-base font-semibold outline-none transition-colors"
                    />
                    <p className="text-xs text-gray-400">Usamos para identificar seu cadastro e confirmar o pedido.</p>
                  </div>

                  {/* Profile found banner */}
                  {profileFound && (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3.5">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <User size={18} className="text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-green-900">Olá, {profileFound.name}! 👋</p>
                        <p className="text-xs text-green-600 mt-0.5">Encontramos seu endereço salvo.</p>
                      </div>
                      <button onClick={() => {
                        setProfileFound(null)
                        setName(''); setStreet(''); setHouseNumber('')
                        setNeighborhood(''); setComplement(''); setReference('')
                      }} className="text-xs text-green-500 underline shrink-0 font-medium">
                        Não sou eu
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <User size={11} className="text-[#F5C542]" /> Nome completo
                    </label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="João da Silva"
                      className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-4 py-3.5 text-sm outline-none transition-colors"
                    />
                  </div>
                </>
              )}

              {/* ── Step 2: Endereço ──────────────────────────────────────── */}
              {checkStep === 'address' && (
                <>
                  {profileFound && (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                      <Check size={13} className="text-blue-500 shrink-0" />
                      <p className="text-xs text-blue-700 font-medium">Endereço pré-preenchido — confira e edite se necessário.</p>
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block">Rua / Avenida</label>
                        <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Rua das Flores"
                          className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-3 py-3 text-sm outline-none transition-colors" />
                      </div>
                      <div className="w-24 space-y-1.5">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block">Nº</label>
                        <input value={houseNumber} onChange={e => setHouseNumber(e.target.value)} placeholder="123"
                          inputMode="numeric"
                          className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-3 py-3 text-sm outline-none transition-colors" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                        <MapPin size={10} className="text-[#F5C542]" /> Bairro
                      </label>
                      {config.zones.length > 0 ? (
                        <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
                          className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-3 py-3 text-sm outline-none transition-colors bg-white">
                          <option value="">Selecione o bairro...</option>
                          {config.zones.map(z => <option key={z.id} value={z.neighborhood}>{z.neighborhood} — {fmt(z.fee)}</option>)}
                        </select>
                      ) : (
                        <input value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Bairro"
                          className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-3 py-3 text-sm outline-none transition-colors" />
                      )}
                    </div>

                    <input value={complement} onChange={e => setComplement(e.target.value)} placeholder="Complemento (apto, bloco...) — opcional"
                      className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-3 py-3 text-sm outline-none transition-colors" />
                    <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Ponto de referência — opcional"
                      className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-3 py-3 text-sm outline-none transition-colors" />
                  </div>
                </>
              )}

              {/* ── Step 3: Pagamento ──────────────────────────────────────── */}
              {checkStep === 'payment' && (
                <div className="space-y-4">
                  <div className="space-y-2.5">
                    {([
                      ['pix',      '📱', 'PIX',     'Escaneie o QR no app do banco'],
                      ['dinheiro', '💵', 'Dinheiro', 'Entregador leva troco'],
                      ['cartao',   '💳', 'Cartão',   'Maquininha na entrega'],
                    ] as const).map(([val, emoji, label, desc]) => (
                      <button key={val} type="button" onClick={() => setPayment(val)}
                        className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl border-2 text-left transition-all ${
                          payment === val ? 'border-[#F5C542] bg-yellow-50' : 'border-gray-200'
                        }`}>
                        <span className="text-2xl">{emoji}</span>
                        <div className="flex-1">
                          <p className={`text-sm font-black ${payment === val ? 'text-[#0F0F0F]' : 'text-gray-700'}`}>{label}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${payment === val ? 'border-[#c49a20] bg-[#F5C542]' : 'border-gray-300'}`}>
                          {payment === val && <Check size={11} className="text-[#0F0F0F]" strokeWidth={3} />}
                        </div>
                      </button>
                    ))}
                  </div>

                  {payment === 'dinheiro' && (
                    <input value={trocoPara} onChange={e => setTrocoPara(e.target.value)} placeholder="Troco para quanto? (deixe vazio se não precisar)"
                      inputMode="numeric"
                      className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-3 py-3 text-sm outline-none transition-colors" />
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block">Observações (opcional)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                      placeholder="Ex: sem cebola, sem campainha..."
                      className="w-full border-2 border-gray-200 focus:border-[#F5C542] rounded-xl px-3 py-3 text-sm outline-none transition-colors resize-none" />
                  </div>

                  {/* Order summary */}
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Resumo</p>
                    {cart.map(i => (
                      <div key={i.productId} className="flex justify-between text-sm">
                        <span className="text-gray-600">{i.quantity}× {i.productName}</span>
                        <span className="text-gray-400">{fmt(i.total)}</span>
                      </div>
                    ))}
                    <div className="border-t border-gray-200 pt-2 mt-1 space-y-1">
                      <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                      <div className="flex justify-between text-sm text-gray-500"><span>Entrega</span><span>{neighborhood ? fmt(deliveryFee) : '—'}</span></div>
                      <div className="flex justify-between font-black text-gray-900 pt-1 text-base"><span>Total</span><span>{fmt(total)}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 text-center font-medium">
                  {error}
                </div>
              )}
            </div>

            {/* CTA button */}
            <div className="px-5 pb-6 pt-3 border-t border-gray-100 shrink-0">
              {checkStep !== 'payment' ? (
                <button onClick={nextStep}
                  className="w-full bg-[#F5C542] text-[#0F0F0F] py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                  Continuar <ChevronRight size={18} />
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={sending}
                  className="w-full bg-[#F5C542] text-[#0F0F0F] py-4 rounded-2xl font-black flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform">
                  {sending
                    ? <><Loader2 size={17} className="animate-spin" /> Enviando...</>
                    : <>Enviar pedido · {fmt(total)}</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
