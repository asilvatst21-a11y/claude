-- Migração: catálogo de produtos, PDVs e vendas do dia para reposições.
-- Execute no SQL Editor do Supabase. Idempotente.

-- Catálogo de produtos Ambev (importado da planilha 01_11)
create table if not exists produtos (
  codigo      int primary key,
  descricao   text not null,
  embalagem   text,
  marca       text,
  linha_marca text,
  descricao_unit text
);

-- Catálogo de PDVs (importado da planilha 01_05_07_04_02)
create table if not exists pdvs (
  codigo        int primary key,
  nome_fantasia text,
  rota          int,
  filial        int,
  setor         text,
  endereco      text,
  telefone      text
);

-- Vendas do dia (importado do CSV diário de faturamento)
create table if not exists vendas_dia (
  id               bigserial primary key,
  data             date not null,
  filial           text,
  mapa             text,
  pdv_codigo       int,
  produto_codigo   int,
  produto_nome     text,
  quantidade       numeric,
  unidade          text
);

-- Índice para cruzamento rápido na tela de reposições
create index if not exists vendas_dia_lookup_idx on vendas_dia(data, pdv_codigo, produto_codigo);
