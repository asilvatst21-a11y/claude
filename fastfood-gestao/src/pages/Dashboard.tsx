import { useMemo } from 'react'
import { getSales, getIngredients, getPurchases, getFixedCosts } from '../store/storage'
import { ShoppingCart, DollarSign, Package, AlertTriangle, TrendingUp, Clock } from 'lucide-react'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

export default function Dashboard() {
  const sales = getSales()
  const ingredients = getIngredients()
  const purchases = getPurchases()
  const fixedCosts = getFixedCosts()

  const todaySales = useMemo(() => sales.filter(s => s.date === today()), [sales])
  const monthSales = useMemo(() => sales.filter(s => s.date.startsWith(thisMonth())), [sales])

  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0)
  const monthRevenue = monthSales.reduce((s, x) => s + x.total, 0)
  const todayOrders = todaySales.length
  const monthOrders = monthSales.length

  const lowStock = ingredients.filter(i => i.currentStock <= i.minStock)

  const monthPurchases = purchases
    .filter(p => p.date.startsWith(thisMonth()))
    .reduce((s, p) => s + p.totalValue, 0)

  const monthFixedCosts = fixedCosts
    .filter(c => c.active)
    .reduce((s, c) => s + c.monthlyValue, 0)

  const monthProfit = monthRevenue - monthPurchases - monthFixedCosts

  const recentSales = [...sales]
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
    .slice(0, 8)

  const paymentLabels: Record<string, string> = {
    dinheiro: 'Dinheiro',
    cartao_debito: 'Débito',
    cartao_credito: 'Crédito',
    pix: 'PIX',
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 text-sm">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card icon={<ShoppingCart className="text-orange-500" size={22} />} label="Vendas Hoje" value={String(todayOrders)} sub="pedidos" bg="bg-orange-50" />
        <Card icon={<DollarSign className="text-green-500" size={22} />} label="Faturamento Hoje" value={fmt(todayRevenue)} sub={`${monthOrders} pedidos no mês`} bg="bg-green-50" />
        <Card icon={<TrendingUp className="text-blue-500" size={22} />} label="Faturamento Mês" value={fmt(monthRevenue)} sub="mês atual" bg="bg-blue-50" />
        <Card
          icon={<DollarSign className={monthProfit >= 0 ? 'text-emerald-500' : 'text-red-500'} size={22} />}
          label="Lucro Estimado Mês"
          value={fmt(monthProfit)}
          sub="receita − compras − fixos"
          bg={monthProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Últimas vendas */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Clock size={16} /> Últimos Pedidos
          </h2>
          {recentSales.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Nenhuma venda registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {recentSales.map(sale => (
                <div key={sale.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {sale.items.map(i => `${i.quantity}x ${i.productName}`).join(', ')}
                    </p>
                    <p className="text-xs text-gray-400">
                      {sale.date} {sale.time} · {paymentLabels[sale.paymentMethod]}
                    </p>
                  </div>
                  <span className="font-semibold text-green-600">{fmt(sale.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-yellow-500" /> Estoque Crítico
            </h2>
            {lowStock.length === 0 ? (
              <p className="text-gray-400 text-sm">Estoque OK!</p>
            ) : (
              <div className="space-y-2">
                {lowStock.map(i => (
                  <div key={i.id} className="flex justify-between text-sm">
                    <span className="text-gray-700">{i.name}</span>
                    <span className="text-red-500 font-medium">{i.currentStock} {i.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Package size={16} className="text-blue-500" /> Resumo Financeiro Mês
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Receita</span>
                <span className="text-green-600 font-medium">{fmt(monthRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Compras</span>
                <span className="text-red-500 font-medium">−{fmt(monthPurchases)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Custos Fixos</span>
                <span className="text-red-500 font-medium">−{fmt(monthFixedCosts)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span className="text-gray-700">Resultado</span>
                <span className={monthProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>{fmt(monthProfit)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ icon, label, value, sub, bg }: { icon: React.ReactNode; label: string; value: string; sub: string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-4 border border-gray-100 shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  )
}
