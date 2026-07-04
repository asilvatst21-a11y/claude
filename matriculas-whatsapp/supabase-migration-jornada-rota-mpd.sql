-- Coluna MPD (03.11.49.02, coluna Q) — quando o valor é "PC Financeira",
-- a rota já foi prestada contas/finalizada. Usada pra saber com certeza se
-- o mapa bateu a jornada, em vez de só estimar por % de conclusão.
ALTER TABLE escalas_tml ADD COLUMN IF NOT EXISTS mpd_status TEXT;
