-- Migração: torna `colaboradores` a base central de cadastro (nome, telefone,
-- cargo/função/equipe, CPF) — hoje várias telas mantêm sua própria lista de
-- pessoas em paralelo (gsdpq_colaboradores, motoristas_sala_tml,
-- armazem_colaboradores, supervisores_tml, gsdpq_supervisores), cada uma sem
-- saber da existência das outras.
--
-- Esta migração é ADITIVA e SEM PERDA: só acrescenta colunas e linhas em
-- `colaboradores`, e só preenche telefone/cpf/data_admissao quando esses
-- campos ainda estavam vazios. As tabelas de origem continuam existindo e
-- sendo usadas normalmente pelo restante do sistema (envio de WhatsApp,
-- joins de escala, etc.) — a consolidação de código vem depois, em etapas,
-- e cada tela vai passar a sincronizar com `colaboradores` em vez de ser
-- substituída de uma vez.
--
-- Ficam de fora desta consolidação (por enquanto): `ajudantes` e
-- `matriculas` (tabelas legadas do módulo de Vales/disparos antigo — não
-- têm coluna `filial` e pertencem a um subsistema diferente do roster de
-- colaboradores por filial).
--
-- Execute no SQL Editor do Supabase.

-- 1) Novas colunas em `colaboradores`
alter table colaboradores add column if not exists telefone text;
alter table colaboradores add column if not exists cpf text;
alter table colaboradores add column if not exists data_admissao date;
alter table colaboradores add column if not exists sala text;

create index if not exists idx_colab_cpf on colaboradores(filial, cpf);

-- 2) Backfill: gsdpq_colaboradores → colaboradores
--    Preenche cargo/função/equipe/status/data_admissao quando estiverem
--    vazios em colaboradores; casa por (filial, nome).
update colaboradores c
set
  funcao        = coalesce(nullif(c.funcao, ''), g.funcao),
  equipe        = coalesce(nullif(c.equipe, ''), g.equipe),
  data_admissao = coalesce(c.data_admissao, g.data_admissao),
  status        = coalesce(nullif(c.status, ''), g.status)
from gsdpq_colaboradores g
where c.filial = g.filial and lower(trim(c.nome)) = lower(trim(g.nome));

insert into colaboradores (filial, matricula, nome, status, funcao, equipe, data_admissao)
select g.filial, g.matricula, g.nome, g.status, g.funcao, g.equipe, g.data_admissao
from gsdpq_colaboradores g
where not exists (
  select 1 from colaboradores c
  where c.filial = g.filial and lower(trim(c.nome)) = lower(trim(g.nome))
)
on conflict (filial, nome) do nothing;

-- 3) Backfill: motoristas_sala_tml → colaboradores (telefone + sala)
update colaboradores c
set
  telefone = coalesce(nullif(c.telefone, ''), m.telefone),
  sala     = coalesce(nullif(c.sala, ''), m.sala),
  funcao   = coalesce(nullif(c.funcao, ''), 'MOTORISTA')
from motoristas_sala_tml m
where c.filial = m.filial and lower(trim(c.nome)) = lower(trim(m.nome));

insert into colaboradores (filial, matricula, nome, telefone, sala, funcao)
select m.filial, m.matricula::text, m.nome, m.telefone, m.sala, 'MOTORISTA'
from motoristas_sala_tml m
where not exists (
  select 1 from colaboradores c
  where c.filial = m.filial and lower(trim(c.nome)) = lower(trim(m.nome))
)
on conflict (filial, nome) do nothing;

-- 4) Backfill: armazem_colaboradores → colaboradores (cpf)
update colaboradores c
set cpf = coalesce(nullif(c.cpf, ''), a.cpf)
from armazem_colaboradores a
where c.filial = a.filial and lower(trim(c.nome)) = lower(trim(a.nome));

insert into colaboradores (filial, nome, cpf, status)
select a.filial, a.nome, a.cpf, case when a.ativo then 'TRABALHANDO' else 'DESLIGADO' end
from armazem_colaboradores a
where not exists (
  select 1 from colaboradores c
  where c.filial = a.filial and lower(trim(c.nome)) = lower(trim(a.nome))
)
on conflict (filial, nome) do nothing;

-- 5) Backfill: supervisores_tml → colaboradores (telefone)
update colaboradores c
set
  telefone = coalesce(nullif(c.telefone, ''), s.telefone),
  sala     = coalesce(nullif(c.sala, ''), s.sala),
  cargo    = coalesce(nullif(c.cargo, ''), 'SUPERVISOR TML')
from supervisores_tml s
where c.filial = s.filial and lower(trim(c.nome)) = lower(trim(s.nome));

insert into colaboradores (filial, nome, telefone, sala, cargo)
select s.filial, s.nome, s.telefone, s.sala, 'SUPERVISOR TML'
from supervisores_tml s
where s.filial is not null and not exists (
  select 1 from colaboradores c
  where c.filial = s.filial and lower(trim(c.nome)) = lower(trim(s.nome))
)
on conflict (filial, nome) do nothing;

-- 6) Backfill: gsdpq_supervisores → colaboradores (telefone)
update colaboradores c
set
  telefone = coalesce(nullif(c.telefone, ''), gs.telefone),
  equipe   = coalesce(nullif(c.equipe, ''), gs.equipe),
  cargo    = coalesce(nullif(c.cargo, ''), 'SUPERVISOR GSD')
from gsdpq_supervisores gs
where c.filial = gs.filial and lower(trim(c.nome)) = lower(trim(gs.nome));

insert into colaboradores (filial, nome, telefone, equipe, cargo)
select gs.filial, gs.nome, gs.telefone, gs.equipe, 'SUPERVISOR GSD'
from gsdpq_supervisores gs
where not exists (
  select 1 from colaboradores c
  where c.filial = gs.filial and lower(trim(c.nome)) = lower(trim(gs.nome))
)
on conflict (filial, nome) do nothing;

-- 7) Diagnóstico — rode esta consulta DEPOIS de aplicar tudo acima pra ver
--    se algum nome ficou "quase igual" em duas tabelas (grafia diferente,
--    espaço a mais, etc.) e por isso virou uma linha duplicada em
--    colaboradores em vez de casar. Revise manualmente os que aparecerem.
select filial, lower(trim(nome)) as nome_normalizado, count(*), array_agg(nome) as grafias
from colaboradores
group by filial, lower(trim(nome))
having count(*) > 1;
