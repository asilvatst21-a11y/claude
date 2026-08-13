import { useCallback, useEffect, useState } from 'react'
import { Route, Loader2, MapPin, Check, X, Pencil } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { formatarDataBR } from '../lib/utils'
import {
  listarPontosRisco, criarPontoRisco, atualizarPontoRisco, listarSugestoes, aprovarSugestao, rejeitarSugestao,
  buscarCidadesBairrosConhecidos, normalizarTexto,
  type PontoRisco, type SugestaoRisco, type Severidade, type TipoPonto, type CidadesBairrosConhecidos,
} from '../lib/rotasRisco'

const SEV_LABEL: Record<Severidade, string> = { baixo: 'Baixo', moderado: 'Moderado', alto: 'Alto' }
const SEV_CSS: Record<Severidade, string> = {
  baixo: 'bg-green-50 text-green-700 border-green-200',
  moderado: 'bg-amber-50 text-amber-700 border-amber-200',
  alto: 'bg-red-50 text-red-700 border-red-200',
}

// Autocomplete de cidade/bairro puxado dos últimos imports de Escala do dia
// — mesmo texto que vai bater no cruzamento automático, evita erro de
// digitação. Reaproveitado nos 3 formulários (novo ponto, editar, aprovar).
function CidadeBairroFields({
  cidade, bairro, onCidade, onBairro, conhecidos, idSufixo,
}: {
  cidade: string; bairro: string; onCidade: (v: string) => void; onBairro: (v: string) => void
  conhecidos: CidadesBairrosConhecidos; idSufixo: string
}) {
  // Normaliza (sem acento, maiúsculo) pra achar mesmo se o admin digitar
  // "Petrópolis" e o dado salvo (vindo da planilha) vier "PETROPOLIS" sem
  // acento. Enquanto a cidade digitada ainda não bate com nenhuma conhecida
  // (ex.: só começou a digitar), mostra todos os bairros já vistos — assim
  // sempre tem sugestão pra escolher, em vez de ficar vazio.
  const bairrosDaCidade = conhecidos.bairrosPorCidadeNorm.get(normalizarTexto(cidade))
  const opcoesBairro = bairrosDaCidade && bairrosDaCidade.length > 0 ? bairrosDaCidade : conhecidos.bairrosTodos
  const idCidades = `rr-cidades-${idSufixo}`
  const idBairros = `rr-bairros-${idSufixo}`
  return (
    <>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Cidade</label>
        <input list={idCidades} value={cidade} onChange={(e) => onCidade(e.target.value)} placeholder="Ex.: Petrópolis" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" autoComplete="off" />
        <datalist id={idCidades}>{conhecidos.cidades.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Bairro <span className="font-normal">(opcional — sem isso, vale a cidade inteira)</span></label>
        <input list={idBairros} value={bairro} onChange={(e) => onBairro(e.target.value)} placeholder="Ex.: Itaipava" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" autoComplete="off" />
        <datalist id={idBairros}>{opcoesBairro.map((b) => <option key={b} value={b} />)}</datalist>
      </div>
    </>
  )
}

function AprovarModal({ sugestao, conhecidos, onClose, onAprovado }: {
  sugestao: SugestaoRisco; conhecidos: CidadesBairrosConhecidos
  onClose: () => void; onAprovado: () => void
}) {
  const { usuario } = useAuth()
  const [titulo, setTitulo] = useState(sugestao.relato_texto?.slice(0, 80) ?? '')
  const [tipo, setTipo] = useState<TipoPonto>('ponto')
  const [severidade, setSeveridade] = useState<Severidade>('moderado')
  const [rodovia, setRodovia] = useState('')
  const [velocidade, setVelocidade] = useState('')
  const [rota, setRota] = useState('')
  const [pdvReferencia, setPdvReferencia] = useState('')
  const [cidade, setCidade] = useState('')
  const [bairro, setBairro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    if (!usuario?.filial || !titulo.trim()) { setErro('Preencha o título.'); return }
    setSalvando(true)
    setErro('')
    const { error } = await aprovarSugestao(sugestao.id, {
      filial: usuario.filial, titulo: titulo.trim(), tipo, severidade,
      rodovia: rodovia.trim() || null, velocidade_segura: velocidade.trim() || null, rota: rota.trim() || null,
      pdv_referencia: pdvReferencia.trim() || null, cidade: cidade.trim() || null, bairro: bairro.trim() || null,
      latitude: sugestao.latitude, longitude: sugestao.longitude, maps_url: null,
    }, usuario.nome ?? usuario.login)
    setSalvando(false)
    if (error) { setErro(`Erro: ${error}`); return }
    onAprovado()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Aprovar ponto de risco</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Relato de {sugestao.nome_motorista ?? `matrícula ${sugestao.matricula}`}: "{sugestao.relato_texto}"
          {sugestao.latitude != null && <span className="block mt-1 text-brand-600">📍 Localização enviada ({sugestao.latitude.toFixed(4)}, {sugestao.longitude?.toFixed(4)})</span>}
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPonto)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                <option value="ponto">Ponto</option>
                <option value="trecho">Trecho</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Severidade</label>
              <select value={severidade} onChange={(e) => setSeveridade(e.target.value as Severidade)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                <option value="baixo">Baixo</option>
                <option value="moderado">Moderado</option>
                <option value="alto">Alto</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Rodovia</label>
              <input value={rodovia} onChange={(e) => setRodovia(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Velocidade segura</label>
              <input value={velocidade} onChange={(e) => setVelocidade(e.target.value)} placeholder="Ex.: 60 km/h" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Rota</label>
              <input value={rota} onChange={(e) => setRota(e.target.value)} placeholder="Ex.: Cascavel → Toledo" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <CidadeBairroFields cidade={cidade} bairro={bairro} onCidade={setCidade} onBairro={setBairro} conhecidos={conhecidos} idSufixo="aprovar" />
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">PDV de referência <span className="font-normal">(opcional — alternativa à cidade/bairro)</span></label>
              <input value={pdvReferencia} onChange={(e) => setPdvReferencia(e.target.value)} placeholder="Código do PDV mais próximo" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Cidade (e opcionalmente bairro) é o que liga esse ponto ao aviso automático e à consulta pela Aurora, cruzando com a rota do mapa do dia. Sem nenhum dos dois (nem PDV), o ponto fica só cadastrado, sem cruzamento automático.</p>
        </div>
        {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border">Cancelar</button>
          <button onClick={confirmar} disabled={salvando} className="px-3 py-1.5 text-sm rounded-lg bg-primary text-white disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Aprovar e criar ponto'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RejeitarModal({ sugestao, onClose, onRejeitado }: { sugestao: SugestaoRisco; onClose: () => void; onRejeitado: () => void }) {
  const { usuario } = useAuth()
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function confirmar() {
    if (!usuario) return
    setSalvando(true)
    await rejeitarSugestao(sugestao.id, motivo.trim() || 'Sem motivo informado', usuario.nome ?? usuario.login)
    setSalvando(false)
    onRejeitado()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Rejeitar sugestão</h3>
        <label className="text-xs font-medium text-muted-foreground">Motivo (curto)</label>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: já sinalizado, fora da rota" className="w-full border rounded-lg px-3 py-2 text-sm mt-1 mb-4" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border">Cancelar</button>
          <button onClick={confirmar} disabled={salvando} className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Rejeitar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditarPontoModal({ ponto, conhecidos, onClose, onSalvo }: {
  ponto: PontoRisco; conhecidos: CidadesBairrosConhecidos
  onClose: () => void; onSalvo: () => void
}) {
  const [titulo, setTitulo] = useState(ponto.titulo)
  const [tipo, setTipo] = useState<TipoPonto>(ponto.tipo)
  const [severidade, setSeveridade] = useState<Severidade>(ponto.severidade)
  const [rodovia, setRodovia] = useState(ponto.rodovia ?? '')
  const [velocidade, setVelocidade] = useState(ponto.velocidade_segura ?? '')
  const [rota, setRota] = useState(ponto.rota ?? '')
  const [pdvReferencia, setPdvReferencia] = useState(ponto.pdv_referencia ?? '')
  const [cidade, setCidade] = useState(ponto.cidade ?? '')
  const [bairro, setBairro] = useState(ponto.bairro ?? '')
  const [latitude, setLatitude] = useState(ponto.latitude != null ? String(ponto.latitude) : '')
  const [longitude, setLongitude] = useState(ponto.longitude != null ? String(ponto.longitude) : '')
  const [mapsUrl, setMapsUrl] = useState(ponto.maps_url ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    if (!titulo.trim()) { setErro('Preencha o título.'); return }
    const lat = latitude.trim() ? Number(latitude.trim().replace(',', '.')) : null
    const lng = longitude.trim() ? Number(longitude.trim().replace(',', '.')) : null
    if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
      setErro('Latitude/longitude inválidas — use só números.')
      return
    }
    setSalvando(true)
    setErro('')
    const { error } = await atualizarPontoRisco(ponto.id, {
      titulo: titulo.trim(), tipo, severidade,
      rodovia: rodovia.trim() || null, velocidade_segura: velocidade.trim() || null,
      rota: rota.trim() || null, pdv_referencia: pdvReferencia.trim() || null,
      cidade: cidade.trim() || null, bairro: bairro.trim() || null,
      latitude: lat, longitude: lng,
      maps_url: mapsUrl.trim() || (lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null),
    })
    setSalvando(false)
    if (error) { setErro(`Erro: ${error}`); return }
    onSalvo()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Editar ponto de risco</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPonto)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                <option value="ponto">Ponto</option>
                <option value="trecho">Trecho</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Severidade</label>
              <select value={severidade} onChange={(e) => setSeveridade(e.target.value as Severidade)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                <option value="baixo">Baixo</option>
                <option value="moderado">Moderado</option>
                <option value="alto">Alto</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Rodovia</label>
              <input value={rodovia} onChange={(e) => setRodovia(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Velocidade segura</label>
              <input value={velocidade} onChange={(e) => setVelocidade(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Rota</label>
              <input value={rota} onChange={(e) => setRota(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <CidadeBairroFields cidade={cidade} bairro={bairro} onCidade={setCidade} onBairro={setBairro} conhecidos={conhecidos} idSufixo="editar" />
            <div>
              <label className="text-xs font-medium text-muted-foreground">PDV de referência <span className="font-normal">(opcional)</span></label>
              <input value={pdvReferencia} onChange={(e) => setPdvReferencia(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Latitude</label>
              <input value={latitude} onChange={(e) => setLatitude(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Longitude</label>
              <input value={longitude} onChange={(e) => setLongitude(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Link do Google Maps</label>
              <input value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
          </div>
        </div>
        {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border">Cancelar</button>
          <button onClick={confirmar} disabled={salvando} className="px-3 py-1.5 text-sm rounded-lg bg-primary text-white disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SegurancaRotasRisco() {
  const { usuario } = useAuth()
  const [pontos, setPontos] = useState<PontoRisco[]>([])
  const [sugestoes, setSugestoes] = useState<SugestaoRisco[]>([])
  const [carregando, setCarregando] = useState(true)
  const [aprovarAlvo, setAprovarAlvo] = useState<SugestaoRisco | null>(null)
  const [rejeitarAlvo, setRejeitarAlvo] = useState<SugestaoRisco | null>(null)
  const [editarAlvo, setEditarAlvo] = useState<PontoRisco | null>(null)

  const [form, setForm] = useState({
    titulo: '', tipo: 'ponto' as TipoPonto, severidade: 'baixo' as Severidade,
    rodovia: '', velocidade: '', rota: '', pdvReferencia: '', cidade: '', bairro: '', mapsUrl: '', latitude: '', longitude: '',
  })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')
  const [conhecidos, setConhecidos] = useState<CidadesBairrosConhecidos>({ cidades: [], bairrosTodos: [], bairrosPorCidadeNorm: new Map() })

  const carregar = useCallback(async () => {
    if (!usuario?.filial) return
    setCarregando(true)
    const [p, s, c] = await Promise.all([
      listarPontosRisco(usuario.filial), listarSugestoes(usuario.filial, 'pendente'), buscarCidadesBairrosConhecidos(usuario.filial),
    ])
    setPontos(p)
    setSugestoes(s)
    setConhecidos(c)
    setCarregando(false)
  }, [usuario?.filial])

  useEffect(() => { carregar() }, [carregar])

  async function salvarPonto() {
    if (!usuario?.filial || !form.titulo.trim()) { setMsg('Preencha pelo menos o título.'); return }
    const lat = form.latitude.trim() ? Number(form.latitude.trim().replace(',', '.')) : null
    const lng = form.longitude.trim() ? Number(form.longitude.trim().replace(',', '.')) : null
    if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
      setMsg('Latitude/longitude inválidas — use só números (ex.: -24.9578).')
      return
    }
    if ((lat != null) !== (lng != null)) { setMsg('Preencha latitude e longitude juntas, ou deixe as duas em branco.'); return }
    const mapsUrl = form.mapsUrl.trim() || (lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null)
    setSalvando(true)
    setMsg('')
    const { error } = await criarPontoRisco({
      filial: usuario.filial, titulo: form.titulo.trim(), tipo: form.tipo, severidade: form.severidade,
      rodovia: form.rodovia.trim() || null, velocidade_segura: form.velocidade.trim() || null,
      rota: form.rota.trim() || null, pdv_referencia: form.pdvReferencia.trim() || null,
      cidade: form.cidade.trim() || null, bairro: form.bairro.trim() || null,
      latitude: lat, longitude: lng, maps_url: mapsUrl,
    })
    setSalvando(false)
    if (error) { setMsg(`Erro ao criar: ${error}`); return }
    setForm({ titulo: '', tipo: 'ponto', severidade: 'baixo', rodovia: '', velocidade: '', rota: '', pdvReferencia: '', cidade: '', bairro: '', mapsUrl: '', latitude: '', longitude: '' })
    setMsg('✅ Ponto de risco criado.')
    carregar()
  }

  const altoCount = pontos.filter((p) => p.severidade === 'alto').length

  if (!usuario) return null

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Route className="h-6 w-6 text-primary" /> Rotas de Risco
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pontos de risco por cidade/bairro (ou PDV) — aviso automático ao motorista ao importar Escala do dia ou o BEES, e consulta pela Aurora. Motoristas também sugerem pontos direto pelo WhatsApp.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-xs text-muted-foreground font-semibold uppercase">Pontos cadastrados</div>
          <div className="text-2xl font-bold mt-1">{pontos.length}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-xs text-muted-foreground font-semibold uppercase">Risco alto</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{altoCount}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4 border-amber-200">
          <div className="text-xs text-muted-foreground font-semibold uppercase">Pendentes de validação</div>
          <div className="text-2xl font-bold mt-1 text-amber-600">{sugestoes.length}</div>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-xs text-muted-foreground font-semibold uppercase">Com cidade/bairro ou PDV</div>
          <div className="text-2xl font-bold mt-1">{pontos.filter((p) => p.cidade || p.pdv_referencia).length}</div>
        </div>
      </div>

      {/* Fila de validação */}
      {sugestoes.length > 0 && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold text-sm">Fila de validação ({sugestoes.length})</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Sugestões de motoristas via Aurora, aguardando confirmação.</p>
          </div>
          <div className="divide-y">
            {sugestoes.map((s) => (
              <div key={s.id} className="p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{s.nome_motorista ?? `Matrícula ${s.matricula ?? '—'}`}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.via_audio ? '🎙️ Áudio transcrito' : '✍️ Texto'} · {formatarDataBR(s.created_at)}
                    {s.latitude != null && <span className="ml-2 text-brand-600 inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> localização enviada</span>}
                  </div>
                  <div className="text-sm mt-1.5">"{s.relato_texto}"</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setAprovarAlvo(s)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white"><Check className="h-3.5 w-3.5" /> Aprovar</button>
                  <button onClick={() => setRejeitarAlvo(s)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600"><X className="h-3.5 w-3.5" /> Rejeitar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Novo ponto */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Novo ponto de risco</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Com PDV de referência, entra automaticamente no aviso ao motorista e na consulta via Aurora.</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Título</label>
              <input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} placeholder="Ex.: Curva acentuada BR-277" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoPonto }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                <option value="ponto">Ponto</option>
                <option value="trecho">Trecho</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Severidade</label>
              <select value={form.severidade} onChange={(e) => setForm((f) => ({ ...f, severidade: e.target.value as Severidade }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                <option value="baixo">Baixo</option>
                <option value="moderado">Moderado</option>
                <option value="alto">Alto</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Rodovia</label>
              <input value={form.rodovia} onChange={(e) => setForm((f) => ({ ...f, rodovia: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Velocidade segura</label>
              <input value={form.velocidade} onChange={(e) => setForm((f) => ({ ...f, velocidade: e.target.value }))} placeholder="Ex.: 60 km/h" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Rota</label>
              <input value={form.rota} onChange={(e) => setForm((f) => ({ ...f, rota: e.target.value }))} placeholder="Ex.: Cascavel → Toledo" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <CidadeBairroFields
              cidade={form.cidade} bairro={form.bairro}
              onCidade={(v) => setForm((f) => ({ ...f, cidade: v }))} onBairro={(v) => setForm((f) => ({ ...f, bairro: v }))}
              conhecidos={conhecidos} idSufixo="novo"
            />
            <div>
              <label className="text-xs font-medium text-muted-foreground">PDV de referência <span className="font-normal">(opcional — alternativa à cidade/bairro)</span></label>
              <input value={form.pdvReferencia} onChange={(e) => setForm((f) => ({ ...f, pdvReferencia: e.target.value }))} placeholder="Código do PDV mais próximo" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Latitude</label>
              <input value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} placeholder="Ex.: -24.9578" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Longitude</label>
              <input value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} placeholder="Ex.: -53.4595" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Link do Google Maps <span className="text-muted-foreground font-normal">(opcional — sem isso, gero um a partir da latitude/longitude)</span></label>
              <input value={form.mapsUrl} onChange={(e) => setForm((f) => ({ ...f, mapsUrl: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" />
            </div>
          </div>
          {msg && <p className="text-sm">{msg}</p>}
          <div className="flex justify-end">
            <button onClick={salvarPonto} disabled={salvando} className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-white disabled:opacity-50">
              {salvando ? 'Salvando…' : 'Salvar ponto de risco'}
            </button>
          </div>
        </div>
      </div>

      {/* Lista de pontos */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Pontos de risco cadastrados ({pontos.length})</h2>
        </div>
        <div className="p-5">
          {carregando ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : pontos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum ponto cadastrado ainda.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pontos.map((p) => (
                <div key={p.id} className={`border rounded-xl p-3 ${p.severidade === 'alto' ? 'bg-red-50 border-red-200' : 'bg-slate-50'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${SEV_CSS[p.severidade]}`}>{SEV_LABEL[p.severidade]}</span>
                    <button onClick={() => setEditarAlvo(p)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary shrink-0">
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  </div>
                  {p.origem === 'motorista' && <span className="mt-1 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">sugerido por motorista</span>}
                  <div className="font-semibold text-sm mt-1.5">{p.titulo}</div>
                  <div className="grid grid-cols-2 gap-1.5 mt-2 text-xs">
                    <div><span className="text-muted-foreground">Tipo: </span><b>{p.tipo === 'ponto' ? 'Ponto' : 'Trecho'}</b></div>
                    <div><span className="text-muted-foreground">Rodovia: </span><b>{p.rodovia ?? '—'}</b></div>
                    <div><span className="text-muted-foreground">Vel. segura: </span><b>{p.velocidade_segura ?? '—'}</b></div>
                    <div><span className="text-muted-foreground">Cidade/bairro: </span><b>{p.cidade ? `${p.cidade}${p.bairro ? ` · ${p.bairro}` : ''}` : '—'}</b></div>
                    <div><span className="text-muted-foreground">PDV ref.: </span><b>{p.pdv_referencia ?? '—'}</b></div>
                  </div>
                  {p.maps_url && <a href={p.maps_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary mt-2 inline-block">Abrir no Maps →</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {aprovarAlvo && <AprovarModal sugestao={aprovarAlvo} conhecidos={conhecidos} onClose={() => setAprovarAlvo(null)} onAprovado={() => { setAprovarAlvo(null); carregar() }} />}
      {rejeitarAlvo && <RejeitarModal sugestao={rejeitarAlvo} onClose={() => setRejeitarAlvo(null)} onRejeitado={() => { setRejeitarAlvo(null); carregar() }} />}
      {editarAlvo && <EditarPontoModal ponto={editarAlvo} conhecidos={conhecidos} onClose={() => setEditarAlvo(null)} onSalvo={() => { setEditarAlvo(null); carregar() }} />}
    </div>
  )
}
