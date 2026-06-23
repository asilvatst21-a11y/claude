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
  sala: string;
  placa: string | null;
  matricula: number | null;
  dataEntrega: string | null;
}

/**
 * 03.11.49.02 — escala do dia: define qual motorista/placa está
 * escalado para cada sala. A coluna de sala não tem cabeçalho próprio
 * (vem logo após "Nro do Mapa"), por isso é localizada por posição.
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
  const salaIdx = mapaIdx + 1;
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
      sala: String(row[salaIdx] ?? "").trim().toUpperCase(),
      placa: placaIdx !== -1 ? String(row[placaIdx] ?? "").trim() || null : null,
      matricula: !isNaN(matricula) ? matricula : null,
      dataEntrega: dataEntregaIdx !== -1 ? excelDateToISO(row[dataEntregaIdx]) : null,
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

const FASE_SAIDA_PORTARIA = "saida cdd/fab";

/**
 * 03.11.20 — movimento de portaria. Só nos interessam as linhas com
 * Fase = "Saida Cdd/Fab", que marcam o horário real de saída do veículo.
 */
export function parseSaidaBuffer(buffer: ArrayBuffer): SaidaTML[] {
  const rows = readSheetRows(buffer, "03.11.20");

  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if (rows[i].some((c) => normalize(c) === "fase")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return [];

  const header = rows[headerRow].map(normalize);
  const mapaIdx = header.indexOf("mapa");
  const faseIdx = header.indexOf("fase");
  const placaIdx = header.indexOf("placa");
  const dtOperIdx = header.indexOf("dtoper");
  const hrOperIdx = header.indexOf("hroper");
  const motoristaIdx = header.indexOf("motorista");

  if (mapaIdx === -1 || faseIdx === -1) return [];

  const out: SaidaTML[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    const mapa = Number(row[mapaIdx]);
    if (!mapa || isNaN(mapa)) continue;
    if (normalize(row[faseIdx]) !== FASE_SAIDA_PORTARIA) continue;

    const matricula = motoristaIdx !== -1 ? Number(row[motoristaIdx]) : NaN;

    out.push({
      mapa,
      placa: placaIdx !== -1 ? String(row[placaIdx] ?? "").trim() || null : null,
      matricula: !isNaN(matricula) ? matricula : null,
      dataSaida: dtOperIdx !== -1 ? excelDateToISO(row[dtOperIdx]) : null,
      horarioSaida: hrOperIdx !== -1 ? excelTimeToHorario(row[hrOperIdx]) : null,
    });
  }
  return out;
}
