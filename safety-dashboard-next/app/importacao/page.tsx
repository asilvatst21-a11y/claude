'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

type FileType = 'gsdpq' | 'dto_checklist' | 'prontuario_motorista' | 'prontuario_ajudante' | 'relatos' | 'unknown'

interface FileEntry {
  file: File
  tipo: FileType
}

interface ImportResult {
  filename: string
  tipo: FileType
  total_registros: number
  total_colaboradores_encontrados: number
  itens_no_detectados: number
  atos_inseguros: number
  abordagens_positivas: number
  errors: string[]
}

interface Importacao {
  id: number
  tipo: string
  nome_arquivo: string
  periodo_ref: string
  total_registros: number
  total_colaboradores_encontrados: number
  importado_em: string
}

function detectFileType(filename: string): FileType {
  const upper = filename.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (upper.includes('RELATO')) return 'relatos'
  if (upper.includes('GSDPQ')) return 'gsdpq'
  if (upper.includes('DTO')) return 'dto_checklist'
  if ((upper.includes('PRONTUARIO') || upper.includes('PRONTU')) && upper.includes('AJUDANTE')) return 'prontuario_ajudante'
  if (upper.includes('PRONTUARIO') || upper.includes('PRONTU')) return 'prontuario_motorista'
  return 'unknown'
}

const TYPE_LABELS: Record<FileType | string, string> = {
  gsdpq: 'GSDPQ',
  dto_checklist: 'DTO Checklist',
  prontuario_motorista: 'Prontuário Motorista',
  prontuario_ajudante: 'Prontuário Ajudante',
  relatos: 'Relatos',
  unknown: 'Desconhecido',
}

const TYPE_COLORS: Record<FileType | string, string> = {
  gsdpq: 'bg-blue-100 text-blue-700',
  dto_checklist: 'bg-purple-100 text-purple-700',
  prontuario_motorista: 'bg-green-100 text-green-700',
  prontuario_ajudante: 'bg-teal-100 text-teal-700',
  relatos: 'bg-orange-100 text-orange-700',
  unknown: 'bg-gray-100 text-gray-600',
}

function getCurrentPeriodo(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export default function ImportacaoPage() {
  const [periodoRef, setPeriodoRef] = useState(getCurrentPeriodo())
  const [files, setFiles] = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const [history, setHistory] = useState<Importacao[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/importacao')
      if (res.ok) {
        const data = await res.json()
        setHistory(data.importacoes || [])
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const addFiles = (newFiles: File[]) => {
    const entries: FileEntry[] = newFiles
      .filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))
      .map(f => ({ file: f, tipo: detectFileType(f.name) }))
    setFiles(prev => {
      const existing = new Set(prev.map(e => e.file.name))
      return [...prev, ...entries.filter(e => !existing.has(e.file.name))]
    })
  }

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    addFiles(dropped)
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files))
    }
  }

  const handleImport = async () => {
    if (files.length === 0 || loading) return
    setLoading(true)
    setResults(null)

    try {
      const formData = new FormData()
      formData.append('periodo_ref', periodoRef)
      files.forEach(({ file }) => formData.append('files[]', file))

      const res = await fetch('/api/importacao', { method: 'POST', body: formData })
      const data = await res.json()
      if (res.ok) {
        setResults(data.importacoes || [])
        setFiles([])
        loadHistory()
      } else {
        setResults([{
          filename: 'Erro geral',
          tipo: 'unknown',
          total_registros: 0,
          total_colaboradores_encontrados: 0,
          itens_no_detectados: 0, atos_inseguros: 0, abordagens_positivas: 0,
          errors: [data.error || 'Erro desconhecido'],
        }])
      }
    } catch (err) {
      setResults([{
        filename: 'Erro de rede',
        tipo: 'unknown',
        total_registros: 0,
        total_colaboradores_encontrados: 0,
        itens_no_detectados: 0, atos_inseguros: 0, abordagens_positivas: 0,
        errors: [err instanceof Error ? err.message : 'Erro de rede'],
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importação de Planilhas</h1>
        <p className="text-sm text-gray-500 mt-1">Atualização semanal de dados</p>
      </div>

      {/* Period + Upload Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        {/* Period selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Período de referência</label>
          <input
            type="month"
            value={periodoRef}
            onChange={e => setPeriodoRef(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Drag-and-drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
            ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
        >
          <div className="text-4xl mb-3 select-none">↑</div>
          <p className="text-sm font-medium text-gray-700">Arraste arquivos aqui ou clique para selecionar</p>
          <p className="text-xs text-gray-400 mt-1">Aceita .xlsx e .xls — múltiplos arquivos</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onInputChange}
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map(({ file, tipo }, idx) => (
              <li key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-400 text-base">📄</span>
                  <span className="truncate text-gray-800 font-medium">{file.name}</span>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[tipo]}`}>
                    {TYPE_LABELS[tipo]}
                  </span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); removeFile(idx) }}
                  className="ml-3 text-gray-400 hover:text-red-500 transition-colors text-base shrink-0"
                  title="Remover"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Import button */}
        <button
          onClick={handleImport}
          disabled={files.length === 0 || loading}
          className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
            text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {loading ? 'Importando...' : `Importar ${files.length > 0 ? `${files.length} arquivo${files.length > 1 ? 's' : ''}` : ''}`}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Resultado da importação</h2>
          <div className="space-y-3">
            {results.map((r, idx) => (
              <div key={idx} className={`rounded-lg border p-4 ${r.errors.length > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-sm text-gray-900">{r.filename}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[r.tipo]}`}>
                    {TYPE_LABELS[r.tipo]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-green-700 font-semibold">{r.total_registros} registros importados</span>
                  <span className="text-blue-700">{r.total_colaboradores_encontrados} colaboradores encontrados</span>
                  {r.itens_no_detectados > 0 && (
                    <span className="text-orange-600">{r.itens_no_detectados} itens NO detectados</span>
                  )}
                  {r.atos_inseguros > 0 && (
                    <span className="text-red-600">{r.atos_inseguros} atos inseguros</span>
                  )}
                  {r.abordagens_positivas > 0 && (
                    <span className="text-green-600">{r.abordagens_positivas} abordagens positivas</span>
                  )}
                </div>
                {r.errors.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {r.errors.map((e, ei) => (
                      <li key={ei} className="text-xs text-red-700">{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Histórico de importações</h2>
        {historyLoading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma importação registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="pb-2 pr-4 font-medium">Data</th>
                  <th className="pb-2 pr-4 font-medium">Arquivo</th>
                  <th className="pb-2 pr-4 font-medium">Tipo</th>
                  <th className="pb-2 pr-4 font-medium">Período</th>
                  <th className="pb-2 pr-4 font-medium text-right">Registros</th>
                  <th className="pb-2 font-medium text-right">Colaboradores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map(imp => (
                  <tr key={imp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">
                      {new Date(imp.importado_em).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-800 max-w-xs truncate">{imp.nome_arquivo}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[imp.tipo] || 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABELS[imp.tipo] || imp.tipo}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">{imp.periodo_ref}</td>
                    <td className="py-2.5 pr-4 text-right text-green-700 font-semibold">{imp.total_registros}</td>
                    <td className="py-2.5 text-right text-blue-700">{imp.total_colaboradores_encontrados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
