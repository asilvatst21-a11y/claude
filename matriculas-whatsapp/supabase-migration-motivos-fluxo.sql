-- Migração: tabela de motivos padronizados para o Fluxo Punitivo
-- Execute no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS motivos_fluxo (
  id          uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  filial      text     NOT NULL,
  descricao   text     NOT NULL,
  ativo       boolean  NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE motivos_fluxo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total" ON motivos_fluxo FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_motivos_filial ON motivos_fluxo(filial, ativo);
