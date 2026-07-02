-- Corrige dados já gravados antes da regra "saída após 11h59 é inválida":
-- marca o histórico como inválido e remove os alertas indevidos (ex.:
-- TML-20260702-0040 — saída às 14:30, 360 min de atraso — não deveria
-- nunca ter virado alerta).
--
-- Saídas antes do início da matinal já eram tratadas como inválidas; este
-- script cobre só o caso novo (>= 12:00). Execute no SQL Editor do Supabase.

-- 1. Marca como inválido no histórico (não entra mais em nenhuma conta)
UPDATE historico_tml
SET
  resultado = 'invalido',
  horario_limite = NULL,
  atraso_minutos = NULL,
  observacao = 'Saída após 11h59 (invalidada automaticamente)'
WHERE horario_saida >= '12:00'
  AND resultado <> 'invalido';

-- 2. Remove os alertas de TML perdido criados indevidamente para essas saídas
DELETE FROM alertas_tml
WHERE horario_saida >= '12:00';

-- Confirma o resultado
SELECT data_saida, resultado, COUNT(*) AS total
FROM historico_tml
WHERE horario_saida >= '12:00'
GROUP BY data_saida, resultado
ORDER BY data_saida DESC;
