-- Migração: histórico de território/região executada (carga única do PCD)
-- Execute no SQL Editor do Supabase.

-- Carga única da planilha histórica de roteirização (PCD/RoadShow), usada
-- para cruzar com o território disponibilizado nos dias de Frota já
-- importados antes da captura automática via Escala do dia (03.11.49.02).
CREATE TABLE IF NOT EXISTS frota_territorio_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa BIGINT NOT NULL,
  placa TEXT,
  data DATE,
  regiao_entregas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, mapa)
);

CREATE INDEX IF NOT EXISTS idx_frota_terr_hist_filial_placa_data ON frota_territorio_historico(filial, placa, data);

ALTER TABLE frota_territorio_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON frota_territorio_historico;
CREATE POLICY "Acesso total" ON frota_territorio_historico FOR ALL USING (true);
