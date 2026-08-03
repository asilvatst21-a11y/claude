-- Migração: notificação por WhatsApp do responsável + acompanhamento de
-- efetividade do DTO.
--
-- 1) Telefone do responsável (para poder notificar).
-- 2) dto_solicitacoes passa a cobrir também os pedidos feitos direto no
--    Calendário (atividade vencida/a vencer, sem colaborador específico) —
--    por isso colaborador_nome fica opcional e ganha uma coluna própria pra
--    apontar a atividade, além de "origem" pra diferenciar os dois casos.
-- 3) Campos de notificação (quando foi avisado) e efetividade (avaliação da
--    liderança depois que o DTO é realizado).
--
-- Execute no SQL Editor do Supabase, depois de supabase-migration-dto-solicitacoes.sql.
-- Idempotente.

alter table dto_avaliadores add column if not exists telefone text;

alter table dto_solicitacoes alter column colaborador_nome drop not null;

alter table dto_solicitacoes add column if not exists dto_atividade_id uuid references dto_atividades(id);

alter table dto_solicitacoes add column if not exists origem text not null default 'relato';
alter table dto_solicitacoes drop constraint if exists dto_solicitacoes_origem_check;
alter table dto_solicitacoes add constraint dto_solicitacoes_origem_check check (origem in ('relato', 'calendario'));

alter table dto_solicitacoes add column if not exists notificado_em timestamptz;

alter table dto_solicitacoes add column if not exists efeito text not null default 'pendente';
alter table dto_solicitacoes drop constraint if exists dto_solicitacoes_efeito_check;
alter table dto_solicitacoes add constraint dto_solicitacoes_efeito_check check (efeito in ('pendente', 'positivo', 'negativo'));

alter table dto_solicitacoes add column if not exists observacao_efeito text;
