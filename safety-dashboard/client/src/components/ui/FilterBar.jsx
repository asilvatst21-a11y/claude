export default function FilterBar({ filters, values, onChange }) {
  const handleReset = () => {
    const reset = {}
    filters.forEach(f => { reset[f.key] = '' })
    onChange(reset)
  }

  const hasActive = filters.some(f => values[f.key])

  return (
    <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
      {filters.map(filter => (
        <div key={filter.key} className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs font-medium text-gray-500">{filter.label}</label>
          <select
            value={values[filter.key] || ''}
            onChange={e => onChange({ ...values, [filter.key]: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Todos</option>
            {filter.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      ))}
      {hasActive && (
        <button
          onClick={handleReset}
          className="mt-4 px-4 py-2 text-sm text-gray-600 hover:text-red-600 border border-gray-300 rounded-lg hover:border-red-300 transition-colors"
        >
          Limpar filtros
        </button>
      )}
    </div>
  )
}
