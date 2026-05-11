import { useState } from 'react'
import { getSales, getPurchases } from '../store/storage'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { BarChart2 } from 'lucide-react'

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
