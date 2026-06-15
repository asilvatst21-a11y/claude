-- Permissão de leitura para o catálogo nas tabelas novas.
-- O webhook (api/zapi-webhook.ts) lê produtos/pdvs/vendas_dia para identificar
-- produtos e cruzar com o faturamento. Sem isso as leituras voltam vazias e o
-- bot não padroniza nem avisa. Execute no SQL Editor do Supabase. Idempotente.

-- Garante o GRANT de leitura para os papéis do PostgREST (anon + authenticated).
-- A escrita continua só via service_role (seed/import), que ignora RLS.
grant select on produtos   to anon, authenticated;
grant select on pdvs       to anon, authenticated;
grant select on vendas_dia to anon, authenticated;

-- Habilita RLS e cria política de leitura pública (apenas SELECT).
alter table produtos   enable row level security;
alter table pdvs       enable row level security;
alter table vendas_dia enable row level security;

drop policy if exists "leitura publica produtos"   on produtos;
drop policy if exists "leitura publica pdvs"        on pdvs;
drop policy if exists "leitura publica vendas_dia"  on vendas_dia;

create policy "leitura publica produtos"   on produtos   for select using (true);
create policy "leitura publica pdvs"        on pdvs       for select using (true);
create policy "leitura publica vendas_dia"  on vendas_dia for select using (true);
