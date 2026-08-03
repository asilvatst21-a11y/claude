-- Migração: RV por Turno — atividades "por operador" (ex.: Quebra TA/TB/TC),
-- em que cada colaborador lança o PRÓPRIO valor do dia, em vez de todos
-- herdarem um valor único compartilhado do turno.
--
-- Não altera nada da tabela variavel_turno_registros (nem seu UNIQUE
-- atividade_id+data) — as atividades já existentes (TMA, EFC etc.) continuam
-- exatamente como estão. Uma tabela nova cobre só as atividades marcadas
-- como "por operador".
--
-- Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE variavel_turno_atividades ADD COLUMN IF NOT EXISTS por_operador BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS variavel_turno_registros_operador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES variavel_turno_atividades(id) ON DELETE CASCADE,
  filial TEXT NOT NULL,
  colaborador_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  colaborador_nome TEXT NOT NULL,
  data DATE NOT NULL,
  valor_numero NUMERIC,
  ok_nok BOOLEAN,
  bateu_meta BOOLEAN NOT NULL,
  registrado_por_usuario_id UUID REFERENCES usuarios(id),
  registrado_por_nome TEXT,
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (atividade_id, colaborador_id, data)
);
CREATE INDEX IF NOT EXISTS idx_variavel_turno_reg_operador_filial_data ON variavel_turno_registros_operador (filial, data);

ALTER TABLE variavel_turno_registros_operador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_registros_operador;
CREATE POLICY "Acesso total" ON variavel_turno_registros_operador FOR ALL USING (true) WITH CHECK (true);

-- Semeia as 3 atividades de Quebra por turno — meta 0 (menor melhor: quanto
-- menos quebra, melhor), lançamento manual no painel (retroativo), por
-- operador. Ajuste depois o conferente responsável e o valor final mensal de
-- cada colaborador em "Colaboradores desta atividade", igual às demais.
do $$
declare
  fil record;
  turnos text[] := array['TA', 'TB', 'TC'];
  t text;
begin
  for fil in select distinct filial from variavel_turno_atividades loop
    foreach t in array turnos loop
      if not exists (
        select 1 from variavel_turno_atividades
        where filial = fil.filial and nome = 'Quebra ' || t
      ) then
        insert into variavel_turno_atividades (filial, turno, nome, tipo_registro, unidade, direcao, meta_valor, por_operador)
        values (fil.filial, t, 'Quebra ' || t, 'manual_admin', 'numero', 'menor_melhor', 0, true);
      end if;
    end loop;
  end loop;
end $$;
