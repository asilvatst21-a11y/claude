-- Migração: parâmetros do TML editáveis pelo usuário (meta de matinal por
-- dia da semana + gatilho de estouro do deslocamento), versionados por data
-- de vigência. Alterar um parâmetro só afeta a partir da "vigente_a_partir"
-- escolhida — dados já registrados continuam sendo lidos com as regras que
-- estavam em vigor na época.
-- Execute no SQL Editor do Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS tml_meta_matinal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo..6=sábado
  meta_minutos INTEGER NOT NULL CHECK (meta_minutos > 0),
  vigente_a_partir DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, dia_semana, vigente_a_partir)
);
CREATE INDEX IF NOT EXISTS idx_tml_meta_matinal_filial ON tml_meta_matinal(filial);

CREATE TABLE IF NOT EXISTS tml_gatilho_estouro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  deslocamento_ideal_minutos INTEGER NOT NULL CHECK (deslocamento_ideal_minutos >= 0),
  deslocamento_estouro_minutos INTEGER NOT NULL CHECK (deslocamento_estouro_minutos >= 0),
  vigente_a_partir DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, vigente_a_partir)
);
CREATE INDEX IF NOT EXISTS idx_tml_gatilho_estouro_filial ON tml_gatilho_estouro(filial);

ALTER TABLE tml_meta_matinal    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tml_gatilho_estouro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON tml_meta_matinal;
DROP POLICY IF EXISTS "Acesso total" ON tml_gatilho_estouro;

CREATE POLICY "Acesso total" ON tml_meta_matinal    FOR ALL USING (true);
CREATE POLICY "Acesso total" ON tml_gatilho_estouro  FOR ALL USING (true);
