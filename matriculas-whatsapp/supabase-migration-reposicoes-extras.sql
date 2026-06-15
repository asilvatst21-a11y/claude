-- Migração: embalagem (Unidade/Fardo), filial em reposicoes e status "registrado".
-- Execute no SQL Editor do Supabase. Idempotente.

-- Embalagem identificada (ou perguntada) no fluxo do WhatsApp
alter table reposicao_confirmacoes add column if not exists embalagem text;  -- unidade | fardo | indefinido
alter table reposicoes            add column if not exists embalagem text;  -- unidade | fardo | indefinido

-- Filial da reposição (usada no painel para achar o grupo de validação ao reenviar)
alter table reposicoes add column if not exists filial text;

-- Observação: o status "registrado" (Registrado no sistema Ambev) usa a coluna
-- status já existente (text), não precisa de alteração de schema.
