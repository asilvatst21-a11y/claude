-- Migração: Fluxo Punitivo (entradas manuais e fonte única de histórico)
-- Execute no SQL Editor do Supabase

create table if not exists fluxo_punitivo (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  colaborador_nome text not null,
  origem text not null default 'Manual',   -- 'GSDPQ' | 'Relatos' | 'Telemetria' | 'DTO' | 'Grupo' | 'Manual'
  tipo_acao text,                           -- 'Advertência Verbal' | 'DTO' | 'Advertência Escrita' | 'Suspensão' | null quando pendente
  dias_suspensao int,
  data_acao date,
  observacao text,
  registrado_por text,
  source_id text,                           -- id do registro de origem (opcional)
  status text not null default 'Concluido', -- 'Solicitado' | 'Concluido'
  motivo text,
  created_at timestamptz not null default now()
);

alter table fluxo_punitivo enable row level security;
create policy "Acesso total" on fluxo_punitivo for all using (true);

create index if not exists idx_fluxo_filial  on fluxo_punitivo(filial);
create index if not exists idx_fluxo_colab   on fluxo_punitivo(filial, colaborador_nome);
create index if not exists idx_fluxo_origem  on fluxo_punitivo(filial, origem);

-- Se a tabela já existia sem as novas colunas, adicione-as:
ALTER TABLE fluxo_punitivo
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Concluido',
  ADD COLUMN IF NOT EXISTS motivo TEXT,
  ADD COLUMN IF NOT EXISTS data_infracao DATE;

ALTER TABLE fluxo_punitivo
  ALTER COLUMN tipo_acao DROP NOT NULL;

-- ID do grupo WhatsApp do fluxo punitivo por filial (Z-API)
-- Formato Z-API: "120363019502650977-group" (use o botão "Buscar grupos" no Admin)
ALTER TABLE filiais
  ADD COLUMN IF NOT EXISTS grupo_fluxo_whatsapp TEXT;

-- ───────────────────────────────────────────────────────────────────────────
-- Solicitação de fluxo pelo grupo WhatsApp (webhook Z-API, confirmação 2 passos)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists fluxo_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  grupo_id text not null,
  colaborador_nome text not null,
  motivo text not null,
  data_acao date,                               -- data enviada na mensagem (opcional)
  solicitante_nome text,
  solicitante_telefone text,
  status text not null default 'aguardando',   -- 'aguardando' | 'confirmado' | 'cancelado'
  fluxo_id uuid,                                -- id gerado em fluxo_punitivo após o SIM
  created_at timestamptz not null default now()
);

alter table fluxo_confirmacoes enable row level security;
create policy "Acesso total" on fluxo_confirmacoes for all using (true);

create index if not exists idx_fconf_grupo on fluxo_confirmacoes(grupo_id, status);

-- Se a tabela já existia sem data_acao, adicione a coluna:
ALTER TABLE fluxo_confirmacoes
  ADD COLUMN IF NOT EXISTS data_acao DATE;
