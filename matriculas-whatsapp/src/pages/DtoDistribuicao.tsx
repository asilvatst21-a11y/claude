import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import {
  Upload, Loader2, Building2, RefreshCw, Download, ClipboardList,
  ShieldCheck, AlertTriangle, ChevronDown, ChevronUp, Search, Users,
  XCircle, CheckCircle, BarChart2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import type { DtoDistribuicaoAvaliacao, DtoDistribuicaoTipo } from '../types'

const TIPOS: DtoDistribuicaoTipo[] = ['BEES', 'DEVOLUÇÃO', 'TML', 'RETORNO DE ROTA']

const COR_TIPO: Record<DtoDistribuicaoTipo, string> = {
  'BEES': '#2563eb',
  'DEVOLUÇÃO': '#d97706',
  'TML': '#7c3aed',
  'RETORNO DE ROTA': '#0d9488',
}

const MESES_PT_ABR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface ResumoColaborador {
  nome: string
  equipe: string
  funcao: string
  totalNO: number
  totalOK: number
  totalAvaliacoes: number
  percentualConformidade: number
  reincidencias: { questao: string; vezes: number }[]
  evolucao: { data: string; conformidade: number }[]
  avaliacoesPorData: Record<string, { nos: string[]; oks: number; observacoes: string; realizadoPor: string }>
}

// Mesma planilha usada na importação do GSDPQ: a coluna TIPO (primeira
// coluna) identifica a categoria de cada linha. Aqui só processamos as
// linhas de BEES, DEVOLUÇÃO, TML e RETORNO DE ROTA — as linhas de GSDPQ
// continuam sendo tratadas (e atualizadas) pela própria tela de GSDPQ.
function parseDtoDistribuicaoExcel(buffer: ArrayBuffer): Omit<DtoDistribuicaoAvaliacao, 'id' | 'created_at'>[] {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false })
  if (raw.length === 0) return []

  const todasColunas = Object.keys(raw[0])
  const questoes = todasColunas.slice(13).filter(q => q.trim() !== '')
  const tiposAceitos = new Set<string>(TIPOS)

  const rows: Omit<DtoDistribuicaoAvaliacao, 'id' | 'created_at'>[] = []

  raw.forEach(r => {
    const cols = Object.keys(r)
    const tipoRaw = (r[cols[0]] ?? '').toString().trim().toUpperCase()
    if (!tiposAceitos.has(tipoRaw)) return
    const tipo = tipoRaw as DtoDistribuicaoTipo

    const filial = (r[cols[1]] ?? '').trim()
    const realizado_por = r[cols[3]] ?? ''
    const colaborador_nome = (r[cols[5]] ?? '').trim()
    if (!colaborador_nome) return
    const funcao = (r[cols[6]] ?? '').trim()
    const equipe = r[cols[7]] ?? ''
    const data_avaliacao = (r[cols[9]] ?? '').trim()
    const observacoes = r[cols[12]] ?? ''

    questoes.forEach(q => {
      const resultado = (r[q] ?? '').toString().toUpperCase().trim()
      if (!resultado) return
      rows.push({
        filial, tipo, colaborador_nome, realizado_por,
        funcao: funcao || null, equipe, data_avaliacao,
        questao: q.trim(), resultado, observacoes,
      })
    })
  })

  return rows
}

