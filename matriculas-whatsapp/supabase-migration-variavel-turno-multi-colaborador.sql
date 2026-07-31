-- Migração: uma atividade de RV por turno passa a poder ter MAIS DE UM
-- colaborador (ex.: EFC feita por vários ajudantes) — o valor final mensal
-- continua individual por pessoa, não dividido entre o grupo.
-- Execute no SQL Editor do Supabase. Idempotente.

-- 1) Tira o colaborador/valor único da atividade (agora fica na tabela nova).
ALTER TABLE variavel_turno_atividades DROP COLUMN IF EXISTS colaborador_id;
ALTER TABLE variavel_turno_atividades DROP COLUMN IF EXISTS colaborador_nome;
ALTER TABLE variavel_turno_atividades DROP COLUMN IF EXISTS valor_final_mensal;

-- 2) Um colaborador da atividade + o valor final mensal DELE (cada pessoa
--    pode ter um valor diferente na mesma atividade).
CREATE TABLE IF NOT EXISTS variavel_turno_atividade_colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES variavel_turno_atividades(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  colaborador_nome TEXT NOT NULL,
  valor_final_mensal NUMERIC NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (atividade_id, colaborador_id)
);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_ativ_colab_atividade ON variavel_turno_atividade_colaboradores (atividade_id);

-- 3) O registro do dia (1 por atividade+data) não guarda mais um valor_gerado
--    único — agora cada colaborador tem o próprio crédito (tabela 4).
ALTER TABLE variavel_turno_registros DROP COLUMN IF EXISTS valor_gerado;

-- 4) Crédito por colaborador no dia — recalculado toda vez que o conferente
--    (re)registra a atividade daquele dia (apaga e regrava os créditos das
--    pessoas ativas na atividade naquele momento).
CREATE TABLE IF NOT EXISTS variavel_turno_creditos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES variavel_turno_atividades(id) ON DELETE CASCADE,
  registro_id UUID REFERENCES variavel_turno_registros(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  colaborador_nome TEXT NOT NULL,
  data DATE NOT NULL,
  valor_gerado NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (atividade_id, colaborador_id, data)
);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_creditos_data ON variavel_turno_creditos (atividade_id, data);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_creditos_colaborador ON variavel_turno_creditos (colaborador_id, data);

ALTER TABLE variavel_turno_atividade_colaboradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_atividade_colaboradores;
CREATE POLICY "Acesso total" ON variavel_turno_atividade_colaboradores FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE variavel_turno_creditos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_creditos;
CREATE POLICY "Acesso total" ON variavel_turno_creditos FOR ALL USING (true) WITH CHECK (true);
