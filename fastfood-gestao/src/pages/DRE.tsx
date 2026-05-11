import { useState, useEffect } from 'react'
import { getFixedCosts, saveFixedCost, deleteFixedCost, getSales, getPurchases, id } from '../store/storage'
import type { FixedCost } from '../types'
import { Plus, Trash2, X, FileText, TrendingUp, TrendingDown } from 'lucide-react'

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

export default function DRE() {
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([])
  const [editCost, setEditCost] = useState<FixedCost | null>(null)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  useEffect(() => { setFixedCosts(getFixedCosts()) }, [])

  const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`

  const sales = getSales().filter(s => s.date.startsWith(monthStr))
  const purchases = getPurchases().filter(p => p.date.startsWith(monthStr))

  const revenue = sales.reduce((s, x) => s + x.total, 0)
  const cogs = purchases.reduce((s, p) => s + p.totalValue, 0)
  const grossProfit = revenue - cogs
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

  const activeFixedCosts = fixedCosts.filter(c => c.active)
  const totalFixed = activeFixedCosts.reduce((s, c) => s + c.monthlyValue, 0)
  const ebitda = grossProfit - totalFixed
  const netMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0

  const newCost = (): FixedCost => ({ id: id(), name: '', category: 'outro', monthlyValue: 0, active: true })

  function saveCost(c: FixedCost) {
    saveFixedCost(c)
    setFixedCosts(getFixedCosts())
    setEditCost(null)
  }

  function removeCost(cid: string) {
    deleteFixedCost(cid)
    setFixedCosts(getFixedCosts())
  }

  const paymentCount = sales.reduce((acc, s) => {
    acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + s.total
    return acc
  }, {} as Record<string, number>)

  const paymentLabel: Record<string, string> = {
    dinheiro: 'Dinheiro', pix: 'PIX', cartao_debito: 'Débito', cartao_credito: 'Crédito'
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">DRE — Demonstração do Resultado</h1>
        <p className="text-gray-500 text-sm">Visão financeira completa do período</p>
      </div>

      {/* Seletor de período */}
      <div className="flex items-center gap-3 mb-6">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
        >
          {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
        >
          {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">{sales.length} vendas · {purchases.length} compras</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DRE */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <FileText size={18} className="text-orange-500" /> {months[selectedMonth]} {selectedYear}
            </h2>

            {/* Receita Bruta */}
            <DRERow label="(+) Receita Bruta" value={revenue} total={revenue} highlight="green" bold />
            <div className="pl-4 space-y-1 mb-3">
              {Object.entries(paymentCount).map(([method, val]) => (
                <DRERow key={method} label={`  · ${paymentLabel[method] || method}`} value={val} total={revenue} small />
              ))}
            </div>

            <div className="border-t border-gray-100 my-3" />

            {/* CMV */}
            <DRERow label="(−) Custo das Mercadorias Vendidas (CMV)" value={-cogs} total={revenue} highlight="red" bold />
            <div className="pl-4 mb-3">
              <DRERow label="  · Compras do período" value={-cogs} total={revenue} small />
            </div>

            <DRERow label="(=) Lucro Bruto" value={grossProfit} total={revenue}
              bold highlight={grossProfit >= 0 ? 'green' : 'red'} border />
            <div className="pl-4 mb-3">
              <span className="text-xs text-gray-400">Margem bruta: {grossMargin.toFixed(1)}%</span>
            </div>

            <div className="border-t border-gray-100 my-3" />

            {/* Despesas fixas */}
            <DRERow label="(−) Despesas Operacionais Fixas" value={-totalFixed} total={revenue} highlight="red" bold />
            <div className="pl-4 space-y-1 mb-3">
              {activeFixedCosts.map(c => (
                <DRERow key={c.id} label={`  · ${c.name}`} value={-c.monthlyValue} total={revenue} small />
              ))}
              {activeFixedCosts.length === 0 && (
                <p className="text-xs text-gray-400">Nenhum custo fixo cadastrado</p>
              )}
            </div>

            <div className="border-t border-gray-200 my-3" />
            <DRERow label="(=) Resultado Operacional (EBITDA)" value={ebitda} total={revenue}
              bold highlight={ebitda >= 0 ? 'green' : 'red'} border big />
            <div className="pl-4">
              <span className="text-xs text-gray-400">Margem líquida: {netMargin.toFixed(1)}%</span>
            </div>
          </div>

          {/* Cards resumo */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl p-4 ${ebitda >= 0 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
              <div className="flex items-center gap-2 mb-1">
                {ebitda >= 0 ? <TrendingUp size={18} className="text-green-500" /> : <TrendingDown size={18} className="text-red-500" />}
                <span className="text-xs font-medium text-gray-500 uppercase">Resultado</span>
              </div>
              <p className={`text-2xl font-bold ${ebitda >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(ebitda)}</p>
              <p className="text-xs text-gray-400 mt-1">{netMargin.toFixed(1)}% de margem</p>
            </div>
            <div className="rounded-xl p-4 bg-blue-50 border border-blue-100">
              <div className="flex items-center gap-2 mb-1">
                <FileText size={18} className="text-blue-500" />
                <span className="text-xs font-medium text-gray-500 uppercase">Ponto de Equilíbrio</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {grossMargin > 0 ? fmt(totalFixed / (grossMargin / 100)) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">receita necessária para cobrir fixos</p>
            </div>
          </div>
        </div>

        {/* Gestão de custos fixos */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Custos Fixos Mensais</h2>
            <button
              onClick={() => setEditCost(newCost())}
              className="flex items-center gap-1 text-orange-500 hover:text-orange-700 text-sm font-medium"
            >
              <Plus size={16} /> Adicionar
            </button>
          </div>

          {editCost && (
            <div className="border border-orange-200 rounded-lg p-3 mb-4 bg-orange-50">
              <div className="flex justify-between mb-2">
                <span className="text-xs font-medium text-orange-700">Novo Custo</span>
                <button onClick={() => setEditCost(null)}><X size={14} className="text-gray-400" /></button>
              </div>
              <input
                placeholder="Nome (ex: Aluguel)"
                value={editCost.name}
                onChange={e => setEditCost({ ...editCost, name: e.target.value })}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none"
              />
              <select
                value={editCost.category}
                onChange={e => setEditCost({ ...editCost, category: e.target.value as FixedCost['category'] })}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none"
              >
                {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                type="number" placeholder="Valor mensal (R$)" min={0} step="0.01"
                value={editCost.monthlyValue || ''}
                onChange={e => setEditCost({ ...editCost, monthlyValue: parseFloat(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none"
              />
              <button
                onClick={() => saveCost(editCost)}
                className="w-full bg-orange-500 text-white rounded py-1.5 text-sm font-medium hover:bg-orange-600"
              >
                Salvar
              </button>
            </div>
          )}

          <div className="space-y-2">
            {fixedCosts.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={c.active}
                    onChange={() => { saveFixedCost({ ...c, active: !c.active }); setFixedCosts(getFixedCosts()) }}
                    className="accent-orange-500"
                  />
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

function DRERow({
  label, value, total, highlight, bold, border, small, big
}: {
  label: string
  value: number
  total: number
  highlight?: 'green' | 'red'
  bold?: boolean
  border?: boolean
  small?: boolean
  big?: boolean
}) {
  const colorClass = highlight === 'green'
    ? value >= 0 ? 'text-green-600' : 'text-red-600'
    : highlight === 'red'
    ? 'text-red-500'
    : 'text-gray-700'

  return (
    <div className={`flex items-center justify-between py-1 ${border ? 'border-t border-gray-200 pt-2 mt-1' : ''}`}>
      <span className={`${small ? 'text-xs text-gray-400' : 'text-sm text-gray-600'} ${bold ? 'font-semibold' : ''} ${big ? '!text-base !text-gray-800' : ''}`}>
        {label}
      </span>
      <div className="text-right">
        <span className={`${small ? 'text-xs' : 'text-sm'} font-${bold ? 'bold' : 'medium'} ${colorClass} ${big ? '!text-lg' : ''}`}>
          {value >= 0 ? '' : ''}{Math.abs(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
