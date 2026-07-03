-- Histórico diário do Excesso de Peso, um snapshot por placa/dia — base
-- pra matriz mensal (linha = placa, coluna = dia). O cálculo de hoje já é
-- feito ao vivo (escalas_tml + peso_cadastrado_placas); esta tabela só
-- guarda o resultado de cada dia pra poder olhar o mês inteiro depois.
--
-- Chave por placa (não por mapa): o que importa pra matriz é a placa. Se a
-- mesma placa aparecer em mais de um mapa no mesmo dia, o último cálculo
-- sobrescreve o anterior (ON CONFLICT DO UPDATE) — simplificação aceitável
-- porque, na operação, cada placa normalmente roda um mapa por dia.

CREATE TABLE IF NOT EXISTS historico_excesso_peso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  placa TEXT NOT NULL,
  mapa BIGINT,
  data DATE NOT NULL,
  peso_referencia NUMERIC,
  peso_carregado NUMERIC,
  excesso NUMERIC,
  situacao TEXT NOT NULL CHECK (situacao IN ('dentro_limite', 'excesso', 'sem_referencia', 'sem_peso_carregado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, placa, data)
);

CREATE INDEX IF NOT EXISTS idx_historico_excesso_peso_filial_data ON historico_excesso_peso (filial, data);

ALTER TABLE historico_excesso_peso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON historico_excesso_peso;
CREATE POLICY "Acesso total" ON historico_excesso_peso FOR ALL USING (true) WITH CHECK (true);
