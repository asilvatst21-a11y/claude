import * as XLSX from "xlsx";

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function excelDateToISO(value: unknown): string | null {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    // Aceita "DD/MM/YYYY" e também "DD/MM/YYYY HH:MM[:SS]" (data+hora na mesma célula).
    const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const y = m[3].length === 2 ? `20${m[3]}` : m[3];
      // Se a > 12 → a é o dia (dd/mm). Se b > 12 → a é o mês (mm/dd).
      // Se ambos ≤ 12 (ambíguo), escolhe a interpretação cuja data é mais
      // próxima de hoje — dados de operação são sempre recentes.
      let day: string, month: string;
      if (a > 12) {
        day = m[1].padStart(2, "0"); month = m[2].padStart(2, "0"); // dd/mm
      } else if (b > 12) {
        month = m[1].padStart(2, "0"); day = m[2].padStart(2, "0"); // mm/dd
      } else {
        const ddmm = Date.parse(`${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
        const mmdd = Date.parse(`${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
        const now = Date.now();
        if (Math.abs(mmdd - now) < Math.abs(ddmm - now)) {
          month = m[1].padStart(2, "0"); day = m[2].padStart(2, "0"); // mm/dd
        } else {
          day = m[1].padStart(2, "0"); month = m[2].padStart(2, "0"); // dd/mm
        }
      }
      return `${y}-${month}-${day}`;
    }
  }
  const num = Number(value);
  if (!value || isNaN(num)) return null;
  const parsed = XLSX.SSF.parse_date_code(num);
  if (!parsed?.y) return null;
  return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

function excelTimeToHorario(value: unknown): string | null {
  if (value instanceof Date) {
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (m) {
      const h = Number(m[1]) % 24;
      return `${String(h).padStart(2, "0")}:${m[2]}`;
    }
  }
  const num = Number(value);
  if (value === null || value === undefined || value === "" || isNaN(num)) return null;
  const totalMinutes = Math.round((num % 1) * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// "Tempo Prev. (+almoço)" é uma DURAÇÃO (pode passar de 24h em teoria), não
// um horário do dia — por isso não reaproveita excelTimeToHorario (que faz
// %24). No export em CSV do 03.11.49.02 o valor chega como texto "HH:MM:SS"
// (ex.: "09:17:00"), não como fração numérica de dia — Number() nisso dá
// NaN e o tempo previsto silenciosamente virava null. Um export .xlsx real
// (não CSV) ainda pode trazer a fração numérica, daí o fallback numérico.
function parseDuracaoParaMinutos(value: unknown): number | null {
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      const s = m[3] ? Number(m[3]) : 0;
      return h * 60 + min + Math.round(s / 60);
    }
  }
  if (value instanceof Date) {
    return value.getUTCHours() * 60 + value.getUTCMinutes();
  }
  const num = Number(value);
  if (value === null || value === undefined || value === "" || isNaN(num)) return null;
  return Math.round(num * 24 * 60);
}

function readSheetRows(buffer: ArrayBuffer, preferredSheetName: string): unknown[][] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName =
    workbook.SheetNames.find((n) => normalize(n) === normalize(preferredSheetName)) ??
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
}

export interface EscalaTML {
  mapa: number;
  placa: string | null;
  matricula: number | null;
  dataEntrega: string | null;
  regiaoEntregas: string | null;
  cidadesEntregas: string | null;
  pesoCarregado: number | null;
  tempoPrevMin: number | null;
  horaSaidaPrev: string | null;
  entregasPrevistas: number | null;
  mpd: string | null;
}

/**
 * 03.11.49.02 — escala do dia: informa os motoristas/placas escalados por
 * mapa. Não traz a sala — a sala de cada motorista vem da planilha de
 * roster (nome/matrícula/sala), casada por matrícula. Também traz a
 * roteirização do dia ("Região +Entregas"/"Cidades +Entregas" por mapa),
 * usada para cruzar o território realmente executado com o território
 * disponibilizado na Frota.
 */
