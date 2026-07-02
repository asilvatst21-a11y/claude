-- Correção: historico_tml — aplica todas as colunas e constraints incrementais
-- de forma idempotente. Execute no SQL Editor do Supabase se o histórico do
-- TML não estiver salvando (erro "Histórico: ..." no popup de importação).

-- 1. Colunas que podem estar faltando
ALTER TABLE historico_tml ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE historico_tml ADD COLUMN IF NOT EXISTS regiao_entregas TEXT;
ALTER TABLE historico_tml ADD COLUMN IF NOT EXISTS cidades_entregas TEXT;

-- 2. CHECK constraint: garante que 'invalido' é aceito (saída antes da matinal)
ALTER TABLE historico_tml DROP CONSTRAINT IF EXISTS historico_tml_resultado_check;
ALTER TABLE historico_tml ADD CONSTRAINT historico_tml_resultado_check
  CHECK (resultado IN ('no_prazo', 'atrasado', 'indefinido', 'invalido'));

-- 3. UNIQUE constraint (filial, mapa, data_saida): sem ela o onConflict do
--    upsert em DistribuicaoTML.tsx falha com "there is no unique constraint
--    matching given keys". Remove qualquer constraint antiga com chave diferente
--    e cria a correta se ainda não existir.
DO $$
DECLARE c TEXT;
BEGIN
  -- Remove constraints UNIQUE antigas que não incluem data_saida
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'historico_tml'::regclass
       AND contype = 'u'
       AND conname <> 'historico_tml_filial_mapa_data_saida_key'
  LOOP
    EXECUTE format('ALTER TABLE historico_tml DROP CONSTRAINT %I', c);
  END LOOP;

  -- Cria a constraint correta se ainda não existir
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'historico_tml'::regclass
       AND conname = 'historico_tml_filial_mapa_data_saida_key'
  ) THEN
    ALTER TABLE historico_tml
      ADD CONSTRAINT historico_tml_filial_mapa_data_saida_key
      UNIQUE (filial, mapa, data_saida);
  END IF;
END $$;

-- Verificação: exibe a estrutura atual de historico_tml
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'historico_tml'
 ORDER BY ordinal_position;
