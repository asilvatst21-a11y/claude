-- Migração: Distribuição — Carta de Controle TML (saída na portaria)
-- Execute no SQL Editor do Supabase.

CREATE TABLE IF NOT EXISTS supervisores_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  nome TEXT NOT NULL,
  sala TEXT NOT NULL CHECK (sala IN ('INT', 'PET')),
  telefone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escalas_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa INTEGER NOT NULL,
  sala TEXT NOT NULL CHECK (sala IN ('INT', 'PET')),
  placa TEXT,
  matricula INTEGER,
  data_entrega DATE,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, mapa)
);

CREATE TABLE IF NOT EXISTS saidas_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa INTEGER NOT NULL,
  placa TEXT,
  matricula INTEGER,
  data_saida DATE,
  horario_saida TEXT,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, mapa)
);

CREATE TABLE IF NOT EXISTS alertas_tml (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_supervisores_tml_filial_sala ON supervisores_tml(filial, sala);
CREATE INDEX IF NOT EXISTS idx_escalas_tml_filial_mapa ON escalas_tml(filial, mapa);
CREATE INDEX IF NOT EXISTS idx_saidas_tml_filial_mapa ON saidas_tml(filial, mapa);
CREATE INDEX IF NOT EXISTS idx_alertas_tml_filial_status ON alertas_tml(filial, status);
CREATE INDEX IF NOT EXISTS idx_alertas_tml_zapi_message_id ON alertas_tml(zapi_message_id);

ALTER TABLE supervisores_tml ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalas_tml      ENABLE ROW LEVEL SECURITY;
ALTER TABLE saidas_tml       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas_tml      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total" ON supervisores_tml FOR ALL USING (true);
CREATE POLICY "Acesso total" ON escalas_tml      FOR ALL USING (true);
CREATE POLICY "Acesso total" ON saidas_tml        FOR ALL USING (true);
CREATE POLICY "Acesso total" ON alertas_tml      FOR ALL USING (true);

CREATE TRIGGER update_supervisores_tml_updated_at
  BEFORE UPDATE ON supervisores_tml
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
