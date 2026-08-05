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

-- 3) Hotspot de telemetria x rota do dia (03.11.49.02) — avisa o motorista
--    quando a rota de hoje passa por uma cidade com histórico de incidência.
--    Desligado por padrão (telemetria_hotspot_ativo=false): precisa ser
--    ativado explicitamente na tela antes de mandar qualquer mensagem —
--    já tivemos bloqueio de 24h por disparo em massa no passado (ver
--    lib/whatsappStatus.ts), então esse gatilho automático não entra ligado
--    sozinho.
alter table filiais add column if not exists telemetria_hotspot_ativo boolean not null default false;
alter table filiais add column if not exists telemetria_hotspot_min_eventos int not null default 8;
alter table filiais add column if not exists telemetria_hotspot_top_n int not null default 5;

create table if not exists telemetria_alerta_rota_enviado (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  matricula int,
  data date not null,
  cidade text not null,
  enviado_em timestamptz not null default now()
);
create unique index if not exists idx_telemetria_alerta_rota_enviado_unico
  on telemetria_alerta_rota_enviado (filial, matricula, data, cidade);

alter table telemetria_alerta_rota_enviado enable row level security;
drop policy if exists "Acesso total telemetria_alerta_rota_enviado" on telemetria_alerta_rota_enviado;
create policy "Acesso total telemetria_alerta_rota_enviado" on telemetria_alerta_rota_enviado for all using (true);
