if (process.env.NODE_ENV === 'production') {
  console.error('Seed cannot run in production');
  process.exit(1);
}

const XLSX = require('xlsx');
const db = require('./db');
const { calculateScore, ensureAutoEncaminhamento } = require('./services/scoreService');

// Caminho das planilhas: use variável de ambiente PLANILHAS_PATH ou coloque os arquivos em server/data/planilhas/
const BASE = process.env.PLANILHAS_PATH
  ? process.env.PLANILHAS_PATH.replace(/\\/g, '/').replace(/\/?$/, '/')
  : require('path').join(__dirname, '../../data/planilhas') + require('path').sep;

// ── helpers ──────────────────────────────────────────────────────────────────
function excelDateToISO(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    // "29/05/2026 08:19" or "28/05/2026"
    const match = val.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return val.split('T')[0];
  }
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split('T')[0];
  }
  return null;
}

function normalizeNome(nome) {
  return (nome || '').toString().trim().replace(/\s+/g, ' ');
}

function mapFuncaoToCargo(funcao) {
  const f = (funcao || '').toUpperCase();
  if (f.includes('MOTORISTA')) return 'Motorista';
  if (f.includes('AJUDANTE') && f.includes('DISTRIBU')) return 'Ajudante';
  if (f.includes('SUPERVISOR')) return 'Supervisor';
  if (f.includes('GERENTE')) return 'Gerente';
  if (f.includes('ANALISTA')) return 'Analista';
  if (f.includes('ASSISTENTE') && f.includes('SEGURANÇA')) return 'Assistente SST';
  if (f.includes('ASSISTENTE')) return 'Assistente';
  if (f.includes('OPERADOR')) return 'Operador';
  if (f.includes('MANOBRISTA')) return 'Manobrista';
  if (f.includes('AJUDANTE')) return 'Ajudante Armazém';
  if (f.includes('MECÂNICO') || f.includes('MECANICO')) return 'Mecânico';
  if (f.includes('AUXILIAR')) return 'Auxiliar';
  if (f.includes('JOVEM')) return 'Jovem Aprendiz';
  return funcao || 'Colaborador';
}

function mapFuncaoToSetor(funcao) {
  const f = (funcao || '').toUpperCase();
  if (f.includes('DISTRIBU') || f.includes('MOTORISTA') || f.includes('MANOBRISTA')) return 'Distribuição';
  if (f.includes('ARMAZEM') || f.includes('EMPILHADEIRA') || f.includes('OPERADOR')) return 'Armazém';
  return 'Distribuição';
}

function mapClassificacao(classif) {
  const c = (classif || '').toUpperCase();
  if (c.includes('ABORDAGEM POSITIVA')) return 'abordagem_positiva';
  if (c.includes('ATO INSEGURO')) return 'ato_inseguro';
  if (c.includes('CONDIÇÃO INSEGURA') || c.includes('CONDICAO INSEGURA')) return 'condicao_insegura';
  if (c.includes('INCIDENTE')) return 'ato_inseguro'; // map to ato_inseguro with high gravity
  return 'ato_inseguro';
}

// ── Wipe existing data ────────────────────────────────────────────────────────
console.log('Limpando dados existentes...');
db.exec(`
  DELETE FROM encaminhamentos;
  DELETE FROM telemetria;
  DELETE FROM avaliacoes_conduta;
  DELETE FROM dtos;
  DELETE FROM colaboradores;
  DELETE FROM sqlite_sequence WHERE name IN ('encaminhamentos','telemetria','avaliacoes_conduta','dtos','colaboradores');
`);

// ── Load source data ──────────────────────────────────────────────────────────
const wbCol = XLSX.readFile(BASE + 'c5c28178-COLABORADORES01_06_2026_02_21_27.xlsx');
const colRows = XLSX.utils.sheet_to_json(wbCol.Sheets['COLABORADORES']);

const wbDto = XLSX.readFile(BASE + 'ca9df580-DTO.xlsx');
const dtoRows = XLSX.utils.sheet_to_json(wbDto.Sheets['DTO']);

const wbGsdpq = XLSX.readFile(BASE + '742130f9-GSDPQ.xlsx');
const gsdpqRows = XLSX.utils.sheet_to_json(wbGsdpq.Sheets['DTO']);

const wbRel = XLSX.readFile(BASE + '8bdcffb0-RELATOS.xlsx');
const relatoRows = XLSX.utils.sheet_to_json(wbRel.Sheets['RELATOS']);

const wbMot = XLSX.readFile(BASE + 'e12d9c52-PRONTUARIO_MOTORISTA.xls');
const motRaw = XLSX.utils.sheet_to_json(wbMot.Sheets['Sheet'], { header: 1 });

const wbAj = XLSX.readFile(BASE + 'f8f7f5d6-PRONTU_RIO_AJUDANTE.xls');
const ajRaw = XLSX.utils.sheet_to_json(wbAj.Sheets['Sheet'], { header: 1 });

