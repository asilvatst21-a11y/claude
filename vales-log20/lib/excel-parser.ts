import * as XLSX from "xlsx";
import { excelDateToJSDate, formatDateISO } from "./utils";
import type {
  ExcelRow,
  ValeParseado,
  ImportacaoSummary,
  StatusVale,
  AcaoTransportadora,
} from "./types";

/**
 * Safely gets a value from a row by index (0-based).
 */
function getCell(row: unknown[], index: number): unknown {
  return row[index] ?? null;
}

function getString(row: unknown[], index: number): string | null {
  const val = getCell(row, index);
  if (val === null || val === undefined || val === "") return null;
  return String(val).trim();
}

function getNumber(row: unknown[], index: number): number | null {
  const val = getCell(row, index);
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function getExcelDate(row: unknown[], index: number): string | null {
  const val = getCell(row, index);
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  if (isNaN(num) || num <= 0) return null;
  try {
    const date = excelDateToJSDate(num);
    return formatDateISO(date);
  } catch {
    return null;
  }
}

/**
 * Parses an Excel file buffer and returns structured data.
 * Column indices are 0-based from the spec (which uses 1-based col numbers).
 *
 * All indices are 0-based from sheet_to_json({header:1}):
 * idx 10: Cód. Ajudante 1
 * idx 11: Ajudante 1
 * idx 12: Cód. Ajudante 2
 * idx 13: Ajudante 2
 * idx 14: Mapa
 * idx 15: Data (Excel serial)
 * idx 18: Vale (numero)
 * idx 19: Emissão Vale (Excel serial)
 * idx 20: Item Tipo
 * idx 22: Item (product name)
 * idx 28: Qtde Diferença
 * idx 30: Valor
 * idx 38: Just. Ajudante
 * idx 39: Ação Transportadora
 * idx 67: Status Vale
 */
export function parseExcelBuffer(buffer: ArrayBuffer): ImportacaoSummary {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Get rows as arrays (no headers, raw values)
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const parsedRows: ExcelRow[] = [];

  // Skip header row(s) — look for the first row where idx 18 has a numeric vale number
  let dataStartIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    const valeNum = getNumber(row, 18);
    if (valeNum !== null && valeNum > 0) {
      dataStartIndex = i;
      break;
    }
    dataStartIndex = i + 1;
  }

  for (let i = dataStartIndex; i < rawRows.length; i++) {
    const row = rawRows[i];

    const numeroVale = getNumber(row, 18);
    if (!numeroVale || numeroVale <= 0) continue;

    const codigoAjudante1 = getNumber(row, 10);
    if (!codigoAjudante1) continue;

    const parsed: ExcelRow = {
      codigoAjudante1,
      nomeAjudante1: getString(row, 11) ?? `Ajudante ${codigoAjudante1}`,
      codigoAjudante2: getNumber(row, 12),
      nomeAjudante2: getString(row, 13),
      mapa: getNumber(row, 14),
      data: getExcelDate(row, 15),
      numeroVale,
      emissaoVale: getExcelDate(row, 19),
      itemTipo: getString(row, 20),
      item: getString(row, 22),
      unidade: getString(row, 23),
      qtdeDiferenca: getNumber(row, 28),
      qtdeDiferencaAvulsa: getNumber(row, 29),
      valor: getNumber(row, 30),
      justAjudante: getString(row, 38),
      acaoTransportadora: (getString(row, 39) as AcaoTransportadora) ?? null,
      justificativaTransportadora: getString(row, 45),
      statusVale: (getString(row, 67) as StatusVale) ?? null,
      acaoPrimeiroNivel: getString(row, 46),
      dataPrimeiroNivel: getExcelDate(row, 47),
      usuarioPrimeiroNivel: getString(row, 49),
      motivoPrimeiroNivel: getString(row, 50),
      justificativaPrimeiroNivel: getString(row, 52),
    };

    parsedRows.push(parsed);
  }

  return groupByVale(parsedRows);
}

