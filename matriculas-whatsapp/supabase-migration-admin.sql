-- Migração: admin + tabela filiais
-- Execute no SQL Editor do Supabase

-- 1. Tabela de filiais
create table if not exists filiais (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  created_at timestamptz not null default now()
);

alter table filiais enable row level security;
drop policy if exists "Acesso total" on filiais;
create policy "Acesso total" on filiais for all using (true);

-- Garante filial inicial
insert into filiais (nome) values ('CDD PETROPOLIS')
on conflict (nome) do nothing;

-- 2. Coluna admin em usuarios
alter table usuarios add column if not exists admin boolean not null default false;

-- 3. Promove tstpet a admin (se já foi renomeado) ou admin antigo
update usuarios set admin = true where login in ('tstpet', 'admin');
