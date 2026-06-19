import { useCallback, useEffect, useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, X, GripVertical, Pencil, Boxes, Loader2 } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import type { ArmazemAtividadeTipo, ArmazemPergunta, ArmazemPerguntaTipo } from '../../types'

const CARGOS = ['Operador', 'Manobrista', 'Ajudante de Armazém']
const TIPOS_PERGUNTA: { value: ArmazemPerguntaTipo; label: string }[] = [
  { value: 'numero', label: 'Número' },
  { value: 'texto', label: 'Texto' },
  { value: 'sim_nao', label: 'Sim / Não' },
  { value: 'multipla_escolha', label: 'Múltipla escolha' },
]

function novaPergunta(ordem: number): ArmazemPergunta {
  return { id: crypto.randomUUID(), ordem, pergunta: '', tipo: 'numero', opcoes: null, obrigatoria: true }
}

function SortablePergunta({
  pergunta, onChange, onRemove,
}: { pergunta: ArmazemPergunta; onChange: (p: ArmazemPergunta) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pergunta.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 bg-gray-50 border rounded-lg p-3">
      <button type="button" {...attributes} {...listeners} className="mt-2 text-gray-400 hover:text-gray-600 cursor-grab shrink-0" title="Arrastar para reordenar">
        <GripVertical size={18} />
      </button>
      <div className="flex-1 space-y-2">
        <Input
          placeholder="Ex: Quantos paletes foram abastecidos?"
          value={pergunta.pergunta}
          onChange={e => onChange({ ...pergunta, pergunta: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={pergunta.tipo}
            onChange={e => onChange({ ...pergunta, tipo: e.target.value as ArmazemPerguntaTipo, opcoes: e.target.value === 'multipla_escolha' ? (pergunta.opcoes ?? ['']) : null })}
          >
            {TIPOS_PERGUNTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={pergunta.obrigatoria} onChange={e => onChange({ ...pergunta, obrigatoria: e.target.checked })} />
            Obrigatória
          </label>
        </div>
        {pergunta.tipo === 'multipla_escolha' && (
          <div className="space-y-1.5 pl-1">
            {(pergunta.opcoes ?? ['']).map((op, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  className="h-8"
                  placeholder={`Opção ${i + 1}`}
                  value={op}
                  onChange={e => {
                    const opcoes = [...(pergunta.opcoes ?? [])]
                    opcoes[i] = e.target.value
                    onChange({ ...pergunta, opcoes })
                  }}
                />
                <button
                  type="button"
                  onClick={() => onChange({ ...pergunta, opcoes: (pergunta.opcoes ?? []).filter((_, idx) => idx !== i) })}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({ ...pergunta, opcoes: [...(pergunta.opcoes ?? []), ''] })}
              className="text-xs text-brand-600 font-medium hover:underline"
            >
              + adicionar opção
            </button>
          </div>
        )}
      </div>
      <button type="button" onClick={onRemove} className="mt-2 text-gray-400 hover:text-red-500 shrink-0" title="Remover pergunta">
        <X size={18} />
      </button>
    </div>
  )
}

interface FormState {
  id: string | null
  nome: string
  cargos: string[]
  unidade_producao: string
  meta_tempo_minutos: string
  perguntas: ArmazemPergunta[]
  ativo: boolean
}

function estadoVazio(): FormState {
  return { id: null, nome: '', cargos: [], unidade_producao: '', meta_tempo_minutos: '', perguntas: [], ativo: true }
}

export default function ArmazemCadastro() {
  const { usuario } = useAuth()
  const [atividades, setAtividades] = useState<ArmazemAtividadeTipo[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const fetchAtividades = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const { data } = await supabase
      .from('armazem_atividades_tipo')
      .select('*')
      .eq('filial', usuario.filial)
      .order('created_at', { ascending: false })
    setAtividades(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchAtividades() }, [fetchAtividades])

  function abrirNova() {
    setErro('')
    setForm(estadoVazio())
  }

  function abrirEdicao(a: ArmazemAtividadeTipo) {
    setErro('')
    setForm({
      id: a.id,
      nome: a.nome,
      cargos: a.cargos,
      unidade_producao: a.unidade_producao ?? '',
      meta_tempo_minutos: a.meta_tempo_minutos != null ? String(a.meta_tempo_minutos) : '',
      perguntas: a.perguntas,
      ativo: a.ativo,
    })
  }

  function toggleCargo(cargo: string) {
    if (!form) return
    setForm({
      ...form,
      cargos: form.cargos.includes(cargo) ? form.cargos.filter(c => c !== cargo) : [...form.cargos, cargo],
    })
  }

  function addPergunta() {
    if (!form) return
    setForm({ ...form, perguntas: [...form.perguntas, novaPergunta(form.perguntas.length)] })
  }

  function atualizarPergunta(p: ArmazemPergunta) {
    if (!form) return
    setForm({ ...form, perguntas: form.perguntas.map(q => q.id === p.id ? p : q) })
  }

  function removerPergunta(id: string) {
    if (!form) return
    setForm({ ...form, perguntas: form.perguntas.filter(q => q.id !== id).map((q, i) => ({ ...q, ordem: i })) })
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!form) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = form.perguntas.findIndex(p => p.id === active.id)
    const newIndex = form.perguntas.findIndex(p => p.id === over.id)
    const reordenadas = arrayMove(form.perguntas, oldIndex, newIndex).map((p, i) => ({ ...p, ordem: i }))
    setForm({ ...form, perguntas: reordenadas })
  }

  async function handleSalvar() {
    if (!usuario || !form) return
    setErro('')
    if (!form.nome.trim()) return setErro('Informe o nome da atividade.')
    if (form.cargos.length === 0) return setErro('Selecione ao menos um cargo.')
    if (form.perguntas.some(p => !p.pergunta.trim())) return setErro('Preencha o texto de todas as perguntas.')
    if (form.perguntas.some(p => p.tipo === 'multipla_escolha' && (p.opcoes ?? []).filter(o => o.trim()).length < 2)) {
      return setErro('Perguntas de múltipla escolha precisam de ao menos 2 opções.')
    }

    setSalvando(true)
    const payload = {
      filial: usuario.filial,
      nome: form.nome.trim(),
      cargos: form.cargos,
      unidade_producao: form.unidade_producao.trim() || null,
      meta_tempo_minutos: form.meta_tempo_minutos ? Number(form.meta_tempo_minutos) : null,
      perguntas: form.perguntas,
      ativo: form.ativo,
    }

    const resultado = form.id
      ? await supabase.from('armazem_atividades_tipo').update(payload).eq('id', form.id)
      : await supabase.from('armazem_atividades_tipo').insert(payload)

    setSalvando(false)
    if (resultado.error) return setErro(resultado.error.message)
    setForm(null)
    fetchAtividades()
  }

  async function alternarAtivo(a: ArmazemAtividadeTipo) {
    await supabase.from('armazem_atividades_tipo').update({ ativo: !a.ativo }).eq('id', a.id)
    fetchAtividades()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-700 flex items-center gap-2">
            <Boxes size={24} /> Cadastro de Atividades — Armazém
          </h1>
          <p className="text-sm text-gray-500 mt-1">Defina as atividades disponíveis para os operadores e o formulário de finalização de cada uma.</p>
        </div>
        <Button onClick={abrirNova}><Plus size={16} /> Nova atividade</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="animate-spin" /></div>
      ) : atividades.length === 0 ? (
        <div className="text-center py-20 text-gray-400">Nenhuma atividade cadastrada ainda.</div>
      ) : (
        <div className="grid gap-3">
          {atividades.map(a => (
            <div key={a.id} className={`border rounded-xl p-4 flex items-center justify-between ${a.ativo ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
              <div>
                <p className="font-semibold text-brand-700">{a.nome}</p>
                <p className="text-sm text-gray-500">
                  {a.cargos.join(', ')}
                  {a.unidade_producao ? ` · ${a.unidade_producao}` : ''}
                  {a.meta_tempo_minutos ? ` · meta ${a.meta_tempo_minutos} min` : ''}
                  {` · ${a.perguntas.length} pergunta(s)`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => alternarAtivo(a)}>{a.ativo ? 'Desativar' : 'Ativar'}</Button>
                <Button variant="outline" size="sm" onClick={() => abrirEdicao(a)}><Pencil size={14} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setForm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-brand-700">{form.id ? 'Editar atividade' : 'Nova atividade'}</h2>
              <button onClick={() => setForm(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Nome da atividade</label>
                <Input className="mt-1" placeholder="Ex: Ressuprimento de Picking" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Cargos que executam</label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {CARGOS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCargo(c)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors
                        ${form.cargos.includes(c) ? 'bg-accent-500 text-white border-accent-500' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Unidade de produção</label>
                  <Input className="mt-1" placeholder="Ex: pallets" value={form.unidade_producao} onChange={e => setForm({ ...form, unidade_producao: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Meta de tempo (minutos)</label>
                  <Input className="mt-1" type="number" min="0" placeholder="Ex: 30" value={form.meta_tempo_minutos} onChange={e => setForm({ ...form, meta_tempo_minutos: e.target.value })} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Perguntas do formulário de finalização</label>
                  <button type="button" onClick={addPergunta} className="text-sm text-brand-600 font-medium hover:underline flex items-center gap-1">
                    <Plus size={14} /> Adicionar pergunta
                  </button>
                </div>
                {form.perguntas.length === 0 ? (
                  <p className="text-sm text-gray-400 py-3">Nenhuma pergunta — o operador só registrará início e fim da atividade.</p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={form.perguntas.map(p => p.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {form.perguntas.map(p => (
                          <SortablePergunta key={p.id} pergunta={p} onChange={atualizarPergunta} onRemove={() => removerPergunta(p.id)} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>

              {erro && <p className="text-sm text-red-600">{erro}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
                <Button onClick={handleSalvar} disabled={salvando}>
                  {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
