import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Link } from 'react-router-dom'
import html2canvas from 'html2canvas'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Building2, Truck, CheckCircle2, XCircle, Upload, Loader2, FileSpreadsheet, MapPinned, Image, Settings } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import {
  parseDisponibilidadeDiariaCsv, parseHistoricoXlsx, resumoPorDia, disponiveisNoDia,
  rankingIndisponibilidadePorPlaca, cruzarTerritorio, placasAtivasFiltro, resumoPorPerfil,
  type FrotaDisponibilidadeInsert, type HistoricoTmlRegiao, type ResumoDiaFrota, type ResumoPerfilFrota,
} from '../lib/frota'
import { parseEscalaBuffer } from '../lib/tmlParser'
import type { FrotaDisponibilidade, FrotaPlaca } from '../types'

const TOOLTIP_STYLE = { borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }

function Card({
  icon: Icon, label, value, hint, accent = 'text-accent-600 bg-accent/40',
}: { icon: typeof Truck; label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="border rounded-xl bg-white p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold leading-tight">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  )
}

async function upsertEmLotes(rows: FrotaDisponibilidadeInsert[]): Promise<string | null> {
  for (let i = 0; i < rows.length; i += 50) {
    const lote = rows.slice(i, i + 50)
    const { error } = await supabase.from('frota_disponibilidade')
      .upsert(lote, { onConflict: 'filial,data,placa' })
    if (error) {
      if (!error.message.includes('cannot affect row a second time')) return error.message
      for (const linha of lote) {
        const { error: errLinha } = await supabase.from('frota_disponibilidade').upsert([linha], { onConflict: 'filial,data,placa' })
        if (errLinha) return errLinha.message
      }
    }
  }
  return null
}

// Cadastra placas novas em frota_placas (ativo=true, perfil em branco) sem
// sobrescrever o que já existe — quem edita ativo/perfil é a tela de Placas.
async function semearPlacas(filial: string, rows: { placa: string }[]) {
  const placasUnicas = Array.from(new Set(rows.map(r => r.placa)))
  const inserts = placasUnicas.map(placa => ({ filial, placa }))
  for (let i = 0; i < inserts.length; i += 50) {
    await supabase.from('frota_placas').upsert(inserts.slice(i, i + 50), { onConflict: 'filial,placa', ignoreDuplicates: true })
  }
}

