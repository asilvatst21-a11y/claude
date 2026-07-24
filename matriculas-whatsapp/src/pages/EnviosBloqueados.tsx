import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AlertTriangle, RefreshCw, CheckCircle2, Eye } from 'lucide-react'

interface EnvioBloqueado {
  id: string
  origem: string
  filial: string | null
  nome: string | null
  telefone: string | null
  motivo: string
  detalhe: string | null
  visto: boolean
  created_at: string
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${data} ${hora}`
}

export default function EnviosBloqueados() {
  const [envios, setEnvios] = useState<EnvioBloqueado[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroOrigem, setFiltroOrigem] = useState('todas')
  const [apenasNaoVistos, setApenasNaoVistos] = useState(true)

  const fetchEnvios = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('whatsapp_envios_bloqueados')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    setEnvios(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchEnvios() }, [fetchEnvios])

  async function marcarVisto(id: string, visto: boolean) {
    setEnvios(prev => prev.map(e => e.id === id ? { ...e, visto } : e))
    await supabase.from('whatsapp_envios_bloqueados').update({ visto }).eq('id', id)
  }

  const origens = [...new Set(envios.map(e => e.origem))].sort()
  const listaFiltrada = envios
    .filter(e => filtroOrigem === 'todas' || e.origem === filtroOrigem)
    .filter(e => !apenasNaoVistos || !e.visto)
  const naoVistos = envios.filter(e => !e.visto).length

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" /> Envios Bloqueados
          </h1>
          <p className="text-sm text-muted-foreground">
            Central de envios de WhatsApp que foram bloqueados por colaborador sem status ativo — de qualquer tela do sistema.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-sm bg-white">
            <option value="todas">Todas as origens</option>
            {origens.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm px-2.5">
            <input type="checkbox" checked={apenasNaoVistos} onChange={e => setApenasNaoVistos(e.target.checked)} className="rounded" />
            Só não vistos
          </label>
          <button onClick={fetchEnvios} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4" /><span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2 w-fit">
        <AlertTriangle size={18} className="text-amber-600" />
        <div>
          <p className="text-xs text-amber-700">Não vistos</p>
          <p className="text-xl font-bold text-amber-700">{naoVistos}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground">Carregando...</div>
      ) : listaFiltrada.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <CheckCircle2 className="h-10 w-10 opacity-20 mb-3" />
          <p>Nenhum envio bloqueado {apenasNaoVistos ? 'pendente' : 'registrado'}.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto divide-y">
            {listaFiltrada.map(e => (
              <div key={e.id} className={`flex items-start gap-3 px-4 py-3 text-sm ${e.visto ? 'opacity-50' : ''}`}>
                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{e.nome ?? '—'}</span>
                    {e.telefone && <span className="text-xs text-muted-foreground font-mono">{e.telefone}</span>}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{e.origem}</span>
                    {e.filial && <span className="text-xs text-muted-foreground">{e.filial}</span>}
                  </div>
                  <p className="text-xs text-red-600">{e.motivo}</p>
                  {e.detalhe && <p className="text-xs text-muted-foreground">{e.detalhe}</p>}
                  <p className="text-xs text-muted-foreground">{formatarDataHora(e.created_at)}</p>
                </div>
                <button
                  onClick={() => marcarVisto(e.id, !e.visto)}
                  title={e.visto ? 'Marcar como não visto' : 'Marcar como visto'}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${e.visto ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                >
                  {e.visto ? <Eye className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {e.visto ? 'Visto' : 'Marcar visto'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
