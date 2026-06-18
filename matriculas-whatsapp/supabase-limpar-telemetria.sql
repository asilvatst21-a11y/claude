-- Limpeza do histórico de Telemetria, para reiniciar do zero.
-- Execute no SQL Editor do Supabase.
-- ATENÇÃO: operação destrutiva e irreversível. Confirme antes de rodar.

truncate table telemetria_acoes restart identity;
truncate table telemetria_alertas restart identity;
