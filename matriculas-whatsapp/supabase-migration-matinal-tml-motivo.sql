-- Migração: motivo do estouro de tempo da matinal.
-- Execute no SQL Editor do Supabase. Idempotente.

alter table matinal_tml add column if not exists motivo_estouro text;
