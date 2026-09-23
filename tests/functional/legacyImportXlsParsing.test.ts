// Testa o parser dedicado da migração de sistema anterior (legacyImportParsers.ts)
// contra fixtures sintéticas .xls (BIFF8) e .xlsx geradas em memória com a
// própria biblioteca xlsx já usada no projeto — não depende de nenhum
// arquivo real nem do Supabase. Rodar com: npx tsx tests/functional/legacyImportXlsParsing.test.ts

import * as XLSX from 'xlsx';
import {
  parseLegacySpreadsheetFile,
  findMissingColumns,
  CLIENTES_REQUIRED_COLUMNS,
  PRONTUARIOS_REQUIRED_COLUMNS,
} from '../../src/lib/legacyImportParsers';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function makeFakeFile(rows: Record<string, any>[], bookType: 'xlsx' | 'biff8'): File {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType });
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return {
    name: bookType === 'xlsx' ? 'fixture.xlsx' : 'fixture.xls',
    arrayBuffer: async () => arrayBuffer,
  } as unknown as File;
}

async function runTests() {
  const clientesRows = [
    { identificador: 'uuid-1', id_cliente: '1', nome_completo: 'Fulano de Tal', cpf: '', data_nascimento: '01/01/1990 00:00:00' },
    { identificador: 'uuid-2', id_cliente: '2', nome_completo: 'Beltrano da Silva', cpf: '', data_nascimento: '02/02/1985 00:00:00' },
  ];

  // XLS-PARSE-01: .xlsx é lido corretamente (headers + linhas)
  {
    const file = makeFakeFile(clientesRows, 'xlsx');
    const table = await parseLegacySpreadsheetFile(file);
    assert(table.headers.includes('identificador'), 'XLS-PARSE-01a: cabeçalho "identificador" presente em .xlsx');
    assert(table.rows.length === 2, 'XLS-PARSE-01b: .xlsx com 2 linhas de dados lido corretamente');
    assert(String(table.rows[0].nome_completo) === 'Fulano de Tal', 'XLS-PARSE-01c: valor de célula .xlsx preservado');
  }

  // XLS-PARSE-02: .xls (BIFF8, formato real do sistema legado) é lido corretamente
  {
    const file = makeFakeFile(clientesRows, 'biff8');
    const table = await parseLegacySpreadsheetFile(file);
    assert(table.headers.includes('identificador'), 'XLS-PARSE-02a: cabeçalho "identificador" presente em .xls (BIFF8)');
    assert(table.rows.length === 2, 'XLS-PARSE-02b: .xls (BIFF8) com 2 linhas de dados lido corretamente');
    assert(String(table.rows[1].nome_completo) === 'Beltrano da Silva', 'XLS-PARSE-02c: valor de célula .xls (BIFF8) preservado');
  }

  // XLS-PARSE-03: arquivo vazio não quebra o parser
  {
    const file = makeFakeFile([], 'xlsx');
    const table = await parseLegacySpreadsheetFile(file);
    assert(table.headers.length === 0 && table.rows.length === 0, 'XLS-PARSE-03: arquivo sem linhas retorna tabela vazia sem lançar exceção');
  }

  // XLS-PARSE-04: findMissingColumns detecta arquivo trocado (Prontuarios enviado no lugar de Clientes)
  {
    const prontuarioLikeHeaders = ['identificador_prontuario', 'identificador_cliente', 'id_cliente', 'descricao', 'status'];
    const missing = findMissingColumns(prontuarioLikeHeaders, CLIENTES_REQUIRED_COLUMNS);
    assert(missing.includes('identificador') && missing.includes('nome_completo'), 'XLS-PARSE-04: arquivo de Prontuarios não passa na validação de colunas de Clientes');
  }

  // XLS-PARSE-05: arquivo de Prontuarios correto passa na validação de colunas
  {
    const headers = [...PRONTUARIOS_REQUIRED_COLUMNS, 'codigo_tuss', 'dente_regiao', 'face'];
    const missing = findMissingColumns(headers, PRONTUARIOS_REQUIRED_COLUMNS);
    assert(missing.length === 0, 'XLS-PARSE-05: arquivo de Prontuarios com todas as colunas obrigatórias passa na validação');
  }

  console.log('\n🎉 legacyImportXlsParsing: todos os critérios passaram.');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
