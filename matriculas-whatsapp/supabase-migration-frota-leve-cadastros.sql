-- Migração: cadastros de Veículos e Condutores da Frota Leve + fluxo pergunta-a-pergunta
-- Execute no SQL Editor do Supabase, DEPOIS de supabase-migration-frota-leve.sql. Idempotente.

-- Cadastro de veículos (placas) da frota leve, gerenciado no painel.
create table if not exists frota_leve_veiculos (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  placa text not null,
  modelo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_frota_leve_veiculos_placa on frota_leve_veiculos (filial, placa);

-- Cadastro de condutores da frota leve, gerenciado no painel.
create table if not exists frota_leve_condutores (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  nome text not null,
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_frota_leve_condutores_filial on frota_leve_condutores (filial, ativo);

-- Campos novos na sessão de viagem: condutor/veículo escolhidos, passo atual do
-- diálogo e o telefone de quem está respondendo o bot nesta sessão (pode diferir
-- de quem registrou a saída, no caso do retorno).
alter table frota_leve_saidas
  add column if not exists passo text,
  add column if not exists condutor_id uuid,
  add column if not exists condutor_nome text,
  add column if not exists veiculo_id uuid,
  add column if not exists sessao_telefone text;

create index if not exists idx_frota_leve_sessao_tel
  on frota_leve_saidas (grupo_id, sessao_telefone, status);
