-- Migração: unidade de meta em tempo (hh:mm) + lista de presença do
-- conferente (quem falta perde o dia de RV, mesmo que a atividade tenha
-- batido a meta). Execute no SQL Editor do Supabase. Idempotente.

-- 1) Nova unidade "tempo" (guardada em minutos, igual as outras numéricas —
--    a conversão pra hh:mm é só na tela).
ALTER TABLE variavel_turno_atividades DROP CONSTRAINT IF EXISTS variavel_turno_atividades_unidade_check;
ALTER TABLE variavel_turno_atividades ADD CONSTRAINT variavel_turno_atividades_unidade_check
  CHECK (unidade IN ('percentual', 'reais', 'numero', 'ok_nok', 'tempo'));

-- 2) Equipe fixa do conferente pra checagem de presença — selecionada por
--    quem cadastra o login do conferente na aba Armazém, não precisa
--    coincidir 1:1 com quem está em cada atividade.
CREATE TABLE IF NOT EXISTS variavel_turno_conferente_equipe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conferente_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE CASCADE,
  colaborador_nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (conferente_usuario_id, colaborador_id)
);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_conf_equipe ON variavel_turno_conferente_equipe (conferente_usuario_id);

-- 3) Presença do dia — 1 linha por colaborador da equipe do conferente,
--    marcada no fechamento do turno (depois de registrar todas as
--    atividades manuais do dia).
CREATE TABLE IF NOT EXISTS variavel_turno_presencas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conferente_usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE CASCADE,
  colaborador_nome TEXT NOT NULL,
  data DATE NOT NULL,
  presente BOOLEAN NOT NULL,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conferente_usuario_id, colaborador_id, data)
);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_presencas_data ON variavel_turno_presencas (conferente_usuario_id, data);

-- 4) Marca créditos zerados por ausência (distinto de "não bateu meta") —
--    pra tela de consulta do ajudante mostrar "Ausente" em vez do resultado.
ALTER TABLE variavel_turno_creditos ADD COLUMN IF NOT EXISTS ausente BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE variavel_turno_conferente_equipe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_conferente_equipe;
CREATE POLICY "Acesso total" ON variavel_turno_conferente_equipe FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE variavel_turno_presencas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_presencas;
CREATE POLICY "Acesso total" ON variavel_turno_presencas FOR ALL USING (true) WITH CHECK (true);
