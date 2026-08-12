-- Módulo Segurança → PDV Crítico: relatos de motorista (categoria "Segurança"
-- do relato já existente) viram caso, com criticidade inicial por subgrupo,
-- agendamento de visita, checklist único em campo e finalização.
--
-- Só a categoria "Segurança" entra aqui — Produtividade/Qualidade/
-- Cordialidade/Outros seguem pro time responsável e nunca viram linha nesta
-- tabela.

-- ── Config: nível de criticidade inicial por subgrupo ──────────────────
-- Editável pela Segurança a qualquer momento — só define a fila/prazo
-- inicial. Quem decide a criticidade de verdade é sempre o checklist da
-- visita (pdv_seguranca_relatos.nivel_medido).
CREATE TABLE IF NOT EXISTS pdv_seguranca_niveis_subgrupo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  subgrupo TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('alto', 'medio', 'leve')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (filial, subgrupo)
);

-- ── Relatos importados (planilha "Export (2)") virados caso ────────────
CREATE TABLE IF NOT EXISTS pdv_seguranca_relatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial TEXT NOT NULL,
  codigo_pdv TEXT NOT NULL,
  nome_pdv TEXT,
  categoria TEXT NOT NULL,
  subgrupo TEXT NOT NULL,
  codigo_motorista TEXT,
  relato_motorista TEXT,
  data_relato DATE NOT NULL,
  origem_status TEXT,                       -- status que já veio da planilha de origem (ex.: "CANCELED")

  nivel_inicial TEXT CHECK (nivel_inicial IN ('alto', 'medio', 'leve')),
  prazo_visita DATE,

  status TEXT NOT NULL DEFAULT 'aguardando_triagem'
    CHECK (status IN ('aguardando_triagem', 'agendado', 'preenchido', 'aprovado', 'nao_critico')),

  supervisor_id UUID REFERENCES supervisores_tml(id),
  agendado_em TIMESTAMPTZ,
  agendado_por TEXT,
  link_token TEXT UNIQUE,                   -- token do link público enviado ao supervisor

  visitado_em TIMESTAMPTZ,
  nivel_medido TEXT CHECK (nivel_medido IN ('alto', 'medio', 'leve', 'conforme')),
  pontuacao_medida INT,
  riscos_marcados TEXT[],                   -- chips selecionados na visita
  acao_recomendada TEXT,
  foto_url TEXT,

  finalizado_em TIMESTAMPTZ,
  finalizado_por TEXT,

  justificativa_nao_critico TEXT,
  decidido_por TEXT,
  decidido_em TIMESTAMPTZ,

  caso_reaberto_de UUID REFERENCES pdv_seguranca_relatos(id),  -- aponta pro caso original quando reaberto

  importado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Evita duplicar o mesmo relato em reimportações do mesmo arquivo (ou de
  -- exportações sobrepostas) sem nunca sobrescrever um caso já em andamento.
  UNIQUE (filial, codigo_pdv, subgrupo, data_relato)
);

CREATE INDEX IF NOT EXISTS idx_pdv_seg_relatos_status ON pdv_seguranca_relatos (filial, status);
CREATE INDEX IF NOT EXISTS idx_pdv_seg_relatos_pdv ON pdv_seguranca_relatos (filial, codigo_pdv);

ALTER TABLE pdv_seguranca_niveis_subgrupo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON pdv_seguranca_niveis_subgrupo;
CREATE POLICY "Acesso total" ON pdv_seguranca_niveis_subgrupo FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE pdv_seguranca_relatos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total" ON pdv_seguranca_relatos;
CREATE POLICY "Acesso total" ON pdv_seguranca_relatos FOR ALL USING (true) WITH CHECK (true);

-- Os 8 subgrupos e níveis sugeridos (do mockup aprovado) são semeados pela
-- própria tela de configuração no primeiro acesso — não precisa de INSERT
-- manual aqui, já que o código de filial usado no resto do sistema não é
-- fixo (vem de usuario.filial).
