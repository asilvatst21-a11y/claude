-- Migração: Distribuição — Carta de Controle TML (saída na portaria)
-- Execute no SQL Editor do Supabase.
-- Idempotente: funciona tanto em banco novo quanto se as tabelas
-- supervisores_tml/escalas_tml/saidas_tml/alertas_tml já existirem
-- (ex.: vindas do schema antigo do vales-log20, sem a coluna "filial").

CREATE TABLE IF NOT EXISTS supervisores_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  sala TEXT NOT NULL CHECK (sala IN ('INT', 'PET')),
  telefone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escalas_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapa INTEGER NOT NULL,
  sala TEXT NOT NULL CHECK (sala IN ('INT', 'PET')),
  placa TEXT,
  matricula INTEGER,
  data_entrega DATE,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saidas_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapa INTEGER NOT NULL,
  placa TEXT,
  matricula INTEGER,
  data_saida DATE,
  horario_saida TEXT,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alertas_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  mapa INTEGER NOT NULL,
  sala TEXT NOT NULL CHECK (sala IN ('INT', 'PET')),
  placa TEXT,
  matricula INTEGER,
  horario_limite TEXT NOT NULL,
  horario_saida TEXT NOT NULL,
  atraso_minutos INTEGER NOT NULL,
  supervisor_id UUID REFERENCES supervisores_tml(id),
  mensagem_enviada TEXT,
  zapi_message_id TEXT,
  status TEXT CHECK (status IN ('enviado', 'justificado', 'erro')) DEFAULT 'enviado',
  justificativa TEXT,
  justificado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garante a coluna "filial" mesmo em tabelas criadas pelo schema antigo
-- (vales-log20), que não tinham multi-tenant.
ALTER TABLE supervisores_tml ADD COLUMN IF NOT EXISTS filial TEXT;
ALTER TABLE escalas_tml      ADD COLUMN IF NOT EXISTS filial TEXT;
ALTER TABLE saidas_tml       ADD COLUMN IF NOT EXISTS filial TEXT;
ALTER TABLE alertas_tml      ADD COLUMN IF NOT EXISTS filial TEXT;

-- Backfill: registros antigos sem filial ficam associados à primeira filial
-- cadastrada, para não violar o NOT NULL aplicado a seguir.
UPDATE supervisores_tml SET filial = (SELECT nome FROM filiais ORDER BY nome LIMIT 1) WHERE filial IS NULL;
UPDATE escalas_tml      SET filial = (SELECT nome FROM filiais ORDER BY nome LIMIT 1) WHERE filial IS NULL;
UPDATE saidas_tml       SET filial = (SELECT nome FROM filiais ORDER BY nome LIMIT 1) WHERE filial IS NULL;
UPDATE alertas_tml      SET filial = (SELECT nome FROM filiais ORDER BY nome LIMIT 1) WHERE filial IS NULL;

ALTER TABLE supervisores_tml ALTER COLUMN filial SET NOT NULL;
ALTER TABLE escalas_tml      ALTER COLUMN filial SET NOT NULL;
ALTER TABLE saidas_tml       ALTER COLUMN filial SET NOT NULL;
ALTER TABLE alertas_tml      ALTER COLUMN filial SET NOT NULL;

-- escalas_tml/saidas_tml: troca a unicidade de "mapa" (schema antigo) para
-- "(filial, mapa)", já que o mesmo número de mapa pode existir em filiais
-- diferentes.
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'escalas_tml'::regclass AND contype = 'u' AND conname <> 'escalas_tml_filial_mapa_key';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE escalas_tml DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE escalas_tml ADD CONSTRAINT escalas_tml_filial_mapa_key UNIQUE (filial, mapa);

DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'saidas_tml'::regclass AND contype = 'u' AND conname <> 'saidas_tml_filial_mapa_key';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE saidas_tml DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE saidas_tml ADD CONSTRAINT saidas_tml_filial_mapa_key UNIQUE (filial, mapa);

CREATE INDEX IF NOT EXISTS idx_supervisores_tml_filial_sala ON supervisores_tml(filial, sala);
CREATE INDEX IF NOT EXISTS idx_escalas_tml_filial_mapa ON escalas_tml(filial, mapa);
CREATE INDEX IF NOT EXISTS idx_saidas_tml_filial_mapa ON saidas_tml(filial, mapa);
CREATE INDEX IF NOT EXISTS idx_alertas_tml_filial_status ON alertas_tml(filial, status);
CREATE INDEX IF NOT EXISTS idx_alertas_tml_zapi_message_id ON alertas_tml(zapi_message_id);

ALTER TABLE supervisores_tml ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalas_tml      ENABLE ROW LEVEL SECURITY;
ALTER TABLE saidas_tml       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_tml      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON supervisores_tml;
DROP POLICY IF EXISTS "Acesso total" ON escalas_tml;
DROP POLICY IF EXISTS "Acesso total" ON saidas_tml;
DROP POLICY IF EXISTS "Acesso total" ON alertas_tml;

CREATE POLICY "Acesso total" ON supervisores_tml FOR ALL USING (true);
CREATE POLICY "Acesso total" ON escalas_tml      FOR ALL USING (true);
CREATE POLICY "Acesso total" ON saidas_tml       FOR ALL USING (true);
CREATE POLICY "Acesso total" ON alertas_tml      FOR ALL USING (true);

DROP TRIGGER IF EXISTS update_supervisores_tml_updated_at ON supervisores_tml;
CREATE TRIGGER update_supervisores_tml_updated_at
  BEFORE UPDATE ON supervisores_tml
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
