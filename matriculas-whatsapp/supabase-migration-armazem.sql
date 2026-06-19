-- Módulo Armazém: cadastro de atividades (com perguntas dinâmicas) e
-- execuções registradas pelo operador/manobrista/ajudante de armazém.
-- Execute no SQL Editor do Supabase.

-- Cargo do usuário (operador, manobrista, ajudante de armazém, etc.), usado
-- para filtrar quais atividades aparecem para ele no app do Armazém.
alter table usuarios add column if not exists cargo text;

create table if not exists armazem_atividades_tipo (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  nome text not null,
  cargos text[] not null default '{}',
  unidade_producao text,
  meta_tempo_minutos integer,
  -- perguntas: [{ id, ordem, pergunta, tipo ('numero'|'texto'|'sim_nao'|'multipla_escolha'), opcoes: string[]|null, obrigatoria: boolean }]
  perguntas jsonb not null default '[]',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table armazem_atividades_tipo enable row level security;
create policy "Acesso total" on armazem_atividades_tipo for all using (true);
create index if not exists idx_armazem_atividades_tipo_filial on armazem_atividades_tipo(filial);

create table if not exists armazem_execucoes (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  colaborador_id uuid references usuarios(id),
  colaborador_nome text not null,
  cargo text,
  atividade_tipo_id uuid references armazem_atividades_tipo(id),
  atividade_nome text not null,
  hora_inicio timestamptz not null,
  hora_fim timestamptz,
  duracao_minutos integer,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'pausada', 'concluida', 'cancelada')),
  houve_anomalia boolean not null default false,
  anomalia_descricao text,
  km_percorrido numeric,
  -- respostas: [{ pergunta_id, pergunta, resposta }]
  respostas jsonb not null default '[]',
  encerrada_manualmente_por text,
  encerrada_manualmente_motivo text,
  created_at timestamptz not null default now()
);
alter table armazem_execucoes enable row level security;
create policy "Acesso total" on armazem_execucoes for all using (true);
create index if not exists idx_armazem_execucoes_filial on armazem_execucoes(filial);
create index if not exists idx_armazem_execucoes_colaborador on armazem_execucoes(colaborador_id);
create index if not exists idx_armazem_execucoes_status on armazem_execucoes(status);

create table if not exists armazem_execucoes_pausas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references armazem_execucoes(id) on delete cascade,
  pausa_inicio timestamptz not null,
  pausa_fim timestamptz,
  motivo text,
  created_at timestamptz not null default now()
);
alter table armazem_execucoes_pausas enable row level security;
create policy "Acesso total" on armazem_execucoes_pausas for all using (true);
create index if not exists idx_armazem_pausas_execucao on armazem_execucoes_pausas(execucao_id);

-- Grupo de WhatsApp pra alertar o supervisor quando uma execução é finalizada com anomalia
alter table filiais add column if not exists grupo_armazem_whatsapp text;
