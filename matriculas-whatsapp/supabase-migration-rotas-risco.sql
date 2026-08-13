-- Rotas de Risco: pontos de risco cadastrados (pela equipe ou sugeridos por
-- motoristas via Aurora), aviso automático ao motorista quando o mapa do dia
-- passa perto de um PDV de referência do ponto (mesmo gatilho do PDV
-- Crítico), e consulta sob demanda pela Aurora. Execute no SQL Editor do
-- Supabase. Idempotente.

-- Pontos de risco já validados (oficiais) — usados no aviso automático e na
-- consulta via Aurora.
create table if not exists rotas_risco_pontos (
  id                uuid primary key default gen_random_uuid(),
  filial            text not null,
  titulo            text not null,
  tipo              text not null default 'ponto',      -- 'ponto' | 'trecho'
  severidade        text not null default 'baixo',       -- 'baixo' | 'moderado' | 'alto'
  rodovia           text,
  velocidade_segura text,
  rota              text,                                 -- rótulo livre, ex.: "Cascavel → Toledo (BR-277)"
  pdv_referencia    text,                                  -- código do PDV mais próximo (mesma base do BEES) — usado pro cruzamento automático
  latitude          numeric,
  longitude         numeric,
  maps_url          text,
  origem            text not null default 'equipe',       -- 'equipe' | 'motorista'
  sugestao_id       uuid,
  ativo             boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists rotas_risco_pontos_filial_idx on rotas_risco_pontos(filial);
create index if not exists rotas_risco_pontos_pdv_idx on rotas_risco_pontos(filial, pdv_referencia);

-- Sugestões de motorista (via Aurora), aguardando validação da Segurança.
create table if not exists rotas_risco_sugestoes (
  id               uuid primary key default gen_random_uuid(),
  filial           text not null,
  matricula        text,
  nome_motorista   text,
  telefone         text,
  relato_texto     text,
  via_audio        boolean not null default false,
  latitude         numeric,
  longitude        numeric,
  mapa             int,
  status           text not null default 'pendente',      -- 'pendente' | 'aprovado' | 'rejeitado'
  motivo_rejeicao  text,
  ponto_id         uuid references rotas_risco_pontos(id),
  validado_por     text,
  validado_em      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists rotas_risco_sugestoes_filial_idx on rotas_risco_sugestoes(filial, status);

-- Dedupe do aviso automático — não reenvia o mesmo aviso pro mesmo
-- motorista+ponto no mesmo dia, mesmo reimportando o BEES várias vezes.
create table if not exists rotas_risco_avisos (
  id         uuid primary key default gen_random_uuid(),
  filial     text not null,
  data       date not null,
  matricula  text not null,
  ponto_id   uuid not null references rotas_risco_pontos(id),
  enviado_em timestamptz not null default now(),
  unique (filial, data, matricula, ponto_id)
);

-- Dedupe da pergunta proativa da Aurora ("passou por algum ponto de risco
-- hoje?") — uma pergunta por motorista por dia, mesmo reimportando o BEES.
create table if not exists rotas_risco_perguntas (
  id         uuid primary key default gen_random_uuid(),
  filial     text not null,
  data       date not null,
  matricula  text not null,
  criado_em  timestamptz not null default now(),
  unique (filial, data, matricula)
);

alter table rotas_risco_pontos     enable row level security;
alter table rotas_risco_sugestoes  enable row level security;
alter table rotas_risco_avisos     enable row level security;
alter table rotas_risco_perguntas  enable row level security;

drop policy if exists "Acesso total" on rotas_risco_pontos;
drop policy if exists "Acesso total" on rotas_risco_sugestoes;
drop policy if exists "Acesso total" on rotas_risco_avisos;
drop policy if exists "Acesso total" on rotas_risco_perguntas;

create policy "Acesso total" on rotas_risco_pontos    for all using (true) with check (true);
create policy "Acesso total" on rotas_risco_sugestoes for all using (true) with check (true);
create policy "Acesso total" on rotas_risco_avisos    for all using (true) with check (true);
create policy "Acesso total" on rotas_risco_perguntas for all using (true) with check (true);

grant select, insert, update on rotas_risco_pontos    to anon, authenticated;
grant select, insert, update on rotas_risco_sugestoes to anon, authenticated;
grant select, insert         on rotas_risco_avisos    to anon, authenticated;
grant select, insert         on rotas_risco_perguntas to anon, authenticated;

-- aurora_sessoes (supabase-migration-aurora.sql) só era escrita pela função
-- do webhook, que usa a service_role (ignora RLS) — nunca precisou de GRANT
-- pra anon. A pergunta proativa de Rotas de Risco escreve nessa tabela
-- direto do app (chave anônima), então precisa do GRANT explícito — mesmo
-- bug que travou o import de produtos: RLS "using(true)" sozinho não basta
-- sem o GRANT de tabela.
grant select, insert, update on aurora_sessoes to anon, authenticated;
