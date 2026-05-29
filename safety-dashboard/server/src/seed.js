if (process.env.NODE_ENV === 'production') {
  console.error('Seed cannot run in production');
  process.exit(1);
}

const { faker } = require('@faker-js/faker');
const db = require('./db');
const { calculateScore } = require('./services/scoreService');

faker.seed(42);

// Clear existing data
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

// Create 20 colaboradores: 6 líderes, 8 motoristas, 6 outros
const colaboradores = [];

const insertCol = db.prepare(`
  INSERT INTO colaboradores (nome, cargo, setor, lider_responsavel, data_admissao, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// 6 líderes
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
  const setor = lider.setor;
  const info = insertCol.run(nome, 'Motorista', setor, lider.nome, dateAgo(faker.number.int({ min: 180, max: 1095 })), 'ativo');
  motoristas.push({ id: info.lastInsertRowid, nome, setor, lider_nome: lider.nome });
  colaboradores.push({ id: info.lastInsertRowid, nome, cargo: 'Motorista', setor });
}

// 6 outros cargos
const outrosCargos = ['Auxiliar', 'Operador', 'Técnico', 'Assistente', 'Analista', 'Supervisor'];
for (let i = 0; i < 6; i++) {
  const nome = faker.person.fullName();
  const lider = lideres[i % lideres.length];
  const setor = lider.setor;
  const cargo = outrosCargos[i];
  const info = insertCol.run(nome, cargo, setor, lider.nome, dateAgo(faker.number.int({ min: 90, max: 730 })), 'ativo');
  colaboradores.push({ id: info.lastInsertRowid, nome, cargo, setor });
}

console.log(`Created ${colaboradores.length} colaboradores`);

// DTOs - 1-2 per colaborador
const insertDto = db.prepare(`
  INSERT INTO dtos (colaborador_id, data_realizacao, data_validade, status, lider_id, observacoes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let dtoCriticalCount = 0;
let dtoEmDiaCount = 0;

for (const col of colaboradores) {
  const numDtos = faker.number.int({ min: 1, max: 2 });
  for (let i = 0; i < numDtos; i++) {
    let data_realizacao, data_validade, status;

    // Ensure variety: at least 3 critical (vencido > 30 days), some em_dia, some ausente
    let forceType = null;
    if (dtoCriticalCount < 3 && col.id <= 5) {
      forceType = 'critical';
    } else if (dtoEmDiaCount < 8 && col.id > 5 && col.id <= 14) {
      forceType = 'em_dia';
    }

    if (forceType === 'critical') {
      // vencido > 30 days ago
      const daysAgoValidade = faker.number.int({ min: 35, max: 90 });
      data_validade = dateAgo(daysAgoValidade);
      data_realizacao = dateAgo(daysAgoValidade + faker.number.int({ min: 30, max: 180 }));
      status = 'vencido';
      dtoCriticalCount++;
    } else if (forceType === 'em_dia') {
      data_realizacao = dateAgo(faker.number.int({ min: 10, max: 60 }));
      data_validade = dateFromNow(faker.number.int({ min: 30, max: 180 }));
      status = 'em_dia';
      dtoEmDiaCount++;
    } else {
      const roll = faker.number.int({ min: 1, max: 10 });
      if (roll <= 4) {
        // em_dia
        data_realizacao = dateAgo(faker.number.int({ min: 5, max: 60 }));
        data_validade = dateFromNow(faker.number.int({ min: 15, max: 180 }));
        status = 'em_dia';
      } else if (roll <= 7) {
        // vencido recently (within 30 days)
        const daysAgo = faker.number.int({ min: 5, max: 28 });
        data_validade = dateAgo(daysAgo);
        data_realizacao = dateAgo(daysAgo + faker.number.int({ min: 30, max: 90 }));
        status = 'vencido';
      } else if (roll <= 9) {
        // ausente
        data_realizacao = dateAgo(faker.number.int({ min: 60, max: 365 }));
        data_validade = dateAgo(faker.number.int({ min: 10, max: 30 }));
        status = 'ausente';
      } else {
        // vencido > 30 days
        const daysAgoValidade = faker.number.int({ min: 35, max: 90 });
        data_validade = dateAgo(daysAgoValidade);
        data_realizacao = dateAgo(daysAgoValidade + faker.number.int({ min: 30, max: 180 }));
        status = 'vencido';
      }
    }

    const lider = lideres[Math.floor(Math.random() * lideres.length)];
    insertDto.run(col.id, data_realizacao, data_validade, status, lider.id, faker.lorem.sentence());
  }
}

console.log(`Created DTOs (${dtoCriticalCount} critical)`);

// Avaliacoes - 2-5 per colaborador over past 180 days
const insertAval = db.prepare(`
  INSERT INTO avaliacoes_conduta (colaborador_id, data, tipo, descricao, gravidade, registrado_por)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const tiposAval = ['ato_inseguro', 'condicao_insegura', 'abordagem_positiva'];
let positiveCount = 0;

for (const col of colaboradores) {
  const numAval = faker.number.int({ min: 2, max: 5 });
  for (let i = 0; i < numAval; i++) {
    const daysAgo = faker.number.int({ min: 0, max: 180 });
    const data = dateAgo(daysAgo);

    let tipo;
    if (positiveCount < 4 && i === 0 && col.id <= 4) {
      tipo = 'abordagem_positiva';
      positiveCount++;
    } else {
      tipo = faker.helpers.arrayElement(tiposAval);
    }

    const gravidade = faker.number.int({ min: 1, max: 5 });
    const lider = lideres[Math.floor(Math.random() * lideres.length)];

    let descricao;
    if (tipo === 'ato_inseguro') {
      descricao = faker.helpers.arrayElement([
        'Uso inadequado de EPI',
        'Operação sem autorização',
        'Excesso de velocidade em área restrita',
        'Manejo incorreto de equipamento',
        'Descumprimento de procedimento de segurança'
      ]);
    } else if (tipo === 'condicao_insegura') {
      descricao = faker.helpers.arrayElement([
        'Piso molhado sem sinalização',
        'Equipamento com manutenção pendente',
        'Iluminação inadequada',
        'Corredor bloqueado com materiais',
        'Extintor com validade vencida'
      ]);
    } else {
      descricao = faker.helpers.arrayElement([
        'Colaborador identificou risco e reportou proativamente',
        'Ajudou colega em situação de risco',
        'Seguiu todos os procedimentos exemplarmente',
        'Participou de treinamento voluntário',
        'Sugeriu melhoria no processo de segurança'
      ]);
    }

    insertAval.run(col.id, data, tipo, descricao, gravidade, lider.nome);
  }
}

console.log(`Created avaliacoes (${positiveCount} abordagem_positiva guaranteed)`);

// Telemetria - 3 months for all 8 motoristas
const insertTel = db.prepare(`
  INSERT INTO telemetria (motorista_id, periodo_ref, qtd_excessos_velocidade, qtd_frenagens_bruscas, qtd_curvas_bruscas, score_calculado)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let telCriticalCount = 0;

for (let m = 0; m < motoristas.length; m++) {
  const mot = motoristas[m];
  for (let month = 2; month >= 0; month--) {
    const d = new Date(today);
    d.setDate(1);
    d.setMonth(d.getMonth() - month);
    const periodo_ref = d.toISOString().split('T')[0].substring(0, 7); // YYYY-MM

    let qtd_excessos, qtd_frenagens, qtd_curvas;

    // Force at least 2 motoristas with critical excessos in latest month
    if (month === 0 && telCriticalCount < 2 && m < 2) {
      qtd_excessos = faker.number.int({ min: 11, max: 18 });
      qtd_frenagens = faker.number.int({ min: 5, max: 15 });
      qtd_curvas = faker.number.int({ min: 3, max: 10 });
      telCriticalCount++;
    } else {
      qtd_excessos = faker.number.int({ min: 0, max: 8 });
      qtd_frenagens = faker.number.int({ min: 0, max: 12 });
      qtd_curvas = faker.number.int({ min: 0, max: 8 });
    }

    insertTel.run(mot.id, periodo_ref, qtd_excessos, qtd_frenagens, qtd_curvas, null);
  }
}

console.log(`Created telemetria (${telCriticalCount} critical motoristas)`);

// Run score calculation for all colaboradores to auto-create encaminhamentos
console.log('Running score calculations and auto-creating encaminhamentos...');
let encCount = 0;
for (const col of colaboradores) {
  const result = calculateScore(col.id, db);
  if (result.score < 50) encCount++;
}

console.log(`Score calculation complete. ${encCount} colaboradores with score < 50 got auto-encaminhamentos.`);
console.log('Seed completed successfully!');