export function parseEscalaBuffer(buffer: ArrayBuffer): EscalaTML[] {
  const rows = readSheetRows(buffer, "03.11.49.02");

  let headerRow = -1;
  let mapaIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const idx = rows[i].findIndex((c) => normalize(c) === "nro do mapa");
    if (idx !== -1) {
      headerRow = i;
      mapaIdx = idx;
      break;
    }
  }
  if (headerRow === -1) return [];

  const header = rows[headerRow].map(normalize);
  const placaIdx = header.indexOf("placa");
  const motoristaIdx = header.indexOf("motorista");
  const dataEntregaIdx = header.indexOf("data entrega");
  const regiaoIdx = header.findIndex((c) => c.includes("regiao") && c.includes("entregas"));
  const cidadesIdx = header.findIndex((c) => c.includes("cidades") && c.includes("entregas"));
  // Peso carregado no mapa (kg) — usado pelo módulo de Excesso de Peso
  // (Segurança). Nome da coluna varia ("peso", "peso kg", "peso carregado"),
  // por isso a busca é por substring. Se a planilha não trouxer peso, o
  // módulo simplesmente não calcula excesso pra esses mapas.
  const pesoIdx = header.findIndex((c) => c.includes("peso"));
  // Colunas usadas pelo módulo Jornada e Tempo em Rota (Distribuição) — o
  // 03.11.49.02 já traz o tempo previsto, a hora de saída prevista (MPD) e o
  // total de entregas planejadas; até aqui elas eram ignoradas pelo parser.
  // "Tempo Prev. (+almoço)" é a coluna U (índice 20, contando de A=0) — busca
  // por texto primeiro, com a posição fixa como reforço caso o cabeçalho
  // venha com variação de formatação.
  let tempoPrevIdx = header.findIndex((c) => c.includes("tempo prev"));
  if (tempoPrevIdx === -1 && header[20]?.includes("tempo")) tempoPrevIdx = 20;
  const horaMpdIdx = header.indexOf("hora mpd");
  const entregasIdx = header.indexOf("entregas");
  // MPD (coluna Q, índice 16) — quando vem "PC Financeira", a rota já foi
  // finalizada/prestada contas; usado pra saber se o mapa bateu jornada de
  // forma definitiva, em vez de só estimar por % de conclusão.
  const mpdIdx = header.indexOf("mpd");

  const out: EscalaTML[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const mapa = Number(row[mapaIdx]);
    if (!mapa || isNaN(mapa)) continue;

    const matricula = motoristaIdx !== -1 ? Number(row[motoristaIdx]) : NaN;
    const peso = pesoIdx !== -1 ? Number(row[pesoIdx]) : NaN;
    const entregas = entregasIdx !== -1 ? Number(row[entregasIdx]) : NaN;

    out.push({
      mapa,
      placa: placaIdx !== -1 ? String(row[placaIdx] ?? "").trim() || null : null,
      matricula: !isNaN(matricula) ? matricula : null,
      dataEntrega: dataEntregaIdx !== -1 ? excelDateToISO(row[dataEntregaIdx]) : null,
      regiaoEntregas: regiaoIdx !== -1 ? String(row[regiaoIdx] ?? "").trim() || null : null,
      cidadesEntregas: cidadesIdx !== -1 ? String(row[cidadesIdx] ?? "").trim() || null : null,
      pesoCarregado: !isNaN(peso) ? peso : null,
      tempoPrevMin: tempoPrevIdx !== -1 ? parseDuracaoParaMinutos(row[tempoPrevIdx]) : null,
      horaSaidaPrev: horaMpdIdx !== -1 ? excelTimeToHorario(row[horaMpdIdx]) : null,
      entregasPrevistas: !isNaN(entregas) ? entregas : null,
      mpd: mpdIdx !== -1 ? String(row[mpdIdx] ?? "").trim() || null : null,
    });
  }
  return out;
}

