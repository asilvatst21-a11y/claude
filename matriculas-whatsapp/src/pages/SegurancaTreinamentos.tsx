import { useCallback, useEffect, useMemo, useState } from 'react'
import { Target, Loader2, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import {
  rankingAtos, listarSessoes, criarSessao, marcarConcluido, calcularEfetividade, statusSessao,
  type AtoRanking, type SessaoTreinamento, type Efetividade,
} from '../lib/treinamentosSeguranca'

const STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado', andamento: 'Em andamento', atrasado: 'Atrasado', concluido: 'Concluído',
}
const STATUS_CSS: Record<string, string> = {
  agendado: 'bg-slate-100 text-slate-600 border-slate-200',
  andamento: 'bg-blue-50 text-blue-700 border-blue-200',
  atrasado: 'bg-red-50 text-red-700 border-red-200',
  concluido: 'bg-green-50 text-green-700 border-green-200',
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ConcluirModal({ sessao, onClose, onConfirmado }: { sessao: SessaoTreinamento; onClose: () => void; onConfirmado: () => void }) {
  const { usuario } = useAuth()
  const [data, setData] = useState(hojeISO())
  const [salvando, setSalvando] = useState(false)

  async function confirmar() {
    if (!usuario) return
    setSalvando(true)
    const quem = usuario.nome ?? usuario.login
    const { error } = await marcarConcluido(sessao.id, quem, data)
    setSalvando(false)
    if (!error) onConfirmado()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold flex items-center gap-2 mb-1"><CheckCircle2 className="h-4 w-4 text-green-600" /> Marcar como concluído</h3>
        <p className="text-sm text-muted-foreground mb-3">{sessao.titulo}</p>
        <label className="text-xs font-medium text-muted-foreground">Data de conclusão</label>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 mb-4" />
        <p className="text-xs text-muted-foreground mb-4">Fica registrado que <b>{usuario?.nome ?? usuario?.login}</b> concluiu essa sessão. Essa data vira o marco pra medir efetividade (relatos do mesmo ato antes x depois).</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border">Cancelar</button>
          <button onClick={confirmar} disabled={salvando} className="px-3 py-1.5 text-sm rounded-lg bg-primary text-white disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Confirmar conclusão'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EfetividadeRow({ filial, sessao }: { filial: string; sessao: SessaoTreinamento }) {
  const [ef, setEf] = useState<Efetividade | null | undefined>(undefined)

  useEffect(() => {
    if (!sessao.concluido_em) return
    calcularEfetividade(filial, sessao.ato_alvo, sessao.concluido_em).then(setEf)
  }, [filial, sessao.ato_alvo, sessao.concluido_em])

  if (!sessao.concluido_em) return null

  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{sessao.titulo}</div>
        <div className="text-xs text-muted-foreground">{sessao.ato_alvo} · concluído {formatarDataBR(sessao.concluido_em)} por {sessao.concluido_por}</div>
      </div>
      {ef === undefined ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
      ) : ef && ef.mediaDepois != null ? (
        <div className="flex items-center gap-4 shrink-0 text-right">
          <div>
            <div className="text-sm font-bold tabular-nums">{ef.mediaAntes.toFixed(1)}/sem</div>
            <div className="text-[10px] text-muted-foreground uppercase">4 sem. antes</div>
          </div>
          <div>
            <div className={`text-sm font-bold tabular-nums ${ef.mediaDepois < ef.mediaAntes ? 'text-green-600' : ef.mediaDepois > ef.mediaAntes ? 'text-red-600' : ''}`}>{ef.mediaDepois.toFixed(1)}/sem</div>
            <div className="text-[10px] text-muted-foreground uppercase">4 sem. depois</div>
          </div>
          {ef.deltaPct != null && (
            <span className={`text-xs font-bold px-2 py-1 rounded-full border shrink-0 ${ef.deltaPct < 0 ? 'bg-green-50 text-green-700 border-green-200' : ef.deltaPct > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {ef.deltaPct > 0 ? '▲' : ef.deltaPct < 0 ? '▼' : '—'} {Math.abs(ef.deltaPct)}% {ef.deltaPct < 0 ? '— melhorou' : ef.deltaPct > 0 ? '— piorou' : ''}
            </span>
          )}
        </div>
      ) : (
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-500 shrink-0">Aguardando 4 semanas</span>
      )}
    </div>
  )
}

export default function SegurancaTreinamentos() {
  const { usuario } = useAuth()
  const [periodo, setPeriodo] = useState<'semana' | 'mes'>('mes')
  const [ranking, setRanking] = useState<AtoRanking[]>([])
  const [carregandoRanking, setCarregandoRanking] = useState(true)
  const [sessoes, setSessoes] = useState<SessaoTreinamento[]>([])
  const [carregandoSessoes, setCarregandoSessoes] = useState(true)
  const [concluirAlvo, setConcluirAlvo] = useState<SessaoTreinamento | null>(null)

  const [form, setForm] = useState({
    titulo: '', atoAlvo: '', responsavel: '', equipeAlvo: '', dataPrevista: '', prazoConclusao: '',
    canal: 'presencial', conteudo: '', participantesPrevistos: '',
  })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  const carregarRanking = useCallback(async () => {
    if (!usuario?.filial) return
    setCarregandoRanking(true)
    setRanking(await rankingAtos(usuario.filial, periodo))
    setCarregandoRanking(false)
  }, [usuario?.filial, periodo])

  const carregarSessoes = useCallback(async () => {
    if (!usuario?.filial) return
    setCarregandoSessoes(true)
    setSessoes(await listarSessoes(usuario.filial))
    setCarregandoSessoes(false)
  }, [usuario?.filial])

  useEffect(() => { carregarRanking() }, [carregarRanking])
  useEffect(() => { carregarSessoes() }, [carregarSessoes])

  const topAto = ranking[0] ?? null

  function usarSugestao(ato: AtoRanking) {
    setForm((f) => ({ ...f, atoAlvo: ato.atoAlvo, titulo: f.titulo || `${ato.atoAlvo} — reforço` }))
    document.getElementById('nova-sessao')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function salvar() {
    if (!usuario?.filial || !form.titulo.trim() || !form.atoAlvo.trim()) {
      setMsg('Preencha pelo menos o título e o ato-alvo.')
      return
    }
    setSalvando(true)
    setMsg('')
    const { error } = await criarSessao({
      filial: usuario.filial,
      origem: 'relato',
      ato_alvo: form.atoAlvo.trim(),
      titulo: form.titulo.trim(),
      responsavel: form.responsavel.trim() || null,
      equipe_alvo: form.equipeAlvo.trim() || null,
      data_prevista: form.dataPrevista || null,
      prazo_conclusao: form.prazoConclusao || null,
      canal: form.canal,
      conteudo: form.conteudo.trim() || null,
      participantes_previstos: Number(form.participantesPrevistos) || 0,
    })
    setSalvando(false)
    if (error) { setMsg(`Erro ao criar: ${error}`); return }
    setForm({ titulo: '', atoAlvo: '', responsavel: '', equipeAlvo: '', dataPrevista: '', prazoConclusao: '', canal: 'presencial', conteudo: '', participantesPrevistos: '' })
    setMsg('✅ Sessão criada.')
    carregarSessoes()
  }

  const sessoesConcluidas = useMemo(() => sessoes.filter((s) => s.concluido_em), [sessoes])

  if (!usuario) return null

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" /> Treinamentos Segurança
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ranking de atos mais recorrentes em Relatos → sessão de treinamento sugerida → acompanhamento e efetividade.
          </p>
        </div>
        <div className="inline-flex rounded-lg border bg-slate-50 p-1">
          {(['semana', 'mes'] as const).map((p) => (
            <button key={p} onClick={() => setPeriodo(p)} className={`px-3 py-1.5 text-sm rounded-md font-medium ${periodo === p ? 'bg-white shadow text-foreground' : 'text-muted-foreground'}`}>
              {p === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>

      {/* Ranking */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Atos mais recorrentes — {periodo === 'semana' ? 'últimos 7 dias' : 'últimos 30 dias'}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Relatos classificados "Ato Inseguro", agrupados por tipo de ato. Variação vs. período anterior de mesmo tamanho.</p>
        </div>
        <div className="p-5">
          {carregandoRanking ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem relatos "Ato Inseguro" no período.</p>
          ) : (
            <div className="space-y-2">
              {ranking.slice(0, 6).map((r, i) => {
                const max = ranking[0].total
                const pct = Math.round((r.total / max) * 100)
                const top = i === 0
                return (
                  <div key={r.atoAlvo} className="flex items-center gap-3">
                    <div className={`w-5 text-xs font-bold text-center ${top ? 'text-amber-600' : 'text-muted-foreground'}`}>{i + 1}</div>
                    <div className="w-44 shrink-0 text-sm font-medium truncate">{r.atoAlvo}</div>
                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${top ? 'bg-amber-400' : 'bg-primary/60'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-8 text-sm font-bold text-right tabular-nums">{r.total}</div>
                    <div className="w-14 text-xs font-semibold text-right tabular-nums">
                      {r.deltaPct == null ? <span className="text-muted-foreground">—</span> : (
                        <span className={r.deltaPct > 0 ? 'text-red-600' : r.deltaPct < 0 ? 'text-green-600' : 'text-muted-foreground'}>
                          {r.deltaPct > 0 ? '▲' : r.deltaPct < 0 ? '▼' : '—'} {Math.abs(r.deltaPct)}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {topAto && (
            <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <Target className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 text-sm">
                <b>"{topAto.atoAlvo}"</b> é o ato mais recorrente no período — {topAto.total} relato(s).
              </div>
              <button onClick={() => usarSugestao(topAto)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white shrink-0">
                Criar treinamento ↓
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Nova sessão */}
      <div id="nova-sessao" className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Nova sessão de treinamento</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Clique num ato do ranking pra pré-preencher, ou digite livremente.</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Título da sessão</label>
              <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Ex.: Uso correto de EPI — reforço" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ato-alvo</label>
              <input value={form.atoAlvo} onChange={(e) => setForm((f) => ({ ...f, atoAlvo: e.target.value }))} placeholder="Ex.: Não uso de EPI" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Responsável</label>
              <input value={form.responsavel} onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Equipe / público-alvo</label>
              <input value={form.equipeAlvo} onChange={(e) => setForm((f) => ({ ...f, equipeAlvo: e.target.value }))} placeholder="Ex.: Equipe Carga, Equipe Expedição" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Data prevista</label>
              <input type="date" value={form.dataPrevista} onChange={(e) => setForm((f) => ({ ...f, dataPrevista: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Prazo de conclusão</label>
              <input type="date" value={form.prazoConclusao} onChange={(e) => setForm((f) => ({ ...f, prazoConclusao: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Canal de aplicação</label>
              <select value={form.canal} onChange={(e) => setForm((f) => ({ ...f, canal: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                <option value="presencial">Presencial (DDS)</option>
                <option value="matinal_aurora">Matinal via Aurora</option>
                <option value="video">Vídeo + checklist</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Participantes previstos</label>
              <input type="number" min="0" value={form.participantesPrevistos} onChange={(e) => setForm((f) => ({ ...f, participantesPrevistos: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Conteúdo / observações</label>
            <textarea value={form.conteudo} onChange={(e) => setForm((f) => ({ ...f, conteudo: e.target.value }))} rows={3} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 resize-none" />
          </div>
          {msg && <p className="text-sm">{msg}</p>}
          <div className="flex justify-end">
            <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white disabled:opacity-50">
              {salvando ? 'Criando…' : 'Criar sessão'}
            </button>
          </div>
        </div>
      </div>

      {/* Acompanhamento */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Acompanhamento das sessões</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Qualquer pessoa com acesso a essa tela pode marcar como concluído, registrando quem e quando.</p>
        </div>
        <div className="overflow-x-auto">
          {carregandoSessoes ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : sessoes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma sessão criada ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="px-4 py-2">Ato-alvo</th>
                  <th className="px-4 py-2">Sessão</th>
                  <th className="px-4 py-2">Responsável</th>
                  <th className="px-4 py-2">Participantes</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sessoes.map((s) => {
                  const status = statusSessao(s)
                  return (
                    <tr key={s.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2.5"><span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-50 text-red-700">{s.ato_alvo}</span></td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold">{s.titulo}</div>
                        <div className="text-xs text-muted-foreground">{s.canal ?? '—'} · {s.prazo_conclusao ? `prazo ${formatarDataBR(s.prazo_conclusao)}` : 'sem prazo'}</div>
                      </td>
                      <td className="px-4 py-2.5">{s.responsavel ?? '—'}</td>
                      <td className="px-4 py-2.5 tabular-nums">{s.participantes_confirmados}/{s.participantes_previstos}</td>
                      <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_CSS[status]}`}>{STATUS_LABEL[status]}</span></td>
                      <td className="px-4 py-2.5 text-right">
                        {status === 'concluido' ? (
                          <span className="text-xs text-muted-foreground">{formatarDataBR(s.concluido_em)} · {s.concluido_por}</span>
                        ) : (
                          <button onClick={() => setConcluirAlvo(s)} className="text-xs font-semibold text-primary">✓ Marcar concluído</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Efetividade */}
      {sessoesConcluidas.length > 0 && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold text-sm">Efetividade pós-treinamento</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Média de relatos/semana daquele ato, 4 semanas antes vs. 4 semanas depois da conclusão.</p>
          </div>
          <div className="px-5">
            {sessoesConcluidas.map((s) => (
              <EfetividadeRow key={s.id} filial={usuario.filial} sessao={s} />
            ))}
          </div>
        </div>
      )}

      {concluirAlvo && (
        <ConcluirModal
          sessao={concluirAlvo}
          onClose={() => setConcluirAlvo(null)}
          onConfirmado={() => { setConcluirAlvo(null); carregarSessoes() }}
        />
      )}
    </div>
  )
}
