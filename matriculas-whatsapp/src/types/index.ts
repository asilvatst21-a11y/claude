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
