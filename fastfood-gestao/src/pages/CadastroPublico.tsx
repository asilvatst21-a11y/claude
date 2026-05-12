import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { pushCustomerPublic } from '../store/sync'
import { supabase } from '../store/supabase'
import type { Customer } from '../types'
import { Phone, Cake, Loader, User, BadgeCheck, Gift, Star } from 'lucide-react'

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
}

function formatBirthday(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3').replace(/\/$/, '').replace(/\/$/, '')
}

function birthdayToISO(br: string) {
  const [d, m, y] = br.split('/')
  if (!d || !m || !y || y.length < 4) return ''
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export default function CadastroPublico() {
  const [params] = useSearchParams()
  const businessId = params.get('b') || ''

  const [name, setName] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneRaw, setPhoneRaw] = useState('')
  const [birthdayInput, setBirthdayInput] = useState('')
  const [birthdayISO, setBirthdayISO] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  function handlePhone(v: string) {
    setPhoneInput(formatPhone(v))
    setPhoneRaw(v.replace(/\D/g, ''))
  }

  function handleBirthday(v: string) {
    const formatted = formatBirthday(v)
    setBirthdayInput(formatted)
    setBirthdayISO(birthdayToISO(formatted))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !businessId) return

    setStatus('loading')

    const customer: Customer = {
      id: genId(),
      name: name.trim(),
      phone: phoneRaw,
      birthday: birthdayISO,
      cashbackBalance: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString(),
    }

    const ok = await pushCustomerPublic(businessId, customer)
    setStatus(ok ? 'success' : 'error')
  }

  if (!businessId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center text-gray-400">
          <p className="text-sm">Link inválido. Solicite um novo link ao estabelecimento.</p>
        </div>
      </div>
    )
  }

  if (!supabase) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center text-gray-400">
          <p className="text-sm">Cadastro não disponível no momento.</p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <div>
            <div className="text-4xl font-black text-[#FFB800] leading-none tracking-tight" style={{ textShadow: '2px 2px 0 #CC0000' }}>
              MACARRÃO
            </div>
            <div className="text-lg font-bold text-white">na</div>
            <div className="text-4xl font-black text-[#FFB800] leading-none tracking-tight" style={{ textShadow: '2px 2px 0 #CC0000' }}>
              CHAPA
            </div>
            <div className="mt-2 inline-block bg-[#CC0000] text-white text-xs font-bold px-4 py-1 rounded-sm tracking-widest uppercase">
              O ORIGINAL
            </div>
          </div>

          <div className="bg-[#1a1a1a] border border-[#FFB800]/30 rounded-2xl p-8 space-y-4">
            <div className="w-16 h-16 bg-[#FFB800] rounded-full flex items-center justify-center mx-auto">
              <BadgeCheck size={32} className="text-black" />
            </div>
            <h2 className="text-xl font-bold text-white">Cadastro realizado!</h2>
            <p className="text-gray-400 text-sm">
              Seja bem-vindo(a), <strong className="text-[#FFB800]">{name}</strong>!<br />
              Você já faz parte do clube de vantagens do Macarrão na Chapa.
            </p>
            <div className="bg-[#FFB800]/10 border border-[#FFB800]/30 rounded-xl p-3 text-sm text-[#FFB800] font-medium">
              🔥 Agora você acumula cashback em cada pedido!
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">

        {/* Logo */}
        <div className="text-center space-y-1">
          <div className="text-5xl font-black text-[#FFB800] leading-none tracking-tight" style={{ textShadow: '2px 2px 0 #CC0000, 0 4px 16px rgba(204,0,0,0.4)' }}>
            MACARRÃO
          </div>
          <div className="text-xl font-bold text-white tracking-widest">na</div>
          <div className="text-5xl font-black text-[#FFB800] leading-none tracking-tight" style={{ textShadow: '2px 2px 0 #CC0000, 0 4px 16px rgba(204,0,0,0.4)' }}>
            CHAPA
          </div>
          <div className="mt-3 inline-block bg-[#CC0000] text-white text-xs font-bold px-5 py-1.5 rounded-sm tracking-widest uppercase">
            O ORIGINAL
          </div>
        </div>

        {/* Benefits */}
        <div className="flex justify-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1"><Gift size={12} className="text-[#FFB800]" /> Cashback</div>
          <div className="flex items-center gap-1"><Star size={12} className="text-[#FFB800]" /> Promoções</div>
          <div className="flex items-center gap-1"><Cake size={12} className="text-[#FFB800]" /> Aniversário</div>
        </div>

        {/* Form */}
        <div className="bg-[#111111] border border-white/10 rounded-2xl overflow-hidden">
          <div className="bg-[#CC0000] px-5 py-3">
            <p className="text-white text-sm font-bold text-center">Cadastre-se e ganhe vantagens exclusivas</p>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 mb-1.5 flex items-center gap-1">
                <User size={12} className="text-[#FFB800]" /> Nome completo *
              </label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Seu nome"
                required
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFB800]/60 focus:ring-1 focus:ring-[#FFB800]/20"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 mb-1.5 flex items-center gap-1">
                <Phone size={12} className="text-[#FFB800]" /> WhatsApp
              </label>
              <input
                value={phoneInput} onChange={e => handlePhone(e.target.value)}
                placeholder="(11) 99999-9999"
                inputMode="numeric"
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFB800]/60 focus:ring-1 focus:ring-[#FFB800]/20"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-400 mb-1.5 flex items-center gap-1">
                <Cake size={12} className="text-[#FFB800]" /> Data de aniversário
              </label>
              <input
                value={birthdayInput} onChange={e => handleBirthday(e.target.value)}
                placeholder="DD/MM/AAAA"
                inputMode="numeric"
                className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFB800]/60 focus:ring-1 focus:ring-[#FFB800]/20"
              />
              <p className="text-xs text-gray-600 mt-1">Ganhe desconto especial no seu aniversário 🎂</p>
            </div>

            {status === 'error' && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/40 rounded-xl px-3 py-2 text-center">
                Não foi possível realizar o cadastro. Tente novamente.
              </p>
            )}

            <button
              type="submit"
              disabled={!name.trim() || status === 'loading'}
              className="w-full bg-[#FFB800] hover:bg-[#FFC933] disabled:opacity-40 text-black py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-colors tracking-wide"
            >
              {status === 'loading'
                ? <><Loader size={16} className="animate-spin" /> Cadastrando...</>
                : <>🔥 FAZER MEU CADASTRO</>
              }
            </button>

            <p className="text-xs text-gray-600 text-center">
              Seus dados são usados apenas para oferecer promoções e cashback do Macarrão na Chapa.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
