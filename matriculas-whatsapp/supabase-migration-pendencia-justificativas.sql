-- Ajuste: vales com 2 ajudantes compartilham os mesmos itens (a diferença é
-- do vale, não de uma pessoa específica) — então os dois ajudantes recebem o
-- aviso de WhatsApp hoje, e os dois devem poder ver a pendência e mandar a
-- própria justificativa prévia pelo link, sem que um veja o vale do outro
-- como se fosse impedido de justificar.
--
-- Substitui a coluna única `vale_itens.justificativa_previa_colaborador`
-- (só guardava 1 texto por item) por uma tabela — 1 linha por item+ajudante.
-- Execute no SQL Editor do Supabase.

create table if not exists pendencia_justificativas (
  id bigserial primary key,
  vale_item_id uuid not null references vale_itens(id) on delete cascade,
  ajudante_id uuid not null references ajudantes(id) on delete cascade,
  texto text not null,
  criado_em timestamptz not null default now()
);
alter table pendencia_justificativas drop constraint if exists pendencia_justificativas_unico;
alter table pendencia_justificativas add constraint pendencia_justificativas_unico unique (vale_item_id, ajudante_id);

alter table pendencia_justificativas enable row level security;
drop policy if exists "Acesso total" on pendencia_justificativas;
create policy "Acesso total" on pendencia_justificativas for all using (true) with check (true);

-- A coluna antiga não chegou a ser usada em produção (feature só em teste) —
-- pode remover sem perda de dado real.
alter table vale_itens drop column if exists justificativa_previa_colaborador;
