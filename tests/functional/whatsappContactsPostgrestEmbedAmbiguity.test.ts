/**
 * SUÍTE DE TESTES FUNCIONAIS: AMBIGUIDADE DE EMBED DO POSTGREST (df_wa_contacts <-> df_patients)
 *
 * CAUSA RAIZ REAL do bug "WhatsApp → Contatos aparece vazio mesmo com contatos existentes":
 * a migration do modelo de responsável (20260922190000_patient_guardians_and_shared_phone.sql)
 * criou df_wa_contact_patients (N:N entre df_wa_contacts e df_patients). A partir daí, o
 * PostgREST passou a enxergar DOIS caminhos possíveis para o embed `patient:df_patients(...)`
 * usado em DentalWhatsAppService.getContacts:
 *   1) FK direta df_wa_contacts.patient_id -> df_patients.id
 *   2) N:N via df_wa_contact_patients
 * Um embed ambíguo faz o PostgREST recusar a query INTEIRA com HTTP 300 (PGRST201) — não é
 * um erro de RLS nem de estado do frontend. getContacts() capturava esse erro e retornava
 * silenciosamente [], produzindo "Nenhum contato encontrado" mesmo com contatos reais no banco.
 * Confirmado via chamada REST direta contra produção (fbkouuvupdyffizwoiti) nesta sessão.
 *
 * Correção: todo embed de df_patients a partir de df_wa_contacts (direto ou aninhado via
 * contact:df_wa_contacts(...)) deve especificar a FK explicitamente:
 *   patient:df_patients!df_wa_contacts_patient_id_fkey(...)
 *
 * Este teste NÃO bate na rede — varre o código-fonte para garantir que nenhum embed
 * ambíguo (sem o hint de FK) volte a ser introduzido.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}`);
  }
}

const SOURCE_FILES = [
  'src/services/dentalWhatsAppService.ts',
  'src/components/WhatsApp/WhatsAppMainView.tsx',
];

// Casa qualquer embed "patient:df_patients(" que NÃO seja imediatamente seguido
// pelo hint de desambiguação "!df_wa_contacts_patient_id_fkey(" — ou seja, o padrão
// ambíguo que já causou o bug real.
const AMBIGUOUS_PATTERN = /patient:df_patients(?!!df_wa_contacts_patient_id_fkey)\(/g;

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES: AMBIGUIDADE DE EMBED POSTGREST (df_wa_contacts/df_patients)');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  const test = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      console.log(`  ✅ [PASSOU] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ [FALHOU] ${name}`);
      console.error(`     Motivo: ${err.message}\n`);
      failed++;
    }
  };

  for (const relPath of SOURCE_FILES) {
    await test(`${relPath}: nenhum embed ambíguo "patient:df_patients(" sem hint de FK`, () => {
      const fullPath = path.resolve(__dirname, '../../', relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const matches = content.match(AMBIGUOUS_PATTERN);
      assert(
        !matches || matches.length === 0,
        `Encontrado(s) ${matches?.length ?? 0} embed(s) ambíguo(s) em ${relPath}. ` +
          `Use "patient:df_patients!df_wa_contacts_patient_id_fkey(...)" para evitar o erro HTTP 300 (PGRST201) do PostgREST.`
      );
    });
  }

  await test('src/services/dentalWhatsAppService.ts: getContacts usa o embed desambiguado', () => {
    const fullPath = path.resolve(__dirname, '../../src/services/dentalWhatsAppService.ts');
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert(
      content.includes('patient:df_patients!df_wa_contacts_patient_id_fkey(id, name, cpf, phone, email)'),
      'getContacts deve embutir o paciente via FK explícita, não apenas "df_patients(...)"'
    );
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
