import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import {
  FileSpreadsheet, ChevronDown, ChevronUp, AlertTriangle,
  CheckCircle, XCircle, Users, ClipboardList, BarChart2, RefreshCw
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface AvaliacaoRow {
  filial: string
  matricula: string
  realizadoPor: string
  colaborador: string
  equipe: string
  data: string
  observacoes: string
  respostas: Record<string, string> // questão -> OK | NO | NA
}

interface ResumoColaborador {
  colaborador: string
  matricula: string
  equipe: string
  totalAvaliacoes: number
  totalNO: number
  totalOK: number
  totalNA: number
  percentualConformidade: number
  reincidencias: { questao: string; vezes: number }[]
  avaliacoes: AvaliacaoRow[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseExcel(buffer: ArrayBuffer): { rows: AvaliacaoRow[]; questoes: string[] } {
  const wb = XLSX.read(buffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false })

  if (raw.length === 0) return { rows: [], questoes: [] }

  // Questões = todas as colunas após as 13 primeiras
  const todasColunas = Object.keys(raw[0])
  const questoes = todasColunas.slice(13).filter(q => q.trim() !== '')

  const rows: AvaliacaoRow[] = raw.map(r => {
    const cols = Object.keys(r)
    const respostas: Record<string, string> = {}
    questoes.forEach(q => { respostas[q] = (r[q] ?? '').toString().toUpperCase().trim() })

    return {
      filial: r[cols[1]] ?? '',
      matricula: String(r[cols[2]] ?? ''),
      realizadoPor: r[cols[3]] ?? '',
      colaborador: r[cols[5]] ?? '',
      equipe: r[cols[7]] ?? '',
      data: r[cols[9]] ?? '',
      observacoes: r[cols[12]] ?? '',
      respostas,
    }
  }).filter(r => r.colaborador.trim() !== '')

  return { rows, questoes }
}

function calcularResumos(rows: AvaliacaoRow[], questoes: string[]): ResumoColaborador[] {
  const mapa = new Map<string, AvaliacaoRow[]>()
  rows.forEach(r => {
    const key = r.colaborador.trim()
    if (!mapa.has(key)) mapa.set(key, [])
    mapa.get(key)!.push(r)
  })

  return Array.from(mapa.entries()).map(([colaborador, avs]) => {
    let totalNO = 0, totalOK = 0, totalNA = 0
    const nosPorQuestao: Record<string, number> = {}

    avs.forEach(av => {
      questoes.forEach(q => {
        const v = av.respostas[q]
        if (v === 'NO') { totalNO++; nosPorQuestao[q] = (nosPorQuestao[q] ?? 0) + 1 }
        else if (v === 'OK') totalOK++
        else if (v === 'NA') totalNA++
      })
    })

    const reincidencias = Object.entries(nosPorQuestao)
      .filter(([, v]) => v > 1)
      .map(([questao, vezes]) => ({ questao, vezes }))
      .sort((a, b) => b.vezes - a.vezes)

    const totalRespondidas = totalNO + totalOK
    const percentualConformidade = totalRespondidas > 0
      ? Math.round((totalOK / totalRespondidas) * 100)
      : 100

    return {
      colaborador,
      matricula: avs[0].matricula,
      equipe: avs[0].equipe,
      totalAvaliacoes: avs.length,
      totalNO,
      totalOK,
      totalNA,
      percentualConformidade,
      reincidencias,
      avaliacoes: avs.sort((a, b) => a.data.localeCompare(b.data)),
    }
  }).sort((a, b) => b.totalNO - a.totalNO)
}

function calcularRankingQuestoes(rows: AvaliacaoRow[], questoes: string[]) {
  const counts: Record<string, { NO: number; OK: number; NA: number }> = {}
  questoes.forEach(q => { counts[q] = { NO: 0, OK: 0, NA: 0 } })
  rows.forEach(r => {
    questoes.forEach(q => {
      const v = r.respostas[q]
      if (v === 'NO') counts[q].NO++
      else if (v === 'OK') counts[q].OK++
      else if (v === 'NA') counts[q].NA++
    })
  })
  return questoes
    .map(q => ({ questao: q, ...counts[q] }))
    .filter(q => q.NO > 0)
    .sort((a, b) => b.NO - a.NO)
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function ColaboradorRow({ r, questoes }: { r: ResumoColaborador; questoes: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            <div>
              <p className="font-medium text-gray-900 text-sm">{r.colaborador}</p>
              <p className="text-xs text-gray-400">{r.equipe}</p>
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
                <AlertTriangle size={11} /> {r.reincidencias.length} {r.reincidencias.length === 1 ? 'item' : 'itens'}
              </span>
            : <span className="text-xs text-gray-400">—</span>
          }
        </td>
        <td className="px-4 py-3 w-40">
          <ConformidadeBar pct={r.percentualConformidade} />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            {/* Reincidências */}
            {r.reincidencias.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-orange-700 uppercase mb-2 flex items-center gap-1">
                  <AlertTriangle size={12} /> Reincidências (mesmo item com NO em mais de 1 avaliação)
                </p>
                <div className="flex flex-wrap gap-2">
                  {r.reincidencias.map(re => (
                    <span key={re.questao} className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded border border-orange-200">
                      <strong>{re.vezes}x</strong> — {re.questao.length > 70 ? re.questao.slice(0, 70) + '…' : re.questao}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Avaliações */}
            <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Histórico de avaliações</p>
            <div className="space-y-3">
              {r.avaliacoes.map((av, i) => {
                const nos = questoes.filter(q => av.respostas[q] === 'NO')
                return (
                  <div key={i} className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-xs font-semibold text-gray-700">{av.data}</span>
                        <span className="text-xs text-gray-400 ml-2">por {av.realizadoPor}</span>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${nos.length === 0 ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700'}`}>
                        {nos.length === 0 ? '✓ Sem NOs' : `${nos.length} NO${nos.length > 1 ? 's' : ''}`}
                      </span>
                    </div>
                    {nos.length > 0 && (
                      <div className="mb-2 flex flex-col gap-1">
                        {nos.map(q => (
                          <p key={q} className="text-xs text-red-700 flex items-start gap-1">
                            <XCircle size={11} className="mt-0.5 shrink-0" />
                            {q}
                          </p>
                        ))}
                      </div>
                    )}
                    {av.observacoes && (
                      <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-2 mt-2">
                        "{av.observacoes}"
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Gsdpq() {
  const [rows, setRows] = useState<AvaliacaoRow[]>([])
  const [questoes, setQuestoes] = useState<string[]>([])
  const [filtroEquipe, setFiltroEquipe] = useState('Todas')
  const [abaAtiva, setAbaAtiva] = useState<'colaboradores' | 'questoes'>('colaboradores')

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    const { rows: r, questoes: q } = parseExcel(buffer)
    setRows(r)
    setQuestoes(q)
    setFiltroEquipe('Todas')
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  })

  const equipes = ['Todas', ...Array.from(new Set(rows.map(r => r.equipe).filter(Boolean)))]
  const rowsFiltrados = filtroEquipe === 'Todas' ? rows : rows.filter(r => r.equipe === filtroEquipe)

  const resumos = calcularResumos(rowsFiltrados, questoes)
  const rankingQuestoes = calcularRankingQuestoes(rowsFiltrados, questoes)

  const totalNO = resumos.reduce((s, r) => s + r.totalNO, 0)
  const totalOK = resumos.reduce((s, r) => s + r.totalOK, 0)
  const conformidadeGeral = totalNO + totalOK > 0
    ? Math.round((totalOK / (totalNO + totalOK)) * 100)
    : 0
  const comReincidencia = resumos.filter(r => r.reincidencias.length > 0).length

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Análise de GSDPQs</h2>
        {rows.length > 0 && (
          <button
            onClick={() => { setRows([]); setQuestoes([]) }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Novo arquivo
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-500 hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            <FileSpreadsheet size={40} className="mx-auto mb-3 text-gray-400" />
            <p className="text-gray-700 font-medium">Arraste o arquivo GSDPQ aqui</p>
            <p className="text-sm text-gray-400 mt-1">ou clique para selecionar (.xlsx)</p>
          </div>
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            <p className="font-medium mb-1">Formato esperado:</p>
            <p className="text-xs">Planilha com colunas: FILIAL, MATRICULA, REALIZADO POR, COLABORADOR/FRETEIRO/PX, EQUIPE, DATA, OBSERVAÇÕES e as questões de auditoria (OK / NO / NA)</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Filtro equipe */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-600 font-medium">Equipe:</span>
            {equipes.map(e => (
              <button
                key={e}
                onClick={() => setFiltroEquipe(e)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filtroEquipe === e
                    ? 'bg-brand-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          {/* Cards de resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 rounded-lg"><ClipboardList size={20} className="text-blue-700" /></div>
              <div>
                <p className="text-xs text-gray-500">Avaliações</p>
                <p className="text-2xl font-bold text-gray-900">{rowsFiltrados.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-3">
              <div className="p-2.5 bg-purple-50 rounded-lg"><Users size={20} className="text-purple-700" /></div>
              <div>
                <p className="text-xs text-gray-500">Colaboradores</p>
                <p className="text-2xl font-bold text-gray-900">{resumos.length}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-3">
              <div className="p-2.5 bg-red-50 rounded-lg"><XCircle size={20} className="text-red-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Total de NOs</p>
                <p className="text-2xl font-bold text-red-600">{totalNO}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${conformidadeGeral >= 80 ? 'bg-brand-50' : conformidadeGeral >= 60 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                <BarChart2 size={20} className={conformidadeGeral >= 80 ? 'text-brand-700' : conformidadeGeral >= 60 ? 'text-yellow-600' : 'text-red-600'} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Conformidade</p>
                <p className={`text-2xl font-bold ${conformidadeGeral >= 80 ? 'text-brand-700' : conformidadeGeral >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {conformidadeGeral}%
                </p>
              </div>
            </div>
          </div>

          {/* Alerta reincidências */}
          {comReincidencia > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center gap-3 text-sm text-orange-800">
              <AlertTriangle size={18} className="shrink-0 text-orange-500" />
              <span><strong>{comReincidencia} colaborador{comReincidencia > 1 ? 'es' : ''}</strong> apresentam reincidência no mesmo item de auditoria — atenção prioritária necessária.</span>
            </div>
          )}

          {/* Abas */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setAbaAtiva('colaboradores')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                abaAtiva === 'colaboradores' ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Por Colaborador
            </button>
            <button
              onClick={() => setAbaAtiva('questoes')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                abaAtiva === 'questoes' ? 'border-accent-500 text-accent-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Ranking de Questões
            </button>
          </div>

          {/* Aba: Por Colaborador */}
          {abaAtiva === 'colaboradores' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Colaborador</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Avaliações</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">NOs</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Reincidências</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-48">Conformidade</th>
                  </tr>
                </thead>
                <tbody>
                  {resumos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-gray-400">Nenhum dado encontrado</td>
                    </tr>
                  )}
                  {resumos.map(r => (
                    <ColaboradorRow key={r.colaborador} r={r} questoes={questoes} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Aba: Ranking Questões */}
          {abaAtiva === 'questoes' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {rankingQuestoes.length === 0 ? (
                <p className="text-center py-10 text-gray-400">Nenhum NO registrado</p>
              ) : (
                <>
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs text-gray-500 font-medium">
                    Questões ordenadas por quantidade de NOs (somente questões com pelo menos 1 NO)
                  </div>
                  <div className="divide-y divide-gray-100">
                    {rankingQuestoes.map((q, i) => {
                      const total = q.NO + q.OK
                      const pct = total > 0 ? Math.round((q.NO / total) * 100) : 0
                      return (
                        <div key={q.questao} className="px-4 py-3 flex items-center gap-4">
                          <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                          <p className="flex-1 text-sm text-gray-700">{q.questao}</p>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex items-center gap-1 text-xs text-brand-700">
                              <CheckCircle size={13} />{q.OK}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-red-600 font-bold">
                              <XCircle size={13} />{q.NO}
                            </div>
                            <div className="w-20">
                              <ConformidadeBar pct={100 - pct} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
