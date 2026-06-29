import { useCallback, useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { Building2, Truck, CheckCircle2, XCircle, Upload, Loader2, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import {
  parseDisponibilidadeDiariaCsv, parseHistoricoXlsx, resumoPorDia,
  type FrotaDisponibilidadeInsert,
} from '../lib/frota'
import type { FrotaDisponibilidade } from '../types'

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

export default function Frota() {
  const { usuario } = useAuth()
  const [aba, setAba] = useState<'disponibilidade'>('disponibilidade')
  const [registros, setRegistros] = useState<FrotaDisponibilidade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [uploadando, setUploadando] = useState(false)
  const [importResult, setImportResult] = useState<{ tipo: 'sucesso' | 'erro'; mensagem: string } | null>(null)

  const carregarDados = useCallback(async () => {
    if (!usuario) return
    setCarregando(true)
    const { data } = await supabase.from('frota_disponibilidade')
      .select('*')
      .eq('filial', usuario.filial)
      .order('data', { ascending: true })
    setRegistros((data ?? []) as FrotaDisponibilidade[])
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

  const resumos = resumoPorDia(registros)
  const ultimo = resumos[resumos.length - 1] ?? null
  const grafico = resumos.map(r => ({ data: formatarDataBR(r.data), percentual: r.percentual }))

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
      </div>

      <div className="flex gap-4 mb-4 border-b border-gray-200">
        <button onClick={() => setAba('disponibilidade')} className={`text-sm font-medium px-3 py-2 border-b-2 ${aba === 'disponibilidade' ? 'border-brand-700 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Disponibilidade
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
              <p className="text-xs text-gray-400">Último dia disponível: {formatarDataBR(ultimo.data)}</p>

              <div className="grid sm:grid-cols-4 gap-4">
                <Card icon={Truck} label="Frota Contratada" value={String(ultimo.contratada)} accent="text-brand-700 bg-brand-50" />
                <Card icon={CheckCircle2} label="Disponível" value={String(ultimo.disponivel)} accent="text-green-700 bg-green-50" />
                <Card icon={XCircle} label="Indisponível" value={String(ultimo.indisponivel)} accent="text-red-700 bg-red-50" />
                <Card icon={Truck} label="% Disponibilidade" value={`${ultimo.percentual}%`} accent="text-accent-600 bg-accent/40" />
              </div>

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
            </>
          )}
        </div>
      )}
    </div>
  )
}
