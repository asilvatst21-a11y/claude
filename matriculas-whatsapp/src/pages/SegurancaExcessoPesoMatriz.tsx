import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Grid3x3 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { buscarHistoricoExcessoPeso, formatarKg, type HistoricoExcessoPeso, type SituacaoExcesso } from '../lib/pesoExcesso'

function mesAtualISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const LETRA_DIA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function diasDoMes(mes: string): { dia: number; iso: string; letra: string; fimDeSemana: boolean }[] {
  const [ano, mesNum] = mes.split('-').map(Number)
  const totalDias = new Date(ano, mesNum, 0).getDate()
  return Array.from({ length: totalDias }, (_, i) => {
    const dia = i + 1
    const data = new Date(ano, mesNum - 1, dia)
    const diaSemana = data.getDay()
    return {
      dia,
      iso: `${ano}-${String(mesNum).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      letra: LETRA_DIA_SEMANA[diaSemana],
      fimDeSemana: diaSemana === 0 || diaSemana === 6,
    }
  })
}

function corCelula(situacao: SituacaoExcesso): string {
  if (situacao === 'dentro_limite') return 'bg-green-200 text-green-800'
  if (situacao === 'excesso') return 'bg-red-200 text-red-800'
  if (situacao === 'sem_referencia') return 'bg-yellow-200 text-yellow-800'
  return 'bg-gray-100 text-gray-500'
}

export default function SegurancaExcessoPesoMatriz() {
  const { usuario } = useAuth()
  const [mes, setMes] = useState(mesAtualISO)
  const [busca, setBusca] = useState('')
  const [historico, setHistorico] = useState<HistoricoExcessoPeso[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMatriz = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const dias = diasDoMes(mes)
    const dataInicio = dias[0].iso
    const dataFim = dias[dias.length - 1].iso
    const lista = await buscarHistoricoExcessoPeso(usuario.filial, dataInicio, dataFim)
    setHistorico(lista)
    setLoading(false)
  }, [usuario, mes])

  useEffect(() => { fetchMatriz() }, [fetchMatriz])

  const dias = useMemo(() => diasDoMes(mes), [mes])

  const celulaPorPlacaEDia = useMemo(() => {
    const mapa = new Map<string, HistoricoExcessoPeso>()
    for (const h of historico) mapa.set(`${h.placa}|${h.data}`, h)
    return mapa
  }, [historico])

  const placas = useMemo(() => {
    const termo = busca.trim().toUpperCase()
    const todas = [...new Set(historico.map((h) => h.placa))].sort()
    return termo ? todas.filter((p) => p.includes(termo)) : todas
  }, [historico, busca])

  const stats = useMemo(() => {
    const diasComExcesso = new Set(historico.filter((h) => h.situacao === 'excesso').map((h) => h.data))
    const excessosPorPlaca = new Map<string, number>()
    for (const h of historico) {
      if (h.situacao === 'excesso') excessosPorPlaca.set(h.placa, (excessosPorPlaca.get(h.placa) ?? 0) + 1)
    }
    let maisReincidente: { placa: string; n: number } | null = null
    for (const [placa, n] of excessosPorPlaca) {
      if (!maisReincidente || n > maisReincidente.n) maisReincidente = { placa, n }
    }
    const semReferencia = new Set(historico.filter((h) => h.situacao === 'sem_referencia').map((h) => h.placa))
    return {
      placasMonitoradas: new Set(historico.map((h) => h.placa)).size,
      diasComExcesso: diasComExcesso.size,
      totalDias: dias.length,
      maisReincidente,
      semReferencia: semReferencia.size,
    }
  }, [historico, dias])

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-full mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/seguranca/excesso-peso" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="h-3 w-3" /> Excesso de Peso
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Grid3x3 className="h-5 w-5 text-accent-600" /> Matriz de Excesso de Peso
          </h1>
          <p className="text-sm text-muted-foreground">
            Uma linha por placa, uma coluna por dia — visão do mês inteiro pra ver padrão de reincidência.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Mês</label>
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="px-2 py-1.5 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Placa</label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar placa..."
              className="px-2 py-1.5 border rounded-lg text-sm w-36"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Placas monitoradas</p>
          <p className="text-2xl font-bold">{stats.placasMonitoradas}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Dias com algum excesso</p>
          <p className="text-2xl font-bold text-red-600">{stats.diasComExcesso} <span className="text-sm font-normal text-muted-foreground">de {stats.totalDias}</span></p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Placa mais reincidente</p>
          <p className="text-lg font-bold">
            {stats.maisReincidente ? (
              <>{stats.maisReincidente.placa} <span className="text-sm font-normal text-red-600">({stats.maisReincidente.n}x)</span></>
            ) : '—'}
          </p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Sem peso Lotação</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.semReferencia} <span className="text-sm font-normal text-muted-foreground">placa(s)</span></p>
        </div>
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-sm">{mes}</h2>
            <p className="text-xs text-muted-foreground">Célula = situação do dia. Número = kg de excesso quando houve.</p>
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-200 inline-block" /> Dentro do limite</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block" /> Excesso (kg)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-200 inline-block" /> Sem peso Lotação</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-100 border inline-block" /> Não circulou</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
          </div>
        ) : placas.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum dado nesse mês ainda. A matriz é preenchida sozinha — basta abrir a tela de Excesso de Peso no dia a dia.
          </div>
        ) : (
          <div className="overflow-auto" style={{ maxHeight: 560 }}>
            <table className="text-xs border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-muted/70 border-b border-r px-3 py-1 text-left"></th>
                  {dias.map((d) => (
                    <th key={`ls-${d.iso}`} className={`sticky top-0 z-20 border-b text-[9px] font-bold text-muted-foreground/70 pt-1.5 ${d.fimDeSemana ? 'bg-muted' : 'bg-muted/70'}`}>
                      {d.letra}
                    </th>
                  ))}
                  <th className="sticky right-0 top-0 z-30 bg-muted/70 border-b border-l px-3 py-1"></th>
                </tr>
                <tr>
                  <th className="sticky left-0 top-4 z-30 bg-muted/70 border-b border-r px-3 py-1.5 text-left font-medium text-muted-foreground">Placa</th>
                  {dias.map((d) => (
                    <th key={`dn-${d.iso}`} className={`sticky top-4 z-20 border-b pb-1.5 font-medium text-muted-foreground ${d.fimDeSemana ? 'bg-muted' : 'bg-muted/70'}`}>
                      {d.dia}
                    </th>
                  ))}
                  <th className="sticky right-0 top-4 z-30 bg-muted/70 border-b border-l px-3 py-1.5 font-medium text-muted-foreground">Excessos</th>
                </tr>
              </thead>
              <tbody>
                {placas.map((placa) => {
                  const totalExcessos = dias.filter((d) => celulaPorPlacaEDia.get(`${placa}|${d.iso}`)?.situacao === 'excesso').length
                  return (
                    <tr key={placa}>
                      <td className="sticky left-0 z-10 bg-white border-b border-r px-3 py-1.5 font-mono font-semibold whitespace-nowrap">{placa}</td>
                      {dias.map((d) => {
                        const h = celulaPorPlacaEDia.get(`${placa}|${d.iso}`)
                        if (!h) {
                          return <td key={d.iso} className="border-b border-r border-r-gray-100 bg-gray-50 w-8 h-7 text-center" title={`${placa} — ${d.iso}: sem operação`} />
                        }
                        const label = h.situacao === 'excesso' && h.excesso != null ? `+${Math.round(h.excesso)}` : ''
                        return (
                          <td
                            key={d.iso}
                            className={`border-b border-r border-r-gray-100 w-8 h-7 text-center font-bold ${corCelula(h.situacao)}`}
                            title={`${placa} — ${d.iso}\nReferência: ${formatarKg(h.peso_referencia)}\nCarregado: ${formatarKg(h.peso_carregado)}`}
                          >
                            {label}
                          </td>
                        )
                      })}
                      <td className={`sticky right-0 z-10 bg-white border-b border-l px-3 py-1.5 text-center font-bold ${totalExcessos > 0 ? 'text-red-600' : 'text-muted-foreground font-normal'}`}>
                        {totalExcessos}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
