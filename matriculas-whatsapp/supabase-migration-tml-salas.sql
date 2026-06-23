-- Migração: TML — Rename salas (INT/PET → COLORADO/SUB-FURIA) e novo roster motorista/sala
-- Execute no SQL Editor do Supabase.
-- Idempotente: funciona tanto se for a primeira vez quanto se a tabela motoristas_sala_tml já exista.

-- PASSO 1: Remover constraints antigos (para permitir tradução de dados)
-- escalas_tml: drop constraint na sala se existir
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'escalas_tml'::regclass AND contype = 'c' AND conname ~ 'sala';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE escalas_tml DROP CONSTRAINT %I CASCADE', c); END IF;
END $$;

-- supervisores_tml: drop constraint na sala se existir
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'supervisores_tml'::regclass AND contype = 'c' AND conname ~ 'sala';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE supervisores_tml DROP CONSTRAINT %I CASCADE', c); END IF;
END $$;

-- alertas_tml: drop constraint na sala se existir
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'alertas_tml'::regclass AND contype = 'c' AND conname ~ 'sala';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE alertas_tml DROP CONSTRAINT %I CASCADE', c); END IF;
END $$;

-- PASSO 2: Traduzir dados existentes: INT → COLORADO, PET → SUB-FURIA
UPDATE supervisores_tml SET sala = 'COLORADO' WHERE sala = 'INT';
UPDATE supervisores_tml SET sala = 'SUB-FURIA' WHERE sala = 'PET';
UPDATE alertas_tml SET sala = 'COLORADO' WHERE sala = 'INT';
UPDATE alertas_tml SET sala = 'SUB-FURIA' WHERE sala = 'PET';

-- PASSO 3: Atualizar estrutura das tabelas
-- escalas_tml: remover coluna sala inteiramente (vem da tabela motoristas_sala_tml por matrícula)
ALTER TABLE escalas_tml DROP COLUMN IF EXISTS sala;

-- PASSO 4: Adicionar novos CHECK constraints
ALTER TABLE supervisores_tml ADD CONSTRAINT supervisores_tml_sala_check
  CHECK (sala IN ('COLORADO', 'SUB-FURIA'));

ALTER TABLE alertas_tml ADD CONSTRAINT alertas_tml_sala_check
  CHECK (sala IN ('COLORADO', 'SUB-FURIA'));

-- 3. Criar nova tabela motoristas_sala_tml
CREATE TABLE IF NOT EXISTS motoristas_sala_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  matricula INTEGER NOT NULL,
  nome TEXT NOT NULL,
  sala TEXT NOT NULL CHECK (sala IN ('COLORADO', 'SUB-FURIA')),
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, matricula)
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_motoristas_sala_tml_filial_matricula
  ON motoristas_sala_tml(filial, matricula);
CREATE INDEX IF NOT EXISTS idx_motoristas_sala_tml_filial_sala
  ON motoristas_sala_tml(filial, sala);

-- RLS: acesso total (anon)
ALTER TABLE motoristas_sala_tml ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON motoristas_sala_tml;
CREATE POLICY "Acesso total" ON motoristas_sala_tml FOR ALL USING (true);
