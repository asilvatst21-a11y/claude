import { useState, useEffect, useRef } from 'react'
import { getFixedCosts, saveFixedCost, deleteFixedCost, getSales, getPurchases, deletePurchase, getVariableCostsForMonth, saveVariableCost, deleteVariableCost, id } from '../store/storage'
import type { FixedCost, VariableCost } from '../types'
import { Plus, Trash2, X, FileText, TrendingUp, FlaskConical, Settings, HelpCircle, Wallet, Banknote, Sparkles, Lock, Eye, EyeOff, KeyRound, Mail } from 'lucide-react'
import { sendDreResetCode, verifyDreResetCode } from '../store/supabase'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const categoryOptions = [
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'pro_labore', label: 'Pró-Labore' },
  { value: 'internet', label: 'Internet/Telefone' },
  { value: 'outro', label: 'Outro' },
]

const months = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

const TOOLTIPS: Record<string, string> = {
  receita: 'Total de dinheiro recebido pelas vendas do período, antes de qualquer desconto ou custo.',
  cmv: 'Custo das Mercadorias Vendidas: valor gasto na compra dos ingredientes e produtos vendidos. Quanto maior o CMV, menor a margem.',
  lucro_bruto: 'Receita menos o CMV. Mostra quanto sobra depois de pagar os produtos vendidos. É a base para cobrir as despesas fixas.',
  fixos: 'Despesas que você paga todo mês independente do volume de vendas: aluguel, salários, etc.',
  variaveis: 'Despesas que variam mês a mês: conta de luz, água, gás, manutenção, etc. Lançadas manualmente para cada período.',
  ebitda: 'Resultado Operacional antes de impostos e depreciação. Indica se o negócio é operacionalmente lucrativo. Meta saudável para food: acima de 15%.',
  impostos: 'Estimativa de impostos sobre o lucro. Para Simples Nacional use 6%, Lucro Presumido use ~11%. Ajuste conforme seu regime tributário.',
  lucro_liquido: 'Lucro após impostos. É o que "sobra de verdade" para o sócio ou para reinvestir no negócio.',
  geracao_caixa: 'Lucro Líquido mais a depreciação (que é custo no papel, mas não sai do caixa). Representa o dinheiro que o negócio realmente gerou no período.',
  ponto_equilibrio: 'Receita mínima necessária para cobrir todos os custos fixos e variáveis. Abaixo disso o negócio opera no prejuízo.',
}

function Tip({ id: tipId }: { id: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOut)
    return () => document.removeEventListener('mousedown', onClickOut)
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="text-gray-300 hover:text-gray-500 ml-1 align-middle">
        <HelpCircle size={13} />
      </button>
      {open && (
        <div className="absolute z-30 left-5 top-0 bg-gray-800 text-white text-xs rounded-xl p-3 w-56 shadow-xl leading-relaxed">
          {TOOLTIPS[tipId]}
        </div>
      )}
    </div>
  )
}

// ── Gate de senha ────────────────────────────────────────────────────────────
type GateRenderProps = { lock: () => void; openSetup: () => void }

