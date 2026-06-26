-- Migração: timer de matinal TML (início/fim registrados manualmente).
-- Execute no SQL Editor do Supabase. Idempotente.

-- Uma linha por filial+sala+dia. Acesso público (sem login) pois o botão
-- de iniciar/finalizar fica numa página pública, como a de Solicitação Extra.
create table if not exists matinal_tml (
  id bigserial primary key,
  filial text not null,
  sala text not null,
  data date not null,
  horario_inicio timestamptz,
  horario_final timestamptz,
  meta_minutos integer,
  duracao_minutos integer,
  estouro_duracao boolean,
  finalizado_automaticamente boolean not null default false,
  iniciado_por text,
  finalizado_por text,
  created_at timestamptz not null default now(),
  unique (filial, sala, data)
);
create index if not exists idx_matinal_tml_filial_data on matinal_tml(filial, data);

alter table matinal_tml enable row level security;
drop policy if exists "Acesso total" on matinal_tml;
create policy "Acesso total" on matinal_tml for all using (true);
