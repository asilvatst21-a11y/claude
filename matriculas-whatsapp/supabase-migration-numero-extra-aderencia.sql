-- Migração: número extra que recebe a mensagem de aderência das duas salas
-- (COLORADO e SUB-FURIA), além dos supervisores e do grupo de monitoramento.
-- Execute no SQL Editor do Supabase.

alter table filiais add column if not exists numero_extra_aderencia_whatsapp text;
