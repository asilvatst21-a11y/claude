-- Limpeza total das tabelas de TML alimentadas por planilha (upload) pros
-- dias 2026-08-07 e 2026-08-11, pra relançamento do zero depois do
-- incidente de "Data da operação" sobrescrevendo mapas antigos (ver
-- supabase-corrige-data-saida-07ago.sql e o fix em DistribuicaoTML.tsx que
-- passou a exigir digitar "SOBRESCREVER" em vez de um simples confirm()).
--
-- NÃO inclui conferencia_baias nem matinal_tml — essas duas são gravadas em
-- tempo real pelo bot do WhatsApp conforme a operação acontece, não vêm de
-- planilha, e apagá-las perderia registros reais que não dá pra reimportar.
--
-- Depois de rodar: reimportar escala → saída → checklist dos dois dias,
-- conferindo a "Data da operação" antes de cada upload.

DELETE FROM historico_tml WHERE data_saida   IN ('2026-08-07', '2026-08-11');
DELETE FROM alertas_tml   WHERE data_saida   IN ('2026-08-07', '2026-08-11');
DELETE FROM saidas_tml    WHERE data_saida   IN ('2026-08-07', '2026-08-11');
DELETE FROM escalas_tml   WHERE data_entrega IN ('2026-08-07', '2026-08-11');
DELETE FROM checklist_tml WHERE data         IN ('2026-08-07', '2026-08-11');

-- Confirma que os dois dias zeraram em todas as tabelas.
SELECT 'historico_tml' AS tabela, data_saida::text AS data, COUNT(*)
FROM historico_tml WHERE data_saida IN ('2026-08-07', '2026-08-11') GROUP BY data_saida
UNION ALL
SELECT 'alertas_tml', data_saida::text, COUNT(*)
FROM alertas_tml WHERE data_saida IN ('2026-08-07', '2026-08-11') GROUP BY data_saida
UNION ALL
SELECT 'saidas_tml', data_saida::text, COUNT(*)
FROM saidas_tml WHERE data_saida IN ('2026-08-07', '2026-08-11') GROUP BY data_saida
UNION ALL
SELECT 'escalas_tml', data_entrega::text, COUNT(*)
FROM escalas_tml WHERE data_entrega IN ('2026-08-07', '2026-08-11') GROUP BY data_entrega
UNION ALL
SELECT 'checklist_tml', data::text, COUNT(*)
FROM checklist_tml WHERE data IN ('2026-08-07', '2026-08-11') GROUP BY data;
