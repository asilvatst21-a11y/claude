-- Apaga TODOS os colaboradores cadastrados na aba Colaboradores de
-- Armazém → Variável (todas as filiais). NÃO tem volta.
--
-- Isso NÃO apaga o histórico de pontuação já lançado (variavel_pontuacao)
-- nem os clusters (variavel_clusters) — só o cadastro (armazem_colaboradores).
-- Pontuação já lançada permanece com o nome do colaborador gravado na
-- própria linha (não depende de FK pro cadastro), mas o colaborador some
-- da lista de cadastro e não vai mais casar com novos relatórios de
-- pontuação até ser recadastrado.
--
-- Rode no SQL Editor do Supabase.

-- 1) Confira quantos serão apagados antes de rodar o DELETE:
SELECT filial, count(*) AS colaboradores
FROM armazem_colaboradores
GROUP BY filial
ORDER BY filial;

-- 2) Apaga TUDO, de todas as filiais (descomente e rode DEPOIS de conferir acima):
-- DELETE FROM armazem_colaboradores;
