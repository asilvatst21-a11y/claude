-- ───────────────────────────────────────────────────────────────────────────
-- Fase B — Fechar a tabela `usuarios` para a chave anônima
--
-- Até agora a policy "Acesso total" deixava qualquer um (com a chave anônima do
-- bundle) ler TODOS os logins e senhas. Agora todo acesso a `usuarios` passa
-- pelo servidor: api/login (autenticação) e api/usuarios (CRUD do Admin e dos
-- Operadores), que usam a service_role e ignoram o RLS.
--
-- ⚠️ PRÉ-REQUISITO OBRIGATÓRIO: a variável de ambiente SUPABASE_SERVICE_ROLE
-- precisa estar configurada no Vercel ANTES de rodar isto. Sem ela, o api/login
-- cai no fallback da chave anônima e, com a tabela fechada, o LOGIN PARA de
-- funcionar. Confirme no Vercel (Settings → Environment Variables) primeiro.
--
-- ORDEM: 1) SUPABASE_SERVICE_ROLE no Vercel  2) deploy do código da Fase B
--        3) testar Admin/Operadores/login  4) rodar esta migração  5) testar de novo.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) Remove a policy permissiva que liberava a anon.
drop policy if exists "Acesso total" on usuarios;

-- 2) Garante o RLS ligado (sem policy para anon = anon bloqueado).
alter table usuarios enable row level security;

-- 3) Belt-and-suspenders: remove os privilégios de tabela da anon/authenticated
--    (a service_role tem grants próprios e ignora RLS, então segue funcionando).
revoke all on table usuarios from anon;
revoke all on table usuarios from authenticated;

-- Conferência (opcional): não deve sobrar policy concedendo acesso à anon.
-- select policyname, roles, cmd from pg_policies where tablename = 'usuarios';
-- E o teste real: com a chave anônima, um SELECT em usuarios deve dar
-- "permission denied" / retornar vazio.
