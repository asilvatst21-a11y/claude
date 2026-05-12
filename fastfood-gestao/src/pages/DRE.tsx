import { useState, useEffect, useRef } from 'react'
import { getFixedCosts, saveFixedCost, deleteFixedCost, getSales, getPurchases, deletePurchase, id } from '../store/storage'
import type { FixedCost } from '../types'
import { Plus, Trash2, X, FileText, TrendingUp, FlaskConical, Settings, HelpCircle, Wallet, Banknote, Sparkles } from 'lucide-react'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const categoryOptions = [
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'pro_labore', label: 'Pró-Labore' },
  { value: 'energia', label: 'Energia Elétrica' },
  { value: 'agua', label: 'Água' },
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
  fixos: 'Despesas que você paga todo mês independente do volume de vendas: aluguel, salários, energia, etc.',
  ebitda: 'Resultado Operacional antes de impostos e depreciação. Indica se o negócio é operacionalmente lucrativo. Meta saudável para food: acima de 15%.',
  impostos: 'Estimativa de impostos sobre o lucro. Para Simples Nacional use 6%, Lucro Presumido use ~11%. Ajuste conforme seu regime tributário.',
  lucro_liquido: 'Lucro após impostos. É o que "sobra de verdade" para o sócio ou para reinvestir no negócio.',
  geracao_caixa: 'Lucro Líquido mais a depreciação (que é custo no papel, mas não sai do caixa). Representa o dinheiro que o negócio realmente gerou no período.',
  ponto_equilibrio: 'Receita mínima necessária para cobrir todos os custos fixos. Abaixo disso o negócio opera no prejuízo.',
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
      <button
        onClick={() => setOpen(o => !o)}
        className="text-gray-300 hover:text-gray-500 ml-1 align-middle"
      >
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