/**
 * Planilha "Equipamentos" do Frota Legal — cadastro de peso por placa.
 * A placa vem na coluna "Identificador" (não "Placa": essa palavra também
 * aparece em "Município Placa", que é outra coisa). Traz duas colunas de
 * peso: "Tara" (peso vazio) e "Lotação" (peso máximo de carga — é essa
 * que vira a referência comparada com o peso carregado do 03.11.49.02).
 * O cabeçalho aparece repetido nas primeiras linhas do export; a busca por
 * conteúdo (não por número de linha fixo) resolve isso sozinha.
 */
export interface PesoPlacaImportado {
  placa: string;
  pesoTara: number | null;
  pesoLotacao: number | null;
}

export function parsePesoPlacaBuffer(buffer: ArrayBuffer): PesoPlacaImportado[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  let headerRow = -1;
  let placaIdx = -1;
  let taraIdx = -1;
  let lotacaoIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const header = rows[i].map(normalize);
    const pIdx = header.indexOf("identificador");
    if (pIdx === -1) continue;
    const tIdx = header.indexOf("tara");
    const lIdx = header.findIndex((c) => c.includes("lotacao"));
    if (tIdx === -1 && lIdx === -1) continue;
    headerRow = i;
    placaIdx = pIdx;
    taraIdx = tIdx;
    lotacaoIdx = lIdx;
    break;
  }
  if (headerRow === -1) return [];

  const out: PesoPlacaImportado[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const placa = String(row[placaIdx] ?? "").trim().toUpperCase();
    if (!placa) continue;
    const tara = taraIdx !== -1 ? Number(row[taraIdx]) : NaN;
    const lotacao = lotacaoIdx !== -1 ? Number(row[lotacaoIdx]) : NaN;
    if (isNaN(tara) && isNaN(lotacao)) continue;
    out.push({
      placa,
      pesoTara: !isNaN(tara) ? tara : null,
      pesoLotacao: !isNaN(lotacao) ? lotacao : null,
    });
  }
  return out;
}

/**
 * Export "ag-grid" do Freightech — não tem peso (é uma base de custos de
 * leasing/frota), mas serve como base inicial de placas: a lista de placas
 * que realmente pertencem à filial. Usada pra filtrar ruído do 03.11.49.02
 * (placas REC de recarga, placas de outra unidade) e pra apontar quando uma
 * placa do Freightech ainda não tem peso cadastrado no Frota Legal.
 */
export function parsePlacasFreightechBuffer(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  let headerRow = -1;
  let placaIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const idx = rows[i].findIndex((c) => normalize(c) === "placa");
    if (idx !== -1) {
      headerRow = i;
      placaIdx = idx;
      break;
    }
  }
  if (headerRow === -1) return [];

  const placas = new Set<string>();
  for (let i = headerRow + 1; i < rows.length; i++) {
    const placa = String(rows[i][placaIdx] ?? "").trim().toUpperCase();
    if (placa) placas.add(placa);
  }
  return [...placas];
}

export interface MotoristaSalaTML {
  matricula: number;
  nome: string;
  sala: string;
}

/**
 * Planilha de roster (nome/matrícula/sala): define a qual sala
 * (COLORADO ou SUB-FURIA) cada motorista pertence. Os nomes exatos das
 * colunas variam, por isso a busca do cabeçalho é feita por substring
 * normalizada.
 */
export function parseMotoristaSalaBuffer(buffer: ArrayBuffer): MotoristaSalaTML[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  let headerRow = -1;
  let matriculaIdx = -1;
  let nomeIdx = -1;
  let salaIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const header = rows[i].map(normalize);
    const mIdx = header.findIndex((c) => c.includes("matricula"));
    if (mIdx === -1) continue;
    const nIdx = header.findIndex((c) => c.includes("nome") || c.includes("motorista"));
    const sIdx = header.findIndex((c) => c.includes("sala"));
    if (sIdx === -1) continue;
    headerRow = i;
    matriculaIdx = mIdx;
    nomeIdx = nIdx;
    salaIdx = sIdx;
    break;
  }
  if (headerRow === -1) return [];

  const out: MotoristaSalaTML[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const matricula = Number(row[matriculaIdx]);
    if (!matricula || isNaN(matricula)) continue;
    const sala = String(row[salaIdx] ?? "").trim().toUpperCase();
    if (!sala) continue;

    out.push({
      matricula,
      nome: nomeIdx !== -1 ? String(row[nomeIdx] ?? "").trim() : "",
      sala,
    });
  }
  return out;
}

