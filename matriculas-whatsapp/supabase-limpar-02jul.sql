-- Limpa TODAS as tabelas TML para as datas 02/07 e 07/02
-- (data correta + data invertida pelo Excel).
-- Execute no SQL Editor do Supabase antes de reimportar tudo do zero.

-- 1. Histórico (principal — é o que aparece no painel)
DELETE FROM historico_tml
WHERE data_saida IN ('2026-07-02', '2026-02-07');

-- 2. Alertas (sem isso o reimport pula os mapas que já tinham alerta)
DELETE FROM alertas_tml
WHERE data_saida IN ('2026-07-02', '2026-02-07');

-- 3. Saídas brutas
DELETE FROM saidas_tml
WHERE data_saida IN ('2026-07-02', '2026-02-07');

-- 4. Escala do dia (chave única é filial+mapa, deleta os registros existentes)
DELETE FROM escalas_tml
WHERE data_entrega IN ('2026-07-02', '2026-02-07');

-- Confirma que ficou vazio
SELECT 'historico_tml' AS tabela, COUNT(*) AS restantes FROM historico_tml WHERE data_saida   IN ('2026-07-02', '2026-02-07')
UNION ALL
SELECT 'alertas_tml',  COUNT(*) FROM alertas_tml  WHERE data_saida   IN ('2026-07-02', '2026-02-07')
UNION ALL
SELECT 'saidas_tml',   COUNT(*) FROM saidas_tml   WHERE data_saida   IN ('2026-07-02', '2026-02-07')
UNION ALL
SELECT 'escalas_tml',  COUNT(*) FROM escalas_tml  WHERE data_entrega IN ('2026-07-02', '2026-02-07');
