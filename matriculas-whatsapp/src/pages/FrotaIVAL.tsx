import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownUp, ArrowLeft, Building2, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import { buscarTrocasPlacaArmazem, type TrocaPlaca } from '../lib/trocaPlacaManutenco'

export default function FrotaIVAL() {
  const { usuario } = useAuth()
  const [trocas, setTrocas] = useState<TrocaPlaca[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!usuario) return
    setCarregando(true)
    setErro('')
    buscarTrocasPlacaArmazem(usuario.filial)
      .then(setTrocas)
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar trocas de placa.'))
      .finally(() => setCarregando(false))
  }, [usuario])

  const diasUnicos = new Set(trocas.map((t) => t.data)).size

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/frota" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            IV - AL
            <span className="text-xs font-medium text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">Apoio Logístico</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            {usuario && <><Building2 size={12} /> {usuario.filial} ·</>} Trocas de placa por manutenção no carregamento (fase Gerado → Carregado do 03.11.20)
          </p>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start gap-2 mb-4"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{erro}</div>}

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 size={24} className="animate-spin mr-2" /> Carregando dados...
        </div>
      ) : trocas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ArrowDownUp size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhuma troca de placa encontrada.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">Total de Trocas</p>
              <p className="text-2xl font-bold text-brand-700">{trocas.length}</p>
            </div>
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">Período</p>
              <p className="text-sm font-semibold">{formatarDataBR(trocas[0]?.data)} a {formatarDataBR(trocas[trocas.length - 1]?.data)}</p>
            </div>
            <div className="border rounded-xl bg-white p-4">
              <p className="text-xs text-muted-foreground mb-1">Dias Únicos</p>
              <p className="text-2xl font-bold text-brand-700">{diasUnicos}</p>
            </div>
          </div>

          <div className="border rounded-xl bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Data</th>
                  <th className="px-4 py-2 text-left font-semibold">Mapa</th>
                  <th className="px-4 py-2 text-left font-semibold">Placa Gerado</th>
                  <th className="px-4 py-2 text-center font-semibold">→</th>
                  <th className="px-4 py-2 text-left font-semibold">Placa Carregado</th>
                </tr>
              </thead>
              <tbody>
                {trocas.map((troca, i) => (
                  <tr key={`${troca.mapa}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2 text-muted-foreground">{formatarDataBR(troca.data)}</td>
                    <td className="px-4 py-2 font-semibold text-gray-900">{troca.mapa}</td>
                    <td className="px-4 py-2"><code className="text-xs bg-gray-100 px-2 py-1 rounded font-semibold">{troca.placaGerado}</code></td>
                    <td className="px-4 py-2 text-center text-muted-foreground">→</td>
                    <td className="px-4 py-2"><code className="text-xs bg-gray-100 px-2 py-1 rounded font-semibold">{troca.placaCarregado}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