export interface ChecklistTML {
  mapa: number;
  placa: string | null;
  nome: string | null;
  sala: string | null;
  data: string | null;
  horarioInicio: string | null;
  horarioFinal: string | null;
}

function normalizaSala(value: unknown): string | null {
  const n = normalize(value);
  if (n.includes("colorado")) return "COLORADO";
  if (n.includes("furia")) return "SUB-FURIA";
  return null;
}

// Extrai só a parte de horário de um texto "23/06/2026 08:21" (data + hora).
function extraiHorario(value: unknown): string | null {
  const s = String(value ?? "").trim();
  const m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return excelTimeToHorario(value);
}

// Extrai a parte de data de um texto "23/06/2026 08:21" (data + hora).
function extraiData(value: unknown): string | null {
  const s = String(value ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return excelDateToISO(value);
}

/**
 * Planilha de checklist (TIPO/FILIAL/PLACA/MOTORISTA/EQUIPE/MAPA/...HR INICIO/HR FINAL...).
 * "HR INICIO" é o horário em que o motorista começou o checklist — usado pra
 * medir o tempo de deslocamento (HR INICIO − horário matinal da sala).
 */
export function parseChecklistBuffer(buffer: ArrayBuffer): ChecklistTML[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName =
    workbook.SheetNames.find((n) => normalize(n).includes("checklist")) ?? workbook.SheetNames[0];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  });

  let headerRow = -1;
  let mapaIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const idx = rows[i].findIndex((c) => normalize(c) === "mapa");
    if (idx !== -1) {
      headerRow = i;
      mapaIdx = idx;
      break;
    }
  }
  if (headerRow === -1) return [];

  const header = rows[headerRow].map(normalize);
  const placaIdx = header.indexOf("placa");
  const motoristaIdx = header.indexOf("motorista");
  const equipeIdx = header.indexOf("equipe");
  const dataIdx = header.indexOf("data");
  const hrInicioIdx = header.findIndex((c) => c.includes("hr inicio") || c.includes("hora inicio"));
  const hrFinalIdx = header.findIndex((c) => c.includes("hr final") || c.includes("hora final"));

  const out: ChecklistTML[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const mapa = Number(row[mapaIdx]);
    if (!mapa || isNaN(mapa)) continue;

    out.push({
      mapa,
      placa: placaIdx !== -1 ? String(row[placaIdx] ?? "").trim() || null : null,
      nome: motoristaIdx !== -1 ? String(row[motoristaIdx] ?? "").trim() || null : null,
      sala: equipeIdx !== -1 ? normalizaSala(row[equipeIdx]) : null,
      data: dataIdx !== -1 ? extraiData(row[dataIdx]) : null,
      horarioInicio: hrInicioIdx !== -1 ? extraiHorario(row[hrInicioIdx]) : null,
      horarioFinal: hrFinalIdx !== -1 ? extraiHorario(row[hrFinalIdx]) : null,
    });
  }
  return out;
}

export interface SaidaTML {
  mapa: number;
  placa: string | null;
  matricula: number | null;
  dataSaida: string | null;
  horarioSaida: string | null;
}

// Aceita qualquer variante de fase de saída da portaria:
// "Saida Cdd/Fab", "Saída CDD FAB", "Saida Portaria", "Saída Portaria" etc.
function isFaseSaida(value: unknown): boolean {
  const n = normalize(value);
  return n.includes("saida") && (n.includes("cdd") || n.includes("fab") || n.includes("portaria"));
}

