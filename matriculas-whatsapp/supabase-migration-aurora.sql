-- Migração: Aurora — autoatendimento geral via WhatsApp
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Sessão do menu da Aurora: 1 linha por telefone, sempre a mais recente
-- (upsert por telefone). Guarda o passo atual (menu / submenu:<categoria> /
-- aguardando_mapa) enquanto a pessoa navega pelas opções.

create table if not exists aurora_sessoes (
  id uuid primary key default gen_random_uuid(),
  telefone text not null unique,
  estado text not null,
  criado_em timestamptz not null default now()
);

alter table aurora_sessoes enable row level security;
drop policy if exists "Acesso total" on aurora_sessoes;
create policy "Acesso total" on aurora_sessoes for all using (true) with check (true);
