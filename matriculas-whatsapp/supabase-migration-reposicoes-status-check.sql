-- Corrige a constraint de status da tabela reposicoes: o valor "registrado"
-- (Registrado no sistema Ambev) era usado pelo código há tempos, mas a
-- constraint do banco só permitia pendente | validado | negado | quebra —
-- por isso tentativas de marcar como "registrado" (botão "Confirmar
-- registro" e o import do CORA) vinham falhando silenciosamente.
-- Execute no SQL Editor do Supabase.

alter table reposicoes drop constraint if exists reposicoes_status_check;
alter table reposicoes add constraint reposicoes_status_check
  check (status in ('pendente', 'validado', 'negado', 'quebra', 'registrado'));
