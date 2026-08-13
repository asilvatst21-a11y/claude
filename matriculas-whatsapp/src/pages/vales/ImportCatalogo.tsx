import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, CheckCircle2, AlertTriangle, Loader2, ShoppingCart, PackageSearch, Users, HelpCircle, PackagePlus } from 'lucide-react'
import { valesSupabase } from '@/lib/valesSupabase'
import { useAuth } from '@/lib/auth'
import { processarFixacaoMotorista, type HistoricoTmlMotorista } from '@/lib/frota'
import { isSalaTML } from '@/lib/tml'
import { notificarFinanceiroWhatsApp } from '@/lib/chapaDescarga'

type Fase = 'idle' | 'lendo' | 'importando' | 'ok' | 'erro'
interface Log { tipo: 'ok' | 'erro' | 'info'; msg: string }

// Extrai a data (DDMMYY ou DDMMYYYY) do nome do arquivo; cai para hoje.
function dataDoNome(nome: string): string {
  const match = nome.match(/(\d{2})(\d{2})(\d{2,4})/)
  if (!match) return new Date().toISOString().slice(0, 10)
  const [, d, m, y] = match
  return `${y.length === 2 ? `20${y}` : y}-${m}-${d}`
}

async function importarVendasDia(file: File): Promise<{ contagem: number; mensagem: string; data: string }> {
  const texto = await file.text()
  const linhas = texto.split(/\r?\n/).filter(Boolean)
  if (linhas.length < 2) throw new Error('Arquivo CSV sem dados.')

  // Extrai data do nome do arquivo (formato DDMMYY ou DDMMYYYY)
  const data = dataDoNome(file.name)

  // Colunas: UNB;UNB Origem;Mapa;Cliente;Linha;Tipo;Produto;Nome Produto;Unid;Venda;...
  const vendas = linhas.slice(1)
    .map(linha => {
      const cols = linha.split(';')
      const filial     = cols[0]?.trim() || null
      const mapa       = cols[2]?.trim() || null
      const pdvCodigo  = parseInt(cols[3]?.trim() ?? '')
      const prodCodigo = parseInt(cols[6]?.trim() ?? '')
      const prodNome   = cols[7]?.trim() || null
      const qtd        = parseFloat((cols[9]?.trim() ?? '').replace(',', '.'))
      const unidade    = cols[10]?.trim() || null
      if (isNaN(pdvCodigo) || isNaN(prodCodigo)) return null
      return { data, filial, mapa, pdv_codigo: pdvCodigo, produto_codigo: prodCodigo, produto_nome: prodNome, quantidade: isNaN(qtd) ? null : qtd, unidade }
    })
    .filter(Boolean)

  // Remove registros do dia antes de inserir (evita duplicatas)
  const { error: delErr } = await valesSupabase.from('vendas_dia').delete().eq('data', data)
  if (delErr) throw new Error(`Erro ao limpar vendas: ${delErr.message}`)

  // Upsert em batches de 500
  const BATCH = 500
  for (let i = 0; i < vendas.length; i += BATCH) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await valesSupabase.from('vendas_dia').insert(vendas.slice(i, i + BATCH) as any[])
    if (error) throw new Error(`Erro ao salvar vendas: ${error.message}`)
  }

  return {
    contagem: vendas.length,
    mensagem: `Data: ${data}. Disponível para confronto no painel de reposições.`,
    data,
  }
}

