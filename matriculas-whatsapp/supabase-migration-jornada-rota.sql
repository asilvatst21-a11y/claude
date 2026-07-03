-- Módulo "Jornada e Tempo em Rota" (Distribuição) — reproduz a aba FAROL da
-- Carta de Controle de Jornada. Cruza:
--   • plano (03.11.49.02, já importado na Carta de Controle TML → escalas_tml)
--   • saída real da portaria (03.11.20 → historico_tml/saidas_tml)
--   • execução das entregas (BEES / Tracking AMBEV) — upload novo, diário
--   • tempo planejado por mapa (Roteirizador) — upload novo, diário
--
-- A matrícula do motorista vem SEMPRE do escalas_tml mais recente: o import
-- do 03.11.49.02 roda pelo menos 2x/dia (upsert por filial+mapa em
-- handleEscala), então a última importação já sobrescreve a matrícula do
-- mapa. A Jornada lê escalas_tml ao vivo a cada carregamento — nunca
-- guarda snapshot da matrícula, só do resultado calculado do dia.

-- 1. Colunas de plano no escalas_tml (03.11.49.02 já traz, hoje ignoradas
--    pelo parser da Carta de Controle TML).
ALTER TABLE escalas_tml ADD COLUMN IF NOT EXISTS tempo_prev_min INTEGER;   -- Tempo Prev.(+almoço), em minutos
ALTER TABLE escalas_tml ADD COLUMN IF NOT EXISTS hora_saida_prev TEXT;     -- Hora MPD prevista (HH:MM)
ALTER TABLE escalas_tml ADD COLUMN IF NOT EXISTS entregas_previstas INTEGER;

-- 2. Execução das entregas por mapa (agregado do BEES no import do dia).
CREATE TABLE IF NOT EXISTS jornada_bees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa BIGINT NOT NULL,
  data DATE NOT NULL,
  realizadas INTEGER NOT NULL DEFAULT 0,
  devolucao INTEGER NOT NULL DEFAULT 0,
  repasse INTEGER NOT NULL DEFAULT 0,
  entrega_fora_raio INTEGER NOT NULL DEFAULT 0,
  dev_fora_raio INTEGER NOT NULL DEFAULT 0,
  menos_4min INTEGER NOT NULL DEFAULT 0,
  not_10s INTEGER NOT NULL DEFAULT 0,
  tempo_real_medio_min NUMERIC,     -- média (finished_at - arrived_at) por PDV, em min
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, mapa, data)
);

-- 3. Tempo planejado por mapa (Roteirizador) — base da dispersão de tempo.
--    O arquivo do Roteirizador não traz o número do mapa, só a PLACA — o
--    mapa é resolvido no import casando a placa com a escala do mesmo dia
--    (escalas_tml). "Entregas planejadas" e "tempo médio por entrega" não
--    são guardados aqui: são derivados de escalas_tml.entregas_previstas
--    na hora do cálculo, evitando duplicar/desatualizar o dado.
CREATE TABLE IF NOT EXISTS jornada_roteirizador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa BIGINT NOT NULL,
  placa TEXT,
  data DATE NOT NULL,
  tempo_dirigindo_min NUMERIC,      -- Tempo Dirigindo (HH:MM:SS) do Roteirizador, convertido p/ minutos
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, mapa, data)
);

CREATE INDEX IF NOT EXISTS idx_jornada_bees_filial_data ON jornada_bees (filial, data);
CREATE INDEX IF NOT EXISTS idx_jornada_rot_filial_data ON jornada_roteirizador (filial, data);

-- 4. Grupo de WhatsApp para o resumo do CDD (o envio por sala usa o grupo
--    já cadastrado por sala em supervisores_tml — nada novo ali).
ALTER TABLE filiais ADD COLUMN IF NOT EXISTS grupo_jornada_whatsapp TEXT;

-- 5. RLS (controle de acesso é feito no app, como as demais tabelas TML).
ALTER TABLE jornada_bees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON jornada_bees;
CREATE POLICY "Acesso total" ON jornada_bees FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE jornada_roteirizador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON jornada_roteirizador;
CREATE POLICY "Acesso total" ON jornada_roteirizador FOR ALL USING (true) WITH CHECK (true);
