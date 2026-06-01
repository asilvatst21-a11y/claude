-- Safety Dashboard - Supabase Schema
-- Cole este SQL no Supabase SQL Editor para criar as tabelas necessárias.

-- Colaboradores
CREATE TABLE IF NOT EXISTS colaboradores (
  id serial PRIMARY KEY,
  nome text NOT NULL,
  cargo text NOT NULL,
  setor text NOT NULL,
  lider_responsavel text NOT NULL,
  data_admissao date NOT NULL,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo'))
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_status ON colaboradores (status);
CREATE INDEX IF NOT EXISTS idx_colaboradores_setor ON colaboradores (setor);

-- DTOs (Documentos de Treinamento Operacional)
CREATE TABLE IF NOT EXISTS dtos (
  id serial PRIMARY KEY,
  colaborador_id int NOT NULL REFERENCES colaboradores (id) ON DELETE CASCADE,
  data_realizacao date NOT NULL,
  data_validade date NOT NULL,
  status text NOT NULL DEFAULT 'em_dia',
  lider_id int REFERENCES colaboradores (id),
  observacoes text
);

CREATE INDEX IF NOT EXISTS idx_dtos_colaborador ON dtos (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_dtos_validade ON dtos (data_validade);

-- Avaliações de Conduta
CREATE TABLE IF NOT EXISTS avaliacoes_conduta (
  id serial PRIMARY KEY,
  colaborador_id int NOT NULL REFERENCES colaboradores (id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('ato_inseguro', 'condicao_insegura', 'abordagem_positiva')),
  descricao text NOT NULL,
  gravidade int NOT NULL CHECK (gravidade BETWEEN 1 AND 5),
  registrado_por text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_colaborador ON avaliacoes_conduta (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_data ON avaliacoes_conduta (data);

-- Telemetria
CREATE TABLE IF NOT EXISTS telemetria (
  id serial PRIMARY KEY,
  motorista_id int NOT NULL REFERENCES colaboradores (id) ON DELETE CASCADE,
  periodo_ref text NOT NULL,
  qtd_excessos_velocidade int NOT NULL DEFAULT 0,
  qtd_frenagens_bruscas int NOT NULL DEFAULT 0,
  qtd_curvas_bruscas int NOT NULL DEFAULT 0,
  score_calculado numeric
);

CREATE INDEX IF NOT EXISTS idx_telemetria_motorista ON telemetria (motorista_id);
CREATE INDEX IF NOT EXISTS idx_telemetria_periodo ON telemetria (periodo_ref);

-- Encaminhamentos
CREATE TABLE IF NOT EXISTS encaminhamentos (
  id serial PRIMARY KEY,
  colaborador_id int NOT NULL REFERENCES colaboradores (id) ON DELETE CASCADE,
  tipo text NOT NULL,
  lider_id int REFERENCES colaboradores (id),
  prazo date NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluido')),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_encaminhamentos_colaborador ON encaminhamentos (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_encaminhamentos_status ON encaminhamentos (status);
