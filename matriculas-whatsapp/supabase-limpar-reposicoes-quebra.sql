-- Remove a(s) reposição(ões) com status "quebra" (status legado, não é
-- mais usado: a partir de agora as negativas do grupo de validação entram
-- como "negado"). Execute no SQL Editor do Supabase.
-- ATENÇÃO: operação destrutiva e irreversível. Confirme antes de rodar.

delete from reposicoes where status = 'quebra';
