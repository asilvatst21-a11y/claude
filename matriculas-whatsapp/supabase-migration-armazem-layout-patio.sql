-- Migração: Layout de Pátio (Armazém) — editor onde o usuário desenha as
-- vagas e as faixas de pedestre em cima da foto de satélite do pátio.
-- Um registro por filial (upsert em cima de `filial`). Idempotente.

create table if not exists armazem_layout_patio (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  imagem_url text,
  desenho jsonb not null default '[]',
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_armazem_layout_patio_filial on armazem_layout_patio (filial);

alter table armazem_layout_patio enable row level security;
drop policy if exists "Acesso total armazem_layout_patio" on armazem_layout_patio;
create policy "Acesso total armazem_layout_patio" on armazem_layout_patio for all using (true);

-- Storage: bucket para a foto de satélite/planta de fundo do pátio (mesmo
-- padrão do bucket 'fotos-clientes' já usado no projeto).
insert into storage.buckets (id, name, public)
values ('armazem-layout-patio', 'armazem-layout-patio', true)
on conflict (id) do nothing;

create policy "Upload publico armazem-layout-patio" on storage.objects for insert with check (bucket_id = 'armazem-layout-patio');
create policy "Leitura publica armazem-layout-patio" on storage.objects for select using (bucket_id = 'armazem-layout-patio');
create policy "Delete publico armazem-layout-patio" on storage.objects for delete using (bucket_id = 'armazem-layout-patio');
