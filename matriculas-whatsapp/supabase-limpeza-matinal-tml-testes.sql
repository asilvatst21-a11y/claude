-- Limpeza pontual: remove os registros de teste do Timer da Matinal.
-- Execute no SQL Editor do Supabase. NÃO é idempotente nem parte do
-- schema — é só para apagar dados de teste, não rode de novo depois.

-- Opção 1: apaga só os registros de ontem e hoje (mais seguro).
delete from matinal_tml
where data >= current_date - 1;

-- Opção 2 (descomente se quiser apagar TODOS os registros já feitos,
-- inclusive de dias anteriores aos testes):
-- delete from matinal_tml;
