-- Segunda rodada da correção de duplicidade + telefone em `colaboradores`.
-- Execute no SQL Editor do Supabase, NA ORDEM (cada bloco é uma consulta
-- separada — rode um de cada vez se quiser conferir o resultado no meio).

-- ── 0) DIAGNÓSTICO — rode isso primeiro e me mande o resultado se a
--    duplicata do Alexandre (ou outra) continuar depois do restante do
--    script. Mostra exatamente o que está gravado nas duas linhas.
select id, nome, matricula, matricula_promax, telefone, cargo, funcao, equipe, status
from colaboradores
where filial = 'CDD PETROPOLIS' and lower(nome) like '%freitas%'
order by nome;

-- ── 1) Funde qualquer par de linhas da mesma filial que compartilhem UMA
--    matrícula em comum entre os dois campos (LOG20 ou Promax), não
--    importa em qual campo ela esteja gravada em cada linha. Mantém a
--    linha com mais campos preenchidos (a da planilha oficial, que tem
--    as duas matrículas) e copia pra ela o que só existir na outra.
with pares as (
  select
    a.id as id_manter, b.id as id_remover
  from colaboradores a
  join colaboradores b
    on a.filial = b.filial
   and a.id <> b.id
   and (
        (nullif(trim(a.matricula_promax), '') is not null and nullif(trim(a.matricula_promax), '') = nullif(trim(b.matricula), ''))
     or (nullif(trim(a.matricula), '') is not null and nullif(trim(a.matricula), '') = nullif(trim(b.matricula_promax), ''))
     or (nullif(trim(a.matricula_promax), '') is not null and nullif(trim(a.matricula_promax), '') = nullif(trim(b.matricula_promax), ''))
   )
  where (
    -- desempate: quem tem mais campos preenchidos vira o "manter"; em
    -- empate, quem tiver as DUAS matrículas preenchidas ganha.
    (case when a.matricula is not null then 1 else 0 end + case when a.matricula_promax is not null then 1 else 0 end
   + case when a.telefone is not null then 1 else 0 end + case when a.cpf is not null then 1 else 0 end
   + case when a.cargo is not null then 1 else 0 end + case when a.funcao is not null then 1 else 0 end)
    >
    (case when b.matricula is not null then 1 else 0 end + case when b.matricula_promax is not null then 1 else 0 end
   + case when b.telefone is not null then 1 else 0 end + case when b.cpf is not null then 1 else 0 end
   + case when b.cargo is not null then 1 else 0 end + case when b.funcao is not null then 1 else 0 end)
    or (
      (case when a.matricula is not null then 1 else 0 end + case when a.matricula_promax is not null then 1 else 0 end
     + case when a.telefone is not null then 1 else 0 end + case when a.cpf is not null then 1 else 0 end
     + case when a.cargo is not null then 1 else 0 end + case when a.funcao is not null then 1 else 0 end)
      =
      (case when b.matricula is not null then 1 else 0 end + case when b.matricula_promax is not null then 1 else 0 end
     + case when b.telefone is not null then 1 else 0 end + case when b.cpf is not null then 1 else 0 end
     + case when b.cargo is not null then 1 else 0 end + case when b.funcao is not null then 1 else 0 end)
      and a.id < b.id
    )
  )
)
update colaboradores c
set
  matricula        = coalesce(nullif(c.matricula, ''), dup.matricula),
  matricula_promax = coalesce(nullif(c.matricula_promax, ''), dup.matricula_promax),
  telefone         = coalesce(nullif(c.telefone, ''), dup.telefone),
  cpf              = coalesce(nullif(c.cpf, ''), dup.cpf),
  sala             = coalesce(nullif(c.sala, ''), dup.sala),
  cargo            = coalesce(nullif(c.cargo, ''), dup.cargo),
  funcao           = coalesce(nullif(c.funcao, ''), dup.funcao),
  equipe           = coalesce(nullif(c.equipe, ''), dup.equipe),
  status           = coalesce(nullif(c.status, ''), dup.status)