export default function DRE() {
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([])
  const [editCost, setEditCost] = useState<FixedCost | null>(null)
  const [tick, setTick] = useState(0)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const [sales, setSales] = useState(() => getSales())
  const [purchases, setPurchases] = useState(() => getPurchases())

  // Configurações DRE
  const [taxRate, setTaxRate] = useState(() => parseFloat(localStorage.getItem('ff_dre_tax') || '6'))
  const [depreciation, setDepreciation] = useState(() => parseFloat(localStorage.getItem('ff_dre_dep') || '0'))
  const [showConfig, setShowConfig] = useState(false)

  // Simulação (apenas visual — não cria dados reais)
  const [simTarget, setSimTarget] = useState(25)
  const [showSim, setShowSim] = useState(false)
  const [simActive, setSimActive] = useState(false)

  useEffect(() => {
    setFixedCosts(getFixedCosts())
    setSales(getSales())
    setPurchases(getPurchases())
  }, [tick, selectedMonth, selectedYear])

  function saveTaxRate(v: number) {
    setTaxRate(v)
    localStorage.setItem('ff_dre_tax', String(v))
  }
  function saveDepreciation(v: number) {
    setDepreciation(v)
    localStorage.setItem('ff_dre_dep', String(v))
  }

  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`
  const salesFiltered = sales.filter(s => s.date.startsWith(monthStr))
  const purchasesFiltered = purchases.filter(p => p.date.startsWith(monthStr))
  const simPurchasesInPeriod = purchasesFiltered.filter(p =>
    p.supplierName.toLowerCase().includes('simulação') || p.supplierName.toLowerCase().includes('simulacao')
  )

  const revenue = salesFiltered.reduce((s, x) => s + x.total, 0)
  const cogs = purchasesFiltered.reduce((s, p) => s + p.totalValue, 0)
  const grossProfit = revenue - cogs
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  const activeFixedCosts = fixedCosts.filter(c => c.active)
  const totalFixed = activeFixedCosts.reduce((s, c) => s + c.monthlyValue, 0)
  const ebitda = grossProfit - totalFixed
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0

  const taxes = ebitda > 0 ? ebitda * (taxRate / 100) : 0
  const netProfit = ebitda - taxes
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0
  const cashGeneration = netProfit + depreciation

  const newCost = (): FixedCost => ({ id: id(), name: '', category: 'outro', monthlyValue: 0, active: true })

  function clearSimData() {
    const simPurchases = getPurchases().filter(p =>
      p.supplierName.toLowerCase().includes('simulação') || p.supplierName.toLowerCase().includes('simulacao')
    )
    simPurchases.forEach(p => deletePurchase(p.id))
    if (simPurchases.length > 0) setTick(t => t + 1)
    return simPurchases.length
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

  const paymentCount = salesFiltered.reduce((acc, s) => {
    acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + s.total
    return acc
  }, {} as Record<string, number>)

  const paymentLabel: Record<string, string> = {
    dinheiro: 'Dinheiro', pix: 'PIX', cartao_debito: 'Débito', cartao_credito: 'Crédito'
  }

  // Projeção de cenário (visual apenas, não salva dados)
  const projRevenue = totalFixed > 0 ? totalFixed / (0.65 - simTarget / 100) : 0
  const projCogs = projRevenue * 0.35
  const projGrossProfit = projRevenue * 0.65
  const projEbitda = projRevenue * (simTarget / 100)
  const projEbitdaMargin = simTarget
  const projTaxes = projEbitda > 0 ? projEbitda * (taxRate / 100) : 0
  const projNetProfit = projEbitda - projTaxes

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">DRE — Demonstração do Resultado</h1>
          <p className="text-gray-500 text-sm">Visão financeira completa do período</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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

      {/* Painel de simulação — projeção visual, não altera dados */}
      {showSim && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-purple-500" />
              <p className="text-sm font-semibold text-purple-800">Projeção de Cenário — {months[selectedMonth]} {selectedYear}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSimActive(false); setShowSim(false) }}
                className="text-xs text-purple-500 hover:text-purple-700 underline">
                Desativar
              </button>
              <button onClick={() => setShowSim(false)}><X size={16} className="text-purple-400" /></button>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-purple-700 font-medium w-28 shrink-0">Meta EBITDA: <strong>{simTarget}%</strong></span>
            <input type="range" min={5} max={45} step={1} value={simTarget}
              onChange={e => { setSimTarget(Number(e.target.value)); setSimActive(true) }}
              className="flex-1 accent-purple-600" />
          </div>
          {totalFixed > 0 && (
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
                Margem EBITDA projetada: <strong>{projEbitdaMargin}%</strong> · Receita necessária: <strong>{fmt(projRevenue)}</strong>
              </p>
            </div>
          )}
          {totalFixed === 0 && (
            <p className="text-sm text-purple-600 text-center py-2">Cadastre os custos fixos para ver a projeção.</p>
          )}
        </div>
      )}

      {/* Seletor de período */}
      <div className="flex items-center gap-3 mb-6">
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
          <button
            onClick={() => { clearSimData(); }}
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

            {/* Receita Bruta */}
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

            {/* Despesas fixas */}
            <DRERow label="(−) Despesas Operacionais Fixas" value={-totalFixed} total={revenue} highlight="red" bold tip={<Tip id="fixos" />} />
            <div className="pl-4 space-y-1 mb-3">
              {activeFixedCosts.map(c => (
                <DRERow key={c.id} label={`· ${c.name}`} value={-c.monthlyValue} total={revenue} small />
              ))}
              {activeFixedCosts.length === 0 && (
                <p className="text-xs text-gray-400">Nenhum custo fixo cadastrado</p>
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
            <SummaryCard
              label="EBITDA" value={ebitda} margin={ebitdaMargin}
              icon={<TrendingUp size={16} />} positive={ebitda >= 0}
            />
            <SummaryCard
              label="Lucro Líquido" value={netProfit} margin={netMargin}
              icon={<Wallet size={16} />} positive={netProfit >= 0}
            />
            {depreciation > 0 && (
              <SummaryCard
                label="Geração de Caixa" value={cashGeneration} margin={revenue > 0 ? cashGeneration / revenue * 100 : 0}
                icon={<Banknote size={16} />} positive={cashGeneration >= 0}
              />
            )}
            <div className="rounded-xl p-4 bg-blue-50 border border-blue-100">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={16} className="text-blue-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Ponto Equilíbrio <Tip id="ponto_equilibrio" /></span>
              </div>
              <p className="text-lg font-bold text-blue-600">
                {grossMargin > 0 ? fmt(totalFixed / (grossMargin / 100)) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">receita mínima</p>
            </div>
          </div>
        </div>

        {/* Gestão de custos fixos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Custos Fixos Mensais</h2>
            <button onClick={() => setEditCost(newCost())}
              className="flex items-center gap-1 text-orange-500 hover:text-orange-700 text-sm font-medium">
              <Plus size={16} /> Adicionar
            </button>
          </div>

          {editCost && (
            <div className="border border-orange-200 rounded-lg p-3 mb-4 bg-orange-50">
              <div className="flex justify-between mb-2">
                <span className="text-xs font-medium text-orange-700">Novo Custo</span>
                <button onClick={() => setEditCost(null)}><X size={14} className="text-gray-400" /></button>
              </div>
              <input placeholder="Nome (ex: Aluguel)" value={editCost.name}
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
                  <span className={`text-sm font-semibold ${c.active ? 'text-red-500' : 'text-gray-300'}`}>
                    {fmt(c.monthlyValue)}
                  </span>
                  <button onClick={() => removeCost(c.id)} className="text-red-300 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {fixedCosts.length === 0 && (
              <p className="text-gray-400 text-xs text-center py-4">Nenhum custo cadastrado</p>
            )}
          </div>

          <div className="border-t border-gray-100 pt-3 mt-3 flex justify-between font-semibold">
            <span className="text-gray-700">Total mensal</span>
            <span className="text-red-500">{fmt(totalFixed)}</span>
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
