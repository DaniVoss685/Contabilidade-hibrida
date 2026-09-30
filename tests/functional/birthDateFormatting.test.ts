import { readFileSync } from 'node:fs';
import { calculateAge, formatDate, formatDateBr, normalizeCivilDateString } from '../../src/lib/masks';
import { parseLegacyDateTime } from '../../src/lib/legacyImportMatching';
import { formatPatientsForExport } from '../../src/lib/exportUtils';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`❌ ${message}`);
  passed++;
  console.log(`✅ ${message}`);
}

assert(parseLegacyDateTime('06/10/1958 00:00:00').value === '1958-10-06', 'importa data brasileira com horário');
assert(parseLegacyDateTime('06/10/1958 00:00').value === '1958-10-06', 'importa data brasileira sem segundos');
assert(parseLegacyDateTime('6/10/1958 00:00:00').value === '1958-10-06', 'importa dia e mês de um dígito');
assert(parseLegacyDateTime('06/10/1958').value === '1958-10-06', 'importa data brasileira sem horário');
assert(parseLegacyDateTime('1958-10-06').value === '1958-10-06', 'importa ISO sem horário');
assert(parseLegacyDateTime('1958-10-06T00:00:00.000Z').value === '1958-10-06', 'importa ISO com T e timezone sem deslocar o dia civil');
assert(parseLegacyDateTime('1958-10-06 00:00:00').value === '1958-10-06', 'importa ISO com horário separado por espaço');
assert(parseLegacyDateTime('1958 00:00:00-10-06').value === '1958-10-06', 'reconhece o formato legado corrompido conhecido');
assert(parseLegacyDateTime('31/02/1958 00:00:00').value === null, 'não aceita dia civil inválido');
assert(parseLegacyDateTime('06/10/1800 00:00:00').reviewRequired, 'não corrige silenciosamente um ano implausível');
assert(formatDateBr('1958-10-06') === '06/10/1958', 'formata YYYY-MM-DD');
assert(formatDateBr('1958-10-06T00:00:00.000Z') === '06/10/1958', 'formata datetime com T sem exibir horário');
assert(formatDateBr('1958-10-06 00:00:00') === '06/10/1958', 'formata datetime separado por espaço');
assert(formatDateBr('06/10/1958 00:00:00') === '06/10/1958', 'formata data brasileira com horário');
assert(formatDateBr('1958 00:00:00-10-06') === '06/10/1958', 'formata corrupção histórica conhecida');
assert(formatDate('1958-10-06T00:00:00') === '06/10/1958', 'formatter canônico não mostra horas');
assert(normalizeCivilDateString('1958 00:00:00-10-06') === '1958-10-06', 'normaliza a corrupção histórica para data civil');
assert(normalizeCivilDateString('31/02/1958') === null, 'normalizador rejeita data inválida');
assert(calculateAge('1958 00:00:00-10-06') !== null, 'idade usa data civil normalizada');
assert(calculateAge('data inválida') === null, 'idade inválida não produz número artificial');

const importCode = readFileSync('src/lib/patientImportService.ts', 'utf8');
assert(importCode.includes('parseLegacyDateTime(rawVal).value'), 'importador simples usa parser de data canônico');
const pdfCode = readFileSync('src/lib/clinicalPdfService.ts', 'utf8');
assert(pdfCode.includes('calculateAge(patient.birthDate)') && pdfCode.includes('formatDate(patient.birthDate)'), 'PDF usa helpers canônicos para idade e exibição');
assert(!pdfCode.includes('new Date(patient.birthDate)'), 'PDF não analisa nascimento com new Date');
const pickerCode = readFileSync('src/components/UI/DatePicker.tsx', 'utf8');
assert(pickerCode.includes('formatDate(value)') && pickerCode.includes('normalizeCivilDateString(value)'), 'DatePicker usa formatter e normalizador canônicos');

const exportRow = formatPatientsForExport([{ id: 'p1', name: 'Paciente', birthDate: '1958-10-06T00:00:00' } as any])[1];
assert(exportRow[5] === '06/10/1958', 'CSV/XLSX exporta nascimento sem horário');
assert(formatDateBr(null) === '—', 'valor ausente mantém placeholder');
assert(formatDateBr('valor não reconhecido') === 'valor não reconhecido', 'formato desconhecido permanece visível sem ser inventado');

console.log(`\n${passed}/27 testes passaram em birthDateFormatting.test.ts`);
