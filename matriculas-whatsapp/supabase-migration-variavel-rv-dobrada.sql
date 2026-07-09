-- Adiciona a marcação de "RV Dobrada" por dia lançado na Variável do Armazém.
-- Quando marcada no momento do import, o VALOR daquele dia é dobrado (a
-- pontuação em si não muda, só o valor pago).
-- Rode no SQL Editor do Supabase.

ALTER TABLE variavel_pontuacao
  ADD COLUMN IF NOT EXISTS rv_dobrada boolean NOT NULL DEFAULT false;
