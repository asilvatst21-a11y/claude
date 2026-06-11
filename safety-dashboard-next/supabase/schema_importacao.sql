-- Track each weekly import
CREATE TABLE IF NOT EXISTS importacoes (
  id serial PRIMARY KEY,
  tipo text NOT NULL, -- 'gsdpq', 'dto_checklist', 'prontuario_motorista', 'prontuario_ajudante'
  nome_arquivo text NOT NULL,
  periodo_ref text NOT NULL, -- 'YYYY-MM'
  total_registros int DEFAULT 0,
  total_colaboradores_encontrados int DEFAULT 0,
  importado_em timestamptz DEFAULT now()
);

-- GSDPQ observation records (from GSDPQ.xlsx and DTO.xlsx GSDPQ rows)
CREATE TABLE IF NOT EXISTS gsdpq_registros (
  id serial PRIMARY KEY,
  importacao_id int REFERENCES importacoes(id) ON DELETE CASCADE,
  colaborador_id int REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  matricula text,
  realizado_por text,
  tipo text, -- GSDPQ, TML, DEVOLUÇÃO, BEES, etc.
  data date NOT NULL,
  observacoes text,
  total_itens int DEFAULT 0,
  itens_ok int DEFAULT 0,
  itens_no int DEFAULT 0,
  itens_na int DEFAULT 0,
  percentual_conformidade numeric,
  periodo_ref text NOT NULL
);

-- Individual NO items for history/trending
CREATE TABLE IF NOT EXISTS gsdpq_itens_no (
  id serial PRIMARY KEY,
  registro_id int REFERENCES gsdpq_registros(id) ON DELETE CASCADE,
  colaborador_id int REFERENCES colaboradores(id),
  colaborador_nome text NOT NULL,
  item_nome text NOT NULL,
  data date NOT NULL,
  periodo_ref text NOT NULL
);

-- Prontuario weekly risk scores (higher = worse)
CREATE TABLE IF NOT EXISTS prontuario_scores (
  id serial PRIMARY KEY,
  importacao_id int REFERENCES importacoes(id) ON DELETE CASCADE,
  colaborador_id int REFERENCES colaboradores(id),
  nome text NOT NULL,
  cpf text,
  cargo text,
  situacao_empregado text, -- ATIVO, etc.
  status_liberacao text NOT NULL, -- LIBERADO / BLOQUEADO
  motivo_bloqueio text,
  pontuacao_ponderada numeric DEFAULT 0, -- higher = worse risk
  faixa text,
  acidentes numeric DEFAULT 0,
  colisoes numeric DEFAULT 0,
  desvios_monitoramentos numeric DEFAULT 0,
  fadigas numeric DEFAULT 0,
  multas numeric DEFAULT 0,
  sancoes_disciplinares numeric DEFAULT 0,
  telemetria_pontuacao numeric DEFAULT 0,
  periodo_ref text NOT NULL,
  importado_em timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gsdpq_registros_colaborador ON gsdpq_registros(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_gsdpq_registros_periodo ON gsdpq_registros(periodo_ref);
CREATE INDEX IF NOT EXISTS idx_gsdpq_itens_no_colaborador ON gsdpq_itens_no(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_gsdpq_itens_no_item ON gsdpq_itens_no(item_nome);
CREATE INDEX IF NOT EXISTS idx_prontuario_colaborador ON prontuario_scores(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_periodo ON prontuario_scores(periodo_ref);
