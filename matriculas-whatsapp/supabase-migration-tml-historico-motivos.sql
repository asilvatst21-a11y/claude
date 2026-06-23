-- Migração: TML — histórico completo de saídas + motivos pré-definidos de justificativa
-- Execute no SQL Editor do Supabase.

-- 1. Histórico completo: toda saída processada (bateu ou não bateu o TML)
CREATE TABLE IF NOT EXISTS historico_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa BIGINT NOT NULL,
  sala TEXT CHECK (sala IN ('COLORADO', 'SUB-FURIA')),
  placa TEXT,
  matricula BIGINT,
  data_saida DATE,
  horario_saida TEXT,
  horario_limite TEXT,
  atraso_minutos INTEGER,
  resultado TEXT NOT NULL CHECK (resultado IN ('no_prazo', 'atrasado', 'indefinido')),
  observacao TEXT,
  alerta_id UUID REFERENCES alertas_tml(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, mapa)
);

CREATE INDEX IF NOT EXISTS idx_historico_tml_filial_resultado
  ON historico_tml(filial, resultado);
CREATE INDEX IF NOT EXISTS idx_historico_tml_filial_matricula
  ON historico_tml(filial, matricula);

ALTER TABLE historico_tml ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON historico_tml;
CREATE POLICY "Acesso total" ON historico_tml FOR ALL USING (true);

-- 2. Motivos pré-definidos de justificativa (clicáveis pelo supervisor)
CREATE TABLE IF NOT EXISTS motivos_justificativa_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  motivo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, motivo)
);

ALTER TABLE motivos_justificativa_tml ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON motivos_justificativa_tml;
CREATE POLICY "Acesso total" ON motivos_justificativa_tml FOR ALL USING (true);

-- 3. Seed dos motivos padrão para cada filial já cadastrada em usuarios
INSERT INTO motivos_justificativa_tml (filial, motivo)
SELECT DISTINCT u.filial, m.motivo
FROM usuarios u
CROSS JOIN (VALUES
  ('ATRASO NA MATINAL'),
  ('ATRASO COLABORADOR'),
  ('MANUTENÇÃO'),
  ('CONFERENCIA DE CARGA'),
  ('OUTRO')
) AS m(motivo)
ON CONFLICT (filial, motivo) DO NOTHING;
