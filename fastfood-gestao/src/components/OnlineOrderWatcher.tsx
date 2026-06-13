import { useState, useEffect, useRef } from 'react'
import { fetchOnlineOrders, acceptOnlineOrder, removeOnlineOrder, subscribeOnlineOrders } from '../store/delivery'
import { getBusinessId } from '../store/supabase'
import type { OnlineOrder } from '../types'
import { Bike, MapPin, Phone, X, Check, Banknote, QrCode, CreditCard } from 'lucide-react'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAY_LABEL: Record<OnlineOrder['payment'], { label: string; icon: React.ReactNode }> = {
  pix:      { label: 'PIX',             icon: <QrCode size={13} /> },
  dinheiro: { label: 'Dinheiro',        icon: <Banknote size={13} /> },
  cartao:   { label: 'Cartão na entrega', icon: <CreditCard size={13} /> },
}

// Beep curto usando Web Audio (não precisa de arquivo)
function ding() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const play = (freq: number, start: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.25)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + 0.3)
    }
    play(880, 0); play(1175, 0.18)
    setTimeout(() => ctx.close(), 800)
  } catch { /* ignore */ }
}

export default function OnlineOrderWatcher() {
  const [pending, setPending] = useState<OnlineOrder[]>([])
  const [busy, setBusy] = useState(false)
  const prevCount = useRef(0)
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function refresh() {
    const orders = await fetchOnlineOrders('pending')
    setPending(orders)
  }

  useEffect(() => {
    refresh()
    const unsub = subscribeOnlineOrders(getBusinessId(), refresh)
    // fallback: re-checa a cada 25s caso o realtime caia
    const poll = setInterval(refresh, 25000)
    return () => {
      unsub()
      clearInterval(poll)
      if (ringRef.current) { clearInterval(ringRef.current); ringRef.current = null }
    }
  }, [])

  // Toca o alerta enquanto houver pedido novo na tela
  useEffect(() => {
    if (pending.length > prevCount.current && pending.length > 0) {
      ding()
    }
    prevCount.current = pending.length

    if (pending.length > 0 && !ringRef.current) {
      ringRef.current = setInterval(ding, 4000)
    } else if (pending.length === 0 && ringRef.current) {
      clearInterval(ringRef.current); ringRef.current = null
    }
    return () => { if (ringRef.current && pending.length === 0) { clearInterval(ringRef.current); ringRef.current = null } }
  }, [pending.length])

  const order = pending[0]
  if (!order) return null

  async function accept() {
    setBusy(true)
    await acceptOnlineOrder(order)
    setBusy(false)
    refresh()
  }
  async function reject() {
    if (!confirm('Recusar este pedido? O cliente não será notificado automaticamente.')) return
    setBusy(true)
    await removeOnlineOrder(order.id)
    setBusy(false)
    refresh()
  }

  const time = new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden animate-[pulse_2s_ease-in-out_1]">
        {/* Cabeçalho */}
        <div className="bg-[#0F0F0F] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-[#F5C542] flex items-center justify-center">
              <Bike size={18} className="text-[#0F0F0F]" />
            </div>
            <div>
              <p className="font-bold leading-tight">Novo pedido online! 🔔</p>
              <p className="text-xs text-gray-400">{time} {pending.length > 1 && `· +${pending.length - 1} na fila`}</p>
            </div>
          </div>
          <span className="text-lg font-black text-[#F5C542]">{fmt(order.total)}</span>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Cliente */}
          <div className="space-y-1">
            <p className="font-semibold text-gray-800">{order.customerName}</p>
            <a href={`https://wa.me/55${order.customerPhone}`} target="_blank" rel="noopener noreferrer"
              className="text-xs text-green-600 flex items-center gap-1"><Phone size={11} /> {order.customerPhone}</a>
          </div>

          {/* Endereço */}
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600 flex gap-2">
            <MapPin size={14} className="text-[#F5C542] shrink-0 mt-0.5" />
            <div>
              <p>{order.address.street}, {order.address.number}{order.address.complement ? ` — ${order.address.complement}` : ''}</p>
              <p className="text-gray-500">{order.address.neighborhood}</p>
              {order.address.reference && <p className="text-xs text-gray-400">Ref: {order.address.reference}</p>}
            </div>
          </div>

          {/* Itens */}
          <div className="space-y-1">
            {order.items.map(i => (
              <div key={i.productId} className="flex justify-between text-sm">
                <span className="text-gray-700">{i.quantity}× {i.productName}</span>
                <span className="text-gray-500">{fmt(i.total)}</span>
              </div>
            ))}
          </div>

          {order.notes && (
            <p className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-3 py-2">Obs: {order.notes}</p>
          )}

          {/* Totais + pagamento */}
          <div className="border-t border-gray-100 pt-2 space-y-1">
            <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>{fmt(order.subtotal)}</span></div>
            <div className="flex justify-between text-sm text-gray-500"><span>Entrega ({order.address.neighborhood})</span><span>{fmt(order.deliveryFee)}</span></div>
            <div className="flex justify-between font-bold text-gray-800"><span>Total</span><span>{fmt(order.total)}</span></div>
          </div>

          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
            <span className="text-sm text-gray-600 flex items-center gap-1.5">{PAY_LABEL[order.payment].icon} {PAY_LABEL[order.payment].label}</span>
            {order.payment === 'dinheiro' && order.trocoPara ? (
              <span className="text-xs text-gray-500">Troco para {fmt(order.trocoPara)}</span>
            ) : null}
          </div>
        </div>

        {/* Ações */}
        <div className="p-4 border-t border-gray-100 shrink-0 grid grid-cols-3 gap-2">
          <button onClick={reject} disabled={busy}
            className="flex items-center justify-center gap-1 py-3 rounded-xl border-2 border-gray-200 text-gray-500 font-semibold text-sm disabled:opacity-50">
            <X size={16} /> Recusar
          </button>
          <button onClick={accept} disabled={busy}
            className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#F5C542] text-[#0F0F0F] font-black text-sm disabled:opacity-50 active:scale-[0.98] transition-transform">
            <Check size={16} /> Aceitar pedido
          </button>
        </div>
      </div>
    </div>
  )
}
