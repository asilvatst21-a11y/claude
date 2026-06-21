import * as XLSX from "xlsx";
import type { GerenciaDreImportSummary, GerenciaDreLinhaParseada } from "./gerenciaDreTypes";

const NOME_ABA = "BASE GINFO";
const LINHA_HEADER_MES = 6; // linha "JANEIRO/2026 (30 DIAS UTEIS)" etc (0-based)
const PRIMEIRA_LINHA_DADOS = 8;

function parseNumeroBR(valor: unknown): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  const texto = String(valor).trim();
  if (!texto) return 0;
  const normalizado = texto.replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

function parseConta(celula: unknown): { codigo: string; nome: string } | null {
  if (!celula) return null;
  const texto = String(celula).trim();
  const m = texto.match(/^\s*(\d+)\s*\|\s*(.*)$/);
  if (!m) return null;
  return { codigo: m[1], nome: m[2].trim() || "(sem nome)" };
}

/**
 * Lê o arquivo .xlsx exportado mensalmente pelo GINFO e extrai a aba
 * "BASE GINFO" em formato normalizado (uma linha por conta x mês), pronta
 * para ser gravada em gerencia_dre_lancamentos.
 */
export function parseBaseGinfo(buffer: ArrayBuffer): GerenciaDreImportSummary {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames.includes(NOME_ABA) ? NOME_ABA : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Aba "${NOME_ABA}" não encontrada no arquivo.`);

  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const headerMes = data[LINHA_HEADER_MES] ?? [];

  // Cada bloco de mês ocupa 4 colunas (REMUNERADO/REALIZADO/DIFERENCA/AVR%),
  // começando na coluna 1. O bloco "TOTAL" no fim é ignorado.
  const blocos: { mes: string; ano: number; colInicio: number }[] = [];
  for (let col = 1; col < headerMes.length; col += 4) {
    const titulo = headerMes[col];
    if (!titulo) continue;
    const texto = String(titulo).trim();
    const m = texto.match(/^([A-ZÇÃÕÊ]+)\/(\d{4})/);
    if (!m) continue;
    blocos.push({ mes: m[1], ano: Number(m[2]), colInicio: col });
  }
  if (blocos.length === 0) {
    throw new Error("Não foi possível identificar os meses no cabeçalho da aba BASE GINFO.");
  }
  const ano = blocos[0].ano;

  const linhas: GerenciaDreLinhaParseada[] = [];
  let ordem = 0;
  for (let row = PRIMEIRA_LINHA_DADOS; row < data.length; row++) {
    const linha = data[row] ?? [];
    const conta = parseConta(linha[0]);
    if (!conta) continue;
    ordem++;
    for (const bloco of blocos) {
      const remunerado = parseNumeroBR(linha[bloco.colInicio]);
      const realizado = parseNumeroBR(linha[bloco.colInicio + 1]);
      const diferenca = parseNumeroBR(linha[bloco.colInicio + 2]);
      const avrCelula = linha[bloco.colInicio + 3];
      const avr_percentual = avrCelula === null || avrCelula === "" ? null : parseNumeroBR(avrCelula) / 100;
      linhas.push({
        conta_codigo: conta.codigo,
        conta_nome: conta.nome,
        ordem,
        mes: bloco.mes,
        remunerado,
        realizado,
        diferenca,
        avr_percentual,
      });
    }
  }

  return { ano, meses: blocos.map((b) => b.mes), linhas };
}
