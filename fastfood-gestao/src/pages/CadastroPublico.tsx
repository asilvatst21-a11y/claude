import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { pushCustomerPublic } from '../store/sync'
import { supabase } from '../store/supabase'
import type { Customer } from '../types'
import { UtensilsCrossed, Check, User, Phone, Cake, Loader } from 'lucide-react'

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
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="text-center text-gray-500">
          <p className="text-sm">Link inválido. Solicite um novo link ao estabelecimento.</p>
        </div>
      </div>
    )
  }

  if (!supabase) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="text-center text-gray-500">
          <p className="text-sm">Cadastro não disponível no momento.</p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <Check size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">Cadastro realizado!</h2>
          <p className="text-gray-500 text-sm">
            Obrigado, <strong>{name}</strong>! Seu cadastro foi registrado com sucesso.<br />
            Agora você pode acumular cashback e receber promoções exclusivas.
          </p>
          <div className="bg-orange-50 rounded-xl p-3 text-sm text-orange-700 font-medium">
            🎉 Bem-vindo ao nosso programa de fidelidade!
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-orange-500 p-6 text-white text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <UtensilsCrossed size={24} />
            <span className="font-bold text-xl">FastFood Gestão</span>
          </div>
          <p className="text-orange-100 text-sm">Cadastre-se e ganhe benefícios exclusivos</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5 flex items-center gap-1">
              <User size={12} /> Nome completo *
            </label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Seu nome"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5 flex items-center gap-1">
              <Phone size={12} /> WhatsApp
            </label>
            <input
              value={phoneInput} onChange={e => handlePhone(e.target.value)}
              placeholder="(11) 99999-9999"
              inputMode="numeric"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5 flex items-center gap-1">
              <Cake size={12} /> Data de aniversário
            </label>
            <input
              value={birthdayInput} onChange={e => handleBirthday(e.target.value)}
              placeholder="DD/MM/AAAA"
              inputMode="numeric"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
            />
            <p className="text-xs text-gray-400 mt-1">Para ganhar desconto especial no seu aniversário 🎂</p>
          </div>

          {status === 'error' && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center">
              Não foi possível realizar o cadastro. Tente novamente.
            </p>
          )}

          <button
            type="submit"
            disabled={!name.trim() || status === 'loading'}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {status === 'loading'
              ? <><Loader size={16} className="animate-spin" /> Cadastrando...</>
              : <><Check size={16} /> Fazer meu cadastro</>
            }
          </button>

          <p className="text-xs text-gray-400 text-center">
            Seus dados são usados apenas para oferecer promoções e cashback.
          </p>
        </form>
      </div>
    </div>
  )
}
