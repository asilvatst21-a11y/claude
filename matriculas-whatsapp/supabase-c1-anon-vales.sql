-- ───────────────────────────────────────────────────────────────────────────
-- C1 — Tirar a service_role do bundle
--
-- O front deixou de usar a service_role (VITE_SUPABASE_SERVICE_KEY) e passou a
-- usar a chave anônima também no módulo de Vales/Frota. Para que os imports e
-- gravações continuem funcionando, a role `anon` (e `authenticated`) precisa de
-- acesso às tabelas que aquele cliente toca.
--
-- Importante: isso NÃO amplia a exposição. Hoje a service_role está no bundle e
-- já dá acesso a TUDO ignorando o RLS. Depois desta mudança, a anon acessa
-- apenas estas ~11 tabelas do módulo, e a chave-mestra sai do JS e é rotacionada.
--
-- ORDEM DE EXECUÇÃO (importante):
--   1) Rode esta migração PRIMEIRO (libera a anon).
--   2) Só então suba o deploy que aponta o valesSupabase para a anon.
--   3) Depois de testar Vales/Frota, rotacione a service_role no Supabase.
--
-- Pode rodar tudo de uma vez no SQL Editor.
-- ───────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tabelas text[] := array[
    'ajudantes',
    'alertas_fixacao_motorista',
    'configuracoes',
    'frota_motorista_base',
    'frota_territorio_historico',
    'mapa_equipe',
    'motoristas_sala_tml',
    'notificacoes',
    'reposicoes',
    'vale_itens',
    'vendas_dia'
  ];
begin
  foreach t in array tabelas loop
    -- Garante RLS ligado (se já estiver, não faz nada).
    execute format('alter table %I enable row level security', t);

    -- Política permissiva para anon/authenticated (mesmo modelo "Acesso total"
    -- já usado no projeto). Recriada de forma idempotente.
    execute format('drop policy if exists "anon acesso vales" on %I', t);
    execute format(
      'create policy "anon acesso vales" on %I for all to anon, authenticated using (true) with check (true)',
      t
    );

    -- Privilégio de tabela (RLS filtra as linhas, mas o GRANT é o que permite a
    -- operação em si). Sem isto, tabelas que só concediam service_role barram.
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;

-- Conferência: liste as políticas criadas.
-- select tablename, policyname, roles, cmd
-- from pg_policies
-- where policyname = 'anon acesso vales'
-- order by tablename;
