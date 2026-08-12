import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, ShieldAlert, AlertTriangle } from 'lucide-react'
import {
  buscarRelatoPorToken, enviarChecklistVisita, RISCOS_VISITA_PDV,
  NIVEL_LABEL, STATUS_LABEL,
  type RelatoParaVisita, type NivelCriticidade,
} from '../lib/pdvSeguranca'

const NIVEL_CSS: Record<NivelCriticidade, string> = {
  alto: 'bg-red-50 text-red-700 border-red-200',
  medio: 'bg-amber-50 text-amber-700 border-amber-200',
  leve: 'bg-slate-100 text-slate-700 border-slate-200',
}

export default function PdvCriticoVisitaPublica() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [relato, setRelato] = useState<RelatoParaVisita | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarregar, setErroCarregar] = useState('')

  const [riscosMarcados, setRiscosMarcados] = useState<string[]>([])
  const [acaoRecomendada, setAcaoRecomendada] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')
  const [enviado, setEnviado] = useState(false)

  useEffect(() => {
    buscarRelatoPorToken(token).then(({ relato, error }) => {
      setRelato(relato)
      setErroCarregar(error ?? '')
      setCarregando(false)
    })
  }, [token])

  function toggleRisco(id: string) {
    setRiscosMarcados((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]))
  }

  async function handleEnviar() {
    setEnviando(true)
    setErroEnvio('')
    const { error } = await enviarChecklistVisita(token, riscosMarcados, acaoRecomendada)
    setEnviando(false)
    if (error) { setErroEnvio(error); return }
    setEnviado(true)
  }

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-accent-500" />
      </div>
    )
  }

  if (erroCarregar || !relato) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-sm border p-6 max-w-sm w-full text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-red-500 mb-3" />
          <p className="text-sm text-muted-foreground">{erroCarregar || 'Link inválido.'}</p>
        </div>
      </div>
    )
  }

  if (enviado || relato.status !== 'agendado') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-sm border p-6 max-w-sm w-full text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-600 mb-3" />
          <h1 className="font-semibold text-sm mb-1">
            {enviado ? 'Checklist enviado!' : 'Esse checklist já foi respondido'}
          </h1>
          <p className="text-xs text-muted-foreground">
            PDV {relato.codigoPdv} — {STATUS_LABEL[relato.status]}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center">
          <ShieldAlert className="h-8 w-8 mx-auto text-primary mb-1" />
          <h1 className="font-bold text-lg">Checklist de Visita — PDV Crítico</h1>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4 space-y-1.5">
          <p className="text-sm"><span className="text-muted-foreground">PDV:</span> <b>{relato.codigoPdv}</b></p>
          <p className="text-sm"><span className="text-muted-foreground">Risco relatado:</span> {relato.subgrupo}</p>
          {relato.nivel && (
            <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold ${NIVEL_CSS[relato.nivel]}`}>
              {NIVEL_LABEL[relato.nivel]}
            </span>
          )}
          {relato.instrucaoRegistrada && (
            <p className="text-xs text-muted-foreground pt-1">Instrução já registrada: {relato.instrucaoRegistrada}</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h2 className="text-sm font-semibold mb-1">O que você encontrou na visita?</h2>
          <p className="text-xs text-muted-foreground mb-3">Marque todos os riscos que você viu no local. Se não tiver nenhum, deixe tudo desmarcado.</p>
          <div className="flex flex-wrap gap-2">
            {RISCOS_VISITA_PDV.map((r) => {
              const marcado = riscosMarcados.includes(r.id)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleRisco(r.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    marcado
                      ? (r.nivel === 'alto' ? 'bg-red-600 text-white border-red-600' : r.nivel === 'medio' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-600 text-white border-slate-600')
                      : 'bg-white text-muted-foreground border-gray-200 hover:bg-accent'
                  }`}
                >
                  {r.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h2 className="text-sm font-semibold mb-2">Ação recomendada / observações (opcional)</h2>
          <textarea
            value={acaoRecomendada}
            onChange={(e) => setAcaoRecomendada(e.target.value)}
            rows={3}
            placeholder="Ex.: falar com o proprietário sobre a rampa, orientar motorista a usar cone..."
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {erroEnvio && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{erroEnvio}</div>}

        <button
          onClick={handleEnviar}
          disabled={enviando}
          className="w-full flex items-center justify-center gap-2 bg-green-600 text-white font-semibold py-3 rounded-xl disabled:opacity-50 hover:bg-green-700 transition-colors"
        >
          {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
          {enviando ? 'Enviando...' : 'Enviar checklist'}
        </button>
      </div>
    </div>
  )
}
