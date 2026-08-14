-- Rotas de Risco: um ponto passa a poder ter várias cidades/bairros, não só
-- um par. Caso real: duas rotas diferentes (ex.: "Paty" e "Miguel") passam
-- pelo mesmo trecho físico — antes precisava cadastrar 2 pontos duplicados,
-- um por cidade; agora cadastra 1 ponto com os 2 pares de cidade/bairro.

alter table rotas_risco_pontos
  add column if not exists cidades_bairros jsonb not null default '[]'::jsonb;

-- Migra o par único já cadastrado (cidade/bairro) pro novo formato em lista,
-- sem perder o que já existia.
update rotas_risco_pontos
set cidades_bairros = jsonb_build_array(jsonb_build_object('cidade', cidade, 'bairro', bairro))
where cidade is not null and jsonb_array_length(cidades_bairros) = 0;

alter table rotas_risco_pontos drop column if exists cidade;
alter table rotas_risco_pontos drop column if exists bairro;

-- RLS "using(true)" sozinho não libera escrita pelo client com a anon key —
-- precisa do grant explícito também (mesmo problema já visto em outras
-- tabelas do projeto).
grant select, insert, update on rotas_risco_pontos to anon, authenticated;
