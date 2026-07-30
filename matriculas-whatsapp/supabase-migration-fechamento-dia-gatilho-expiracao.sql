-- Migração: sala + prazo de resposta nas pendências de bate-papo do Farol.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- 1) "sala" grava direto na pendência (vem do Farol no momento da geração)
--    pra permitir avisar o supervisor da sala certa sem precisar reconstruir
--    esse vínculo depois (mapa_equipe/motoristas_sala_tml não bastam sozinhos).
-- 2) "expira_em" é o prazo de resposta do colaborador: até 15h de Brasília
--    do dia SEGUINTE ao fechamento (ver prazoRespostaGatilho em
--    src/lib/fechamentoDia.ts). Passado isso, nem clique no botão nem
--    resposta em texto/áudio são mais aceitos — status vira 'expirado'.

ALTER TABLE fechamento_dia_gatilho_pendencias ADD COLUMN IF NOT EXISTS sala TEXT;
ALTER TABLE fechamento_dia_gatilho_pendencias ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ;

ALTER TABLE fechamento_dia_gatilho_pendencias DROP CONSTRAINT IF EXISTS fechamento_dia_gatilho_pendencias_status_check;
ALTER TABLE fechamento_dia_gatilho_pendencias ADD CONSTRAINT fechamento_dia_gatilho_pendencias_status_check
  CHECK (status IN ('aguardando', 'coletando', 'respondido', 'expirado'));
