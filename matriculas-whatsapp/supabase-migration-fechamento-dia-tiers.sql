-- Migração: Farol Motoristas passa a guardar a faixa (Destaque/Meta/
-- Atenção/Bate-papo) e o valor atingido de cada critério, não só sim/não.
-- Execute no SQL Editor do Supabase. Idempotente (seguro rodar mais de uma vez).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fechamento_dia_farol_motoristas' AND column_name = 'aderencia_ok') THEN
    ALTER TABLE fechamento_dia_farol_motoristas ALTER COLUMN aderencia_ok TYPE TEXT USING (CASE WHEN aderencia_ok THEN 'meta' WHEN aderencia_ok IS FALSE THEN 'bate_papo' ELSE NULL END);
    ALTER TABLE fechamento_dia_farol_motoristas RENAME COLUMN aderencia_ok TO aderencia_tier;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fechamento_dia_farol_motoristas' AND column_name = 'tml_ok') THEN
    ALTER TABLE fechamento_dia_farol_motoristas ALTER COLUMN tml_ok TYPE TEXT USING (CASE WHEN tml_ok THEN 'meta' WHEN tml_ok IS FALSE THEN 'bate_papo' ELSE NULL END);
    ALTER TABLE fechamento_dia_farol_motoristas RENAME COLUMN tml_ok TO tml_tier;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fechamento_dia_farol_motoristas' AND column_name = 'devolucao_ok') THEN
    ALTER TABLE fechamento_dia_farol_motoristas ALTER COLUMN devolucao_ok TYPE TEXT USING (CASE WHEN devolucao_ok THEN 'meta' WHEN devolucao_ok IS FALSE THEN 'bate_papo' ELSE NULL END);
    ALTER TABLE fechamento_dia_farol_motoristas RENAME COLUMN devolucao_ok TO devolucao_tier;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fechamento_dia_farol_motoristas' AND column_name = 'iv_deslocamento_ok') THEN
    ALTER TABLE fechamento_dia_farol_motoristas ALTER COLUMN iv_deslocamento_ok TYPE TEXT USING (CASE WHEN iv_deslocamento_ok THEN 'meta' WHEN iv_deslocamento_ok IS FALSE THEN 'bate_papo' ELSE NULL END);
    ALTER TABLE fechamento_dia_farol_motoristas RENAME COLUMN iv_deslocamento_ok TO iv_deslocamento_tier;
  END IF;
END $$;

ALTER TABLE fechamento_dia_farol_motoristas ADD COLUMN IF NOT EXISTS aderencia_valor NUMERIC;
ALTER TABLE fechamento_dia_farol_motoristas ADD COLUMN IF NOT EXISTS tml_valor NUMERIC;
ALTER TABLE fechamento_dia_farol_motoristas ADD COLUMN IF NOT EXISTS devolucao_valor NUMERIC;
ALTER TABLE fechamento_dia_farol_motoristas ADD COLUMN IF NOT EXISTS iv_deslocamento_valor NUMERIC;
