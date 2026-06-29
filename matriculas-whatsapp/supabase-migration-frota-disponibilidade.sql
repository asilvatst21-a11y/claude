-- Migração: Disponibilidade diária de Frota
-- Execute no SQL Editor do Supabase.

-- Uma linha por placa por dia. A frota contratada muda a cada quinzena
-- (1 e 16) e é derivada dos próprios dados: toda placa com status diferente
-- de "Não Contratada" naquele dia conta como frota contratada do período.
CREATE TABLE IF NOT EXISTS frota_disponibilidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  data DATE NOT NULL,
  placa TEXT NOT NULL,
  frota TEXT,
  territorio TEXT,
  regiao TEXT,
  status TEXT NOT NULL,
  justificativa TEXT,
  observacao TEXT,
  segmento TEXT,
  capacidade_caixas NUMERIC,
  capacidade_peso NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, data, placa)
);

CREATE INDEX IF NOT EXISTS idx_frota_disp_filial_data ON frota_disponibilidade(filial, data);

ALTER TABLE frota_disponibilidade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON frota_disponibilidade;
CREATE POLICY "Acesso total" ON frota_disponibilidade FOR ALL USING (true);
