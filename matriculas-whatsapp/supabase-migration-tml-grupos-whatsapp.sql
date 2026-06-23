-- Migração: grupos de WhatsApp para os resumos de TML.
-- Execute no SQL Editor do Supabase. Idempotente.
--
--   • grupo_tml_diario_whatsapp    → resumo automático a cada importação de saída
--   • grupo_tml_gerencia_whatsapp  → resumo final do dia, disparado manualmente

alter table filiais add column if not exists grupo_tml_diario_whatsapp   text;
alter table filiais add column if not exists grupo_tml_gerencia_whatsapp text;
