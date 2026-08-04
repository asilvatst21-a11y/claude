-- Migração: Farol de Mercados e PDVs Críticos (Distribuição).
--
-- 1) BEES por PDV: o import de BEES em Jornada e Tempo em Rota já lê um
--    arquivo com uma linha por PDV visitado (poc_external_id, poc_name,
--    status da visita), mas hoje só aproveita o total agregado por mapa
--    (jornada_bees). Esta tabela nova guarda a linha por PDV também, sem
--    mexer em nada do cálculo por mapa que já existe.
-- 2) CORA: só usado aqui pra puxar o valor da nota por cliente/dia — não
--    determina status de entrega (isso vem do BEES).
-- 3) Watchlist: cadastro manual dos PDVs críticos e mercados (Seller Zé /
--    Trava) que entram no Farol — não depende de nenhum import.
--
-- Execute no SQL Editor do Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS distribuicao_bees_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  data DATE NOT NULL,
  mapa BIGINT NOT NULL,
  pdv_codigo TEXT NOT NULL,
  pdv_nome TEXT,
  status TEXT NOT NULL,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, data, mapa, pdv_codigo)
);
CREATE INDEX IF NOT EXISTS idx_distribuicao_bees_visitas_pdv ON distribuicao_bees_visitas (filial, data, pdv_codigo);

CREATE TABLE IF NOT EXISTS distribuicao_cora_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  data DATE NOT NULL,
  cliente_codigo TEXT NOT NULL,
  cliente_nome TEXT,
  numero_nf TEXT,
  valor_total_nf NUMERIC,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, data, cliente_codigo, numero_nf)
);
CREATE INDEX IF NOT EXISTS idx_distribuicao_cora_notas_cliente ON distribuicao_cora_notas (filial, data, cliente_codigo);

CREATE TABLE IF NOT EXISTS distribuicao_watchlist_pdv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'pdv_critico',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, codigo, categoria)
);
ALTER TABLE distribuicao_watchlist_pdv DROP CONSTRAINT IF EXISTS distribuicao_watchlist_pdv_categoria_check;
ALTER TABLE distribuicao_watchlist_pdv ADD CONSTRAINT distribuicao_watchlist_pdv_categoria_check
  CHECK (categoria IN ('pdv_critico', 'mercado_sellerze', 'mercado_trava'));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['distribuicao_bees_visitas', 'distribuicao_cora_notas', 'distribuicao_watchlist_pdv'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Acesso total" ON %I', t);
    EXECUTE format('CREATE POLICY "Acesso total" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
