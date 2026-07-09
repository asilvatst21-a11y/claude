-- ───────────────────────────────────────────────────────────────────────────
-- C1 (parte 2) — Tabelas que ficaram de fora da primeira migração
--
-- A primeira migração (supabase-c1-anon-vales.sql) liberou a anon em 11
-- tabelas, mas uma varredura incompleta (chamadas valesSupabase.from(...)
-- quebradas em duas linhas no código) deixou estas 4 de fora — por isso a
-- aba Vales (e possivelmente Importações / contestação de vale) ficou
-- zerada depois da troca da service_role pela chave anônima.
--
-- 'filiais' e 'produtos' já tinham policy liberando a anon antes disso —
-- não precisam de nada aqui.
--
-- Pode rodar tudo de uma vez no SQL Editor.
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tabelas text[] := array[
    'vales',
    'vale_ajudantes',
    'vale_notas',
    'importacoes'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "anon acesso vales" on %I', t);
    execute format(
      'create policy "anon acesso vales" on %I for all to anon, authenticated using (true) with check (true)',
      t
    );

    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;

-- Conferência: liste as políticas criadas.
-- select tablename, policyname, roles, cmd
-- from pg_policies
-- where policyname = 'anon acesso vales'
-- order by tablename;
