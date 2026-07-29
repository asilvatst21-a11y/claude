-- Reset dos alertas de Fixação marcados como "enviado" por engano.
-- Execute no SQL Editor do Supabase. Seguro de repetir.
--
-- Contexto: até 29/07/2026 o código considerava QUALQUER resposta HTTP 200
-- da Z-API como envio bem-sucedido — mas a Z-API responde 200 também quando
-- o envio falha, sinalizando o erro só no corpo ({"error": "..."}). Por isso
-- vários alertas ficaram gravados como 'enviado' sem a mensagem ter chegado
-- ao supervisor. Como "já tinham alerta" pula esses registros, eles nunca
-- seriam reprocessados — este script devolve pra 'erro' os que claramente
-- não tiveram retorno do supervisor, liberando o "Forçar envio".
--
-- Só mexe em alerta SEM resposta e SEM justificativa: um alerta que o
-- supervisor já respondeu/justificou não é tocado.

update alertas_fixacao_motorista
set status = 'erro'
where status = 'enviado'
  and resposta_supervisor is null
  and justificativa is null
  and data >= current_date - interval '7 days';

-- Confira o que ficou liberado pra reenvio:
select filial, placa, data, numero, status
from alertas_fixacao_motorista
where data >= current_date - interval '7 days'
order by data desc, placa;
