-- Conferência Digital (Distribuição) — o ajudante confere no celular, baia
-- por baia, os itens carregados no caminhão, a partir do Relatório de
-- Separação importado diariamente.
--
-- Rode cada PARTE separadamente no SQL Editor do Supabase (evita lock longo).

-- ── PARTE 1 — tabela de baias (paletes) ──────────────────────────────────
-- Uma linha por baia (palete) de cada mapa/dia. O palete cru (ex.:
-- "P02_M_02_1/42") é quebrado em porta (M = motorista, A = ajudante,
-- Z = itens avulsos) + ordem da porta. status/tempos guardam o andamento
-- da conferência feita pelo ajudante.
CREATE TABLE IF NOT EXISTS conferencia_baias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  mapa BIGINT NOT NULL,
  data DATE NOT NULL,
  palete TEXT NOT NULL,
  porta TEXT NOT NULL,          -- 'M' | 'A' | 'Z'
  ordem INTEGER,               -- ordem da porta (null p/ avulsos)
  rotulo TEXT NOT NULL,        -- rótulo de exibição, ex.: "Motorista · Ordem 02"
  total_itens INTEGER NOT NULL DEFAULT 0,
  total_caixas NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',   -- 'pendente' | 'conferida'
  iniciada_em TIMESTAMPTZ,
  finalizada_em TIMESTAMPTZ,
  conferido_por TEXT,
  importado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (filial, mapa, data, palete)
);
CREATE INDEX IF NOT EXISTS idx_conf_baias_filial_data ON conferencia_baias (filial, data);
CREATE INDEX IF NOT EXISTS idx_conf_baias_mapa ON conferencia_baias (filial, mapa, data);


-- ── PARTE 2 — tabela de itens (execute depois da PARTE 1) ─────────────────
-- Uma linha por item de cada baia. conferido/divergencia guardam a marcação
-- do ajudante. Chave natural (filial, mapa, data, palete, sequencia) permite
-- reimportar o relatório sem perder o que já foi conferido.
CREATE TABLE IF NOT EXISTS conferencia_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baia_id UUID NOT NULL REFERENCES conferencia_baias(id) ON DELETE CASCADE,
  filial TEXT NOT NULL,
  mapa BIGINT NOT NULL,
  data DATE NOT NULL,
  palete TEXT NOT NULL,
  sequencia INTEGER NOT NULL,
  codigo TEXT,
  descricao TEXT,
  tipo TEXT,                   -- 'Retornável' | 'Descartável'
  quantidade NUMERIC,
  unidade TEXT,
  conferido BOOLEAN NOT NULL DEFAULT FALSE,
  conferido_em TIMESTAMPTZ,
  divergencia BOOLEAN NOT NULL DEFAULT FALSE,
  tipo_divergencia TEXT,       -- 'falta' | 'sobra' | 'avaria'
  qtd_real NUMERIC,
  obs TEXT,
  UNIQUE (filial, mapa, data, palete, sequencia)
);
CREATE INDEX IF NOT EXISTS idx_conf_itens_baia ON conferencia_itens (baia_id);
CREATE INDEX IF NOT EXISTS idx_conf_itens_filial_data ON conferencia_itens (filial, data);


-- ── PARTE 3 — grupo de WhatsApp p/ divergências (execute em separado) ─────
-- Grupo que recebe o aviso automático quando o ajudante marca uma
-- divergência. Mesmo padrão de grupo_frota_whatsapp / grupo_gsdpq_whatsapp.
ALTER TABLE filiais ADD COLUMN IF NOT EXISTS grupo_conferencia_whatsapp TEXT;


-- ── PARTE 4 — RLS (execute depois que as tabelas das partes 1 e 2 existirem) ──
-- A página do ajudante é pública (sem login), então precisa ler/gravar via
-- policy liberada, igual matinal_tml. Controle de acesso é feito no app.
ALTER TABLE conferencia_baias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON conferencia_baias;
CREATE POLICY "Acesso total" ON conferencia_baias FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE conferencia_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON conferencia_itens;
CREATE POLICY "Acesso total" ON conferencia_itens FOR ALL USING (true) WITH CHECK (true);
