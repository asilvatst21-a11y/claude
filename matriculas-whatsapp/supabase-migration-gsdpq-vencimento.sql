-- Migração: Vencimento GSD — farol de dias para vencer + notificação ao supervisor
-- Execute no SQL Editor do Supabase.

-- 1. Data de admissão do colaborador (define o ciclo de 30 ou 60 dias)
ALTER TABLE gsdpq_colaboradores ADD COLUMN IF NOT EXISTS data_admissao DATE;

COMMENT ON COLUMN gsdpq_colaboradores.status IS
  'TRABALHANDO (ativo) ou DESLIGADO (excluído do farol de vencimento e das notificações)';

-- 2. Supervisor responsável por equipe (GSDPQ) — recebe o alerta de vencimento
-- direto no WhatsApp pessoal. Equipe é texto livre, igual ao campo já usado em
-- gsdpq_colaboradores/gsdpq_avaliacoes (não está restrito a um enum fixo).
CREATE TABLE IF NOT EXISTS gsdpq_supervisores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  equipe TEXT NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, equipe)
);

CREATE INDEX IF NOT EXISTS idx_gsdpq_supervisores_filial_equipe
  ON gsdpq_supervisores(filial, equipe);

ALTER TABLE gsdpq_supervisores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON gsdpq_supervisores;
CREATE POLICY "Acesso total" ON gsdpq_supervisores FOR ALL USING (true);

-- 3. Controle de notificações já enviadas — evita repetir o mesmo aviso (mesmo
-- threshold) dentro do mesmo ciclo do colaborador. O ciclo é identificado pela
-- data de início (última avaliação ou data de admissão), então um novo GSD
-- reabre os thresholds para o próximo vencimento.
CREATE TABLE IF NOT EXISTS gsdpq_vencimento_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  colaborador_id UUID NOT NULL REFERENCES gsdpq_colaboradores(id) ON DELETE CASCADE,
  ciclo_inicio DATE NOT NULL,
  dias_threshold INTEGER NOT NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (colaborador_id, ciclo_inicio, dias_threshold)
);

CREATE INDEX IF NOT EXISTS idx_gsdpq_vencimento_notif_colaborador
  ON gsdpq_vencimento_notificacoes(colaborador_id);

ALTER TABLE gsdpq_vencimento_notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON gsdpq_vencimento_notificacoes;
CREATE POLICY "Acesso total" ON gsdpq_vencimento_notificacoes FOR ALL USING (true);
