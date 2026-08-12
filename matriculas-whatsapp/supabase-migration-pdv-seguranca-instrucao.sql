-- Coluna "instrucao_registrada" da planilha de origem (ao lado de
-- relato_motorista) — usada na lista aberta de relatos do PDV Crítico.

ALTER TABLE pdv_seguranca_relatos ADD COLUMN IF NOT EXISTS instrucao_registrada TEXT;
