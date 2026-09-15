-- Apuração de KM de transporte — substitui a planilha mensal "Apuração de KM"
-- (roteirizador x telemetria x teto contratual) por tabelas + regras de
-- cálculo versionadas. Ver src/lib/kmApuracao/*.

-- 1) Um registro por importação de competência (mês). A idempotência de
-- reimportar a mesma competência não vem de UNIQUE aqui — vem da chave
-- natural de "trips" (upsert por filial+mapa+placa+saida_em). Esta tabela só
-- evita acumular um batch novo a cada reimportação do mesmo mês.
create table if not exists km_import_batches (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  competencia text not null, -- 'YYYY-MM'
  arquivo_nome text,
  total_linhas int not null default 0,
  total_calculadas int not null default 0,
  status text not null default 'processando'
    check (status in ('processando', 'concluido', 'com_pendencias', 'erro')),
  pendencias jsonb not null default '[]'::jsonb, -- ver km_validacao.ts — lista de {codigo, descricao, quantidade}
  importado_por text,
  importado_em timestamptz not null default now(),
  unique (filial, competencia)
);

alter table km_import_batches enable row level security;
drop policy if exists "Acesso total" on km_import_batches;
create policy "Acesso total" on km_import_batches for all using (true) with check (true);

-- 2) Cadastro de CDD + transportadora — a combinação que forma a unidade de
-- apuração. Viagem no escopo cujo par (cdd, transportadora) não está aqui é
-- sinalizada na validação (era a causa raiz de o indicador oficial divergir
-- da planilha: o CDD "sumia" da Visão_Km sem ninguém perceber).
create table if not exists km_cdd_catalog (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  cdd_codigo text not null,
  cdd_nome text,
  transportadora text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (filial, cdd_codigo, transportadora)
);

alter table km_cdd_catalog enable row level security;
drop policy if exists "Acesso total" on km_cdd_catalog;
create policy "Acesso total" on km_cdd_catalog for all using (true) with check (true);

-- 3) Teto de KM por mapa, com vigência por data — sem isso, reapurar um mês
-- passado mudaria de resultado toda vez que o teto atual for atualizado.
create table if not exists km_max (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  mapa bigint not null,
  km_maximo numeric not null,
  vigente_a_partir date not null,
  criado_em timestamptz not null default now(),
  unique (filial, mapa, vigente_a_partir)
);

create index if not exists km_max_filial_mapa_vigencia_idx
  on km_max (filial, mapa, vigente_a_partir desc);

alter table km_max enable row level security;
drop policy if exists "Acesso total" on km_max;
create policy "Acesso total" on km_max for all using (true) with check (true);

-- 4) Parâmetros de cálculo versionados — nunca hardcoded (limiar de
-- aderência baixa, peso do mapa virado, custo por km do impacto financeiro).
create table if not exists km_rules_config (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  limite_aderencia_baixa numeric not null default 0.5,
  peso_mapa_virado_telemetria numeric not null default 0.5,
  custo_por_km numeric not null default 0,
  vigente_a_partir date not null,
  criado_em timestamptz not null default now(),
  unique (filial, vigente_a_partir)
);

alter table km_rules_config enable row level security;
drop policy if exists "Acesso total" on km_rules_config;
create policy "Acesso total" on km_rules_config for all using (true) with check (true);

-- 5) Uma linha por viagem importada. Chave natural = mapa + placa + saída
-- (horário programado pelo roteirizador, "hr_sai_2artq" na planilha — é o
-- único horário de saída que sempre existe, mesmo sem telemetria).
create table if not exists km_trips (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid references km_import_batches(id) on delete set null,
  filial text not null,
  competencia text not null, -- 'YYYY-MM', derivado de "data"
  data date not null, -- data final da viagem — usada na vigência de km_max/km_rules_config
  mapa bigint,
  placa text,
  saida_em timestamptz not null,

  cdd_codigo text,
  cdd_nome text,
  transportadora text,
  regiao text,

  tipo_entrega text,
  tipo_carga text,
  tipo_frota text,
  tipo_combustivel text,
  classificacao_extra text, -- "classificacao_roadshow" na planilha: dimensão auxiliar, NÃO usada no escopo

  km_roteirizador numeric,
  km_telemetria numeric,
  km_maximo_origem numeric, -- teto que já vinha na própria linha importada, antes de resolver por vigência
  aderencia numeric,

  mapa_virado boolean not null default false,
  entrega_d_mais_1 boolean not null default false,
  carregamento_roteirizador_em timestamptz,
  carregamento_telemetria_em timestamptz,
  saida_telemetria_em timestamptz,
  entrada_em timestamptz,
  entrada_telemetria_em timestamptz,

  entrada_valida boolean not null default true, -- false = algum campo numérico veio ilegível na origem (→ regra "erro de dado")

  linha_origem jsonb, -- linha bruta do Excel, para auditoria (colunas de trabalho da planilha não modeladas)
  importado_em timestamptz not null default now(),

  unique (filial, mapa, placa, saida_em)
);

create index if not exists km_trips_filial_competencia_idx on km_trips (filial, competencia);
create index if not exists km_trips_filial_cdd_competencia_idx on km_trips (filial, cdd_codigo, competencia);
create index if not exists km_trips_import_batch_idx on km_trips (import_batch_id);

alter table km_trips enable row level security;
drop policy if exists "Acesso total" on km_trips;
create policy "Acesso total" on km_trips for all using (true) with check (true);

-- 6) Resultado da apuração por viagem — 1:1 com km_trips. Guarda a regra
-- aplicada e as entradas usadas no cálculo, para poder explicar o resultado
-- depois sem reprocessar o import inteiro.
create table if not exists km_trip_results (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references km_trips(id) on delete cascade,

  km_considerado numeric not null,
  regra_aplicada text not null check (regra_aplicada in (
    '0_erro_dado', '1_sem_roteirizador', '2_mapa_virado', '3_sem_telemetria',
    '4_telemetria_acima_maximo', '5_aderencia_baixa', '6_aderencia_ponderada'
  )),
  teto_aplicado boolean not null default false,
  km_maximo_usado numeric,
  delta_km numeric, -- km_considerado - km_roteirizador
  delta_pct numeric,

  dentro_do_escopo boolean not null,
  motivo_fora_escopo text,
  cdd_cadastrado boolean not null default true, -- false = par cdd/transportadora fora de km_cdd_catalog

  entradas_calculo jsonb not null, -- {kmRoteirizador, kmTelemetria, kmMaximo, aderencia, mapaVirado, ...} no momento do cálculo
  calculado_em timestamptz not null default now(),

  unique (trip_id)
);

create index if not exists km_trip_results_regra_idx on km_trip_results (regra_aplicada);
create index if not exists km_trip_results_escopo_idx on km_trip_results (dentro_do_escopo);

alter table km_trip_results enable row level security;
drop policy if exists "Acesso total" on km_trip_results;
create policy "Acesso total" on km_trip_results for all using (true) with check (true);
