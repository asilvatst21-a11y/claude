-- Diagnóstico do bug de dd/mm vs mm/dd no parser de TML (ver
-- src/lib/tmlParser.ts, excelDateToISO — corrigido em commit
-- "Remove heurística ambígua de data no parser de TML").
--
-- Antes do fix, uma data como "07/08" (7 de agosto) podia virar
-- "2026-08-07" numa tabela e "2026-07-08" (8 de julho, invertida) em outra,
-- dependendo do momento do upload. Ajuste as duas datas abaixo pro par
-- suspeito que você quer investigar (dd/mm e mm/dd trocados) antes de rodar.

-- 1) Volume por dia em cada tabela, nas duas datas candidatas.
--    Se uma delas tiver volume muito maior que o esperado pra escala do
--    dia, é sinal de mapas de outros dias caindo ali por engano.
SELECT 'historico_tml' AS tabela, data_saida::text AS data, COUNT(*) AS total
FROM historico_tml WHERE data_saida IN ('2026-08-07', '2026-07-08')
GROUP BY data_saida
UNION ALL
SELECT 'checklist_tml', data::text, COUNT(*)
FROM checklist_tml WHERE data IN ('2026-08-07', '2026-07-08')
GROUP BY data
UNION ALL
SELECT 'matinal_tml', data::text, COUNT(*)
FROM matinal_tml WHERE data IN ('2026-08-07', '2026-07-08')
GROUP BY data
UNION ALL
SELECT 'escalas_tml', data_entrega::text, COUNT(*)
FROM escalas_tml WHERE data_entrega IN ('2026-08-07', '2026-07-08')
GROUP BY data_entrega
UNION ALL
SELECT 'saidas_tml', data_saida::text, COUNT(*)
FROM saidas_tml WHERE data_saida IN ('2026-08-07', '2026-07-08')
GROUP BY data_saida
ORDER BY tabela, data;

-- 2) Mapas em historico_tml no dia 07/08 que NÃO têm checklist casando na
--    mesma data — candidatos a terem sido invertidos em uma tabela e não
--    na outra (o sintoma relatado: "horários não batem").
SELECT h.mapa, h.placa, h.sala, h.data_saida, h.horario_saida
FROM historico_tml h
LEFT JOIN checklist_tml c ON c.mapa = h.mapa AND c.data = h.data_saida
WHERE h.data_saida = '2026-08-07' AND c.mapa IS NULL
ORDER BY h.mapa;

-- 3) O mesmo mapa aparecendo em datas diferentes entre historico_tml e
--    checklist_tml (prova direta de inversão dd/mm — o mapa é o mesmo,
--    só a data que ficou diferente entre as duas tabelas).
SELECT h.mapa, h.data_saida AS data_historico, c.data AS data_checklist
FROM historico_tml h
JOIN checklist_tml c ON c.mapa = h.mapa
WHERE h.data_saida <> c.data
  AND (h.data_saida IN ('2026-08-07', '2026-07-08') OR c.data IN ('2026-08-07', '2026-07-08'))
ORDER BY h.mapa;
