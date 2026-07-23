-- Migração: tempo ideal de checklist e de conferência (Análise do TML).
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Mesmo padrão de tml_gatilho_estouro: valor por filial, versionado por
-- data de vigência — editar não apaga o histórico, só passa a valer a
-- partir da data escolhida (dados já registrados antes continuam avaliados
-- com a regra que estava em vigor na época).

create table if not exists tml_etapa_ideal (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  etapa text not null check (etapa in ('checklist', 'conferencia')),
  ideal_minutos int not null check (ideal_minutos >= 0),
  vigente_a_partir date not null,
  created_at timestamptz not null default now(),
  unique (filial, etapa, vigente_a_partir)
);

alter table tml_etapa_ideal enable row level security;
drop policy if exists "Acesso total" on tml_etapa_ideal;
create policy "Acesso total" on tml_etapa_ideal for all using (true) with check (true);
