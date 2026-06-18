-- Guarda um "retrato" do que foi de fato lançado no CORA no momento em que a
-- reposição é vinculada/registrada (produto, mapa, motivo e quantidade), para
-- fins de conformidade. Diferente dos demais campos cora_*, estes NÃO são
-- sobrescritos em reimportações seguintes do mesmo arquivo CORA.
-- Execute no SQL Editor do Supabase.

alter table reposicoes add column if not exists cora_produto_lancado text;
alter table reposicoes add column if not exists cora_mapa_lancado text;
alter table reposicoes add column if not exists cora_motivo_lancado text;
alter table reposicoes add column if not exists cora_quantidade_lancada text;
