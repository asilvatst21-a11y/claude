-- Execute no SQL Editor do Supabase (https://supabase.com/dashboard)

create table if not exists ff_sync (
  id           text primary key,
  business_id  text not null,
  entity_type  text not null,
  entity_id    text not null,
  data         jsonb not null default '{}',
  deleted      boolean not null default false,
  synced_at    timestamptz default now()
);

create index if not exists ff_sync_business on ff_sync(business_id);
create index if not exists ff_sync_entity  on ff_sync(business_id, entity_type);

-- Permite leitura/escrita pública (filtrada por business_id no app)
alter table ff_sync enable row level security;

create policy "acesso_publico" on ff_sync
  for all using (true) with check (true);
