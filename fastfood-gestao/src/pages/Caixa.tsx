import { useState, useEffect } from 'react'
import { getCashSessions, saveCashSession, getOpenSession, getSales, id, deleteCashSession } from '../store/storage'
import type { CashSession, CashExpense } from '../types'
import { DollarSign, Plus, Lock, Unlock, AlertTriangle, CheckCircle, X, TrendingDown, Clock, Trash2 } from 'lucide-react'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5)
}

export default function Caixa() {
  const [session, setSession] = useState<CashSession | null>(null)
  const [history, setHistory] = useState<CashSession[]>([])
  const [openingBalance, setOpeningBalance] = useState('')
  const [countedAmount, setCountedAmount] = useState('')
  const [closingNotes, setClosingNotes] = useState('')
  const [showClose, setShowClose] = useState(false)

  // New expense
  const [expDesc, setExpDesc] = useState('')
  const [expAmount, setExpAmount] = useState('')

  const [tab, setTab] = useState<'caixa' | 'historico'>('caixa')

  function reload() {
    const open = getOpenSession()
    setSession(open)
    setHistory(getCashSessions().sort((a, b) => b.date.localeCompare(a.date)))
  }

  useEffect(() => { reload() }, [])

  // Sales in cash for today (dinheiro only)
  const todaySales = getSales().filter(s => s.date === today())
  const cashSales = todaySales.filter(s => s.paymentMethod === 'dinheiro').reduce((s, x) => s + x.total, 0)
  const totalSales = todaySales.reduce((s, x) => s + x.total, 0)
  const pixSales = todaySales.filter(s => s.paymentMethod === 'pix').reduce((s, x) => s + x.total, 0)
  const cardSales = todaySales.filter(s => s.paymentMethod === 'cartao_debito' || s.paymentMethod === 'cartao_credito').reduce((s, x) => s + x.total, 0)

  const totalExpenses = session?.expenses.reduce((s, e) => s + e.amount, 0) ?? 0
  const expectedClosing = (session?.openingBalance ?? 0) + cashSales - totalExpenses

  function openCaixa() {
    const bal = parseFloat(openingBalance) || 0
    const s: CashSession = {
      id: id(),
      date: today(),
      openingBalance: bal,
      closingExpected: 0,
      closingCounted: null,
      expenses: [],
      status: 'open',
      notes: '',
    }
    saveCashSession(s)
    setOpeningBalance('')
    reload()
  }

  function addExpense() {
    if (!session || !expDesc.trim() || !expAmount) return
    const expense: CashExpense = {
      id: id(),
      description: expDesc.trim(),
      amount: parseFloat(expAmount) || 0,
      time: nowTime(),
    }
    const updated: CashSession = { ...session, expenses: [...session.expenses, expense] }
    saveCashSession(updated)
    setExpDesc('')
    setExpAmount('')
    reload()
  }

  function closeCaixa() {
    if (!session) return
    const counted = parseFloat(countedAmount) ?? null
    const updated: CashSession = {
      ...session,
      closingExpected: expectedClosing,
      closingCounted: counted,
      status: 'closed',
      notes: closingNotes,
    }
    saveCashSession(updated)
    setShowClose(false)
    setCountedAmount('')
    setClosingNotes('')
    reload()
  }

  const diff = session ? (parseFloat(countedAmount) || 0) - expectedClosing : 0

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Controle de Caixa</h1>
        <p className="text-gray-500 text-sm">Abertura, fechamento e saídas do caixa diário</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {(['caixa', 'historico'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'caixa' ? 'Caixa do Dia' : 'Histórico'}
          </button>
        ))}
      </div>

      {tab === 'caixa' && (
        <div className="space-y-4">
          {/* Sem caixa aberto */}
          {!session && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Unlock size={20} className="text-[#F5C542]" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-800">Abrir Caixa</h2>
                  <p className="text-xs text-gray-500">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">Troco inicial (R$)</label>
                <input
                  type="number" min={0} step="0.01"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(e.target.value)}
                  placeholder="0,00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F5C542]"
                />
              </div>
              <button onClick={openCaixa}
                className="w-full bg-[#F5C542] hover:bg-[#d4a72c] text-[#0F0F0F] py-3 rounded-xl font-bold text-sm">
                Abrir Caixa
              </button>
            </div>
          )}

          {/* Caixa aberto */}
          {session && (
            <>
              {/* Status bar */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <div>
                    <p className="text-sm font-bold text-green-800">Caixa Aberto</p>
                    <p className="text-xs text-green-600">Troco inicial: {fmt(session.openingBalance)}</p>
                  </div>
                </div>
                <button onClick={() => setShowClose(true)}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold">
                  <Lock size={14} /> Fechar Caixa
                </button>
              </div>

              {/* Resumo do dia */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Total Vendas</p>
                  <p className="text-xl font-bold text-gray-800">{fmt(totalSales)}</p>
                  <p className="text-xs text-gray-400">{todaySales.length} vendas</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Em Dinheiro</p>
                  <p className="text-xl font-bold text-green-600">{fmt(cashSales)}</p>
                  <p className="text-xs text-gray-400">entra no caixa</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Saídas</p>
                  <p className="text-xl font-bold text-red-500">{fmt(totalExpenses)}</p>
                  <p className="text-xs text-gray-400">{session.expenses.length} lançamento(s)</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">Saldo Esperado</p>
                  <p className="text-xl font-bold text-blue-600">{fmt(expectedClosing)}</p>
                  <p className="text-xs text-gray-400">troco + dinheiro − saídas</p>
                </div>
              </div>

              {/* Formas de pagamento resumo */}
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Vendas por forma de pagamento</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-gray-400">Dinheiro</p>
                    <p className="font-bold text-gray-800">{fmt(cashSales)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">PIX</p>
                    <p className="font-bold text-gray-800">{fmt(pixSales)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Cartão</p>
                    <p className="font-bold text-gray-800">{fmt(cardSales)}</p>
                  </div>
                </div>
              </div>

              {/* Lançar saída */}
              <div className="bg-white border border-gray-100 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <TrendingDown size={16} className="text-red-500" /> Registrar Saída de Caixa
                </h3>
                <div className="flex gap-2">
                  <input value={expDesc} onChange={e => setExpDesc(e.target.value)}
                    placeholder="Descrição (ex: Compra de gás)"
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C542]" />
                  <input type="number" min={0} step="0.01" value={expAmount} onChange={e => setExpAmount(e.target.value)}
                    placeholder="R$ 0,00"
                    className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#F5C542]" />
                  <button onClick={addExpense} disabled={!expDesc.trim() || !expAmount}
                    className="bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-bold">
                    <Plus size={16} />
                  </button>
                </div>

                {session.expenses.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {session.expenses.map(e => (
                      <div key={e.id} className="flex items-center justify-between text-sm bg-red-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-gray-400" />
                          <span className="text-gray-400 text-xs">{e.time}</span>
                          <span className="text-gray-700">{e.description}</span>
                        </div>
                        <span className="font-semibold text-red-600">−{fmt(e.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Modal fechar caixa */}
          {showClose && session && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <Lock size={18} className="text-red-500" />
                    <h2 className="font-bold text-gray-800">Fechar Caixa</h2>
                  </div>
                  <button onClick={() => setShowClose(false)}><X size={20} className="text-gray-400" /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="bg-blue-50 rounded-xl p-3 text-sm">
                    <p className="text-blue-700 font-medium">Saldo esperado: <strong>{fmt(expectedClosing)}</strong></p>
                    <p className="text-blue-500 text-xs mt-0.5">Troco {fmt(session.openingBalance)} + Dinheiro {fmt(cashSales)} − Saídas {fmt(totalExpenses)}</p>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Valor contado no caixa (R$)</label>
                    <input type="number" min={0} step="0.01" value={countedAmount}
                      onChange={e => setCountedAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F5C542]" />
                  </div>

                  {countedAmount && (
                    <div className={`rounded-xl p-3 flex items-center gap-2 ${Math.abs(diff) < 0.01 ? 'bg-green-50' : diff > 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
                      {Math.abs(diff) < 0.01
                        ? <><CheckCircle size={16} className="text-green-500" /><span className="text-sm text-green-700 font-medium">Caixa fechado certinho!</span></>
                        : diff > 0
                        ? <><AlertTriangle size={16} className="text-blue-500" /><span className="text-sm text-blue-700 font-medium">Sobra de {fmt(diff)}</span></>
                        : <><AlertTriangle size={16} className="text-red-500" /><span className="text-sm text-red-700 font-medium">Falta de {fmt(Math.abs(diff))}</span></>
                      }
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">Observações</label>
                    <textarea value={closingNotes} onChange={e => setClosingNotes(e.target.value)}
                      placeholder="Opcional..."
                      rows={2}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#F5C542] resize-none" />
                  </div>

                  <button onClick={closeCaixa}
                    className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold text-sm">
                    Confirmar Fechamento
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'historico' && (
        <div className="space-y-3">
          {history.length === 0 && (
            <div className="text-center text-gray-400 py-12">
              <DollarSign size={40} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum caixa registrado ainda</p>
            </div>
          )}
          {history.map(s => {
            const exp = s.expenses.reduce((a, e) => a + e.amount, 0)
            const diff = s.closingCounted != null ? s.closingCounted - s.closingExpected : null
            return (
              <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-800">
                      {new Date(s.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                    </p>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${s.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {s.status === 'open' ? 'Aberto' : 'Fechado'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {diff != null && (
                      <div className={`text-right ${Math.abs(diff) < 0.01 ? 'text-green-600' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        <p className="text-sm font-bold">
                          {Math.abs(diff) < 0.01 ? '✓ Correto' : diff > 0 ? `+${fmt(diff)}` : fmt(diff)}
                        </p>
                        <p className="text-xs text-gray-400">diferença</p>
                      </div>
                    )}
                    <button
                      onClick={() => { deleteCashSession(s.id); reload() }}
                      className="text-red-300 hover:text-red-500 p-1">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="text-gray-400">Troco inicial</p>
                    <p className="font-semibold text-gray-700">{fmt(s.openingBalance)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Saídas</p>
                    <p className="font-semibold text-red-500">{fmt(exp)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Contado</p>
                    <p className="font-semibold text-gray-700">{s.closingCounted != null ? fmt(s.closingCounted) : '—'}</p>
                  </div>
                </div>
                {s.notes && <p className="text-xs text-gray-400 mt-2 border-t border-gray-50 pt-2">{s.notes}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
