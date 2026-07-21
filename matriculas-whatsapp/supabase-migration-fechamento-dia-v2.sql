-- Migração: Fechamento do Dia — TML vira "pior caso do dia" (v2)
-- Execute DEPOIS de supabase-migration-fechamento-dia.sql. Idempotente.
--
-- O KPI de TML deixou de ser a média da sala e passou a ser o motorista que
-- saiu mais tarde no dia (pior caso), contra a mesma meta de 30min já usada
-- na análise de Carta de Controle TML. Esta coluna guarda o nome desse
-- motorista (ou "Nome (Colorado)"/"Nome (Sub-Fúria)" no caso do CDD).

alter table fechamento_dia_valores add column if not exists detalhe text;
