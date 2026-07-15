-- Corrige duplicidade de nomes em `colaboradores` (criada pelo backfill
-- anterior, que casava por nome exato e não pegou variações de
-- maiúsculas/espaços) e passa a impedir duplicidade por normalização de
-- nome daqui pra frente. Também adiciona a matrícula Promax (3 dígitos,
-- só existe para Motorista/Ajudante de Distribuição).
--
-- Execute no SQL Editor do Supabase.

alter table colaboradores add column if not exists matricula_promax text;

-- 1) Mescla duplicatas existentes: pra cada grupo de linhas com o mesmo
--    (filial, nome normalizado — minúsculo e sem espaço nas pontas), mantém
--    a linha mais recente e completa (mais campos preenchidos), copiando
--    pra ela qualquer campo preenchido só nas outras, e apaga o restante.
with normalizados as (
  select id, filial, lower(trim(nome)) as nome_norm,
         (case when matricula is not null then 1 else 0 end
        + case when telefone  is not null then 1 else 0 end
        + case when cpf       is not null then 1 else 0 end
        + case when cargo     is not null then 1 else 0 end
        + case when funcao    is not null then 1 else 0 end
        + case when equipe    is not null then 1 else 0 end
        + case when status    is not null then 1 else 0 end) as preenchidos
  from colaboradores
),
ranking as (
  select id, filial, nome_norm,
         row_number() over (partition by filial, nome_norm order by preenchidos desc, id) as rn
  from normalizados
),
principal as (
  select r.filial, r.nome_norm, r.id as id_principal
  from ranking r where r.rn = 1
)
update colaboradores c
set
  matricula        = coalesce(c.matricula, dup.matricula),
  matricula_promax = coalesce(c.matricula_promax, dup.matricula_promax),
  telefone         = coalesce(c.telefone, dup.telefone),
  cpf              = coalesce(c.cpf, dup.cpf),
  cargo            = coalesce(c.cargo, dup.cargo),
  funcao           = coalesce(c.funcao, dup.funcao),
  equipe           = coalesce(c.equipe, dup.equipe),
  sala             = coalesce(c.sala, dup.sala),
  status           = coalesce(c.status, dup.status),
  data_admissao    = coalesce(c.data_admissao, dup.data_admissao)
from principal p
join colaboradores dup on dup.filial = p.filial and lower(trim(dup.nome)) = p.nome_norm and dup.id <> p.id_principal
where c.id = p.id_principal;

delete from colaboradores c
using principal p
where c.filial = p.filial and lower(trim(c.nome)) = p.nome_norm and c.id <> p.id_principal;

-- 2) Passa a impedir duplicidade por normalização de nome (maiúsculo/
--    minúsculo e espaços nas pontas não geram mais linhas separadas).
alter table colaboradores add column if not exists nome_norm text
  generated always as (lower(trim(nome))) stored;

alter table colaboradores drop constraint if exists colaboradores_filial_nome_key;
alter table colaboradores drop constraint if exists colaboradores_filial_nome_norm_key;
alter table colaboradores add constraint colaboradores_filial_nome_norm_key unique (filial, nome_norm);
