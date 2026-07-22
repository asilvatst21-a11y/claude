-- Migração: Fechamento do Dia — IV-Deslocamento entra no Farol (v7)
-- Execute no SQL Editor do Supabase (depois da v1..v6). Idempotente.
--
-- O Farol Motoristas automático passa a considerar também o IV-Deslocamento
-- (checklist_tml) como critério de destaque/bate-papo, junto com Aderência,
-- Devolução Fora do Raio, TML e Devolução.

alter table fechamento_dia_farol_motoristas add column if not exists iv_deslocamento_ok boolean;
