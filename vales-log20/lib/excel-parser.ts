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
 * Col 10 (idx 9):  Cód. Ajudante 1
 * Col 11 (idx 10): Ajudante 1
 * Col 12 (idx 11): Cód. Ajudante 2
 * Col 13 (idx 12): Ajudante 2
 * Col 14 (idx 13): Mapa
 * Col 15 (idx 14): Data (Excel serial)
 * Col 18 (idx 17): Vale (numero)
 * Col 19 (idx 18): Emissão Vale (Excel serial)
 * Col 20 (idx 19): Item Tipo
 * Col 22 (idx 21): Item (product name)
 * Col 28 (idx 27): Qtde Diferença
 * Col 30 (idx 29): Valor
 * Col 38 (idx 37): Just. Ajudante
 * Col 39 (idx 38): Ação Transportadora
 * Col 67 (idx 66): Status Vale
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

  // Skip header row(s) — look for the first row where col 17 (0-based) has a numeric vale number
  let dataStartIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    const valeNum = getNumber(row, 17);
    if (valeNum !== null && valeNum > 0) {
      dataStartIndex = i;
      break;
    }
    dataStartIndex = i + 1;
  }

  for (let i = dataStartIndex; i < rawRows.length; i++) {
    const row = rawRows[i];

    const numeroVale = getNumber(row, 17);
    if (!numeroVale || numeroVale <= 0) continue;

    const codigoAjudante1 = getNumber(row, 9);
    if (!codigoAjudante1) continue;

    const parsed: ExcelRow = {
      codigoAjudante1,
      nomeAjudante1: getString(row, 10) ?? `Ajudante ${codigoAjudante1}`,
      codigoAjudante2: getNumber(row, 11),
      nomeAjudante2: getString(row, 12),
      mapa: getNumber(row, 13),
      data: getExcelDate(row, 14),
      numeroVale,
      emissaoVale: getExcelDate(row, 18),
      itemTipo: getString(row, 19),
      item: getString(row, 21),
      qtdeDiferenca: getNumber(row, 27),
      valor: getNumber(row, 29),
      justAjudante: getString(row, 37),
      acaoTransportadora: (getString(row, 38) as AcaoTransportadora) ?? null,
      statusVale: (getString(row, 66) as StatusVale) ?? null,
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
        mapa: row.mapa,
        statusVale: row.statusVale,
        acaoTransportadora: row.acaoTransportadora,
        valorTotal: 0,
        ajudantes: [],
        itens: [],
      };
      valesMap.set(row.numeroVale, vale);
    }

    // Update status/acao from latest row (they should be consistent per vale)
    if (row.statusVale) vale.statusVale = row.statusVale;
    if (row.acaoTransportadora) vale.acaoTransportadora = row.acaoTransportadora;

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
      qtdeDiferenca: row.qtdeDiferenca,
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
