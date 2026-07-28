-- Migração: sugestões vindas do menu de autoatendimento da Aurora (chat),
-- não só do fluxo automático ao finalizar mapa da Conferência Digital.
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- O envio automático de "tem sugestão?" ao finalizar um mapa foi REMOVIDO
-- (ver ConferenciaDigital.tsx) — agora "Sugestões" é uma opção dentro do
-- menu da Aurora, disponível a qualquer momento pra qualquer colaborador,
-- sem estar amarrada a um mapa específico. `mapa` e `data` deixam de ser
-- obrigatórios porque uma sugestão vinda do chat geral não tem mapa/dia
-- associado.

ALTER TABLE conferencia_sugestoes ALTER COLUMN mapa DROP NOT NULL;
ALTER TABLE conferencia_sugestoes ALTER COLUMN data DROP NOT NULL;
