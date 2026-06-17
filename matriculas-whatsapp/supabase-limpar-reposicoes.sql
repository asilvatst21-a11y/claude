-- Limpeza do histórico de Reposições, para reiniciar do zero.
-- Execute no SQL Editor do Supabase.
-- ATENÇÃO: operação destrutiva e irreversível. Confirme antes de rodar.

truncate table reposicoes restart identity;
truncate table reposicao_confirmacoes restart identity;
