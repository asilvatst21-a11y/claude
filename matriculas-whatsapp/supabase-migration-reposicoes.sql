-- Migração: fluxo de Reposições via WhatsApp (grupo de motoristas)
-- Execute no SQL Editor do Supabase.
-- Idempotente e tolerante a tabelas pré-existentes: usa "add column if not exists"
-- para garantir todas as colunas mesmo que as tabelas já tenham sido criadas
-- manualmente com um schema diferente.

-- ── 1. Coluna na filial que identifica o grupo de reposições no WhatsApp ──────
--    (usada pelo webhook api/zapi-webhook.ts para rotear a mensagem e pela tela
--    "Config. WhatsApp" da seção de reposições para salvar o ID do grupo).
alter table filiais add column if not exists grupo_reposicoes_whatsapp text;

-- ── 2. Confirmações pendentes ────────────────────────────────────────────────
--    O motorista manda a mensagem, o bot pergunta "Está correto? SIM/NÃO" e
--    guarda aqui até a resposta (TTL de 60min no código).
create table if not exists reposicao_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table reposicao_confirmacoes add column if not exists filial text;
alter table reposicao_confirmacoes add column if not exists grupo_id text;
alter table reposicao_confirmacoes add column if not exists motorista_telefone text;
alter table reposicao_confirmacoes add column if not exists motorista_nome text;
alter table reposicao_confirmacoes add column if not exists mensagem_original text;
alter table reposicao_confirmacoes add column if not exists codigo_pdv text;
alter table reposicao_confirmacoes add column if not exists mapa text;
alter table reposicao_confirmacoes add column if not exists produto text;
alter table reposicao_confirmacoes add column if not exists quantidade text;
alter table reposicao_confirmacoes add column if not exists tipo_reposicao text;
alter table reposicao_confirmacoes add column if not exists status text not null default 'aguardando';  -- aguardando | confirmado | cancelado
alter table reposicao_confirmacoes add column if not exists created_at timestamptz not null default now();

create index if not exists idx_reposicao_conf_grupo
  on reposicao_confirmacoes(grupo_id, motorista_telefone, status, created_at desc);

-- ── 3. Reposições confirmadas (alimenta a tela /vales/reposicoes) ─────────────
create table if not exists reposicoes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table reposicoes add column if not exists numero text;                       -- REP-AAAAMMDD-NNN
alter table reposicoes add column if not exists motorista_nome text;
alter table reposicoes add column if not exists motorista_telefone text;
alter table reposicoes add column if not exists codigo_pdv text;
alter table reposicoes add column if not exists cliente text;
alter table reposicoes add column if not exists mapa text;
alter table reposicoes add column if not exists produto text;
alter table reposicoes add column if not exists quantidade text;
alter table reposicoes add column if not exists tipo_reposicao text;               -- falta | inversao | avaria | indefinido
alter table reposicoes add column if not exists motivo text;
alter table reposicoes add column if not exists mensagem_original text;
alter table reposicoes add column if not exists status text not null default 'pendente';  -- pendente | validado | negado | quebra
alter table reposicoes add column if not exists validador_resposta text;
alter table reposicoes add column if not exists validado_em timestamptz;
alter table reposicoes add column if not exists created_at timestamptz not null default now();

-- unicidade do número (ignora se a constraint já existir)
do $$ begin
  alter table reposicoes add constraint reposicoes_numero_key unique (numero);
exception when duplicate_table then null; when duplicate_object then null; end $$;

create index if not exists idx_reposicoes_status on reposicoes(status);
create index if not exists idx_reposicoes_numero on reposicoes(numero);

-- ── 4. RLS liberada (mesmo padrão das demais tabelas do projeto) ──────────────
alter table reposicao_confirmacoes enable row level security;
drop policy if exists "Acesso total" on reposicao_confirmacoes;
create policy "Acesso total" on reposicao_confirmacoes for all using (true) with check (true);

alter table reposicoes enable row level security;
drop policy if exists "Acesso total" on reposicoes;
create policy "Acesso total" on reposicoes for all using (true) with check (true);
