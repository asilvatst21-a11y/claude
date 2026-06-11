'use client'

interface FilterDef {
  key: string
  label: string
  options: { value: string; label: string }[]
}

interface Props {
  filters: FilterDef[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}

export default function FilterBar({ filters, values, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      {filters.map(f => (
        <div key={f.key}>
          <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
          <select
            value={values[f.key] || ''}
            onChange={e => onChange({ ...values, [f.key]: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            {f.options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      ))}
      {Object.values(values).some(v => v) && (
        <div className="flex items-end">
          <button onClick={() => onChange(Object.fromEntries(filters.map(f => [f.key, ''])))}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-300 rounded-lg">
            Limpar
          </button>
        </div>
      )}
    </div>
  )
}
