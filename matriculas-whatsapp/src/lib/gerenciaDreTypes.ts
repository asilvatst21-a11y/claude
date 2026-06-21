export interface GerenciaDreConta {
  conta_codigo: string;
  conta_nome: string;
  setor: string | null;
  grupo: string | null;
  meta_avr: number | null;
  ordem: number;
}

export interface GerenciaDreLancamento {
  id: string;
  importacao_id: string | null;
  ano: number;
  mes: string;
  conta_codigo: string;
  remunerado: number;
  realizado: number;
  diferenca: number;
  avr_percentual: number | null;
}

export interface GerenciaDreLinhaParseada {
  conta_codigo: string;
  conta_nome: string;
  ordem: number;
  mes: string;
  remunerado: number;
  realizado: number;
  diferenca: number;
  avr_percentual: number | null;
}

export interface GerenciaDreImportSummary {
  ano: number;
  meses: string[];
  linhas: GerenciaDreLinhaParseada[];
}

export const MESES_ORDEM = [
  "JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

export const MESES_LABEL: Record<string, string> = {
  JANEIRO: "Janeiro", FEVEREIRO: "Fevereiro", MARCO: "Março", ABRIL: "Abril",
  MAIO: "Maio", JUNHO: "Junho", JULHO: "Julho", AGOSTO: "Agosto",
  SETEMBRO: "Setembro", OUTUBRO: "Outubro", NOVEMBRO: "Novembro", DEZEMBRO: "Dezembro",
};
