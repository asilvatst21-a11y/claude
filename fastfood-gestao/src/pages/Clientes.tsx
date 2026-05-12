import { useState } from 'react'
import { getCustomers, saveCustomer, deleteCustomer, getCashbackConfig, saveCashbackConfig, getSales, id } from '../store/storage'
import { getBusinessId } from '../store/supabase'
import { supabase } from '../store/supabase'
import type { Customer, CashbackConfig } from '../types'
import { Plus, Trash2, X, Check, Users, Gift, Phone, Cake, Search, ChevronDown, ChevronUp, ShoppingBag, ArrowLeft, Link } from 'lucide-react'

function memberSince(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (days === 0) return 'Cadastrado hoje'
  if (days < 30) return `${days} dia${days > 1 ? 's' : ''} cadastrado`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} mês${months > 1 ? 'es' : ''} cadastrado`
  const years = Math.floor(months / 12)
  return `${years} ano${years > 1 ? 's' : ''} cadastrado`
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

function birthdayFromISO(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function isToday(iso: string) {
  if (!iso) return false
  const today = new Date()
  const [, m, d] = iso.split('-')
  return parseInt(m) === today.getMonth() + 1 && parseInt(d) === today.getDate()
}

const emptyCustomer = (): Omit<Customer, 'id' | 'cashbackBalance' | 'totalSpent' | 'createdAt'> => ({
  name: '', phone: '', birthday: '',
})

export default function Clientes() {
  const [customers, setCustomers] = useState<Customer[]>(getCustomers)
  const [cashback, setCashback] = useState<CashbackConfig>(getCashbackConfig)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyCustomer())
  const [birthdayInput, setBirthdayInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [showCashbackSettings, setShowCashbackSettings] = useState(false)
  const [saved, setSaved] = useState(false)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const reload = () => setCustomers(getCustomers())

  const registrationLink = `${window.location.origin}/cadastro?b=${getBusinessId()}`

  async function copyLink() {
    await navigator.clipboard.writeText(registrationLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2500)
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search.replace(/\D/g, ''))
  )

  const allSales = getSales()
  const customerSales = detailCustomer
    ? [...allSales.filter(s => s.customerId === detailCustomer.id)].sort((a, b) =>
        `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)
      )
    : []

  const birthdays = customers.filter(c => isToday(c.birthday))

  function openNew() {
    setEditId(null)
    setForm(emptyCustomer())
    setBirthdayInput('')
    setPhoneInput('')
    setShowForm(true)
  }

  function openEdit(c: Customer) {
    setEditId(c.id)
    setForm({ name: c.name, phone: c.phone, birthday: c.birthday })
    setBirthdayInput(birthdayFromISO(c.birthday))
    setPhoneInput(formatPhone(c.phone))
    setShowForm(true)
  }

  function handlePhoneChange(v: string) {
    setPhoneInput(formatPhone(v))
    setForm(f => ({ ...f, phone: v.replace(/\D/g, '') }))
  }

  function handleBirthdayChange(v: string) {
    setBirthdayInput(formatBirthday(v))
    setForm(f => ({ ...f, birthday: birthdayToISO(formatBirthday(v)) }))
  }

  function handleSave() {
    if (!form.name.trim()) return
    if (editId) {
      const existing = customers.find(c => c.id === editId)!
      saveCustomer({ ...existing, name: form.name.trim(), phone: form.phone, birthday: form.birthday })
    } else {
      saveCustomer({
        id: id(), name: form.name.trim(), phone: form.phone,
        birthday: form.birthday, cashbackBalance: 0, totalSpent: 0,
        createdAt: new Date().toISOString(),
      })
    }
    reload()
    setShowForm(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleDelete(cid: string) {
    deleteCustomer(cid)
    reload()
  }

  function toggleCashback() {
    const updated = { ...cashback, enabled: !cashback.enabled }
    setCashback(updated)
    saveCashbackConfig(updated)
  }

  function updatePercentage(v: number) {
    const updated = { ...cashback, percentage: v }
    setCashback(updated)
    saveCashbackConfig(updated)
  }

  // Tela de detalhe do cliente
  if (detailCustomer) {
    const c = customers.find(x => x.id === detailCustomer.id) ?? detailCustomer
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailCustomer(null)} className="text-gray-400 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">{c.name}</h1>
            <p className="text-gray-500 text-xs">
              {c.phone && formatPhone(c.phone)}{c.birthday && ` · ${birthdayFromISO(c.birthday)}`}
              {c.createdAt && <span className="text-orange-400"> · {memberSince(c.createdAt)}</span>}
            </p>
          </div>
          <button onClick={() => { openEdit(c); setDetailCustomer(null) }}
            className="text-xs text-orange-500 border border-orange-300 px-3 py-1.5 rounded-lg hover:bg-orange-50">
            Editar
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-orange-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Compras</p>
            <p className="text-lg font-bold text-orange-600">{customerSales.length}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Total gasto</p>
            <p className="text-lg font-bold text-green-600">{fmt(c.totalSpent)}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Cashback</p>
            <p className="text-lg font-bold text-blue-600">{fmt(c.cashbackBalance)}</p>
          </div>
        </div>

        {/* Histórico de compras */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <ShoppingBag size={15} className="text-orange-500" /> Histórico de Compras
          </h2>
          {customerSales.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">Nenhuma compra registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {customerSales.map(sale => (
                <div key={sale.id} className="flex items-start justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">
                      {sale.items.map(i => `${i.quantity}x ${i.productName}`).join(' · ')}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {sale.date} {sale.time} · {sale.paymentMethod === 'pix' ? 'PIX' : sale.paymentMethod === 'dinheiro' ? 'Dinheiro' : sale.paymentMethod === 'cartao_debito' ? 'Débito' : 'Crédito'}
                      {sale.cashbackUsed ? <span className="text-green-600"> · cashback −{fmt(sale.cashbackUsed)}</span> : null}
                      {sale.cashbackEarned ? <span className="text-blue-500"> · +{fmt(sale.cashbackEarned)} cashback</span> : null}
                    </p>
                  </div>
                  <span className="font-semibold text-green-600 ml-3">{fmt(sale.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
          <p className="text-gray-500 text-sm">{customers.length} cliente{customers.length !== 1 ? 's' : ''} cadastrado{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          {supabase && (
            <button
              onClick={copyLink}
              title="Copiar link de cadastro para clientes"
              className={`flex items-center gap-2 px-3 py-2 rounded-xl font-medium text-sm border transition-colors ${linkCopied ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 text-gray-600 hover:border-orange-300 hover:text-orange-600'}`}
            >
              {linkCopied ? <><Check size={14} /> Copiado!</> : <><Link size={14} /> Link</>}
            </button>
          )}
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-medium text-sm shadow"
          >
            <Plus size={16} /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Aniversariantes do dia */}
      {birthdays.length > 0 && (
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 flex items-center gap-3">
          <Cake size={20} className="text-pink-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-pink-700">Aniversário hoje 🎉</p>
            <p className="text-sm text-pink-600">{birthdays.map(c => c.name).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Cashback */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowCashbackSettings(v => !v)}
          className="w-full flex items-center justify-between p-4"
        >
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cashback.enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
              <Gift size={18} className={cashback.enabled ? 'text-green-600' : 'text-gray-400'} />
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-800 text-sm">Cashback</p>
              <p className="text-xs text-gray-500">
                {cashback.enabled ? `Ativo — ${cashback.percentage}% de volta por compra` : 'Desativado'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              onClick={e => { e.stopPropagation(); toggleCashback() }}
              className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative ${cashback.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cashback.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            {showCashbackSettings ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </div>
        </button>

        {showCashbackSettings && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Percentual de cashback</label>
              <div className="flex items-center gap-3">
                <input
                  type="range" min={1} max={20} value={cashback.percentage}
                  onChange={e => updatePercentage(Number(e.target.value))}
                  className="flex-1 accent-orange-500"
                />
                <span className="text-lg font-bold text-orange-500 w-12 text-right">{cashback.percentage}%</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1%</span><span>5%</span><span>10%</span><span>15%</span><span>20%</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
              A cada compra, o cliente acumula {cashback.percentage}% do valor em saldo. Aplique o desconto manualmente na próxima compra.
            </p>
          </div>
        )}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
        />
      </div>

      {/* Lista de clientes */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-gray-400">
          <Users size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div
              key={c.id}
              onClick={() => setDetailCustomer(c)}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 cursor-pointer hover:border-orange-200 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <span className="text-orange-600 font-bold text-sm">{c.name.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800 truncate">{c.name}</p>
                  {isToday(c.birthday) && <span className="text-base">🎂</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {c.phone && <span className="text-xs text-gray-500 flex items-center gap-1"><Phone size={11} />{formatPhone(c.phone)}</span>}
                  {c.birthday && <span className="text-xs text-gray-500 flex items-center gap-1"><Cake size={11} />{birthdayFromISO(c.birthday)}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {cashback.enabled && c.cashbackBalance > 0 && (
                  <p className="text-xs font-semibold text-green-600 flex items-center gap-1 justify-end">
                    <Gift size={11} /> {fmt(c.cashbackBalance)}
                  </p>
                )}
                {c.totalSpent > 0 && <p className="text-xs text-gray-400">{fmt(c.totalSpent)} gasto</p>}
                {c.createdAt && <p className="text-xs text-gray-300">{memberSince(c.createdAt)}</p>}
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(c.id) }}
                className="text-red-300 hover:text-red-500 shrink-0 ml-1"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal novo/editar cliente */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-800">{editId ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nome *</label>
                <input
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nome do cliente"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  <Phone size={12} className="inline mr-1" />Telefone / WhatsApp
                </label>
                <input
                  value={phoneInput} onChange={e => handlePhoneChange(e.target.value)}
                  placeholder="(11) 99999-9999"
                  inputMode="numeric"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  <Cake size={12} className="inline mr-1" />Data de Aniversário
                </label>
                <input
                  value={birthdayInput} onChange={e => handleBirthdayChange(e.target.value)}
                  placeholder="DD/MM/AAAA"
                  inputMode="numeric"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={!form.name.trim()}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
              >
                <Check size={16} /> {editId ? 'Salvar alterações' : 'Cadastrar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {saved && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-xl shadow-lg font-semibold flex items-center gap-2">
          <Check size={18} /> Cliente salvo!
        </div>
      )}
    </div>
  )
}
