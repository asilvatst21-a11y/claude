-- Limpa a pontuação importada com a data errada (hoje) pra poder reimportar
-- o relatório certo. Rode no SQL Editor do Supabase.
--
-- Usei a data 2026-07-07 (hoje) explícita em vez de CURRENT_DATE de
-- propósito: CURRENT_DATE usa o fuso do servidor (UTC), que perto da
-- meia-noite no Brasil (UTC-3) já pode estar "amanhã" — a data literal
-- evita apagar o dia errado por causa disso. Se a data importada errada
-- foi outra, troque abaixo antes de rodar.

-- 1) Confira antes de apagar — o que tem hoje:
SELECT nome_relatorio, cpf, total, valor_calculado, importado_em
FROM variavel_pontuacao
WHERE data = '2026-07-07'
ORDER BY nome_relatorio;

-- 2) Apaga a pontuação de hoje (descomente e rode depois de conferir acima):
-- DELETE FROM variavel_pontuacao WHERE data = '2026-07-07';
