-- IV - AL: acompanhamento de OS de manutenção abertas durante o
-- carregamento (22h-06h), independente de já estarem vinculadas a uma
-- troca de placa classificada manualmente.
create table if not exists frota_os_atendimento (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  os bigint not null,
  data_abertura date,
  hora_abertura text,
  placa text,
  status_os text,
  tipo_os text,
  criticidade text,
  fornecedor text,
  problema text,
  servico text,
  usuario_criacao text,
  observacao text,
  valor_total numeric,
  importado_em timestamptz not null default now(),
  unique (filial, os)
);

create index if not exists frota_os_atendimento_filial_data_idx
  on frota_os_atendimento (filial, data_abertura);

alter table frota_os_atendimento enable row level security;
drop policy if exists "Acesso total" on frota_os_atendimento;
create policy "Acesso total" on frota_os_atendimento for all using (true) with check (true);
