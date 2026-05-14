import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { enviarMensagemWhatsApp, formatarMensagem } from '../lib/zapi'
import type { Matricula, Cliente } from '../types'
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Send, AlertTriangle } from 'lucide-react'

interface LinhaPreview {
  matricula: string
  cliente: string
  whatsapp?: string
  foto_url?: string
  status: 'encontrado' | 'nao_encontrado'
}

interface ResultadoDisparo extends LinhaPreview {
  enviado?: boolean
  erro?: string
}

const TEMPLATE_PADRAO = `Olá! Informamos que a matrícula *{{matricula}}* está vinculada ao cliente *{{cliente}}*. Em caso de dúvidas, entre em contato conosco.`

export default function Disparos() {
  const [linhas, setLinhas] = useState<LinhaPreview[]>([])
  const [resultados, setResultados] = useState<ResultadoDisparo[]>([])
  const [template, setTemplate] = useState(TEMPLATE_PADRAO)
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [etapa, setEtapa] = useState<'upload' | 'preview' | 'resultado'>('upload')

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return

    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

    if (rows.length === 0) {
      alert('Arquivo vazio ou sem dados reconhecíveis.')
      return
    }

    // Detecta colunas de matrícula e cliente (case-insensitive)
    const colunas = Object.keys(rows[0])
    const colMatricula = colunas.find(c => /matr/i.test(c)) ?? colunas[0]
    const colCliente = colunas.find(c => /cliente|nome/i.test(c)) ?? colunas[1]

    // Busca todas as matrículas e clientes do banco
    const { data: matriculasDB } = await supabase.from('matriculas').select('*').eq('ativo', true)
    const { data: clientesDB } = await supabase.from('clientes').select('*')

    const matMap = new Map<string, Matricula>((matriculasDB ?? []).map(m => [m.numero.trim(), m]))
    const cliMap = new Map<string, Cliente>((clientesDB ?? []).map(c => [c.nome.trim().toLowerCase(), c]))

    const preview: LinhaPreview[] = rows.map(row => {
      const numMatricula = String(row[colMatricula]).trim()
      const nomeCliente = String(row[colCliente]).trim()

      const mat = matMap.get(numMatricula)
      const cli = cliMap.get(nomeCliente.toLowerCase())

      return {
        matricula: numMatricula,
        cliente: nomeCliente,
        whatsapp: mat?.whatsapp,
        foto_url: cli?.foto_url ?? undefined,
        status: mat ? 'encontrado' : 'nao_encontrado',
      }
    })

    setLinhas(preview)
    setResultados([])
    setEtapa('preview')
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  })

  async function disparar() {
    const encontrados = linhas.filter(l => l.status === 'encontrado' && l.whatsapp)
    if (encontrados.length === 0) {
      alert('Nenhuma matrícula com WhatsApp válido encontrada para disparar.')
      return
    }

    setEnviando(true)
    setProgresso(0)
    const res: ResultadoDisparo[] = []

    for (let i = 0; i < encontrados.length; i++) {
      const linha = encontrados[i]
      const mensagem = formatarMensagem(template, {
        matricula: linha.matricula,
        cliente: linha.cliente,
      })

      const { sucesso, erro } = await enviarMensagemWhatsApp(linha.whatsapp!, mensagem)

      await supabase.from('disparos').insert({
        whatsapp: linha.whatsapp!,
        mensagem,
        status: sucesso ? 'enviado' : 'erro',
        erro: erro ?? null,
      })

      res.push({ ...linha, enviado: sucesso, erro })
      setProgresso(Math.round(((i + 1) / encontrados.length) * 100))
    }

    setResultados(res)
    setEnviando(false)
    setEtapa('resultado')
  }

  function reiniciar() {
    setLinhas([])
    setResultados([])
    setProgresso(0)
    setEtapa('upload')
  }

  const encontrados = linhas.filter(l => l.status === 'encontrado').length
  const naoEncontrados = linhas.filter(l => l.status === 'nao_encontrado').length

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Disparar Mensagens</h2>

      {etapa === 'upload' && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet size={40} className="mx-auto mb-3 text-gray-400" />
          <p className="text-gray-700 font-medium">Arraste um arquivo Excel ou CSV aqui</p>
          <p className="text-sm text-gray-400 mt-1">ou clique para selecionar</p>
          <p className="text-xs text-gray-400 mt-3">O arquivo deve ter colunas de Matrícula e Cliente/Nome</p>
        </div>
      )}

      {etapa === 'preview' && (
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
              <CheckCircle size={18} className="text-green-600" />
              <div>
                <p className="text-xs text-green-700">Encontradas</p>
                <p className="text-xl font-bold text-green-700">{encontrados}</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
              <XCircle size={18} className="text-red-500" />
              <div>
                <p className="text-xs text-red-600">Não encontradas</p>
                <p className="text-xl font-bold text-red-600">{naoEncontrados}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensagem a ser enviada
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Use <code className="bg-gray-100 px-1 rounded">{'{{matricula}}'}</code> e{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{cliente}}'}</code> como variáveis
            </p>
            <textarea
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs font-medium text-gray-500">
              PREVIEW — {linhas.length} linhas do arquivo
            </div>
            <div className="max-h-64 overflow-y-auto">
              {linhas.map((l, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 text-sm ${
                    l.status === 'nao_encontrado' ? 'opacity-50' : ''
                  }`}
                >
                  {l.status === 'encontrado'
                    ? <CheckCircle size={15} className="text-green-500 shrink-0" />
                    : <AlertTriangle size={15} className="text-yellow-500 shrink-0" />
                  }
                  <span className="font-mono text-gray-700 w-24 shrink-0">{l.matricula}</span>
                  <span className="text-gray-600 truncate">{l.cliente}</span>
                  {l.whatsapp && (
                    <span className="text-gray-400 text-xs ml-auto shrink-0">{l.whatsapp}</span>
                  )}
                  {l.status === 'nao_encontrado' && (
                    <span className="text-yellow-600 text-xs ml-auto shrink-0">Não cadastrada</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reiniciar} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Voltar
            </button>
            <button
              onClick={disparar}
              disabled={enviando || encontrados === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              <Send size={16} />
              {enviando
                ? `Enviando... ${progresso}%`
                : `Disparar para ${encontrados} matrículas`
              }
            </button>
          </div>

          {enviando && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${progresso}%` }}
              />
            </div>
          )}
        </div>
      )}

      {etapa === 'resultado' && (
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
              <CheckCircle size={18} className="text-green-600" />
              <div>
                <p className="text-xs text-green-700">Enviados com sucesso</p>
                <p className="text-xl font-bold text-green-700">{resultados.filter(r => r.enviado).length}</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
              <XCircle size={18} className="text-red-500" />
              <div>
                <p className="text-xs text-red-600">Erros</p>
                <p className="text-xl font-bold text-red-600">{resultados.filter(r => !r.enviado).length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              {resultados.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 text-sm">
                  {r.enviado
                    ? <CheckCircle size={15} className="text-green-500 shrink-0" />
                    : <XCircle size={15} className="text-red-500 shrink-0" />
                  }
                  <span className="font-mono text-gray-700 w-24 shrink-0">{r.matricula}</span>
                  <span className="text-gray-600 truncate">{r.cliente}</span>
                  {r.erro && <span className="text-red-500 text-xs ml-auto shrink-0 truncate max-w-40">{r.erro}</span>}
                </div>
              ))}
            </div>
          </div>

          <button onClick={reiniciar} className="px-4 py-2 text-sm bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium">
            Novo disparo
          </button>
        </div>
      )}
    </div>
  )
}