/**
 * Groups parsed rows by vale number to produce the final summary.
 */
function groupByVale(rows: ExcelRow[]): ImportacaoSummary {
  const valesMap = new Map<number, ValeParseado>();

  for (const row of rows) {
    let vale = valesMap.get(row.numeroVale);

    if (!vale) {
      vale = {
        numeroVale: row.numeroVale,
        dataEmissao: row.emissaoVale,
        dataRota: row.data,
        mapa: row.mapa,
        statusVale: row.statusVale,
        acaoTransportadora: row.acaoTransportadora,
        justificativaTransportadora: row.justificativaTransportadora,
        acaoPrimeiroNivel: row.acaoPrimeiroNivel,
        dataPrimeiroNivel: row.dataPrimeiroNivel,
        usuarioPrimeiroNivel: row.usuarioPrimeiroNivel,
        motivoPrimeiroNivel: row.motivoPrimeiroNivel,
        justificativaPrimeiroNivel: row.justificativaPrimeiroNivel,
        valorTotal: 0,
        ajudantes: [],
        itens: [],
      };
      valesMap.set(row.numeroVale, vale);
    }

    // Update status/acao from latest row (they should be consistent per vale)
    if (row.statusVale) vale.statusVale = row.statusVale;
    if (row.acaoTransportadora) vale.acaoTransportadora = row.acaoTransportadora;
    // Update 1º Nível fields from first row that has a value
    if (row.acaoPrimeiroNivel && !vale.acaoPrimeiroNivel) vale.acaoPrimeiroNivel = row.acaoPrimeiroNivel;
    if (row.dataPrimeiroNivel && !vale.dataPrimeiroNivel) vale.dataPrimeiroNivel = row.dataPrimeiroNivel;
    if (row.usuarioPrimeiroNivel && !vale.usuarioPrimeiroNivel) vale.usuarioPrimeiroNivel = row.usuarioPrimeiroNivel;
    if (row.motivoPrimeiroNivel && !vale.motivoPrimeiroNivel) vale.motivoPrimeiroNivel = row.motivoPrimeiroNivel;
    if (row.justificativaPrimeiroNivel && !vale.justificativaPrimeiroNivel) vale.justificativaPrimeiroNivel = row.justificativaPrimeiroNivel;

    // Add ajudante 1 if not already present
    if (!vale.ajudantes.find((a) => a.codigo === row.codigoAjudante1)) {
      vale.ajudantes.push({
        codigo: row.codigoAjudante1,
        nome: row.nomeAjudante1,
        posicao: 1,
      });
    }

    // Add ajudante 2 if present and not already in list
    if (
      row.codigoAjudante2 &&
      row.nomeAjudante2 &&
      !vale.ajudantes.find((a) => a.codigo === row.codigoAjudante2)
    ) {
      vale.ajudantes.push({
        codigo: row.codigoAjudante2,
        nome: row.nomeAjudante2,
        posicao: 2,
      });
    }

    // Add item
    const itemValor = row.valor ?? 0;
    vale.valorTotal += itemValor;

    vale.itens.push({
      tipoItem: row.itemTipo,
      item: row.item,
      unidade: row.unidade,
      qtdeDiferenca: row.qtdeDiferenca,
      qtdeDiferencaAvulsa: row.qtdeDiferencaAvulsa,
      valor: row.valor,
      justificativaAjudante: row.justAjudante,
      acaoTransportadora: row.acaoTransportadora,
    });
  }

  const vales = Array.from(valesMap.values());

  // Count unique ajudantes
  const ajudantesSet = new Set<number>();
  for (const vale of vales) {
    for (const aj of vale.ajudantes) {
      ajudantesSet.add(aj.codigo);
    }
  }

  return {
    totalLinhas: rows.length,
    totalVales: vales.length,
    valesNovos: 0, // determined during DB upsert
    ajudantesEncontrados: ajudantesSet.size,
    ajudantesNotificados: 0, // determined after sending messages
    vales,
  };
}
