import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Disparo } from '../types'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'

export default function Historico() {
  const [lista, setLista] = useState<Disparo[]>([])
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('disparos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setLista(data ?? [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  const statusIcon = (s: Disparo['status']) => {
    if (s === 'enviado') return <CheckCircle size={15} className="text-green-500" />
    if (s === 'erro') return <XCircle size={15} className="text-red-500" />
    return <Clock size={15} className="text-yellow-500" />
  }

  const statusLabel: Record<Disparo['status'], string> = {
    enviado: 'Enviado',
    erro: 'Erro',
    pendente: 'Pendente',
  }

  const statusColor: Record<Disparo['status'], string> = {
    enviado: 'text-green-600 bg-green-50',
    erro: 'text-red-600 bg-red-50',
    pendente: 'text-yellow-600 bg-yellow-50',
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Histórico de Disparos</h2>
        <button
          onClick={carregar}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">WhatsApp</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Mensagem</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Erro</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">Carregando...</td>
              </tr>
            )}
            {!loading && lista.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-gray-400">Nenhum disparo registrado</td>
              </tr>
            )}
            {lista.map(d => (
              <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[d.status]}`}>
                    {statusIcon(d.status)} {statusLabel[d.status]}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-gray-700">{d.whatsapp}</td>
                <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{d.mensagem}</td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(d.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-red-500 text-xs max-w-xs truncate">{d.erro ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
