import { useEffect, useRef, useState } from 'react'

// Dropdown de seleção múltipla com busca e "selecionar/desmarcar todos".
export function FiltroMulti({ label, selected, onChange, options }: {
  label: string; selected: string[]; onChange: (v: string[]) => void; options: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const visible = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const sel = new Set(selected)

  function toggle(o: string) {
    if (sel.has(o)) onChange(selected.filter(x => x !== o))
    else onChange([...selected, o])
  }

  function toggleAll() {
    if (selected.length === options.length) onChange([])
    else onChange([...options])
  }

  const active = selected.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 whitespace-nowrap transition-colors ${
          active ? 'border-brand-400 bg-brand-50 text-brand-700 font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
        {label}
        {active && <span className="bg-brand-600 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">{selected.length}</span>}
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5">
          {options.length > 6 && (
            <div className="px-2.5 pb-1.5">
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-400" />
            </div>
          )}
          <div className="px-2.5 pb-1 flex items-center justify-between border-b border-gray-100 mb-1">
            <button onClick={toggleAll} className="text-[11px] text-brand-600 hover:underline">
              {selected.length === options.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            {active && (
              <button onClick={() => onChange([])} className="text-[11px] text-gray-400 hover:text-red-500">limpar</button>
            )}
          </div>
          <div className="max-h-52 overflow-y-auto">
            {visible.length === 0
              ? <p className="text-xs text-gray-400 text-center py-2">Nenhum resultado</p>
              : visible.map(o => (
                <label key={o} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={sel.has(o)} onChange={() => toggle(o)}
                    className="accent-brand-600 w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-xs text-gray-700 truncate">{o}</span>
                </label>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}