// Importa a aba "Base" da planilha diária: por mapa (col M), o motorista
// (col V/W) e os ajudantes (col Y/Z e AB/AC). Usado para anexar os nomes da
// equipe na confirmação de reposição enviada ao motorista no WhatsApp.
async function importarBaseMapa(file: File, filial: string): Promise<{ contagem: number; mensagem: string }> {
  if (!filial?.trim()) throw new Error('Filial não identificada na sessão. Saia e entre novamente.')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf)
  const ws = wb.Sheets['Base']
  if (!ws) throw new Error('Aba "Base" não encontrada na planilha.')

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false }) as unknown[][]
  // O cabeçalho fica algumas linhas abaixo do topo; localiza a linha cujo
  // valor da coluna M (índice 12) é "Mapa".
  const headerIdx = rows.findIndex(r => String(r?.[12] ?? '').trim().toLowerCase() === 'mapa')
  if (headerIdx < 0) throw new Error('Cabeçalho "Mapa" (coluna M) não encontrado na aba Base.')

  const data = dataDoNome(file.name)
  const limpa = (v: unknown) => { const s = String(v ?? '').trim(); return !s || s === '-' ? null : s }

  const equipe = rows.slice(headerIdx + 1)
    .map(r => {
      const mapa = String(r[12] ?? '').trim()
      if (!mapa || !/\d/.test(mapa)) return null
      return {
        data, filial, mapa,
        motorista_matricula: limpa(r[21]),  // V
        motorista_nome:      limpa(r[22]),  // W
        ajudante1_matricula: limpa(r[24]),  // Y
        ajudante1_nome:      limpa(r[25]),  // Z
        ajudante2_matricula: limpa(r[27]),  // AB
        ajudante2_nome:      limpa(r[28]),  // AC
      }
    })
    .filter(Boolean)

  if (equipe.length === 0) throw new Error('Nenhum mapa encontrado na aba Base.')

  // Substitui os dados do dia (idempotente) — só desta filial, para não apagar
  // a base de outra filial importada no mesmo dia.
  const { error: delErr } = await valesSupabase.from('mapa_equipe').delete().eq('data', data).eq('filial', filial)
  if (delErr) throw new Error(`Erro ao limpar equipe do mapa: ${delErr.message}`)

  const BATCH = 500
  for (let i = 0; i < equipe.length; i += BATCH) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await valesSupabase.from('mapa_equipe').insert(equipe.slice(i, i + BATCH) as any[])
    if (error) throw new Error(`Erro ao salvar equipe do mapa: ${error.message}`)
  }

  // Além da equipe, esta mesma Base alimenta a Fixação de Território da Frota:
  // por mapa (col M), a placa (col K) e a região executada — Rota (col N) +
  // detalhe de bairros (col O). Grava em frota_territorio_historico, lida pelo
  // cruzamento de território, para o supervisor não precisar reimportar lá.
  const territorio = rows.slice(headerIdx + 1)
    .map(r => {
      const mapa = Number(String(r[12] ?? '').trim())
      const placa = String(r[10] ?? '').trim()
      if (!mapa || isNaN(mapa) || !placa) return null
      const rota = String(r[13] ?? '').trim()
      const detalhe = String(r[14] ?? '').trim()
      const regiao = [rota, detalhe].filter(Boolean).join(' / ') || null
      return { filial, mapa, placa, data, regiao_entregas: regiao }
    })
    .filter(Boolean)

  if (territorio.length > 0) {
    // Dedup por mapa (a chave de conflito é filial,mapa) e upsert em lotes.
    const territorioUnico = [...new Map(territorio.map(t => [t!.mapa, t!])).values()]
    for (let i = 0; i < territorioUnico.length; i += BATCH) {
      const { error } = await valesSupabase.from('frota_territorio_historico')
        .upsert(territorioUnico.slice(i, i + BATCH), { onConflict: 'filial,mapa' })
      // Não interrompe o import da equipe se o território falhar — apenas segue.
      if (error) { console.error('frota_territorio_historico:', error.message); break }
    }
  }

  // E também alimenta a Fixação de Motorista da Frota: por mapa (col M), a placa
  // (col K) e o motorista que rodou — matrícula (col V=21) + nome (col W=22).
  // A data vem do nome do arquivo (correta), evitando o dia/mês trocado da
  // planilha de Saída da portaria. A sala (COLORADO/SUB-FURIA) é resolvida por
  // matrícula em motoristas_sala_tml no momento do cruzamento.
  const motoristaFrota = rows.slice(headerIdx + 1)
    .map(r => {
      const mapa = Number(String(r[12] ?? '').trim())
      const placa = String(r[10] ?? '').trim()
      if (!mapa || isNaN(mapa) || !placa) return null
      const matricula = Number(String(r[21] ?? '').trim())
      const nome = String(r[22] ?? '').trim() || null
      return { filial, mapa, placa, data, matricula: isNaN(matricula) ? null : matricula, nome }
    })
    .filter(Boolean)

  if (motoristaFrota.length > 0) {
    const motoristaUnico = [...new Map(motoristaFrota.map(m => [m!.mapa, m!])).values()]
    for (let i = 0; i < motoristaUnico.length; i += BATCH) {
      const { error } = await valesSupabase.from('frota_motorista_base')
        .upsert(motoristaUnico.slice(i, i + BATCH), { onConflict: 'filial,mapa' })
      if (error) { console.error('frota_motorista_base:', error.message); break }
    }

    // Dispara a solicitação de justificativa das divergências do dia (placa
    // rodou com motorista diferente do fixado). Roda a partir da Base — data
    // correta do nome do arquivo — no lugar do antigo disparo na Saída. A sala
    // vem de motoristas_sala_tml por matrícula. Não quebra o import se falhar.
    try {
      const mats = [...new Set(motoristaUnico.map(m => m!.matricula).filter((x): x is number => x != null))]
      const { data: roster } = mats.length
        ? await valesSupabase.from('motoristas_sala_tml').select('matricula, sala').eq('filial', filial).in('matricula', mats)
        : { data: [] as { matricula: number; sala: string | null }[] }
      const salaPorMat = new Map((roster ?? []).map(r => [r.matricula, isSalaTML(r.sala) ? r.sala : null]))
      const historico: HistoricoTmlMotorista[] = motoristaUnico.map(m => ({
        placa: m!.placa,
        data_saida: m!.data,
        matricula: m!.matricula,
        nome: m!.nome,
        sala: m!.matricula != null ? salaPorMat.get(m!.matricula) ?? null : null,
      }))
      await processarFixacaoMotorista(filial, historico)
    } catch (e) {
      console.error('processarFixacaoMotorista (Base):', e)
    }
  }

  return { contagem: equipe.length, mensagem: `Data: ${data}. Motorista e ajudantes aparecerão na confirmação; território e fixação de motorista atualizados na Frota.` }
}

