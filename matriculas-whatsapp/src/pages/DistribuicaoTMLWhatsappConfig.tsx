import { useEffect, useState, useCallback } from 'react'
import { MessageSquare, Search, Loader2, RefreshCw, Check, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'
import { listarGrupos, type GrupoZApi } from '../lib/zapi'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Seletor de um grupo: lista (filtrável) vinda do Z-API + entrada manual + copiar.
function GroupPicker({
  label, hint, value, onChange, grupos, onCopy, copiado,
}: {
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  grupos: GrupoZApi[]
  onCopy: (id: string) => void
  copiado: string | null
}) {
  const [filtro, setFiltro] = useState('')
  const filtrados = grupos.filter(
    (g) => !filtro || g.name.toLowerCase().includes(filtro.toLowerCase()) || g.phone.includes(filtro)
  )

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {value && (
          <button
            onClick={() => onCopy(value)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-accent transition-colors shrink-0"
            title="Copiar ID"
          >
            {copiado === value ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado === value ? 'Copiado' : 'Copiar ID'}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {grupos.length > 0 && (
        <>
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar grupos…"
            className="w-full px-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="border rounded-md divide-y max-h-52 overflow-y-auto">
            {filtrados.map((g) => {
              const ativo = value === g.phone
              return (
                <button
                  key={g.phone}
                  onClick={() => onChange(ativo ? '' : g.phone)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 text-left ${ativo ? 'bg-primary/5' : 'hover:bg-muted/40'} transition-colors`}
                >
                  <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${ativo ? 'bg-primary border-primary text-white' : 'border-gray-300'}`}>
                    {ativo && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate">{g.name}</span>
                    <span className="block text-[10px] font-mono text-muted-foreground truncate">{g.phone}</span>
                  </span>
                </button>
              )
            })}
            {filtrados.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum grupo corresponde ao filtro.</p>
            )}
          </div>
        </>
      )}

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ou cole o ID do grupo. Ex: 120363019502650977-group"
        className="w-full px-3 py-2 text-sm font-mono border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  )
}

export default function DistribuicaoTMLWhatsappConfig() {
  const { usuario } = useAuth()
  const filial = usuario?.filial ?? ''

  const [grupos, setGrupos] = useState<GrupoZApi[]>([])
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState<string | null>(null)

  const [diario, setDiario] = useState('')
  const [gerencia, setGerencia] = useState('')
  const [original, setOriginal] = useState({ diario: '', gerencia: '' })

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [copiado, setCopiado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!filial) { setCarregando(false); return }
    setCarregando(true)
    const { data } = await supabase
      .from('filiais')
      .select('grupo_tml_diario_whatsapp, grupo_tml_gerencia_whatsapp')
      .eq('nome', filial)
      .maybeSingle()
    const v = {
      diario: data?.grupo_tml_diario_whatsapp ?? '',
      gerencia: data?.grupo_tml_gerencia_whatsapp ?? '',
    }
    setDiario(v.diario); setGerencia(v.gerencia)
    setOriginal(v)
    setCarregando(false)
  }, [filial])

  useEffect(() => { carregar() }, [carregar])

  async function buscarGrupos() {
    setBuscando(true)
    setErroBusca(null)
    const { grupos: gs, erro } = await listarGrupos()
    setBuscando(false)
    if (erro) { setErroBusca(erro); return }
    if (gs.length === 0) { setErroBusca('Nenhum grupo encontrado nesta instância Z-API.'); return }
    setGrupos(gs.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function salvar() {
    if (!filial) return
    setSalvando(true)
    setSalvo(false)
    await supabase
      .from('filiais')
      .update({
        grupo_tml_diario_whatsapp: diario.trim() || null,
        grupo_tml_gerencia_whatsapp: gerencia.trim() || null,
      })
      .eq('nome', filial)
    setOriginal({ diario: diario.trim(), gerencia: gerencia.trim() })
    setSalvando(false)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  async function copiar(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiado(id)
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  const alterado = diario.trim() !== original.diario || gerencia.trim() !== original.gerencia

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" /> Configuração do WhatsApp — TML
        </h1>
        <p className="text-sm text-muted-foreground">
          Defina os grupos que recebem os resumos de TML da filial{filial && <em> ({filial})</em>}.
        </p>
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={buscarGrupos}
          disabled={buscando}
          className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50"
        >
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : grupos.length > 0 ? <RefreshCw className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          {buscando ? 'Buscando…' : grupos.length > 0 ? 'Atualizar grupos' : 'Buscar grupos (Z-API)'}
        </button>
      </div>

      {erroBusca && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-md p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="break-all">{erroBusca}</span>
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="space-y-4">
          <GroupPicker
            label="Grupo do resumo diário"
            hint="Recebe um resumo automático toda vez que a planilha de saída é importada."
            value={diario} onChange={setDiario} grupos={grupos} onCopy={copiar} copiado={copiado}
          />
          <GroupPicker
            label="Grupo do resumo para a gerência"
            hint='Recebe o resultado final do dia quando você clicar em "Enviar resumo gerencial".'
            value={gerencia} onChange={setGerencia} grupos={grupos} onCopy={copiar} copiado={copiado}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t pt-4">
        {salvo && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Salvo!</span>}
        <button
          onClick={salvar}
          disabled={salvando || !alterado || !filial}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {salvando ? 'Salvando…' : 'Salvar configuração'}
        </button>
      </div>
    </div>
  )
}
