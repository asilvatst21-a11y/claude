-- Migração: Fechamento do Dia — Devolução PDV automática (v4)
-- Execute no SQL Editor do Supabase (depois da v1/v2/v3). Idempotente.
--
-- Devolução PDV deixa de ser 100% manual: o monitoramento sobe o relatório
-- de devolução (mesmo formato da planilha de referência do cliente — 1
-- linha por nota devolvida, com Mapa e Data), o sistema grava a CONTAGEM de
-- devoluções por mapa+dia aqui e cruza com escalas_tml (a base 03.11.49.02,
-- mesma fonte da Carta de Controle TML) pra saber as entregas previstas e a
-- sala de cada mapa — o cálculo final (% por sala/CDD) passa a ser
-- automático, igual Aderência/TML/IV-Deslocamento.

create table if not exists fechamento_dia_devolucoes_pdv (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  mapa bigint not null,
  data date not null,
  devolucoes integer not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (filial, mapa, data)
);
create index if not exists idx_fechamento_dia_devolucoes_pdv_dia
  on fechamento_dia_devolucoes_pdv (filial, data);

alter table fechamento_dia_devolucoes_pdv enable row level security;
drop policy if exists "Acesso total" on fechamento_dia_devolucoes_pdv;
create policy "Acesso total" on fechamento_dia_devolucoes_pdv for all using (true) with check (true);
