-- Variável do Armazém — remuneração variável por pontuação de separação.
-- Dois módulos: painel do supervisor (import diário + dashboard) e totem
-- público (colaborador consulta a própria variável pelos 3 primeiros
-- dígitos do CPF).
--
-- Rode cada PARTE separadamente no SQL Editor do Supabase.

-- ── PARTE 1 — cadastro de colaboradores do armazém ───────────────────────
-- Nome + CPF. O relatório de pontuação traz só o nome; o CPF vem daqui pra
-- o totem funcionar. cpf guardado só com dígitos.
CREATE TABLE IF NOT EXISTS armazem_colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,               -- só dígitos, 11 chars
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, cpf)
);
CREATE INDEX IF NOT EXISTS idx_arm_colab_filial ON armazem_colaboradores (filial);
CREATE INDEX IF NOT EXISTS idx_arm_colab_cpf ON armazem_colaboradores (filial, cpf text_pattern_ops);


-- ── PARTE 2 — tabela de clusters (execute em separado) ───────────────────
-- Faixas de pontuação → valor a cada 1.000 pontos. Editável (default
-- confirmado com o cliente). O colaborador recebe TODOS os pontos pela
-- faixa em que o total cai (não é progressivo).
CREATE TABLE IF NOT EXISTS variavel_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pont_min INTEGER NOT NULL,
  pont_max INTEGER NOT NULL,
  valor_por_1000 NUMERIC NOT NULL,
  ordem INTEGER NOT NULL
);

INSERT INTO variavel_clusters (pont_min, pont_max, valor_por_1000, ordem)
SELECT * FROM (VALUES
  (0,     10000, 1.00, 1),
  (10001, 11999, 1.10, 2),
  (12000, 14999, 1.30, 3),
  (15000, 16999, 1.50, 4),
  (17000, 19999, 1.70, 5),
  (20000, 99999, 2.00, 6)
) AS v(pont_min, pont_max, valor_por_1000, ordem)
WHERE NOT EXISTS (SELECT 1 FROM variavel_clusters);


-- ── PARTE 3 — pontuação diária importada (execute em separado) ───────────
-- Uma linha por colaborador por dia. nome_relatorio é o nome cru do
-- arquivo; colaborador_id/cpf são preenchidos casando com o cadastro no
-- import (podem ficar nulos se o nome não bater — aparece no dashboard,
-- mas não no totem). total = créditos − débitos, é a pontuação que entra
-- no cluster. valor_calculado é (total/1000 × valor_por_1000).
CREATE TABLE IF NOT EXISTS variavel_pontuacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  data DATE NOT NULL,
  nome_relatorio TEXT NOT NULL,
  colaborador_id UUID REFERENCES armazem_colaboradores(id) ON DELETE SET NULL,
  cpf TEXT,
  creditos NUMERIC NOT NULL DEFAULT 0,
  debitos NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  valor_por_1000 NUMERIC,
  valor_calculado NUMERIC NOT NULL DEFAULT 0,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, data, nome_relatorio)
);
CREATE INDEX IF NOT EXISTS idx_var_pont_filial_data ON variavel_pontuacao (filial, data);
CREATE INDEX IF NOT EXISTS idx_var_pont_cpf ON variavel_pontuacao (filial, cpf text_pattern_ops);


-- ── PARTE 4 — RLS (execute depois que as tabelas existirem) ──────────────
-- O totem é público (sem login), então as tabelas lidas por ele precisam
-- de policy liberada, igual matinal_tml / conferencia. Controle no app.
ALTER TABLE armazem_colaboradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON armazem_colaboradores;
CREATE POLICY "Acesso total" ON armazem_colaboradores FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE variavel_clusters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_clusters;
CREATE POLICY "Acesso total" ON variavel_clusters FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE variavel_pontuacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON variavel_pontuacao;
CREATE POLICY "Acesso total" ON variavel_pontuacao FOR ALL USING (true) WITH CHECK (true);
