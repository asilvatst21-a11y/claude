-- Migração: quantidade de frota contratada editável, por filial.
-- A "Frota Contratada" hoje é derivada do próprio relatório importado (conta
-- quem não está como "Não Contratada"), mas o relatório às vezes atrasa em
-- refletir a mudança de quinzena (1 e 16), sobrando placas fora do contrato
-- ainda contadas. Essa tabela guarda um valor manual que, quando
-- preenchido, substitui a contagem derivada só no card/percentual da aba
-- Disponibilidade (o restante do painel — matriz, ranking, histórico —
-- continua usando o dado derivado do relatório, sem retroagir).
-- Execute no SQL Editor do Supabase.

create table if not exists frota_meta_contratada (
  filial text primary key,
  quantidade integer not null check (quantidade >= 0),
  atualizado_em timestamptz not null default now()
);

alter table frota_meta_contratada enable row level security;
drop policy if exists "Acesso total" on frota_meta_contratada;
create policy "Acesso total" on frota_meta_contratada for all using (true) with check (true);
