-- Migração: atividade de RV por turno com opção de pagar pela META
-- ACUMULADA da competência (21→20), em vez de cota diária por dia batido.
-- Ex.: TMA com meta de 01:28 — se a MÉDIA do período inteiro estiver dentro
-- da meta, o colaborador leva o valor final mensal cheio; se ficar fora,
-- perde tudo. Os valores diários deixam de variar — o totem passa a
-- mostrar só o indicador de cada dia (vermelho se aquele dia não bateu) e
-- o resultado final (cheio ou zero) da competência.
-- Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE variavel_turno_atividades ADD COLUMN IF NOT EXISTS meta_acumulada BOOLEAN NOT NULL DEFAULT FALSE;

-- Crédito por competência inteira (não por dia) — só usado por atividades
-- com meta_acumulada = true. Substitui a soma de variavel_turno_creditos
-- pra essas atividades: um valor só (cheio ou zero) por colaborador por
-- competência, recalculado toda vez que um dia da competência é
-- lançado/alterado ou um colaborador é vinculado/desvinculado.
CREATE TABLE IF NOT EXISTS variavel_turno_creditos_acumulados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES variavel_turno_atividades(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  colaborador_nome TEXT NOT NULL,
  competencia_ini DATE NOT NULL,
  competencia_fim DATE NOT NULL,
  bateu BOOLEAN NOT NULL,
  valor_gerado NUMERIC NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (atividade_id, colaborador_id, competencia_ini)
);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_creditos_acum_colab ON variavel_turno_creditos_acumulados (colaborador_id, competencia_ini);

ALTER TABLE variavel_turno_creditos_acumulados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_creditos_acumulados;
CREATE POLICY "Acesso total" ON variavel_turno_creditos_acumulados FOR ALL USING (true) WITH CHECK (true);
