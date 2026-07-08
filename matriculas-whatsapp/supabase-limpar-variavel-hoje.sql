-- Apaga a variável/pontuação importada HOJE para poder reimportar.
-- Rode no SQL Editor do Supabase.
--
-- Uso a data 2026-07-08 (hoje) explícita em vez de CURRENT_DATE de propósito:
-- CURRENT_DATE usa o fuso do servidor (UTC), que perto da meia-noite no Brasil
-- (UTC-3) já pode estar "amanhã" — a data literal evita apagar o dia errado.
-- Se a data importada errada foi outra, troque abaixo antes de rodar.

-- 1) Confira antes de apagar — o que tem hoje:
SELECT nome_relatorio, cpf, total, valor_calculado, importado_em
FROM variavel_pontuacao
WHERE data = '2026-07-08'
ORDER BY nome_relatorio;

-- 2) Apaga a variável de hoje (descomente e rode DEPOIS de conferir acima):
-- DELETE FROM variavel_pontuacao WHERE data = '2026-07-08';