from pares p
join colaboradores dup on dup.id = p.id_remover
where c.id = p.id_manter;

with pares as (
  select
    a.id as id_manter, b.id as id_remover
  from colaboradores a
  join colaboradores b
    on a.filial = b.filial
   and a.id <> b.id
   and (
        (nullif(trim(a.matricula_promax), '') is not null and nullif(trim(a.matricula_promax), '') = nullif(trim(b.matricula), ''))
     or (nullif(trim(a.matricula), '') is not null and nullif(trim(a.matricula), '') = nullif(trim(b.matricula_promax), ''))
     or (nullif(trim(a.matricula_promax), '') is not null and nullif(trim(a.matricula_promax), '') = nullif(trim(b.matricula_promax), ''))
   )
  where (
    (case when a.matricula is not null then 1 else 0 end + case when a.matricula_promax is not null then 1 else 0 end
   + case when a.telefone is not null then 1 else 0 end + case when a.cpf is not null then 1 else 0 end
   + case when a.cargo is not null then 1 else 0 end + case when a.funcao is not null then 1 else 0 end)
    >
    (case when b.matricula is not null then 1 else 0 end + case when b.matricula_promax is not null then 1 else 0 end
   + case when b.telefone is not null then 1 else 0 end + case when b.cpf is not null then 1 else 0 end
   + case when b.cargo is not null then 1 else 0 end + case when b.funcao is not null then 1 else 0 end)
    or (
      (case when a.matricula is not null then 1 else 0 end + case when a.matricula_promax is not null then 1 else 0 end
     + case when a.telefone is not null then 1 else 0 end + case when a.cpf is not null then 1 else 0 end
     + case when a.cargo is not null then 1 else 0 end + case when a.funcao is not null then 1 else 0 end)
      =
      (case when b.matricula is not null then 1 else 0 end + case when b.matricula_promax is not null then 1 else 0 end
     + case when b.telefone is not null then 1 else 0 end + case when b.cpf is not null then 1 else 0 end
     + case when b.cargo is not null then 1 else 0 end + case when b.funcao is not null then 1 else 0 end)
      and a.id < b.id
    )
  )
)
delete from colaboradores c
using pares p
where c.id = p.id_remover;

-- ── 2) Telefone de AJUDANTES DE DISTRIBUIÇÃO — tabela `ajudantes`
--    (Financeiro → Ajudantes) guarda telefone pelo código, que é a
--    matrícula Promax. Essa tabela não tem coluna de filial.
update colaboradores c
set telefone = coalesce(nullif(c.telefone, ''), a.telefone)
from ajudantes a
where c.matricula_promax is not null
  and trim(c.matricula_promax) <> ''
  and trim(c.matricula_promax) = a.codigo::text
  and a.telefone is not null;

-- ── 3) Telefone de MOTORISTAS — tabela `motoristas_sala_tml`
--    (Distribuição → Carta de Controle → Motoristas) guarda telefone pela
--    matrícula, que também é a Promax.
update colaboradores c
set telefone = coalesce(nullif(c.telefone, ''), m.telefone)
from motoristas_sala_tml m
where c.filial = m.filial
  and c.matricula_promax is not null
  and trim(c.matricula_promax) <> ''
  and trim(c.matricula_promax) = trim(m.matricula::text)
  and m.telefone is not null;

-- ── 4) Diagnóstico final — deve voltar vazio. Se voltar alguma linha,
--    manda o resultado que ajusto o script.
select filial, coalesce(nullif(trim(matricula), ''), nullif(trim(matricula_promax), '')) as chave, count(*), array_agg(nome)
from colaboradores
where coalesce(nullif(trim(matricula), ''), nullif(trim(matricula_promax), '')) is not null
group by filial, coalesce(nullif(trim(matricula), ''), nullif(trim(matricula_promax), ''))
having count(*) > 1;
