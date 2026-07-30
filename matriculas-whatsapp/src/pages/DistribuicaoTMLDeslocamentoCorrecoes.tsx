import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Trash2, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { SALA_TML_LABEL, type SalaTML, isSalaTML } from '../lib/tml'
import { formatarDataBR } from '../lib/utils'

// Tela separada da Distribuição TML › Deslocamento, de propósito pouco
// visível (só um link discreto na tela principal) — aqui é onde um registro
// isolado de checklist_tml pode ser apagado de vez, quando é claramente erro
// de leitura/digitação no import (não uma correção do dia a dia, por isso
// fica fora da tela principal). Além de apagar a linha, grava em
// checklist_tml_exclusoes (filial, mapa, data) — o import da planilha
// (DistribuicaoTML.tsx) consulta essa lista e pula essas linhas mesmo que a
// mesma planilha com o mesmo erro seja reimportada depois.
interface LinhaChecklist {
  id: string
  mapa: number | null
  sala: SalaTML | null
  matricula: number | null
  nome: string | null
  data: string | null
  horario_inicio: string | null
  horario_final_matinal: string | null
  tempo_deslocamento_minutos: number | null
  motivo: string | null
}

function primeiroDiaDoMesISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function DistribuicaoTMLDeslocamentoCorrecoes() {
  const { usuario } = useAuth()
  const [de, setDe] = useState(primeiroDiaDoMesISO())
  const [ate, setAte] = useState(hojeISO())
  const [sala, setSala] = useState<SalaTML | 'TODAS'>('TODAS')
  const [busca, setBusca] = useState('')
  const [checklist, setChecklist] = useState<LinhaChecklist[]>([])
  const [loading, setLoading] = useState(true)
  const [excluindo, setExcluindo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase
      .from('checklist_tml')
      .select('id, mapa, sala, matricula, nome, data, horario_inicio, horario_final_matinal, tempo_deslocamento_minutos, motivo')
      .eq('filial', usuario.filial)
      .gte('data', de)
      .lte('data', ate)
      .order('data', { ascending: false })
      .limit(2000)
    setChecklist(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [usuario, de, ate])

  useEffect(() => { carregar() }, [carregar])

  const filtrado = useMemo(() => {
    let lista = sala === 'TODAS' ? checklist : checklist.filter((c) => c.sala === sala)
    const q = busca.trim().toLowerCase()
    if (q) lista = lista.filter((c) => (c.nome ?? '').toLowerCase().includes(q) || String(c.matricula ?? '').includes(q))
    return lista
  }, [checklist, sala, busca])

  async function excluirRegistro(c: LinhaChecklist) {
    const confirmar = window.confirm(
      `Excluir de vez o registro de ${c.nome ?? 'motorista'} em ${formatarDataBR(c.data)} ` +
      `(deslocamento de ${c.tempo_deslocamento_minutos ?? '—'} min)?\n\n` +
      'Essa ação não pode ser desfeita — o registro some do Deslocamento, do Fechamento do Dia e do Farol Motoristas, ' +
      'e fica marcado pra não voltar mesmo se essa planilha for reimportada de novo.',
    )
    if (!confirmar) return
    if (!usuario) return
    setExcluindo(c.id)
    const { error } = await supabase.from('checklist_tml').delete().eq('id', c.id)
    if (error) {
      setExcluindo(null)
      alert(`Não foi possível excluir: ${error.message}`)
      return
    }
    // Sem isso, reimportar a mesma planilha (com o mesmo erro) recriaria o
    // registro — o import faz upsert por (filial, mapa, data). Só grava a
    // exclusão permanente quando o mapa é conhecido (mesma chave usada no
    // upsert); linha sem mapa não tem chave estável pra bloquear.
    if (c.mapa != null) {
      const { error: erroExclusao } = await supabase.from('checklist_tml_exclusoes').upsert(
        { filial: usuario.filial, mapa: c.mapa, data: c.data, excluido_por: usuario.nome ?? null },
        { onConflict: 'filial,mapa,data' },
      )
      if (erroExclusao) console.error('checklist_tml_exclusoes upsert error:', erroExclusao.message)
    }
    setExcluindo(null)
    setChecklist((prev) => prev.filter((row) => row.id !== c.id))
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <Link to="/distribuicao/tml/deslocamento" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar pro Deslocamento
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold mt-1">Corrigir registros de Deslocamento</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Use só pra remover um registro que é claramente erro de leitura/digitação no import (não uma correção do dia a
          dia — pra isso, use o campo "Motivo" na tela de Deslocamento). A exclusão é definitiva, some do Deslocamento,
          do Fechamento do Dia e do Farol Motoristas, e fica bloqueada mesmo que essa mesma planilha seja reimportada
          depois.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 border rounded-lg bg-white p-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">De</label>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Até</label>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Sala</label>
          <select
            value={sala}
            onChange={(e) => setSala(isSalaTML(e.target.value) ? e.target.value : 'TODAS')}
            className="border rounded-md px-2 py-1.5 text-sm"
          >
            <option value="TODAS">Todas</option>
            <option value="COLORADO">{SALA_TML_LABEL.COLORADO}</option>
            <option value="SUB-FURIA">{SALA_TML_LABEL['SUB-FURIA']}</option>
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-muted-foreground mb-1">Buscar motorista/matrícula</label>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome ou matrícula…"
              className="w-full border rounded-md pl-7 pr-2 py-1.5 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtrado.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Nenhum registro no período/filtro.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b bg-slate-50">
                <th className="py-2 px-4">Data</th>
                <th className="py-2 px-4">Motorista</th>
                <th className="py-2 px-4">Matrícula</th>
                <th className="py-2 px-4">Sala</th>
                <th className="py-2 px-4">Fim matinal</th>
                <th className="py-2 px-4">Início checklist</th>
                <th className="py-2 px-4 text-right">Deslocamento (min)</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtrado.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-2 px-4 whitespace-nowrap">{formatarDataBR(c.data)}</td>
                  <td className="py-2 px-4">{c.nome ?? '—'}</td>
                  <td className="py-2 px-4 font-mono text-xs">{c.matricula ?? '—'}</td>
                  <td className="py-2 px-4 whitespace-nowrap">{c.sala ? SALA_TML_LABEL[c.sala] : '—'}</td>
                  <td className="py-2 px-4">{c.horario_final_matinal ?? '—'}</td>
                  <td className="py-2 px-4">{c.horario_inicio ?? '—'}</td>
                  <td className="py-2 px-4 text-right font-semibold">{c.tempo_deslocamento_minutos ?? '—'}</td>
                  <td className="py-2 px-4">
                    <button
                      onClick={() => excluirRegistro(c)}
                      disabled={excluindo === c.id}
                      title="Excluir este registro (erro de digitação/leitura no import)"
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 ml-auto"
                    >
                      {excluindo === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
