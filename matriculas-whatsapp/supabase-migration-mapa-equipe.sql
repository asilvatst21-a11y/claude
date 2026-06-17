-- Migração: equipe do mapa (motorista + ajudantes) para enriquecer a
-- confirmação de reposições. Importada da aba "Base" da planilha diária.
-- Execute no SQL Editor do Supabase. Idempotente.

create table if not exists mapa_equipe (
  id                  bigserial primary key,
  data                date not null,
  filial              text,
  mapa                text not null,
  motorista_matricula text,
  motorista_nome      text,
  ajudante1_matricula text,
  ajudante1_nome      text,
  ajudante2_matricula text,
  ajudante2_nome      text
);

-- Lookup rápido por dia + mapa (usado pelo webhook na confirmação)
create index if not exists mapa_equipe_lookup_idx on mapa_equipe(data, mapa);

-- O webhook (api/zapi-webhook.ts) lê esta tabela com o papel anon/authenticated
-- para anexar os nomes da equipe na confirmação. A escrita continua só via
-- service_role (import na tela Catálogo / Vendas), que ignora RLS.
grant select on mapa_equipe to anon, authenticated;
alter table mapa_equipe enable row level security;
drop policy if exists "leitura publica mapa_equipe" on mapa_equipe;
create policy "leitura publica mapa_equipe" on mapa_equipe for select using (true);
