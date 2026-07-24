-- Migração: baia "pulada" na Conferência Digital (baia segregada, volume
-- grande demais, carro da blitz etc. — o ajudante finaliza sem conferir
-- item a item). Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE conferencia_baias ADD COLUMN IF NOT EXISTS motivo_pulada TEXT;
