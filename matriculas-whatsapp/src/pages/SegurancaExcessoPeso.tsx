import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Upload, FileSpreadsheet, Loader2, RefreshCw, Link2, ChevronDown,
  CheckCircle, AlertTriangle, Clock, Camera, Scale,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { parsePesoPlacaBuffer, parsePlacasFreightechBuffer } from '../lib/tmlParser'
import {
  buscarPesoCadastrado, buscarEscalaComPesoHoje, calcularExcessoPeso, veioDoFreightech,
  type PesoCadastradoPlaca, type LinhaExcessoPeso, type SituacaoExcesso,
} from '../lib/pesoExcesso'
import { formatarDataBR } from '../lib/utils'

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatarKg(valor: number | null): string {
  if (valor == null) return '—'
  return `${valor.toLocaleString('pt-BR')} kg`
}

function ExcessoBadge({ situacao }: { situacao: SituacaoExcesso }) {
  if (situacao === 'dentro_limite') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">
        <CheckCircle className="h-3 w-3" /> Dentro do limite
      </span>
    )
  }
  if (situacao === 'excesso') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-red-700 bg-red-100">
        <AlertTriangle className="h-3 w-3" /> Excesso de peso
      </span>
    )
  }
  if (situacao === 'sem_referencia') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-yellow-700 bg-yellow-100">
        <Clock className="h-3 w-3" /> Sem referência de peso
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-700 bg-gray-100">
      <Clock className="h-3 w-3" /> Sem peso carregado
    </span>
  )
}

function ImportBox({
  titulo, descricao, onFile, isUploading, statusLine,
}: {
  titulo: string
  descricao: string
  onFile: (file: File) => void
  isUploading: boolean
  statusLine: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="border rounded-lg bg-white p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">{descricao}</p>
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-accent-500 hover:bg-accent/30 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-accent-500" />
        ) : (
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">
          {isUploading ? 'Processando...' : 'Clique para importar'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls ou .csv</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            if (inputRef.current) inputRef.current.value = ''
          }}
        />
      </div>
      {statusLine && <p className="text-xs text-muted-foreground mt-2">{statusLine}</p>}
    </div>
  )
}

