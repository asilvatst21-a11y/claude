import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { valesSupabase } from '../lib/valesSupabase'
import { useAuth } from '../lib/auth'
import { enviarMensagemWhatsApp, enviarImagemWhatsApp, formatarMensagem } from '../lib/zapi'
import type { Matricula, Cliente } from '../types'
import { FileSpreadsheet, CheckCircle, XCircle, Send, AlertTriangle, Image, RefreshCw } from 'lucide-react'

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

// Cruzamento automático: PDV crítico (cadastrado em Clientes) → mapa de hoje
// (vendas_dia) → motorista escalado para esse mapa hoje (escalas_tml) →
// contato do motorista (matriculas).
interface LinhaCruzamento {
  cliente: Cliente
  mapa: string | null
  matricula: string | null
  nomeMotorista: string | null
  whatsapp?: string
  status: 'pronto' | 'sem_venda_hoje' | 'sem_escala' | 'sem_motorista_cadastrado'
}

const TEMPLATE_PADRAO = `Olá motorista! Hoje você tem entrega no cliente *{{nomeCliente}}* (Cód: {{codigoCliente}}).

{{observacoes}}`

const TEMPLATE_CRUZAMENTO_PADRAO = `Olá {{nomeMotorista}}! Você está escalado hoje (mapa {{mapa}}) para o PDV crítico *{{nomeCliente}}* (Cód: {{codigoCliente}}).

{{observacoes}}`

