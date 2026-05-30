if (process.env.NODE_ENV === 'production') {
  console.error('Seed cannot run in production');
  process.exit(1);
}

const { faker } = require('@faker-js/faker');
const db = require('./db');
const { calculateScore, ensureAutoEncaminhamento } = require('./services/scoreService');

faker.seed(42);

db.exec(`
  DELETE FROM encaminhamentos;
  DELETE FROM telemetria;
  DELETE FROM avaliacoes_conduta;
  DELETE FROM dtos;
  DELETE FROM colaboradores;
  DELETE FROM sqlite_sequence WHERE name IN ('encaminhamentos','telemetria','avaliacoes_conduta','dtos','colaboradores');
`);

const setores = ['Logística', 'Operações', 'Administrativo', 'Manutenção', 'Comercial'];
const today = new Date();

function dateAgo(days) {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function dateFromNow(days) {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const insertCol = db.prepare(`
  INSERT INTO colaboradores (nome, cargo, setor, lider_responsavel, data_admissao, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertDto = db.prepare(`
  INSERT INTO dtos (colaborador_id, data_realizacao, data_validade, status, lider_id, observacoes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertAval = db.prepare(`
  INSERT INTO avaliacoes_conduta (colaborador_id, data, tipo, descricao, gravidade, registrado_por)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertTel = db.prepare(`
  INSERT INTO telemetria (motorista_id, periodo_ref, qtd_excessos_velocidade, qtd_frenagens_bruscas, qtd_curvas_bruscas, score_calculado)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function calcTelScore(excessos, frenagens, curvas) {
  const ep = Math.min(excessos * 3, 40);
  const bp = Math.min(frenagens * 2, 30);
  const cp = Math.min(curvas * 2, 30);
  let raw = Math.max(0, Math.min(100, 100 - ep - bp - cp));
  if (excessos > 10) raw = Math.min(raw, 30);
  return parseFloat((raw * 0.30).toFixed(2));
}

// 6 líderes
const colaboradores = [];
const lideres = [];
for (let i = 0; i < 6; i++) {
  const nome = faker.person.fullName();
  const setor = setores[i % setores.length];
  const info = insertCol.run(nome, 'Lider', setor, 'Diretor Geral', dateAgo(faker.number.int({ min: 365, max: 1825 })), 'ativo');
  lideres.push({ id: info.lastInsertRowid, nome, setor });
  colaboradores.push({ id: info.lastInsertRowid, nome, cargo: 'Lider', setor });
}

// 8 motoristas
const motoristas = [];
for (let i = 0; i < 8; i++) {
  const nome = faker.person.fullName();
  const lider = lideres[i % lideres.length];
  const info = insertCol.run(nome, 'Motorista', lider.setor, lider.nome, dateAgo(faker.number.int({ min: 180, max: 1095 })), 'ativo');
  motoristas.push({ id: info.lastInsertRowid, nome, setor: lider.setor });
  colaboradores.push({ id: info.lastInsertRowid, nome, cargo: 'Motorista', setor: lider.setor });
}

// 6 outros cargos
const outrosCargos = ['Auxiliar', 'Operador', 'Técnico', 'Assistente', 'Analista', 'Supervisor'];
const outros = [];
for (let i = 0; i < 6; i++) {
  const nome = faker.person.fullName();
  const lider = lideres[i % lideres.length];
  const info = insertCol.run(nome, outrosCargos[i], lider.setor, lider.nome, dateAgo(faker.number.int({ min: 90, max: 730 })), 'ativo');
  outros.push({ id: info.lastInsertRowid, nome, setor: lider.setor });
  colaboradores.push({ id: info.lastInsertRowid, nome, cargo: outrosCargos[i], setor: lider.setor });
}

console.log(`Created ${colaboradores.length} colaboradores`);

// DTOs
let dtoCriticalCount = 0;
for (const col of colaboradores) {
  let data_realizacao, data_validade, status;
  if (dtoCriticalCount < 5 && col.id <= 6) {
    const daysAgoValidade = faker.number.int({ min: 35, max: 90 });
    data_validade = dateAgo(daysAgoValidade);
    data_realizacao = dateAgo(daysAgoValidade + faker.number.int({ min: 30, max: 180 }));
    status = 'vencido';
    dtoCriticalCount++;
  } else {
    const roll = faker.number.int({ min: 1, max: 10 });
    if (roll <= 5) {
      data_realizacao = dateAgo(faker.number.int({ min: 5, max: 60 }));
      data_validade = dateFromNow(faker.number.int({ min: 15, max: 180 }));
      status = 'em_dia';
    } else if (roll <= 7) {
      const d = faker.number.int({ min: 5, max: 28 });
      data_validade = dateAgo(d);
      data_realizacao = dateAgo(d + faker.number.int({ min: 30, max: 90 }));
      status = 'vencido';
    } else if (roll <= 9) {
      data_realizacao = dateAgo(faker.number.int({ min: 60, max: 365 }));
      data_validade = dateAgo(faker.number.int({ min: 10, max: 30 }));
      status = 'ausente';
    } else {
      const d = faker.number.int({ min: 35, max: 90 });
      data_validade = dateAgo(d);
      data_realizacao = dateAgo(d + faker.number.int({ min: 30, max: 180 }));
      status = 'vencido';
    }
  }
  const lider = lideres[Math.floor(Math.random() * lideres.length)];
  insertDto.run(col.id, data_realizacao, data_validade, status, lider.id, faker.lorem.sentence());
}
console.log(`Created DTOs (${dtoCriticalCount} critical vencido>30d)`);

// Avaliacoes — random spread + guaranteed abordagens positivas
const descricoes = {
  ato_inseguro: ['Uso inadequado de EPI', 'Operação sem autorização', 'Excesso de velocidade em área restrita', 'Manejo incorreto de equipamento', 'Descumprimento de procedimento'],
  condicao_insegura: ['Piso molhado sem sinalização', 'Equipamento com manutenção pendente', 'Iluminação inadequada', 'Corredor bloqueado', 'Extintor vencido'],
  abordagem_positiva: ['Identificou risco proativamente', 'Ajudou colega em risco', 'Seguiu procedimentos exemplarmente', 'Participou de treinamento voluntário', 'Sugeriu melhoria no processo']
};

let positiveCount = 0;
for (const col of colaboradores) {
  const numAval = faker.number.int({ min: 2, max: 5 });
  for (let i = 0; i < numAval; i++) {
    let tipo;
    if (positiveCount < 4 && i === 0 && col.id <= 4) {
      tipo = 'abordagem_positiva';
      positiveCount++;
    } else {
      tipo = faker.helpers.arrayElement(['ato_inseguro', 'condicao_insegura', 'abordagem_positiva']);
    }
    const gravidade = faker.number.int({ min: 1, max: 5 });
    const lider = lideres[Math.floor(Math.random() * lideres.length)];
    insertAval.run(col.id, dateAgo(faker.number.int({ min: 0, max: 180 })), tipo,
      faker.helpers.arrayElement(descricoes[tipo]), gravidade, lider.nome);
  }
}
console.log(`Created avaliacoes (${positiveCount} abordagem_positiva guaranteed)`);

// Telemetria — 3 months per motorista + store score_calculado
let telCriticalCount = 0;
for (let m = 0; m < motoristas.length; m++) {
  const mot = motoristas[m];
  for (let month = 2; month >= 0; month--) {
    const d = new Date(today);
    d.setDate(1);
    d.setMonth(d.getMonth() - month);
    const periodo_ref = d.toISOString().split('T')[0].substring(0, 7);

    let excessos, frenagens, curvas;
    if (month === 0 && telCriticalCount < 2 && m < 2) {
      excessos = faker.number.int({ min: 12, max: 18 });
      frenagens = faker.number.int({ min: 8, max: 15 });
      curvas = faker.number.int({ min: 5, max: 12 });
      telCriticalCount++;
    } else {
      excessos = faker.number.int({ min: 0, max: 8 });
      frenagens = faker.number.int({ min: 0, max: 12 });
      curvas = faker.number.int({ min: 0, max: 8 });
    }
    insertTel.run(mot.id, periodo_ref, excessos, frenagens, curvas, calcTelScore(excessos, frenagens, curvas));
  }
}
console.log(`Created telemetria (${telCriticalCount} critical motoristas)`);

// 5 guaranteed low-score colaboradores for auto-encaminhamento demo
// Pattern: no DTO + multiple severe ato_inseguro → score < 50
const lider0 = lideres[0];
const lowScoreNames = [
  'Carlos Risco', 'Marcos Perigo', 'Ana Crítica', 'Pedro Baixo', 'Fernanda Alerta'
];
const lowScoreMotoristas = [];
for (let i = 0; i < lowScoreNames.length; i++) {
  const isMot = i < 3; // first 3 are motoristas (adds telemetria penalty)
  const cargo = isMot ? 'Motorista' : 'Operador';
  const info = insertCol.run(lowScoreNames[i], cargo, setores[i % setores.length], lider0.nome,
    dateAgo(faker.number.int({ min: 60, max: 365 })), 'ativo');
  const colId = info.lastInsertRowid;
  colaboradores.push({ id: colId, nome: lowScoreNames[i], cargo, setor: setores[i % setores.length] });

  // No valid DTO → ausente
  insertDto.run(colId, dateAgo(200), dateAgo(95), 'ausente', lider0.id, 'Ausente — não realizou DTO');

  // 4 severe ato_inseguro in last 90 days → raw_conduta = 100 - (4*4*5) = 100-80 = 20 → component = 8
  for (let j = 0; j < 4; j++) {
    insertAval.run(colId, dateAgo(faker.number.int({ min: 1, max: 85 })), 'ato_inseguro',
      faker.helpers.arrayElement(descricoes.ato_inseguro), 5, lider0.nome);
  }

  // Motoristas: add severe telemetria → score_calculado near 0
  if (isMot) {
    const d = new Date(today);
    d.setDate(1);
    const periodo_ref = d.toISOString().split('T')[0].substring(0, 7);
    insertTel.run(colId, periodo_ref, 15, 12, 10, calcTelScore(15, 12, 10));
    lowScoreMotoristas.push(colId);
  }
}
console.log(`Created ${lowScoreNames.length} low-score colaboradores for auto-encaminhamento demo`);

// Manual encaminhamentos
const insertEnc = db.prepare(`
  INSERT INTO encaminhamentos (colaborador_id, tipo, lider_id, prazo, status, criado_em)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
`);
const encTipos = ['refazer_dto', 'feedback', 'encerramento_contrato'];
for (let i = 0; i < Math.min(6, colaboradores.length); i++) {
  const col = colaboradores[i + 5];
  if (!col) continue;
  const tipo = encTipos[i % encTipos.length];
  const status = i % 3 === 0 ? 'concluido' : 'pendente';
  insertEnc.run(col.id, tipo, lider0.id, dateFromNow(faker.number.int({ min: 5, max: 45 })), status);
}

// Auto-encaminhamentos for all colaboradores with score < 50
console.log('Running score calculations and auto-creating encaminhamentos...');
let encCount = 0;
for (const col of colaboradores) {
  const { score } = calculateScore(col.id, db);
  if (ensureAutoEncaminhamento(col.id, score, db)) encCount++;
}
console.log(`Score calculation complete. ${encCount} auto-encaminhamentos criados (score < 50).`);
console.log('Seed completed successfully!');
