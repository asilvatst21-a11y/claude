-- Verifica, pra cada colaborador Motorista/Ajudante de Distribuição sem
-- telefone, se o número existe em motoristas_sala_tml ou em ajudantes —
-- casando tanto pela matrícula Promax quanto pelo nome (sem conectivos),
-- pra não depender só de uma via de casamento. Mostra os dois valores lado
-- a lado antes de decidir o que gravar.
--
-- Execute no SQL Editor do Supabase. Rode o bloco 1 (diagnóstico) primeiro
-- e me mande o resultado se ainda sobrar telefone vazio depois do bloco 2.

create or replace function _nome_sem_conectivos(s text) returns text as $$
  select trim(regexp_replace(' ' || lower(trim(s)) || ' ', '\s+(de|da|do|dos|das|e)\s+', ' ', 'g'))
$$ language sql immutable;

-- ── 1) DIAGNÓSTICO — mostra o que existe em cada tabela de origem para
--    quem está sem telefone.
select
  c.nome,
  c.matricula_promax,
  m.matricula  as motorista_tml_matricula,
  m.telefone   as motorista_tml_telefone,
  aj.codigo    as ajudante_codigo,
  aj.telefone  as ajudante_telefone
from colaboradores c
left join motoristas_sala_tml m
  on m.filial = c.filial
 and (
      (c.matricula_promax is not null and trim(c.matricula_promax) = trim(m.matricula::text))
   or _nome_sem_conectivos(c.nome) = _nome_sem_conectivos(m.nome)
 )
left join ajudantes aj
  on (
      (c.matricula_promax is not null and trim(c.matricula_promax) = aj.codigo::text)
   or _nome_sem_conectivos(c.nome) = _nome_sem_conectivos(aj.nome)
 )
where c.funcao in ('MOTORISTA DE DISTRIBUIÇÃO', 'AJUDANTE DE DISTRIBUIÇÃO')
  and (c.telefone is null or trim(c.telefone) = '')
order by c.nome;

-- ── 2) Grava o telefone encontrado (por qualquer uma das duas vias) —
--    prioriza motoristas_sala_tml pra função Motorista e ajudantes pra
--    função Ajudante, mas aceita o outro se for o único que bater.
update colaboradores c
set telefone = sub.telefone
from (
  select distinct on (c2.id) c2.id, coalesce(m.telefone, aj.telefone) as telefone
  from colaboradores c2
  left join motoristas_sala_tml m
    on m.filial = c2.filial
   and (
        (c2.matricula_promax is not null and trim(c2.matricula_promax) = trim(m.matricula::text))
     or _nome_sem_conectivos(c2.nome) = _nome_sem_conectivos(m.nome)
   )
  left join ajudantes aj
    on (
        (c2.matricula_promax is not null and trim(c2.matricula_promax) = aj.codigo::text)
     or _nome_sem_conectivos(c2.nome) = _nome_sem_conectivos(aj.nome)
   )
  where (c2.telefone is null or trim(c2.telefone) = '')
    and coalesce(m.telefone, aj.telefone) is not null
) sub
where c.id = sub.id;

drop function _nome_sem_conectivos(text);

-- ── 3) Confira o que ainda ficou sem telefone depois do backfill — se a
--    tabela de origem também não tiver o número (motorista_tml_telefone e
--    ajudante_telefone ambos nulos no bloco 1), o número realmente não
--    existe em nenhuma base ainda; precisa ser digitado manualmente.
select nome, matricula_promax, telefone
from colaboradores
where funcao in ('MOTORISTA DE DISTRIBUIÇÃO', 'AJUDANTE DE DISTRIBUIÇÃO')
  and (telefone is null or trim(telefone) = '')
order by nome;
