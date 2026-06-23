-- Migração: TML — adiciona coluna "nome" (motorista) em alertas_tml/historico_tml
-- e reseta os dados de teste para reprocessar com as novas regras.
-- Execute no SQL Editor do Supabase.

-- 1. Novas colunas
ALTER TABLE alertas_tml    ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE historico_tml  ADD COLUMN IF NOT EXISTS nome TEXT;

-- 2. Reset para reprocessar a planilha de saída do zero com as mudanças
--    (apaga alertas, histórico e saídas importadas; mantém escala e roster)
DELETE FROM historico_tml;
DELETE FROM alertas_tml;
DELETE FROM saidas_tml;
