-- Schema para o projeto Matriculas WhatsApp
-- Execute este SQL no SQL Editor do seu projeto Supabase

-- Tabela de matrículas
create table if not exists matriculas (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  whatsapp text not null,
  nome text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tabela de clientes
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  email text,
  foto_url text,
  observacoes text,
  created_at timestamptz not null default now()
);

-- Tabela de vínculos matrícula <-> cliente
create table if not exists vinculos (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references matriculas(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  data_vinculo date not null default current_date,
  created_at timestamptz not null default now(),
  unique(matricula_id, cliente_id)
);

-- Tabela de log de disparos
create table if not exists disparos (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid references matriculas(id),
  cliente_id uuid references clientes(id),
  whatsapp text not null,
  mensagem text not null,
  status text not null default 'pendente', -- pendente | enviado | erro
  erro text,
  created_at timestamptz not null default now()
);

-- Storage bucket para fotos de clientes
insert into storage.buckets (id, name, public)
values ('fotos-clientes', 'fotos-clientes', true)
on conflict (id) do nothing;

-- RLS: acesso público para leitura (ajuste conforme sua necessidade de auth)
alter table matriculas enable row level security;
alter table clientes enable row level security;
alter table vinculos enable row level security;
alter table disparos enable row level security;

create policy "Acesso total" on matriculas for all using (true);
create policy "Acesso total" on clientes for all using (true);
create policy "Acesso total" on vinculos for all using (true);
create policy "Acesso total" on disparos for all using (true);

-- Policy para storage
create policy "Upload publico" on storage.objects for insert with check (bucket_id = 'fotos-clientes');
create policy "Leitura publica" on storage.objects for select using (bucket_id = 'fotos-clientes');
create policy "Delete publico" on storage.objects for delete using (bucket_id = 'fotos-clientes');
