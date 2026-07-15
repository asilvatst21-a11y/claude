-- Diagnóstico isolado (bloco 1) — só leitura, não altera nada. Rode este
-- arquivo inteiro de uma vez (a função precisa ser criada antes do SELECT).

create or replace function _nome_sem_conectivos(s text) returns text as $$
  select trim(regexp_replace(' ' || lower(trim(s)) || ' ', '\s+(de|da|do|dos|das|e)\s+', ' ', 'g'))
$$ language sql immutable;

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

drop function _nome_sem_conectivos(text);
