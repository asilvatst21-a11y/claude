-- Migração: Dúvidas da Matinal — abre para qualquer pessoa (v3)
-- Execute DEPOIS de supabase-migration-treinamentos-matinal-v2.sql. Idempotente.
--
-- Agora qualquer número pode tirar dúvida, mesmo sem estar cadastrado em
-- motoristas_sala_tml — basta mandar a frase de início ("dúvida" ou
-- "treinamento"). Quando o telefone não é reconhecido, o bot pergunta a
-- filial e a sala antes de mostrar os treinamentos — por isso a sessão
-- precisa guardar filial/sala escolhidas manualmente.

alter table matinal_duvida_sessoes add column if not exists filial text;
alter table matinal_duvida_sessoes add column if not exists sala text;
