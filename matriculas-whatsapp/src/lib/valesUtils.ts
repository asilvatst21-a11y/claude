export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export type PrazoStatus = "ok" | "alerta" | "urgente" | "vencido";

export interface PrazoInfo {
  status: PrazoStatus;
  label: string;
  horasRestantes: number;
}

export function calcPrazo(dataEmissao: string | null | undefined): PrazoInfo | null {
  if (!dataEmissao) return null;
  const emissao = new Date(dataEmissao + "T00:00:00");
  const deadline = new Date(emissao.getTime() + 3 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const horasRestantes = Math.floor(diffMs / (1000 * 60 * 60));

  if (horasRestantes < 0) {
    const atraso = Math.abs(Math.floor(horasRestantes / 24));
    return { status: "vencido", label: atraso === 0 ? "Vencido hoje" : `Vencido ${atraso}d`, horasRestantes };
  }
  if (horasRestantes < 24) {
    return { status: "urgente", label: horasRestantes <= 1 ? "< 1h" : `${horasRestantes}h restantes`, horasRestantes };
  }
  const dias = Math.floor(horasRestantes / 24);
  if (dias === 1) return { status: "alerta", label: "Amanhã", horasRestantes };
  return { status: "ok", label: `${dias} dias`, horasRestantes };
}

// Convenção do projeto: datas exibidas na tela usam dd/mm/aa (ano com 2 dígitos).
export function formatDateBR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = typeof dateStr === "string" ? new Date(dateStr + "T00:00:00") : dateStr;
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return "-";
  }
}

export function formatPhoneForZAPI(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length >= 12) return digits;
  return null;
}
