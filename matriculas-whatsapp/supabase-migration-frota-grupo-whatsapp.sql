-- Migração: grupo de WhatsApp para o resumo de Disponibilidade da Frota
-- Execute no SQL Editor do Supabase.

-- Grupo que recebe a imagem-resumo da Disponibilidade (botão manual na aba
-- Disponibilidade de /distribuicao/frota) — mesmo padrão usado em
-- grupo_gsdpq_whatsapp. Configurado em /distribuicao/frota/placas.
ALTER TABLE filiais ADD COLUMN IF NOT EXISTS grupo_frota_whatsapp TEXT;
