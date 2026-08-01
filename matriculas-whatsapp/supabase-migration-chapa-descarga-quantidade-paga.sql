-- Migração: permite ajustar a quantidade de chapas/pallets efetivamente
-- paga, diferente da sugerida pelo cálculo automático (ex.: nota de R$ 9.830
-- calcularia 1 chapa, mas negociou-se pagar 2). O valor da nota/contagem de
-- pallets informado continua registrado como veio, só a quantidade paga (e o
-- valor final) refletem o ajuste.
-- Execute no SQL Editor do Supabase. Idempotente.

alter table financeiro_chapa_lancamentos add column if not exists quantidade_paga int;
alter table financeiro_chapa_lancamentos add column if not exists valor_unitario numeric;
