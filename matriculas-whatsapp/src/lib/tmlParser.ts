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
  const num = Number(value);
  if (value === null || value === undefined || value === "" || isNaN(num)) return null;
  const totalMinutes = Math.round((num % 1) * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
}

/**
 * 03.11.49.02 — escala do dia: informa apenas os motoristas/placas
 * escalados por mapa. Não traz a sala — a sala de cada motorista vem da
 * planilha de roster (nome/matrícula/sala), casada por matrícula.
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

  const out: EscalaTML[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const mapa = Number(row[mapaIdx]);
    if (!mapa || isNaN(mapa)) continue;

    const matricula = motoristaIdx !== -1 ? Number(row[motoristaIdx]) : NaN;

    out.push({
      mapa,
      placa: placaIdx !== -1 ? String(row[placaIdx] ?? "").trim() || null : null,
      matricula: !isNaN(matricula) ? matricula : null,
      dataEntrega: dataEntregaIdx !== -1 ? excelDateToISO(row[dataEntregaIdx]) : null,
    });
  }
  return out;
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

export interface SaidaTML {
  mapa: number;
  placa: string | null;
  matricula: number | null;
  dataSaida: string | null;
  horarioSaida: string | null;
}

// Comparação tolerante: a fase de saída pode vir como "Saida Cdd/Fab",
// "Saida Cdd_Fab", "Saída CDD FAB" etc. Basta conter "saida" + "cdd"/"fab".
function isFaseSaida(value: unknown): boolean {
  const n = normalize(value);
  return n.includes("saida") && (n.includes("cdd") || n.includes("fab"));
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
  const mapaIdx = header.indexOf("mapa");
  const dtOperIdx = header.indexOf("dtoper");
  const hrOperIdx = header.indexOf("hroper");

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
