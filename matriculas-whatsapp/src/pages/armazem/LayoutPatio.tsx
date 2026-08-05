import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload, MousePointer2, Square, PersonStanding, Undo2, Trash2, Save, Loader2,
  ZoomIn, ZoomOut, MapPin, X,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { formatarDataBR } from '../../lib/utils'
import {
  buscarLayoutPatio, salvarLayoutPatio, enviarImagemFundoPatio,
  PERFIL_LABEL, PERFIL_COR,
  type Forma, type FormaVaga, type FormaFaixa, type Ponto, type PerfilVaga,
} from '../../lib/armazemLayoutPatio'

type Modo = 'selecionar' | 'vaga' | 'faixa'

const PERFIS: PerfilVaga[] = ['toco', 'truck', 'destino', 'outro']

function novoId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function retangulo(pontos: [Ponto, Ponto]) {
  const [a, b] = pontos
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(a.x - b.x)
  const h = Math.abs(a.y - b.y)
  return { x, y, w, h }
}

export default function LayoutPatio() {
  const { usuario } = useAuth()
  const svgRef = useRef<SVGSVGElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [subindoImagem, setSubindoImagem] = useState(false)
  const [erro, setErro] = useState('')
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [atualizadoPor, setAtualizadoPor] = useState<string | null>(null)

  const [imagemUrl, setImagemUrl] = useState<string | null>(null)
  const [imgSize, setImgSize] = useState({ w: 1200, h: 800 })
  const [formas, setFormas] = useState<Forma[]>([])
  const [historico, setHistorico] = useState<Forma[][]>([])
  const [zoom, setZoom] = useState(1)

  const [modo, setModo] = useState<Modo>('selecionar')
  const [perfilAtual, setPerfilAtual] = useState<PerfilVaga>('toco')
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)

  const [arrastandoVaga, setArrastandoVaga] = useState<{ inicio: Ponto; atual: Ponto } | null>(null)
  const [faixaTemp, setFaixaTemp] = useState<Ponto[]>([])
  const [movendo, setMovendo] = useState<{ id: string; ultimo: Ponto } | null>(null)

  const [pendenteVaga, setPendenteVaga] = useState<[Ponto, Ponto] | null>(null)
  const [pendenteFaixa, setPendenteFaixa] = useState<Ponto[] | null>(null)
  const [rotuloModal, setRotuloModal] = useState('')
  const [perfilModal, setPerfilModal] = useState<PerfilVaga>('toco')

  const fetchLayout = useCallback(async () => {
    if (!usuario) return
    setCarregando(true)
    try {
      const layout = await buscarLayoutPatio(usuario.filial)
      setImagemUrl(layout.imagemUrl)
      setFormas(layout.desenho)
      setAtualizadoEm(layout.atualizadoEm)
      setAtualizadoPor(layout.atualizadoPor)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o layout.')
    } finally {
      setCarregando(false)
    }
  }, [usuario])

  useEffect(() => { fetchLayout() }, [fetchLayout])

  useEffect(() => {
    if (!imagemUrl) return
    const img = new Image()
    img.onload = () => setImgSize({ w: img.naturalWidth || 1200, h: img.naturalHeight || 800 })
    img.src = imagemUrl
  }, [imagemUrl])

  function empilharHistorico() {
    setHistorico(h => [...h.slice(-29), formas])
  }

  function desfazer() {
    setHistorico(h => {
      if (h.length === 0) return h
      const anterior = h[h.length - 1]
      setFormas(anterior)
      setSelecionadoId(null)
      return h.slice(0, -1)
    })
  }

  async function handleEscolherImagem(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSubindoImagem(true)
    setErro('')
    try {
      const url = await enviarImagemFundoPatio(file)
      setImagemUrl(url)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar a imagem.')
    } finally {
      setSubindoImagem(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSalvar() {
    if (!usuario) return
    setSalvando(true)
    setErro('')
    try {
      await salvarLayoutPatio(usuario.filial, { imagemUrl, desenho: formas }, usuario.nome ?? usuario.login)
      setAtualizadoEm(new Date().toISOString())
      setAtualizadoPor(usuario.nome ?? usuario.login)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar o layout.')
    } finally {
      setSalvando(false)
    }
  }

  function pontoDoEvento(e: React.MouseEvent): Ponto {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * imgSize.w
    const y = ((e.clientY - rect.top) / rect.height) * imgSize.h
    return { x, y }
  }

  function onSvgMouseDown(e: React.MouseEvent) {
    if (modo === 'vaga') {
      const p = pontoDoEvento(e)
      setArrastandoVaga({ inicio: p, atual: p })
    } else if (modo === 'selecionar') {
      setSelecionadoId(null)
    }
  }

  function onSvgMouseMove(e: React.MouseEvent) {
    if (arrastandoVaga) {
      setArrastandoVaga({ inicio: arrastandoVaga.inicio, atual: pontoDoEvento(e) })
    } else if (movendo) {
      const p = pontoDoEvento(e)
      const dx = p.x - movendo.ultimo.x
      const dy = p.y - movendo.ultimo.y
      setFormas(fs => fs.map(f => (f.id === movendo.id ? deslocarForma(f, dx, dy) : f)))
      setMovendo({ id: movendo.id, ultimo: p })
    }
  }

  function onSvgMouseUp() {
    if (arrastandoVaga) {
      const { w, h } = retangulo([arrastandoVaga.inicio, arrastandoVaga.atual])
      setArrastandoVaga(null)
      if (w < 8 || h < 8) return // clique acidental, ignora
      setPendenteVaga([arrastandoVaga.inicio, arrastandoVaga.atual])
      setPerfilModal(perfilAtual)
      setRotuloModal('')
    }
    if (movendo) {
      empilharHistorico()
      setMovendo(null)
    }
  }

  function onSvgClick(e: React.MouseEvent) {
    if (modo !== 'faixa') return
    const p = pontoDoEvento(e)
    setFaixaTemp(pts => [...pts, p])
  }

  function onSvgDoubleClick() {
    if (modo === 'faixa' && faixaTemp.length >= 2) {
      concluirFaixa()
    }
  }

  function concluirFaixa() {
    if (faixaTemp.length < 2) return
    setPendenteFaixa(faixaTemp)
    setFaixaTemp([])
    setRotuloModal(`Faixa ${formas.filter(f => f.tipo === 'faixa').length + 1}`)
  }

  function cancelarFaixa() {
    setFaixaTemp([])
  }

  function confirmarVagaPendente() {
    if (!pendenteVaga) return
    empilharHistorico()
    const nova: FormaVaga = {
      id: novoId(), tipo: 'vaga', perfil: perfilModal,
      label: rotuloModal.trim() || PERFIL_LABEL[perfilModal],
      cor: PERFIL_COR[perfilModal],
      pontos: pendenteVaga,
    }
    setFormas(fs => [...fs, nova])
    setPendenteVaga(null)
  }

  function confirmarFaixaPendente() {
    if (!pendenteFaixa) return
    empilharHistorico()
    const nova: FormaFaixa = { id: novoId(), tipo: 'faixa', label: rotuloModal.trim() || 'Faixa', pontos: pendenteFaixa }
    setFormas(fs => [...fs, nova])
    setPendenteFaixa(null)
  }

  function excluirSelecionado() {
    if (!selecionadoId) return
    empilharHistorico()
    setFormas(fs => fs.filter(f => f.id !== selecionadoId))
    setSelecionadoId(null)
  }

  function limparTudo() {
    if (!confirm('Apagar todas as vagas e faixas desenhadas? Essa ação não pode ser desfeita depois de salvar.')) return
    empilharHistorico()
    setFormas([])
    setSelecionadoId(null)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { cancelarFaixa(); setPendenteVaga(null); setPendenteFaixa(null) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selecionadoId && document.activeElement?.tagName !== 'INPUT') {
        excluirSelecionado()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionadoId])

  const contagem = useMemo(() => {
    const porPerfil: Record<string, number> = {}
    let faixas = 0
    for (const f of formas) {
      if (f.tipo === 'vaga') porPerfil[f.perfil] = (porPerfil[f.perfil] ?? 0) + 1
      else faixas++
    }
    return { porPerfil, faixas, total: formas.length }
  }, [formas])

  const selecionado = formas.find(f => f.id === selecionadoId) ?? null
  const previewRect = arrastandoVaga ? retangulo([arrastandoVaga.inicio, arrastandoVaga.atual]) : null

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-brand-700 flex items-center gap-2">
            <MapPin size={24} /> Layout de Pátio
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Desenhe as vagas e as faixas de pedestre em cima da foto do pátio. Dá pra ajustar quantas vezes precisar antes da marcação física.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {atualizadoEm && (
            <span className="text-xs text-gray-400">
              Salvo em {formatarDataBR(atualizadoEm)} por {atualizadoPor ?? '—'}
            </span>
          )}
          <Button onClick={handleSalvar} disabled={salvando || carregando}>
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar
          </Button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{erro}</div>}

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><Loader2 className="animate-spin" /></div>
      ) : !imagemUrl ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Upload className="mx-auto mb-3 text-gray-400" size={28} />
          <p className="text-sm text-gray-600 mb-3">Envie a foto de satélite ou a planta do pátio pra começar a desenhar.</p>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleEscolherImagem} />
          <Button onClick={() => fileInputRef.current?.click()} disabled={subindoImagem}>
            {subindoImagem ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Enviar imagem de fundo
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => { setModo('selecionar'); cancelarFaixa() }}
                  title="Selecionar / mover"
                  className={`p-2 rounded-md ${modo === 'selecionar' ? 'bg-white shadow text-brand-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <MousePointer2 size={16} />
                </button>
                <button
                  onClick={() => { setModo('vaga'); cancelarFaixa() }}
                  title="Desenhar vaga (clique e arraste)"
                  className={`p-2 rounded-md ${modo === 'vaga' ? 'bg-white shadow text-brand-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <Square size={16} />
                </button>
                <button
                  onClick={() => setModo('faixa')}
                  title="Desenhar faixa de pedestre (clique nos pontos, dois cliques pra terminar)"
                  className={`p-2 rounded-md ${modo === 'faixa' ? 'bg-white shadow text-brand-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <PersonStanding size={16} />
                </button>
              </div>

              {modo === 'vaga' && (
                <div className="flex items-center gap-1 text-xs">
                  {PERFIS.map(p => (
                    <button
                      key={p}
                      onClick={() => setPerfilAtual(p)}
                      className={`px-2 py-1 rounded border ${perfilAtual === p ? 'ring-2 ring-offset-1 ring-brand-500' : ''}`}
                      style={{ background: `${PERFIL_COR[p]}22`, borderColor: PERFIL_COR[p], color: PERFIL_COR[p] }}
                    >
                      {PERFIL_LABEL[p]}
                    </button>
                  ))}
                </div>
              )}

              {modo === 'faixa' && faixaTemp.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {faixaTemp.length} ponto(s) — dois cliques ou
                  <button onClick={concluirFaixa} disabled={faixaTemp.length < 2} className="text-brand-600 font-medium underline disabled:opacity-40">concluir</button>
                  <button onClick={cancelarFaixa} className="text-gray-400 underline">cancelar</button>
                </div>
              )}

              <div className="flex items-center gap-1">
                <button onClick={desfazer} disabled={historico.length === 0} title="Desfazer" className="p-2 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-30">
                  <Undo2 size={16} />
                </button>
                <button onClick={() => setZoom(z => Math.max(0.4, z - 0.2))} title="Diminuir zoom" className="p-2 rounded-md text-gray-500 hover:text-gray-700">
                  <ZoomOut size={16} />
                </button>
                <span className="text-xs text-gray-400 w-9 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(2.5, z + 0.2))} title="Aumentar zoom" className="p-2 rounded-md text-gray-500 hover:text-gray-700">
                  <ZoomIn size={16} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleEscolherImagem} />
                <button onClick={() => fileInputRef.current?.click()} title="Trocar imagem de fundo" className="p-2 rounded-md text-gray-500 hover:text-gray-700">
                  {subindoImagem ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                </button>
                <button onClick={limparTudo} title="Apagar tudo" className="p-2 rounded-md text-gray-400 hover:text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-auto border border-gray-200 rounded-lg bg-gray-50" style={{ maxHeight: '75vh' }}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
                width={imgSize.w * zoom}
                height={imgSize.h * zoom}
                style={{ display: 'block', cursor: modo === 'selecionar' ? 'default' : 'crosshair' }}
                onMouseDown={onSvgMouseDown}
                onMouseMove={onSvgMouseMove}
                onMouseUp={onSvgMouseUp}
                onMouseLeave={onSvgMouseUp}
                onClick={onSvgClick}
                onDoubleClick={onSvgDoubleClick}
              >
                <image href={imagemUrl} x={0} y={0} width={imgSize.w} height={imgSize.h} preserveAspectRatio="none" />

                {formas.map(f => (
                  <FormaSvg
                    key={f.id}
                    forma={f}
                    selecionado={f.id === selecionadoId}
                    interativo={modo === 'selecionar'}
                    onSelecionar={() => setSelecionadoId(f.id)}
                    onIniciarMover={(p) => setMovendo({ id: f.id, ultimo: p })}
                  />
                ))}

                {previewRect && (
                  <rect x={previewRect.x} y={previewRect.y} width={previewRect.w} height={previewRect.h}
                    fill={`${PERFIL_COR[perfilAtual]}33`} stroke={PERFIL_COR[perfilAtual]} strokeWidth={2} strokeDasharray="6 4" />
                )}
                {faixaTemp.length > 0 && (
                  <polyline points={faixaTemp.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#334155" strokeWidth={4} strokeDasharray="10 6" />
                )}
                {faixaTemp.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#334155" />)}
              </svg>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Vaga: clique e arraste um retângulo. Faixa de pedestre: clique em cada ponto do trajeto e dê dois cliques (ou use "concluir") pra fechar.
              No modo Selecionar, clique numa forma pra arrastar, e use Delete/Backspace pra remover a selecionada.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Resumo</h2>
              {PERFIS.map(p => (
                <div key={p} className="flex items-center justify-between text-sm py-1">
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm" style={{ background: PERFIL_COR[p] }} />
                    {PERFIL_LABEL[p]}
                  </span>
                  <span className="font-semibold tabular-nums">{contagem.porPerfil[p] ?? 0}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm py-1">
                <span className="flex items-center gap-2"><PersonStanding size={14} className="text-gray-500" /> Faixas de pedestre</span>
                <span className="font-semibold tabular-nums">{contagem.faixas}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-bold pt-2 mt-2 border-t border-dashed border-gray-200">
                <span>Total de elementos</span>
                <span className="tabular-nums">{contagem.total}</span>
              </div>
            </div>

            {selecionado && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Selecionado</h2>
                  <button onClick={() => setSelecionadoId(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
                <label className="text-xs text-gray-500">Rótulo</label>
                <Input
                  className="mt-1 mb-2"
                  value={selecionado.label}
                  onChange={e => {
                    const valor = e.target.value
                    setFormas(fs => fs.map(f => (f.id === selecionado.id ? { ...f, label: valor } : f)))
                  }}
                />
                {selecionado.tipo === 'vaga' && (
                  <>
                    <label className="text-xs text-gray-500">Perfil</label>
                    <select
                      className="w-full mt-1 mb-2 h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={selecionado.perfil}
                      onChange={e => {
                        const perfil = e.target.value as PerfilVaga
                        setFormas(fs => fs.map(f => (f.id === selecionado.id && f.tipo === 'vaga' ? { ...f, perfil, cor: PERFIL_COR[perfil] } : f)))
                      }}
                    >
                      {PERFIS.map(p => <option key={p} value={p}>{PERFIL_LABEL[p]}</option>)}
                    </select>
                  </>
                )}
                <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={excluirSelecionado}>
                  <Trash2 size={14} /> Excluir
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {(pendenteVaga || pendenteFaixa) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-brand-700 mb-4">{pendenteVaga ? 'Nova vaga' : 'Nova faixa de pedestre'}</h2>
            <div className="space-y-4">
              {pendenteVaga && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Perfil</label>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {PERFIS.map(p => (
                      <button
                        key={p}
                        onClick={() => setPerfilModal(p)}
                        className={`px-2 py-1 rounded border text-xs ${perfilModal === p ? 'ring-2 ring-offset-1 ring-brand-500' : ''}`}
                        style={{ background: `${PERFIL_COR[p]}22`, borderColor: PERFIL_COR[p], color: PERFIL_COR[p] }}
                      >
                        {PERFIL_LABEL[p]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">Rótulo</label>
                <Input
                  className="mt-1"
                  autoFocus
                  value={rotuloModal}
                  onChange={e => setRotuloModal(e.target.value)}
                  placeholder={pendenteVaga ? PERFIL_LABEL[perfilModal] : 'Faixa 1'}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setPendenteVaga(null); setPendenteFaixa(null) }}>Cancelar</Button>
                <Button onClick={pendenteVaga ? confirmarVagaPendente : confirmarFaixaPendente}>Adicionar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function deslocarForma(f: Forma, dx: number, dy: number): Forma {
  if (f.tipo === 'vaga') {
    return { ...f, pontos: [{ x: f.pontos[0].x + dx, y: f.pontos[0].y + dy }, { x: f.pontos[1].x + dx, y: f.pontos[1].y + dy }] }
  }
  return { ...f, pontos: f.pontos.map(p => ({ x: p.x + dx, y: p.y + dy })) }
}

function FormaSvg({
  forma, selecionado, interativo, onSelecionar, onIniciarMover,
}: {
  forma: Forma
  selecionado: boolean
  interativo: boolean
  onSelecionar: () => void
  onIniciarMover: (p: Ponto) => void
}) {
  function handleMouseDown(e: React.MouseEvent) {
    if (!interativo) return
    e.stopPropagation()
    onSelecionar()
    const svg = (e.target as SVGElement).ownerSVGElement
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const vb = svg.viewBox.baseVal
    const x = ((e.clientX - rect.left) / rect.width) * vb.width
    const y = ((e.clientY - rect.top) / rect.height) * vb.height
    onIniciarMover({ x, y })
  }

  if (forma.tipo === 'vaga') {
    const { x, y, w, h } = retangulo(forma.pontos)
    return (
      <g onMouseDown={handleMouseDown} style={{ cursor: interativo ? 'move' : 'default' }}>
        <rect x={x} y={y} width={w} height={h} rx={3} fill={`${forma.cor}33`} stroke={forma.cor} strokeWidth={selecionado ? 3 : 1.6} />
        {selecionado && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} fill="none" stroke="#111827" strokeDasharray="5 4" />}
        <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(13, h / 3)} fontWeight={700} fill={forma.cor}>
          {forma.label}
        </text>
      </g>
    )
  }

  const pontosStr = forma.pontos.map(p => `${p.x},${p.y}`).join(' ')
  const meio = forma.pontos[Math.floor(forma.pontos.length / 2)]
  return (
    <g onMouseDown={handleMouseDown} style={{ cursor: interativo ? 'move' : 'default' }}>
      <polyline points={pontosStr} fill="none" stroke="#1f2937" strokeWidth={7} strokeLinecap="round" />
      <polyline points={pontosStr} fill="none" stroke="#f8fafc" strokeWidth={7} strokeDasharray="12 10" strokeLinecap="butt" />
      {selecionado && <polyline points={pontosStr} fill="none" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" />}
      <text x={meio.x} y={meio.y - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1f2937"
        style={{ paintOrder: 'stroke' }} stroke="#fff" strokeWidth={3}>
        {forma.label}
      </text>
    </g>
  )
}
