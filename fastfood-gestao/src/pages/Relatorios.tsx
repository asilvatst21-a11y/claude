import { useState, useMemo } from 'react'
import { getSales, getPurchases } from '../store/storage'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { BarChart2, Trophy, ArrowUpDown } from 'lucide-react'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899']

const paymentLabel: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', cartao_debito: 'Débito', cartao_credito: 'Crédito'
}

export default function Relatorios() {
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [rankMonth, setRankMonth] = useState(now.getMonth())
  const [rankYear, setRankYear] = useState(now.getFullYear())
  const [rankSort, setRankSort] = useState<'qty' | 'revenue'>('qty')

  const allSales = getSales()
  const allPurchases = getPurchases()

  // Vendas mensais do ano
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const monthStr = `${selectedYear}-${String(i + 1).padStart(2, '0')}`
    const mSales = allSales.filter(s => s.date.startsWith(monthStr))
    const mPurchases = allPurchases.filter(p => p.date.startsWith(monthStr))
    const revenue = mSales.reduce((s, x) => s + x.total, 0)
    const cost = mPurchases.reduce((s, p) => s + p.totalValue, 0)
    return {
      name: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i],
      Receita: revenue,
      Compras: cost,
      Lucro: revenue - cost,
      pedidos: mSales.length,
    }
  })

  // Vendas por forma de pagamento (ano todo)
  const yearSales = allSales.filter(s => s.date.startsWith(String(selectedYear)))
  const paymentData = Object.entries(
    yearSales.reduce<Record<string, number>>((acc, s) => {
      acc[s.paymentMethod] = (acc[s.paymentMethod] || 0) + s.total
      return acc
    }, {})
  ).map(([key, value]) => ({ name: paymentLabel[key] || key, value }))

  // Produtos mais vendidos (ano)
  const productCount: Record<string, { name: string; qty: number; revenue: number }> = {}
  yearSales.forEach(s => {
    s.items.forEach(item => {
      if (!productCount[item.productId]) {
        productCount[item.productId] = { name: item.productName, qty: 0, revenue: 0 }
      }
      productCount[item.productId].qty += item.quantity
      productCount[item.productId].revenue += item.total
    })
  })
  const topProducts = Object.values(productCount)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8)

  // Ticket médio por dia da semana
  const weekdayData = Array.from({ length: 7 }, (_, i) => {
    const dayName = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][i]
    const daySales = yearSales.filter(s => new Date(s.date + 'T12:00:00').getDay() === i)
    const total = daySales.reduce((s, x) => s + x.total, 0)
    return { name: dayName, ticket: daySales.length > 0 ? total / daySales.length : 0, pedidos: daySales.length }
  })

  const totalYear = yearSales.reduce((s, x) => s + x.total, 0)
  const avgTicket = yearSales.length > 0 ? totalYear / yearSales.length : 0

  // Ranking mensal de produtos
  const rankMonthStr = `${rankYear}-${String(rankMonth + 1).padStart(2, '0')}`
  const rankSales = useMemo(() => allSales.filter(s => s.date.startsWith(rankMonthStr)), [allSales, rankMonthStr])
  const rankProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number; orders: number }> = {}
    for (const s of rankSales) {
      for (const item of s.items) {
        if (!map[item.productName]) map[item.productName] = { name: item.productName, qty: 0, revenue: 0, orders: 0 }
        map[item.productName].qty += item.quantity
        map[item.productName].revenue += item.total
        map[item.productName].orders++
      }
    }
    const totalRevenue = Object.values(map).reduce((s, p) => s + p.revenue, 0)
    return Object.values(map)
      .sort((a, b) => rankSort === 'qty' ? b.qty - a.qty : b.revenue - a.revenue)
      .map(p => ({ ...p, pct: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0 }))
  }, [rankSales, rankSort])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Relatórios</h1>
          <p className="text-gray-500 text-sm">{yearSales.length} vendas · ticket médio {fmt(avgTicket)}</p>
        </div>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
        >
          {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {yearSales.length === 0 ? (
        <div className="text-center py-20">
          <BarChart2 size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Nenhuma venda registrada em {selectedYear}.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Receita x Compras mensal */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Receita vs Compras Mensais</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend />
                <Bar dataKey="Receita" fill="#f97316" radius={[4,4,0,0]} />
                <Bar dataKey="Compras" fill="#ef4444" radius={[4,4,0,0]} />
                <Bar dataKey="Lucro" fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Formas de pagamento */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-700 mb-4">Por Forma de Pagamento</h2>
              {paymentData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-gray-400 text-sm text-center py-8">Sem dados</p>}
            </div>

            {/* Ticket médio por dia da semana */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-700 mb-4">Ticket Médio por Dia da Semana</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weekdayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `R$${v.toFixed(0)}`} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Line type="monotone" dataKey="ticket" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316' }} name="Ticket médio" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Produtos mais vendidos */}
          {topProducts.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-700 mb-4">Produtos Mais Vendidos</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v, name) => String(name) === 'revenue' ? fmt(Number(v)) : v} />
                  <Bar dataKey="qty" fill="#f97316" radius={[0,4,4,0]} name="Qtd vendida" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Ranking mensal de produtos */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                <Trophy size={16} className="text-yellow-500" /> Ranking de Produtos por Mês
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={rankMonth} onChange={e => setRankMonth(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-orange-400">
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select value={rankYear} onChange={e => setRankYear(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-orange-400">
                  {[now.getFullYear() - 1, now.getFullYear()].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button
                  onClick={() => setRankSort(s => s === 'qty' ? 'revenue' : 'qty')}
                  className="flex items-center gap-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 hover:bg-gray-50 text-gray-600">
                  <ArrowUpDown size={11} /> {rankSort === 'qty' ? 'Por qtd.' : 'Por receita'}
                </button>
              </div>
            </div>
            {rankProducts.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">Nenhuma venda em {MONTHS[rankMonth]} {rankYear}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100">
                    <tr className="text-xs text-gray-500 text-left">
                      <th className="pb-2 w-8">#</th>
                      <th className="pb-2">Produto</th>
                      <th className="pb-2 text-right">Qtd vendida</th>
                      <th className="pb-2 text-right">Faturamento</th>
                      <th className="pb-2 text-right hidden sm:table-cell">% do total</th>
                      <th className="pb-2 text-right hidden md:table-cell">Ticket médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankProducts.map((p, i) => (
                      <tr key={p.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="py-2.5">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-gray-400 text-xs pl-1">{i + 1}</span>}
                        </td>
                        <td className="py-2.5 font-medium text-gray-800 max-w-[140px] truncate">{p.name}</td>
                        <td className="py-2.5 text-right text-gray-600">{p.qty} un.</td>
                        <td className="py-2.5 text-right font-semibold text-green-600">{fmt(p.revenue)}</td>
                        <td className="py-2.5 text-right hidden sm:table-cell">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-400 rounded-full" style={{ width: `${p.pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-10 text-right">{p.pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-gray-500 hidden md:table-cell text-xs">{fmt(p.orders > 0 ? p.revenue / p.orders : 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200">
                    <tr>
                      <td colSpan={2} className="pt-2.5 text-xs font-semibold text-gray-500">{rankProducts.length} produtos</td>
                      <td className="pt-2.5 text-right text-xs font-semibold text-gray-700">
                        {rankProducts.reduce((s, p) => s + p.qty, 0)} un.
                      </td>
                      <td className="pt-2.5 text-right text-xs font-bold text-green-600">
                        {fmt(rankProducts.reduce((s, p) => s + p.revenue, 0))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Tabela resumo por mês */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Resumo Mensal</h2>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr className="text-xs text-gray-500 text-left">
                  <th className="pb-2">Mês</th>
                  <th className="pb-2 text-right">Pedidos</th>
                  <th className="pb-2 text-right">Receita</th>
                  <th className="pb-2 text-right">Compras</th>
                  <th className="pb-2 text-right">Lucro Bruto</th>
                  <th className="pb-2 text-right">Margem</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.filter(m => m.pedidos > 0 || m.Compras > 0).map((m, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-gray-700">{m.name}</td>
                    <td className="py-2 text-right text-gray-500">{m.pedidos}</td>
                    <td className="py-2 text-right text-green-600">{fmt(m.Receita)}</td>
                    <td className="py-2 text-right text-red-500">{fmt(m.Compras)}</td>
                    <td className={`py-2 text-right font-semibold ${m.Lucro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(m.Lucro)}</td>
                    <td className={`py-2 text-right text-xs ${m.Lucro >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                      {m.Receita > 0 ? `${((m.Lucro / m.Receita) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
