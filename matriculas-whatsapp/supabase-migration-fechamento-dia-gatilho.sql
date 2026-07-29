-- Migração: pendências de bate-papo do Farol Motoristas (gatilho).
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Uma linha por (mapa, kpi, pessoa) que estourou o Gatilho daquele KPI no
-- dia — motorista e ajudante(s) recebem pendência separada, cada um pode
-- responder independentemente (por isso não é 1 linha por mapa só). O bot
-- manda a lista dos KPIs pendentes daquela pessoa; ao escolher um, o status
-- vira 'coletando' até a resposta chegar (texto ou áudio transcrito).

CREATE TABLE IF NOT EXISTS fechamento_dia_gatilho_pendencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  data DATE NOT NULL,
  mapa INTEGER NOT NULL,
  kpi TEXT NOT NULL,
  pessoa_tipo TEXT NOT NULL CHECK (pessoa_tipo IN ('motorista', 'ajudante')),
  pessoa_nome TEXT NOT NULL,
  pessoa_telefone TEXT,
  valor NUMERIC,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'coletando', 'respondido')),
  resposta TEXT,
  respondido_em TIMESTAMPTZ,
  supervisor_avisado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, data, mapa, kpi, pessoa_nome)
);
CREATE INDEX IF NOT EXISTS idx_gatilho_pend_telefone_status ON fechamento_dia_gatilho_pendencias (pessoa_telefone, status);
CREATE INDEX IF NOT EXISTS idx_gatilho_pend_filial_data ON fechamento_dia_gatilho_pendencias (filial, data);

ALTER TABLE fechamento_dia_gatilho_pendencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON fechamento_dia_gatilho_pendencias;
CREATE POLICY "Acesso total" ON fechamento_dia_gatilho_pendencias FOR ALL USING (true) WITH CHECK (true);
