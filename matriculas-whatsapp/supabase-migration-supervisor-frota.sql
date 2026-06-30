-- Migração: telefone do supervisor de frota (Fixação de Motorista)
-- Execute no SQL Editor do Supabase.

-- Número de WhatsApp (com DDD, sem o 55) do supervisor de frota que recebe
-- o resumo de aderência do dia assim que todas as divergências da Fixação
-- de Motorista daquele dia forem justificadas pelos supervisores de sala.
-- Configurado em /distribuicao/frota/placas.
ALTER TABLE filiais ADD COLUMN IF NOT EXISTS telefone_supervisor_frota TEXT;
