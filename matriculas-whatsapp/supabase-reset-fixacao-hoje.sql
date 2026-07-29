-- Reseta os alertas de Fixação de Motorista DE HOJE, pra tentar reenviar.
-- Execute no SQL Editor do Supabase.
--
-- Limpa justificativa/resposta/zaapId e devolve o status pra 'erro' —
-- assim o "Forçar envio de justificativas" (que só pula quem está
-- 'pendente'/'enviado') reprocessa todas as divergências de hoje de novo.

update alertas_fixacao_motorista
set
  status = 'erro',
  justificativa = null,
  justificado_em = null,
  resposta_supervisor = null,
  respondido_em = null,
  zapi_message_id = null
where data = current_date;

-- Confira o que foi limpo:
select filial, placa, data, numero, status
from alertas_fixacao_motorista
where data = current_date
order by placa;
