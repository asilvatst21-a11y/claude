-- Migração: sugestões de melhoria da Conferência Digital.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Ao finalizar (deixar 100% resolvido — conferido ou pulado) um mapa, se o
-- nome digitado bater com um motorista/ajudante com telefone cadastrado,
-- manda uma mensagem perguntando se ele tem sugestão pra melhorar o
-- processo. A resposta em texto livre é capturada pelo webhook e fica
-- disponível na aba "Sugestões" do painel.

CREATE TABLE IF NOT EXISTS conferencia_sugestoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa BIGINT NOT NULL,
  data DATE NOT NULL,
  nome TEXT,
  telefone TEXT NOT NULL,
  pergunta_enviada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resposta TEXT,
  respondida_em TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'respondida')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conf_sugestoes_telefone_status ON conferencia_sugestoes (telefone, status);
CREATE INDEX IF NOT EXISTS idx_conf_sugestoes_filial ON conferencia_sugestoes (filial, created_at);

ALTER TABLE conferencia_sugestoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON conferencia_sugestoes;
CREATE POLICY "Acesso total" ON conferencia_sugestoes FOR ALL USING (true) WITH CHECK (true);
