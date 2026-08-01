-- Migração: adiciona motorista e placa ao lançamento de Chapa/Descarga.
-- Esses dados são puxados automaticamente de frota_motorista_base (mesma
-- tabela alimentada pela Base do Mapa, importada em Financeiro >
-- Catálogo/Vendas) — sem a Base importada para o mapa, o campo fica em
-- branco no recibo para preenchimento manual.
-- Execute no SQL Editor do Supabase. Idempotente.

alter table financeiro_chapa_lancamentos add column if not exists motorista text;
alter table financeiro_chapa_lancamentos add column if not exists placa text;