interface LinhaCatalogo { codigo: number; descricao: string; lastro: number | null }
interface DiffProduto { codigo: number; descricaoAtual: string | null; descricaoNova: string; lastro: number | null }

const semAcentoCatalogo = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// Casa colunas pelo NOME do cabeçalho (não por posição fixa), então serve
// tanto pro relatório "Estoque Consolidado" do Promax (colunas Item/
// Descrição) quanto pra planilha de cadastro de produtos com Lastro
// (colunas Código/Descrição/.../Lastro) — mesma lógica pros dois formatos.
function extrairCatalogo(headerCells: unknown[], rows: unknown[][]): LinhaCatalogo[] {
  const hdr = headerCells.map(h => semAcentoCatalogo(String(h ?? '').trim().toLowerCase()))
  const iItem = hdr.findIndex(h => h === 'item' || h === 'codigo')
  const iDesc = hdr.findIndex(h => h.startsWith('descri'))
  const iLastro = hdr.findIndex(h => h === 'lastro')
  if (iItem < 0 || iDesc < 0) {
    throw new Error('Não encontrei as colunas "Código"/"Item" e "Descrição" no cabeçalho do arquivo. Confira se é o arquivo certo.')
  }
  const porCodigo = new Map<number, LinhaCatalogo>()
  for (const row of rows) {
    const codigo = parseInt(String(row[iItem] ?? '').trim())
    const descricao = String(row[iDesc] ?? '').trim()
    if (!codigo || !descricao) continue
    const lastroBruto = iLastro >= 0 ? parseInt(String(row[iLastro] ?? '').trim()) : NaN
    porCodigo.set(codigo, { codigo, descricao, lastro: Number.isFinite(lastroBruto) && lastroBruto > 0 ? lastroBruto : null })
  }
  return [...porCodigo.values()] // último ganha se o código repetir (ex.: vários lotes)
}

