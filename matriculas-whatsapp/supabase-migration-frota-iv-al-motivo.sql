-- IV - AL: motivo da troca de placa, classificado manualmente (nem toda
-- troca casa com uma OS aberta no sistema). OS é opcional mesmo quando o
-- motivo é Manutenção — nem toda troca por manutenção abre OS.
alter table frota_iv_al_trocas_placa
  add column if not exists motivo text check (motivo in ('MANUTENCAO', 'AJUSTE_FIXACAO', 'MUDANCA_PERFIL', 'OUTRO')),
  add column if not exists os_numero text,
  add column if not exists os_descricao text,
  add column if not exists motivo_classificado_em timestamptz,
  add column if not exists motivo_classificado_por text;
