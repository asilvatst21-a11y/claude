-- Migração: corrige perda de dados do TML quando o número de mapa se repete
-- em dias diferentes. Hoje historico_tml e checklist_tml têm UNIQUE(filial,
-- mapa) sem data — ao importar a saída/checklist de um novo dia, o upsert
-- com onConflict "filial,mapa" sobrescreve (apaga) o registro do dia
-- anterior com o mesmo mapa. Isso explica dados de "ontem" desaparecendo
-- da Análise TML.
-- Execute no SQL Editor do Supabase. Idempotente.

-- 1) historico_tml: unicidade passa a incluir a data da saída.
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'historico_tml'::regclass AND contype = 'u'
      AND conname <> 'historico_tml_filial_mapa_data_saida_key';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE historico_tml DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE historico_tml ADD CONSTRAINT historico_tml_filial_mapa_data_saida_key UNIQUE (filial, mapa, data_saida);

-- 2) checklist_tml: idem, com a coluna "data".
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'checklist_tml'::regclass AND contype = 'u'
      AND conname <> 'checklist_tml_filial_mapa_data_key';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE checklist_tml DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE checklist_tml ADD CONSTRAINT checklist_tml_filial_mapa_data_key UNIQUE (filial, mapa, data);

-- 3) alertas_tml: guarda a data da saída para a checagem de "mapa já
--    alertado" não confundir o mesmo número de mapa usado em dias
--    diferentes (o que fazia o alerta/histórico do dia atual ser pulado).
ALTER TABLE alertas_tml ADD COLUMN IF NOT EXISTS data_saida DATE;

-- 4) checklist_tml: guarda o horário bruto de término da matinal usado no
--    cálculo do tempo de deslocamento, para exibir junto ao tempo calculado.
ALTER TABLE checklist_tml ADD COLUMN IF NOT EXISTS horario_final_matinal TEXT;