// Posições fixas na planilha 03.11.20: Fase = coluna B, Placa = coluna D,
// Matrícula do motorista = coluna M. A linha de "Saida Cdd/Fab" é a última
// fase registrada para o TML e é usada para casar com o 03.11.49.02.
const COL_FASE = 1;
const COL_PLACA = 3;
const COL_MATRICULA = 12;

/**
 * 03.11.20 — movimento de portaria. Só nos interessam as linhas com
 * Fase = "Saida Cdd/Fab", que marcam o horário real de saída do veículo.
 */
export function parseSaidaBuffer(buffer: ArrayBuffer): SaidaTML[] {
  const rows = readSheetRows(buffer, "03.11.20");

  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (normalize(rows[i][COL_FASE]) === "fase") {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return [];

  const header = rows[headerRow].map(normalize);
  const mapaIdx = header.findIndex((c) => c.includes("mapa"));
  const dtOperIdx = header.findIndex(
    (c) => c.includes("dtoper") || c.includes("dt oper") || c.includes("data oper") || c.includes("data saida"),
  );
  const hrOperIdx = header.findIndex(
    (c) => c.includes("hroper") || c.includes("hr oper") || c.includes("hora oper") || c.includes("horario"),
  );

  if (mapaIdx === -1) return [];

  const out: SaidaTML[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const mapa = Number(row[mapaIdx]);
    if (!mapa || isNaN(mapa)) continue;
    if (!isFaseSaida(row[COL_FASE])) continue;

    const matricula = Number(row[COL_MATRICULA]);

    out.push({
      mapa,
      placa: String(row[COL_PLACA] ?? "").trim() || null,
      matricula: !isNaN(matricula) ? matricula : null,
      dataSaida: dtOperIdx !== -1 ? excelDateToISO(row[dtOperIdx]) : null,
      horarioSaida: hrOperIdx !== -1 ? excelTimeToHorario(row[hrOperIdx]) : null,
    });
  }
  return out;
}

export interface BeesMapaAgregado {
  mapa: number;
  data: string | null;
  placa: string | null;
  realizadas: number;
  devolucao: number;
  repasse: number;
  entregaForaRaio: number;
  devForaRaio: number;
  menos4min: number;
  not10s: number;
  tempoRealMedioMin: number | null;
  ultimaFinalizacao: string | null;
}

/**
 * BEES (Aderência AMBEV / Tracking) — export bruto, uma linha por PDV
 * visitado. Agrega por mapa (tour_display_id): realizadas/devolução/repasse
 * pelo status, fora do raio pelo within_radius, e os dois indicadores de
 * qualidade da entrega:
 *  - "< 4 min": finished_at - arrived_at menor que o parâmetro (padrão 4 min)
 *  - "< 10 s": arrived_at - driver_notification_time menor que 10 s
 * Usado pelo módulo Jornada e Tempo em Rota (Distribuição).
 */
export function parseBeesBuffer(buffer: ArrayBuffer): BeesMapaAgregado[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  if (rows.length === 0) return [];

  const header = rows[0].map(normalize);
  const mapaIdx = header.indexOf("tour_display_id");
  const dataIdx = header.indexOf("tour_date");
  const placaIdx = header.indexOf("truck_license_plate");
  const statusIdx = header.indexOf("status");
  const withinIdx = header.indexOf("within_radius");
  const notifIdx = header.indexOf("driver_notification_time");
  const arrivedIdx = header.indexOf("arrived_at");
  const finishedIdx = header.indexOf("finished_at");
  if (mapaIdx === -1 || statusIdx === -1) return [];

  interface Acc {
    data: string | null; placa: string | null;
    realizadas: number; devolucao: number; repasse: number;
    entregaForaRaio: number; devForaRaio: number; menos4min: number; not10s: number;
    somaTempoReal: number; nTempoReal: number; ultimoFinishedAt: number;
  }
  const porMapa = new Map<number, Acc>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const mapa = Number(row[mapaIdx]);
    if (!mapa || isNaN(mapa)) continue;

    const acc = porMapa.get(mapa) ?? {
      data: null, placa: null, realizadas: 0, devolucao: 0, repasse: 0,
      entregaForaRaio: 0, devForaRaio: 0, menos4min: 0, not10s: 0,
      somaTempoReal: 0, nTempoReal: 0, ultimoFinishedAt: NaN,
    };
    if (!acc.data && dataIdx !== -1) acc.data = String(row[dataIdx] ?? "").slice(0, 10) || null;
    if (!acc.placa && placaIdx !== -1) acc.placa = String(row[placaIdx] ?? "").trim().toUpperCase() || null;

    const status = String(row[statusIdx] ?? "").trim().toUpperCase();
    const dentroRaio = withinIdx !== -1 ? String(row[withinIdx] ?? "").trim().toLowerCase() === "true" : true;

    if (status === "CONCLUDED") {
      acc.realizadas++;
      if (!dentroRaio) acc.entregaForaRaio++;
    } else if (status === "DEFINITELY_RETURNED") {
      acc.devolucao++;
      if (!dentroRaio) acc.devForaRaio++;
    } else if (status === "RESCHEDULED") {
      acc.repasse++;
    }

    const arrivedAt = arrivedIdx !== -1 ? Date.parse(String(row[arrivedIdx] ?? "")) : NaN;
    const finishedAt = finishedIdx !== -1 ? Date.parse(String(row[finishedIdx] ?? "")) : NaN;
    const notifAt = notifIdx !== -1 ? Date.parse(String(row[notifIdx] ?? "")) : NaN;

    if (!isNaN(arrivedAt) && !isNaN(finishedAt)) {
      const minutos = (finishedAt - arrivedAt) / 60000;
      if (minutos >= 0) {
        acc.somaTempoReal += minutos;
        acc.nTempoReal++;
        if (minutos < 4) acc.menos4min++;
      }
    }
    if (!isNaN(arrivedAt) && !isNaN(notifAt)) {
      const segundos = (arrivedAt - notifAt) / 1000;
      if (segundos >= 0 && segundos < 10) acc.not10s++;
    }
    // Última entrega finalizada do mapa = hora real de encerramento da rota,
    // usada pra calcular o TR Real de mapas já finalizados (evita comparar
    // com "agora", que só faz sentido pra quem ainda está em rota).
    if (!isNaN(finishedAt) && (isNaN(acc.ultimoFinishedAt) || finishedAt > acc.ultimoFinishedAt)) {
      acc.ultimoFinishedAt = finishedAt;
    }

    porMapa.set(mapa, acc);
  }

  return [...porMapa.entries()].map(([mapa, acc]) => ({
    mapa,
    data: acc.data,
    placa: acc.placa,
    realizadas: acc.realizadas,
    devolucao: acc.devolucao,
    repasse: acc.repasse,
    entregaForaRaio: acc.entregaForaRaio,
    devForaRaio: acc.devForaRaio,
    menos4min: acc.menos4min,
    not10s: acc.not10s,
    tempoRealMedioMin: acc.nTempoReal > 0 ? acc.somaTempoReal / acc.nTempoReal : null,
    ultimaFinalizacao: !isNaN(acc.ultimoFinishedAt) ? new Date(acc.ultimoFinishedAt).toISOString() : null,
  }));
}

