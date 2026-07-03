-- Ajuste de escopo do módulo Excesso de Peso: só usamos o Frota Legal
-- (planilha "Equipamentos"), não o Freightech. Cada placa traz Peso Tara
-- e Peso Lotação — Lotação é a referência comparada com o peso carregado
-- do 03.11.49.02.
--
-- Idempotente e seguro rodar tanto se a migration anterior
-- (supabase-migration-excesso-peso.sql) já rodou quanto se não rodou —
-- o CREATE TABLE cobre instalação nova, os ALTER cobrem quem já tinha a
-- tabela no formato antigo (peso_freightech/peso_frota_legal).

CREATE TABLE IF NOT EXISTS peso_cadastrado_placas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  placa TEXT NOT NULL,
  peso_tara NUMERIC,
  peso_lotacao NUMERIC,
  importado_em TIMESTAMPTZ,
  foto_tara_url TEXT,
  foto_tara_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, placa)
);

ALTER TABLE peso_cadastrado_placas DROP COLUMN IF EXISTS peso_freightech;
ALTER TABLE peso_cadastrado_placas DROP COLUMN IF EXISTS peso_frota_legal;
ALTER TABLE peso_cadastrado_placas DROP COLUMN IF EXISTS importado_freightech_em;
ALTER TABLE peso_cadastrado_placas DROP COLUMN IF EXISTS importado_frota_legal_em;
ALTER TABLE peso_cadastrado_placas ADD COLUMN IF NOT EXISTS peso_tara NUMERIC;
ALTER TABLE peso_cadastrado_placas ADD COLUMN IF NOT EXISTS peso_lotacao NUMERIC;
ALTER TABLE peso_cadastrado_placas ADD COLUMN IF NOT EXISTS importado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_peso_cadastrado_placas_filial ON peso_cadastrado_placas (filial);
