-- Migração: Fechamento do Dia — Jornada Líquida automática + Devolução PDV
-- via 03.11.49.02 (v5)
-- Execute no SQL Editor do Supabase (depois da v1/v2/v3/v4). Idempotente.
--
-- O relatório 03.11.49.02 (Mapa, Data Entrega, Placa, Motorista, MPD, Hora
-- MPD, Entregas) passa a ser subido na tela de Fechamento do Dia. Com ele:
--   • Jornada Líquida vira automática: "bateu jornada" = MPD = "PC
--     financeira" E Hora MPD <= (início da matinal da sala + 10h20), mesmo
--     limite de JORNADA_LIMITE_MIN usado na Jornada ao vivo. % = mapas que
--     bateram / total de mapas da sala no dia.
--   • Devolução PDV para de depender de escalas_tml — a quantidade de
--     entregas do dia (denominador) já vem dessa mesma planilha, cruzada por
--     mapa com a contagem de devoluções (fechamento_dia_devolucoes_pdv).

create table if not exists fechamento_dia_mapas_dia (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  mapa bigint not null,
  data date not null,
  placa text,
  matricula bigint,
  sala text check (sala in ('COLORADO','SUB-FURIA')),
  mpd text,
  hora_mpd text,
  entregas integer,
  bateu_jornada boolean,
  atualizado_em timestamptz not null default now(),
  unique (filial, mapa, data)
);
create index if not exists idx_fechamento_dia_mapas_dia_dia
  on fechamento_dia_mapas_dia (filial, data);

alter table fechamento_dia_mapas_dia enable row level security;
drop policy if exists "Acesso total" on fechamento_dia_mapas_dia;
create policy "Acesso total" on fechamento_dia_mapas_dia for all using (true) with check (true);
