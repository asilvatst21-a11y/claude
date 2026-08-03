-- Migração: turno + telefone do conferente da RV por Turno, e horário de
-- fechamento editável de cada turno (base pro futuro aviso automático via
-- WhatsApp, lembrando o conferente de lançar as atividades do dia).
--
-- Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS turno TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone TEXT;

CREATE TABLE IF NOT EXISTS variavel_turno_horarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  turno TEXT NOT NULL,
  horario_fechamento TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, turno)
);

ALTER TABLE variavel_turno_horarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_horarios;
CREATE POLICY "Acesso total" ON variavel_turno_horarios FOR ALL USING (true) WITH CHECK (true);

-- Semeia os 3 turnos com os horários informados, pra cada filial que já usa
-- a RV por Turno — Turno A 13h30, Turno B 21h30, Turno C 5h30.
do $$
declare
  fil record;
begin
  for fil in select distinct filial from variavel_turno_atividades loop
    insert into variavel_turno_horarios (filial, turno, horario_fechamento)
    values
      (fil.filial, 'TA', '13:30'),
      (fil.filial, 'TB', '21:30'),
      (fil.filial, 'TC', '05:30')
    on conflict (filial, turno) do nothing;
  end loop;
end $$;
