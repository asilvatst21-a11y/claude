-- Migração: Financeiro > Chapa / Descarga Paletizada
--
-- Controle de pagamento de chapa (ajudante) e descarga paletizada a clientes
-- específicos, liberado por valor da nota (chapa) ou quantidade de pallets
-- (descarga). Cada cliente tem seus próprios parâmetros e pode ter os dois
-- tipos habilitados, só um, ou nenhum (fica inativo na tela).
--
-- Execute no SQL Editor do Supabase. Idempotente.

create table if not exists financeiro_chapa_clientes (
  id uuid primary key default gen_random_uuid(),
  codigo int not null unique,
  nome text not null,
  ativo boolean not null default true,
  chapa_habilitado boolean not null default false,
  chapa_valor_a_cada_nota numeric not null default 8000,
  chapa_valor_por_chapa numeric not null default 60,
  descarga_habilitado boolean not null default false,
  descarga_minimo_pallets int not null default 5,
  descarga_valor_por_pallet numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists financeiro_chapa_lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  cliente_codigo int not null,
  cliente_nome text not null,
  mapa text,
  tipo text not null check (tipo in ('chapa', 'descarga')),
  valor_nota numeric,
  quantidade_pallets int,
  valor_calculado numeric not null,
  dentro_parametro boolean not null,
  confirmado_fora_parametro boolean not null default false,
  comprovante_url text,
  filial text,
  registrado_por text,
  created_at timestamptz not null default now()
);

create index if not exists financeiro_chapa_lancamentos_data_idx
  on financeiro_chapa_lancamentos(data, cliente_codigo);

alter table filiais add column if not exists grupo_financeiro_whatsapp text;

-- Clientes hoje habilitados (código - nome, conforme lista informada).
-- Parâmetros de chapa entram com o padrão vigente (a cada R$ 8.000 em nota,
-- 1 chapa de R$ 60); o valor por pallet da descarga fica em branco até o
-- financeiro preencher no cadastro, pois varia por cliente e não foi
-- informado ainda.
insert into financeiro_chapa_clientes (codigo, nome, chapa_habilitado, descarga_habilitado)
values
  (20416, 'ACEPEL', true, true),
  (26649, 'DIB CD', true, true),
  (5778,  'FORTE BEER', true, true),
  (6042,  'FORTE BEER', true, true),
  (20364, 'GALERIA', true, true),
  (3576,  'MEAT', true, true),
  (5634,  'NA BRASA', true, true),
  (3875,  'PETRO FRUTAS', true, true),
  (275,   'SUPERSERRA', true, true),
  (6716,  'TERE ALTO DA SERRA', true, true),
  (6797,  'TERE CASCATINHA', true, true),
  (6707,  'TERE CASCATINHA', true, true),
  (13039, 'TIC TAC', true, true),
  (21008, 'ZÉ PONTE PRETA', true, true),
  (27213, 'ZÉ - NA KOMBIS', true, true)
on conflict (codigo) do nothing;

-- Acesso para a role anon/authenticated (mesmo modelo já usado no projeto —
-- ver supabase-c1-anon-vales.sql).
do $$
declare
  t text;
  tabelas text[] := array['financeiro_chapa_clientes', 'financeiro_chapa_lancamentos'];
begin
  foreach t in array tabelas loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "acesso total" on %I', t);
    execute format(
      'create policy "acesso total" on %I for all to anon, authenticated using (true) with check (true)',
      t
    );
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;
