-- Migração: tempo de deslocamento (checklist) + saída antes da matinal é inválida.
-- Execute no SQL Editor do Supabase. Idempotente.

-- 1) Tabela do checklist: guarda o horário em que cada motorista iniciou o
--    checklist, pra medir o tempo de deslocamento (HR INICIO − matinal da sala).
create table if not exists checklist_tml (
  id bigserial primary key,
  filial text not null,
  mapa bigint not null,
  placa text,
  matricula bigint,
  nome text,
  sala text,
  data date,
  horario_inicio text,
  horario_final text,
  tempo_deslocamento_minutos integer,
  motivo text,
  created_at timestamptz not null default now(),
  unique (filial, mapa)
);
create index if not exists idx_checklist_tml_filial_data on checklist_tml(filial, data);

alter table checklist_tml enable row level security;
drop policy if exists "Acesso total" on checklist_tml;
create policy "Acesso total" on checklist_tml for all using (true);

-- 2) Novo resultado "invalido" em historico_tml: saída registrada antes do
--    horário matinal da sala não é uma saída de TML válida e não entra na conta.
alter table historico_tml drop constraint if exists historico_tml_resultado_check;
alter table historico_tml add constraint historico_tml_resultado_check
  check (resultado in ('no_prazo', 'atrasado', 'indefinido', 'invalido'));
