-- IV da Frota — DU (Disponibilidade de Unidades)
-- Tabela de tratativa diária: motivo de indisponibilidade e previsão de
-- retorno por placa/dia, usada para ranking de motivos e projeção de DU.

CREATE TABLE IF NOT EXISTS frota_iv_tratativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  placa TEXT NOT NULL,
  data DATE NOT NULL,
  motivo_tratativa TEXT,
  previsao_retorno DATE,
  observacao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, placa, data)
);

CREATE INDEX IF NOT EXISTS idx_frota_iv_trat_filial ON frota_iv_tratativas(filial);
CREATE INDEX IF NOT EXISTS idx_frota_iv_trat_filial_data ON frota_iv_tratativas(filial, data);
CREATE INDEX IF NOT EXISTS idx_frota_iv_trat_previsao ON frota_iv_tratativas(filial, previsao_retorno) WHERE previsao_retorno IS NOT NULL;

ALTER TABLE frota_iv_tratativas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total" ON frota_iv_tratativas;
CREATE POLICY "Acesso total" ON frota_iv_tratativas FOR ALL USING (true);
