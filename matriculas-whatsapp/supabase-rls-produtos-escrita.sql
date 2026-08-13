-- produtos só tinha policy de leitura (supabase-rls-catalogo.sql). O import
-- "Atualizar catálogo de produtos" (Financeiro > Faturamento do Dia) roda no
-- navegador com a chave anônima e faz upsert direto na tabela — sem policy de
-- escrita, o Supabase rejeita com "new row violates row-level security policy
-- for table produtos". Libera insert/update pra anon + authenticated, igual
-- ao padrão já usado nas outras tabelas do projeto. Execute no SQL Editor do
-- Supabase. Idempotente.

grant insert, update on produtos to anon, authenticated;

drop policy if exists "leitura publica produtos" on produtos;
drop policy if exists "escrita catalogo produtos" on produtos;

create policy "leitura publica produtos" on produtos for select using (true);
create policy "escrita catalogo produtos" on produtos for insert with check (true);
create policy "escrita catalogo produtos update" on produtos for update using (true) with check (true);
