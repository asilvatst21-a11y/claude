-- Correção: mapa e matrícula como BIGINT (valores excedem o limite de INTEGER ~2,1 bi)
-- Execute no SQL Editor do Supabase.

-- Matrícula
ALTER TABLE escalas_tml         ALTER COLUMN matricula TYPE BIGINT;
ALTER TABLE saidas_tml          ALTER COLUMN matricula TYPE BIGINT;
ALTER TABLE alertas_tml         ALTER COLUMN matricula TYPE BIGINT;
ALTER TABLE motoristas_sala_tml ALTER COLUMN matricula TYPE BIGINT;

-- Mapa (pode receber números grandes dependendo da planilha)
ALTER TABLE escalas_tml ALTER COLUMN mapa TYPE BIGINT;
ALTER TABLE saidas_tml  ALTER COLUMN mapa TYPE BIGINT;
ALTER TABLE alertas_tml ALTER COLUMN mapa TYPE BIGINT;

-- Verificação dos tipos resultantes
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('escalas_tml','saidas_tml','alertas_tml','motoristas_sala_tml')
  AND column_name IN ('mapa','matricula')
ORDER BY table_name, column_name;
