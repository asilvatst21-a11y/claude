-- Migração: exclusões permanentes de checklist_tml (Deslocamento).
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Excluir um registro na tela "Corrigir registros de Deslocamento" apaga a
-- linha de checklist_tml, mas sozinho isso não impede que ela volte: o
-- import da planilha (Distribuição TML) faz upsert por (filial, mapa, data)
-- e recria o registro se a mesma linha aparecer de novo num reimport. Esta
-- tabela guarda a "lista negra" de (filial, mapa, data) que já foi excluída
-- por ser erro de leitura/digitação — o import consulta essa lista antes de
-- gravar e pula qualquer linha que já tenha sido excluída, mesmo que a
-- planilha reimportada ainda traga o mesmo erro.

create table if not exists checklist_tml_exclusoes (
  id bigserial primary key,
  filial text not null,
  mapa bigint not null,
  data date not null,
  excluido_em timestamptz not null default now(),
  excluido_por text,
  unique (filial, mapa, data)
);
create index if not exists idx_checklist_tml_exclusoes_filial on checklist_tml_exclusoes(filial);

alter table checklist_tml_exclusoes enable row level security;
drop policy if exists "Acesso total" on checklist_tml_exclusoes;
create policy "Acesso total" on checklist_tml_exclusoes for all using (true);
