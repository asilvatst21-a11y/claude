-- Migração: módulo Relatos
-- Execute no SQL Editor do Supabase

create table if not exists relatos (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  external_id text,
  data_ocorrencia timestamptz,
  data_cadastro timestamptz,
  cdd text,
  empresa text,
  matricula text,
  relator text,
  funcao text,
  equipe text,
  classificacao text,
  tipo_relato text,
  area text,
  atividade text,
  tarefa_seguranca text,
  acao_imediata text,
  sif text,
  empresa_relatada text,
  pessoa_relatada text,
  detalhamento text,
  complementacao text,
  origem text,
  porque_falhou text,
  pq1 text, pq2 text, pq3 text, pq4 text, pq5 text,
  motivo1 text, acao1 text,
  motivo2 text, acao2 text,
  motivo3 text, acao3 text,
  data_investigacao timestamptz,
  created_at timestamptz not null default now(),
  unique(filial, external_id)
);

alter table relatos enable row level security;
create policy "Acesso total" on relatos for all using (true);

create index if not exists idx_relatos_filial    on relatos(filial);
create index if not exists idx_relatos_data      on relatos(filial, data_ocorrencia desc);
create index if not exists idx_relatos_relator   on relatos(filial, relator);
create index if not exists idx_relatos_relatado  on relatos(filial, pessoa_relatada);
create index if not exists idx_relatos_class     on relatos(filial, classificacao);
