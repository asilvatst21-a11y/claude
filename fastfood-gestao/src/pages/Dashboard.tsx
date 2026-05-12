import { useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { getSales, getIngredients, getPurchases, getFixedCosts, id as genId, getMonthlyTarget, saveMonthlyTarget } from '../store/storage'
import type { MonthlyTarget } from '../store/storage'
import {
  ShoppingCart, DollarSign, Package, AlertTriangle,
  TrendingUp, Clock, CreditCard, Beer, Target, Pencil, X, Check,
} from 'lucide-react'

const COLORS = ['#ff6b35', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  cartao_debito: 'Débito',
  cartao_credito: 'Crédito',
  pix: 'PIX',
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function generateSimulation() {
  const prods = [
    { id: 'sim_mac1', name: 'Macarrão Tradicional', cat: 'macarrao', price: 22 },
    { id: 'sim_mac2', name: 'Macarrão Especial', cat: 'macarrao', price: 28 },
    { id: 'sim_burg', name: 'X-Burguer', cat: 'hamburguer', price: 20 },
    { id: 'sim_hot', name: 'Cachorro Quente', cat: 'cachorro_quente', price: 12 },
    { id: 'sim_ref', name: 'Refrigerante Lata', cat: 'bebida', price: 6 },
    { id: 'sim_agua', name: 'Água Mineral', cat: 'bebida', price: 4 },
    { id: 'sim_suco', name: 'Suco Natural', cat: 'bebida', price: 9 },
  ]
  const foods = prods.slice(0, 4)
  const drinks = prods.slice(4)
  const payments = ['dinheiro', 'pix', 'pix', 'pix', 'cartao_debito', 'cartao_credito']
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate()

  const sales: object[] = []

  for (let day = 1; day <= daysInPrevMonth; day++) {
    const dateStr = `${year}-${String(month - 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dow = new Date(dateStr).getDay()
    const isWeekend = dow === 0 || dow === 5 || dow === 6
    const numOrders = isWeekend ? 20 + Math.floor(Math.random() * 15) : 10 + Math.floor(Math.random() * 10)

    for (let o = 0; o < numOrders; o++) {
      const isPeakLunch = Math.random() > 0.4
      const isPeakDinner = Math.random() > 0.5
      let hour: number
      if (isPeakLunch && !isPeakDinner) hour = 11 + Math.floor(Math.random() * 3)
      else if (isPeakDinner) hour = 18 + Math.floor(Math.random() * 3)
      else hour = 9 + Math.floor(Math.random() * 12)
      const time = `${String(hour).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`

      const food = foods[Math.floor(Math.random() * foods.length)]
      const qty = Math.random() > 0.85 ? 2 : 1
      const items: object[] = [{ productId: food.id, productName: food.name, quantity: qty, unitPrice: food.price, total: food.price * qty }]
      let total = food.price * qty

      if (Math.random() > 0.35) {
        const drink = drinks[Math.floor(Math.random() * drinks.length)]
        items.push({ productId: drink.id, productName: drink.name, quantity: 1, unitPrice: drink.price, total: drink.price })
        total += drink.price
      }

      sales.push({
        id: genId(),
        date: dateStr,
        time,
        items,
        total,
        paymentMethod: payments[Math.floor(Math.random() * payments.length)],
        notes: '',
      })
    }
  }

  return sales
}

export default function Dashboard() {
  const rawSales = getSales()
  if (rawSales.length === 0) {
    const sim = generateSimulation()
    localStorage.setItem('ff_sales', JSON.stringify(sim))
  }

  const [filterProduct, setFilterProduct] = useState('')
  const [filterPeriod, setFilterPeriod] = useState('30d')

  const allSales = getSales()
  const ingredients = getIngredients()
  const purchases = getPurchases()
  const fixedCosts = getFixedCosts()

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const todayStr = now.toISOString().slice(0, 10)

  // Lista de produtos únicos para o dropdown
  const allProducts = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of allSales) for (const i of s.items) map.set(i.productId, i.productName)
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [allSales])

  // Filtro por período
  const periodStart = useMemo(() => {
    const d = new Date(now)
    if (filterPeriod === '7d') d.setDate(d.getDate() - 6)
    else if (filterPeriod === '30d') d.setDate(d.getDate() - 29)
    else if (filterPeriod === 'mes') return thisMonth
    else return null // tudo
    return d.toISOString().slice(0, 10)
  }, [filterPeriod])

  // Sales com filtros aplicados
  const sales = useMemo(() => {
    let list = allSales
    if (periodStart) {
      list = filterPeriod === 'mes'
        ? list.filter(s => s.date.startsWith(periodStart as string))
        : list.filter(s => s.date >= (periodStart as string))
    }
    if (filterProduct) list = list.filter(s => s.items.some(i => i.productId === filterProduct))
    return list
  }, [allSales, filterProduct, periodStart])

  const monthSales = useMemo(() => allSales.filter(s => s.date.startsWith(thisMonth)), [allSales])
  const todaySales = useMemo(() => allSales.filter(s => s.date === todayStr), [allSales])

  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0)
  const filteredRevenue = sales.reduce((s, x) => s + x.total, 0)
  const filteredOrders = sales.length
  const avgTicket = filteredOrders > 0 ? filteredRevenue / filteredOrders : 0

  const monthRevenue = monthSales.reduce((s, x) => s + x.total, 0)
  const lowStock = ingredients.filter(i => i.currentStock <= i.minStock)
  const monthPurchases = purchases.filter(p => p.date.startsWith(thisMonth)).reduce((s, p) => s + p.totalValue, 0)
  const monthFixedCosts = fixedCosts.filter(c => c.active).reduce((s, c) => s + c.monthlyValue, 0)
  const monthProfit = monthRevenue - monthPurchases - monthFixedCosts
  const monthEbitda = monthRevenue - monthPurchases - monthFixedCosts
  const monthEbitdaMargin = monthRevenue > 0 ? (monthEbitda / monthRevenue) * 100 : 0

  const [target, setTarget] = useState<MonthlyTarget | null>(() => getMonthlyTarget(thisMonth))
  const [editTarget, setEditTarget] = useState(false)
  const [editRevenue, setEditRevenue] = useState('')
  const [editEbitda, setEditEbitda] = useState('')

  function openEdit() {
    setEditRevenue(target ? String(target.revenueTarget) : '')
    setEditEbitda(target ? String(target.ebitdaTarget) : '')
    setEditTarget(true)
  }
  function saveTarget() {
    const t: MonthlyTarget = {
      revenueTarget: parseFloat(editRevenue) || 0,
      ebitdaTarget: parseFloat(editEbitda) || 0,
    }
    saveMonthlyTarget(thisMonth, t)
    setTarget(t)
    setEditTarget(false)
  }

  // Faturamento por dia (período selecionado)
  const last30 = useMemo(() => {
    const days = filterPeriod === '7d' ? 7 : 30
    const map: Record<string, number> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      map[d.toISOString().slice(0, 10)] = 0
    }
    for (const s of sales) if (map[s.date] !== undefined) map[s.date] += s.total
    return Object.entries(map).map(([date, value]) => ({
      day: date.slice(5).replace('-', '/'),
      value: parseFloat(value.toFixed(2)),
    }))
  }, [sales, filterPeriod])

  // Horários de pico
  const hourData = useMemo(() => {
    const map: Record<number, number> = {}
    for (let h = 8; h <= 22; h++) map[h] = 0
    for (const s of sales) {
      const h = parseInt(s.time?.slice(0, 2) || '0')
      if (map[h] !== undefined) map[h]++
    }
    return Object.entries(map).map(([h, count]) => ({ hora: `${h}h`, pedidos: count }))
  }, [sales])

  // Dia da semana
  const dowData = useMemo(() => {
    const map = [0, 0, 0, 0, 0, 0, 0]
    for (const s of sales) map[new Date(s.date + 'T12:00:00').getDay()] += s.total
    return DAY_LABELS.map((label, i) => ({ dia: label, valor: parseFloat(map[i].toFixed(2)) }))
  }, [sales])

  // Top produtos
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {}
    for (const s of sales) {
      for (const item of s.items) {
        if (!map[item.productName]) map[item.productName] = { name: item.productName, qty: 0, revenue: 0 }
        map[item.productName].qty += item.quantity
        map[item.productName].revenue += item.total
      }
    }
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 8)
  }, [sales])

  // Bebidas
  const topDrinks = useMemo(() => {
    const drinkKeywords = ['refrigerante', 'suco', 'água', 'agua', 'cerveja', 'bebida', 'coca', 'guaraná', 'guarana', 'laranja', 'limão']
    const map: Record<string, { name: string; qty: number }> = {}
    for (const s of sales) {
      for (const item of s.items) {
        const nm = item.productName.toLowerCase()
        if (drinkKeywords.some(k => nm.includes(k))) {
          if (!map[item.productName]) map[item.productName] = { name: item.productName, qty: 0 }
          map[item.productName].qty += item.quantity
        }
      }
    }
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5)
  }, [sales])

  // Formas de pagamento
  const paymentData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of sales) map[s.paymentMethod] = (map[s.paymentMethod] || 0) + 1
    return Object.entries(map).map(([key, value]) => ({ name: PAYMENT_LABELS[key] || key, value }))
  }, [sales])

  const hasData = sales.length > 0
  const isFiltered = !!filterProduct

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 text-sm">
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={filterProduct}
            onChange={e => setFilterProduct(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400 bg-white"
          >
            <option value="">Todos os produtos</option>
            {allProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {[{ v: '7d', l: '7 dias' }, { v: '30d', l: '30 dias' }, { v: 'mes', l: 'Este mês' }, { v: 'all', l: 'Tudo' }].map(opt => (
              <button
                key={opt.v}
                onClick={() => setFilterPeriod(opt.v)}
                className={`px-3 py-1.5 ${filterPeriod === opt.v ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {opt.l}
              </button>
            ))}
          </div>

          {isFiltered && (
            <button onClick={() => setFilterProduct('')} className="text-xs text-orange-500 hover:underline">
              Limpar filtro
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card icon={<ShoppingCart className="text-orange-500" size={22} />} label="Vendas Hoje" value={String(todaySales.length)} sub="pedidos hoje" bg="bg-orange-50" />
        <Card icon={<DollarSign className="text-green-500" size={22} />} label="Receita Hoje" value={fmt(todayRevenue)} sub="dia atual" bg="bg-green-50" />
        <Card icon={<TrendingUp className="text-blue-500" size={22} />} label={isFiltered ? 'Receita Filtrada' : 'Receita do Período'} value={fmt(filteredRevenue)} sub={`${filteredOrders} pedidos`} bg="bg-blue-50" />
        <Card
          icon={<DollarSign className={monthProfit >= 0 ? 'text-emerald-500' : 'text-red-500'} size={22} />}
          label="Lucro Est. Mês"
          value={fmt(monthProfit)}
          sub={`Ticket médio ${fmt(avgTicket)}`}
          bg={monthProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}
        />
      </div>

      {/* Metas do Mês */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            <Target size={16} className="text-orange-500" />
            Metas — {now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </h2>
          {!editTarget ? (
            <button onClick={openEdit} className="flex items-center gap-1 text-xs text-gray-400 hover:text-orange-500">
              <Pencil size={13} /> {target ? 'Editar metas' : 'Definir metas'}
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={saveTarget} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium">
                <Check size={13} /> Salvar
              </button>
              <button onClick={() => setEditTarget(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {editTarget ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Meta de Receita (R$)</label>
              <input type="number" min={0} step={100} value={editRevenue}
                onChange={e => setEditRevenue(e.target.value)}
                placeholder="Ex: 30000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Meta de EBITDA (%)</label>
              <input type="number" min={0} max={60} step={1} value={editEbitda}
                onChange={e => setEditEbitda(e.target.value)}
                placeholder="Ex: 20"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" />
            </div>
          </div>
        ) : target ? (
          <div className="space-y-4">
            <ProgressBar
              label="Receita"
              current={monthRevenue}
              goal={target.revenueTarget}
              formatValue={fmt}
              color="orange"
            />
            <ProgressBar
              label="EBITDA"
              current={monthEbitdaMargin}
              goal={target.ebitdaTarget}
              formatValue={v => `${v.toFixed(1)}%`}
              color={monthEbitdaMargin >= target.ebitdaTarget ? 'green' : 'orange'}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">
            Nenhuma meta definida para este mês.{' '}
            <button onClick={openEdit} className="text-orange-500 hover:underline font-medium">Definir agora</button>
          </p>
        )}
      </div>

      {/* Faturamento 30 dias */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-blue-500" /> Faturamento{isFiltered ? ` — ${allProducts.find(p => p.id === filterProduct)?.name}` : ''} — {filterPeriod === '7d' ? 'Últimos 7 dias' : filterPeriod === 'mes' ? 'Este mês' : filterPeriod === 'all' ? 'Todo o período' : 'Últimos 30 dias'}
        </h2>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={last30}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${v}`} width={55} />
              <Tooltip formatter={(v) => fmt(Number(v))} labelFormatter={l => `Dia ${l}`} />
              <Line type="monotone" dataKey="value" stroke="#ff6b35" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </div>

      {/* Horários de pico + Dia da semana */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Clock size={16} className="text-purple-500" /> Horários de Pico
          </h2>
          {hasData ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourData}>
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="pedidos" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <ShoppingCart size={16} className="text-orange-500" /> Vendas por Dia da Semana
          </h2>
          {hasData ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dowData}>
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `R$${v}`} width={50} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Bar dataKey="valor" fill="#ff6b35" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>
      </div>

      {/* Top produtos + Formas de pagamento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Package size={16} className="text-green-500" /> Produtos Mais Vendidos
          </h2>
          {hasData && topProducts.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={130} />
                <Tooltip formatter={(v) => `${Number(v)} unid.`} />
                <Bar dataKey="qty" fill="#10b981" radius={[0, 3, 3, 0]}>
                  {topProducts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <CreditCard size={16} className="text-blue-500" /> Forma de Pagamento
          </h2>
          {hasData && paymentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={paymentData} dataKey="value" cx="50%" cy="45%" outerRadius={70} innerRadius={35} paddingAngle={3}>
                  {paymentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>
      </div>

      {/* Bebidas + Estoque crítico + Financeiro */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Beer size={16} className="text-yellow-500" /> Bebidas Mais Vendidas
          </h2>
          {topDrinks.length > 0 ? (
            <div className="space-y-2">
              {topDrinks.map((d, i) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white" style={{ background: COLORS[i] }}>{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-700 truncate">{d.name}</span>
                  <span className="text-sm font-semibold text-gray-500">{d.qty} un.</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-6">
              {hasData ? 'Nenhuma bebida identificada' : 'Sem dados ainda'}
            </p>
          )}
        </div>

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
            <DollarSign size={16} className="text-blue-500" /> Resumo Financeiro
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
            <div className="flex justify-between pt-1 text-xs text-gray-400">
              <span>Ticket médio</span>
              <span>{fmt(avgTicket)}</span>
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
      <p className="text-xl font-bold text-gray-800 truncate">{value}</p>
      <p className="text-xs text-gray-500 mt-1 truncate">{sub}</p>
    </div>
  )
}

function EmptyChart() {
  return <p className="text-gray-400 text-sm text-center py-10">Sem dados suficientes</p>
}

function ProgressBar({ label, current, goal, formatValue, color }: {
  label: string; current: number; goal: number
  formatValue: (v: number) => string; color: 'orange' | 'green' | 'red'
}) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0
  const over = goal > 0 && current > goal
  const colorMap = { orange: 'bg-orange-500', green: 'bg-emerald-500', red: 'bg-red-500' }
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm font-medium text-gray-600">{label}</span>
        <span className="text-xs text-gray-500">
          <span className={`font-bold ${over ? 'text-emerald-600' : 'text-gray-800'}`}>{formatValue(current)}</span>
          {' '}/{' '}{formatValue(goal)}
          {over && <span className="ml-1 text-emerald-600 font-medium">✓ Meta atingida!</span>}
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorMap[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-0.5 text-right">{pct.toFixed(0)}% da meta</p>
    </div>
  )
}
