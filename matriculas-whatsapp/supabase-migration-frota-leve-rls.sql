-- Migração: RLS das tabelas da Frota Leve (correção)
-- As tabelas frota_leve_* foram criadas sem RLS/política, então o painel (que
-- usa a chave pública/anon) não conseguia inserir nem ler os cadastros de
-- veículos e condutores. Aqui aplicamos o mesmo padrão "Acesso total" usado
-- nas demais tabelas do painel (ex.: frota_meta_contratada).
-- Execute no SQL Editor do Supabase. Idempotente.

alter table frota_leve_veiculos   enable row level security;
drop policy if exists "Acesso total" on frota_leve_veiculos;
create policy "Acesso total" on frota_leve_veiculos   for all using (true) with check (true);

alter table frota_leve_condutores enable row level security;
drop policy if exists "Acesso total" on frota_leve_condutores;
create policy "Acesso total" on frota_leve_condutores for all using (true) with check (true);

alter table frota_leve_saidas     enable row level security;
drop policy if exists "Acesso total" on frota_leve_saidas;
create policy "Acesso total" on frota_leve_saidas     for all using (true) with check (true);