export interface RoteirizadorLinha {
  placa: string;
  tempoDirigindoMin: number | null;
}

/**
 * Roteirizador — export bruto, uma linha por rota/placa. Não traz o número
 * do mapa (só a placa); quem importa precisa casar a placa com a escala do
 * mesmo dia (escalas_tml) para descobrir o mapa — replica a mesma lógica
 * que a planilha original faz via VLOOKUP(Placa → PCD ORIGINAL → Mapa).
 * Só extraímos "Tempo Dirigindo (HH:MM:SS)" (fração de dia → minutos); o
 * resto (entregas planejadas, tempo médio por entrega) é derivado da
 * escala na hora do cálculo, não duplicado aqui.
 */
export function parseRoteirizadorBuffer(buffer: ArrayBuffer): RoteirizadorLinha[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  if (rows.length === 0) return [];

  const header = rows[0].map(normalize);
  const placaIdx = header.indexOf("placa");
  const tempoIdx = header.findIndex((c) => c.includes("tempo dirigindo"));
  if (placaIdx === -1) return [];

  const out: RoteirizadorLinha[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const placa = String(row[placaIdx] ?? "").trim().toUpperCase();
    if (!placa) continue;
    const tempo = tempoIdx !== -1 ? Number(row[tempoIdx]) : NaN;
    out.push({ placa, tempoDirigindoMin: !isNaN(tempo) ? Math.round(tempo * 24 * 60) : null });
  }
  return out;
}