// ── Parse prontuário motorista (data starts row 6, index 5) ──────────────────
// Cols: 0=status,1=nome,4=cpf,6=cargo,8=status_hab,13=pontuacao_ponderada,
//       56=excesso_vel1,57=excesso_vel2,61=frenagem_brusca
const prontuarioMotorista = {};
for (let i = 5; i < motRaw.length; i++) {
  const r = motRaw[i];
  if (!r || !r[1]) continue;
  const nome = normalizeNome(r[1]);
  // Valores cumulativos do prontuário — dividir por 3 para estimar mensal
  function parseNum(v) { return parseFloat((v || '0').toString().replace(',', '.')) || 0; }
  const excTotal = parseNum(r[56]) + parseNum(r[57]) * 2 + parseNum(r[58]) * 3; // pesos por severidade
  const frenTotal = parseNum(r[61]);
  const curvTotal = parseNum(r[62]);
  prontuarioMotorista[nome] = {
    pontuacao: parseNum(r[13]),
    excesso_vel: Math.round(excTotal / 3),   // estimativa mensal
    frenagem: Math.round(frenTotal / 3),
    curva: Math.round(curvTotal / 3),
    status_hab: r[8] || 'LIBERADO'
  };
}

const prontuarioAjudante = {};
for (let i = 5; i < ajRaw.length; i++) {
  const r = ajRaw[i];
  if (!r || !r[1]) continue;
  const nome = normalizeNome(r[1]);
  prontuarioAjudante[nome] = {
    pontuacao: parseFloat((r[12] || '0').toString().replace(',', '.')) || 0,
    status_hab: r[7] || 'LIBERADO'
  };
}

// ── Supervisores/líderes (para lider_responsavel) ────────────────────────────
const supervisores = colRows
  .filter(r => {
    const f = (r.FUNCAO || '').toUpperCase();
    return f.includes('SUPERVISOR') || f.includes('GERENTE');
  })
  .map(r => normalizeNome(r.COLABORADOR));

const liderPadrao = supervisores[0] || 'DEIVISON DE MELO PINTO RANGEL';

function getLider(funcao, equipe) {
  // Assign supervisors by equipe
  if (equipe === 'COLORADO') return 'RAFAEL MERCALDO RAPOZO';
  if (equipe === 'SUBFÚRIA') return 'DEIVISON DE MELO PINTO RANGEL';
  if (equipe === 'ARMAZEM PET') return 'EMERSON DE SOUZA VALENTIM';
  return liderPadrao;
}

