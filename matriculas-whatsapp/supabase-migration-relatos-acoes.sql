-- Migração: ações disciplinares para Relatos (Atos Inseguros)
-- Execute no SQL Editor do Supabase

create table if not exists relatos_acoes (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  relato_id uuid references relatos(id) on delete cascade,
  pessoa_relatada text not null,
  tipo_relato text,
  data_relato date,
  tipo_acao text not null,
  dias_suspensao int,
  observacao text,
  registrado_por text,
  created_at timestamptz not null default now(),
  unique(relato_id)
);

alter table relatos_acoes enable row level security;
create policy "Acesso total" on relatos_acoes for all using (true);

create index if not exists idx_relatos_acoes_filial  on relatos_acoes(filial);
create index if not exists idx_relatos_acoes_pessoa  on relatos_acoes(filial, pessoa_relatada);
create index if not exists idx_relatos_acoes_relato  on relatos_acoes(relato_id);