export default function SegurancaExcessoPeso() {
  const { usuario } = useAuth()
  const [pesos, setPesos] = useState<PesoCadastradoPlaca[]>([])
  const [loadingPesos, setLoadingPesos] = useState(true)
  const [excessoHoje, setExcessoHoje] = useState<LinhaExcessoPeso[]>([])
  const [loadingExcesso, setLoadingExcesso] = useState(true)
  const [escalaSync, setEscalaSync] = useState<{ total: number; ultimoImport: string | null } | null>(null)

  const [uploadingFreightech, setUploadingFreightech] = useState(false)
  const [uploadingFrotaLegal, setUploadingFrotaLegal] = useState(false)
  const [erro, setErro] = useState('')

  const [taraAberto, setTaraAberto] = useState(true)
  const [confrontoAberto, setConfrontoAberto] = useState(true)
  const [cadastroAberto, setCadastroAberto] = useState(true)
  const [excessoAberto, setExcessoAberto] = useState(true)
  const [filtroExcesso, setFiltroExcesso] = useState<SituacaoExcesso | 'todos'>('todos')

  const [placaFotoAtiva, setPlacaFotoAtiva] = useState<string | null>(null)
  const [enviandoFoto, setEnviandoFoto] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const fetchPesos = useCallback(async () => {
    if (!usuario) return
    setLoadingPesos(true)
    const lista = await buscarPesoCadastrado(usuario.filial)
    setPesos(lista)
    setLoadingPesos(false)
    return lista
  }, [usuario])

  // Não depende do estado `pesos` (evita recriar a função a cada fetch, o
  // que disparava o useEffect de novo em loop) — se a lista não vier
  // explícita, busca direto do banco.
  const fetchExcessoHoje = useCallback(async (pesosAtualizados?: PesoCadastradoPlaca[]) => {
    if (!usuario) return
    setLoadingExcesso(true)
    const base = pesosAtualizados ?? await buscarPesoCadastrado(usuario.filial)
    const escalas = await buscarEscalaComPesoHoje(usuario.filial, hojeISO())
    setExcessoHoje(calcularExcessoPeso(escalas, base))
    setLoadingExcesso(false)
  }, [usuario])

  const fetchEscalaSync = useCallback(async () => {
    if (!usuario) return
    const { data } = await supabase
      .from('escalas_tml')
      .select('mapa, importado_em')
      .eq('filial', usuario.filial)
      .eq('data_entrega', hojeISO())
    const total = data?.length ?? 0
    const ultimoImport = (data ?? [])
      .map((d) => d.importado_em as string)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
    setEscalaSync({ total, ultimoImport })
  }, [usuario])

  const atualizarTudo = useCallback(async () => {
    const lista = await fetchPesos()
    await fetchExcessoHoje(lista ?? undefined)
    await fetchEscalaSync()
  }, [fetchPesos, fetchExcessoHoje, fetchEscalaSync])

  useEffect(() => { atualizarTudo() }, [atualizarTudo])

  async function handleImportarFreightech(file: File) {
    if (!usuario) return
    setUploadingFreightech(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const placas = parsePlacasFreightechBuffer(buffer)
      if (placas.length === 0) {
        throw new Error('Nenhuma placa encontrada na planilha. Confira se é o export do Freightech (coluna PLACA).')
      }

      const agora = new Date().toISOString()
      const rows = placas.map((placa) => ({ filial: usuario.filial, placa, importado_freightech_em: agora }))

      const { error } = await supabase.from('peso_cadastrado_placas').upsert(rows, { onConflict: 'filial,placa' })
      if (error) throw new Error(error.message)

      alert(`${placas.length} placa(s) importada(s) do Freightech.`)
      const lista = await fetchPesos()
      await fetchExcessoHoje(lista ?? undefined)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar planilha do Freightech')
    } finally {
      setUploadingFreightech(false)
    }
  }

  async function handleImportarPeso(file: File) {
    if (!usuario) return
    setUploadingFrotaLegal(true)
    setErro('')
    try {
      const buffer = await file.arrayBuffer()
      const linhas = parsePesoPlacaBuffer(buffer)
      if (linhas.length === 0) {
        throw new Error('Nenhuma placa/Tara/Lotação encontrada na planilha. Confira se é o export "Equipamentos" do Frota Legal.')
      }

      const porPlaca = new Map(linhas.map((l) => [l.placa, l]))
      const agora = new Date().toISOString()
      const rows = [...porPlaca.values()].map((l) => ({
        filial: usuario.filial,
        placa: l.placa,
        peso_tara: l.pesoTara,
        peso_lotacao: l.pesoLotacao,
        importado_em: agora,
      }))

      const { error } = await supabase.from('peso_cadastrado_placas').upsert(rows, { onConflict: 'filial,placa' })
      if (error) throw new Error(error.message)

      alert(`${linhas.length} placa(s) importada(s) do Frota Legal.`)
      const lista = await fetchPesos()
      await fetchExcessoHoje(lista ?? undefined)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar planilha de peso')
    } finally {
      setUploadingFrotaLegal(false)
    }
  }

  function abrirCaptura(placa: string, modo: 'camera' | 'upload') {
    setPlacaFotoAtiva(placa)
    if (modo === 'camera') cameraInputRef.current?.click()
    else uploadInputRef.current?.click()
  }

  async function onFotoSelecionada(file: File) {
    if (!usuario || !placaFotoAtiva) return
    setEnviandoFoto(placaFotoAtiva)
    setErro('')
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${usuario.filial}/${placaFotoAtiva}-${Date.now()}.${ext}`
      const { data: upload, error: uploadErr } = await supabase.storage
        .from('fotos-tara')
        .upload(path, file, { upsert: true })
      if (uploadErr || !upload) throw new Error(uploadErr?.message ?? 'Falha no upload da foto')

      const { data: urlData } = supabase.storage.from('fotos-tara').getPublicUrl(upload.path)

      const { error: updateErr } = await supabase
        .from('peso_cadastrado_placas')
        .update({ foto_tara_url: urlData.publicUrl, foto_tara_em: new Date().toISOString() })
        .eq('filial', usuario.filial)
        .eq('placa', placaFotoAtiva)
      if (updateErr) throw new Error(updateErr.message)

      await fetchPesos()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar foto da TARA')
    } finally {
      setEnviandoFoto(null)
      setPlacaFotoAtiva(null)
    }
  }

  const placasFreightech = useMemo(() => pesos.filter(veioDoFreightech), [pesos])
  const faltandoNoFrotaLegal = useMemo(
    () => placasFreightech.filter((p) => p.peso_lotacao == null),
    [placasFreightech],
  )

  const stats = useMemo(() => ({
    placasFreightech: placasFreightech.length,
    faltandoFrotaLegal: faltandoNoFrotaLegal.length,
    fotosPendentes: pesos.filter((p) => !p.foto_tara_url).length,
    excessosHoje: excessoHoje.filter((l) => l.situacao === 'excesso').length,
  }), [pesos, placasFreightech, faltandoNoFrotaLegal, excessoHoje])

  const excessoStats = useMemo(() => ({
    todos: excessoHoje.length,
    dentro_limite: excessoHoje.filter((l) => l.situacao === 'dentro_limite').length,
    excesso: excessoHoje.filter((l) => l.situacao === 'excesso').length,
    sem_referencia: excessoHoje.filter((l) => l.situacao === 'sem_referencia').length,
    sem_peso_carregado: excessoHoje.filter((l) => l.situacao === 'sem_peso_carregado').length,
  }), [excessoHoje])

  const excessoFiltrado = useMemo(
    () => filtroExcesso === 'todos' ? excessoHoje : excessoHoje.filter((l) => l.situacao === filtroExcesso),
    [excessoHoje, filtroExcesso],
  )

  return (
    <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 max-w-6xl mx-auto">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFotoSelecionada(file)
          if (cameraInputRef.current) cameraInputRef.current.value = ''
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFotoSelecionada(file)
          if (uploadInputRef.current) uploadInputRef.current.value = ''
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Segurança</p>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Scale className="h-5 w-5 text-accent-600" /> Excesso de Peso
          </h1>
          <p className="text-sm text-muted-foreground">
            Freightech é a base inicial de placas da filial (filtra placas REC e de outras unidades
            que aparecem na escala). Frota Legal cadastra Tara e Lotação. O peso carregado já vem
            de{' '}
            <Link to="/distribuicao/tml" className="text-accent-600 underline">Distribuição → Carta de Controle TML</Link>.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={atualizarTudo} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <ImportBox
          titulo="1. Freightech"
          descricao="Base inicial de placas da filial (só placa, sem peso) — planilha mensal."
          onFile={handleImportarFreightech}
          isUploading={uploadingFreightech}
          statusLine={`${stats.placasFreightech} placa(s) cadastrada(s)`}
        />
        <ImportBox
          titulo="2. Frota Legal (Equipamentos)"
          descricao="Placa (Identificador) + Peso Tara + Peso Lotação — planilha mensal."
          onFile={handleImportarPeso}
          isUploading={uploadingFrotaLegal}
          statusLine={`${pesos.filter((p) => p.peso_lotacao != null).length} placa(s) com peso`}
        />
        <div className="border rounded-lg bg-white p-4">
          <h3 className="text-sm font-semibold">3. Escala do dia (03.11.49.02)</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">Peso carregado por mapa/placa — vem de outra tela.</p>
          <div className="border rounded-lg bg-muted/40 p-6 text-center">
            <Link2 className="h-6 w-6 mx-auto mb-2 text-accent-600" />
            <p className="text-sm font-medium">Sincronizado automaticamente</p>
            <p className="text-xs text-muted-foreground mt-1">
              Já importado em Distribuição → Carta de Controle TML — nada a subir aqui.
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {escalaSync ? `${escalaSync.total} mapa(s) hoje` : 'carregando...'}
            {escalaSync?.ultimoImport && ` · atualizado às ${new Date(escalaSync.ultimoImport).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Placas Freightech</p>
          <p className="text-2xl font-bold">{stats.placasFreightech}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Faltando no Frota Legal</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.faltandoFrotaLegal}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Foto da TARA pendente</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.fotosPendentes}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Excesso de peso — hoje</p>
          <p className="text-2xl font-bold text-red-600">{stats.excessosHoje}</p>
        </div>
      </div>

      {/* ── Confronto de placas Freightech x Frota Legal ─────────── */}
      <div className="border rounded-lg bg-white">
        <button
          onClick={() => setConfrontoAberto((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b text-left hover:bg-muted/20 transition-colors"
        >
          <div>
            <h2 className="font-semibold text-sm">Confronto de Placas — Freightech × Frota Legal</h2>
            <p className="text-xs text-muted-foreground">Placas do Freightech que ainda não têm peso cadastrado no Frota Legal</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${confrontoAberto ? 'rotate-180' : ''}`} />
        </button>
        {confrontoAberto && (
          loadingPesos ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
            </div>
          ) : placasFreightech.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhuma placa do Freightech importada ainda.
            </div>
          ) : faltandoNoFrotaLegal.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm flex flex-col items-center gap-1.5">
              <CheckCircle className="h-6 w-6 text-green-600" />
              Todas as {placasFreightech.length} placas do Freightech já têm peso no Frota Legal.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Placa</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {faltandoNoFrotaLegal.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-mono text-xs font-semibold">{p.placa}</td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-yellow-700 bg-yellow-100">
                          <AlertTriangle className="h-3 w-3" /> Falta cadastro no Frota Legal
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Foto da TARA ─────────────────────────────────────────── */}
      <div className="border rounded-lg bg-white">
        <button
          onClick={() => setTaraAberto((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b text-left hover:bg-muted/20 transition-colors"
        >
          <div>
            <h2 className="font-semibold text-sm">Foto da TARA por placa</h2>
            <p className="text-xs text-muted-foreground">Toda placa cadastrada precisa de uma foto da plaqueta de TARA</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${taraAberto ? 'rotate-180' : ''}`} />
        </button>
        {taraAberto && (
          loadingPesos ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
            </div>
          ) : pesos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhuma placa cadastrada ainda. Importe a planilha do Frota Legal.
            </div>
          ) : (
            <div className="grid gap-3 p-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
              {pesos.map((p) => (
                <div key={p.id} className="border rounded-lg overflow-hidden bg-white">
                  {p.foto_tara_url ? (
                    <img src={p.foto_tara_url} alt={`TARA ${p.placa}`} className="w-full aspect-[4/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[4/3] bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                      Sem foto ainda
                    </div>
                  )}
                  <div className="p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold bg-muted/50 border rounded px-1.5 py-0.5">{p.placa}</span>
                      {p.foto_tara_url ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-green-700 bg-green-100">Enviada</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-yellow-700 bg-yellow-100">Pendente</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Tara: {formatarKg(p.peso_tara)} · Lotação: {formatarKg(p.peso_lotacao)}
                    </p>
                    {!p.foto_tara_url && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => abrirCaptura(p.placa, 'camera')}
                          disabled={enviandoFoto === p.placa}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-[11px] transition-colors"
                        >
                          {enviandoFoto === p.placa ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                          Tirar foto
                        </button>
                        <button
                          onClick={() => abrirCaptura(p.placa, 'upload')}
                          disabled={enviandoFoto === p.placa}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-[11px] hover:bg-accent transition-colors disabled:opacity-50"
                        >
                          <Upload className="h-3 w-3" /> Enviar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Cadastro de peso por placa ───────────────────────────── */}
      <div className="border rounded-lg bg-white">
        <button
          onClick={() => setCadastroAberto((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b text-left hover:bg-muted/20 transition-colors"
        >
          <div>
            <h2 className="font-semibold text-sm">Cadastro de Peso por Placa</h2>
            <p className="text-xs text-muted-foreground">Tara e Lotação importados do Frota Legal</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${cadastroAberto ? 'rotate-180' : ''}`} />
        </button>
        {cadastroAberto && (
          loadingPesos ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
            </div>
          ) : pesos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Nenhuma placa cadastrada ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Placa</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Freightech</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Peso Tara</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Peso Lotação</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Foto TARA</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Importado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pesos.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-mono text-xs font-semibold">{p.placa}</td>
                      <td className="px-4 py-2">
                        {veioDoFreightech(p) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">Sim</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-700 bg-gray-100">Não</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{formatarKg(p.peso_tara)}</td>
                      <td className="px-4 py-2 text-right font-medium">{formatarKg(p.peso_lotacao)}</td>
                      <td className="px-4 py-2">
                        {p.foto_tara_url ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-green-700 bg-green-100">Enviada</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-yellow-700 bg-yellow-100">Pendente</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{p.importado_em ? formatarDataBR(p.importado_em) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Excesso de peso hoje ─────────────────────────────────── */}
      <div className="border rounded-lg bg-white">
        <button
          onClick={() => setExcessoAberto((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 border-b text-left hover:bg-muted/20 transition-colors"
        >
          <div>
            <h2 className="font-semibold text-sm">Excesso de Peso — hoje ({formatarDataBR(hojeISO())})</h2>
            <p className="text-xs text-muted-foreground">Peso Lotação × peso carregado, puxado da escala já importada</p>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${excessoAberto ? 'rotate-180' : ''}`} />
        </button>
        {excessoAberto && (
          <>
            <div className="px-4 py-2 border-b flex flex-wrap gap-1.5">
              {([
                ['todos', `Todos (${excessoStats.todos})`],
                ['dentro_limite', `Dentro do limite (${excessoStats.dentro_limite})`],
                ['excesso', `Excesso (${excessoStats.excesso})`],
                ['sem_referencia', `Sem referência (${excessoStats.sem_referencia})`],
                ['sem_peso_carregado', `Sem peso carregado (${excessoStats.sem_peso_carregado})`],
              ] as const).map(([valor, label]) => (
                <button
                  key={valor}
                  onClick={() => setFiltroExcesso(valor)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    filtroExcesso === valor ? 'bg-accent-500 text-white border-accent-500' : 'hover:bg-accent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {loadingExcesso ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
              </div>
            ) : excessoFiltrado.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                <FileSpreadsheet className="h-8 w-8 mx-auto opacity-20 mb-2" />
                {excessoHoje.length === 0 ? 'Nenhum mapa na escala de hoje ainda.' : 'Nenhum mapa nesse filtro.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mapa</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Placa</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Peso Lotação</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Peso carregado</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Excesso</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {excessoFiltrado.map((l) => (
                      <tr key={l.mapa} className={`hover:bg-muted/30 transition-colors ${l.situacao === 'excesso' ? 'bg-red-50/40' : ''}`}>
                        <td className="px-4 py-2">{l.mapa}</td>
                        <td className="px-4 py-2 font-mono text-xs font-semibold">{l.placa}</td>
                        <td className="px-4 py-2 text-right">{formatarKg(l.pesoReferencia)}</td>
                        <td className="px-4 py-2 text-right">{formatarKg(l.pesoCarregado)}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {l.excesso != null && l.excesso > 0 ? `+${formatarKg(l.excesso)}` : '—'}
                        </td>
                        <td className="px-4 py-2"><ExcessoBadge situacao={l.situacao} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
