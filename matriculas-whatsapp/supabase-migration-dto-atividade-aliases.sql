-- Migração: Apelidos de atividade do Gerenciador de DTOs
-- Execute no SQL Editor do Supabase
--
-- Mapeia nomes divergentes vindos das observações importadas (acento/grafia
-- diferente, ex.: "PROCESSO DO REPACK") para o nome oficial cadastrado em
-- dto_atividades (ex.: "PROCESSO DE REPACK"), para que essas observações
-- entrem nos cálculos de risco e vencimento da atividade correta.

create table if not exists dto_atividade_aliases (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  alias text not null,              -- nome como aparece na observação importada
  nome_atividade text not null,     -- nome oficial cadastrado em dto_atividades
  created_at timestamptz not null default now(),
  unique(filial, alias)
);

alter table dto_atividade_aliases enable row level security;
create policy "Acesso total" on dto_atividade_aliases for all using (true);
create index if not exists idx_dto_alias_filial on dto_atividade_aliases(filial);
