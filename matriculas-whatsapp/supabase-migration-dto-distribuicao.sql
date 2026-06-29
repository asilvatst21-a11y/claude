-- Migração: DTO Distribuição (BEES, DEVOLUÇÃO, TML, RETORNO DE ROTA).
-- A planilha de checklist (mesma usada para o GSDPQ) traz uma coluna TIPO
-- que identifica a categoria de cada linha. O GSDPQ usa as linhas com
-- TIPO = 'GSDPQ' (gsdpq_avaliacoes, já existente); as demais categorias
-- (BEES, DEVOLUÇÃO, TML, RETORNO DE ROTA) entram nesta nova tabela.
-- Execute no SQL Editor do Supabase.

create table if not exists dto_distribuicao_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  tipo text not null, -- BEES, DEVOLUÇÃO, TML, RETORNO DE ROTA
  colaborador_nome text not null,
  realizado_por text,
  funcao text,
  equipe text,
  data_avaliacao text,
  questao text not null,
  resultado text not null, -- OK, NO, NA
  observacoes text,
  created_at timestamptz not null default now(),
  unique(filial, tipo, colaborador_nome, data_avaliacao, questao)
);
alter table dto_distribuicao_avaliacoes enable row level security;
create policy "Acesso total" on dto_distribuicao_avaliacoes for all using (true);
create index if not exists idx_dto_distribuicao_filial on dto_distribuicao_avaliacoes(filial);
create index if not exists idx_dto_distribuicao_tipo on dto_distribuicao_avaliacoes(tipo);
create index if not exists idx_dto_distribuicao_colaborador on dto_distribuicao_avaliacoes(colaborador_nome);
create index if not exists idx_dto_distribuicao_data on dto_distribuicao_avaliacoes(data_avaliacao);
