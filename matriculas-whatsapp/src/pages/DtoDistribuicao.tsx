import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import {
  Upload, Loader2, Building2, RefreshCw, Download, ClipboardList,
  ShieldCheck, AlertTriangle,
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

interface ResumoColaborador {
  nome: string
  equipe: string
  funcao: string
  totalNO: number
  totalOK: number
  totalAvaliacoes: number
  percentualConformidade: number
  reincidencias: { questao: string; vezes: number }[]
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

    avs.forEach(av => {
      if (av.resultado === 'NO') {
        totalNO++
        nosPorQuestao[av.questao] = (nosPorQuestao[av.questao] ?? 0) + 1
      } else if (av.resultado === 'OK') totalOK++
    })

    const reincidencias = Object.entries(nosPorQuestao)
      .filter(([, v]) => v > 1)
      .map(([questao, vezes]) => ({ questao, vezes }))
      .sort((a, b) => b.vezes - a.vezes)

    return {
      nome,
      equipe: avs[0]?.equipe ?? '',
      funcao: avs[0]?.funcao ?? '',
      totalNO, totalOK,
      totalAvaliacoes: totalNO + totalOK,
      percentualConformidade: totalNO + totalOK > 0 ? Math.round((totalOK / (totalNO + totalOK)) * 100) : 100,
      reincidencias,
    }
  }).sort((a, b) => a.percentualConformidade - b.percentualConformidade)
}

export default function DtoDistribuicao() {
  const { usuario } = useAuth()
  const [avaliacoes, setAvaliacoes] = useState<DtoDistribuicaoAvaliacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [uploadando, setUploadando] = useState(false)
  const [importResult, setImportResult] = useState<{ tipo: 'sucesso' | 'erro'; mensagem: string } | null>(null)
  const [tipoSelecionado, setTipoSelecionado] = useState<DtoDistribuicaoTipo>('TML')

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
  const resumos = useMemo(() => calcularResumos(avaliacoesDoTipo), [avaliacoesDoTipo])

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
              onClick={() => setTipoSelecionado(t)}
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
      ) : resumos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma avaliação de {tipoSelecionado} encontrada. Faça o upload da planilha para começar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Colaborador</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Função</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Equipe</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Avaliações</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">NOs</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Conformidade</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Reincidências</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resumos.map(r => (
                <tr key={r.nome} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.nome}</td>
                  <td className="px-4 py-3 text-gray-500">{r.funcao || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{r.equipe || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{r.totalAvaliacoes}</td>
                  <td className="px-4 py-3 text-right text-red-600 font-medium">{r.totalNO}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${r.percentualConformidade < 90 ? 'text-red-600' : 'text-green-600'}`}>
                      {r.percentualConformidade}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.reincidencias.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={11} /> {r.reincidencias.length} questão(ões) recorrente(s)
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
