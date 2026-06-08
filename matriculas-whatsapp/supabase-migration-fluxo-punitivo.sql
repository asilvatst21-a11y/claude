-- Migração: Fluxo Punitivo (entradas manuais e fonte única de histórico)
-- Execute no SQL Editor do Supabase

create table if not exists fluxo_punitivo (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  colaborador_nome text not null,
  origem text not null default 'Manual',   -- 'GSDPQ' | 'Relatos' | 'Telemetria' | 'Manual'
  tipo_acao text not null,                  -- 'Advertência Verbal' | 'DTO' | 'Advertência Escrita' | 'Suspensão'
  dias_suspensao int,
  data_acao date,
  observacao text,
  registrado_por text,
  source_id text,                           -- id do registro de origem (opcional)
  created_at timestamptz not null default now()
);

alter table fluxo_punitivo enable row level security;
create policy "Acesso total" on fluxo_punitivo for all using (true);

create index if not exists idx_fluxo_filial  on fluxo_punitivo(filial);
create index if not exists idx_fluxo_colab   on fluxo_punitivo(filial, colaborador_nome);
create index if not exists idx_fluxo_origem  on fluxo_punitivo(filial, origem);
