-- Migração: conferência de reposições antes do envio para o grupo de validação.
-- Guarda o produto correto informado pelo revisor quando o tipo é "inversão"
-- (ex.: motorista pediu troca de GCA LATA, na verdade era GCA DIET).
-- Execute no SQL Editor do Supabase. Idempotente.

alter table reposicoes add column if not exists produto_invertido text;
alter table reposicoes add column if not exists conferida_em timestamptz;
