-- Solicitação Extra — Entrega/Recolha de Materiais: guarda o endereço
-- digitado e o KM previsto (ida + volta) calculado a partir da sede
-- (Rua Mário Gelli, 119) via Google Maps Distance Matrix.
-- Execute no SQL Editor do Supabase.

alter table solicitacoes_extra add column if not exists endereco_entrega text;
alter table solicitacoes_extra add column if not exists km_previsto numeric;
