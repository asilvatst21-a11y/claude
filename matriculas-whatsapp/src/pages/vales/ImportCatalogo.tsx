import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, CheckCircle2, AlertTriangle, Loader2, PackageSearch, MapPin, ShoppingCart } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Fase = 'idle' | 'lendo' | 'importando' | 'ok' | 'erro'

interface Log { tipo: 'ok' | 'erro' | 'info'; msg: string }

async function upsertBatch(
  tabela: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  onProgress?: (n: number) => void,
): Promise<string | null> {
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(tabela).upsert(rows.slice(i, i + BATCH))
    if (error) return error.message
    onProgress?.(Math.min(i + BATCH, rows.length))
  }
  return null
}

// ── Seção de importação genérica ──────────────────────────────────────────────

function Secao({
  titulo, descricao, icone: Icone, accept, onImport,
}: {
  titulo: string
  descricao: string
  icone: React.ElementType
  accept: string
  onImport: (file: File) => Promise<{ contagem: number; mensagem: string }>
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [fase, setFase] = useState<Fase>('idle')
  const [logs, setLogs] = useState<Log[]>([])
  const [prog, setProg] = useState(0)

  async function handleFile(file: File) {
    setFase('lendo')
    setLogs([{ tipo: 'info', msg: `Lendo ${file.name}…` }])
    setProg(0)
    try {
      setFase('importando')
      const { contagem, mensagem } = await onImport(file)
      setLogs(prev => [...prev, { tipo: 'ok', msg: `✅ ${contagem} registros importados. ${mensagem}` }])
      setFase('ok')
    } catch (e) {
      setLogs(prev => [...prev, { tipo: 'erro', msg: String(e) }])
      setFase('erro')
    }
    setProg(0)
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Icone className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div>
          <h2 className="font-semibold">{titulo}</h2>
          <p className="text-sm text-muted-foreground">{descricao}</p>
        </div>
      </div>

      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />

      <button
        onClick={() => ref.current?.click()}
        disabled={fase === 'lendo' || fase === 'importando'}
        className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
      >
        {fase === 'lendo' || fase === 'importando'
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Upload className="h-4 w-4" />}
        {fase === 'lendo' ? 'Lendo arquivo…'
          : fase === 'importando' ? `Importando… ${prog > 0 ? prog : ''}`
          : 'Selecionar arquivo'}
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
  )
}

// ── Importadores ──────────────────────────────────────────────────────────────

async function importarCatalogoProdutos(file: File): Promise<{ contagem: number; mensagem: string }> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  // Produtos — sheet "01_11"
  const wsProd = wb.Sheets['01_11']
  if (!wsProd) throw new Error('Aba "01_11" não encontrada. Verifique se o arquivo correto foi selecionado.')

  const rowsProd = XLSX.utils.sheet_to_json<any[]>(wsProd, { header: 1, defval: '' })
  // header: Cód | Código | Descrição | PGV | Empresa | Tipo Marca | Linha Marca | Embalagem | Marca | Vasilhame | ... | Descrição unitária (last)
  const produtos = rowsProd.slice(1)
    .filter(r => r[0] && String(r[0]).trim() !== '' && !isNaN(Number(r[0])))
    .map(r => ({
      codigo:        Number(r[0]),
      descricao:     String(r[2] ?? '').trim(),
      linha_marca:   String(r[6] ?? '').trim(),
      embalagem:     String(r[7] ?? '').trim(),
      marca:         String(r[8] ?? '').trim(),
      descricao_unit: String(r[r.length - 1] ?? '').trim() || null,
    }))
    .filter(p => p.descricao)

  // PDVs — sheet "01_05_07_04_02"
  const wsPdv = wb.Sheets['01_05_07_04_02']
  if (!wsPdv) throw new Error('Aba "01_05_07_04_02" não encontrada.')

  const rowsPdv = XLSX.utils.sheet_to_json<any[]>(wsPdv, { header: 1, defval: '' })
  // header: PDV | Nome Fantasia | RN | Empresa | Filial | Cód PDV | ... | Telefone(s)
  const pdvs = rowsPdv.slice(1)
    .filter(r => r[0] && !isNaN(Number(r[0])))
    .map(r => ({
      codigo:        Number(r[0]),
      nome_fantasia: String(r[1] ?? '').trim(),
      rota:          r[2] !== '' && !isNaN(Number(r[2])) ? Number(r[2]) : null,
      filial:        r[4] !== '' && !isNaN(Number(r[4])) ? Number(r[4]) : null,
      setor:         null as string | null,
      endereco:      String(r[10] ?? '').trim() || null,
      telefone:      String(r[16] ?? '').trim() || null,
    }))
    .filter(p => p.nome_fantasia)

  const errProd = await upsertBatch('produtos', produtos)
  if (errProd) throw new Error(`Erro ao salvar produtos: ${errProd}`)

  const errPdv = await upsertBatch('pdvs', pdvs)
  if (errPdv) throw new Error(`Erro ao salvar PDVs: ${errPdv}`)

  return {
    contagem: produtos.length + pdvs.length,
    mensagem: `${produtos.length} produtos + ${pdvs.length} PDVs salvos no catálogo.`,
  }
}

