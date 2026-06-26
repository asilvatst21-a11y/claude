import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convenção do projeto: toda data exibida na tela usa dd/mm/aa (ano com
// 2 dígitos). Aceita Date, ISO (yyyy-mm-dd ou timestamptz) ou dd/mm/yyyy
// já formatado. Não usar para datas guardadas/filtradas/ordenadas — só
// para exibição.
export function formatarDataBR(data: string | Date | null | undefined): string {
  if (!data) return '—'
  if (data instanceof Date) {
    return isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }
  const brMatch = data.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (brMatch) return `${brMatch[1]}/${brMatch[2]}/${brMatch[3].slice(2)}`
  // Data pura "yyyy-mm-dd" (sem horário): new Date(str) interpreta como meia-noite
  // UTC, e toLocaleDateString converteria para o fuso local, voltando um dia em
  // fusos negativos (Brasil). Por isso parseamos os componentes direto, sem Date.
  const isoMatch = data.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1].slice(2)}`
  const d = new Date(data)
  if (isNaN(d.getTime())) return data
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
