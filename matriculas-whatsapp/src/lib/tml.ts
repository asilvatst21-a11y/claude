export type SalaTML = "COLORADO" | "SUB-FURIA";

export const SALA_TML_LABEL: Record<SalaTML, string> = {
  COLORADO: "COLORADO (7H)",
  "SUB-FURIA": "SUB-FURIA (8H)",
};

export const REGRAS_TML: Record<SalaTML, { matinal: string; toleranciaMin: number }> = {
  COLORADO: { matinal: "07:00", toleranciaMin: 30 },
  "SUB-FURIA": { matinal: "08:00", toleranciaMin: 30 },
};

export function isSalaTML(sala: string | null | undefined): sala is SalaTML {
  return sala === "COLORADO" || sala === "SUB-FURIA";
}

export function horarioParaMinutos(horario: string): number {
  const [h, m] = horario.split(":").map(Number);
  return h * 60 + m;
}

export function minutosParaHorario(minutos: number): string {
  const total = ((minutos % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function horarioLimite(sala: SalaTML): string {
  const regra = REGRAS_TML[sala];
  return minutosParaHorario(horarioParaMinutos(regra.matinal) + regra.toleranciaMin);
}

export function atrasoMinutos(sala: SalaTML, horarioSaida: string): number {
  return horarioParaMinutos(horarioSaida) - horarioParaMinutos(horarioLimite(sala));
}

// Saída registrada antes do início da matinal não é uma saída de TML válida
// (o motorista não pode ter saído antes do turno começar) — não entra na conta.
export function saidaInvalida(sala: SalaTML, horarioSaida: string): boolean {
  return horarioParaMinutos(horarioSaida) < horarioParaMinutos(REGRAS_TML[sala].matinal);
}

// Tempo de deslocamento: quanto tempo depois da matinal o motorista começou
// o checklist. Negativo significa que ele iniciou antes da matinal.
export function tempoDeslocamentoMinutos(sala: SalaTML, horarioInicioChecklist: string): number {
  return horarioParaMinutos(horarioInicioChecklist) - horarioParaMinutos(REGRAS_TML[sala].matinal);
}
