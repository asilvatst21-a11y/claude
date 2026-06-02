-- Migração: módulo Prontuário (Motoristas e Ajudantes)
-- Execute no SQL Editor do Supabase

create table if not exists prontuario_snapshots (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  tipo text not null, -- 'motorista' | 'ajudante'
  data_referencia date not null default current_date,
  nome_arquivo text,
  total_registros int default 0,
  created_at timestamptz not null default now()
);
alter table prontuario_snapshots enable row level security;
create policy "Acesso total" on prontuario_snapshots for all using (true);
create index if not exists idx_psnap_filial on prontuario_snapshots(filial, tipo, data_referencia);

create table if not exists prontuario_registros (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references prontuario_snapshots(id) on delete cascade,
  filial text not null,
  tipo text not null,
  cpf text not null,
  nome text not null,
  cargo text,
  situacao_empregado text,
  status text,
  motivo text,
  pontuacao numeric default 0,
  faixa text not null,
  sonolencia int default 0,
  detalhes jsonb default '{}',
  regiao text,
  operacao text,
  created_at timestamptz not null default now()
);
alter table prontuario_registros enable row level security;
create policy "Acesso total" on prontuario_registros for all using (true);
create index if not exists idx_preg_snapshot on prontuario_registros(snapshot_id);
create index if not exists idx_preg_filial on prontuario_registros(filial, tipo);
create index if not exists idx_preg_cpf on prontuario_registros(cpf);
