-- Corrige duplicatas que sobraram porque o backfill original (antes de
-- existir a coluna matricula_promax) trazia motoristas_sala_tml casando só
-- por NOME — e essa tabela guarda a matrícula Promax (3 dígitos), não a
-- LOG20. Quando o nome vinha grafado de um jeito um pouco diferente (ex.:
-- "ALEXANDRE DE FREITAS" vs "ALEXANDRE FREITAS"), a fusão por nome falhava
-- e sobrava uma segunda linha com a matrícula Promax gravada por engano no
-- campo de matrícula LOG20.
--
-- Esta migração:
--  1) Funde essas duplicatas casando pela matrícula Promax (mais confiável
--     que o nome) em vez de só por nome.
--  2) Busca de novo o telefone em motoristas_sala_tml, mas agora casando
--     por matrícula Promax — pega os casos que a fusão por nome perdeu.
--
-- Execute no SQL Editor do Supabase.

-- 1) Funde linhas onde a matrícula Promax de uma bate com o campo
--    "matricula" (LOG20) da outra — rastro do backfill antigo.
with pares as (
  select a.id as id_manter, b.id as id_remover
  from colaboradores a
  join colaboradores b
    on a.filial = b.filial
   and a.id <> b.id
   and a.matricula_promax is not null
   and trim(a.matricula_promax) <> ''
   and trim(a.matricula_promax) = trim(b.matricula)
   and (b.matricula_promax is null or trim(b.matricula_promax) = '')
)
update colaboradores c
set
  telefone = coalesce(nullif(c.telefone, ''), dup.telefone),
  cpf      = coalesce(nullif(c.cpf, ''), dup.cpf),
  sala     = coalesce(nullif(c.sala, ''), dup.sala),
  cargo    = coalesce(nullif(c.cargo, ''), dup.cargo),
  status   = coalesce(nullif(c.status, ''), dup.status)
from pares p
join colaboradores dup on dup.id = p.id_remover
where c.id = p.id_manter;

with pares as (
  select a.id as id_manter, b.id as id_remover
  from colaboradores a
  join colaboradores b
    on a.filial = b.filial
   and a.id <> b.id
   and a.matricula_promax is not null
   and trim(a.matricula_promax) <> ''
   and trim(a.matricula_promax) = trim(b.matricula)
   and (b.matricula_promax is null or trim(b.matricula_promax) = '')
)
delete from colaboradores c
using pares p
where c.id = p.id_remover;

-- 2) Backfill de telefone via matrícula Promax (mais confiável que nome) —
--    pega motoristas cujo nome no cadastro TML não batia exatamente com o
--    nome oficial da planilha de RH.
update colaboradores c
set telefone = coalesce(nullif(c.telefone, ''), m.telefone)
from motoristas_sala_tml m
where c.filial = m.filial
  and c.matricula_promax is not null
  and trim(c.matricula_promax) = trim(m.matricula::text)
  and m.telefone is not null;

-- 3) Segunda tentativa de telefone via nome "sem conectivos" (de/da/do/dos/
--    das/e) — pega casos como "ALEXANDRE DE FREITAS" x "ALEXANDRE FREITAS",
--    onde nem o nome exato nem a matrícula bateram. Função auxiliar
--    temporária, removida no fim.
create or replace function _nome_sem_conectivos(s text) returns text as $$
  select trim(regexp_replace(' ' || lower(trim(s)) || ' ', '\s+(de|da|do|dos|das|e)\s+', ' ', 'g'))
$$ language sql immutable;

update colaboradores c
set telefone = coalesce(nullif(c.telefone, ''), m.telefone)
from motoristas_sala_tml m
where c.filial = m.filial
  and c.telefone is null
  and m.telefone is not null
  and _nome_sem_conectivos(c.nome) = _nome_sem_conectivos(m.nome);

update colaboradores c
set telefone = coalesce(nullif(c.telefone, ''), s.telefone)
from supervisores_tml s
where c.filial = s.filial
  and c.telefone is null
  and s.telefone is not null
  and _nome_sem_conectivos(c.nome) = _nome_sem_conectivos(s.nome);

update colaboradores c
set telefone = coalesce(nullif(c.telefone, ''), gs.telefone)
from gsdpq_supervisores gs
where c.filial = gs.filial
  and c.telefone is null
  and gs.telefone is not null
  and _nome_sem_conectivos(c.nome) = _nome_sem_conectivos(gs.nome);

drop function _nome_sem_conectivos(text);

-- 5) Diagnóstico — confira se ainda sobrou algum "quase duplicado" (mesmo
--    CPF ou mesma matrícula em linhas diferentes) pra revisar manualmente.
select filial, cpf, count(*), array_agg(nome)
from colaboradores
where cpf is not null and trim(cpf) <> ''
group by filial, cpf
having count(*) > 1;
