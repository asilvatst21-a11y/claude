import { useState, useEffect } from 'react'
import { getProducts, getPurchases } from '../store/storage'
import type { Product } from '../types'
import { TrendingUp, Info } from 'lucide-react'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function pct(v: number) {
  return `${v.toFixed(1)}%`
}

export default function Precificacao() {
  const [products, setProducts] = useState<Product[]>([])
  const [margin, setMargin] = useState(60)
  const [overhead, setOverhead] = useState(20)

  useEffect(() => { setProducts(getProducts()) }, [])

  const purchases = getPurchases()

  function getIngredientCost(ingredientId: string): number {
    const relevantPurchases = purchases
      .filter(p => p.items.some(i => i.ingredientId === ingredientId))
      .sort((a, b) => b.date.localeCompare(a.date))

    if (relevantPurchases.length === 0) return 0

    const lastPurchase = relevantPurchases[0]
    const item = lastPurchase.items.find(i => i.ingredientId === ingredientId)
    return item ? item.unitPrice : 0
  }

  function calcProductCost(product: Product): number {
    return product.ingredients.reduce((sum, pi) => {
      const costPerUnit = getIngredientCost(pi.ingredientId)
      return sum + costPerUnit * pi.quantity
    }, 0)
  }

  function calcSuggestedPrice(rawCost: number): number {
    const costWithOverhead = rawCost * (1 + overhead / 100)
    return costWithOverhead / (1 - margin / 100)
  }

  const activeProducts = products.filter(p => p.active)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Precificação</h1>
        <p className="text-gray-500 text-sm">Cálculo do preço ideal de venda baseado no custo dos ingredientes</p>
      </div>

      {/* Parâmetros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-orange-500" /> Parâmetros de Precificação
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-gray-600">Margem de lucro desejada</label>
              <span className="text-sm font-bold text-orange-600">{pct(margin)}</span>
            </div>
            <input
              type="range" min={10} max={90} value={margin} onChange={e => setMargin(Number(e.target.value))}
              className="w-full accent-orange-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>10%</span><span>90%</span>
            </div>
            <p className="text-xs text-gray-400 mt-2 flex items-start gap-1">
              <Info size={12} className="mt-0.5 shrink-0" />
              Margem sobre preço de venda (mark-up). Para 60%, cada R$1 de custo gera R$2,50 de venda.
            </p>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-gray-600">Overhead (custos indiretos)</label>
              <span className="text-sm font-bold text-blue-600">{pct(overhead)}</span>
            </div>
            <input
              type="range" min={0} max={50} value={overhead} onChange={e => setOverhead(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span><span>50%</span>
            </div>
            <p className="text-xs text-gray-400 mt-2 flex items-start gap-1">
              <Info size={12} className="mt-0.5 shrink-0" />
              % adicionado ao custo para cobrir aluguel, energia, mão de obra, etc.
            </p>
          </div>
        </div>
      </div>

      {/* Tabela de precificação */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {activeProducts.length === 0 ? (
          <div className="text-center py-16">
            <TrendingUp size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Nenhum produto cadastrado.</p>
            <p className="text-gray-400 text-xs">Vá em Cadastros → Produtos para adicionar.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 rounded-t-xl">
              <tr className="text-xs text-gray-500 text-left">
                <th className="p-4">Produto</th>
                <th className="p-4">Custo Ingredientes</th>
                <th className="p-4">+ Overhead ({pct(overhead)})</th>
                <th className="p-4">Preço Sugerido</th>
                <th className="p-4">Preço Atual</th>
                <th className="p-4">Situação</th>
                <th className="p-4">Lucro Real</th>
              </tr>
            </thead>
            <tbody>
              {activeProducts.map(product => {
                const rawCost = calcProductCost(product)
                const costWithOverhead = rawCost * (1 + overhead / 100)
                const suggested = calcSuggestedPrice(rawCost)
                const currentPrice = product.salePrice
                const realProfit = currentPrice > 0 ? ((currentPrice - costWithOverhead) / currentPrice) * 100 : 0
                const isOk = currentPrice >= suggested * 0.95
                const hasIngredients = product.ingredients.length > 0
                const hasPriceData = rawCost > 0

                return (
                  <tr key={product.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                    <td className="p-4">
                      <p className="font-medium text-gray-700">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.ingredients.length} ingrediente(s)</p>
                    </td>
                    <td className="p-4">
                      {hasPriceData ? (
                        <span className="text-gray-700">{fmt(rawCost)}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">
                          {!hasIngredients ? 'Sem ingredientes' : 'Sem preço de compra'}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-gray-500">{hasPriceData ? fmt(costWithOverhead) : '—'}</td>
                    <td className="p-4">
                      {hasPriceData ? (
                        <span className="font-semibold text-orange-600">{fmt(suggested)}</span>
                      ) : '—'}
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-gray-700">{fmt(currentPrice)}</span>
                    </td>
                    <td className="p-4">
                      {!hasPriceData ? (
                        <span className="text-xs text-gray-300">Sem dados</span>
                      ) : isOk ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Adequado</span>
                      ) : (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                          Abaixo {fmt(suggested - currentPrice)}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {currentPrice > 0 && costWithOverhead > 0 ? (
                        <span className={`font-semibold ${realProfit >= margin ? 'text-green-600' : 'text-red-500'}`}>
                          {pct(realProfit)}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-xl">
        <p className="text-xs text-amber-700 font-medium mb-1">Como funciona o cálculo:</p>
        <p className="text-xs text-amber-600">
          1. Soma o custo de cada ingrediente com base no <strong>último preço de compra</strong> registrado.<br />
          2. Aplica o overhead (custos indiretos) sobre o custo dos ingredientes.<br />
          3. Calcula o preço sugerido: <strong>Custo total ÷ (1 − Margem%)</strong>.<br />
          Exemplo: Custo R$5 + 20% overhead = R$6 → Preço sugerido com 60% de margem = R$6 ÷ 0,40 = <strong>R$15</strong>
        </p>
      </div>
    </div>
  )
}
