-- Migração: Gerenciador de DTOs (cadastro de atividades + calendarização)
-- Execute no SQL Editor do Supabase
--
-- Esta tabela guarda apenas o CADASTRO das atividades (a base da calendarização).
-- Todo o resto do motor (desvios DTO, atos inseguros, abordagem positiva, gatilho,
-- risco final, periodicidade e vencimento) é calculado em tempo real no app a partir
-- das tabelas dto_observacoes e relatos.

create table if not exists dto_atividades (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  area text not null,                       -- Armazém | Oficina | Distribuição
  nome_atividade text not null,
  frequencia_atividade text,                -- texto livre vindo da planilha (ex.: "Diariamente no TC")
  criticidade_base text not null default 'Baixo',  -- Baixo | Médio | Alto | Crítico (piso/override p/ tarefas perigosas)
  responsavel text,                         -- analista dono da fila
  ultimo_dto_manual text,                   -- data ISO opcional p/ sobrescrever o último DTO derivado
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique(filial, area, nome_atividade)
);

alter table dto_atividades enable row level security;
create policy "Acesso total" on dto_atividades for all using (true);
create index if not exists idx_dto_ativ_filial on dto_atividades(filial);
create index if not exists idx_dto_ativ_area on dto_atividades(area);
