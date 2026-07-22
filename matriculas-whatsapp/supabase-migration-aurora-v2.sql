-- Migração: Aurora — contexto da sessão (v2)
-- Execute no SQL Editor do Supabase (depois da supabase-migration-aurora.sql).
-- Idempotente.
--
-- Guarda dados temporários do passo atual (ex.: lista de candidatos pra
-- desambiguar CPF em Pendências/Variável) sem precisar de tabelas novas.

alter table aurora_sessoes add column if not exists contexto jsonb;
