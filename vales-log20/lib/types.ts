export interface Ajudante {
  id: string;
  codigo: number;
  nome: string;
  telefone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Importacao {
  id: string;
  nome_arquivo: string | null;
  total_linhas: number | null;
  total_vales: number | null;
  total_ajudantes_notificados: number;
  status: string;
  importado_em: string;
}

export interface Vale {
  id: string;
  numero_vale: number;
  data_emissao: string | null;
  mapa: number | null;
  motorista: string | null;
  veiculo: string | null;
  status_vale: StatusVale | null;
  acao_transportadora: AcaoTransportadora | null;
  acao_primeiro_nivel: string | null;
  data_primeiro_nivel: string | null;
  usuario_primeiro_nivel: string | null;
  motivo_primeiro_nivel: string | null;
  justificativa_primeiro_nivel: string | null;
  valor_total: number;
  notificacao_pendente_enviada: boolean;
  notificacao_final_enviada: boolean;
  importacao_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  ajudantes?: Ajudante[];
  itens?: ValeItem[];
}

export interface ValeItem {
  id: string;
  vale_id: string;
  tipo_item: string | null;
  codigo_item: string | null;
  item: string | null;
  unidade: string | null;
  qtde_saida: number | null;
  qtde_retorno: number | null;
  qtde_diferenca: number | null;
  valor: number | null;
  justificativa_ajudante: string | null;
  acao_transportadora: string | null;
  created_at: string;
}

export interface ValeAjudante {
  id: string;
  vale_id: string;
  ajudante_id: string;
  posicao: number;
}

export interface Notificacao {
  id: string;
  vale_id: string | null;
  ajudante_id: string | null;
  tipo: "pendente" | "resolvido";
  mensagem: string | null;
  telefone: string | null;
  status: "enviado" | "erro" | "pendente";
  erro_detalhe: string | null;
  enviada_em: string | null;
  created_at: string;
}

export type StatusVale = "Abonado" | "Faturado" | "Faturar" | "Sem Ação";
export type AcaoTransportadora = "Aprovado" | "Reprovado" | "Sem ação";

// Parsed row from Excel
export interface ExcelRow {
  codigoAjudante1: number;
  nomeAjudante1: string;
  codigoAjudante2: number | null;
  nomeAjudante2: string | null;
  mapa: number | null;
  data: string | null; // ISO date
  numeroVale: number;
  emissaoVale: string | null; // ISO date
  item: string | null;
  itemTipo: string | null;
  qtdeDiferenca: number | null;
  valor: number | null;
  justAjudante: string | null;
  acaoTransportadora: AcaoTransportadora | null;
  statusVale: StatusVale | null;
  acaoPrimeiroNivel: string | null;
  dataPrimeiroNivel: string | null;
  usuarioPrimeiroNivel: string | null;
  motivoPrimeiroNivel: string | null;
  justificativaPrimeiroNivel: string | null;
}

// Grouped vale data from Excel parsing
export interface ValeParseado {
  numeroVale: number;
  dataEmissao: string | null;
  mapa: number | null;
  statusVale: StatusVale | null;
  acaoTransportadora: AcaoTransportadora | null;
  acaoPrimeiroNivel: string | null;
  dataPrimeiroNivel: string | null;
  usuarioPrimeiroNivel: string | null;
  motivoPrimeiroNivel: string | null;
  justificativaPrimeiroNivel: string | null;
  valorTotal: number;
  ajudantes: {
    codigo: number;
    nome: string;
    posicao: number;
  }[];
  itens: {
    tipoItem: string | null;
    item: string | null;
    qtdeDiferenca: number | null;
    valor: number | null;
    justificativaAjudante: string | null;
    acaoTransportadora: string | null;
  }[];
}

// Summary of an import operation
export interface ImportacaoSummary {
  totalLinhas: number;
  totalVales: number;
  valesNovos: number;
  ajudantesEncontrados: number;
  ajudantesNotificados: number;
  vales: ValeParseado[];
}

// Vale with ajudantes for display
export interface ValeComAjudantes extends Vale {
  ajudantes: Ajudante[];
  itens: ValeItem[];
}

// Ajudante with pending vales count
export interface AjudanteComVales extends Ajudante {
  vales_pendentes: number;
  vales_abonados: number;
  vales_faturados: number;
}
