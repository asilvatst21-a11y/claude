import { useRef, useState } from 'react'
import { Upload, CheckCircle2, AlertTriangle, Loader2, ShoppingCart, PackageSearch } from 'lucide-react'
import { valesSupabase } from '@/lib/valesSupabase'

type Fase = 'idle' | 'lendo' | 'importando' | 'ok' | 'erro'
interface Log { tipo: 'ok' | 'erro' | 'info'; msg: string }

async function importarVendasDia(file: File): Promise<{ contagem: number; mensagem: string }> {
  const texto = await file.text()
  const linhas = texto.split(/\r?\n/).filter(Boolean)
  if (linhas.length < 2) throw new Error('Arquivo CSV sem dados.')

  // Extrai data do nome do arquivo (formato DDMMYY ou DDMMYYYY)
  const match = file.name.match(/(\d{2})(\d{2})(\d{2,4})/)
  let data: string
  if (match) {
    const [, d, m, y] = match
    const ano = y.length === 2 ? `20${y}` : y
    data = `${ano}-${m}-${d}`
  } else {
    data = new Date().toISOString().slice(0, 10)
  }

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

export default function ImportCatalogoPage() {
  const ref = useRef<HTMLInputElement>(null)
  const [fase, setFase] = useState<Fase>('idle')
  const [logs, setLogs] = useState<Log[]>([])

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
