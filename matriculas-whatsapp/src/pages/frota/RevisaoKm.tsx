import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload, Loader2, CheckCircle2, AlertTriangle, ExternalLink, Copy, Route,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { formatarDataBR } from '../../lib/utils'
import { importarKmApuracao, type ProgressoImportacaoKm, type ResultadoImportacaoKm } from '../../lib/kmApuracao/importacao'
import { buscarLotesImportacao, type LoteImportacaoKm } from '../../lib/kmApuracao/consultas'

function competenciaLabel(competencia: string): string {
  const [ano, mes] = competencia.split('-')
  return `${mes}/${ano}`
}

const STATUS_LABEL: Record<LoteImportacaoKm['status'], string> = {
  processando: 'Processando',
  concluido: 'Concluído',
  com_pendencias: 'Com pendências',
  erro: 'Erro',
}

const STATUS_COR: Record<LoteImportacaoKm['status'], string> = {
  processando: 'bg-blue-50 text-blue-700 border-blue-200',
  concluido: 'bg-green-50 text-green-700 border-green-200',
  com_pendencias: 'bg-amber-50 text-amber-700 border-amber-200',
  erro: 'bg-red-50 text-red-700 border-red-200',
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="border rounded-xl bg-white p-4 shadow-sm">{children}</div>
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-l-4 border-accent-500 pl-3">
      <h2 className="text-base font-bold">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

export default function RevisaoKm() {
  const { usuario } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progresso, setProgresso] = useState<ProgressoImportacaoKm | null>(null)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<ResultadoImportacaoKm | null>(null)
  const [lotes, setLotes] = useState<LoteImportacaoKm[]>([])
  const [carregandoLotes, setCarregandoLotes] = useState(true)
  const [copiado, setCopiado] = useState(false)

  const linkPublico = `${window.location.origin}/apuracao-km`

  const carregarLotes = useCallback(async () => {
    if (!usuario) return
    setCarregandoLotes(true)
    try {
      setLotes(await buscarLotesImportacao(usuario.filial))
    } catch {
      setLotes([])
    } finally {
      setCarregandoLotes(false)
    }
  }, [usuario])

  useEffect(() => { carregarLotes() }, [carregarLotes])

  async function handleArquivo(arquivo: File) {
    if (!usuario) return
    setErro('')
    setResultado(null)
    setProgresso({ fase: 'lendo', processados: 0, total: 0 })
    try {
      const r = await importarKmApuracao(usuario.filial, arquivo, usuario.login, setProgresso)
      setResultado(r)
      await carregarLotes()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar a planilha.')
    } finally {
      setProgresso(null)
    }
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(linkPublico)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch { /* clipboard indisponível — link já fica visível na tela */ }
  }

  const importando = progresso != null
  const pct = progresso && progresso.total > 0 ? Math.round((progresso.processados / progresso.total) * 100) : 0

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-accent/40 text-accent-700 flex items-center justify-center">
          <Route className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Apuração de KM</h1>
          <p className="text-sm text-muted-foreground">Upload da planilha mensal e histórico de importações</p>
        </div>
      </div>

      <Card>
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-accent-500 hover:bg-accent/30 transition-colors"
          onClick={() => !importando && inputRef.current?.click()}
        >
          {importando ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-accent-600" />
              <p className="text-sm font-semibold">
                {progresso!.fase === 'lendo' ? 'Lendo arquivo...' : 'Importando...'}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {progresso!.total > 0 ? `${progresso!.processados.toLocaleString('pt-BR')} de ${progresso!.total.toLocaleString('pt-BR')} (${pct}%)` : 'preparando...'}
              </p>
              <div className="w-64 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full bg-accent-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-6 w-6" />
              <p className="text-sm font-semibold text-foreground">Clique para selecionar a planilha (.xlsx)</p>
              <p className="text-xs">Reimportar a mesma competência atualiza os dados, não duplica</p>
            </div>
          )}
        </div>
        <input
          ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleArquivo(f)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />

        {erro && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> {erro}
          </div>
        )}

        {resultado && (
          <div className={`mt-4 rounded-lg border p-3 text-sm ${resultado.status === 'concluido' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <div className="flex items-center gap-2 font-semibold">
              {resultado.status === 'concluido' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              Competência {competenciaLabel(resultado.competencia)} — {STATUS_LABEL[resultado.status]}
            </div>
            <p className="mt-1 tabular-nums">
              {resultado.totalGravadas.toLocaleString('pt-BR')} viagens gravadas de {resultado.totalLinhas.toLocaleString('pt-BR')} linhas na planilha
            </p>
            {resultado.pendencias.length > 0 && (
              <ul className="mt-2 space-y-1">
                {resultado.pendencias.map((p) => (
                  <li key={p.codigo}>• {p.descricao}: <b className="tabular-nums">{p.quantidade}</b></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between border rounded-xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold">Link de visualização pública</p>
          <a href="/apuracao-km" target="_blank" rel="noreferrer" className="text-sm text-accent-700 underline flex items-center gap-1">
            {linkPublico} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <button
          onClick={copiarLink}
          className="text-xs px-3 py-1.5 rounded-lg border border-accent-300 text-accent-700 hover:bg-accent-50 flex items-center gap-1.5 shrink-0"
        >
          <Copy className="h-3.5 w-3.5" /> {copiado ? 'Copiado' : 'Copiar link'}
        </button>
      </div>

      <div className="space-y-3">
        <SectionTitle title="Importações" subtitle={`${lotes.length} competência(s)`} />
        <div className="border rounded-xl bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 px-4">Competência</th>
                <th className="py-2 px-4">Arquivo</th>
                <th className="py-2 px-4 text-right">Viagens</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 px-4">Importado em</th>
              </tr>
            </thead>
            <tbody>
              {carregandoLotes ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Carregando...</td></tr>
              ) : lotes.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma competência importada ainda.</td></tr>
              ) : lotes.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2 px-4 font-semibold">{competenciaLabel(l.competencia)}</td>
                  <td className="py-2 px-4 text-muted-foreground truncate max-w-xs">{l.arquivoNome ?? '—'}</td>
                  <td className="py-2 px-4 text-right tabular-nums">{l.totalCalculadas.toLocaleString('pt-BR')}</td>
                  <td className="py-2 px-4">
                    <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COR[l.status]}`}>
                      {STATUS_LABEL[l.status]}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-muted-foreground">{formatarDataBR(l.importadoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
