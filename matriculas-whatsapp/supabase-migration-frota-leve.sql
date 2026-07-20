-- Migração: Controle de Saída da Frota Leve (via WhatsApp)
-- Execute no SQL Editor do Supabase. Idempotente.
--
-- Fluxo: o colaborador manda "registro" no grupo → o bot oferece os botões
-- Saída / Retorno. Na saída ele informa placa, KM, hora, destino, previsão de
-- retorno e a foto do painel (o bot lê o KM da foto e confere). Quando a
-- previsão expira sem o check de retorno, o bot pergunta se ele já voltou.

-- Grupo de WhatsApp dedicado ao controle da frota leve (mesmo padrão dos
-- demais grupos por filial). Configure em /distribuicao/frota (ou onde os
-- outros grupos são cadastrados).
alter table filiais add column if not exists grupo_frota_leve_whatsapp text;

-- Uma linha por viagem (saída → retorno). A própria linha carrega o estado da
-- coleta (status) e, ao final, o histórico consolidado da viagem.
create table if not exists frota_leve_saidas (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  grupo_id text not null,

  motorista_telefone text,
  motorista_nome text,

  -- Máquina de estados da coleta:
  --  coletando_saida      → aguardando os campos da saída (placa, km, ...)
  --  aguardando_foto_saida→ campos ok, aguardando a foto do painel
  --  em_rota              → saída confirmada; veículo circulando
  --  coletando_retorno    → check de retorno iniciado, aguardando km/hora/obs
  --  aguardando_foto_retorno → aguardando a foto do painel no retorno
  --  finalizado           → viagem encerrada
  --  cancelado            → coleta abortada
  status text not null default 'coletando_saida',

  -- Dados da saída
  placa text,
  km_saida integer,
  hora_saida text,               -- HH:MM informado pelo colaborador
  destino text,
  previsao_min integer,          -- previsão de retorno, em minutos
  previsao_retorno timestamptz,  -- instante em que a previsão expira
  foto_saida_url text,
  km_saida_foto integer,         -- KM lido da foto do painel (conferência)

  -- Dados do retorno
  km_retorno integer,
  hora_retorno text,
  foto_retorno_url text,
  km_retorno_foto integer,
  observacoes text,

  -- Controle do lembrete de retorno (evita reenviar)
  lembrete_enviado_em timestamptz,

  saida_registrada_em timestamptz,  -- quando entrou em 'em_rota'
  finalizado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sessão ativa de um motorista no grupo (coleta em andamento).
create index if not exists idx_frota_leve_sessao
  on frota_leve_saidas (grupo_id, motorista_telefone, status);

-- Viagens em rota por placa (bloqueio de saída duplicada) e varredura do lembrete.
create index if not exists idx_frota_leve_em_rota
  on frota_leve_saidas (placa, status);
create index if not exists idx_frota_leve_previsao
  on frota_leve_saidas (status, previsao_retorno);

-- Mantém updated_at em dia (usado para expirar sessões de coleta abandonadas).
create or replace function set_frota_leve_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_frota_leve_updated_at on frota_leve_saidas;
create trigger trg_frota_leve_updated_at
  before update on frota_leve_saidas
  for each row execute function set_frota_leve_updated_at();
