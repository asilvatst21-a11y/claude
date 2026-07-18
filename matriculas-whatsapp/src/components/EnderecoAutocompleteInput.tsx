import { useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { buscarSugestoesEndereco } from '../lib/calcularKm'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputClassName: string
  iconSize?: number
}

// Campo de endereço com autocomplete (Google Places), usado na Solicitação
// Extra (Entrega/Recolha de Materiais) tanto na tela pública quanto no
// cadastro interno. Só sugere — quem decide o texto final é o usuário
// (clicando numa opção ou digitando livremente).
export function EnderecoAutocompleteInput({ value, onChange, placeholder, inputClassName, iconSize = 18 }: Props) {
  const [sugestoes, setSugestoes] = useState<string[]>([])
  const [erroDebug, setErroDebug] = useState('')
  const [aberto, setAberto] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(v: string) {
    onChange(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 4) {
      setSugestoes([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      const resultado = await buscarSugestoesEndereco(v.trim())
      setSugestoes(resultado.sugestoes)
      setErroDebug(resultado.detalhe ?? '')
      setAberto(true)
    }, 350)
  }

  function selecionar(sugestao: string) {
    onChange(sugestao)
    setSugestoes([])
    setAberto(false)
  }

  return (
    <div className="relative flex-1">
      <MapPin size={iconSize} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {aberto && sugestoes.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {sugestoes.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={e => { e.preventDefault(); selecionar(s) }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-brand-50 border-b border-gray-50 last:border-0"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {/* Diagnóstico temporário — remover depois que o autocomplete estiver
          funcionando de ponta a ponta em produção. */}
      {erroDebug && <p className="text-[11px] text-red-500 mt-1 break-all">Debug: {erroDebug}</p>}
    </div>
  )
}
