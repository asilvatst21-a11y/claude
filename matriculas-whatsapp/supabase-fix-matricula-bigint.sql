-- Correção rápida: matrícula como BIGINT (valores excedem o limite de INTEGER ~2,1 bi)
-- Execute no SQL Editor do Supabase.

ALTER TABLE escalas_tml         ALTER COLUMN matricula TYPE BIGINT;
ALTER TABLE saidas_tml          ALTER COLUMN matricula TYPE BIGINT;
ALTER TABLE alertas_tml         ALTER COLUMN matricula TYPE BIGINT;
ALTER TABLE motoristas_sala_tml ALTER COLUMN matricula TYPE BIGINT;
