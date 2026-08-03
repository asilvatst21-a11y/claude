-- Migração: reestruturação do Gerenciador de DTO
--
-- 1) O responsável deixa de ser obrigatório/fixo por atividade (dto_atividades.responsavel
--    já era nullable — nada muda no schema aqui, só no formulário). Cada DTO agendado a
--    partir de um desvio escolhe o responsável na hora, dinamicamente.
-- 2) Nova tabela dto_solicitacoes: quando um relato é classificado como "Ato Inseguro" E
--    tem a Tarefa Segurança preenchida, o sistema sugere abrir um DTO para aquele
--    colaborador. A sugestão é só calculada em tela (não grava nada sozinha) — só vira
--    linha aqui quando alguém confirma (com os campos já editados) ou descarta.
--    Isso acontece independente de já existir Fluxo Punitivo pro mesmo desvio — os dois
--    processos continuam sem se bloquear.
--
-- Execute no SQL Editor do Supabase. Idempotente.

create table if not exists dto_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  relato_id uuid references relatos(id),
  colaborador_nome text not null,
  area text,
  atividade text,
  tarefa_seguranca text,
  motivo text,
  responsavel text,
  data_prevista date,
  status text not null default 'pendente' check (status in ('pendente', 'agendado', 'concluido', 'descartado')),
  registrado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (relato_id)
);

create index if not exists dto_solicitacoes_filial_status_idx on dto_solicitacoes(filial, status);

alter table dto_solicitacoes enable row level security;
drop policy if exists "acesso total" on dto_solicitacoes;
create policy "acesso total" on dto_solicitacoes for all to anon, authenticated using (true) with check (true);
grant select, insert, update, delete on dto_solicitacoes to anon, authenticated;
