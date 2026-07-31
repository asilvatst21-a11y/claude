-- Migração: "Ajudante responsável" da RV por turno passa a apontar pro
-- cadastro central de Colaboradores (Gente), não mais pro cadastro
-- específico da Variável por pontuação (armazem_colaboradores).
-- Execute no SQL Editor do Supabase. Idempotente.

ALTER TABLE variavel_turno_atividades DROP CONSTRAINT IF EXISTS variavel_turno_atividades_colaborador_id_fkey;
ALTER TABLE variavel_turno_atividades
  ADD CONSTRAINT variavel_turno_atividades_colaborador_id_fkey
  FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL;
