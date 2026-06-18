-- Migração: vínculo com o CORA (Ambev) nas Reposições
-- Execute no SQL Editor do Supabase (depois de supabase-migration-reposicoes.sql).

alter table reposicoes add column if not exists cora_solicitacao_id text;
alter table reposicoes add column if not exists cora_status text;             -- Pendente | Aprovada | Reprovada (texto cru do CORA)
alter table reposicoes add column if not exists cora_motivo_reprovacao text;
alter table reposicoes add column if not exists cora_pedido_reposicao text;
alter table reposicoes add column if not exists cora_nf text;
alter table reposicoes add column if not exists cora_data_acao text;
alter table reposicoes add column if not exists cora_importado_em timestamptz;

create index if not exists idx_reposicoes_cora_solicitacao on reposicoes(cora_solicitacao_id);
