/**
 * SUÍTE DE TESTES FUNCIONAIS: PROPAGAÇÃO DO NOME DO RESPONSÁVEL (A31, rodada 2)
 *
 * BUG REAL relatado pelo usuário: a fatia anterior corrigiu o nome exibido na
 * LISTA da aba Contatos (Marilda aparecia corretamente ali), mas ao clicar no
 * contato para abrir/iniciar a conversa, o HEADER DO CHAT voltava a mostrar
 * "Sebastião" (o paciente primário legado) em vez de "Marilda Ricardo Arantes"
 * (o responsável). Causa: getContactDisplayName (usado no header, drawer,
 * kanban, reply-to) não tinha acesso a `relations` — só a lista de Contatos
 * (WhatsAppSidebar) recebia esse enriquecimento via getContactDisplayNameForList.
 *
 * Correção: getContactDisplayName agora prioriza contact.guardianDisplayName
 * (novo campo client-side em ContactNameResolvable/WhatsAppContact) sobre
 * contact.patient.name. WhatsAppMainView.loadConversations anexa esse campo em
 * TODOS os objetos de contato (conversations[].contact, history[].contact,
 * contacts[]) via withGuardianDisplayName, uma única vez, antes de guardar no
 * estado — assim qualquer componente que já chamava getContactDisplayName(ctc)
 * passa a mostrar o nome certo automaticamente, sem prop-drilling.
 */

import { getContactDisplayName } from '../../src/lib/phoneUtils';
import { withGuardianDisplayName, getContactDisplayNameForList } from '../../src/lib/contactsFilter';
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

function makeContact(overrides: Partial<WhatsAppContact>): WhatsAppContact {
  return {
    id: 'ctc_sebastiao',
    tenant_id: 'clinic_teste',
    patient_id: 'pat_sebastiao',
    name: 'Sebastião',
    whatsapp_number: '5534999741748',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    patient: { id: 'pat_sebastiao', name: 'Sebastião' },
    ...overrides,
  };
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES: PROPAGAÇÃO DO NOME DO RESPONSÁVEL (A31 rodada 2)');
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

  const contatoSebastiao = makeContact({});
  const relations: Record<string, WhatsAppContactRelations> = {
    ctc_sebastiao: {
      patientCount: 2,
      patientNames: ['Sebastião', 'Leonardo'],
      isGuardianPhone: true,
      guardianName: 'Marilda Ricardo Arantes',
      guardianDependentCount: 2,
      guardianIsAlsoPatient: false,
    },
  };

  await test('getContactDisplayName prioriza guardianDisplayName sobre patient.name quando presente', () => {
    const enriquecido = withGuardianDisplayName(contatoSebastiao, relations)!;
    assertEqual(getContactDisplayName(enriquecido), 'Marilda Ricardo Arantes', 'Header do chat deve mostrar a responsável, não o paciente primário');
  });

  await test('Sem enriquecimento (guardianDisplayName ausente), comportamento antigo é preservado', () => {
    assertEqual(getContactDisplayName(contatoSebastiao), 'Sebastião', 'Sem guardian, cai para o paciente vinculado como sempre');
  });

  await test('withGuardianDisplayName não enriquece quando o telefone NÃO é de um responsável', () => {
    const contatoProprio = makeContact({ id: 'ctc_outro' });
    const relationsSemGuardian: Record<string, WhatsAppContactRelations> = {
      ctc_outro: { patientCount: 1, patientNames: ['Sebastião'], isGuardianPhone: false },
    };
    const enriquecido = withGuardianDisplayName(contatoProprio, relationsSemGuardian)!;
    assertEqual(enriquecido.guardianDisplayName, null, 'Telefone próprio não deve ganhar guardianDisplayName');
    assertEqual(getContactDisplayName(enriquecido), 'Sebastião', 'Continua mostrando o nome do paciente para telefone próprio');
  });

  await test('withGuardianDisplayName lida com contact null/undefined sem quebrar (conversation.contact pode ser undefined)', () => {
    assertEqual(withGuardianDisplayName(undefined, relations), undefined, 'undefined deve passar direto');
    assertEqual(withGuardianDisplayName(null as any, relations), null, 'null deve passar direto');
  });

  await test('withGuardianDisplayName não recria o objeto quando o valor já é o mesmo (evita re-render à toa)', () => {
    const jaEnriquecido = { ...contatoSebastiao, guardianDisplayName: 'Marilda Ricardo Arantes' };
    const resultado = withGuardianDisplayName(jaEnriquecido, relations);
    assert(resultado === jaEnriquecido, 'Deve retornar a MESMA referência quando o valor não muda');
  });

  await test('Cenário completo: header do chat + lista de Contatos mostram o MESMO nome (Marilda), nunca divergem', () => {
    const enriquecidoParaHeader = withGuardianDisplayName(contatoSebastiao, relations)!;
    const nomeHeader = getContactDisplayName(enriquecidoParaHeader);
    // A lista de Contatos (WhatsAppSidebar) usa getContactDisplayNameForList com a mesma `relations`.
    const nomeLista = getContactDisplayNameForList(contatoSebastiao, relations['ctc_sebastiao']);
    assertEqual(nomeHeader, nomeLista, 'Header do chat e lista de Contatos nunca podem mostrar nomes diferentes para o mesmo contato');
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
