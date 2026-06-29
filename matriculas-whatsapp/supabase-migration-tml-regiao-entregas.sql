-- Migração: território/região realizada (TML) para cruzamento com Frota
-- Execute no SQL Editor do Supabase.

-- A planilha de Escala do dia (03.11.49.02) também traz "Região +Entregas" e
-- "Cidades +Entregas" por mapa (roteirização/PCD) — guardamos isso junto da
-- escala e propagamos para o histórico no mesmo fluxo que já junta placa e
-- matrícula por mapa, sem precisar de um upload separado.
ALTER TABLE escalas_tml   ADD COLUMN IF NOT EXISTS regiao_entregas TEXT;
ALTER TABLE escalas_tml   ADD COLUMN IF NOT EXISTS cidades_entregas TEXT;
ALTER TABLE historico_tml ADD COLUMN IF NOT EXISTS regiao_entregas TEXT;