function DREGate({ render }: { render: (p: GateRenderProps) => React.ReactNode }) {
  const PASSWORD_KEY = 'ff_dre_password'

  const stored = localStorage.getItem(PASSWORD_KEY)
  // Sempre começa bloqueado ao montar (navegar para a aba) se senha estiver configurada
  const [unlocked, setUnlocked] = useState(!stored)
  const [input, setInput] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [error, setError] = useState(false)

  // Modal de configurar/alterar senha
  const [showSetup, setShowSetup] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [setupError, setSetupError] = useState('')
  const [showNewPwd, setShowNewPwd] = useState(false)

  // Redefinição via e-mail (OTP)
  type ResetStep = 'idle' | 'code' | 'newpwd'
  const [resetStep, setResetStep] = useState<ResetStep>('idle')
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetNewPwd, setResetNewPwd] = useState('')
  const [resetConfirmPwd, setResetConfirmPwd] = useState('')
  const [showResetPwd, setShowResetPwd] = useState(false)

  async function openReset() {
    setResetCode(''); setResetError(''); setResetNewPwd(''); setResetConfirmPwd('')
    setResetLoading(true)
    setResetStep('code')
    const { error, email } = await sendDreResetCode()
    setResetLoading(false)
    if (error) { setResetError(error); return }
    setResetEmail(email!)
  }
  function closeReset() { setResetStep('idle'); setResetCode(''); setResetError('') }

  async function handleVerifyCode() {
    setResetError('')
    setResetLoading(true)
    const { error } = await verifyDreResetCode(resetEmail, resetCode.trim())
    setResetLoading(false)
    if (error) { setResetError('Código inválido ou expirado'); return }
    setResetStep('newpwd')
  }

  function handleSaveNewDrePwd() {
    if (resetNewPwd.length < 4) { setResetError('Mínimo 4 caracteres'); return }
    if (resetNewPwd !== resetConfirmPwd) { setResetError('As senhas não coincidem'); return }
    localStorage.setItem(PASSWORD_KEY, resetNewPwd)
    closeReset()
    setUnlocked(true)
  }

  function tryUnlock() {
    const pwd = localStorage.getItem(PASSWORD_KEY)
    if (input === pwd) {
      setUnlocked(true)
      setError(false)
    } else {
      setError(true)
      setInput('')
      setTimeout(() => setError(false), 1500)
    }
  }

  function lock() {
    setUnlocked(false)
    setInput('')
  }

  function savePassword() {
    if (newPwd.length < 4) { setSetupError('Mínimo 4 caracteres'); return }
    if (newPwd !== confirmPwd) { setSetupError('As senhas não coincidem'); return }
    localStorage.setItem(PASSWORD_KEY, newPwd)
    setShowSetup(false)
    setNewPwd('')
    setConfirmPwd('')
    setSetupError('')
  }

  function removePassword() {
    if (!confirm('Remover a proteção por senha do DRE?')) return
    localStorage.removeItem(PASSWORD_KEY)
    setShowSetup(false)
  }

  // Tela de bloqueio
  if (!unlocked) {
    return (
      <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-orange-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-800 mb-1">DRE Protegido</h2>
          <p className="text-sm text-gray-400 mb-6">Digite a senha para acessar os dados financeiros</p>
          <div className="relative mb-3">
            <input
              type={showInput ? 'text' : 'password'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && tryUnlock()}
              placeholder="Senha"
              autoFocus
              className={`w-full border-2 rounded-xl px-4 py-3 text-center text-lg tracking-widest focus:outline-none transition-colors ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-orange-400'}`}
            />
            <button
              type="button"
              onClick={() => setShowInput(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              {showInput ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mb-3">Senha incorreta</p>}
          <button
            onClick={tryUnlock}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold text-sm"
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={openReset}
            className="mt-3 text-xs text-gray-400 hover:text-orange-500 transition-colors"
          >
            Esqueci a senha do DRE
          </button>
        </div>
      </div>

      {/* Modal de reset via e-mail OTP */}
      {resetStep !== 'idle' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-orange-500" />
                <h2 className="font-bold text-gray-800">Redefinir senha do DRE</h2>
              </div>
              <button onClick={closeReset}><X size={20} className="text-gray-400" /></button>
            </div>

            {resetStep === 'code' && (
              <>
                <div className="flex items-start gap-2 bg-orange-50 rounded-xl p-3 mb-4">
                  <Mail size={15} className="text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-700">
                    Código enviado para <strong>{resetEmail}</strong>. Verifique sua caixa de entrada e insira o código de 6 dígitos.
                  </p>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={resetCode}
                  onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyCode()}
                  placeholder="00000000"
                  autoFocus
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-orange-400 mb-3"
                />
                {resetError && <p className="text-xs text-red-500 mb-3">{resetError}</p>}
                <button
                  onClick={handleVerifyCode}
                  disabled={resetLoading || resetCode.length < 8}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white py-2.5 rounded-xl font-bold text-sm"
                >
                  {resetLoading ? 'Verificando...' : 'Confirmar código'}
                </button>
              </>
            )}

            {resetStep === 'newpwd' && (
              <>
                <p className="text-xs text-gray-500 mb-4">Identidade confirmada. Defina a nova senha do DRE.</p>
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type={showResetPwd ? 'text' : 'password'}
                      value={resetNewPwd}
                      onChange={e => setResetNewPwd(e.target.value)}
                      placeholder="Nova senha (mín. 4 caracteres)"
                      autoFocus
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-orange-400"
                    />
                    <button type="button" onClick={() => setShowResetPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showResetPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <input
                    type={showResetPwd ? 'text' : 'password'}
                    value={resetConfirmPwd}
                    onChange={e => setResetConfirmPwd(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveNewDrePwd()}
                    placeholder="Confirmar nova senha"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                  />
                  {resetError && <p className="text-xs text-red-500">{resetError}</p>}
                  <button
                    onClick={handleSaveNewDrePwd}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl font-bold text-sm"
                  >
                    Salvar nova senha
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      </>
    )
  }

  return (
    <>
      {/* Botões de senha no canto — injetados via contexto de layout */}
      <div className="hidden" id="dre-lock-controls">
        <button onClick={lock}><Lock size={15} /> Bloquear</button>
        <button onClick={() => setShowSetup(true)}><Settings size={15} /> Senha</button>
      </div>

      {/* Modal de configurar senha */}
      {showSetup && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800">Configurar senha do DRE</h2>
              <button onClick={() => { setShowSetup(false); setNewPwd(''); setConfirmPwd(''); setSetupError('') }}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="Nova senha (mín. 4 caracteres)"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
                />
                <button type="button" onClick={() => setShowNewPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showNewPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <input
                type={showNewPwd ? 'text' : 'password'}
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && savePassword()}
                placeholder="Confirmar senha"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-400"
              />
              {setupError && <p className="text-xs text-red-500">{setupError}</p>}
              <button onClick={savePassword} className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl font-bold text-sm">
                Salvar senha
              </button>
              {localStorage.getItem(PASSWORD_KEY) && (
                <button onClick={removePassword} className="w-full text-xs text-red-400 hover:text-red-600 underline pt-1">
                  Remover proteção por senha
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {render({ lock, openSetup: () => setShowSetup(true) })}
    </>
  )
}

// ── DRE principal ─────────────────────────────────────────────────────────────
export default function DRE() {
  return (
    <DREGate render={({ lock, openSetup }) => (
      <DREContent lock={lock} openSetup={openSetup} />
    )} />
  )
}

function DREContent({ lock, openSetup }: { lock: () => void; openSetup: () => void }) {
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([])
  const [editCost, setEditCost] = useState<FixedCost | null>(null)
  const [tick, setTick] = useState(0)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const [sales, setSales] = useState(() => getSales())
  const [purchases, setPurchases] = useState(() => getPurchases())

  // Custos variáveis do mês
  const [variableCosts, setVariableCosts] = useState<VariableCost[]>([])
  const [editVarCost, setEditVarCost] = useState<Partial<VariableCost> | null>(null)

  // Configurações DRE
  const [taxRate, setTaxRate] = useState(() => parseFloat(localStorage.getItem('ff_dre_tax') || '6'))
  const [depreciation, setDepreciation] = useState(() => parseFloat(localStorage.getItem('ff_dre_dep') || '0'))
  const [showConfig, setShowConfig] = useState(false)

  // Simulação
  const [simTarget, setSimTarget] = useState(25)
  const [showSim, setShowSim] = useState(false)
  const [simActive, setSimActive] = useState(false)

  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`

  useEffect(() => {
    setFixedCosts(getFixedCosts())
    setSales(getSales())
    setPurchases(getPurchases())
    setVariableCosts(getVariableCostsForMonth(monthStr))
  }, [tick, monthStr])

  function saveTaxRate(v: number) { setTaxRate(v); localStorage.setItem('ff_dre_tax', String(v)) }
  function saveDepreciation(v: number) { setDepreciation(v); localStorage.setItem('ff_dre_dep', String(v)) }

  const salesFiltered = sales.filter(s => s.date.startsWith(monthStr))
  const purchasesFiltered = purchases.filter(p => p.date.startsWith(monthStr))
  const simPurchasesInPeriod = purchasesFiltered.filter(p =>
    p.supplierName.toLowerCase().includes('simulação') || p.supplierName.toLowerCase().includes('simulacao')
  )

  const revenue    = salesFiltered.reduce((s, x) => s + x.total, 0)
  const cogs       = purchasesFiltered.reduce((s, p) => s + p.totalValue, 0)
  const grossProfit = revenue - cogs
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  const activeFixedCosts = fixedCosts.filter(c => c.active)
  const totalFixed    = activeFixedCosts.reduce((s, c) => s + c.monthlyValue, 0)
  const totalVariable = variableCosts.reduce((s, c) => s + c.value, 0)
  const totalCosts    = totalFixed + totalVariable

  const ebitda      = grossProfit - totalFixed - totalVariable
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0
  const taxes       = ebitda > 0 ? ebitda * (taxRate / 100) : 0
  const netProfit   = ebitda - taxes
  const netMargin   = revenue > 0 ? (netProfit / revenue) * 100 : 0
  const cashGeneration = netProfit + depreciation

  const newCost = (): FixedCost => ({ id: id(), name: '', category: 'outro', monthlyValue: 0, active: true })

  function clearSimData() {
    const simPurchases = getPurchases().filter(p =>
      p.supplierName.toLowerCase().includes('simulação') || p.supplierName.toLowerCase().includes('simulacao')
    )
    simPurchases.forEach(p => deletePurchase(p.id))
    if (simPurchases.length > 0) setTick(t => t + 1)
  }

  function saveCost(c: FixedCost) {
    saveFixedCost(c)
    setFixedCosts(getFixedCosts())
    setEditCost(null)
  }

  function removeCost(cid: string) {
    deleteFixedCost(cid)
    setFixedCosts(getFixedCosts())
  }

  function saveVarCost() {
    if (!editVarCost?.name || !editVarCost.value) return
    const cost: VariableCost = {
      id: editVarCost.id || id(),
      name: editVarCost.name,
      value: editVarCost.value,
      month: monthStr,
    }
    saveVariableCost(cost)
    setVariableCosts(getVariableCostsForMonth(monthStr))
    setEditVarCost(null)
  }

  function removeVarCost(vid: string) {
    deleteVariableCost(vid)
    setVariableCosts(getVariableCostsForMonth(monthStr))
  }

  const paymentCount = salesFiltered.reduce((acc, s) => {
    acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + s.total
    return acc
  }, {} as Record<string, number>)

  const paymentLabel: Record<string, string> = {
    dinheiro: 'Dinheiro', pix: 'PIX', cartao_debito: 'Débito', cartao_credito: 'Crédito'
  }

  const projRevenue     = totalCosts > 0 ? totalCosts / (0.65 - simTarget / 100) : 0
  const projCogs        = projRevenue * 0.35
  const projGrossProfit = projRevenue * 0.65
  const projEbitda      = projRevenue * (simTarget / 100)
  const projTaxes       = projEbitda > 0 ? projEbitda * (taxRate / 100) : 0
  const projNetProfit   = projEbitda - projTaxes

  const hasPwd = !!localStorage.getItem('ff_dre_password')

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">DRE — Demonstração do Resultado</h1>
          <p className="text-gray-500 text-sm">Visão financeira completa do período</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => openSetup()}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm font-medium">
            <Lock size={15} /> {hasPwd ? 'Senha' : 'Proteger'}
          </button>
          {hasPwd && (
            <button onClick={lock}
              className="flex items-center gap-2 border border-orange-200 text-orange-600 hover:bg-orange-50 px-3 py-2 rounded-xl text-sm font-medium">
              <Lock size={15} /> Bloquear
            </button>
          )}
          <button onClick={() => setShowConfig(s => !s)}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-xl text-sm font-medium">
            <Settings size={15} /> Configurar
          </button>
          <button onClick={() => { setSimActive(s => !s); setShowSim(true) }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${simActive ? 'bg-purple-600 text-white hover:bg-purple-700' : 'border border-purple-300 text-purple-600 hover:bg-purple-50'}`}>
            <FlaskConical size={15} /> {simActive ? 'Simulação ativa' : 'Simular Cenário'}
          </button>
        </div>
      </div>

      {/* Painel de configuração */}
      {showConfig && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5">
              Taxa de impostos (%) <Tip id="impostos" />
            </label>
            <div className="flex items-center gap-2">
              <input type="range" min={0} max={30} step={0.5} value={taxRate}
                onChange={e => saveTaxRate(parseFloat(e.target.value))}
                className="flex-1 accent-orange-500" />
              <span className="text-sm font-bold text-gray-700 w-12 text-right">{taxRate.toFixed(1)}%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Simples Nacional ≈ 6% · Lucro Presumido ≈ 11%</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5">
              Depreciação mensal (R$) <Tip id="geracao_caixa" />
            </label>
            <input type="number" min={0} step={50} value={depreciation || ''}
              onChange={e => saveDepreciation(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
            <p className="text-xs text-gray-400 mt-1">Equipamentos, utensílios, reforma, etc.</p>
          </div>
        </div>
      )}

      {/* Painel de simulação */}
      {showSim && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-purple-500" />
              <p className="text-sm font-semibold text-purple-800">Projeção de Cenário — {months[selectedMonth]} {selectedYear}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setSimActive(false); setShowSim(false) }} className="text-xs text-purple-500 hover:text-purple-700 underline">Desativar</button>
              <button onClick={() => setShowSim(false)}><X size={16} className="text-purple-400" /></button>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-purple-700 font-medium w-28 shrink-0">Meta EBITDA: <strong>{simTarget}%</strong></span>
            <input type="range" min={5} max={45} step={1} value={simTarget}
              onChange={e => { setSimTarget(Number(e.target.value)); setSimActive(true) }}
              className="flex-1 accent-purple-600" />
          </div>
          {totalCosts > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-purple-200">
                    <th className="text-left pb-1.5 font-medium">Linha</th>
                    <th className="text-right pb-1.5 font-medium text-gray-700">Real</th>
                    <th className="text-right pb-1.5 font-medium text-purple-700">Projetado</th>
                    <th className="text-right pb-1.5 font-medium">Diferença</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-100">
                  {[
                    { label: 'Receita', real: revenue, proj: projRevenue },
                    { label: 'CMV (35%)', real: cogs, proj: projCogs },
                    { label: 'Lucro Bruto', real: grossProfit, proj: projGrossProfit },
                    { label: 'Custos Fixos', real: totalFixed, proj: totalFixed },
                    { label: 'Custos Variáveis', real: totalVariable, proj: totalVariable },
                    { label: 'EBITDA', real: ebitda, proj: projEbitda, highlight: true },
                    { label: 'Lucro Líquido', real: netProfit, proj: projNetProfit },
                  ].map(row => (
                    <tr key={row.label} className={row.highlight ? 'font-bold' : ''}>
                      <td className="py-1.5 text-gray-600">{row.label}</td>
                      <td className="py-1.5 text-right text-gray-700">{fmt(row.real)}</td>
                      <td className="py-1.5 text-right text-purple-700">{fmt(row.proj)}</td>
                      <td className={`py-1.5 text-right ${row.proj - row.real >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {row.proj - row.real >= 0 ? '+' : ''}{fmt(row.proj - row.real)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-purple-500 mt-2 text-center">
                Margem EBITDA projetada: <strong>{simTarget}%</strong> · Receita necessária: <strong>{fmt(projRevenue)}</strong>
              </p>
            </div>
          )}
          {totalCosts === 0 && (
            <p className="text-sm text-purple-600 text-center py-2">Cadastre os custos para ver a projeção.</p>
          )}
        </div>
      )}

      {/* Seletor de período */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400">
          {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400">
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">{salesFiltered.length} vendas · {purchasesFiltered.length} compras</span>
        {simPurchasesInPeriod.length > 0 && (
          <button onClick={clearSimData}
            className="flex items-center gap-1.5 text-xs text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg ml-auto">
            <Trash2 size={12} /> Limpar {simPurchasesInPeriod.length} compra(s) de simulação
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DRE */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                <FileText size={18} className="text-orange-500" /> {months[selectedMonth]} {selectedYear}
              </h2>
              {simActive && (
                <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                  <Sparkles size={11} /> Projeção: meta {simTarget}%
                </span>
              )}
            </div>

            {/* Receita */}
            <DRERow label="(+) Receita Bruta" value={revenue} total={revenue} highlight="green" bold tip={<Tip id="receita" />} />
            <div className="pl-4 space-y-1 mb-3">
              {Object.entries(paymentCount).map(([method, val]) => (
                <DRERow key={method} label={`· ${paymentLabel[method] || method}`} value={val} total={revenue} small />
              ))}
            </div>

            <div className="border-t border-gray-100 my-3" />

            {/* CMV */}
            <DRERow label="(−) Custo das Mercadorias (CMV)" value={-cogs} total={revenue} highlight="red" bold tip={<Tip id="cmv" />} />
            <div className="pl-4 mb-3">
              <DRERow label="· Compras do período" value={-cogs} total={revenue} small />
            </div>

            <DRERow label="(=) Lucro Bruto" value={grossProfit} total={revenue}
              bold highlight={grossProfit >= 0 ? 'green' : 'red'} border tip={<Tip id="lucro_bruto" />} />
            <div className="pl-4 mb-3">
              <span className="text-xs text-gray-400">Margem bruta: {grossMargin.toFixed(1)}%</span>
            </div>

            <div className="border-t border-gray-100 my-3" />

            {/* Despesas Fixas */}
            <DRERow label="(−) Despesas Operacionais Fixas" value={-totalFixed} total={revenue} highlight="red" bold tip={<Tip id="fixos" />} />
            <div className="pl-4 space-y-1 mb-3">
              {activeFixedCosts.map(c => (
                <DRERow key={c.id} label={`· ${c.name}`} value={-c.monthlyValue} total={revenue} small />
              ))}
              {activeFixedCosts.length === 0 && (
                <p className="text-xs text-gray-400">Nenhum custo fixo cadastrado</p>
              )}
            </div>

            {/* Despesas Variáveis */}
            <DRERow label="(−) Despesas Variáveis do Mês" value={-totalVariable} total={revenue} highlight="red" bold tip={<Tip id="variaveis" />} />
            <div className="pl-4 space-y-1 mb-3">
              {variableCosts.map(c => (
                <DRERow key={c.id} label={`· ${c.name}`} value={-c.value} total={revenue} small />
              ))}
              {variableCosts.length === 0 && (
                <p className="text-xs text-gray-400">Nenhuma despesa variável lançada para {months[selectedMonth]}</p>
              )}
            </div>

            <div className="border-t border-gray-200 my-3" />
            <DRERow label="(=) EBITDA — Resultado Operacional" value={ebitda} total={revenue}
              bold highlight={ebitda >= 0 ? 'green' : 'red'} border big tip={<Tip id="ebitda" />} />
            <div className="pl-4 mb-4">
              <span className="text-xs text-gray-400">Margem EBITDA: {ebitdaMargin.toFixed(1)}%</span>
            </div>

            <div className="border-t border-gray-100 my-3" />

            {/* Impostos */}
            <DRERow label={`(−) Provisão de Impostos (${taxRate}%)`} value={-taxes} total={revenue} highlight="red" bold tip={<Tip id="impostos" />} />
            <div className="pl-4 mb-3">
              <span className="text-xs text-gray-400">Regime tributário configurável em "Configurar"</span>
            </div>

            <DRERow label="(=) Lucro Líquido" value={netProfit} total={revenue}
              bold highlight={netProfit >= 0 ? 'green' : 'red'} border big tip={<Tip id="lucro_liquido" />} />
            <div className="pl-4 mb-4">
              <span className="text-xs text-gray-400">Margem líquida: {netMargin.toFixed(1)}%</span>
            </div>

            {depreciation > 0 && (
              <>
                <div className="border-t border-gray-100 my-3" />
                <DRERow label="(+) Depreciação (não-caixa)" value={depreciation} total={revenue} bold />
                <div className="border-t border-gray-200 my-3" />
                <DRERow label="(=) Geração de Caixa Operacional" value={cashGeneration} total={revenue}
                  bold highlight={cashGeneration >= 0 ? 'green' : 'red'} border big tip={<Tip id="geracao_caixa" />} />
              </>
            )}
          </div>

          {/* Cards resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="EBITDA" value={ebitda} margin={ebitdaMargin} icon={<TrendingUp size={16} />} positive={ebitda >= 0} />
            <SummaryCard label="Lucro Líquido" value={netProfit} margin={netMargin} icon={<Wallet size={16} />} positive={netProfit >= 0} />
            {depreciation > 0 && (
              <SummaryCard label="Geração de Caixa" value={cashGeneration} margin={revenue > 0 ? cashGeneration / revenue * 100 : 0} icon={<Banknote size={16} />} positive={cashGeneration >= 0} />
            )}
            <div className="rounded-xl p-4 bg-blue-50 border border-blue-100">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={16} className="text-blue-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Ponto Equilíbrio <Tip id="ponto_equilibrio" /></span>
              </div>
              <p className="text-lg font-bold text-blue-600">
                {grossMargin > 0 ? fmt(totalCosts / (grossMargin / 100)) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">receita mínima</p>
            </div>
          </div>
        </div>

        {/* Painel lateral */}
        <div className="space-y-4">
          {/* Custos Fixos */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-fit">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700 text-sm">Custos Fixos Mensais</h2>
              <button onClick={() => setEditCost(newCost())}
                className="flex items-center gap-1 text-orange-500 hover:text-orange-700 text-sm font-medium">
                <Plus size={16} /> Adicionar
              </button>
            </div>

            {editCost && (
              <div className="border border-orange-200 rounded-lg p-3 mb-4 bg-orange-50">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-medium text-orange-700">Novo Custo Fixo</span>
                  <button onClick={() => setEditCost(null)}><X size={14} className="text-gray-400" /></button>
                </div>
                <input placeholder="Nome (ex: Aluguel, Pró-labore)" value={editCost.name}
                  onChange={e => setEditCost({ ...editCost, name: e.target.value })}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none" />
                <select value={editCost.category}
                  onChange={e => setEditCost({ ...editCost, category: e.target.value as FixedCost['category'] })}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none">
                  {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input type="number" placeholder="Valor mensal (R$)" min={0} step="0.01"
                  value={editCost.monthlyValue || ''}
                  onChange={e => setEditCost({ ...editCost, monthlyValue: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none" />
                <button onClick={() => saveCost(editCost)}
                  className="w-full bg-orange-500 text-white rounded py-1.5 text-sm font-medium hover:bg-orange-600">
                  Salvar
                </button>
              </div>
            )}

            <div className="space-y-2">
              {fixedCosts.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={c.active}
                      onChange={() => { saveFixedCost({ ...c, active: !c.active }); setFixedCosts(getFixedCosts()) }}
                      className="accent-orange-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">{c.name}</p>
                      <p className="text-xs text-gray-400">{categoryOptions.find(o => o.value === c.category)?.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${c.active ? 'text-red-500' : 'text-gray-300'}`}>{fmt(c.monthlyValue)}</span>
                    <button onClick={() => removeCost(c.id)} className="text-red-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {fixedCosts.length === 0 && <p className="text-gray-400 text-xs text-center py-4">Nenhum custo fixo cadastrado</p>}
            </div>

            <div className="border-t border-gray-100 pt-3 mt-3 flex justify-between font-semibold">
              <span className="text-gray-700 text-sm">Total fixo</span>
              <span className="text-red-500">{fmt(totalFixed)}</span>
            </div>
          </div>

          {/* Custos Variáveis do Mês */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-fit">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-700 text-sm">Despesas Variáveis</h2>
              <button onClick={() => setEditVarCost({ name: '', value: 0 })}
                className="flex items-center gap-1 text-blue-500 hover:text-blue-700 text-sm font-medium">
                <Plus size={16} /> Adicionar
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Luz, água, gás, manutenção — varia por mês</p>

            {editVarCost && (
              <div className="border border-blue-200 rounded-lg p-3 mb-4 bg-blue-50">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-medium text-blue-700">{months[selectedMonth]} {selectedYear}</span>
                  <button onClick={() => setEditVarCost(null)}><X size={14} className="text-gray-400" /></button>
                </div>
                <input placeholder="Nome (ex: Conta de Luz)" value={editVarCost.name || ''}
                  onChange={e => setEditVarCost({ ...editVarCost, name: e.target.value })}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none" />
                <input type="number" placeholder="Valor (R$)" min={0} step="0.01"
                  value={editVarCost.value || ''}
                  onChange={e => setEditVarCost({ ...editVarCost, value: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none" />
                <button onClick={saveVarCost}
                  className="w-full bg-blue-500 text-white rounded py-1.5 text-sm font-medium hover:bg-blue-600">
                  Salvar
                </button>
              </div>
            )}

            <div className="space-y-2">
              {variableCosts.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm font-medium text-gray-700">{c.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-red-500">{fmt(c.value)}</span>
                    <button onClick={() => removeVarCost(c.id)} className="text-red-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
              {variableCosts.length === 0 && (
                <p className="text-gray-400 text-xs text-center py-4">Nenhuma despesa variável em {months[selectedMonth]}</p>
              )}
            </div>

            {variableCosts.length > 0 && (
              <div className="border-t border-gray-100 pt-3 mt-3 flex justify-between font-semibold">
                <span className="text-gray-700 text-sm">Total variável</span>
                <span className="text-red-500">{fmt(totalVariable)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, margin, icon, positive }: {
  label: string; value: number; margin: number; icon: React.ReactNode; positive: boolean
}) {
  return (
    <div className={`rounded-xl p-4 ${positive ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={positive ? 'text-green-500' : 'text-red-500'}>{icon}</span>
        <span className="text-xs font-medium text-gray-500 uppercase">{label}</span>
      </div>
      <p className={`text-lg font-bold ${positive ? 'text-green-600' : 'text-red-600'}`}>{fmt(value)}</p>
      <p className="text-xs text-gray-400 mt-0.5">{margin.toFixed(1)}% margem</p>
    </div>
  )
}

function DRERow({
  label, value, total, highlight, bold, border, small, big, tip
}: {
  label: string; value: number; total: number
  highlight?: 'green' | 'red'; bold?: boolean; border?: boolean
  small?: boolean; big?: boolean; tip?: React.ReactNode
}) {
  const colorClass = highlight === 'green'
    ? value >= 0 ? 'text-green-600' : 'text-red-600'
    : highlight === 'red' ? 'text-red-500' : 'text-gray-700'

  return (
    <div className={`flex items-center justify-between py-1 ${border ? 'border-t border-gray-200 pt-2 mt-1' : ''}`}>
      <span className={`${small ? 'text-xs text-gray-400' : 'text-sm text-gray-600'} ${bold ? 'font-semibold' : ''} ${big ? '!text-base !text-gray-800' : ''} flex items-center`}>
        {label}{tip}
      </span>
      <div className="text-right">
        <span className={`${small ? 'text-xs' : 'text-sm'} font-${bold ? 'bold' : 'medium'} ${colorClass} ${big ? '!text-lg' : ''}`}>
          {Math.abs(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </span>
        {!small && total > 0 && (
          <span className="text-xs text-gray-300 ml-2">
            {((Math.abs(value) / total) * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}
