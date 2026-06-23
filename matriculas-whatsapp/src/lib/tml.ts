export type SalaTML = "INT" | "PET";

export const SALA_TML_LABEL: Record<SalaTML, string> = {
  INT: "Interior",
  PET: "Petrópolis",
};

export const REGRAS_TML: Record<SalaTML, { matinal: string; toleranciaMin: number }> = {
  INT: { matinal: "07:00", toleranciaMin: 30 },
  PET: { matinal: "08:00", toleranciaMin: 30 },
};

export function isSalaTML(sala: string | null | undefined): sala is SalaTML {
  return sala === "INT" || sala === "PET";
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