// ── Insert colaboradores ──────────────────────────────────────────────────────
const insertCol = db.prepare(`
  INSERT INTO colaboradores (nome, cargo, setor, lider_responsavel, data_admissao, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const matrToId = {}; // matricula -> db id
const nomeToId = {}; // nome normalizado -> db id

let countCol = 0;
for (const r of colRows) {
  if (!r.COLABORADOR) continue;
  const nome = normalizeNome(r.COLABORADOR);
  const cargo = mapFuncaoToCargo(r.FUNCAO);
  const setor = r.EQUIPE === 'ARMAZEM PET' ? 'Armazém' : mapFuncaoToSetor(r.FUNCAO);
  const lider = getLider(r.FUNCAO, r.EQUIPE);
  const admissao = excelDateToISO(r.ADMISSAO) || '2024-01-01';
  const status = (r.STATUS || '').toUpperCase().includes('TRABALHANDO') ? 'ativo' : 'inativo';

  const info = insertCol.run(nome, cargo, setor, lider, admissao, status);
  const id = info.lastInsertRowid;
  nomeToId[nome] = id;
  if (r.MATR) matrToId[String(r.MATR).trim()] = id;
  countCol++;
}
console.log(`Inseridos ${countCol} colaboradores`);

// ── Insert DTOs (GSDPQ + DTO planilhas) ───────────────────────────────────────
const insertDto = db.prepare(`
  INSERT INTO dtos (colaborador_id, data_realizacao, data_validade, status, lider_id, observacoes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Combinar as duas fontes de DTO
const allDtoRows = [...dtoRows, ...gsdpqRows];

// Lider padrão ID (primeiro supervisor encontrado)
const liderDefaultId = matrToId['220081'] || matrToId['220050'] || 1;

let countDto = 0;
const colaboradoresComDto = new Set();

for (const r of allDtoRows) {
  const nomeColaborador = normalizeNome(r['COLABORADOR/FRETEIRO/PX']);
  if (!nomeColaborador) continue;

  const colId = nomeToId[nomeColaborador];
  if (!colId) continue;

  const dataReal = excelDateToISO(r.DATA);
  if (!dataReal) continue;

  // Validade = 90 dias após realização
  const validadeDate = new Date(dataReal);
  validadeDate.setDate(validadeDate.getDate() + 90);
  const validade = validadeDate.toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const status = validade >= today ? 'em_dia' : 'vencido';

  // Líder que realizou
  const matrRelizador = String(r.MATRICULA || '').trim();
  const liderId = matrToId[matrRelizador] || liderDefaultId;

  const obs = (r['OBSERVAÇÕES'] || r['OBSERVACOES'] || '').toString().substring(0, 500);

  insertDto.run(colId, dataReal, validade, status, liderId, obs);
  colaboradoresComDto.add(colId);
  countDto++;
}
console.log(`Inseridos ${countDto} DTOs para ${colaboradoresComDto.size} colaboradores únicos`);

// ── Insert Avaliações de Conduta (RELATOS) ────────────────────────────────────
const insertAval = db.prepare(`
  INSERT INTO avaliacoes_conduta (colaborador_id, data, tipo, descricao, gravidade, registrado_por)
  VALUES (?, ?, ?, ?, ?, ?)
`);

let countAval = 0;
for (const r of relatoRows) {
  const nomePessoa = normalizeNome(r['PESSOA RELATADA']);
  if (!nomePessoa) continue;

  // Tentar por matrícula primeiro, depois por nome parcial
  let colId = null;
  const matr = String(r.MATRICULA || '').trim();

  // Busca o colaborador pelo nome relatado (nome da pessoa que foi observada)
  colId = nomeToId[nomePessoa];

  // Busca parcial se não achou exato
  if (!colId) {
    const nomeUpper = nomePessoa.toUpperCase();
    for (const [nome, id] of Object.entries(nomeToId)) {
      if (nome.toUpperCase().includes(nomeUpper.split(' ')[0]) &&
          nome.toUpperCase().includes(nomeUpper.split(' ').slice(-1)[0])) {
        colId = id;
        break;
      }
    }
  }

  if (!colId) continue;

  const dataAval = excelDateToISO(r['DATA OCORRÊNCIA']) || excelDateToISO(r['DATA CADASTRO']);
  if (!dataAval) continue;

  const tipo = mapClassificacao(r['CLASSIFICAÇÃO']);
  const descricao = (r['TIPO DO RELATO'] || r['DETALHAMENTO'] || '').toString().substring(0, 300);
  const relator = normalizeNome(r.RELATOR);

  // Gravidade baseada na classificação
  let gravidade = 2;
  const classif = (r['CLASSIFICAÇÃO'] || '').toUpperCase();
  if (classif.includes('INCIDENTE')) gravidade = 5;
  else if (classif.includes('ATO INSEGURO')) gravidade = 3;
  else if (classif.includes('CONDIÇÃO INSEGURA')) gravidade = 2;
  else if (classif.includes('ABORDAGEM POSITIVA')) gravidade = 3;

  insertAval.run(colId, dataAval, tipo, descricao, gravidade, relator);
  countAval++;
}
console.log(`Inseridas ${countAval} avaliações de conduta`);

// ── Insert Telemetria (prontuário motorista) ──────────────────────────────────
const insertTel = db.prepare(`
  INSERT INTO telemetria (motorista_id, periodo_ref, qtd_excessos_velocidade, qtd_frenagens_bruscas, qtd_curvas_bruscas, score_calculado)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function calcScore(exc, fren, curv) {
  const ep = Math.min(exc * 3, 40);
  const bp = Math.min(fren * 2, 30);
  const cp = Math.min(curv * 2, 30);
  let raw = Math.max(0, Math.min(100, 100 - ep - bp - cp));
  if (exc > 10) raw = Math.min(raw, 30);
  return parseFloat((raw * 0.30).toFixed(2));
}

// Período atual
const today = new Date();
const periodoAtual = today.toISOString().substring(0, 7);

let countTel = 0;
for (const [nomeNorm, pron] of Object.entries(prontuarioMotorista)) {
  const colId = nomeToId[nomeNorm];
  if (!colId) continue;

  const exc = pron.excesso_vel;
  const fren = pron.frenagem;
  const curv = pron.curva;

  insertTel.run(colId, periodoAtual, exc, fren, curv, calcScore(exc, fren, curv));
  countTel++;
}
console.log(`Inseridos ${countTel} registros de telemetria`);

// ── Auto-encaminhamentos ──────────────────────────────────────────────────────
console.log('Calculando scores e criando encaminhamentos automáticos...');
const todosAtivos = db.prepare("SELECT id FROM colaboradores WHERE status='ativo'").all();
let encCount = 0;
for (const col of todosAtivos) {
  const { score } = calculateScore(col.id, db);
  if (ensureAutoEncaminhamento(col.id, score, db)) encCount++;
}

console.log(`${encCount} auto-encaminhamentos criados (score < 50)`);
console.log('Seed com dados reais concluído!');
