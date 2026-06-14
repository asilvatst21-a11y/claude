-- Migração: fluxo de Reposições via WhatsApp (grupo de motoristas)
-- Execute no SQL Editor do Supabase.
-- Tudo é idempotente (IF NOT EXISTS), então é seguro rodar mesmo que as
-- tabelas já tenham sido criadas manualmente.

-- 1. Coluna na filial que identifica o grupo de reposições no WhatsApp
--    (usada pelo webhook api/zapi-webhook.ts para rotear a mensagem e pela
--    tela "Config. WhatsApp" da seção de reposições para salvar o ID do grupo).
alter table filiais
  add column if not exists grupo_reposicoes_whatsapp text;

-- 2. Confirmações pendentes — o motorista manda a mensagem, o bot pergunta
--    "Está correto? SIM/NÃO" e guarda aqui até a resposta (TTL de 60min no código).
create table if not exists reposicao_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  filial text,
  grupo_id text not null,
  motorista_telefone text,
  motorista_nome text,
  mensagem_original text,
  codigo_pdv text,
  mapa text,
  produto text,
  quantidade text,
  tipo_reposicao text,
  status text not null default 'aguardando',  -- aguardando | confirmado | cancelado
  created_at timestamptz not null default now()
);

create index if not exists idx_reposicao_conf_grupo
  on reposicao_confirmacoes(grupo_id, motorista_telefone, status, created_at desc);

-- 3. Reposições confirmadas — alimenta a tela /vales/reposicoes.
create table if not exists reposicoes (
  id uuid primary key default gen_random_uuid(),
  numero text unique,                          -- REP-AAAAMMDD-NNN
  motorista_nome text,
  motorista_telefone text,
  codigo_pdv text,
  cliente text,
  mapa text,
  produto text,
  quantidade text,
  tipo_reposicao text,                         -- falta | inversao | avaria | indefinido
  motivo text,
  mensagem_original text,
  status text not null default 'pendente',     -- pendente | validado | negado | quebra
  validador_resposta text,
  validado_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_reposicoes_status  on reposicoes(status);
create index if not exists idx_reposicoes_numero  on reposicoes(numero);

-- 4. RLS liberada (mesmo padrão das demais tabelas do projeto)
alter table reposicao_confirmacoes enable row level security;
drop policy if exists "Acesso total" on reposicao_confirmacoes;
create policy "Acesso total" on reposicao_confirmacoes for all using (true) with check (true);

alter table reposicoes enable row level security;
drop policy if exists "Acesso total" on reposicoes;
create policy "Acesso total" on reposicoes for all using (true) with check (true);
