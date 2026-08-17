-- Migração: histórico de sala por motorista (COLORADO / SUB-FURIA),
-- versionado por data de vigência. Execute no SQL Editor do Supabase.
-- Idempotente.
--
-- Mesmo padrão de tml_meta_matinal/tml_gatilho_estouro/tml_etapa_ideal:
-- cadastrar uma troca não apaga a anterior, só passa a valer a partir da
-- data escolhida — checklist já importado antes da troca continua sendo
-- calculado com a sala que valia na época dele.
--
-- Motivo: motoristas_sala_tml só guarda a sala ATUAL de cada um. Quando
-- alguém troca de sala no meio do caminho, reimportar/recalcular checklist
-- antigo com a sala de hoje dá horário de matinal errado (COLORADO 07h vs
-- SUB-FURIA 08h). Esta tabela deixa o sistema saber qual sala valia em
-- cada data, sem precisar de correção manual por SQL a cada troca.

create table if not exists motoristas_sala_historico (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  matricula bigint not null,
  sala text not null check (sala in ('COLORADO', 'SUB-FURIA')),
  vigente_a_partir date not null,
  created_at timestamptz not null default now(),
  unique (filial, matricula, vigente_a_partir)
);
create index if not exists idx_motoristas_sala_historico_matricula on motoristas_sala_historico(filial, matricula);

alter table motoristas_sala_historico enable row level security;
drop policy if exists "Acesso total" on motoristas_sala_historico;
create policy "Acesso total" on motoristas_sala_historico for all using (true) with check (true);