// ── Relatório de Separação → Conferência Digital ──────────────────────────
// Uma linha por item separado. O campo "Palete" (ex.: "P02_M_02_1/42") já
// traz a porta e a ordem: M = porta motorista, A = porta ajudante,
// Z_ITEM_NAO_PALLETIZADO = itens avulsos. A conferência do ajudante agrupa
// esses itens por baia (palete).
export interface SeparacaoItem {
  mapa: number;
  data: string | null;      // ISO da Data de Entrega
  palete: string;           // cru, ex.: "P02_M_02_1/42"
  sequencia: number;
  codigo: string | null;
  descricao: string | null;
  tipo: string | null;      // Retornável | Descartável
  quantidade: number | null;
  unidade: string | null;
}

export function parseSeparacaoBuffer(buffer: ArrayBuffer): SeparacaoItem[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  if (rows.length === 0) return [];

  const header = rows[0].map(normalize);
  const mapaIdx = header.indexOf("mapa");
  const paleteIdx = header.indexOf("palete");
  const dataIdx = header.findIndex((c) => c.includes("data de entrega"));
  const codigoIdx = header.findIndex((c) => c.includes("codigo do item"));
  const descIdx = header.findIndex((c) => c.includes("descricao do item"));
  const tipoIdx = header.indexOf("tipo");
  const qtdIdx = header.indexOf("quantidade");
  const unidadeIdx = header.findIndex((c) => c.includes("unidade de medida"));
  if (mapaIdx === -1 || paleteIdx === -1) return [];

  // A coluna "Sequência" da planilha NÃO é única dentro da baia — itens em
  // "espera" que dividem a mesma caixa (ex.: CAIXA-01) repetem a mesma
  // sequência. Por isso a posição do item na baia é recontada aqui (1, 2,
  // 3…), na ordem em que aparece no arquivo, garantindo uma chave única por
  // (mapa, palete) mesmo quando o arquivo tem sequência duplicada.
  const contadorPorBaia = new Map<string, number>();

  const out: SeparacaoItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const mapa = Number(row[mapaIdx]);
    if (!mapa || isNaN(mapa)) continue;
    const palete = String(row[paleteIdx] ?? "").trim();
    if (!palete) continue;
    const qtd = qtdIdx !== -1 ? Number(row[qtdIdx]) : NaN;
    const chaveBaia = `${mapa}|${palete}`;
    const posicao = (contadorPorBaia.get(chaveBaia) ?? 0) + 1;
    contadorPorBaia.set(chaveBaia, posicao);
    out.push({
      mapa,
      data: dataIdx !== -1 ? excelDateToISO(row[dataIdx]) : null,
      palete,
      sequencia: posicao,
      codigo: codigoIdx !== -1 ? String(row[codigoIdx] ?? "").trim() || null : null,
      descricao: descIdx !== -1 ? String(row[descIdx] ?? "").trim() || null : null,
      tipo: tipoIdx !== -1 ? String(row[tipoIdx] ?? "").trim() || null : null,
      quantidade: !isNaN(qtd) ? qtd : null,
      unidade: unidadeIdx !== -1 ? String(row[unidadeIdx] ?? "").trim() || null : null,
    });
  }
  return out;
}
