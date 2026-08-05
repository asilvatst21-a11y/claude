-- Migração: melhorias de Telemetria (Distribuição).
-- 1) Grupo de WhatsApp pro alerta automático de "salto" (spike) de eventos.
-- 2) Tabela de acompanhamento de reciclagem — motorista que ultrapassa o
--    limiar mensal de eventos entra aqui pra o supervisor marcar quando a
--    reciclagem foi feita. Não tem nenhum vínculo com o módulo de
--    Treinamentos, é só um apontamento + acompanhamento manual.
-- Idempotente.

alter table filiais add column if not exists grupo_telemetria_spike_whatsapp text;

create table if not exists telemetria_reciclagem (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  motorista text not null,
  mes text not null, -- 'YYYY-MM'
  eventos_no_mes int not null,
  feito boolean not null default false,
  feito_em timestamptz,
  feito_por text,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_telemetria_reciclagem_unico on telemetria_reciclagem (filial, motorista, mes);

alter table telemetria_reciclagem enable row level security;
drop policy if exists "Acesso total telemetria_reciclagem" on telemetria_reciclagem;
create policy "Acesso total telemetria_reciclagem" on telemetria_reciclagem for all using (true);
