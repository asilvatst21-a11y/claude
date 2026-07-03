import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Camera, Upload, Loader2, RefreshCw, Image } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { buscarPesoCadastrado, formatarKg, type PesoCadastradoPlaca } from '../lib/pesoExcesso'

export default function SegurancaExcessoPesoFotos() {
  const { usuario } = useAuth()
  const [pesos, setPesos] = useState<PesoCadastradoPlaca[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const [placaFotoAtiva, setPlacaFotoAtiva] = useState<string | null>(null)
  const [enviandoFoto, setEnviandoFoto] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const fetchPesos = useCallback(async () => {
    if (!usuario) return
    setLoading(true)
    const lista = await buscarPesoCadastrado(usuario.filial)
    setPesos(lista)
    setLoading(false)
  }, [usuario])

  useEffect(() => { fetchPesos() }, [fetchPesos])

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

  const pendentes = pesos.filter((p) => !p.foto_tara_url)
  const enviadas = pesos.filter((p) => p.foto_tara_url)

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
          <Link to="/seguranca/excesso-peso" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="h-3 w-3" /> Excesso de Peso
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Image className="h-5 w-5 text-accent-600" /> Foto da TARA
          </h1>
          <p className="text-sm text-muted-foreground">
            Toda placa cadastrada (Freightech/Frota Legal) precisa de uma foto da plaqueta de TARA.
          </p>
        </div>
        <button onClick={fetchPesos} className="flex items-center gap-2 px-3 py-2 rounded-md border text-sm hover:bg-accent transition-colors">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erro}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Fotos pendentes</p>
          <p className="text-2xl font-bold text-yellow-600">{pendentes.length}</p>
        </div>
        <div className="border rounded-lg bg-white p-4">
          <p className="text-xs text-muted-foreground mb-1">Fotos enviadas</p>
          <p className="text-2xl font-bold text-green-600">{enviadas.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent-500" />
        </div>
      ) : pesos.length === 0 ? (
        <div className="border rounded-lg bg-white text-center py-16 text-muted-foreground text-sm">
          Nenhuma placa cadastrada ainda. Importe Freightech ou Frota Legal em{' '}
          <Link to="/seguranca/excesso-peso" className="text-accent-600 underline">Excesso de Peso</Link>.
        </div>
      ) : (
        <>
          {pendentes.length > 0 && (
            <div className="border rounded-lg bg-white">
              <div className="px-4 py-3 border-b">
                <h2 className="font-semibold text-sm">Pendentes ({pendentes.length})</h2>
              </div>
              <div className="grid gap-3 p-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                {pendentes.map((p) => (
                  <div key={p.id} className="border rounded-lg overflow-hidden bg-white">
                    <div className="w-full aspect-[4/3] bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                      Sem foto ainda
                    </div>
                    <div className="p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold bg-muted/50 border rounded px-1.5 py-0.5">{p.placa}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-yellow-700 bg-yellow-100">Pendente</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Tara: {formatarKg(p.peso_tara)} · Lotação: {formatarKg(p.peso_lotacao)}
                      </p>
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
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {enviadas.length > 0 && (
            <div className="border rounded-lg bg-white">
              <div className="px-4 py-3 border-b">
                <h2 className="font-semibold text-sm">Enviadas ({enviadas.length})</h2>
              </div>
              <div className="grid gap-3 p-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                {enviadas.map((p) => (
                  <div key={p.id} className="border rounded-lg overflow-hidden bg-white">
                    <img src={p.foto_tara_url!} alt={`TARA ${p.placa}`} className="w-full aspect-[4/3] object-cover" />
                    <div className="p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold bg-muted/50 border rounded px-1.5 py-0.5">{p.placa}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-green-700 bg-green-100">Enviada</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Tara: {formatarKg(p.peso_tara)} · Lotação: {formatarKg(p.peso_lotacao)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
