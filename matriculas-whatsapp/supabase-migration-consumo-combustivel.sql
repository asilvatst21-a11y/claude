-- Consumo de Combustível: ranking de Km/L por motorista, cruzando o
-- relatório de abastecimento (cartão combustível) com o Boletim do Veículo
-- (telemetria/rastreador). Os caminhões são compartilhados (vários
-- motoristas por placa), então o ranking usa a telemetria diária (motorista
-- identificado por CPF a cada dia) em vez de "km desde o último
-- abastecimento" — essa segunda conta km de quem mais dirigiu a mesma
-- placa entre um abastecimento e outro, não só de quem pagou a bomba.
-- O cartão combustível segue como fonte de custo (R$/litro) e de meta de
-- Km/Litro por modelo de veículo.

create table if not exists combustivel_abastecimentos (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  numero_abastecimento text not null,
  motorista text,
  cpf_motorista text,
  matricula text,
  perfil text,
  placa text not null,
  data date not null,
  hora text,
  combustivel text,
  valor_pago numeric,
  litros numeric,
  km_rodado numeric,
  km_litro numeric,
  meta_km_litro numeric,
  modelo_veiculo text,
  marca_veiculo text,
  centro_custo text,
  posto text,
  preco_litro_pago numeric,
  importado_em timestamptz not null default now(),
  unique (filial, numero_abastecimento)
);
create index if not exists idx_combustivel_abastecimentos_filial_data on combustivel_abastecimentos(filial, data);
create index if not exists idx_combustivel_abastecimentos_placa on combustivel_abastecimentos(filial, placa);

create table if not exists frota_telemetria_diaria (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  placa text not null,
  dia date not null,
  motoristas_raw text,
  distancia_percorrida numeric,
  consumo_combustivel_litros numeric,
  media_consumo_kml numeric,
  hodometro_inicial numeric,
  hodometro_final numeric,
  parado_ligado_segundos integer,
  excesso_velocidade integer,
  aceleracao_brusca integer,
  frenagem_brusca integer,
  curva_brusca integer,
  importado_em timestamptz not null default now(),
  unique (filial, placa, dia)
);
create index if not exists idx_frota_telemetria_diaria_filial_dia on frota_telemetria_diaria(filial, dia);

-- Distância diária real (GEOTAB, "Relatório detalhado de viagens" — soma
-- das viagens do dia por placa) para veículos que o Boletim do Veículo não
-- rastreia. Sem litros por dia, então o Km/L desses veículos não vem
-- diário como o Boletim — é calculado por INTERVALO ENTRE ABASTECIMENTOS
-- (km real do intervalo, via soma da distância diária aqui ÷ litros do
-- abastecimento que fechou o intervalo), e cada dia do intervalo herda
-- esse Km/L do intervalo, atribuído ao motorista do dia via Escala do dia.
create table if not exists frota_distancia_diaria_geotab (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  placa text not null,
  dia date not null,
  distancia_km numeric,
  importado_em timestamptz not null default now(),
  unique (filial, placa, dia)
);
create index if not exists idx_frota_distancia_diaria_geotab_filial_dia on frota_distancia_diaria_geotab(filial, dia);

alter table combustivel_abastecimentos enable row level security;
drop policy if exists "Acesso total" on combustivel_abastecimentos;
create policy "Acesso total" on combustivel_abastecimentos for all using (true) with check (true);
grant select, insert, update on combustivel_abastecimentos to anon, authenticated;

alter table frota_telemetria_diaria enable row level security;
drop policy if exists "Acesso total" on frota_telemetria_diaria;
create policy "Acesso total" on frota_telemetria_diaria for all using (true) with check (true);
grant select, insert, update on frota_telemetria_diaria to anon, authenticated;

alter table frota_distancia_diaria_geotab enable row level security;
drop policy if exists "Acesso total" on frota_distancia_diaria_geotab;
create policy "Acesso total" on frota_distancia_diaria_geotab for all using (true) with check (true);
grant select, insert, update on frota_distancia_diaria_geotab to anon, authenticated;
