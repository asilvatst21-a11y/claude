-- Migração: segunda matrícula de motorista na fixação de placa
-- Execute no SQL Editor do Supabase.

-- Algumas placas têm dois motoristas fixados (ex.: revezamento de turno).
-- Esta coluna registra a matrícula do segundo motorista, em complemento a
-- matricula_motorista (primeiro motorista).
ALTER TABLE frota_placas ADD COLUMN IF NOT EXISTS matricula_motorista_2 TEXT;
