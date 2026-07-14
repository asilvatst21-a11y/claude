-- Diagnóstico: encontra Solicitações Extra que provavelmente foram salvas
-- com o valor "único" gravado direto como total, SEM multiplicar pela
-- quantidade de pessoas (o bug corrigido no código). São candidatas a
-- correção: têm mais de uma pessoa na equipe (motorista + pelo menos um
-- ajudante) mas nenhum valor individual foi gravado por pessoa.
-- Execute no SQL Editor do Supabase — é só leitura, não altera nada.

select id, data_solicitacao, nome_solicitante, local, mapa,
       motorista_nome, ajudante1_nome, ajudante2_nome,
       valor_acordado, valor_motorista, valor_ajudante1, valor_ajudante2
from solicitacoes_extra
where valor_acordado is not null
  and valor_motorista is null
  and valor_ajudante1 is null
  and valor_ajudante2 is null
  and (
    (motorista_nome is not null and ajudante1_nome is not null) or
    (motorista_nome is not null and ajudante2_nome is not null) or
    (ajudante1_nome is not null and ajudante2_nome is not null)
  )
order by data_solicitacao desc;

-- Para cada linha que aparecer aqui e for de fato um caso de "valor único"
-- mal multiplicado, corrija manualmente pela tela: Distribuição →
-- Solicitação Extra → clique no lápis ao lado do valor da linha.
