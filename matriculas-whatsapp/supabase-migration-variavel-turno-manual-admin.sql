-- Migração: novo tipo de registro "manual_admin" — atividades como TMA e
-- Eficiência de Carregamento deixam de ser "upload" e passam a ser
-- lançadas manualmente, todo dia, direto no painel (não pelo conferente).
-- Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE variavel_turno_atividades DROP CONSTRAINT IF EXISTS variavel_turno_atividades_tipo_registro_check;
ALTER TABLE variavel_turno_atividades ADD CONSTRAINT variavel_turno_atividades_tipo_registro_check
  CHECK (tipo_registro IN ('manual', 'upload', 'manual_admin'));
