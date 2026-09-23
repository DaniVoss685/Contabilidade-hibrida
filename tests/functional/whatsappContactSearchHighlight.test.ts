/**
 * SUÍTE DE TESTES FUNCIONAIS: DESTAQUE DE MATCH POR PACIENTE RELACIONADO (A32, rodada 3)
 *
 * Pedido do usuário: buscar "Sebastião" encontra "Marilda Ricardo Arantes" (correto —
 * Sebastião é dependente dela), mas não ficava claro POR QUE ela apareceu. Precisa
 * destacar explicitamente que o match veio de um paciente relacionado, não do nome
 * do próprio contato.
 */

import { getContactSearchMatch } from '../../src/lib/contactsFilter';
import { WhatsAppContact, WhatsAppContactRelations } from '../../src/types/whatsapp';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}. Esperado: "${expected}", Obtido: "${actual}"`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES: DESTAQUE DE MATCH POR PACIENTE RELACIONADO');
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

  const contatoMarilda: WhatsAppContact = {
    id: 'ctc_marilda',
    tenant_id: 'clinic_teste',
    patient_id: 'pat_sebastiao',
    name: 'Sebastião',
    whatsapp_number: '5534999741748',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    patient: { id: 'pat_sebastiao', name: 'Sebastião' },
  };

  const relation: WhatsAppContactRelations = {
    patientCount: 2,
    patientNames: ['Sebastião', 'Leonardo'],
    isGuardianPhone: true,
    guardianName: 'Marilda Ricardo Arantes',
    guardianDependentCount: 2,
    guardianIsAlsoPatient: false,
  };

  await test('Buscar "Sebastião" (dependente) retorna match explicando o motivo', () => {
    const match = getContactSearchMatch(contatoMarilda, 'Sebastião', relation);
    assert(match !== null, 'Deve retornar um match explicando a razão');
    assertEqual(match!.via, 'patientName', 'Motivo deve ser paciente relacionado');
    assertEqual(match!.matchedName, 'Sebastião', 'Deve identificar exatamente qual dependente bateu');
  });

  await test('Buscar "Leonardo" (outro dependente) também é destacado corretamente', () => {
    const match = getContactSearchMatch(contatoMarilda, 'Leonardo', relation);
    assertEqual(match?.matchedName, 'Leonardo', 'Deve identificar Leonardo especificamente, não Sebastião');
  });

  await test('Buscar "Marilda" (nome do próprio contato/responsável) NÃO precisa de destaque — é direto', () => {
    const match = getContactSearchMatch(contatoMarilda, 'Marilda', relation);
    assertEqual(match, null, 'Match direto pelo nome do contato não precisa de explicação adicional');
  });

  await test('Buscar pelo telefone NÃO precisa de destaque — é direto', () => {
    const match = getContactSearchMatch(contatoMarilda, '999741748', relation);
    assertEqual(match, null, 'Match direto por telefone não precisa de explicação adicional');
  });

  await test('Busca vazia nunca retorna match', () => {
    assertEqual(getContactSearchMatch(contatoMarilda, '', relation), null, 'Sem termo de busca, não há o que destacar');
  });

  await test('Sem relations carregadas, nunca quebra e retorna null', () => {
    assertEqual(getContactSearchMatch(contatoMarilda, 'Sebastião', undefined), null, 'Sem enriquecimento, não há como explicar o match');
  });

  await test('Termo sem correspondência em nenhum dependente retorna null', () => {
    assertEqual(getContactSearchMatch(contatoMarilda, 'termo-inexistente', relation), null, 'Sem match, não deve inventar explicação');
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
