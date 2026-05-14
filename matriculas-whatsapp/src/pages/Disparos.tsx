import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { enviarMensagemWhatsApp, enviarImagemWhatsApp, formatarMensagem } from '../lib/zapi'
import type { Matricula, Cliente } from '../types'
import { FileSpreadsheet, CheckCircle, XCircle, Send, AlertTriangle, Image } from 'lucide-react'

interface LinhaPreview {
  matricula: string
  nomeMotorista: string | null
  whatsapp?: string
  codigoCliente: string
  nomeCliente: string
  foto_url?: string
  observacoes?: string
  statusMatricula: 'encontrado' | 'nao_encontrado'
  statusCliente: 'encontrado' | 'nao_encontrado'
}

interface ResultadoDisparo extends LinhaPreview {
  enviado?: boolean
  erro?: string
}

const TEMPLATE_PADRAO = `Olá motorista! Hoje você tem entrega no cliente *{{nomeCliente}}* (Cód: {{codigoCliente}}).

{{observacoes}}`

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

    // Detecta colunas Motorista e Clientes
    const colunas = Object.keys(rows[0])
    const colMotorista = colunas.find(c => /motorista/i.test(c)) ?? colunas[0]
    const colClientes = colunas.find(c => /^clientes$/i.test(c)) ?? colunas[1]

    // Busca matrículas e clientes do banco
    const { data: matriculasDB } = await supabase.from('matriculas').select('*').eq('ativo', true)
    const { data: clientesDB } = await supabase.from('clientes').select('*')

    // Normaliza códigos removendo zeros à esquerda para comparação
    const normalizar = (s: string) => s.trim().replace(/^0+/, '') || '0'

    const matMap = new Map<string, Matricula>((matriculasDB ?? []).map(m => [normalizar(m.numero), m]))
    const cliMap = new Map<string, Cliente>((clientesDB ?? []).map(c => [normalizar(c.codigo), c]))

    const preview: LinhaPreview[] = []

    for (const row of rows) {
      const numMotorista = String(row[colMotorista]).trim()
      const clientesStr = String(row[colClientes]).trim()

      if (!numMotorista || !clientesStr) continue

      // Clientes separados por "/"
      const codigosClientes = clientesStr.split('/').map(c => c.trim()).filter(Boolean)

      const mat = matMap.get(normalizar(numMotorista))

      for (const codigoCliente of codigosClientes) {
        const cli = cliMap.get(normalizar(codigoCliente))

        preview.push({
          matricula: numMotorista,
          nomeMotorista: mat?.nome ?? null,
          whatsapp: mat?.whatsapp,
          codigoCliente: cli?.codigo ?? codigoCliente,
          nomeCliente: cli?.nome ?? codigoCliente,
          foto_url: cli?.foto_url ?? undefined,
          observacoes: cli?.observacoes ?? undefined,
          statusMatricula: mat ? 'encontrado' : 'nao_encontrado',
          statusCliente: cli ? 'encontrado' : 'nao_encontrado',
        })
      }
    }

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
    const aptos = linhas.filter(l =>
      l.statusMatricula === 'encontrado' &&
      l.statusCliente === 'encontrado' &&
      l.whatsapp
    )
    if (aptos.length === 0) {
      alert('Nenhum disparo válido — verifique se motorista e cliente estão cadastrados.')
      return
    }

    setEnviando(true)
    setProgresso(0)
    const res: ResultadoDisparo[] = []

    for (let i = 0; i < aptos.length; i++) {
      const linha = aptos[i]
      const mensagem = formatarMensagem(template, {
        matricula: linha.matricula,
        nomeMotorista: linha.nomeMotorista ?? '',
        codigoCliente: linha.codigoCliente,
        nomeCliente: linha.nomeCliente,
        observacoes: linha.observacoes ?? '',
      })

      let sucesso: boolean
      let erro: string | undefined

      if (linha.foto_url && linha.statusCliente === 'encontrado') {
        const resultado = await enviarImagemWhatsApp(linha.whatsapp!, linha.foto_url, mensagem)
        sucesso = resultado.sucesso
        erro = resultado.erro
      } else {
        const resultado = await enviarMensagemWhatsApp(linha.whatsapp!, mensagem)
        sucesso = resultado.sucesso
        erro = resultado.erro
      }

      await supabase.from('disparos').insert({
        whatsapp: linha.whatsapp!,
        mensagem,
        status: sucesso ? 'enviado' : 'erro',
        erro: erro ?? null,
      })

      res.push({ ...linha, enviado: sucesso, erro })
      setProgresso(Math.round(((i + 1) / aptos.length) * 100))
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

  const totalMensagens = linhas.filter(l =>
    l.statusMatricula === 'encontrado' && l.statusCliente === 'encontrado'
  ).length
  const semWhatsapp = linhas.filter(l => l.statusMatricula === 'nao_encontrado').length
  const clientesNaoCadastrados = linhas.filter(l => l.statusCliente === 'nao_encontrado').length

  return (
    <div className="p-8 max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Disparar Mensagens</h2>

      {etapa === 'upload' && (
        <div>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-500 hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            <FileSpreadsheet size={40} className="mx-auto mb-3 text-gray-400" />
            <p className="text-gray-700 font-medium">Arraste o arquivo Excel aqui</p>
            <p className="text-sm text-gray-400 mt-1">ou clique para selecionar</p>
          </div>
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            <p className="font-medium mb-1">Formato esperado da planilha:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Coluna <strong>Motorista</strong>: número da matrícula (ex: 442)</li>
              <li>Coluna <strong>Clientes</strong>: códigos separados por / (ex: 0021663/0010140)</li>
            </ul>
          </div>
        </div>
      )}

      {etapa === 'preview' && (
        <div className="space-y-6">
          <div className="flex gap-3 flex-wrap">
            <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 flex items-center gap-2">
              <CheckCircle size={18} className="text-brand-700" />
              <div>
                <p className="text-xs text-brand-700">Mensagens a enviar</p>
                <p className="text-xl font-bold text-brand-700">{totalMensagens}</p>
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-yellow-600" />
              <div>
                <p className="text-xs text-yellow-700">Motoristas não cadastrados</p>
                <p className="text-xl font-bold text-yellow-700">{semWhatsapp}</p>
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" />
              <div>
                <p className="text-xs text-orange-600">Clientes sem cadastro</p>
                <p className="text-xl font-bold text-orange-600">{clientesNaoCadastrados}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem a ser enviada</label>
            <p className="text-xs text-gray-400 mb-2">
              Variáveis disponíveis:{' '}
              {['{{matricula}}', '{{nomeMotorista}}', '{{codigoCliente}}', '{{nomeCliente}}', '{{observacoes}}'].map(v => (
                <code key={v} className="bg-gray-100 px-1 rounded mx-0.5">{v}</code>
              ))}
            </p>
            <textarea
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs font-medium text-gray-500 flex justify-between">
              <span>PREVIEW — {linhas.length} disparos expandidos</span>
              <span className="text-gray-400">Motorista → Cliente</span>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {linhas.map((l, i) => {
                const valido = l.statusMatricula === 'encontrado' && l.statusCliente === 'encontrado'
                return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 text-sm ${
                    !valido ? 'opacity-40' : ''
                  }`}
                >
                  {valido
                    ? <CheckCircle size={14} className="text-brand-600 shrink-0" />
                    : <XCircle size={14} className="text-red-400 shrink-0" />
                  }
                  <span className="font-mono text-gray-700 w-16 shrink-0 text-xs">{l.matricula}</span>
                  <span className="text-gray-400 text-xs shrink-0">→</span>
                  <span className="font-mono text-xs text-gray-600 w-24 shrink-0">{l.codigoCliente}</span>
                  <span className="text-gray-700 truncate flex-1">{l.statusCliente === 'encontrado' ? l.nomeCliente : <em className="text-gray-400">cliente não cadastrado</em>}</span>
                  {l.foto_url && l.statusCliente === 'encontrado' && (
                    <Image size={14} className="text-blue-400 shrink-0" />
                  )}
                  {l.statusMatricula === 'nao_encontrado' && (
                    <span className="text-red-400 text-xs shrink-0">sem WhatsApp</span>
                  )}
                </div>
              )})}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={reiniciar} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Voltar
            </button>
            <button
              onClick={disparar}
              disabled={enviando || totalMensagens === 0}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              <Send size={16} />
              {enviando ? `Enviando... ${progresso}%` : `Disparar ${totalMensagens} mensagens`}
            </button>
          </div>

          {enviando && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${progresso}%` }} />
            </div>
          )}
        </div>
      )}

      {etapa === 'resultado' && (
        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 flex items-center gap-2">
              <CheckCircle size={18} className="text-brand-700" />
              <div>
                <p className="text-xs text-brand-700">Enviados com sucesso</p>
                <p className="text-xl font-bold text-brand-700">{resultados.filter(r => r.enviado).length}</p>
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
                    ? <CheckCircle size={15} className="text-brand-600 shrink-0" />
                    : <XCircle size={15} className="text-red-500 shrink-0" />
                  }
                  <span className="font-mono text-gray-700 w-16 shrink-0 text-xs">{r.matricula}</span>
                  <span className="text-gray-400 text-xs shrink-0">→</span>
                  <span className="font-mono text-xs text-gray-600 w-24 shrink-0">{r.codigoCliente}</span>
                  <span className="text-gray-600 truncate flex-1">{r.nomeCliente}</span>
                  {r.erro && <span className="text-red-500 text-xs ml-auto truncate max-w-40">{r.erro}</span>}
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
