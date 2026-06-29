-- Migração: cadastro de placas da Frota (ativo/inativo + perfil do veículo)
-- Execute no SQL Editor do Supabase.

-- Uma linha por placa por filial. Alimentada automaticamente (sem
-- sobrescrever o que já existe) a cada importação de Disponibilidade —
-- placa nova entra como ativo=true, perfil e matrícula do motorista em
-- branco, editável na tela de cadastro de placas. Usada para: (1) excluir
-- placas inativas dos cálculos de disponibilidade/ranking/território;
-- (2) classificar por perfil (VUC/Toco/Truck/Carreta) no resumo exportado
-- em imagem; (3) registrar a matrícula do motorista fixado na placa, para
-- a futura fixação de motorista (análoga à fixação de território).
CREATE TABLE IF NOT EXISTS frota_placas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  placa TEXT NOT NULL,
  perfil TEXT,
  matricula_motorista TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, placa)
);

-- Caso a tabela já tenha sido criada antes desta coluna existir.
ALTER TABLE frota_placas ADD COLUMN IF NOT EXISTS matricula_motorista TEXT;

CREATE INDEX IF NOT EXISTS idx_frota_placas_filial ON frota_placas(filial);

ALTER TABLE frota_placas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON frota_placas;
CREATE POLICY "Acesso total" ON frota_placas FOR ALL USING (true);
