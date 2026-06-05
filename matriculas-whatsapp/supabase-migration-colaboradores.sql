-- Migração: cadastro de colaboradores (para filtros de Jornada)
-- Execute no SQL Editor do Supabase

create table if not exists colaboradores (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  matricula text,
  nome text not null,
  status text,
  projeto text,
  subprojeto text,
  funcao text,
  equipe text,
  cargo text,
  created_at timestamptz not null default now(),
  unique(filial, nome)
);

alter table colaboradores enable row level security;
create policy "Acesso total" on colaboradores for all using (true);

create index if not exists idx_colab_filial    on colaboradores(filial);
create index if not exists idx_colab_matricula on colaboradores(filial, matricula);
create index if not exists idx_colab_equipe     on colaboradores(filial, equipe);
create index if not exists idx_colab_funcao     on colaboradores(filial, funcao);
create index if not exists idx_colab_projeto    on colaboradores(filial, projeto);
