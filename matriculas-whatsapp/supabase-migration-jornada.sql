-- Migração: módulo Controle de Jornada
-- Execute no SQL Editor do Supabase

create table if not exists jornada_registros (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  nome text not null,
  matricula text,
  mes text not null,
  sort int not null,
  horas_extras numeric not null default 0,
  horas_menos numeric not null default 0,
  faltas int not null default 0,
  folgas int not null default 0,
  atestados int not null default 0,
  afastamentos int not null default 0,
  created_at timestamptz not null default now(),
  unique(filial, nome, sort)
);

alter table jornada_registros enable row level security;
create policy "Acesso total" on jornada_registros for all using (true);

create index if not exists idx_jornada_filial on jornada_registros(filial);
create index if not exists idx_jornada_nome   on jornada_registros(filial, nome);
create index if not exists idx_jornada_mes    on jornada_registros(filial, sort);
