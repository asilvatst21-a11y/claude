-- Migração: Dúvidas da Matinal — ajustes (v2)
-- Execute no SQL Editor do Supabase DEPOIS de supabase-migration-treinamentos-matinal.sql. Idempotente.
--
--  1. Um treinamento agora pode atender as DUAS salas ao mesmo tempo (a FAQ é
--     compartilhada entre as salas que o recebem).
--  2. Data do treinamento no cadastro — o Timer da Matinal só lista os
--     treinamentos programados para o dia da matinal (evita ambiguidade).
--  3. Sessão de pré-seleção de tema: se o colaborador perguntar fora da
--     janela do aviso do dia, o bot pergunta sobre qual treinamento é a
--     dúvida antes de responder.
--  4. Grupo de WhatsApp por sala, pra avisar todo mundo (além da mensagem
--     individual) direcionando pra conversa particular com o bot.

-- 1) Várias salas por treinamento ───────────────────────────────────────────
alter table treinamentos_matinal add column if not exists salas text[] not null default '{}';
update treinamentos_matinal set salas = array[sala] where salas = '{}' and sala is not null;
alter table treinamentos_matinal drop constraint if exists treinamentos_matinal_sala_check;
alter table treinamentos_matinal drop column if exists sala;
create index if not exists idx_treinamentos_matinal_salas on treinamentos_matinal using gin (salas);

-- 2) Data do treinamento ─────────────────────────────────────────────────────
alter table treinamentos_matinal add column if not exists data_treinamento date not null default current_date;
create index if not exists idx_treinamentos_matinal_data on treinamentos_matinal (filial, data_treinamento, status);

-- 3) Sessão de pré-seleção de tema (dúvida fora da janela do aviso do dia) ───
create table if not exists matinal_duvida_sessoes (
  id uuid primary key default gen_random_uuid(),
  colaborador_telefone text not null,
  colaborador_nome text,
  treinamento_id uuid references treinamentos_matinal(id),
  -- escolhendo_tema | aguardando_pergunta
  estado text not null default 'escolhendo_tema',
  created_at timestamptz not null default now()
);
create index if not exists idx_matinal_duvida_sessoes_telefone
  on matinal_duvida_sessoes (colaborador_telefone, created_at);

alter table matinal_duvida_sessoes enable row level security;
drop policy if exists "Acesso total" on matinal_duvida_sessoes;
create policy "Acesso total" on matinal_duvida_sessoes for all using (true) with check (true);

-- 4) Grupo de WhatsApp por sala (aviso coletivo direcionando pro privado) ───
alter table filiais add column if not exists grupo_matinal_colorado_whatsapp text;
alter table filiais add column if not exists grupo_matinal_subfuria_whatsapp text;
