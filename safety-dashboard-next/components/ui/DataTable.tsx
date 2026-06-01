'use client'
import { useState } from 'react'

interface Column {
  key: string
  label: string
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode
}

interface Props {
  columns: Column[]
  data: Record<string, unknown>[]
  onRowClick?: (row: Record<string, unknown>) => void
  emptyMessage?: string
}

export default function DataTable({ columns, data, onRowClick, emptyMessage = 'Nenhum registro.' }: Props) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey]
        if (va === vb) return 0
        const cmp = (va ?? '') < (vb ?? '') ? -1 : 1
        return sortAsc ? cmp : -cmp
      })
    : data

  const handleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  if (data.length === 0) {
    return <p className="text-center text-gray-400 py-8 text-sm">{emptyMessage}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map(col => (
              <th key={col.key} onClick={() => handleSort(col.key)}
                className="px-3 py-2.5 text-left font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none whitespace-nowrap">
                {col.label} {sortKey === col.key ? (sortAsc ? '↑' : '↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-gray-100 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-blue-50' : ''}`}>
              {columns.map(col => (
                <td key={col.key} className="px-3 py-2.5 text-gray-700">
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
