-- Migração: competência de pagamento + marcação de PAGO na Solicitação Extra.
-- Execute no SQL Editor do Supabase (depois das migrações anteriores da tabela).

-- Competência de pagamento no formato 'YYYY-MM' (ex.: '2026-07' = 07/2026).
alter table solicitacoes_extra add column if not exists competencia_pagamento text;

-- Marcação de pago (aplica o "risco" na linha) + data em que foi marcado.
alter table solicitacoes_extra add column if not exists pago boolean not null default false;
alter table solicitacoes_extra add column if not exists pago_em timestamptz;

-- (Opcional) Preenche a competência dos registros antigos com o mês da
-- solicitação — assim eles já aparecem no filtro. Descomente para rodar:
-- update solicitacoes_extra
--   set competencia_pagamento = to_char(data_solicitacao, 'YYYY-MM')
--   where competencia_pagamento is null;

create index if not exists idx_solicitacoes_extra_competencia
  on solicitacoes_extra(filial, competencia_pagamento);
