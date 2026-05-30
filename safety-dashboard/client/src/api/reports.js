export const downloadCsv = async (params = {}) => {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`/api/reports/csv${qs ? '?' + qs : ''}`)
  if (!res.ok) throw new Error('Erro ao exportar CSV')
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const today = new Date().toISOString().split('T')[0]
  a.download = `safety-report-${today}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
