-- Diagnóstico: estado atual das tabelas TML para as últimas datas

-- 1. O que está em historico_tml?
SELECT 'historico_tml' AS tabela, data_saida, sala, COUNT(*) AS total
FROM historico_tml
GROUP BY data_saida, sala
ORDER BY data_saida DESC
LIMIT 20;

-- 2. O que está em saidas_tml?
SELECT 'saidas_tml' AS tabela, data_saida, COUNT(*) AS total
FROM saidas_tml
GROUP BY data_saida
ORDER BY data_saida DESC
LIMIT 10;

-- 3. O que está em escalas_tml?
SELECT 'escalas_tml' AS tabela, data_entrega, COUNT(*) AS total
FROM escalas_tml
GROUP BY data_entrega
ORDER BY data_entrega DESC
LIMIT 10;

-- 4. Detalhe: mapas sem sala em historico_tml para hoje
SELECT mapa, matricula, nome, placa, sala, resultado, observacao
FROM historico_tml
WHERE data_saida = CURRENT_DATE
ORDER BY mapa;
