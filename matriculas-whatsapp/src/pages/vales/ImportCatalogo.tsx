import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, CheckCircle2, AlertTriangle, Loader2, ShoppingCart, PackageSearch, Users } from 'lucide-react'
import { valesSupabase } from '@/lib/valesSupabase'

type Fase = 'idle' | 'lendo' | 'importando' | 'ok' | 'erro'
interface Log { tipo: 'ok' | 'erro' | 'info'; msg: string }

// Extrai a data (DDMMYY ou DDMMYYYY) do nome do arquivo; cai para hoje.
function dataDoNome(nome: string): string {
  const match = nome.match(/(\d{2})(\d{2})(\d{2,4})/)
  if (!match) return new Date().toISOString().slice(0, 10)
  const [, d, m, y] = match
  return `${y.length === 2 ? `20${y}` : y}-${m}-${d}`
}

async function importarVendasDia(file: File): Promise<{ contagem: number; mensagem: string }> {
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
  }
}

// Importa a aba "Base" da planilha diária: por mapa (col M), o motorista
// (col V/W) e os ajudantes (col Y/Z e AB/AC). Usado para anexar os nomes da
// equipe na confirmação de reposição enviada ao motorista no WhatsApp.
async function importarBaseMapa(file: File): Promise<{ contagem: number; mensagem: string }> {
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
        data, mapa,
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

  // Substitui os dados do dia (idempotente)
  const { error: delErr } = await valesSupabase.from('mapa_equipe').delete().eq('data', data)
  if (delErr) throw new Error(`Erro ao limpar equipe do mapa: ${delErr.message}`)

  const BATCH = 500
  for (let i = 0; i < equipe.length; i += BATCH) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await valesSupabase.from('mapa_equipe').insert(equipe.slice(i, i + BATCH) as any[])
    if (error) throw new Error(`Erro ao salvar equipe do mapa: ${error.message}`)
  }

  return { contagem: equipe.length, mensagem: `Data: ${data}. Motorista e ajudantes aparecerão na confirmação.` }
}

export default function ImportCatalogoPage() {
  const ref = useRef<HTMLInputElement>(null)
  const refBase = useRef<HTMLInputElement>(null)
  const [fase, setFase] = useState<Fase>('idle')
  const [logs, setLogs] = useState<Log[]>([])
  const [faseBase, setFaseBase] = useState<Fase>('idle')
  const [logsBase, setLogsBase] = useState<Log[]>([])

  async function handleFile(file: File) {
    setFase('lendo')
    setLogs([{ tipo: 'info', msg: `Lendo ${file.name}…` }])
    try {
      setFase('importando')
      const { contagem, mensagem } = await importarVendasDia(file)
      setLogs(prev => [...prev, { tipo: 'ok', msg: `✅ ${contagem} registros importados. ${mensagem}` }])
      setFase('ok')
    } catch (e) {
      setLogs(prev => [...prev, { tipo: 'erro', msg: String(e) }])
      setFase('erro')
    }
  }

  async function handleFileBase(file: File) {
    setFaseBase('lendo')
    setLogsBase([{ tipo: 'info', msg: `Lendo ${file.name}…` }])
    try {
      setFaseBase('importando')
      const { contagem, mensagem } = await importarBaseMapa(file)
      setLogsBase(prev => [...prev, { tipo: 'ok', msg: `✅ ${contagem} mapas importados. ${mensagem}` }])
      setFaseBase('ok')
    } catch (e) {
      setLogsBase(prev => [...prev, { tipo: 'erro', msg: String(e) }])
      setFaseBase('erro')
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

      <div className="rounded-lg border border-dashed p-4 text-sm space-y-1">
        <p className="font-medium">Catálogo de produtos e PDVs</p>
        <p className="text-muted-foreground text-xs">
          Os dados do catálogo (produtos e PDVs) foram carregados diretamente durante a configuração do sistema
          e não precisam ser reimportados. Caso precise atualizar o catálogo (ex: novos produtos), use o
          script <code className="bg-muted px-1 rounded">scripts/seed-catalogo.mjs</code> disponível no repositório.
        </p>
      </div>
    </div>
  )
}