async function importarVendasDia(file: File): Promise<{ contagem: number; mensagem: string }> {
  const texto = await file.text()
  const linhas = texto.split(/\r?\n/).filter(Boolean)
  if (linhas.length < 2) throw new Error('Arquivo CSV sem dados.')

  // Tenta extrair data do nome do arquivo (formato DDMMYY ou DDMMYYYY)
  const match = file.name.match(/(\d{2})(\d{2})(\d{2,4})/)
  let data: string | null = null
  if (match) {
    const [, d, m, y] = match
    const ano = y.length === 2 ? `20${y}` : y
    data = `${ano}-${m}-${d}`
  }
  if (!data) {
    data = new Date().toISOString().slice(0, 10)
  }

  // Colunas: UNB;UNB Origem;Mapa;Cliente;Linha-marca;Tipo-marca;Produto;Nome Produto;Unid;Venda;...
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
    .filter(Boolean) as Record<string, unknown>[]

  // Limpa os registros do dia antes de inserir (evita duplicatas)
  const { error: delErr } = await supabase.from('vendas_dia').delete().eq('data', data)
  if (delErr) throw new Error(`Erro ao limpar vendas do dia: ${delErr.message}`)

  const errVendas = await upsertBatch('vendas_dia', vendas)
  if (errVendas) throw new Error(`Erro ao salvar vendas: ${errVendas}`)

  return {
    contagem: vendas.length,
    mensagem: `Data: ${data}. Dados disponíveis para confronto no painel de reposições.`,
  }
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function ImportCatalogoPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PackageSearch className="h-6 w-6 text-primary" /> Importar Catálogo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importe a planilha de catálogo Ambev para padronizar nomes de produtos e PDVs no sistema,
          e o CSV de faturamento diário para confrontar as reposições com o que foi entregue.
        </p>
      </div>

      <Secao
        titulo="Catálogo de Produtos e PDVs"
        descricao='Selecione o arquivo XLS exportado do Ambev (abas "01_11" e "01_05_07_04_02"). Os produtos e PDVs serão salvos para enriquecer as reposições.'
        icone={MapPin}
        accept=".xls,.xlsx"
        onImport={importarCatalogoProdutos}
      />

      <Secao
        titulo="Faturamento do Dia (CSV)"
        descricao="Selecione o CSV diário de vendas (separado por ponto e vírgula). A data é extraída do nome do arquivo (ex: 030519.csv = 03/05/2019). Use para confrontar os pedidos de reposição com o que foi realmente entregue."
        icone={ShoppingCart}
        accept=".csv,.txt"
        onImport={importarVendasDia}
      />

      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Como funciona?</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>Após importar o catálogo, o sistema reconhecerá os nomes corretos dos produtos nas reposições.</li>
          <li>O webhook do WhatsApp usará o catálogo para sugerir nomes padronizados ao interpretar mensagens dos motoristas.</li>
          <li>Após importar o faturamento do dia, a tela de Reposições mostrará quais produtos constam nas vendas do PDV informado.</li>
          <li>O catálogo só precisa ser reimportado quando houver mudanças. O faturamento deve ser importado diariamente.</li>
        </ul>
      </div>
    </div>
  )
}
