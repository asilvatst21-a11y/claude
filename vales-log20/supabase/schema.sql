-- Vales LOG20 - Schema SQL
-- Execute este arquivo no Supabase SQL Editor

CREATE TABLE ajudantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo INTEGER UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo TEXT,
  total_linhas INTEGER,
  total_vales INTEGER,
  total_ajudantes_notificados INTEGER DEFAULT 0,
  status TEXT DEFAULT 'concluido',
  importado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_vale INTEGER UNIQUE NOT NULL,
  data_emissao DATE,
  mapa INTEGER,
  motorista TEXT,
  veiculo TEXT,
  status_vale TEXT,
  acao_transportadora TEXT,
  valor_total NUMERIC DEFAULT 0,
  acao_primeiro_nivel TEXT,
  data_primeiro_nivel DATE,
  usuario_primeiro_nivel TEXT,
  motivo_primeiro_nivel TEXT,
  justificativa_primeiro_nivel TEXT,
  notificacao_pendente_enviada BOOLEAN DEFAULT FALSE,
  notificacao_final_enviada BOOLEAN DEFAULT FALSE,
  importacao_id UUID REFERENCES importacoes(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vale_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id UUID REFERENCES vales(id) ON DELETE CASCADE,
  tipo_item TEXT,
  codigo_item TEXT,
  item TEXT,
  unidade TEXT,
  qtde_saida NUMERIC,
  qtde_retorno NUMERIC,
  qtde_diferenca NUMERIC,
  valor NUMERIC,
  justificativa_ajudante TEXT,
  acao_transportadora TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vale_ajudantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id UUID REFERENCES vales(id) ON DELETE CASCADE,
  ajudante_id UUID REFERENCES ajudantes(id),
  posicao INTEGER DEFAULT 1,
  UNIQUE(vale_id, ajudante_id)
);

CREATE TABLE notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id UUID REFERENCES vales(id) ON DELETE CASCADE,
  ajudante_id UUID REFERENCES ajudantes(id),
  tipo TEXT CHECK (tipo IN ('pendente', 'resolvido')),
  mensagem TEXT,
  telefone TEXT,
  status TEXT CHECK (status IN ('enviado', 'erro', 'pendente')) DEFAULT 'pendente',
  erro_detalhe TEXT,
  enviada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_vales_status_vale ON vales(status_vale);
CREATE INDEX idx_vales_numero_vale ON vales(numero_vale);
CREATE INDEX idx_vale_ajudantes_vale_id ON vale_ajudantes(vale_id);
CREATE INDEX idx_vale_ajudantes_ajudante_id ON vale_ajudantes(ajudante_id);
CREATE INDEX idx_notificacoes_vale_id ON notificacoes(vale_id);
CREATE INDEX idx_notificacoes_ajudante_id ON notificacoes(ajudante_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_ajudantes_updated_at
  BEFORE UPDATE ON ajudantes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vales_updated_at
  BEFORE UPDATE ON vales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration: Add 1º Nível columns to existing deployments
-- ALTER TABLE vales ADD COLUMN IF NOT EXISTS acao_primeiro_nivel TEXT;
-- ALTER TABLE vales ADD COLUMN IF NOT EXISTS data_primeiro_nivel DATE;
-- ALTER TABLE vales ADD COLUMN IF NOT EXISTS usuario_primeiro_nivel TEXT;
-- ALTER TABLE vales ADD COLUMN IF NOT EXISTS motivo_primeiro_nivel TEXT;
-- ALTER TABLE vales ADD COLUMN IF NOT EXISTS justificativa_primeiro_nivel TEXT;