// Remove zeros à esquerda para comparar códigos entre cadastros distintos
// (ex.: "0021663" cadastrado em Clientes vs. 21663 importado em vendas_dia).
const normalizar = (s: string) => s.trim().replace(/^0+/, '') || '0'

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Disparos() {
  const { usuario } = useAuth()
  const [modo, setModo] = useState<'cruzamento' | 'planilha'>('cruzamento')

  // ── Cruzamento automático ──────────────────────────────────────────────
  const [cruzamento, setCruzamento] = useState<LinhaCruzamento[]>([])
  const [carregandoCruzamento, setCarregandoCruzamento] = useState(false)
  const [carregouCruzamento, setCarregouCruzamento] = useState(false)
  const [templateCruzamento, setTemplateCruzamento] = useState(TEMPLATE_CRUZAMENTO_PADRAO)
  const [enviandoCruzamento, setEnviandoCruzamento] = useState(false)
  const [progressoCruzamento, setProgressoCruzamento] = useState(0)
  const [resultadosCruzamento, setResultadosCruzamento] = useState<{ linha: LinhaCruzamento; enviado: boolean; erro?: string }[]>([])

  async function carregarCruzamento() {
    if (!usuario) return
    setCarregandoCruzamento(true)
    setResultadosCruzamento([])
    const data = hojeISO()

    const [{ data: clientesDB }, { data: vendasDB }, { data: escalasDB }, { data: matriculasDB }] = await Promise.all([
      supabase.from('clientes').select('*').eq('filial', usuario.filial).order('nome'),
      // vendas_dia.filial vem do código UNB do CSV da Ambev (ex.: "0086"), não do
      // nome da filial do usuário — não dá pra filtrar por usuario.filial aqui.
      valesSupabase.from('vendas_dia').select('pdv_codigo, mapa').eq('data', data),
      supabase.from('escalas_tml').select('mapa, matricula').eq('filial', usuario.filial).eq('data_entrega', data),
      supabase.from('matriculas').select('*').eq('filial', usuario.filial).eq('ativo', true),
    ])

    const mapaPorPdv = new Map<number, string>()
    for (const v of vendasDB ?? []) {
      if (v.pdv_codigo == null || !v.mapa) continue
      if (!mapaPorPdv.has(v.pdv_codigo)) mapaPorPdv.set(v.pdv_codigo, String(v.mapa))
    }

    const matriculaPorMapa = new Map<number, number>()
    for (const e of escalasDB ?? []) {
      if (e.mapa == null || e.matricula == null) continue
      matriculaPorMapa.set(e.mapa, e.matricula)
    }

    const motoristaPorMatricula = new Map<string, Matricula>(
      (matriculasDB ?? []).map(m => [normalizar(m.numero), m])
    )

    const linhas: LinhaCruzamento[] = (clientesDB ?? []).map(cliente => {
      const pdvCod = parseInt(normalizar(cliente.codigo), 10)
      const mapa = Number.isNaN(pdvCod) ? undefined : mapaPorPdv.get(pdvCod)
      if (!mapa) {
        return { cliente, mapa: null, matricula: null, nomeMotorista: null, status: 'sem_venda_hoje' }
      }

      const mapaNum = parseInt(mapa, 10)
      const matriculaNum = Number.isNaN(mapaNum) ? undefined : matriculaPorMapa.get(mapaNum)
      if (matriculaNum == null) {
        return { cliente, mapa, matricula: null, nomeMotorista: null, status: 'sem_escala' }
      }

      const motorista = motoristaPorMatricula.get(normalizar(String(matriculaNum)))
      if (!motorista) {
        return { cliente, mapa, matricula: String(matriculaNum), nomeMotorista: null, status: 'sem_motorista_cadastrado' }
      }

      return {
        cliente,
        mapa,
        matricula: String(matriculaNum),
        nomeMotorista: motorista.nome,
        whatsapp: motorista.whatsapp,
        status: 'pronto',
      }
    })

    setCruzamento(linhas)
    setCarregandoCruzamento(false)
    setCarregouCruzamento(true)
  }

  async function dispararCruzamento() {
    const aptos = cruzamento.filter(l => l.status === 'pronto' && l.whatsapp)
    if (aptos.length === 0) {
      alert('Nenhum motorista identificado para disparo — verifique vendas do dia e escalas.')
      return
    }

    setEnviandoCruzamento(true)
    setProgressoCruzamento(0)
    const res: { linha: LinhaCruzamento; enviado: boolean; erro?: string }[] = []

    for (let i = 0; i < aptos.length; i++) {
      const linha = aptos[i]
      const mensagem = formatarMensagem(templateCruzamento, {
        matricula: linha.matricula ?? '',
        nomeMotorista: linha.nomeMotorista ?? '',
        mapa: linha.mapa ?? '',
        codigoCliente: linha.cliente.codigo,
        nomeCliente: linha.cliente.nome,
        observacoes: linha.cliente.observacoes ?? '',
      })

      let sucesso: boolean
      let erro: string | undefined

      if (linha.cliente.foto_url) {
        const resultado = await enviarImagemWhatsApp(linha.whatsapp!, linha.cliente.foto_url, mensagem)
        sucesso = resultado.sucesso
        erro = resultado.erro
      } else {
        const resultado = await enviarMensagemWhatsApp(linha.whatsapp!, mensagem)
        sucesso = resultado.sucesso
        erro = resultado.erro
      }

      await supabase.from('disparos').insert({
        filial: usuario?.filial ?? null,
        whatsapp: linha.whatsapp!,
        mensagem,
        status: sucesso ? 'enviado' : 'erro',
        erro: erro ?? null,
      })

      res.push({ linha, enviado: sucesso, erro })
      setProgressoCruzamento(Math.round(((i + 1) / aptos.length) * 100))
    }

    setResultadosCruzamento(res)
    setEnviandoCruzamento(false)
  }

  const prontos = cruzamento.filter(l => l.status === 'pronto')
  const semVenda = cruzamento.filter(l => l.status === 'sem_venda_hoje')
  const semEscala = cruzamento.filter(l => l.status === 'sem_escala')
  const semMotorista = cruzamento.filter(l => l.status === 'sem_motorista_cadastrado')

  // ── Upload de planilha (fluxo legado) ──────────────────────────────────
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

    if (!usuario) return

    // Busca matrículas e clientes do banco (apenas da filial do usuário)
    const { data: matriculasDB } = await supabase.from('matriculas').select('*').eq('filial', usuario.filial).eq('ativo', true)
    const { data: clientesDB } = await supabase.from('clientes').select('*').eq('filial', usuario.filial)

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
  }, [usuario?.filial])

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
        filial: usuario?.filial ?? null,
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
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Disparos</h2>
      <p className="text-gray-500 text-sm mb-6">
        Identifique automaticamente o motorista escalado para cada PDV crítico ou envie por planilha.
      </p>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setModo('cruzamento')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            modo === 'cruzamento' ? 'border-brand-500 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          PDV crítico × Motorista (automático)
        </button>
        <button
          onClick={() => setModo('planilha')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            modo === 'planilha' ? 'border-brand-500 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload de planilha
        </button>
      </div>

      {modo === 'cruzamento' && (
        <div className="space-y-6">
          {!carregouCruzamento ? (
            <button
              onClick={carregarCruzamento}
              disabled={carregandoCruzamento}
              className="flex items-center gap-2 px-5 py-2.5 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              <RefreshCw size={16} className={carregandoCruzamento ? 'animate-spin' : ''} />
              {carregandoCruzamento ? 'Cruzando dados...' : 'Identificar motoristas dos PDVs críticos'}
            </button>
          ) : (
            <>
              <div className="flex gap-3 flex-wrap items-center">
                <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-brand-700" />
                  <div>
                    <p className="text-xs text-brand-700">Prontos para disparo</p>
                    <p className="text-xl font-bold text-brand-700">{prontos.length}</p>
                  </div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-yellow-600" />
                  <div>
                    <p className="text-xs text-yellow-700">Sem venda hoje</p>
                    <p className="text-xl font-bold text-yellow-700">{semVenda.length}</p>
                  </div>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-orange-500" />
                  <div>
                    <p className="text-xs text-orange-600">Sem escala hoje</p>
                    <p className="text-xl font-bold text-orange-600">{semEscala.length}</p>
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2">
                  <XCircle size={18} className="text-red-500" />
                  <div>
                    <p className="text-xs text-red-600">Motorista sem cadastro</p>
                    <p className="text-xl font-bold text-red-600">{semMotorista.length}</p>
                  </div>
                </div>
                <button
                  onClick={carregarCruzamento}
                  disabled={carregandoCruzamento}
                  title="Atualizar"
                  className="p-2.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  <RefreshCw size={16} className={carregandoCruzamento ? 'animate-spin' : ''} />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem a ser enviada</label>
                <p className="text-xs text-gray-400 mb-2">
                  Variáveis disponíveis:{' '}
                  {['{{nomeMotorista}}', '{{matricula}}', '{{mapa}}', '{{codigoCliente}}', '{{nomeCliente}}', '{{observacoes}}'].map(v => (
                    <code key={v} className="bg-gray-100 px-1 rounded mx-0.5">{v}</code>
                  ))}
                </p>
                <textarea
                  value={templateCruzamento}
                  onChange={e => setTemplateCruzamento(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs font-medium text-gray-500 flex justify-between">
                  <span>PDV → Mapa → Motorista — {cruzamento.length} PDVs cadastrados</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {cruzamento.map((l, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 text-sm ${
                        l.status !== 'pronto' ? 'opacity-50' : ''
                      }`}
                    >
                      {l.status === 'pronto'
                        ? <CheckCircle size={14} className="text-brand-600 shrink-0" />
                        : <XCircle size={14} className="text-red-400 shrink-0" />
                      }
                      <span className="font-mono text-xs text-gray-600 w-24 shrink-0">{l.cliente.codigo}</span>
                      <span className="text-gray-700 truncate flex-1">{l.cliente.nome}</span>
                      <span className="text-gray-400 text-xs shrink-0">mapa</span>
                      <span className="font-mono text-xs text-gray-600 w-12 shrink-0">{l.mapa ?? '—'}</span>
                      <span className="text-gray-400 text-xs shrink-0">→</span>
                      <span className="text-gray-700 truncate w-40 shrink-0">
                        {l.nomeMotorista ?? <em className="text-gray-400 text-xs">
                          {l.status === 'sem_venda_hoje' && 'sem venda hoje'}
                          {l.status === 'sem_escala' && 'sem escala hoje'}
                          {l.status === 'sem_motorista_cadastrado' && `matrícula ${l.matricula} não cadastrada`}
                        </em>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={dispararCruzamento}
                  disabled={enviandoCruzamento || prontos.length === 0}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg font-medium"
                >
                  <Send size={16} />
                  {enviandoCruzamento ? `Enviando... ${progressoCruzamento}%` : `Disparar ${prontos.length} mensagens`}
                </button>
              </div>

              {enviandoCruzamento && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${progressoCruzamento}%` }} />
                </div>
              )}

              {resultadosCruzamento.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs font-medium text-gray-500 flex justify-between">
                    <span>Resultado do disparo</span>
                    <span>
                      {resultadosCruzamento.filter(r => r.enviado).length} enviados ·{' '}
                      {resultadosCruzamento.filter(r => !r.enviado).length} erros
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {resultadosCruzamento.map((r, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 text-sm">
                        {r.enviado
                          ? <CheckCircle size={15} className="text-brand-600 shrink-0" />
                          : <XCircle size={15} className="text-red-500 shrink-0" />
                        }
                        <span className="text-gray-700 truncate w-40 shrink-0">{r.linha.nomeMotorista}</span>
                        <span className="text-gray-400 text-xs shrink-0">→</span>
                        <span className="text-gray-600 truncate flex-1">{r.linha.cliente.nome}</span>
                        {r.erro && <span className="text-red-500 text-xs ml-auto truncate max-w-40">{r.erro}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {modo === 'planilha' && (
        <>
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
        </>
      )}
    </div>
  )
}
