-- Incidente 12/08: 19 mapas (279861-279890) vieram do relatório 03.11.20
-- com a data de saída gravada como "2026-12-08" em vez de "2026-08-12" —
-- dia/mês trocado especificamente nas linhas "ao vivo" de hoje dessa
-- exportação (as linhas históricas do mesmo arquivo estavam corretas).
-- Confirmado pela sequência de mapas (continuação direta de 279859, de
-- ontem) e por horários de saída plausíveis (07h-08h da manhã).

UPDATE saidas_tml SET data_saida = '2026-08-12' WHERE data_saida = '2026-12-08';
UPDATE historico_tml SET data_saida = '2026-08-12' WHERE data_saida = '2026-12-08';
UPDATE alertas_tml SET data_saida = '2026-08-12' WHERE data_saida = '2026-12-08';

SELECT COUNT(*) FROM saidas_tml WHERE data_saida = '2026-12-08';
