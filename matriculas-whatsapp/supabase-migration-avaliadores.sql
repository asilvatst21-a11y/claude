-- Migração: Cadastro de Avaliadores de DTO
-- Execute no SQL Editor do Supabase

create table if not exists dto_avaliadores (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique(filial, nome)
);

alter table dto_avaliadores enable row level security;
create policy "Acesso total" on dto_avaliadores for all using (true);
create index if not exists idx_dto_aval_filial on dto_avaliadores(filial);
