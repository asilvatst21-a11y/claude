-- Migração: RV por atividade de turno (Armazém).
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Extensão da Variável do Armazém (pontuação → cluster) com um segundo
-- mecanismo: atividades manuais com meta por turno, fechadas pelo conferente
-- no fim do expediente. Valor final mensal é dividido pelos dias úteis
-- (segunda a sábado) do mês pra virar a cota diária de cada atividade.

CREATE TABLE IF NOT EXISTS variavel_turno_atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  turno TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo_registro TEXT NOT NULL CHECK (tipo_registro IN ('manual', 'upload')),
  unidade TEXT NOT NULL CHECK (unidade IN ('percentual', 'reais', 'numero', 'ok_nok')),
  direcao TEXT CHECK (direcao IN ('maior_melhor', 'menor_melhor')),
  meta_valor NUMERIC,
  valor_final_mensal NUMERIC NOT NULL,
  colaborador_id UUID REFERENCES armazem_colaboradores(id) ON DELETE SET NULL,
  colaborador_nome TEXT,
  conferente_usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  conferente_nome TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_atividades_filial ON variavel_turno_atividades (filial);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_atividades_conferente ON variavel_turno_atividades (conferente_usuario_id);

-- Uma linha por (atividade, dia) — o conferente pode reabrir e corrigir o
-- mesmo registro do dia (registrado_em atualiza), sem duplicar.
CREATE TABLE IF NOT EXISTS variavel_turno_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES variavel_turno_atividades(id) ON DELETE CASCADE,
  filial TEXT NOT NULL,
  data DATE NOT NULL,
  valor_numero NUMERIC,
  ok_nok BOOLEAN,
  bateu_meta BOOLEAN NOT NULL,
  valor_gerado NUMERIC NOT NULL DEFAULT 0,
  registrado_por_usuario_id UUID REFERENCES usuarios(id),
  registrado_por_nome TEXT,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (atividade_id, data)
);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_registros_filial_data ON variavel_turno_registros (filial, data);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_registros_colaborador ON variavel_turno_registros (atividade_id, data);

ALTER TABLE variavel_turno_atividades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_atividades;
CREATE POLICY "Acesso total" ON variavel_turno_atividades FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE variavel_turno_registros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_registros;
CREATE POLICY "Acesso total" ON variavel_turno_registros FOR ALL USING (true) WITH CHECK (true);
