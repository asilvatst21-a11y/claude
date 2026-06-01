'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ScoreBadge from '@/components/ui/ScoreBadge'
import DataTable from '@/components/ui/DataTable'

interface Colaborador {
  id: number; nome: string; cargo: string; setor: string
  lider_responsavel: string; data_admissao: string; status: string
  score: number; riskLevel: string
  components: { dto: number; conduta: number; telemetria: number }
  flags: { dtoCritical: boolean; telemetriaCritical: boolean }
}

export default function ColaboradorPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const id = params.id
  const [col, setCol] = useState<Colaborador | null>(null)
  const [dtos, setDtos] = useState<Record<string,unknown>[]>([])
  const [avals, setAvals] = useState<Record<string,unknown>[]>([])
  const [tels, setTels] = useState<Record<string,unknown>[]>([])
  const [encs, setEncs] = useState<Record<string,unknown>[]>([])
  const [relatos, setRelatos] = useState<{ relatos: Record<string,unknown>[]; atos: number; positivas: number; saldo: number } | null>(null)
  const [gsdpq, setGsdpq] = useState<{ registros: Record<string,unknown>[]; topNos: {item_nome:string;count:number}[]; totalNo: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/colaboradores/${id}`).then(r => r.json()).catch(() => null),
      fetch(`/api/dtos?colaborador_id=${id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/avaliacoes?colaborador_id=${id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/telemetria?motorista_id=${id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/encaminhamentos?colaborador_id=${id}`).then(r => r.json()).catch(() => []),
      fetch(`/api/colaboradores/${id}/relatos`).then(r => r.json()).catch(() => null),
      fetch(`/api/colaboradores/${id}/gsdpq`).then(r => r.json()).catch(() => null),
    ]).then(([c, d, a, t, e, rel, gs]) => {
      setCol(c && !c.error ? c : null)
      setDtos(Array.isArray(d) ? d : [])
      setAvals(Array.isArray(a) ? a : [])
      setTels(Array.isArray(t) ? t : [])
      setEncs(Array.isArray(e) ? e : [])
      setRelatos(rel && !rel.error ? rel : null)
      setGsdpq(gs && !gs.error ? gs : null)
      setLoading(false)
    })
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Carregando...</div>
  if (!col) return <div className="p-8 text-center text-red-500">Colaborador não encontrado.</div>

  const isMotorista = col.cargo.toLowerCase().includes('motorista')

  const dtoColumns = [
    { key: 'data_realizacao', label: 'Realização' },
    { key: 'data_validade', label: 'Validade' },
    { key: 'status', label: 'Status', render: (v: unknown) => {
      const colors: Record<string,string> = { em_dia: 'text-green-700 bg-green-50', vencido: 'text-red-700 bg-red-50', ausente: 'text-gray-600 bg-gray-100' }
      return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[v as string] || ''}`}>{v as string}</span>
    }},
    { key: 'observacoes', label: 'Observações' },
  ]

  const avalColumns = [
    { key: 'data', label: 'Data' },
    { key: 'tipo', label: 'Tipo', render: (v: unknown) => {
      const colors: Record<string,string> = { ato_inseguro: 'text-red-700 bg-red-50', condicao_insegura: 'text-orange-700 bg-orange-50', abordagem_positiva: 'text-green-700 bg-green-50' }
      const labels: Record<string,string> = { ato_inseguro: 'Ato Inseguro', condicao_insegura: 'Condição Insegura', abordagem_positiva: 'Abordagem Positiva' }
      return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[v as string]||''}`}>{labels[v as string]||v as string}</span>
    }},
    { key: 'descricao', label: 'Descrição' },
    { key: 'gravidade', label: 'Grau' },
    { key: 'registrado_por', label: 'Registrado por' },
  ]

  const telColumns = [
    { key: 'periodo_ref', label: 'Período' },
    { key: 'qtd_excessos_velocidade', label: 'Excessos Vel.' },
    { key: 'qtd_frenagens_bruscas', label: 'Frenagens' },
    { key: 'qtd_curvas_bruscas', label: 'Curvas' },
    { key: 'score_calculado', label: 'Score Tel.' },
  ]

  const encColumns = [
    { key: 'tipo', label: 'Tipo' },
    { key: 'prazo', label: 'Prazo' },
    { key: 'status', label: 'Status', render: (v: unknown) => {
      const colors: Record<string,string> = { pendente: 'text-orange-700 bg-orange-50', concluido: 'text-green-700 bg-green-50' }
      return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[v as string]||''}`}>{v as string}</span>
    }},
    { key: 'criado_em', label: 'Criado em', render: (v: unknown) => v ? new Date(v as string).toLocaleDateString('pt-BR') : '—' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{col.nome}</h1>
          <p className="text-sm text-gray-500">{col.cargo} · {col.setor}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-wrap gap-6 items-start">
          <div className="flex-1 min-w-48 grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-gray-400 text-xs">Líder</p><p className="font-medium">{col.lider_responsavel}</p></div>
            <div><p className="text-gray-400 text-xs">Admissão</p><p className="font-medium">{col.data_admissao}</p></div>
            <div><p className="text-gray-400 text-xs">Status</p><p className="font-medium capitalize">{col.status}</p></div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-xs text-gray-400 uppercase font-medium">Score</p>
            <ScoreBadge score={col.score} large />
            <div className="flex gap-3 text-xs text-gray-500 mt-1">
              <span>DTO: {col.components.dto}</span>
              <span>Conduta: {col.components.conduta}</span>
              <span>Tel: {col.components.telemetria}</span>
            </div>
          </div>
        </div>
      </div>

      <Section title={`DTOs (${dtos.length})`}>
        <DataTable columns={dtoColumns} data={dtos} emptyMessage="Nenhum DTO registrado." />
      </Section>

      <Section title={`Avaliações de Conduta (${avals.length})`}>
        <DataTable columns={avalColumns} data={avals} emptyMessage="Nenhuma avaliação registrada." />
      </Section>

      {isMotorista && (
        <Section title={`Telemetria (${tels.length})`}>
          <DataTable columns={telColumns} data={tels} emptyMessage="Nenhum registro de telemetria." />
        </Section>
      )}

      <Section title={`Encaminhamentos (${encs.length})`}>
        <DataTable columns={encColumns} data={encs} emptyMessage="Nenhum encaminhamento." />
      </Section>

      {gsdpq && gsdpq.registros.length > 0 && (
        <Section title={`Observações GSDPQ / DTO (${gsdpq.registros.length})`}>
          {gsdpq.topNos.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Itens com mais NOs</p>
              <div className="flex flex-wrap gap-2">
                {gsdpq.topNos.map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                    <span className="text-orange-700 font-bold text-sm">{item.count}×</span>
                    <span className="text-orange-800 text-xs">{item.item_nome.length > 60 ? item.item_nome.slice(0,60)+'…' : item.item_nome}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">{gsdpq.totalNo} ocorrências NO no total</p>
            </div>
          )}
          <DataTable
            columns={[
              { key: 'data', label: 'Data' },
              { key: 'tipo', label: 'Tipo' },
              { key: 'realizado_por', label: 'Avaliador' },
              { key: 'percentual_conformidade', label: 'Conformidade', render: (v: unknown) => {
                const p = Number(v)
                const color = p >= 80 ? 'text-green-700' : p >= 60 ? 'text-orange-600' : 'text-red-600'
                return <span className={`font-semibold ${color}`}>{isNaN(p) ? '—' : `${p.toFixed(0)}%`}</span>
              }},
              { key: 'itens_no', label: 'NOs', render: (v: unknown) => (
                <span className={Number(v) > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>{String(v)}</span>
              )},
              { key: 'observacoes', label: 'Observações' },
            ]}
            data={gsdpq.registros}
            emptyMessage="Nenhuma observação registrada."
          />
        </Section>
      )}

      {relatos && (
        <Section title={`Relatos de Comportamento (${relatos.relatos.length})`}>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{relatos.positivas}</p>
              <p className="text-xs text-green-600 mt-1 font-medium">Abordagens Positivas</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{relatos.atos}</p>
              <p className="text-xs text-red-600 mt-1 font-medium">Atos Inseguros</p>
            </div>
            <div className={`${relatos.saldo >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'} border rounded-lg p-4 text-center`}>
              <p className={`text-2xl font-bold ${relatos.saldo >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {relatos.saldo >= 0 ? '+' : ''}{relatos.saldo}
              </p>
              <p className={`text-xs mt-1 font-medium ${relatos.saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Saldo Comportamental</p>
            </div>
          </div>
          <DataTable
            columns={[
              { key: 'data', label: 'Data' },
              { key: 'tipo', label: 'Tipo', render: (v: unknown) => (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  v === 'ato_inseguro' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                  {v === 'ato_inseguro' ? 'Ato Inseguro' : 'Abordagem Positiva'}
                </span>
              )},
              { key: 'descricao', label: 'Descrição' },
              { key: 'registrado_por', label: 'Registrado por' },
            ]}
            data={relatos.relatos}
            emptyMessage="Nenhum relato registrado."
          />
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  )
}
