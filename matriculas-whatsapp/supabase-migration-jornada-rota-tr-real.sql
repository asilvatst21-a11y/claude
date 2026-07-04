-- Hora real da última entrega finalizada do mapa (BEES) — usada pra calcular
-- o TR Real de mapas já finalizados (MPD = "PC Financeira") comparando com o
-- horário de saída, em vez de comparar com "agora". Comparar com "agora"
-- inflava o TR Real de rotas já encerradas conforme o dia ia passando,
-- fazendo o sistema prever "não bate jornada" pra rotas que já bateram.
ALTER TABLE jornada_bees ADD COLUMN IF NOT EXISTS ultima_finalizacao TIMESTAMPTZ;
