-- Migração: TML — Rename salas (INT/PET → COLORADO/SUB-FURIA) e novo roster motorista/sala
-- Execute no SQL Editor do Supabase.

-- 1. Remove constraints que bloqueariam a tradução de dados
ALTER TABLE supervisores_tml DROP CONSTRAINT IF EXISTS supervisores_tml_sala_check;
ALTER TABLE alertas_tml DROP CONSTRAINT IF EXISTS alertas_tml_sala_check;

-- 2. Traduz dados existentes: INT → COLORADO, PET → SUB-FURIA
UPDATE supervisores_tml SET sala = 'COLORADO' WHERE sala = 'INT';
UPDATE supervisores_tml SET sala = 'SUB-FURIA' WHERE sala = 'PET';
UPDATE alertas_tml SET sala = 'COLORADO' WHERE sala = 'INT';
UPDATE alertas_tml SET sala = 'SUB-FURIA' WHERE sala = 'PET';

-- 3. Remove coluna sala de escalas_tml (sala agora vem de motoristas_sala_tml)
ALTER TABLE escalas_tml DROP COLUMN IF EXISTS sala;

-- 4. Adiciona novos CHECK constraints com os valores corretos
ALTER TABLE supervisores_tml ADD CONSTRAINT supervisores_tml_sala_check
  CHECK (sala IN ('COLORADO', 'SUB-FURIA'));

ALTER TABLE alertas_tml ADD CONSTRAINT alertas_tml_sala_check
  CHECK (sala IN ('COLORADO', 'SUB-FURIA'));

-- 4b. Matrículas podem exceder o limite de INTEGER (~2,1 bi) — usar BIGINT
ALTER TABLE escalas_tml ALTER COLUMN matricula TYPE BIGINT;
ALTER TABLE saidas_tml  ALTER COLUMN matricula TYPE BIGINT;
ALTER TABLE alertas_tml ALTER COLUMN matricula TYPE BIGINT;

-- 5. Cria nova tabela motoristas_sala_tml
CREATE TABLE IF NOT EXISTS motoristas_sala_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  matricula BIGINT NOT NULL,
  nome TEXT NOT NULL,
  sala TEXT NOT NULL CHECK (sala IN ('COLORADO', 'SUB-FURIA')),
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, matricula)
);

-- 5b. Garante BIGINT mesmo se a tabela já existia com INTEGER
ALTER TABLE motoristas_sala_tml ALTER COLUMN matricula TYPE BIGINT;

-- 6. Índices
CREATE INDEX IF NOT EXISTS idx_motoristas_sala_tml_filial_matricula
  ON motoristas_sala_tml(filial, matricula);
CREATE INDEX IF NOT EXISTS idx_motoristas_sala_tml_filial_sala
  ON motoristas_sala_tml(filial, sala);

-- 7. RLS
ALTER TABLE motoristas_sala_tml ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON motoristas_sala_tml;
CREATE POLICY "Acesso total" ON motoristas_sala_tml FOR ALL USING (true);
