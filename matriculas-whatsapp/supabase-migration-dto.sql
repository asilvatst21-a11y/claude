-- Migração: módulo DTO (Diálogo de Tarefa Observada)
-- Execute no SQL Editor do Supabase

create table if not exists dto_observacoes (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  external_id text,
  data_aplicacao text,
  colaborador text not null,
  lider_inspecao text,
  avaliador text,
  cargo_avaliador text,
  lider_atual text,
  cpf_avaliado text,
  operacao text,
  area text,
  atividade text,
  duracao text,
  tem_padrao text,
  uso_epis text,
  epis_utilizados text,
  funcionario_treinado text,
  ferramentas_ok text,
  checklist_realizado text,
  executado_wms text,
  cumpre_sop text,
  passo_nao_cumprido text,
  padrao_completo text,
  conhece_padrao text,
  tarefas_seguranca text,
  houve_desvio text,
  tarefa_com_desvio text,
  qual_desvio text,
  acao_gerada text,
  status_acao text not null default 'Pendente',
  responsavel_acao text,
  prazo_acao text,
  created_at timestamptz not null default now(),
  unique(filial, external_id)
);
alter table dto_observacoes enable row level security;
create policy "Acesso total" on dto_observacoes for all using (true);
create index if not exists idx_dto_filial on dto_observacoes(filial);
create index if not exists idx_dto_colaborador on dto_observacoes(colaborador);
create index if not exists idx_dto_avaliador on dto_observacoes(avaliador);
create index if not exists idx_dto_atividade on dto_observacoes(atividade);
