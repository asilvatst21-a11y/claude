-- Migração: guarda o motivo real de falha de envio da Fixação de Motorista.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- "Falha no envio" na tela só mostrava o status, não o motivo — o erro real
-- que a Z-API devolve (ou "nenhum supervisor cadastrado/ativo") era só
-- mostrado uma vez, no alert() do "Forçar envio", e se perdia depois.

ALTER TABLE alertas_fixacao_motorista ADD COLUMN IF NOT EXISTS erro_detalhe TEXT;
