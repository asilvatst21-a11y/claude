-- Migração: sistema completo GSDPQ
-- Execute no SQL Editor do Supabase

-- 1. Colaboradores (base de funcionários)
create table if not exists gsdpq_colaboradores (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  matricula text,
  nome text not null,
  equipe text,
  funcao text,
  status text default 'TRABALHANDO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(filial, nome)
);
alter table gsdpq_colaboradores enable row level security;
create policy "Acesso total" on gsdpq_colaboradores for all using (true);

-- 2. Avaliações (cada linha = 1 questão de 1 avaliação)
create table if not exists gsdpq_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  colaborador_nome text not null,
  colaborador_id uuid references gsdpq_colaboradores(id),
  realizado_por text,
  equipe text,
  data_avaliacao text,
  questao text not null,
  resultado text not null, -- OK, NO, NA
  observacoes text,
  created_at timestamptz not null default now(),
  unique(filial, colaborador_nome, data_avaliacao, questao)
);
alter table gsdpq_avaliacoes enable row level security;
create policy "Acesso total" on gsdpq_avaliacoes for all using (true);
create index if not exists idx_gsdpq_avaliacoes_filial on gsdpq_avaliacoes(filial);
create index if not exists idx_gsdpq_avaliacoes_colaborador on gsdpq_avaliacoes(colaborador_nome);
create index if not exists idx_gsdpq_avaliacoes_data on gsdpq_avaliacoes(data_avaliacao);

-- 3. Ações disciplinares
create table if not exists gsdpq_acoes (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  colaborador_nome text not null,
  colaborador_id uuid references gsdpq_colaboradores(id),
  avaliacao_id uuid references gsdpq_avaliacoes(id) on delete cascade,
  questao text not null,
  data_avaliacao text,
  tipo_acao text not null, -- Reciclagem, Advertência Verbal, Advertência Escrita, Suspensão
  dias_suspensao int,
  observacao text,
  registrado_por text,
  created_at timestamptz not null default now()
);
alter table gsdpq_acoes enable row level security;
create policy "Acesso total" on gsdpq_acoes for all using (true);
create index if not exists idx_gsdpq_acoes_filial on gsdpq_acoes(filial);
create index if not exists idx_gsdpq_acoes_colaborador on gsdpq_acoes(colaborador_nome);

-- 3b. Garante no máximo 1 ação por avaliação (uma avaliação só pode ter um
-- desfecho: ação disciplinar, fluxo punitivo ou orientação verbal).
-- Remove duplicatas antigas (mantém a mais recente) antes de criar o índice.
delete from gsdpq_acoes a using gsdpq_acoes b
  where a.avaliacao_id = b.avaliacao_id
    and a.avaliacao_id is not null
    and a.created_at < b.created_at;
create unique index if not exists uniq_gsdpq_acoes_avaliacao
  on gsdpq_acoes(avaliacao_id) where avaliacao_id is not null;
