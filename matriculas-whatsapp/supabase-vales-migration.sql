-- =============================================================
-- VALES LOG20 — Migração para o Supabase do matriculas-whatsapp
-- Execute no SQL Editor do Supabase (projeto PDV Crítico)
-- =============================================================

-- Ajudantes (entregadores)
CREATE TABLE IF NOT EXISTS ajudantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo INTEGER UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Histórico de importações de planilha
CREATE TABLE IF NOT EXISTS importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo TEXT,
  total_linhas INTEGER,
  total_vales INTEGER,
  total_ajudantes_notificados INTEGER DEFAULT 0,
  status TEXT DEFAULT 'concluido',
  importado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Vales (diferenças de produto)
CREATE TABLE IF NOT EXISTS vales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_vale INTEGER UNIQUE NOT NULL,
  data_emissao DATE,
  data_rota DATE,
  mapa INTEGER,
  motorista TEXT,
  veiculo TEXT,
  status_vale TEXT,
  acao_transportadora TEXT,
  justificativa_transportadora TEXT,
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

-- Itens de cada vale
CREATE TABLE IF NOT EXISTS vale_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id UUID REFERENCES vales(id) ON DELETE CASCADE,
  tipo_item TEXT,
  codigo_item TEXT,
  item TEXT,
  unidade TEXT,
  qtde_saida NUMERIC,
  qtde_retorno NUMERIC,
  qtde_diferenca NUMERIC,
  qtde_diferenca_avulsa NUMERIC,
  valor NUMERIC,
  justificativa_ajudante TEXT,
  acao_transportadora TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relacionamento vale ↔ ajudante
CREATE TABLE IF NOT EXISTS vale_ajudantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id UUID REFERENCES vales(id) ON DELETE CASCADE,
  ajudante_id UUID REFERENCES ajudantes(id),
  posicao INTEGER DEFAULT 1,
  UNIQUE(vale_id, ajudante_id)
);

-- Notificações WhatsApp enviadas
CREATE TABLE IF NOT EXISTS notificacoes (
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

-- Configurações do sistema (template de mensagem, modo automático, etc.)
CREATE TABLE IF NOT EXISTS configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT UNIQUE NOT NULL,
  valor TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Anotações manuais em vales
CREATE TABLE IF NOT EXISTS vale_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vale_id UUID NOT NULL REFERENCES vales(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reposições via WhatsApp (normalizadas por IA)
CREATE TABLE IF NOT EXISTS reposicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL,
  motorista_nome TEXT,
  motorista_telefone TEXT,
  mapa TEXT,
  cliente TEXT,
  produto TEXT,
  quantidade TEXT,
  motivo TEXT,
  mensagem_original TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'validado', 'negado', 'quebra')),
  validador_resposta TEXT,
  validado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS idx_vales_status_vale ON vales(status_vale);
CREATE INDEX IF NOT EXISTS idx_vales_numero_vale ON vales(numero_vale);
CREATE INDEX IF NOT EXISTS idx_vales_data_emissao ON vales(data_emissao);
CREATE INDEX IF NOT EXISTS idx_vale_ajudantes_vale_id ON vale_ajudantes(vale_id);
CREATE INDEX IF NOT EXISTS idx_vale_ajudantes_ajudante_id ON vale_ajudantes(ajudante_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_vale_id ON notificacoes(vale_id);
CREATE INDEX IF NOT EXISTS idx_vale_notas_vale_id ON vale_notas(vale_id);

-- Função e triggers para updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ajudantes_updated_at') THEN
    CREATE TRIGGER update_ajudantes_updated_at
      BEFORE UPDATE ON ajudantes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_vales_updated_at') THEN
    CREATE TRIGGER update_vales_updated_at
      BEFORE UPDATE ON vales
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;

-- Permissões para a service_role (necessário para operações do app)
GRANT ALL ON TABLE ajudantes TO service_role;
GRANT ALL ON TABLE importacoes TO service_role;
GRANT ALL ON TABLE vales TO service_role;
GRANT ALL ON TABLE vale_itens TO service_role;
GRANT ALL ON TABLE vale_ajudantes TO service_role;
GRANT ALL ON TABLE notificacoes TO service_role;
GRANT ALL ON TABLE configuracoes TO service_role;
GRANT ALL ON TABLE vale_notas TO service_role;
GRANT ALL ON TABLE reposicoes TO service_role;
