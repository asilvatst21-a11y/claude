-- Migração: controle de envio do aviso diário de fechamento de turno —
-- garante um único aviso por (filial, turno, dia), mesmo com o cron rodando
-- a cada poucos minutos (api/cron-aviso-turno.ts).
-- Execute no SQL Editor do Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS variavel_turno_avisos_enviados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  turno TEXT NOT NULL,
  data DATE NOT NULL,
  enviado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, turno, data)
);

ALTER TABLE variavel_turno_avisos_enviados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_turno_avisos_enviados;
CREATE POLICY "Acesso total" ON variavel_turno_avisos_enviados FOR ALL USING (true) WITH CHECK (true);
