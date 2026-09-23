import * as XLSX from 'xlsx';

export type LegacyCellValue = string | number | Date | null | undefined;

export interface LegacyRawTable {
  headers: string[];
  rows: Record<string, LegacyCellValue>[];
}

/**
 * Parser dedicado para os arquivos de migração de sistema anterior
 * (Clientes.xls / Prontuarios.xls). Diferente de parseSpreadsheetFile
 * (src/lib/patientImportService.ts, usado pelo importador simples existente,
 * que já stringifica toda célula com String(...).trim()), este parser
 * preserva o tipo bruto de cada célula (string | number | Date) para que
 * datas sejam formatadas corretamente por parseLegacyDateTime — nos arquivos
 * reais analisados as datas vêm como texto "DD/MM/AAAA HH:mm:ss" (não como
 * células de data nativas do Excel), mas o parser trata os dois casos.
 *
 * Reaproveita a mesma biblioteca (SheetJS/xlsx, já dependência do projeto)
 * usada pelo importador simples — lê .xls (BIFF8) e .xlsx da mesma forma,
 * inteiramente no browser, sem enviar o arquivo bruto a nenhum serviço
 * externo. Não modifica parseSpreadsheetFile nem o fluxo de importação
 * simples existente.
 */
export async function parseLegacySpreadsheetFile(file: File): Promise<LegacyRawTable> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };

  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, LegacyCellValue>>(worksheet, { defval: '' });
  if (jsonData.length === 0) return { headers: [], rows: [] };

  return { headers: Object.keys(jsonData[0]), rows: jsonData };
}

// Colunas mínimas para reconhecer o arquivo certo antes de processar —
// evita mapear um arquivo trocado (ex.: usuário sobe Prontuarios.xls no passo
// de Clientes) com uma mensagem confusa lá na frente.
export const CLIENTES_REQUIRED_COLUMNS = ['identificador', 'id_cliente', 'nome_completo'] as const;
export const PRONTUARIOS_REQUIRED_COLUMNS = [
  'identificador_prontuario',
  'identificador_cliente',
  'id_cliente',
  'descricao',
  'status',
] as const;

export function findMissingColumns(headers: string[], required: readonly string[]): string[] {
  const headerSet = new Set(headers);
  return required.filter((col) => !headerSet.has(col));
}

export function cellToString(v: LegacyCellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}