function calcularResumos(avaliacoes: DtoDistribuicaoAvaliacao[]): ResumoColaborador[] {
  const mapa = new Map<string, DtoDistribuicaoAvaliacao[]>()
  avaliacoes.forEach(av => {
    if (!mapa.has(av.colaborador_nome)) mapa.set(av.colaborador_nome, [])
    mapa.get(av.colaborador_nome)!.push(av)
  })

  return Array.from(mapa.entries()).map(([nome, avs]) => {
    let totalNO = 0, totalOK = 0
    const nosPorQuestao: Record<string, number> = {}
    const avaliacoesPorData: Record<string, { nos: string[]; oks: number; observacoes: string; realizadoPor: string }> = {}

    avs.forEach(av => {
      const key = av.data_avaliacao ?? ''
      if (!avaliacoesPorData[key]) avaliacoesPorData[key] = { nos: [], oks: 0, observacoes: av.observacoes ?? '', realizadoPor: av.realizado_por ?? '' }
      if (av.resultado === 'NO') {
        totalNO++
        nosPorQuestao[av.questao] = (nosPorQuestao[av.questao] ?? 0) + 1
        avaliacoesPorData[key].nos.push(av.questao)
      } else if (av.resultado === 'OK') {
        totalOK++
        avaliacoesPorData[key].oks++
      }
    })

    const reincidencias = Object.entries(nosPorQuestao)
      .filter(([, v]) => v > 1)
      .map(([questao, vezes]) => ({ questao, vezes }))
      .sort((a, b) => b.vezes - a.vezes)

    const datasOrdenadas = Object.keys(avaliacoesPorData).sort()
    const evolucao = datasOrdenadas.map(data => {
      const info = avaliacoesPorData[data]
      const total = info.nos.length + info.oks
      return { data: data.slice(0, 5), conformidade: total > 0 ? Math.round((info.oks / total) * 100) : 100 }
    })

    return {
      nome,
      equipe: avs[0]?.equipe ?? '',
      funcao: avs[0]?.funcao ?? '',
      totalNO, totalOK,
      totalAvaliacoes: totalNO + totalOK,
      percentualConformidade: totalNO + totalOK > 0 ? Math.round((totalOK / (totalNO + totalOK)) * 100) : 100,
      reincidencias,
      evolucao,
      avaliacoesPorData,
    }
  }).sort((a, b) => b.totalNO - a.totalNO)
}

function calcularRankingQuestoes(avaliacoes: DtoDistribuicaoAvaliacao[]) {
  const counts: Record<string, { NO: number; OK: number }> = {}
  avaliacoes.forEach(av => {
    if (!counts[av.questao]) counts[av.questao] = { NO: 0, OK: 0 }
    if (av.resultado === 'NO') counts[av.questao].NO++
    else if (av.resultado === 'OK') counts[av.questao].OK++
  })
  return Object.entries(counts)
    .filter(([, v]) => v.NO > 0)
    .map(([questao, v]) => ({ questao, ...v }))
    .sort((a, b) => b.NO - a.NO)
}

// Lê data string em YYYY-MM-DD ou DD/MM/YYYY para um Date comparável.
function parseAvDate(s: string | null): Date | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.slice(0, 10) + 'T00:00:00')
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`)
  return null
}

function mesKey(s: string | null): string | null {
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return `${s.slice(5, 7)}/${s.slice(0, 4)}`
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[2]}/${m[3]}` : null
}

function calcularEvolucaoMensal(avaliacoes: DtoDistribuicaoAvaliacao[]) {
  const porMes = new Map<string, { NO: number; OK: number }>()
  avaliacoes.forEach(av => {
    const mes = mesKey(av.data_avaliacao)
    if (!mes) return
    if (!porMes.has(mes)) porMes.set(mes, { NO: 0, OK: 0 })
    if (av.resultado === 'NO') porMes.get(mes)!.NO++
    else if (av.resultado === 'OK') porMes.get(mes)!.OK++
  })
  return Array.from(porMes.entries())
    .map(([mes, v]) => {
      const [mm, yyyy] = mes.split('/')
      const total = v.NO + v.OK
      return {
        mes, mesLabel: `${MESES_PT_ABR[parseInt(mm) - 1]}/${yyyy.slice(2)}`,
        NO: v.NO, OK: v.OK,
        conformidade: total > 0 ? Math.round((v.OK / total) * 100) : 0,
      }
    })
    .sort((a, b) => {
      const [ma, ya] = a.mes.split('/').map(Number)
      const [mb, yb] = b.mes.split('/').map(Number)
      return (ya * 12 + ma) - (yb * 12 + mb)
    })
}

function ConformidadeBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? 'bg-brand-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">{pct}%</span>
    </div>
  )
}

function ColaboradorRow({ r }: { r: ResumoColaborador }) {
  const [open, setOpen] = useState(false)
  const datasOrdenadas = Object.keys(r.avaliacoesPorData).sort()

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {open ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
            <div>
              <p className="font-medium text-gray-900 text-sm">{r.nome}</p>
              <p className="text-xs text-gray-400">{[r.funcao, r.equipe].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-sm text-gray-700">{r.totalAvaliacoes}</td>
        <td className="px-4 py-3 text-center">
          <span className={`text-sm font-bold ${r.totalNO > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.totalNO}</span>
        </td>
        <td className="px-4 py-3 text-center">
          {r.reincidencias.length > 0
            ? <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                <AlertTriangle size={11} /> {r.reincidencias.length}
              </span>
            : <span className="text-xs text-gray-400">—</span>}
        </td>
        <td className="px-4 py-3 w-44"><ConformidadeBar pct={r.percentualConformidade} /></td>
      </tr>

      {open && (
        <tr>
          <td colSpan={5} className="bg-gray-50 border-b border-gray-200 px-6 py-5">
            <div className="space-y-5">

              {r.evolucao.length > 1 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Evolução de Conformidade</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={r.evolucao}>
                      <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" width={32} />
                      <Tooltip formatter={(v) => [`${v}%`, 'Conformidade']} />
                      <Line type="monotone" dataKey="conformidade" stroke="#1a4451" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {r.reincidencias.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-700 uppercase mb-2 flex items-center gap-1">
                    <AlertTriangle size={12} /> Reincidências
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {r.reincidencias.map(re => (
                      <span key={re.questao} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded border border-orange-200">
                        <strong>{re.vezes}x</strong> — {re.questao.length > 80 ? re.questao.slice(0, 80) + '…' : re.questao}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Histórico de Avaliações</p>
                <div className="space-y-3">
                  {datasOrdenadas.map(data => {
                    const info = r.avaliacoesPorData[data]
                    return (
                      <div key={data} className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-xs font-semibold text-gray-700">{formatarDataBR(data) || data}</span>
                            {info.realizadoPor && <span className="text-xs text-gray-400 ml-2">por {info.realizadoPor}</span>}
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${info.nos.length === 0 ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700'}`}>
                            {info.nos.length === 0 ? '✓ Sem NOs' : `${info.nos.length} NO${info.nos.length > 1 ? 's' : ''}`}
                          </span>
                        </div>

                        {info.nos.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {info.nos.map(questao => (
                              <div key={questao} className="flex items-start gap-1.5 bg-red-50 rounded px-2 py-1.5">
                                <XCircle size={12} className="text-red-500 mt-0.5 shrink-0" />
                                <span className="text-xs text-red-700">{questao}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {info.observacoes && (
                          <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-2 mt-2">
                            "{info.observacoes}"
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function DtoDistribuicao() {
  const { usuario } = useAuth()
  const [avaliacoes, setAvaliacoes] = useState<DtoDistribuicaoAvaliacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [uploadando, setUploadando] = useState(false)
  const [importResult, setImportResult] = useState<{ tipo: 'sucesso' | 'erro'; mensagem: string } | null>(null)
  const [tipoSelecionado, setTipoSelecionado] = useState<DtoDistribuicaoTipo>('TML')
  const [abaAtiva, setAbaAtiva] = useState<'dashboard' | 'colaboradores' | 'questoes' | 'mensal'>('dashboard')
  const [filtroEquipe, setFiltroEquipe] = useState('Todas')
  const [filtroColaborador, setFiltroColaborador] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState({ de: '', ate: '' })

  const carregarDados = useCallback(async () => {
    if (!usuario) return
    setCarregando(true)
    const { data } = await supabase
      .from('dto_distribuicao_avaliacoes')
      .select('*')
      .eq('filial', usuario.filial)
      .order('data_avaliacao', { ascending: false })
    setAvaliacoes(Array.isArray(data) ? data : [])
    setCarregando(false)
  }, [usuario])

  useEffect(() => { carregarDados() }, [carregarDados])

  const onDrop = useCallback(async (files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    setImportResult(null)
    try {
      const buffer = await files[0].arrayBuffer()
      const rows = parseDtoDistribuicaoExcel(buffer)

      if (rows.length === 0) {
        setImportResult({ tipo: 'erro', mensagem: 'Nenhum registro de BEES, DEVOLUÇÃO, TML ou RETORNO DE ROTA encontrado na planilha.' })
        setUploadando(false)
        return
      }

      const rowsComFilial = rows.map(r => ({ ...r, filial: usuario.filial }))
      const rowsDedup = Array.from(
        new Map(rowsComFilial.map(r => [`${r.filial}|${r.tipo}|${r.colaborador_nome}|${r.data_avaliacao}|${r.questao}`, r])).values()
      )

      let erroEncontrado: string | null = null
      for (let i = 0; i < rowsDedup.length; i += 50) {
        const lote = rowsDedup.slice(i, i + 50)
        const { error } = await supabase.from('dto_distribuicao_avaliacoes')
          .upsert(lote, { onConflict: 'filial,tipo,colaborador_nome,data_avaliacao,questao' })
        if (error) {
          if (!error.message.includes('cannot affect row a second time')) { erroEncontrado = error.message; break }
          for (const linha of lote) {
            const { error: errLinha } = await supabase.from('dto_distribuicao_avaliacoes')
              .upsert([linha], { onConflict: 'filial,tipo,colaborador_nome,data_avaliacao,questao' })
            if (errLinha) { erroEncontrado = errLinha.message; break }
          }
          if (erroEncontrado) break
        }
      }

      if (erroEncontrado) {
        setImportResult({ tipo: 'erro', mensagem: `Erro ao salvar: ${erroEncontrado}` })
      } else {
        const porTipo = TIPOS.map(t => `${rowsDedup.filter(r => r.tipo === t).length} ${t}`).filter(s => !s.startsWith('0 ')).join(', ')
        const duplicados = rows.length - rowsDedup.length
        setImportResult({ tipo: 'sucesso', mensagem: `✅ ${rowsDedup.length} registros importados (${porTipo}).${duplicados > 0 ? ` ${duplicados} linha(s) duplicada(s) na planilha foram ignoradas.` : ''} Lembre-se de importar a mesma planilha também na tela de GSDPQ.` })
        await carregarDados()
      }
    } catch (e) {
      setImportResult({ tipo: 'erro', mensagem: `Erro inesperado: ${String(e)}` })
    } finally {
      setUploadando(false)
    }
  }, [usuario, carregarDados])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'text/csv': ['.csv'] },
    multiple: false,
  })

  const avaliacoesDoTipo = useMemo(() => avaliacoes.filter(a => a.tipo === tipoSelecionado), [avaliacoes, tipoSelecionado])

  // Filtro base: equipe + busca por colaborador (sem período — usado na aba mensal)
  const avaliacoesBase = useMemo(() => avaliacoesDoTipo.filter(av => {
    if (filtroEquipe !== 'Todas' && av.equipe !== filtroEquipe) return false
    if (filtroColaborador.trim() && !av.colaborador_nome.toUpperCase().includes(filtroColaborador.trim().toUpperCase())) return false
    return true
  }), [avaliacoesDoTipo, filtroEquipe, filtroColaborador])

  // Filtro completo: equipe + busca + período
  const avaliacoesFiltradas = useMemo(() => avaliacoesBase.filter(av => {
    if (filtroPeriodo.de || filtroPeriodo.ate) {
      const d = parseAvDate(av.data_avaliacao)
      if (filtroPeriodo.de && (!d || d < new Date(filtroPeriodo.de + 'T00:00:00'))) return false
      if (filtroPeriodo.ate && (!d || d > new Date(filtroPeriodo.ate + 'T00:00:00'))) return false
    }
    return true
  }), [avaliacoesBase, filtroPeriodo])

  const resumos = useMemo(() => calcularResumos(avaliacoesFiltradas), [avaliacoesFiltradas])
  const rankingQuestoes = useMemo(() => calcularRankingQuestoes(avaliacoesFiltradas), [avaliacoesFiltradas])
  const evolucaoMensal = useMemo(() => calcularEvolucaoMensal(avaliacoesBase), [avaliacoesBase])
  const equipes = useMemo(() => ['Todas', ...Array.from(new Set(avaliacoesDoTipo.map(a => a.equipe).filter(Boolean) as string[]))], [avaliacoesDoTipo])

  const totalNO = resumos.reduce((s, r) => s + r.totalNO, 0)
  const totalOK = resumos.reduce((s, r) => s + r.totalOK, 0)
  const conformidadeGeral = totalNO + totalOK > 0 ? Math.round((totalOK / (totalNO + totalOK)) * 100) : 0
  const comReincidencia = resumos.filter(r => r.reincidencias.length > 0).length

  const conformidadePorTipo = useMemo(() => {
    return TIPOS.map(tipo => {
      const avs = avaliacoes.filter(a => a.tipo === tipo)
      const ok = avs.filter(a => a.resultado === 'OK').length
      const no = avs.filter(a => a.resultado === 'NO').length
      return { tipo, conformidade: ok + no > 0 ? Math.round((ok / (ok + no)) * 100) : 0, total: avs.length }
    }).filter(t => t.total > 0)
  }, [avaliacoes])

  function exportarExcel() {
    const dados = resumos.map(r => ({
      'Colaborador': r.nome,
      'Função': r.funcao,
      'Equipe': r.equipe,
      'Avaliações': r.totalAvaliacoes,
      'Total NOs': r.totalNO,
      'Conformidade (%)': r.percentualConformidade,
      'Reincidências': r.reincidencias.length,
    }))
    const ws = XLSX.utils.json_to_sheet(dados)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tipoSelecionado)
    XLSX.writeFile(wb, `DTO_${tipoSelecionado}_${usuario?.filial}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
  }

  return (
    <div className="p-8 max-w-6xl">
      {importResult && (
        <div className={`mb-4 flex items-center justify-between px-4 py-3 rounded-lg border text-sm font-medium ${
          importResult.tipo === 'sucesso'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <span>{importResult.mensagem}</span>
          <button onClick={() => setImportResult(null)} className="ml-4 text-current opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">DTO Distribuição</h2>
          {usuario && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={12} /> {usuario.filial} · BEES, DEVOLUÇÃO, TML e RETORNO DE ROTA</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregarDados} disabled={carregando} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
          {resumos.length > 0 && (
            <button onClick={exportarExcel} className="flex items-center gap-2 text-sm text-brand-700 hover:text-brand-900 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50">
              <Download size={14} /> Exportar
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
          <input {...getInputProps()} />
          {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <Upload size={24} className="mx-auto text-gray-400 mb-1" />}
          <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste a planilha de checklist (.xlsx)'}</p>
          <p className="text-xs text-gray-400 mt-0.5">A mesma planilha do GSDPQ — aqui só as linhas de BEES, DEVOLUÇÃO, TML e RETORNO DE ROTA são importadas</p>
        </div>
      </div>

      {conformidadePorTipo.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><ShieldCheck size={15} /> Conformidade por categoria</h3>
          <ResponsiveContainer width="100%" height={Math.max(120, conformidadePorTipo.length * 45)}>
            <BarChart data={conformidadePorTipo} layout="vertical" margin={{ left: 110 }}>
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="tipo" width={100} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Bar dataKey="conformidade" radius={[0, 4, 4, 0]}>
                {conformidadePorTipo.map(t => <Cell key={t.tipo} fill={COR_TIPO[t.tipo]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {TIPOS.map(t => {
          const total = avaliacoes.filter(a => a.tipo === t).length
          return (
            <button
              key={t}
              onClick={() => { setTipoSelecionado(t); setFiltroEquipe('Todas'); setFiltroColaborador(''); setFiltroPeriodo({ de: '', ate: '' }) }}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg ${tipoSelecionado === t ? 'bg-brand-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {t} {total > 0 && <span className="opacity-70">({total})</span>}
            </button>
          )
        })}
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
        </div>
      ) : avaliacoesDoTipo.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma avaliação de {tipoSelecionado} encontrada. Faça o upload da planilha para começar.</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-medium w-20">Colaborador:</span>
              <div className="relative flex-1 max-w-xs">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={filtroColaborador}
                  onChange={e => setFiltroColaborador(e.target.value)}
                  placeholder="Buscar por nome..."
                  className="w-full pl-7 pr-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
            {equipes.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2.5">
                <span className="text-xs text-gray-500 font-medium w-20">Equipe:</span>
                {equipes.map(e => (
                  <button key={e} onClick={() => setFiltroEquipe(e)} className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${filtroEquipe === e ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{e}</button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-2.5">
              <span className="text-xs text-gray-500 font-medium w-20">Período:</span>
              <input type="date" value={filtroPeriodo.de} max={filtroPeriodo.ate || undefined} onChange={e => setFiltroPeriodo(p => ({ ...p, de: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
              <span className="text-xs text-gray-400">até</span>
              <input type="date" value={filtroPeriodo.ate} min={filtroPeriodo.de || undefined} onChange={e => setFiltroPeriodo(p => ({ ...p, ate: e.target.value }))} className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
              {(filtroPeriodo.de || filtroPeriodo.ate || filtroEquipe !== 'Todas' || filtroColaborador) && (
                <button onClick={() => { setFiltroPeriodo({ de: '', ate: '' }); setFiltroEquipe('Todas'); setFiltroColaborador('') }} className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {/* Alerta reincidências */}
          {comReincidencia > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm text-orange-800">
              <AlertTriangle size={18} className="shrink-0 text-orange-500" />
              <span><strong>{comReincidencia} colaborador{comReincidencia > 1 ? 'es' : ''}</strong> com reincidência no mesmo item de checklist.</span>
            </div>
          )}

          {/* Abas */}
          <div className="flex gap-1 border-b border-gray-200">
            {([['dashboard', 'Dashboard'], ['colaboradores', 'Por Colaborador'], ['questoes', 'Questões'], ['mensal', 'Mês a Mês']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setAbaAtiva(id)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${abaAtiva === id ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{label}</button>
            ))}
          </div>

          {/* ── Dashboard ── */}
          {abaAtiva === 'dashboard' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Avaliações', value: resumos.reduce((s, r) => s + Object.keys(r.avaliacoesPorData).length, 0), icon: ClipboardList, color: 'blue' },
                  { label: 'Colaboradores', value: resumos.length, icon: Users, color: 'purple' },
                  { label: 'Total de NOs', value: totalNO, icon: XCircle, color: 'red' },
                  { label: 'Conformidade', value: `${conformidadeGeral}%`, icon: BarChart2, color: conformidadeGeral >= 80 ? 'green' : conformidadeGeral >= 60 ? 'yellow' : 'red' },
                ].map(({ label, value, icon: Icon, color }) => {
                  const colorMap: Record<string, string> = { blue: 'bg-blue-50 text-blue-700', purple: 'bg-purple-50 text-purple-700', red: 'bg-red-50 text-red-600', green: 'bg-brand-50 text-brand-700', yellow: 'bg-yellow-50 text-yellow-600' }
                  return (
                    <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg ${colorMap[color]}`}><Icon size={20} /></div>
                      <div><p className="text-xs text-gray-500">{label}</p><p className={`text-2xl font-bold ${color === 'red' ? 'text-red-600' : 'text-gray-900'}`}>{value}</p></div>
                    </div>
                  )
                })}
              </div>

              {/* Top 5 mais NOs */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-700 mb-3">Top 5 — Mais NOs</p>
                <div className="space-y-2">
                  {resumos.slice(0, 5).map((r, i) => (
                    <div key={r.nome} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-gray-700">{r.nome}</span>
                          <span className="text-red-600 font-bold">{r.totalNO} NOs</span>
                        </div>
                        <ConformidadeBar pct={r.percentualConformidade} />
                      </div>
                    </div>
                  ))}
                  {resumos.length === 0 && <p className="text-center py-6 text-gray-400 text-sm">Nenhum dado</p>}
                </div>
              </div>
            </div>
          )}

          {/* ── Por Colaborador ── */}
          {abaAtiva === 'colaboradores' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Colaborador</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Aval.</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">NOs</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Reinc.</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-44">Conformidade</th>
                  </tr>
                </thead>
                <tbody>
                  {resumos.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Nenhum dado</td></tr>}
                  {resumos.map(r => (
                    <ColaboradorRow key={r.nome} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Questões ── */}
          {abaAtiva === 'questoes' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-xs text-gray-500 font-medium">Questões com NOs — ordenadas por frequência</span>
              </div>
              {rankingQuestoes.length === 0
                ? <p className="text-center py-10 text-gray-400">Nenhum NO registrado</p>
                : <div className="divide-y divide-gray-100">
                    {rankingQuestoes.map((q, i) => {
                      const total = q.NO + q.OK
                      const pct = total > 0 ? Math.round((q.NO / total) * 100) : 0
                      return (
                        <div key={q.questao} className="px-4 py-3 flex items-center gap-4">
                          <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                          <p className="flex-1 min-w-0 text-sm text-gray-700">{q.questao}</p>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="flex items-center gap-1 text-xs text-brand-700"><CheckCircle size={13} />{q.OK}</span>
                            <span className="flex items-center gap-1 text-xs text-red-600 font-bold"><XCircle size={13} />{q.NO}</span>
                            <div className="w-20"><ConformidadeBar pct={100 - pct} /></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          )}

          {/* ── Mês a Mês ── */}
          {abaAtiva === 'mensal' && (
            <div className="space-y-5">
              {evolucaoMensal.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
                  Nenhuma data válida encontrada para montar a análise mensal.
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <p className="text-sm font-semibold text-gray-700 mb-4">Evolução de Conformidade — Mês a Mês</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={evolucaoMensal}>
                        <XAxis dataKey="mesLabel" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" width={36} />
                        <Tooltip formatter={(v) => [`${v}%`, 'Conformidade']} />
                        <Line type="monotone" dataKey="conformidade" stroke="#1a4451" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600">Mês</th>
                          <th className="text-center px-4 py-2.5 font-medium text-gray-600">OK</th>
                          <th className="text-center px-4 py-2.5 font-medium text-gray-600">NO</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-44">Conformidade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {evolucaoMensal.slice().reverse().map(m => (
                          <tr key={m.mes} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-900">{m.mesLabel}</td>
                            <td className="px-4 py-2.5 text-center text-brand-700">{m.OK}</td>
                            <td className="px-4 py-2.5 text-center text-red-600 font-medium">{m.NO}</td>
                            <td className="px-4 py-2.5"><ConformidadeBar pct={m.conformidade} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      )}

      {avaliacoesDoTipo.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          Última avaliação importada: {formatarDataBR(avaliacoesDoTipo[0]?.data_avaliacao)}
        </p>
      )}
    </div>
  )
}
