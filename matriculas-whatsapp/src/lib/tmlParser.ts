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
      regiaoEntregas: regiaoIdx !== -1 ? String(row[regiaoIdx] ?? "").trim() || null : null,
      cidadesEntregas: cidadesIdx !== -1 ? String(row[cidadesIdx] ?? "").trim() || null : null,
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