// CSV/TXT (ex.: exportação "Estoque Consolidado" do Promax — sem Lastro).
function parseCatalogoCsv(texto: string): LinhaCatalogo[] {
  const linhas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  if (linhas.length < 2) throw new Error('Arquivo CSV sem dados.')
  const delim = linhas[0].includes(';') ? ';' : ','
  const rows = linhas.slice(1).map(l => l.split(delim))
  return extrairCatalogo(linhas[0].split(delim), rows)
}

// XLSX (ex.: cadastro de produtos com a coluna Lastro).
function parseCatalogoXlsx(buffer: ArrayBuffer): LinhaCatalogo[] {
  const wb = XLSX.read(buffer, { type: 'array', raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true })
  if (rows.length < 2) throw new Error('Planilha sem dados.')
  return extrairCatalogo(rows[0], rows.slice(1))
}

function parseCatalogoArquivo(file: File): Promise<LinhaCatalogo[]> {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) return file.arrayBuffer().then(parseCatalogoXlsx)
  return file.text().then(parseCatalogoCsv)
}

// Descrições de estoque às vezes vêm cortadas num campo de largura fixa
// (ex.: "...GFA VD 75" em vez de "...GFA VD 750 ML") — sinaliza pra revisão
// manual em vez de aplicar sozinho e arriscar piorar uma descrição boa que
// já existe no catálogo.
function pareceTruncado(s: string): boolean {
  return s.trim().length >= 48
}

