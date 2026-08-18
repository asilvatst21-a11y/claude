-- IV - AL (Apoio Logístico): trocas de placa entre a fase "Gerado" e a fase
-- "Carregado" do mapa, no 03.11.20 — sinal de troca de veículo por
-- manutenção durante o carregamento. Ignora placas CRW (reserva) e REC
-- (recarga/2ª viagem), que trocam de placa naturalmente.
create table if not exists frota_iv_al_trocas_placa (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  mapa bigint not null,
  data date,
  placa_gerado text not null,
  placa_carregado text not null,
  importado_em timestamptz not null default now(),
  unique (filial, mapa)
);

create index if not exists frota_iv_al_trocas_placa_filial_data_idx
  on frota_iv_al_trocas_placa (filial, data);
