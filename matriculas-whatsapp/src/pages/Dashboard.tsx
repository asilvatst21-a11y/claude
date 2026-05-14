import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CreditCard, Users, CheckCircle, XCircle } from 'lucide-react'

interface Stats {
  totalMatriculas: number
  matriculasAtivas: number
  totalClientes: number
  disparosEnviados: number
  disparosErro: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalMatriculas: 0,
    matriculasAtivas: 0,
    totalClientes: 0,
    disparosEnviados: 0,
    disparosErro: 0,
  })

  useEffect(() => {
    async function load() {
      const [
        { count: totalMatriculas },
        { count: matriculasAtivas },
        { count: totalClientes },
        { count: disparosEnviados },
        { count: disparosErro },
      ] = await Promise.all([
        supabase.from('matriculas').select('*', { count: 'exact', head: true }),
        supabase.from('matriculas').select('*', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('clientes').select('*', { count: 'exact', head: true }),
        supabase.from('disparos').select('*', { count: 'exact', head: true }).eq('status', 'enviado'),
        supabase.from('disparos').select('*', { count: 'exact', head: true }).eq('status', 'erro'),
      ])
      setStats({
        totalMatriculas: totalMatriculas ?? 0,
        matriculasAtivas: matriculasAtivas ?? 0,
        totalClientes: totalClientes ?? 0,
        disparosEnviados: disparosEnviados ?? 0,
        disparosErro: disparosErro ?? 0,
      })
    }
    load()
  }, [])

  const cards = [
    { label: 'Total de Matrículas', value: stats.totalMatriculas, icon: CreditCard, color: 'blue' },
    { label: 'Matrículas Ativas', value: stats.matriculasAtivas, icon: CheckCircle, color: 'green' },
    { label: 'Clientes Cadastrados', value: stats.totalClientes, icon: Users, color: 'purple' },
    { label: 'Mensagens Enviadas', value: stats.disparosEnviados, icon: CheckCircle, color: 'green' },
    { label: 'Erros de Envio', value: stats.disparosErro, icon: XCircle, color: 'red' },
  ]

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-4">
            <div className={`p-3 rounded-lg ${colorMap[color]}`}>
              <Icon size={22} />
            </div>
            <div>
              <p className="text-sm text-gray-500">{label}</p>
              <p className="text-3xl font-bold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
