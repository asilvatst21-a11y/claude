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

// Tempo de deslocamento ideal entre o fim da matinal e o início do checklist,
// e o limite a partir do qual é considerado um estouro de gatilho.
export const DESLOCAMENTO_IDEAL_MIN = 4;
export const DESLOCAMENTO_ESTOURO_MIN = 7;

// Se ninguém apertar "Finalizar Matinal", a duração é limitada a este teto
// (auto-finalizada) pra não inflar o cálculo indefinidamente.
export const MATINAL_AUTO_FINALIZA_MIN = 60;

function diaDaSemana(data: string): number {
  // 0=domingo .. 6=sábado
  return new Date(`${data}T00:00:00`).getDay();
}

// Linha de parâmetro de meta de matinal vinda da tabela tml_meta_matinal
// (editável na aba Parâmetros), versionada por data de vigência.
export interface MetaMatinalParam {
  dia_semana: number;
  meta_minutos: number;
  vigente_a_partir: string;
}

// Linha de parâmetro de gatilho de estouro vinda da tabela
// tml_gatilho_estouro, versionada por data de vigência.
export interface GatilhoEstouroParam {
  deslocamento_ideal_minutos: number;
  deslocamento_estouro_minutos: number;
  vigente_a_partir: string;
}

function paramVigenteNaData<T extends { vigente_a_partir: string }>(
  candidatos: T[],
  data: string
): T | undefined {
  return candidatos
    .filter((p) => p.vigente_a_partir <= data)
    .sort((a, b) => b.vigente_a_partir.localeCompare(a.vigente_a_partir))[0];
}

// Meta de duração da matinal por dia da semana. Se "params" (linhas de
// tml_meta_matinal) tiver um valor vigente para a data e o dia da semana,
// usa ele; senão cai no padrão fixo (segunda e terça 11 min, quarta a
// sexta 7 min — não há matinal no fim de semana). Isso preserva o cálculo
// de dados já registrados antes da aba Parâmetros existir ou antes de uma
// mudança de meta entrar em vigor.
export function metaMatinalMinutos(data: string, params?: MetaMatinalParam[]): number {
  const dow = diaDaSemana(data);
  if (params?.length) {
    const vigente = paramVigenteNaData(params.filter((p) => p.dia_semana === dow), data);
    if (vigente) return vigente.meta_minutos;
  }
  return dow === 1 || dow === 2 ? 11 : 7;
}

// Horário padrão de início da matinal quando ninguém aciona o timer: o
// fixo da sala em dias normais. Sábado normalmente não tem matinal, então
// o deslocamento passa a contar a partir das 7h, igual pra todas as salas.
export function horarioInicioMatinalPadrao(sala: SalaTML, data: string): string {
  if (diaDaSemana(data) === 6) return "07:00";
  return REGRAS_TML[sala].matinal;
}

// Horário padrão de término da matinal quando ninguém aciona o timer:
// início padrão + meta de duração do dia. Sábado não soma duração (sem
// matinal esperada, o marco é só a própria 7h).
export function horarioFinalMatinalPadrao(sala: SalaTML, data: string, params?: MetaMatinalParam[]): string {
  const inicio = horarioInicioMatinalPadrao(sala, data);
  if (diaDaSemana(data) === 6) return inicio;
  return minutosParaHorario(horarioParaMinutos(inicio) + metaMatinalMinutos(data, params));
}

// Gatilho de estouro de deslocamento vigente na data informada (lido da
// aba Parâmetros, com fallback pros valores fixos abaixo).
export function gatilhoEstouroMinutos(
  data: string,
  params?: GatilhoEstouroParam[]
): { ideal: number; estouro: number } {
  if (params?.length) {
    const vigente = paramVigenteNaData(params, data);
    if (vigente) return { ideal: vigente.deslocamento_ideal_minutos, estouro: vigente.deslocamento_estouro_minutos };
  }
  return { ideal: DESLOCAMENTO_IDEAL_MIN, estouro: DESLOCAMENTO_ESTOURO_MIN };
}

// Tempo de deslocamento usando o horário REAL de fim da matinal (registrado
// no timer), em vez do horário fixo da sala.
export function tempoDeslocamentoComMatinalReal(horarioFinalMatinal: string, horarioInicioChecklist: string): number {
  return horarioParaMinutos(horarioInicioChecklist) - horarioParaMinutos(horarioFinalMatinal);
}
