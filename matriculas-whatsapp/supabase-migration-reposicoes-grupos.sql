-- Migração: grupos de solicitação (2) e grupo de validação para o fluxo de reposições.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Modelo de grupos por filial:
--   • grupo_reposicoes_whatsapp      → Grupo de Solicitação 1 (motorista envia/confirma)
--   • grupo_solicitacao_2_whatsapp   → Grupo de Solicitação 2 (motorista envia/confirma)
--   • grupo_validacao_whatsapp       → Grupo de Validação (controle responde OK/NOK)

alter table filiais add column if not exists grupo_solicitacao_2_whatsapp text;
alter table filiais add column if not exists grupo_validacao_whatsapp     text;
