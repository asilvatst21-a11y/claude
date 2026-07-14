-- Corrige o valor da Solicitação Extra do Deivison Rangel (10/07/2026, Itaipava)
-- que foi salva com R$150 como total, mas deveria ser R$150 por pessoa (2
-- pessoas na equipe = R$300 no total).
-- Execute no SQL Editor do Supabase.

-- 1) Confira ANTES de rodar o UPDATE que é exatamente esta a linha certa:
select id, data_solicitacao, nome_solicitante, local, motorista_nome,
       ajudante1_nome, ajudante2_nome, valor_acordado, valor_motorista,
       valor_ajudante1, valor_ajudante2
from solicitacoes_extra
where data_solicitacao = '2026-07-10'
  and nome_solicitante = 'Deivison Rangel'
  and valor_acordado = 150;

-- 2) Se a linha acima for a correta (e só ela), rode o update:
update solicitacoes_extra
set valor_acordado = 300,
    valor_motorista = 150,
    valor_ajudante1 = 150
where data_solicitacao = '2026-07-10'
  and nome_solicitante = 'Deivison Rangel'
  and valor_acordado = 150;
