-- Apaga TODOS os dados de variável (histórico completo de pontuação).
-- Rode no SQL Editor do Supabase.
--
-- ⚠️ Isto apaga o histórico inteiro da tabela variavel_pontuacao (todos os dias,
-- todas as filiais). NÃO tem volta. Preserva o CADASTRO de colaboradores
-- (armazem_colaboradores) e os CLUSTERS (variavel_clusters), que são
-- configuração — não são "dados de variável".

-- 1) Confira o tamanho antes de apagar:
SELECT count(*) AS linhas, min(data) AS primeiro_dia, max(data) AS ultimo_dia
FROM variavel_pontuacao;

-- 2) Apaga TUDO (descomente e rode DEPOIS de conferir acima):
-- TRUNCATE TABLE variavel_pontuacao;

-- Alternativa equivalente, se preferir DELETE em vez de TRUNCATE:
-- DELETE FROM variavel_pontuacao;
