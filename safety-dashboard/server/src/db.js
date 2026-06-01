const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'safety.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS colaboradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cargo TEXT NOT NULL,
    setor TEXT NOT NULL,
    lider_responsavel TEXT NOT NULL,
    data_admissao TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK(status IN ('ativo','inativo'))
  );

  CREATE TABLE IF NOT EXISTS dtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
    data_realizacao TEXT NOT NULL,
    data_validade TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('em_dia','vencido','ausente')),
    lider_id INTEGER REFERENCES colaboradores(id),
    observacoes TEXT
  );

  CREATE TABLE IF NOT EXISTS avaliacoes_conduta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
    data TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('ato_inseguro','condicao_insegura','abordagem_positiva')),
    descricao TEXT NOT NULL,
    gravidade INTEGER NOT NULL CHECK(gravidade BETWEEN 1 AND 5),
    registrado_por TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS telemetria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    motorista_id INTEGER NOT NULL REFERENCES colaboradores(id),
    periodo_ref TEXT NOT NULL,
    qtd_excessos_velocidade INTEGER NOT NULL DEFAULT 0,
    qtd_frenagens_bruscas INTEGER NOT NULL DEFAULT 0,
    qtd_curvas_bruscas INTEGER NOT NULL DEFAULT 0,
    score_calculado REAL
  );

  CREATE TABLE IF NOT EXISTS encaminhamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id),
    tipo TEXT NOT NULL CHECK(tipo IN ('refazer_dto','feedback','encerramento_contrato')),
    lider_id INTEGER REFERENCES colaboradores(id),
    prazo TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','concluido')),
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
