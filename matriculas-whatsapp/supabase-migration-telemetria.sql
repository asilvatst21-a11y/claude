-- Migração: módulo Telemetria
-- Execute no SQL Editor do Supabase

create table if not exists telemetria_alertas (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  placa text not null,
  prefixo text,
  motorista text,
  motorista_identificado text,      -- identificação manual para "Sem Identificação"
  cpf text,
  uo text,
  tipo text not null,               -- CURVA_BRUSCA | FREADA_BRUSCA | EXCESSO_VELOCIDADE_POR_VIA
  nivel text,                       -- BAIXO | MEDIO | ALTO | N/A
  limiar_raw text,                  -- valor bruto: "40 Km/h" ou "0.46875 G"
  excesso_raw text,                 -- valor bruto: "50 Km/h" ou "0.78 G"
  limiar_km numeric,                -- km/h parseado (null para G-force)
  excesso_km numeric,               -- km/h parseado (null para G-force)
  duracao_seg int,                  -- duração em segundos
  ponto_referencia text,
  categoria text,
  logradouro text,
  cidade text,
  estado text,
  latitude numeric,
  longitude numeric,
  data_hora timestamptz,
  status text,
  integrador text,
  alerta_desconsiderado text,
  qualifica_acao boolean not null default false,
  created_at timestamptz not null default now(),
  unique(filial, placa, data_hora, tipo)
);

alter table telemetria_alertas enable row level security;
create policy "Acesso total" on telemetria_alertas for all using (true);

create index if not exists idx_tel_filial     on telemetria_alertas(filial);
create index if not exists idx_tel_motorista  on telemetria_alertas(filial, motorista);
create index if not exists idx_tel_placa      on telemetria_alertas(filial, placa);
create index if not exists idx_tel_tipo       on telemetria_alertas(filial, tipo);
create index if not exists idx_tel_data       on telemetria_alertas(filial, data_hora desc);
create index if not exists idx_tel_qualifica  on telemetria_alertas(filial, qualifica_acao);

create table if not exists telemetria_acoes (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  alerta_id uuid references telemetria_alertas(id) on delete cascade,
  placa text not null,
  motorista text not null,
  tipo_acao text not null,
  dias_suspensao int,
  observacao text,
  registrado_por text,
  created_at timestamptz not null default now(),
  unique(alerta_id)
);

alter table telemetria_acoes enable row level security;
create policy "Acesso total" on telemetria_acoes for all using (true);

create index if not exists idx_tel_acoes_filial   on telemetria_acoes(filial);
create index if not exists idx_tel_acoes_motorista on telemetria_acoes(filial, motorista);
create index if not exists idx_tel_acoes_alerta   on telemetria_acoes(alerta_id);
