export interface Usuario {
  id: string
  filial: string
  login: string
  senha: string
  nome: string | null
  admin: boolean
  created_at: string
}

export interface Filial {
  id: string
  nome: string
  created_at: string
}

export interface Matricula {
  id: string
  filial: string
  numero: string
  whatsapp: string
  nome: string | null
  ativo: boolean
  created_at: string
}

export interface Cliente {
  id: string
  filial: string
  codigo: string
  nome: string
  foto_url: string | null
  observacoes: string | null
  created_at: string
}

export interface Vinculo {
  id: string
  matricula_id: string
  cliente_id: string
  data_vinculo: string
  created_at: string
  matricula?: Matricula
  cliente?: Cliente
}

export interface Disparo {
  id: string
  filial: string | null
  matricula_id: string | null
  cliente_id: string | null
  whatsapp: string
  mensagem: string
  status: 'pendente' | 'enviado' | 'erro'
  erro: string | null
  created_at: string
}

export interface GsdpqColaborador {
  id: string
  filial: string
  matricula: string | null
  nome: string
  equipe: string | null
  funcao: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface GsdpqAvaliacao {
  id: string
  filial: string
  colaborador_nome: string
  colaborador_id: string | null
  realizado_por: string | null
  equipe: string | null
  funcao: string | null
  data_avaliacao: string | null
  questao: string
  resultado: string
  observacoes: string | null
  created_at: string
}

export interface GsdpqAcao {
  id: string
  filial: string
  colaborador_nome: string
  colaborador_id: string | null
  avaliacao_id: string | null
  questao: string
  data_avaliacao: string | null
  tipo_acao: string
  dias_suspensao: number | null
  observacao: string | null
  registrado_por: string | null
  created_at: string
}

export interface DtoObservacao {
  id: string
  filial: string
  external_id: string | null
  data_aplicacao: string | null
  colaborador: string
  lider_inspecao: string | null
  avaliador: string | null
  cargo_avaliador: string | null
  lider_atual: string | null
  cpf_avaliado: string | null
  operacao: string | null
  area: string | null
  atividade: string | null
  duracao: string | null
  tem_padrao: string | null
  uso_epis: string | null
  epis_utilizados: string | null
  funcionario_treinado: string | null
  ferramentas_ok: string | null
  checklist_realizado: string | null
  executado_wms: string | null
  cumpre_sop: string | null
  passo_nao_cumprido: string | null
  padrao_completo: string | null
  conhece_padrao: string | null
  tarefas_seguranca: string | null
  houve_desvio: string | null
  tarefa_com_desvio: string | null
  qual_desvio: string | null
  acao_gerada: string | null
  status_acao: 'Pendente' | 'Em Andamento' | 'Concluído'
  responsavel_acao: string | null
  prazo_acao: string | null
  created_at: string
}

export interface DtoAtividade {
  id: string
  filial: string
  area: string
  nome_atividade: string
  frequencia_atividade: string | null
  criticidade_base: string
  responsavel: string | null
  ultimo_dto_manual: string | null
  ativo: boolean
  created_at: string
}

export interface ProntuarioSnapshot {
  id: string
  filial: string
  tipo: string
  data_referencia: string
  nome_arquivo: string | null
  total_registros: number
  created_at: string
}

export interface ProntuarioRegistro {
  id: string
  snapshot_id: string
  filial: string
  tipo: string
  cpf: string
  nome: string
  cargo: string | null
  situacao_empregado: string | null
  status: string | null
  motivo: string | null
  pontuacao: number
  faixa: string
  sonolencia: number
  detalhes: Record<string, number>
  regiao: string | null
  operacao: string | null
  created_at: string
}

export interface JornadaRegistro {
  id: string
  filial: string
  nome: string
  matricula: string | null
  mes: string
  sort: number
  horas_extras: number
  horas_menos: number
  faltas: number
  folgas: number
  atestados: number
  afastamentos: number
  created_at: string
}

export interface FluxoPunitivo {
  id: string
  filial: string
  colaborador_nome: string
  origem: 'GSDPQ' | 'Relatos' | 'Telemetria' | 'Manual'
  tipo_acao: string
  dias_suspensao: number | null
  data_acao: string | null
  observacao: string | null
  registrado_por: string | null
  source_id: string | null
  created_at: string
}

export interface Colaborador {
  id: string
  filial: string
  matricula: string | null
  nome: string
  status: string | null
  projeto: string | null
  subprojeto: string | null
  funcao: string | null
  equipe: string | null
  cargo: string | null
  created_at: string
}

export interface TelemetriaAlerta {
  id: string
  filial: string
  placa: string
  prefixo: string | null
  motorista: string | null
  motorista_identificado: string | null
  cpf: string | null
  uo: string | null
  tipo: string
  nivel: string | null
  limiar_raw: string | null
  excesso_raw: string | null
  limiar_km: number | null
  excesso_km: number | null
  duracao_seg: number | null
  ponto_referencia: string | null
  categoria: string | null
  logradouro: string | null
  cidade: string | null
  estado: string | null
  latitude: number | null
  longitude: number | null
  data_hora: string | null
  status: string | null
  integrador: string | null
  alerta_desconsiderado: string | null
  qualifica_acao: boolean
  created_at: string
}

export interface TelemetriaAcao {
  id: string
  filial: string
  alerta_id: string
  placa: string
  motorista: string
  tipo_acao: string
  dias_suspensao: number | null
  observacao: string | null
  registrado_por: string | null
  created_at: string
}

export interface Relato {
  id: string
  filial: string
  external_id: string | null
  data_ocorrencia: string | null
  data_cadastro: string | null
  cdd: string | null
  empresa: string | null
  matricula: string | null
  relator: string | null
  funcao: string | null
  equipe: string | null
  classificacao: string | null
  tipo_relato: string | null
  area: string | null
  atividade: string | null
  tarefa_seguranca: string | null
  acao_imediata: string | null
  sif: string | null
  empresa_relatada: string | null
  pessoa_relatada: string | null
  detalhamento: string | null
  complementacao: string | null
  origem: string | null
  porque_falhou: string | null
  pq1: string | null
  pq2: string | null
  pq3: string | null
  pq4: string | null
  pq5: string | null
  motivo1: string | null
  acao1: string | null
  motivo2: string | null
  acao2: string | null
  motivo3: string | null
  acao3: string | null
  data_investigacao: string | null
  created_at: string
}
