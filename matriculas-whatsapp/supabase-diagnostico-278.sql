-- Diagnóstico pontual: mapas 278xxx ainda aparecendo como se fossem do
-- dia 07/08 no "Detalhe por mapa", quando na verdade o dia deveria começar
-- na faixa 279xxx.

-- 1) Estado atual em historico_tml (a fonte da tela) pros mapas 278xxx que
--    hoje aparecem gravados em 07/08.
SELECT mapa, data_saida, sala, placa, resultado
FROM historico_tml
WHERE mapa BETWEEN 278000 AND 278999 AND data_saida = '2026-08-07'
ORDER BY mapa;

-- 2) O que o checklist (fonte confiável) diz pra esses mesmos mapas —
--    se aqui também aparecer 2026-08-07, o problema é outro (não é mais o
--    bug antigo do "Data da operação", já que o checklist não passa por
--    aquele campo).
SELECT mapa, data
FROM checklist_tml
WHERE mapa BETWEEN 278000 AND 278999
ORDER BY mapa;

-- 3) E o que saidas_tml (a tabela bruta da portaria) diz pra esses mapas.
SELECT mapa, data_saida, importado_em
FROM saidas_tml
WHERE mapa BETWEEN 278000 AND 278999 AND data_saida = '2026-08-07'
ORDER BY mapa;
