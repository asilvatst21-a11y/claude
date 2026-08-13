-- Rotas de Risco: cadastro por cidade/bairro (em vez de só PDV de
-- referência). A cidade+bairro vem do mesmo "Cidades +Entregas"/"Região
-- +Entregas" já salvos em escalas_tml.cidades_entregas/regiao_entregas a
-- cada import de "Escala do dia (03.11.49.02)" em Distribuição > TML —
-- nenhum import novo precisa ser criado. Execute no SQL Editor do Supabase.
-- Idempotente.

alter table rotas_risco_pontos add column if not exists cidade text;
alter table rotas_risco_pontos add column if not exists bairro text;

create index if not exists rotas_risco_pontos_cidade_idx on rotas_risco_pontos(filial, cidade);
