-- Corrige o bug: upload de "Saída" (DistribuicaoTML.tsx > handleSaida) usa o
-- campo "Data da operação" (que volta pra hoje toda vez que a página é
-- aberta — dataOperacao = useState(hojeISO)) em vez da data real do
-- relatório. Como saidas_tml só tem UNIQUE(filial, mapa) — sem a data — um
-- upload feito hoje (07/08) sem trocar esse campo sobrescreveu a
-- data_saida de ~2.400 mapas antigos (de junho até início de agosto) pra
-- 2026-08-07.
--
-- checklist_tml NÃO passa por esse campo (usa a data de dentro do próprio
-- arquivo, onConflict 'filial,mapa,data'), então continua com a data real
-- de cada mapa — é a fonte usada aqui pra restaurar o valor certo.
--
-- Rode a ETAPA 1 primeiro e confira a lista antes de rodar a ETAPA 2.

-- ═══ ETAPA 1 — conferência (não altera nada) ═══════════════════════════

-- Quantos mapas em cada tabela estão hoje presos em 2026-08-07 mas têm uma
-- data diferente e confiável no checklist.
SELECT 'saidas_tml' AS tabela, COUNT(*) AS mapas_a_corrigir
FROM saidas_tml s
JOIN checklist_tml c ON c.filial = s.filial AND c.mapa = s.mapa
WHERE s.data_saida = '2026-08-07' AND c.data <> '2026-08-07'
UNION ALL
SELECT 'historico_tml', COUNT(*)
FROM historico_tml h
JOIN checklist_tml c ON c.filial = h.filial AND c.mapa = h.mapa
WHERE h.data_saida = '2026-08-07' AND c.data <> '2026-08-07'
UNION ALL
SELECT 'alertas_tml', COUNT(*)
FROM alertas_tml a
JOIN checklist_tml c ON c.filial = a.filial AND c.mapa = a.mapa
WHERE a.data_saida = '2026-08-07' AND c.data <> '2026-08-07';

-- Amostra: mapa, data errada atual, data correta que será aplicada.
SELECT h.mapa, h.data_saida AS data_atual_errada, c.data AS data_correta
FROM historico_tml h
JOIN checklist_tml c ON c.filial = h.filial AND c.mapa = h.mapa
WHERE h.data_saida = '2026-08-07' AND c.data <> '2026-08-07'
ORDER BY c.data, h.mapa
LIMIT 50;

-- ═══ ETAPA 2 — correção (só rode depois de conferir a ETAPA 1) ════════

-- saidas_tml: UNIQUE(filial, mapa) só — update direto, sem risco de conflito.
UPDATE saidas_tml s
SET data_saida = c.data
FROM checklist_tml c
WHERE c.filial = s.filial AND c.mapa = s.mapa
  AND s.data_saida = '2026-08-07' AND c.data <> '2026-08-07';

-- historico_tml: UNIQUE(filial, mapa, data) — pula se por acaso já existir
-- uma linha desse mapa na data correta (evita violar a constraint).
UPDATE historico_tml h
SET data_saida = c.data
FROM checklist_tml c
WHERE c.filial = h.filial AND c.mapa = h.mapa
  AND h.data_saida = '2026-08-07' AND c.data <> '2026-08-07'
  AND NOT EXISTS (
    SELECT 1 FROM historico_tml h2
    WHERE h2.filial = h.filial AND h2.mapa = h.mapa AND h2.data_saida = c.data
  );

-- alertas_tml: idem, sem UNIQUE por data — update direto.
UPDATE alertas_tml a
SET data_saida = c.data
FROM checklist_tml c
WHERE c.filial = a.filial AND c.mapa = a.mapa
  AND a.data_saida = '2026-08-07' AND c.data <> '2026-08-07';

-- ═══ ETAPA 3 — confirma que sumiu ══════════════════════════════════════
SELECT 'saidas_tml' AS tabela, COUNT(*) AS restantes_errados
FROM saidas_tml s JOIN checklist_tml c ON c.filial = s.filial AND c.mapa = s.mapa
WHERE s.data_saida = '2026-08-07' AND c.data <> '2026-08-07'
UNION ALL
SELECT 'historico_tml', COUNT(*)
FROM historico_tml h JOIN checklist_tml c ON c.filial = h.filial AND c.mapa = h.mapa
WHERE h.data_saida = '2026-08-07' AND c.data <> '2026-08-07'
UNION ALL
SELECT 'alertas_tml', COUNT(*)
FROM alertas_tml a JOIN checklist_tml c ON c.filial = a.filial AND c.mapa = a.mapa
WHERE a.data_saida = '2026-08-07' AND c.data <> '2026-08-07';

-- Volume real do dia 07/08 depois da correção (deve ficar bem menor).
SELECT data_saida, COUNT(*) AS total
FROM historico_tml
WHERE data_saida = '2026-08-07'
GROUP BY data_saida;
