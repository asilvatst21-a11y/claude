-- Corrige CPFs que perderam o(s) zero(s) à esquerda no import da planilha
-- (quando a coluna CPF vem como número no Excel, ex.: "01234567890" virava
-- "1234567890"). É exatamente esse tipo de CPF que quebra a busca do totem
-- por prefixo (os 3 primeiros dígitos ficam errados).
--
-- O código já foi corrigido (parseColaboradoresBuffer agora sempre
-- preenche com zero à esquerda até 11 dígitos). Este script só corrige quem
-- já tinha sido importado antes da correção.

-- 1) Confira antes de corrigir — quem está com CPF curto:
SELECT id, nome, cpf, length(cpf) AS tamanho
FROM armazem_colaboradores
WHERE length(cpf) <> 11
ORDER BY nome;

-- 2) Corrige em cima do mesmo registro (não recria linha, então não conflita
-- com o índice único de filial+cpf). Rode depois de conferir acima:
-- UPDATE armazem_colaboradores
-- SET cpf = lpad(cpf, 11, '0')
-- WHERE length(cpf) < 11;

-- 3) Se quiser confirmar que a pontuação de hoje já está linkando certo com
-- o CPF corrigido (cpf não deveria vir nulo pra quem tem cadastro):
-- SELECT nome_relatorio, cpf FROM variavel_pontuacao WHERE data = CURRENT_DATE;
