-- Migração: função para listar os produtos mais vendidos nos últimos N dias,
-- usada como atalho na conferência de reposições (inversão) para evitar que o
-- revisor precise buscar manualmente os produtos mais comuns no catálogo todo.
-- Execute no SQL Editor do Supabase. Idempotente.

create or replace function top_produtos_vendidos(dias int default 30, limite int default 20)
returns table(produto_codigo int, produto_nome text, total numeric)
language sql
stable
as $$
  select produto_codigo, max(produto_nome) as produto_nome, sum(quantidade) as total
  from vendas_dia
  where data >= current_date - dias
    and produto_codigo is not null
  group by produto_codigo
  order by total desc
  limit limite;
$$;
