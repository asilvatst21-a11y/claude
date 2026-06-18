interface Props {
  label: string
  nome: string
  onNomeChange: (v: string) => void
  colaboradores: string[]
  valor?: string
  onValorChange?: (v: string) => void
  mostrarValor: boolean
}

export default function PessoaValorCard({ label, nome, onNomeChange, colaboradores, valor, onValorChange, mostrarValor }: Props) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
        <select
          value={nome}
          onChange={e => onNomeChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">Selecione...</option>
          {colaboradores.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      {mostrarValor && (
        <div className="sm:w-32">
          <label className="block text-xs font-medium text-gray-500 mb-1">Valor</label>
          <input
            type="number"
            step="0.01"
            value={valor ?? ''}
            onChange={e => onValorChange?.(e.target.value)}
            placeholder="0,00"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
    </div>
  )
}
