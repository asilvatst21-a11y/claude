-- Migração: adicionar coluna filial em matriculas, clientes e disparos
-- Execute no SQL Editor do Supabase

alter table matriculas add column if not exists filial text;
alter table clientes   add column if not exists filial text;
alter table disparos   add column if not exists filial text;

-- Preenche registros antigos com a filial inicial (CDD PETROPOLIS)
update matriculas set filial = 'CDD PETROPOLIS' where filial is null;
update clientes   set filial = 'CDD PETROPOLIS' where filial is null;
update disparos   set filial = 'CDD PETROPOLIS' where filial is null;

-- Torna obrigatória em matriculas e clientes (disparos pode ficar nulo p/ legado)
alter table matriculas alter column filial set not null;
alter table clientes   alter column filial set not null;

-- Índices p/ acelerar filtro por filial
create index if not exists idx_matriculas_filial on matriculas(filial);
create index if not exists idx_clientes_filial   on clientes(filial);
create index if not exists idx_disparos_filial   on disparos(filial);

-- Garante unicidade de código de cliente e número de matrícula POR FILIAL
-- (caso já existam constraints únicas globais, remova-as antes)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'matriculas_numero_key') then
    alter table matriculas drop constraint matriculas_numero_key;
  end if;
  if exists (select 1 from pg_constraint where conname = 'clientes_codigo_key') then
    alter table clientes drop constraint clientes_codigo_key;
  end if;
end $$;

create unique index if not exists matriculas_filial_numero_uniq on matriculas(filial, numero);
create unique index if not exists clientes_filial_codigo_uniq   on clientes(filial, codigo);
