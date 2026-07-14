-- Migração: cadastro de território de roteirização por placa e dia da semana.
-- Execute no SQL Editor do Supabase.

-- Cadastro de setores/territórios (ex.: "100 - Triângulo"). Editável pela
-- tela (Roteirização → Gerenciar setores), sem depender de nova migração
-- para incluir um setor novo.
create table if not exists setores_roteirizacao (
  id bigserial primary key,
  filial text not null,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table setores_roteirizacao add column if not exists filial text;
alter table setores_roteirizacao add column if not exists nome text;
alter table setores_roteirizacao add column if not exists ativo boolean not null default true;
alter table setores_roteirizacao add column if not exists created_at timestamptz not null default now();

alter table setores_roteirizacao drop constraint if exists setores_roteirizacao_unico;
alter table setores_roteirizacao add constraint setores_roteirizacao_unico unique (filial, nome);

alter table setores_roteirizacao enable row level security;
drop policy if exists "Acesso total" on setores_roteirizacao;
create policy "Acesso total" on setores_roteirizacao for all using (true) with check (true);

-- Território definido para cada placa em cada dia da semana (segunda a
-- sábado — sem domingo, sem entrega). Uma linha por placa+dia.
create table if not exists roteirizacao_placa_dia (
  id bigserial primary key,
  filial text not null,
  placa text not null,
  dia_semana text not null check (dia_semana in ('SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB')),
  territorio text,
  updated_at timestamptz not null default now()
);
alter table roteirizacao_placa_dia drop constraint if exists roteirizacao_placa_dia_unico;
alter table roteirizacao_placa_dia add constraint roteirizacao_placa_dia_unico unique (filial, placa, dia_semana);

alter table roteirizacao_placa_dia enable row level security;
drop policy if exists "Acesso total" on roteirizacao_placa_dia;
create policy "Acesso total" on roteirizacao_placa_dia for all using (true) with check (true);

-- Seed inicial dos territórios já usados na planilha "Previsão de Volume por
-- Território" (aba BASE, coluna A) — específico da filial CDD Petrópolis.
-- Para outra filial, cadastre pela própria tela (Gerenciar setores).
insert into setores_roteirizacao (filial, nome) values
  ('CDD PETROPOLIS', '100 - Triângulo'),
  ('CDD PETROPOLIS', '110 - Vila Isabel'),
  ('CDD PETROPOLIS', '120 - Monte Castelo'),
  ('CDD PETROPOLIS', '121 - Habitat'),
  ('CDD PETROPOLIS', '122 - 7 de Abril'),
  ('CDD PETROPOLIS', '126 - Centro 2'),
  ('CDD PETROPOLIS', '127 - ValParaiso'),
  ('CDD PETROPOLIS', '128 - 13 de Maio'),
  ('CDD PETROPOLIS', '129 - Centro de Petrópolis'),
  ('CDD PETROPOLIS', '130 - Pedro do Rio'),
  ('CDD PETROPOLIS', '140 - São José (após o morro grande)'),
  ('CDD PETROPOLIS', '141 - São José (até o morro grande)'),
  ('CDD PETROPOLIS', '142 - Areal'),
  ('CDD PETROPOLIS', '143 - Posse'),
  ('CDD PETROPOLIS', '150 - Quitandinha'),
  ('CDD PETROPOLIS', '151 - Xerém'),
  ('CDD PETROPOLIS', '160 - Bingen'),
  ('CDD PETROPOLIS', '171 - Paty Alferes'),
  ('CDD PETROPOLIS', '172 - Avelar'),
  ('CDD PETROPOLIS', '173 - Conrado'),
  ('CDD PETROPOLIS', '174 - Miguel Pereira'),
  ('CDD PETROPOLIS', '175 - Vale das videiras'),
  ('CDD PETROPOLIS', '180 - Quissamã'),
  ('CDD PETROPOLIS', '190 - Alto da Serra'),
  ('CDD PETROPOLIS', '200 - Rio das Flores'),
  ('CDD PETROPOLIS', '201 - Manuel Duarte'),
  ('CDD PETROPOLIS', '210 - Comendador Levy Gasparian'),
  ('CDD PETROPOLIS', '220 - Sapucaia'),
  ('CDD PETROPOLIS', '240 - Paraíba do Sul'),
  ('CDD PETROPOLIS', '250 - Paraiba do Sul - Centro'),
  ('CDD PETROPOLIS', '900 - Centro de Três Rios'),
  ('CDD PETROPOLIS', '909 - Morro da Gloria'),
  ('CDD PETROPOLIS', '910 - Correas'),
  ('CDD PETROPOLIS', '911 - Itaipava'),
  ('CDD PETROPOLIS', '930 - Retiro'),
  ('CDD PETROPOLIS', '940 - Araras')
on conflict (filial, nome) do nothing;