export default function ImportCatalogoPage() {
  const { usuario } = useAuth()
  const ref = useRef<HTMLInputElement>(null)
  const refBase = useRef<HTMLInputElement>(null)
  const [fase, setFase] = useState<Fase>('idle')
  const [logs, setLogs] = useState<Log[]>([])
  const [faseBase, setFaseBase] = useState<Fase>('idle')
  const [logsBase, setLogsBase] = useState<Log[]>([])
  const refCatalogo = useRef<HTMLInputElement>(null)
  const [catalogoFase, setCatalogoFase] = useState<'idle' | 'lendo' | 'pronto' | 'aplicando' | 'ok' | 'erro'>('idle')
  const [catalogoErro, setCatalogoErro] = useState('')
  const [catalogoNovos, setCatalogoNovos] = useState<DiffProduto[]>([])
  const [catalogoDivergentes, setCatalogoDivergentes] = useState<DiffProduto[]>([])
  const [catalogoIguaisCount, setCatalogoIguaisCount] = useState(0)
  const [catalogoLastroBackfill, setCatalogoLastroBackfill] = useState<{ codigo: number; lastro: number }[]>([])
  const [catalogoSelecionados, setCatalogoSelecionados] = useState<Set<number>>(new Set())
  const [catalogoResultado, setCatalogoResultado] = useState('')

  async function handleFile(file: File) {
    setFase('lendo')
    setLogs([{ tipo: 'info', msg: `Lendo ${file.name}…` }])
    try {
      setFase('importando')
      const { contagem, mensagem, data } = await importarVendasDia(file)
      setLogs(prev => [...prev, { tipo: 'ok', msg: `✅ ${contagem} registros importados. ${mensagem}` }])
      setFase('ok')

      // Avisa o financeiro no WhatsApp quais clientes de Chapa/Descarga têm
      // pedido na rua hoje. Não interrompe o import se o grupo não estiver
      // configurado ou o envio falhar — só registra o motivo no log.
      if (usuario?.filial) {
        try {
          const resultado = await notificarFinanceiroWhatsApp(usuario.filial, data)
          if (resultado.enviado) {
            setLogs(prev => [...prev, { tipo: 'ok', msg: '✅ Financeiro notificado no WhatsApp (Chapa/Descarga).' }])
          } else if (resultado.motivo) {
            setLogs(prev => [...prev, { tipo: 'info', msg: `Notificação ao financeiro não enviada: ${resultado.motivo}` }])
          }
        } catch (e) {
          setLogs(prev => [...prev, { tipo: 'info', msg: `Notificação ao financeiro não enviada: ${String(e)}` }])
        }
      }
    } catch (e) {
      setLogs(prev => [...prev, { tipo: 'erro', msg: String(e) }])
      setFase('erro')
    }
  }

  async function handleFileBase(file: File) {
    if (!usuario) return
    if (!usuario.filial?.trim()) {
      setLogsBase([{ tipo: 'erro', msg: 'Sessão sem filial definida. Saia e entre novamente antes de importar a Base.' }])
      setFaseBase('erro')
      return
    }
    setFaseBase('lendo')
    setLogsBase([{ tipo: 'info', msg: `Lendo ${file.name}…` }])
    try {
      setFaseBase('importando')
      const { contagem, mensagem } = await importarBaseMapa(file, usuario.filial)
      setLogsBase(prev => [...prev, { tipo: 'ok', msg: `✅ ${contagem} mapas importados. ${mensagem}` }])
      setFaseBase('ok')
    } catch (e) {
      setLogsBase(prev => [...prev, { tipo: 'erro', msg: String(e) }])
      setFaseBase('erro')
    }
  }

  async function handleCatalogoFile(file: File) {
    setCatalogoFase('lendo')
    setCatalogoErro('')
    setCatalogoResultado('')
    setCatalogoNovos([])
    setCatalogoDivergentes([])
    setCatalogoLastroBackfill([])
    setCatalogoSelecionados(new Set())
    try {
      const linhas = await parseCatalogoArquivo(file)
      if (linhas.length === 0) throw new Error('Nenhuma linha com código e descrição encontrada no arquivo.')

      const codigos = linhas.map(l => l.codigo)
      const { data: existentes, error } = await valesSupabase.from('produtos').select('codigo, descricao, lastro').in('codigo', codigos)
      if (error) throw new Error(error.message)
      const atualPorCodigo = new Map((existentes ?? []).map(p => [p.codigo, p as { descricao: string; lastro: number | null }]))

      const novos: DiffProduto[] = []
      const divergentes: DiffProduto[] = []
      const lastroBackfill: { codigo: number; lastro: number }[] = []
      let iguais = 0
      for (const { codigo, descricao, lastro } of linhas) {
        const atual = atualPorCodigo.get(codigo)
        if (atual === undefined) {
          novos.push({ codigo, descricaoAtual: null, descricaoNova: descricao, lastro })
        } else if (atual.descricao !== descricao) {
          divergentes.push({ codigo, descricaoAtual: atual.descricao, descricaoNova: descricao, lastro })
        } else {
          iguais++
          // Descrição já bate — se a planilha trouxe um lastro novo/diferente
          // do que já está salvo, atualiza só esse campo automaticamente
          // (dado complementar, não pisa em revisão manual de descrição).
          if (lastro != null && lastro !== atual.lastro) lastroBackfill.push({ codigo, lastro })
        }
      }
      setCatalogoNovos(novos.sort((a, b) => a.codigo - b.codigo))
      setCatalogoDivergentes(divergentes.sort((a, b) => a.codigo - b.codigo))
      setCatalogoIguaisCount(iguais)
      setCatalogoLastroBackfill(lastroBackfill)
      setCatalogoFase('pronto')
    } catch (e) {
      setCatalogoErro(e instanceof Error ? e.message : String(e))
      setCatalogoFase('erro')
    }
  }

  function alternarSelecionado(codigo: number) {
    setCatalogoSelecionados(prev => {
      const novo = new Set(prev)
      if (novo.has(codigo)) novo.delete(codigo)
      else novo.add(codigo)
      return novo
    })
  }

  async function aplicarAtualizacaoCatalogo() {
    setCatalogoFase('aplicando')
    setCatalogoErro('')
    try {
      const aplicar = [
        ...catalogoNovos,
        ...catalogoDivergentes.filter(d => catalogoSelecionados.has(d.codigo)),
      ].map(d => ({ codigo: d.codigo, descricao: d.descricaoNova, lastro: d.lastro }))

      if (aplicar.length === 0 && catalogoLastroBackfill.length === 0) throw new Error('Nada selecionado pra aplicar.')

      const BATCH = 500
      for (let i = 0; i < aplicar.length; i += BATCH) {
        const { error } = await valesSupabase.from('produtos').upsert(aplicar.slice(i, i + BATCH), { onConflict: 'codigo' })
        if (error) throw new Error(error.message)
      }
      // Backfill de lastro: só esse campo, produto já existente com
      // descrição igual — não sobrescreve nada revisado manualmente.
      // update (não upsert): a linha já existe, e um upsert monta um INSERT
      // por baixo, que exige "descricao" (not null) mesmo indo cair no
      // ON CONFLICT DO UPDATE.
      for (const { codigo, lastro } of catalogoLastroBackfill) {
        const { error } = await valesSupabase.from('produtos').update({ lastro }).eq('codigo', codigo)
        if (error) throw new Error(error.message)
      }

      const totalLastro = catalogoLastroBackfill.length
      setCatalogoResultado(
        `✅ ${aplicar.length} produto(s) atualizado(s)/adicionado(s) no catálogo` +
        (totalLastro > 0 ? `, ${totalLastro} com lastro atualizado à parte.` : '.')
      )
      setCatalogoFase('ok')
      setCatalogoNovos([])
      setCatalogoDivergentes([])
      setCatalogoLastroBackfill([])
      setCatalogoSelecionados(new Set())
    } catch (e) {
      setCatalogoErro(e instanceof Error ? e.message : String(e))
      setCatalogoFase('erro')
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <PackageSearch className="h-6 w-6 text-primary" /> Faturamento do Dia
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importe o CSV diário de vendas para confrontar as reposições com o que foi realmente entregue.
          Quando um motorista solicitar um produto que não consta no pedido do PDV, o sistema avisa automaticamente.
        </p>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="space-y-2">
            <h2 className="font-semibold text-blue-900">Como gerar e subir os arquivos</h2>
            <div>
              <p className="text-sm font-medium text-blue-900">1) CSV do dia (vendas)</p>
              <p className="text-sm text-blue-800">
                No Promax, puxe o relatório <code className="text-xs bg-white/60 px-1 rounded">03.05.19</code> do dia com <strong>quebra 1: Mapa</strong> e <strong>quebra 2: Cliente</strong>.
                Salve o CSV com o nome no formato da data de exportação, ex: <code className="text-xs bg-white/60 px-1 rounded">16.06.25.csv</code> (ou <code className="text-xs bg-white/60 px-1 rounded">160625.csv</code>),
                e suba no quadro <strong>"Importar CSV do dia"</strong> abaixo.
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">2) Planilha do PCD (mapa, motorista e ajudantes)</p>
              <p className="text-sm text-blue-800">
                O PCD envia a planilha atualizada completa (com a aba <strong>Base</strong>). Suba o arquivo
                .xlsx recebido sem editar no quadro <strong>"Importar Base do Mapa"</strong> abaixo.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start gap-3">
          <ShoppingCart className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h2 className="font-semibold">Importar CSV do dia</h2>
            <p className="text-sm text-muted-foreground">
              Selecione o arquivo CSV exportado do Ambev (separado por ponto e vírgula).
              A data é extraída do nome do arquivo — ex: <code className="text-xs bg-muted px-1 rounded">030519.csv</code> → 03/05/2019.
              Importar novamente o mesmo dia substitui os dados anteriores.
            </p>
          </div>
        </div>

        <input ref={ref} type="file" accept=".csv,.txt" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />

        <button
          onClick={() => ref.current?.click()}
          disabled={fase === 'lendo' || fase === 'importando'}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
        >
          {fase === 'lendo' || fase === 'importando'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Upload className="h-4 w-4" />}
          {fase === 'lendo' ? 'Lendo…' : fase === 'importando' ? 'Importando…' : 'Selecionar CSV'}
        </button>

        {logs.length > 0 && (
          <div className="space-y-1">
            {logs.map((l, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${
                l.tipo === 'erro' ? 'bg-red-50 text-red-700'
                : l.tipo === 'ok' ? 'bg-green-50 text-green-700'
                : 'bg-muted/40 text-muted-foreground'
              }`}>
                {l.tipo === 'erro' ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  : l.tipo === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  : null}
                <span className="break-all">{l.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h2 className="font-semibold">Importar Base do Mapa (motorista e ajudantes)</h2>
            <p className="text-sm text-muted-foreground">
              Selecione a planilha diária (.xlsx) com a aba <code className="text-xs bg-muted px-1 rounded">Base</code>.
              O sistema lê o mapa (coluna M), o motorista (V/W) e os ajudantes (Y/Z e AB/AC) e os anexa
              automaticamente na confirmação enviada ao motorista no WhatsApp.
              A data vem do nome do arquivo — ex: <code className="text-xs bg-muted px-1 rounded">17062026.xlsx</code> → 17/06/2026.
              Importar novamente o mesmo dia substitui os dados anteriores.
            </p>
          </div>
        </div>

        <input ref={refBase} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileBase(f); e.target.value = '' }} />

        <button
          onClick={() => refBase.current?.click()}
          disabled={faseBase === 'lendo' || faseBase === 'importando'}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
        >
          {faseBase === 'lendo' || faseBase === 'importando'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Upload className="h-4 w-4" />}
          {faseBase === 'lendo' ? 'Lendo…' : faseBase === 'importando' ? 'Importando…' : 'Selecionar planilha'}
        </button>

        {logsBase.length > 0 && (
          <div className="space-y-1">
            {logsBase.map((l, i) => (
              <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${
                l.tipo === 'erro' ? 'bg-red-50 text-red-700'
                : l.tipo === 'ok' ? 'bg-green-50 text-green-700'
                : 'bg-muted/40 text-muted-foreground'
              }`}>
                {l.tipo === 'erro' ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  : l.tipo === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  : null}
                <span className="break-all">{l.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start gap-3">
          <PackagePlus className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <h2 className="font-semibold">Atualizar catálogo de produtos</h2>
            <p className="text-sm text-muted-foreground">
              Suba um CSV com as colunas <strong>Item</strong> (código) e <strong>Descrição</strong> — por exemplo, o
              relatório de Estoque Consolidado do Promax — ou uma planilha .xlsx de cadastro de produtos com as
              colunas <strong>Código</strong>, <strong>Descrição</strong> e <strong>Lastro</strong> (caixas por
              camada fechada de pallet, usado no ⓘ da Conferência Digital). O sistema mostra o que vai mudar antes
              de aplicar: produtos novos entram automaticamente; produtos que já existem com descrição diferente
              ficam marcados pra você revisar e escolher quais aplicar (a descrição de estoque às vezes vem
              cortada, então não aplicamos essas por padrão); lastro novo/diferente de um produto já cadastrado com
              a mesma descrição é aplicado direto, sem precisar marcar.
            </p>
          </div>
        </div>

        <input ref={refCatalogo} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleCatalogoFile(f); e.target.value = '' }} />

        <button
          onClick={() => refCatalogo.current?.click()}
          disabled={catalogoFase === 'lendo' || catalogoFase === 'aplicando'}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
        >
          {catalogoFase === 'lendo' || catalogoFase === 'aplicando'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Upload className="h-4 w-4" />}
          {catalogoFase === 'lendo' ? 'Lendo…' : catalogoFase === 'aplicando' ? 'Aplicando…' : 'Selecionar CSV'}
        </button>

        {catalogoErro && (
          <div className="flex items-start gap-2 text-xs rounded px-2 py-1.5 bg-red-50 text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="break-all">{catalogoErro}</span>
          </div>
        )}
        {catalogoResultado && (
          <div className="flex items-start gap-2 text-xs rounded px-2 py-1.5 bg-green-50 text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{catalogoResultado}</span>
          </div>
        )}

        {catalogoFase === 'pronto' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {catalogoNovos.length} novo(s), {catalogoDivergentes.length} divergente(s), {catalogoIguaisCount} já igual(is) ao catálogo — de {catalogoNovos.length + catalogoDivergentes.length + catalogoIguaisCount} linha(s) lidas do arquivo.
            </p>
            {catalogoNovos.length === 0 && catalogoDivergentes.length === 0 && catalogoLastroBackfill.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma novidade — o catálogo já bate com esse arquivo.</p>
            ) : (
              <>
                {catalogoLastroBackfill.length > 0 && (
                  <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs">
                    <p className="font-medium text-blue-800">
                      {catalogoLastroBackfill.length} produto(s) só com o lastro atualizado (descrição já bate — aplica direto, sem precisar marcar)
                    </p>
                  </div>
                )}
                {catalogoNovos.length > 0 && (
                  <div className="rounded border border-green-200 bg-green-50 p-3 text-xs">
                    <p className="font-medium text-green-800 mb-1">{catalogoNovos.length} produto(s) novo(s) — serão adicionados</p>
                    <div className="max-h-32 overflow-y-auto space-y-0.5 text-green-900">
                      {catalogoNovos.slice(0, 30).map(p => (
                        <p key={p.codigo}>{p.codigo} — {p.descricaoNova}</p>
                      ))}
                      {catalogoNovos.length > 30 && <p className="text-green-700">…e mais {catalogoNovos.length - 30}.</p>}
                    </div>
                  </div>
                )}
                {catalogoDivergentes.length > 0 && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs space-y-2">
                    <p className="font-medium text-amber-800">
                      {catalogoDivergentes.length} produto(s) já existe(m) com descrição diferente — marque os que quer atualizar
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {catalogoDivergentes.map(p => (
                        <label key={p.codigo} className="flex items-start gap-2 bg-white/60 rounded px-2 py-1.5 cursor-pointer">
                          <input type="checkbox" className="mt-0.5" checked={catalogoSelecionados.has(p.codigo)}
                            onChange={() => alternarSelecionado(p.codigo)} />
                          <span className="flex-1">
                            <span className="font-medium">{p.codigo}</span>
                            <br />
                            <span className="text-red-600 line-through">{p.descricaoAtual}</span>
                            <br />
                            <span className="text-green-700">→ {p.descricaoNova}</span>
                            {pareceTruncado(p.descricaoNova) && (
                              <span className="ml-1 text-amber-700">⚠️ pode estar cortada — confira antes de marcar</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  onClick={aplicarAtualizacaoCatalogo}
                  disabled={catalogoFase !== 'pronto' || (catalogoNovos.length === 0 && catalogoSelecionados.size === 0 && catalogoLastroBackfill.length === 0)}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Aplicar {catalogoNovos.length + catalogoSelecionados.size + catalogoLastroBackfill.length} atualização(ões)
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
