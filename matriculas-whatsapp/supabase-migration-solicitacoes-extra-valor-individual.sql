-- Migração: valores individuais por motorista/ajudante na Solicitação Extra
-- Execute no SQL Editor do Supabase (depois de supabase-migration-solicitacoes-extra.sql).

alter table solicitacoes_extra add column if not exists valor_motorista numeric;
alter table solicitacoes_extra add column if not exists valor_ajudante1 numeric;
alter table solicitacoes_extra add column if not exists valor_ajudante2 numeric;
