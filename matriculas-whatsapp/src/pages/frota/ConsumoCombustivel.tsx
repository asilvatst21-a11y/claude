import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Fuel, Upload, Loader2, TrendingDown, TrendingUp, Clock, DollarSign, Route } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import {
  parseAbastecimentoCsv, importarAbastecimentos, parseTelemetriaCsv, importarTelemetria,
  parseViagensGeotabXlsx, importarDistanciaDiariaGeotab,
  buscarRankingConsumo, buscarPorModelo, buscarPorCentroCusto, buscarImpactoRS, buscarIdleTime, buscarKmlPorRota,
  buscarMetasPlaca, salvarMetaPlaca, buscarRankingPorPlaca, mesAtualParcial,
  MIN_DIAS_CONFIAVEL,
  type RankingMotorista, type KmlPorGrupo, type ImpactoRS, type IdleMotorista, type KmlPorRota, type MetaPlaca, type RankingPlaca,
} from '../../lib/consumoCombustivel'

function hojeIso(): string { return new Date().toISOString().slice(0, 10) }
function diasAtrasIso(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }

// "2026-08" -> { inicio: "2026-08-01", fim: "2026-08-31" }
function mesParaIntervalo(mes: string): { inicio: string; fim: string } {
  const [ano, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate()
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimoDia).padStart(2, '0')}` }
}

function fmtPct(p: number | null): string { return p == null ? '—' : `${Math.round(p * 100)}%` }
function pillPct(p: number | null): string {
  if (p == null) return 'bg-gray-100 text-gray-500'
  if (p >= 1) return 'bg-green-50 text-green-700 border-green-200'
  if (p >= 0.85) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

function Dropzone({ label, onDrop, uploading, mime, ext }: { label: string; onDrop: (files: File[]) => void; uploading: boolean; mime: string; ext: string }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { [mime]: [ext] }, multiple: false })
  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
      <input {...getInputProps()} />
      {uploading ? <Loader2 size={22} className="mx-auto text-brand-500 animate-spin" /> : <Upload size={22} className="mx-auto text-gray-400 mb-1" />}
      <p className="text-sm text-gray-600 mt-1">{uploading ? 'Importando…' : label}</p>
    </div>
  )
}

export default function ConsumoCombustivel() {
  const { usuario } = useAuth()
  const [dataIni, setDataIni] = useState(diasAtrasIso(45))
  const [dataFim, setDataFim] = useState(hojeIso())
  const [carregando, setCarregando] = useState(true)
  const [uploadingAbastecimento, setUploadingAbastecimento] = useState(false)
  const [uploadingTelemetria, setUploadingTelemetria] = useState(false)
  const [uploadingGeotab, setUploadingGeotab] = useState(false)
  const [msg, setMsg] = useState('')
  const [visaoRanking, setVisaoRanking] = useState<'pct' | 'kml'>('pct')

  const [ranking, setRanking] = useState<{ porPct: RankingMotorista[]; porKml: RankingMotorista[]; kmlMedioFrota: number | null; pctDentroDaMeta: number | null; diasUteis: number } | null>(null)
  const [porModelo, setPorModelo] = useState<KmlPorGrupo[]>([])
  const [porCentroCusto, setPorCentroCusto] = useState<KmlPorGrupo[]>([])
  const [impacto, setImpacto] = useState<{ porMotorista: ImpactoRS[]; totalPeriodo: number; precoMedioLitro: number | null } | null>(null)
  const [idle, setIdle] = useState<{ porMotorista: IdleMotorista[]; totalHorasFrota: number } | null>(null)
  const [porRota, setPorRota] = useState<KmlPorRota[]>([])
  const [metas, setMetas] = useState<MetaPlaca[]>([])
  const [carregandoMetas, setCarregandoMetas] = useState(true)
  const [salvandoMeta, setSalvandoMeta] = useState<string | null>(null)
  const [rankingPlacas, setRankingPlacas] = useState<RankingPlaca[]>([])
  const [carregandoPlacas, setCarregandoPlacas] = useState(true)
  const [mesPlacas, setMesPlacas] = useState(mesAtualParcial().inicio.slice(0, 7))

  const carregar = useCallback(async () => {
    if (!usuario?.filial) return
    setCarregando(true)
    const [r, m, c, i, idl, rt] = await Promise.all([
      buscarRankingConsumo(usuario.filial, dataIni, dataFim),
      buscarPorModelo(usuario.filial, dataIni, dataFim),
      buscarPorCentroCusto(usuario.filial, dataIni, dataFim),
      buscarImpactoRS(usuario.filial, dataIni, dataFim),
      buscarIdleTime(usuario.filial, dataIni, dataFim),
      buscarKmlPorRota(usuario.filial, dataIni, dataFim),
    ])
    setRanking(r); setPorModelo(m); setPorCentroCusto(c); setImpacto(i); setIdle(idl); setPorRota(rt)
    setCarregando(false)
  }, [usuario?.filial, dataIni, dataFim])

  useEffect(() => { carregar() }, [carregar])

  const carregarMetas = useCallback(async () => {
    if (!usuario?.filial) return
    setCarregandoMetas(true)
    setMetas(await buscarMetasPlaca(usuario.filial))
    setCarregandoMetas(false)
  }, [usuario?.filial])

  useEffect(() => { carregarMetas() }, [carregarMetas])

  const carregarPlacas = useCallback(async () => {
    if (!usuario?.filial) return
    setCarregandoPlacas(true)
    const { inicio, fim } = mesParaIntervalo(mesPlacas)
    setRankingPlacas(await buscarRankingPorPlaca(usuario.filial, inicio, fim))
    setCarregandoPlacas(false)
  }, [usuario?.filial, mesPlacas])

  useEffect(() => { carregarPlacas() }, [carregarPlacas])

  function onEditarMeta(placa: string, valor: string) {
    const num = Number(valor.replace(',', '.'))
    setMetas((prev) => prev.map((m) => (m.placa === placa ? { ...m, meta: isNaN(num) ? 0 : num } : m)))
  }

  async function onSalvarMeta(item: MetaPlaca) {
    if (!usuario?.filial) return
    setSalvandoMeta(item.placa)
    await salvarMetaPlaca(usuario.filial, item.placa, item.modelo, item.meta, usuario.nome ?? usuario.login)
    setSalvandoMeta(null)
    await Promise.all([carregar(), carregarPlacas()])
  }

  const onDropAbastecimento = useCallback((files: File[]) => {
    if (!usuario?.filial || !files[0]) return
    setUploadingAbastecimento(true)
    setMsg('')
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const texto = (e.target?.result as string) ?? ''
        const rows = parseAbastecimentoCsv(texto, usuario.filial)
        if (rows.length === 0) { setMsg('Nenhuma linha reconhecida no relatório de abastecimento.'); return }
        const erro = await importarAbastecimentos(rows)
        if (erro) { setMsg(`Erro ao importar: ${erro}`); return }
        setMsg(`✅ ${rows.length} abastecimentos importados.`)
        await Promise.all([carregar(), carregarMetas(), carregarPlacas()])
      } catch (err) {
        setMsg(`Erro inesperado: ${String(err)}`)
      } finally {
        setUploadingAbastecimento(false)
      }
    }
    reader.readAsText(files[0])
  }, [usuario?.filial, carregar, carregarMetas, carregarPlacas])

  const onDropTelemetria = useCallback((files: File[]) => {
    if (!usuario?.filial || !files[0]) return
    setUploadingTelemetria(true)
    setMsg('')
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const texto = (e.target?.result as string) ?? ''
        const rows = parseTelemetriaCsv(texto, usuario.filial)
        if (rows.length === 0) { setMsg('Nenhuma linha reconhecida no Boletim do Veículo.'); return }
        const erro = await importarTelemetria(rows)
        if (erro) { setMsg(`Erro ao importar: ${erro}`); return }
        setMsg(`✅ ${rows.length} linhas de telemetria importadas.`)
        await Promise.all([carregar(), carregarPlacas()])
      } catch (err) {
        setMsg(`Erro inesperado: ${String(err)}`)
      } finally {
        setUploadingTelemetria(false)
      }
    }
    // Boletim do Veículo vem em ISO-8859-1 — acentuação quebra em UTF-8.
    reader.readAsText(files[0], 'ISO-8859-1')
  }, [usuario?.filial, carregar, carregarPlacas])

  const onDropGeotab = useCallback((files: File[]) => {
    if (!usuario?.filial || !files[0]) return
    setUploadingGeotab(true)
    setMsg('')
    files[0].arrayBuffer().then(async (buffer) => {
      try {
        const rows = parseViagensGeotabXlsx(buffer, usuario.filial)
        if (rows.length === 0) { setMsg('Nenhuma linha reconhecida no relatório de viagens (GEOTAB).'); return }
        const erro = await importarDistanciaDiariaGeotab(rows)
        if (erro) { setMsg(`Erro ao importar: ${erro}`); return }
        setMsg(`✅ ${rows.length} dias de distância (GEOTAB) importados.`)
        await Promise.all([carregar(), carregarPlacas()])
      } catch (err) {
        setMsg(`Erro inesperado: ${String(err)}`)
      } finally {
        setUploadingGeotab(false)
      }
    })
  }, [usuario?.filial, carregar, carregarPlacas])

  if (!usuario) return null
  const listaRanking = visaoRanking === 'pct' ? (ranking?.porPct ?? []) : (ranking?.porKml ?? [])

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Fuel className="h-6 w-6 text-primary" /> Consumo de Combustível
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ranking de Km/L por motorista — cruza a telemetria diária (Boletim do Veículo) com a meta de cada modelo de veículo (relatório de abastecimento).
        </p>
      </div>

      {/* Import */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Importar relatórios</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Os relatórios são independentes — importe cada um sempre que tiver um novo período. O Km/L nunca vem pronto de nenhum deles: é sempre calculado aqui (distância real ÷ litros comprados por intervalo entre abastecimentos).</p>
        </div>
        <div className="p-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Relatório de abastecimento (cartão combustível, .csv)</p>
            <Dropzone label="Arraste o relatório de abastecimento (.csv)" onDrop={onDropAbastecimento} uploading={uploadingAbastecimento} mime="text/csv" ext=".csv" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Boletim do Veículo (telemetria/rastreador, .csv)</p>
            <Dropzone label="Arraste o Boletim do Veículo (.csv)" onDrop={onDropTelemetria} uploading={uploadingTelemetria} mime="text/csv" ext=".csv" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Relatório de viagens (GEOTAB, distância diária, .xlsx)</p>
            <Dropzone label="Arraste o relatório de viagens (.xlsx)" onDrop={onDropGeotab} uploading={uploadingGeotab} mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ext=".xlsx" />
          </div>
        </div>
        {msg && <p className="text-sm px-5 pb-4">{msg}</p>}
      </div>

      {/* Período */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Período:</span>
        <input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
        <span className="text-gray-400 text-sm">até</span>
        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5" />
      </div>

      {carregando ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="bg-brand-50 border border-brand-100 rounded-2xl p-4 text-xs text-muted-foreground">
            <b className="text-foreground">Método:</b> o motorista de cada dia vem da Escala do dia (03.11.49.02), não do rastreador — caminhões são compartilhados por vários motoristas, e o rastreador só sabe quem logou nele, não quem devia estar dirigindo. O Km/L é sempre calculado aqui: distância real do dia (Boletim do Veículo ou GEOTAB) somada por intervalo entre abastecimentos, dividida pelos litros comprados naquele intervalo — nunca o valor que a telemetria já traz pronta. Motoristas com menos de {MIN_DIAS_CONFIAVEL} dias úteis aparecem marcados como "amostra pequena" — a posição deles no ranking pode não representar o mês todo.
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border rounded-2xl p-4">
              <div className="text-xs text-muted-foreground font-semibold uppercase">Km/L médio da frota</div>
              <div className="text-2xl font-bold mt-1">{ranking?.kmlMedioFrota?.toFixed(2) ?? '—'}</div>
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="text-xs text-muted-foreground font-semibold uppercase">Dias dentro da meta</div>
              <div className="text-2xl font-bold mt-1">{fmtPct(ranking?.pctDentroDaMeta ?? null)}</div>
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="text-xs text-muted-foreground font-semibold uppercase">Dias úteis analisados</div>
              <div className="text-2xl font-bold mt-1">{ranking?.diasUteis ?? 0}</div>
            </div>
            <div className="bg-white border rounded-2xl p-4">
              <div className="text-xs text-muted-foreground font-semibold uppercase">Motoristas no ranking</div>
              <div className="text-2xl font-bold mt-1">{ranking?.porPct.length ?? 0}</div>
            </div>
          </div>
        </>
      )}

      {/* 1. Ranking por placa */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-sm">Ranking por placa</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ordenado pelo Km/L real — mais robusto que o ranking por motorista, cada placa acumula muito mais dias. "Motorista principal" é quem mais rodou aquela placa no período; é essa a base usada quando o motorista pergunta pro bot qual é a média dele.
            </p>
          </div>
          <input
            type="month" value={mesPlacas} onChange={(e) => setMesPlacas(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5"
          />
        </div>
        {carregandoPlacas ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rankingPlacas.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 py-6 text-center">Sem dados suficientes nesse mês ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase text-left border-b">
                  <th className="px-5 py-2 font-semibold">#</th>
                  <th className="px-2 py-2 font-semibold">Placa</th>
                  <th className="px-2 py-2 font-semibold">Modelo</th>
                  <th className="px-2 py-2 font-semibold">Dias</th>
                  <th className="px-2 py-2 font-semibold">Km/L real</th>
                  <th className="px-2 py-2 font-semibold">Km/L meta</th>
                  <th className="px-2 py-2 font-semibold">% da meta</th>
                  <th className="px-2 py-2 font-semibold">Motorista principal</th>
                </tr>
              </thead>
              <tbody>
                {rankingPlacas.map((r, i) => (
                  <tr key={r.placa} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-5 py-2 text-muted-foreground font-bold">{i + 1}</td>
                    <td className="px-2 py-2 font-mono font-semibold">{r.placa}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.modelo ?? '—'}</td>
                    <td className="px-2 py-2">{r.dias}</td>
                    <td className="px-2 py-2 font-mono font-bold text-base text-brand-700">{r.kmlMedio.toFixed(2)}</td>
                    <td className="px-2 py-2 font-mono text-muted-foreground">{r.meta != null ? r.meta.toFixed(2) : '—'}</td>
                    <td className="px-2 py-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${pillPct(r.pctMeta)}`}>{fmtPct(r.pctMeta)}</span>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{r.motoristaPrincipal ?? '—'}{r.motoristaPrincipal && <span className="text-xs"> ({r.diasMotoristaPrincipal} dias)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. Top5 / Bottom5 — por placa */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <h2 className="font-semibold text-sm">Top 5 placas — melhor Km/L</h2>
          </div>
          <div className="divide-y">
            {rankingPlacas.slice(0, 5).map((r, i) => (
              <div key={r.placa} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="h-6 w-6 rounded-full bg-green-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium font-mono truncate">{r.placa}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.modelo ?? '—'} · {r.dias} dias · {r.motoristaPrincipal ?? '—'}</div>
                </div>
                <span className="text-sm font-bold text-brand-700">{r.kmlMedio.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-600" />
            <h2 className="font-semibold text-sm">Bottom 5 placas — pior Km/L</h2>
          </div>
          <div className="divide-y">
            {[...rankingPlacas].slice(-5).reverse().map((r, i) => (
              <div key={r.placa} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                <span className="h-6 w-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{rankingPlacas.length - i}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium font-mono truncate">{r.placa}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.modelo ?? '—'} · {r.dias} dias · {r.motoristaPrincipal ?? '—'}</div>
                </div>
                <span className="text-sm font-bold text-red-600">{r.kmlMedio.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {carregando ? null : (
        <>
          {/* 3. Ranking geral por motorista */}
          <div className="bg-white border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold text-sm">Ranking geral por motorista ({ranking?.porPct.length ?? 0})</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Motoristas com menos de {MIN_DIAS_CONFIAVEL} dias úteis ficam marcados como amostra pequena</p>
              </div>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-xs font-semibold">
                <button onClick={() => setVisaoRanking('pct')} className={`px-3 py-1.5 rounded-md ${visaoRanking === 'pct' ? 'bg-white shadow text-brand-700' : 'text-muted-foreground'}`}>Por % da meta</button>
                <button onClick={() => setVisaoRanking('kml')} className={`px-3 py-1.5 rounded-md ${visaoRanking === 'kml' ? 'bg-white shadow text-brand-700' : 'text-muted-foreground'}`}>Por Km/L bruto</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase text-left border-b">
                    <th className="px-5 py-2 font-semibold">#</th>
                    <th className="px-2 py-2 font-semibold">Motorista</th>
                    <th className="px-2 py-2 font-semibold">Dias</th>
                    <th className="px-2 py-2 font-semibold">Km/L médio</th>
                    <th className="px-2 py-2 font-semibold">% da meta</th>
                    <th className="px-2 py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {listaRanking.map((r, i) => (
                    <tr key={r.nome} className={`border-b last:border-0 hover:bg-gray-50 ${r.amostraPequena ? 'opacity-60' : ''}`}>
                      <td className="px-5 py-2 text-muted-foreground font-bold">{i + 1}</td>
                      <td className="px-2 py-2">{r.nome}</td>
                      <td className="px-2 py-2">{r.dias}</td>
                      <td className="px-2 py-2 font-mono font-semibold">{r.kmlMedio.toFixed(2)}</td>
                      <td className="px-2 py-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${pillPct(r.pctMeta)}`}>{fmtPct(r.pctMeta)}</span>
                      </td>
                      <td className="px-2 py-2">
                        {r.amostraPequena && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 whitespace-nowrap">Amostra pequena</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. Por cidade */}
          <div className="bg-white border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <Route className="h-4 w-4 text-brand-600" />
              <div>
                <h2 className="font-semibold text-sm">Km/L por cidade de entrega</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Cidade com mais entregas no dia (Escala do dia) — mínimo de 3 dias por cidade</p>
              </div>
            </div>
            {porRota.length === 0 ? (
              <p className="text-sm text-muted-foreground px-5 py-6 text-center">Sem dados suficientes de rota nesse período — confira se a Escala do dia foi importada.</p>
            ) : (
              <div className="p-5 space-y-2">
                {porRota.map((r) => (
                  <div key={r.cidade} className="flex items-center justify-between text-sm">
                    <span>{r.cidade}</span>
                    <span className="text-muted-foreground">{r.dias} dias · <b className="text-foreground">{r.kmlMedio.toFixed(2)} km/L</b></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Por modelo / por sala */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b"><h2 className="font-semibold text-sm">Por modelo de veículo</h2></div>
              <div className="p-5 space-y-2">
                {porModelo.map((m) => (
                  <div key={m.grupo} className="flex items-center justify-between text-sm">
                    <span>{m.grupo}</span>
                    <span className="text-muted-foreground">{m.dias} dias · <b className="text-foreground">{m.kmlMedio.toFixed(2)} km/L</b>{m.meta != null && ` (meta ${m.meta.toFixed(2)})`}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b"><h2 className="font-semibold text-sm">Por sala</h2></div>
              <div className="p-5 space-y-2">
                {porCentroCusto.map((c) => (
                  <div key={c.grupo} className="flex items-center justify-between text-sm">
                    <span>{c.grupo || '(sem sala)'}</span>
                    <span className="text-muted-foreground">{c.dias} dias · <b className="text-foreground">{c.kmlMedio.toFixed(2)} km/L</b></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6. Impacto R$ / motor ligado parado */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-red-600" />
                <div>
                  <h2 className="font-semibold text-sm">Impacto em R$ (abaixo da meta)</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Total no período: <b className="text-foreground">R$ {impacto?.totalPeriodo.toFixed(2) ?? '0,00'}</b>
                    {impacto?.precoMedioLitro != null && ` · litro médio R$ ${impacto.precoMedioLitro.toFixed(2)}`}
                  </p>
                </div>
              </div>
              <div className="divide-y max-h-72 overflow-y-auto">
                {(impacto?.porMotorista ?? []).filter((m) => m.impactoRS > 0).slice(0, 8).map((m) => (
                  <div key={m.nome} className="px-5 py-2 flex items-center justify-between text-sm">
                    <span className="truncate">{m.nome}</span>
                    <span className="font-semibold text-red-600 shrink-0">R$ {m.impactoRS.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <div>
                  <h2 className="font-semibold text-sm">Motor ligado parado (idle)</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Total da frota: <b className="text-foreground">{idle?.totalHorasFrota.toFixed(1) ?? '0'} horas</b></p>
                </div>
              </div>
              <div className="divide-y max-h-72 overflow-y-auto">
                {(idle?.porMotorista ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground px-5 py-6 text-center">Sem dado de motor ligado parado nesse período.</p>
                ) : (idle?.porMotorista ?? []).slice(0, 8).map((m) => (
                  <div key={m.nome} className="px-5 py-2 flex items-center justify-between text-sm">
                    <span className="truncate">{m.nome} <span className="text-xs text-muted-foreground">({m.dias} dias)</span></span>
                    <span className="font-semibold text-amber-600 shrink-0">{m.minutosMediaDia.toFixed(1)} min/dia</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Meta de Km/L por placa */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Meta de Km/L por placa</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Cadastro próprio, independente do relatório de abastecimento — usado em todo o cálculo acima. Placa com meta 0 fica de fora do ranking até ser preenchida.</p>
        </div>
        {carregandoMetas ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : metas.length === 0 ? (
          <p className="text-sm text-muted-foreground px-5 py-6 text-center">Nenhuma placa conhecida ainda — importe o relatório de abastecimento primeiro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase text-left border-b">
                  <th className="px-5 py-2 font-semibold">Placa</th>
                  <th className="px-2 py-2 font-semibold">Modelo</th>
                  <th className="px-2 py-2 font-semibold">Meta (km/L)</th>
                  <th className="px-2 py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {metas.map((m) => (
                  <tr key={m.placa} className={`border-b last:border-0 hover:bg-gray-50 ${m.meta <= 0 ? 'bg-amber-50' : ''}`}>
                    <td className="px-5 py-2 font-mono font-semibold">{m.placa}</td>
                    <td className="px-2 py-2 text-muted-foreground">{m.modelo ?? '—'}</td>
                    <td className="px-2 py-2">
                      <input
                        type="number" step="0.01" min="0" value={m.meta}
                        onChange={(e) => onEditarMeta(m.placa, e.target.value)}
                        className="w-24 border rounded-lg px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => onSalvarMeta(m)}
                        disabled={salvandoMeta === m.placa}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white disabled:opacity-50"
                      >
                        {salvandoMeta === m.placa ? 'Salvando…' : 'Salvar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