export default function Frota() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'disponibilidade' | 'territorio'>('disponibilidade')
  const [registros, setRegistros] = useState<FrotaDisponibilidade[]>([])
  const [historicoTml, setHistoricoTml] = useState<HistoricoTmlRegiao[]>([])
  const [placas, setPlacas] = useState<FrotaPlaca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [uploadando, setUploadando] = useState(false)
  const [importResult, setImportResult] = useState<{ tipo: 'sucesso' | 'erro'; mensagem: string } | null>(null)
  const [diaTerritorio, setDiaTerritorio] = useState<string>('todos')
  const [exportandoImg, setExportandoImg] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const carregarDados = useCallback(async () => {
    if (!usuario) return
    setCarregando(true)
    const [{ data }, { data: dataTml }, { data: dataTerritorioHist }, { data: dataPlacas }] = await Promise.all([
      supabase.from('frota_disponibilidade')
        .select('*')
        .eq('filial', usuario.filial)
        .order('data', { ascending: true }),
      supabase.from('historico_tml')
        .select('placa, data_saida, regiao_entregas')
        .eq('filial', usuario.filial)
        .not('regiao_entregas', 'is', null),
      supabase.from('frota_territorio_historico')
        .select('placa, data, regiao_entregas')
        .eq('filial', usuario.filial)
        .not('regiao_entregas', 'is', null),
      supabase.from('frota_placas').select('*').eq('filial', usuario.filial),
    ])
    setRegistros((data ?? []) as FrotaDisponibilidade[])
    setHistoricoTml([
      ...((dataTml ?? []) as HistoricoTmlRegiao[]),
      ...((dataTerritorioHist ?? []) as { placa: string | null; data: string | null; regiao_entregas: string | null }[])
        .map(r => ({ placa: r.placa, data_saida: r.data, regiao_entregas: r.regiao_entregas })),
    ])
    setPlacas((dataPlacas ?? []) as FrotaPlaca[])
    setCarregando(false)
  }, [usuario])

  useEffect(() => { carregarDados() }, [carregarDados])

  const onDropCsv = useCallback((files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const texto = (e.target?.result as string) ?? ''
        const rows = parseDisponibilidadeDiariaCsv(texto, usuario.filial)
        if (rows.length === 0) {
          setImportResult({ tipo: 'erro', mensagem: 'Nenhuma linha encontrada. Verifique se o arquivo é o relatório de Frota Disponibilizada (.csv).' })
          setUploadando(false)
          return
        }
        const erro = await upsertEmLotes(rows)
        if (erro) {
          setImportResult({ tipo: 'erro', mensagem: `Erro ao salvar: ${erro}` })
        } else {
          await semearPlacas(usuario.filial, rows)
          setImportResult({ tipo: 'sucesso', mensagem: `✅ ${rows.length} placas importadas (${formatarDataBR(rows[0].data)}).` })
          await carregarDados()
        }
      } catch (err) {
        setImportResult({ tipo: 'erro', mensagem: `Erro inesperado: ${String(err)}` })
      } finally {
        setUploadando(false)
      }
    }
    reader.readAsText(files[0], 'ISO-8859-1')
  }, [usuario, carregarDados])

  const onDropHistorico = useCallback(async (files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    setImportResult(null)
    try {
      const buffer = await files[0].arrayBuffer()
      const rows = parseHistoricoXlsx(buffer, usuario.filial)
      if (rows.length === 0) {
        setImportResult({ tipo: 'erro', mensagem: 'Nenhuma linha encontrada para esta filial no Histórico.' })
        setUploadando(false)
        return
      }
      const rowsDedup = Array.from(new Map(rows.map(r => [`${r.filial}|${r.data}|${r.placa}`, r])).values())
      const erro = await upsertEmLotes(rowsDedup)
      if (erro) {
        setImportResult({ tipo: 'erro', mensagem: `Erro ao salvar histórico: ${erro}` })
      } else {
        await semearPlacas(usuario.filial, rowsDedup)
        const duplicados = rows.length - rowsDedup.length
        setImportResult({ tipo: 'sucesso', mensagem: `✅ ${rowsDedup.length} registros do histórico importados.${duplicados > 0 ? ` ${duplicados} linha(s) duplicada(s) foram ignoradas.` : ''}` })
        await carregarDados()
      }
    } catch (e) {
      setImportResult({ tipo: 'erro', mensagem: `Erro inesperado: ${String(e)}` })
    } finally {
      setUploadando(false)
    }
  }, [usuario, carregarDados])

  // Carga única do histórico de roteirização (PCD/RoadShow) anterior à
  // captura automática via Escala do dia — mesmo formato de planilha,
  // por isso reaproveita o parser da Escala (parseEscalaBuffer).
  const onDropTerritorioHistorico = useCallback(async (files: File[]) => {
    if (!usuario || !files[0]) return
    setUploadando(true)
    setImportResult(null)
    try {
      const buffer = await files[0].arrayBuffer()
      const escalas = parseEscalaBuffer(buffer)
      const rows = escalas
        .filter(e => e.placa && e.dataEntrega && e.regiaoEntregas)
        .map(e => ({ filial: usuario.filial, mapa: e.mapa, placa: e.placa, data: e.dataEntrega, regiao_entregas: e.regiaoEntregas }))
      if (rows.length === 0) {
        setImportResult({ tipo: 'erro', mensagem: 'Nenhuma linha com região de entregas encontrada nesta planilha.' })
        setUploadando(false)
        return
      }
      const rowsDedup = Array.from(new Map(rows.map(r => [`${r.filial}|${r.mapa}`, r])).values())
      let erro: string | null = null
      for (let i = 0; i < rowsDedup.length; i += 50) {
        const lote = rowsDedup.slice(i, i + 50)
        const { error } = await supabase.from('frota_territorio_historico').upsert(lote, { onConflict: 'filial,mapa' })
        if (error) { erro = error.message; break }
      }
      if (erro) {
        setImportResult({ tipo: 'erro', mensagem: `Erro ao salvar histórico de território: ${erro}` })
      } else {
        setImportResult({ tipo: 'sucesso', mensagem: `✅ ${rowsDedup.length} registros de território histórico importados.` })
        await carregarDados()
      }
    } catch (e) {
      setImportResult({ tipo: 'erro', mensagem: `Erro inesperado: ${String(e)}` })
    } finally {
      setUploadando(false)
    }
  }, [usuario, carregarDados])

  const { getRootProps: getRootCsv, getInputProps: getInputCsv, isDragActive: isDragCsv } = useDropzone({
    onDrop: onDropCsv,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  })

  const { getRootProps: getRootHistorico, getInputProps: getInputHistorico, isDragActive: isDragHistorico } = useDropzone({
    onDrop: onDropHistorico,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false,
  })

  const { getRootProps: getRootTerritorioHist, getInputProps: getInputTerritorioHist, isDragActive: isDragTerritorioHist } = useDropzone({
    onDrop: onDropTerritorioHistorico,
    accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
    multiple: false,
  })

  async function exportarImagem() {
    if (!exportRef.current) return
    setExportandoImg(true)
    try {
      const canvas = await html2canvas(exportRef.current, { scale: 1.5, backgroundColor: '#f8fafc', useCORS: true, logging: false })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `Frota_Disponibilidade_${(ultimo?.data ?? '').split('-').reverse().join('-')}.png`
      a.click()
    } finally {
      setExportandoImg(false)
    }
  }

  const registrosAtivos = useMemo(() => placasAtivasFiltro(registros, placas), [registros, placas])
  const resumos = useMemo(() => resumoPorDia(registrosAtivos), [registrosAtivos])
  const ultimo = resumos[resumos.length - 1] ?? null
  const grafico = resumos.map(r => ({ data: formatarDataBR(r.data), percentual: r.percentual }))
  const disponiveis = ultimo ? disponiveisNoDia(registrosAtivos, ultimo.data) : []
  const ranking = useMemo(() => rankingIndisponibilidadePorPlaca(registrosAtivos).filter(r => r.diasIndisponivel > 0), [registrosAtivos])
  const perfis = ultimo ? resumoPorPerfil(registrosAtivos.filter(r => r.data === ultimo.data), placas) : []
  const cruzamento = useMemo(() => cruzarTerritorio(registrosAtivos, historicoTml), [registrosAtivos, historicoTml])
  const comDado = useMemo(() => cruzamento.filter(c => c.bate !== null), [cruzamento])
  const diasComDado = useMemo(() => Array.from(new Set(comDado.map(c => c.data))).sort((a, b) => b.localeCompare(a)), [comDado])
  const comDadoFiltrado = diaTerritorio === 'todos' ? comDado : comDado.filter(c => c.data === diaTerritorio)
  const aderencia = comDadoFiltrado.length > 0 ? Math.round((comDadoFiltrado.filter(c => c.bate).length / comDadoFiltrado.length) * 100) : null

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
          <h2 className="text-2xl font-bold text-gray-900">Frota</h2>
          {usuario && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={12} /> {usuario.filial}</p>}
        </div>
        <Link to="/distribuicao/frota/placas" className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
          <Settings size={14} /> Cadastro de placas
        </Link>
      </div>

      <div className="flex gap-4 mb-4 border-b border-gray-200">
        <button onClick={() => setAba('disponibilidade')} className={`text-sm font-medium px-3 py-2 border-b-2 ${aba === 'disponibilidade' ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Disponibilidade
        </button>
        <button onClick={() => setAba('territorio')} className={`text-sm font-medium px-3 py-2 border-b-2 flex items-center gap-1 ${aba === 'territorio' ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          <MapPinned size={14} /> Fixação de Território
        </button>
      </div>

      {aba === 'disponibilidade' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Envio diário (relatório Frota Disponibilizada, .csv)</p>
                <div {...getRootCsv()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${isDragCsv ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
                  <input {...getInputCsv()} />
                  {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <Upload size={24} className="mx-auto text-gray-400 mb-1" />}
                  <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste o relatório do dia (.csv)'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Histórico (carga única, .xlsx)</p>
                <div {...getRootHistorico()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${isDragHistorico ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
                  <input {...getInputHistorico()} />
                  {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <FileSpreadsheet size={24} className="mx-auto text-gray-400 mb-1" />}
                  <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste a planilha de Histórico (.xlsx)'}</p>
                </div>
              </div>
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
            </div>
          ) : !ultimo ? (
            <div className="text-center py-16 text-gray-400">
              <Truck size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum dado de disponibilidade ainda. Importe o relatório diário ou o Histórico para começar.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">Último dia disponível: {formatarDataBR(ultimo.data)}</p>
                <button
                  onClick={exportarImagem}
                  disabled={exportandoImg}
                  className="flex items-center gap-2 text-sm text-brand-700 border border-brand-200 px-3 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-40"
                >
                  {exportandoImg ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                  Exportar resumo (imagem)
                </button>
              </div>

              <div className="grid sm:grid-cols-4 gap-4">
                <Card icon={Truck} label="Frota Contratada" value={String(ultimo.contratada)} accent="text-brand-700 bg-brand-50" />
                <Card icon={CheckCircle2} label="Disponível" value={String(ultimo.disponivel)} accent="text-green-700 bg-green-50" />
                <Card icon={XCircle} label="Indisponível" value={String(ultimo.indisponivel)} accent="text-red-700 bg-red-50" />
                <Card icon={Truck} label="% Disponibilidade" value={`${ultimo.percentual}%`} accent="text-accent-600 bg-accent/40" />
              </div>

              {perfis.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Disponibilidade por perfil ({formatarDataBR(ultimo.data)})</h3>
                  <div className="grid sm:grid-cols-4 gap-3">
                    {perfis.map(p => (
                      <div key={p.perfil} className="border border-gray-100 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 truncate">{p.perfil}</p>
                        <p className="text-lg font-bold text-gray-900">{p.disponivel}<span className="text-xs font-normal text-gray-400">/{p.contratada}</span></p>
                        <p className={`text-xs font-medium ${p.percentual >= 80 ? 'text-green-600' : p.percentual >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{p.percentual}% disponível</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <FrotaExportTemplate ref={exportRef} filial={usuario?.filial ?? ''} resumo={ultimo} perfis={perfis} />

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Tendência de % Disponibilidade</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={grafico}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="percentual" name="% Disponibilidade" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Motivos de Indisponibilidade ({formatarDataBR(ultimo.data)})</h3>
                  {ultimo.motivos.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhum veículo indisponível neste dia.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-500">
                          <th className="text-left py-2 font-medium">Motivo</th>
                          <th className="text-right py-2 font-medium">Quantidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ultimo.motivos.map(m => (
                          <tr key={m.motivo} className="border-b border-gray-50">
                            <td className="py-2 text-gray-700">{m.motivo}</td>
                            <td className="py-2 text-right font-medium text-gray-900">{m.quantidade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Placas Disponíveis ({formatarDataBR(ultimo.data)}) — {disponiveis.length}</h3>
                  {disponiveis.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhuma placa disponível neste dia.</p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white">
                          <tr className="border-b border-gray-100 text-xs text-gray-500">
                            <th className="text-left py-2 font-medium">Placa</th>
                            <th className="text-left py-2 font-medium">Frota</th>
                            <th className="text-left py-2 font-medium">Território</th>
                          </tr>
                        </thead>
                        <tbody>
                          {disponiveis.map(d => (
                            <tr key={d.id} className="border-b border-gray-50">
                              <td className="py-2 text-gray-900 font-medium">{d.placa}</td>
                              <td className="py-2 text-gray-600">{d.frota ?? '—'}</td>
                              <td className="py-2 text-gray-600">{d.regiao ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Ranking de Indisponibilidade (período completo)</h3>
                  {ranking.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhuma indisponibilidade registrada no período.</p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto -mx-1">
                      <div className="space-y-1.5 px-1">
                        {ranking.slice(0, 30).map(r => {
                          const sev = r.percentualIndisponibilidade >= 50 ? 'red' : r.percentualIndisponibilidade >= 25 ? 'amber' : 'gray'
                          const sevClasses = sev === 'red'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : sev === 'amber'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-gray-50 text-gray-600 border-gray-200'
                          return (
                            <div key={r.placa} className="flex items-center gap-3 px-2.5 py-2 rounded-lg border border-gray-100">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-900">{r.placa}</p>
                                <p className="text-xs text-gray-500 truncate">{r.diasIndisponivel} dia(s) indisponível · {r.motivos[0]?.motivo ?? '—'}</p>
                              </div>
                              <span className={`text-xs font-bold px-2 py-1 rounded-full border shrink-0 ${sevClasses}`}>
                                {r.percentualIndisponibilidade}%
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {aba === 'territorio' && (
        <div className="space-y-5">
          <p className="text-xs text-gray-500">
            Cruza o território disponibilizado das placas (relatório Frota) com a região realmente executada no dia, vinda da
            escala importada na tela TML — Carta de Controle (planilha 03.11.49.02). A partir do dia 30/06/2026 isso é capturado
            automaticamente a cada novo envio da escala diária — não precisa de upload aqui.
          </p>

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Carga única do histórico de roteirização (PCD), dias anteriores a 30/06/2026 (.xlsx)</p>
            <div {...getRootTerritorioHist()} className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors max-w-md ${isDragTerritorioHist ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-400 hover:bg-gray-50'}`}>
              <input {...getInputTerritorioHist()} />
              {uploadando ? <Loader2 size={24} className="mx-auto text-brand-500 animate-spin" /> : <FileSpreadsheet size={24} className="mx-auto text-gray-400 mb-1" />}
              <p className="text-sm text-gray-600">{uploadando ? 'Importando...' : 'Arraste a planilha histórica de roteirização (.xlsx)'}</p>
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
            </div>
          ) : comDado.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <MapPinned size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma placa roteirizada no PCD para cruzar ainda. É preciso ter placas disponíveis com território (Frota) e a escala importada na tela TML (Carta de Controle).</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500">Dia:</label>
                <select
                  value={diaTerritorio}
                  onChange={e => setDiaTerritorio(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="todos">Todos os dias</option>
                  {diasComDado.map(d => <option key={d} value={d}>{formatarDataBR(d)}</option>)}
                </select>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Card icon={CheckCircle2} label="Placas roteirizadas no PCD" value={String(comDadoFiltrado.length)} accent="text-accent-600 bg-accent/40" />
                <Card
                  icon={aderencia !== null && aderencia >= 80 ? CheckCircle2 : XCircle}
                  label="% Aderência (território x execução)"
                  value={aderencia !== null ? `${aderencia}%` : '—'}
                  accent={aderencia !== null && aderencia >= 80 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}
                />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Cruzamento por placa/dia (somente placas roteirizadas no PCD)</h3>
                <div className="max-h-[32rem] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-100 text-xs text-gray-500">
                        <th className="text-left py-2 font-medium">Data</th>
                        <th className="text-left py-2 font-medium">Placa</th>
                        <th className="text-left py-2 font-medium">Território (Frota)</th>
                        <th className="text-left py-2 font-medium">Região executada (TML)</th>
                        <th className="text-center py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comDadoFiltrado.map((c, i) => (
                        <tr key={`${c.placa}-${c.data}-${i}`} className="border-b border-gray-50">
                          <td className="py-2 text-gray-600">{formatarDataBR(c.data)}</td>
                          <td className="py-2 text-gray-900 font-medium">{c.placa}</td>
                          <td className="py-2 text-gray-600">{c.territorio}</td>
                          <td className="py-2 text-gray-600">{c.regiaoEntregas ?? '—'}</td>
                          <td className="py-2 text-center">
                            {c.bate ? (
                              <CheckCircle2 size={16} className="inline text-green-600" />
                            ) : (
                              <XCircle size={16} className="inline text-red-600" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const FrotaExportTemplate = forwardRef<HTMLDivElement, {
  filial: string
  resumo: ResumoDiaFrota | null
  perfis: ResumoPerfilFrota[]
}>(function FrotaExportTemplate({ filial, resumo, perfis }, ref) {
  const th: React.CSSProperties = { padding: '8px 12px', fontSize: '10px', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: '12px', verticalAlign: 'middle' }

  if (!resumo) return <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0 }} />

  return (
    <div ref={ref} style={{ position: 'absolute', left: '-9999px', top: 0, width: '600px', fontFamily: 'Inter, system-ui, sans-serif', background: '#f8fafc', padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1e3a5f', paddingBottom: '12px', marginBottom: '20px' }}>
        <div>
          <p style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 3px' }}>Frota</p>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Resumo de Disponibilidade</h1>
        </div>
        <p style={{ fontSize: '12px', color: '#475569', textAlign: 'right', margin: 0 }}>{filial}<br />{formatarDataBR(resumo.data)}</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Contratada', valor: resumo.contratada, cor: '#1e3a5f' },
          { label: 'Disponível', valor: resumo.disponivel, cor: '#16a34a' },
          { label: 'Indisponível', valor: resumo.indisponivel, cor: '#dc2626' },
          { label: '% Disp.', valor: `${resumo.percentual}%`, cor: '#2563eb' },
        ].map(c => (
          <div key={c.label} style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</p>
            <p style={{ fontSize: '20px', fontWeight: 800, color: c.cor, margin: 0 }}>{c.valor}</p>
          </div>
        ))}
      </div>

      {perfis.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
          <thead>
            <tr style={{ background: '#1e3a5f' }}>
              <th style={th}>Perfil</th>
              <th style={{ ...th, textAlign: 'center' }}>Contratada</th>
              <th style={{ ...th, textAlign: 'center' }}>Disponível</th>
              <th style={{ ...th, textAlign: 'center' }}>% Disp.</th>
            </tr>
          </thead>
          <tbody>
            {perfis.map((p, i) => (
              <tr key={p.perfil} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                <td style={{ ...td, fontWeight: 600, color: '#0f172a' }}>{p.perfil}</td>
                <td style={{ ...td, textAlign: 'center' }}>{p.contratada}</td>
                <td style={{ ...td, textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>{p.disponivel}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{p.percentual}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '10px', color: '#94a3b8' }}>
        Gerado em {formatarDataBR(resumo.data)}
      </div>
    </div>
  )
})
