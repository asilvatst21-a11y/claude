-- Migração: Fixação de Motorista — alertas de divergência + grupo de WhatsApp do resumo diário
-- Execute no SQL Editor do Supabase.

-- Quando a placa roda no dia com um motorista diferente do(s) fixado(s) em
-- frota_placas (matricula_motorista / matricula_motorista_2), gera um
-- registro aqui e dispara automaticamente uma solicitação de justificativa
-- pro supervisor da sala via WhatsApp (mesmo modelo de alertas_tml).
CREATE TABLE IF NOT EXISTS alertas_fixacao_motorista (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  numero TEXT UNIQUE NOT NULL,
  placa TEXT NOT NULL,
  data DATE NOT NULL,
  sala TEXT NOT NULL CHECK (sala IN ('COLORADO', 'SUB-FURIA')),
  matricula_executou BIGINT NOT NULL,
  nome_executou TEXT,
  matricula_esperada_1 TEXT,
  matricula_esperada_2 TEXT,
  supervisor_id UUID REFERENCES supervisores_tml(id),
  mensagem_enviada TEXT,
  zapi_message_id TEXT,
  status TEXT CHECK (status IN ('pendente', 'enviado', 'respondido', 'justificado', 'erro')) DEFAULT 'pendente',
  justificativa TEXT,
  justificado_em TIMESTAMPTZ,
  resposta_supervisor TEXT,
  respondido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, placa, data)
);

CREATE INDEX IF NOT EXISTS idx_alertas_fixacao_motorista_filial_status ON alertas_fixacao_motorista(filial, status);
CREATE INDEX IF NOT EXISTS idx_alertas_fixacao_motorista_zapi_message_id ON alertas_fixacao_motorista(zapi_message_id);
CREATE INDEX IF NOT EXISTS idx_alertas_fixacao_motorista_supervisor ON alertas_fixacao_motorista(supervisor_id, status);

ALTER TABLE alertas_fixacao_motorista ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON alertas_fixacao_motorista;
CREATE POLICY "Acesso total" ON alertas_fixacao_motorista FOR ALL USING (true);

-- Grupo de WhatsApp que recebe o resumo diário de aderência da Fixação de
-- Motorista (botão manual, mesmo padrão de grupo_frota_whatsapp).
ALTER TABLE filiais ADD COLUMN IF NOT EXISTS grupo_fixacao_motorista_whatsapp TEXT;
