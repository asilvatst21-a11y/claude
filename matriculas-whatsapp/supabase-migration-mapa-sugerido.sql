-- Migração: confirmação de correção de mapa no fluxo de Reposições.
-- Quando o PDV informado pelo motorista consta no faturamento do dia com um
-- mapa diferente do que ele digitou, o bot agora sugere o mapa correto e pede
-- confirmação antes de registrar. Execute no SQL Editor do Supabase. Idempotente.

alter table reposicao_confirmacoes add column if not exists mapa_sugerido text;
