-- Migração: Solicitação Extra (formulário público "Solicitação E.C")
-- Execute no SQL Editor do Supabase.

create table if not exists solicitacoes_extra (
  id uuid primary key default gen_random_uuid(),
  filial text not null,
  nome_solicitante text not null,
  data_solicitacao date not null default current_date,
  tipo_solicitacao text not null, -- 'Finalizar Rota' | 'Entrega/Recolha de Materiais' | 'Outros'
  descricao text,
  mapa text,
  local text,
  solicitante_ambev text,
  motorista_nome text,
  ajudante1_nome text,
  ajudante2_nome text,
  valor_acordado numeric,
  created_at timestamptz not null default now()
);

-- Mesmo padrão de acesso já usado em colaboradores: tabela liberada para
-- leitura/escrita por anon, já que o formulário de solicitação é público
-- (sem login) e usa a chave anônima do Supabase.
alter table solicitacoes_extra enable row level security;
create policy "Acesso total" on solicitacoes_extra for all using (true);

create index if not exists idx_solicitacoes_extra_filial on solicitacoes_extra(filial);
create index if not exists idx_solicitacoes_extra_data on solicitacoes_extra(data_solicitacao);
