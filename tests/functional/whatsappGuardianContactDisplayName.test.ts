/**
 * SUÍTE DE TESTES FUNCIONAIS: NOME EXIBIDO DO CONTATO RESPONSÁVEL (A31)
 *
 * BUG REAL relatado pelo usuário (tenant clinic_1789650130_ec5b): o contato do
 * telefone de Marilda Ricardo Arantes aparecia na aba Contatos com o nome
 * "Sebastião" (o paciente primário legado daquele df_wa_contact, por ordem de
 * cadastro) junto com a tag "Responsável por 2 pacientes" — dando a entender
 * que o próprio Sebastião era responsável por si mesmo e pelo irmão Leonardo,
 * quando na verdade é Marilda quem responde por aquele número. A tag e a lista
 * de dependentes (Sebastião, Leonardo) já estavam corretas — só o NOME em
 * destaque estava errado.
 *
 * Correção: getContactDisplayNameForList prioriza o nome do responsável
 * (relation.guardianName) sobre getContactDisplayName (que usa
 * contact.patient.name — o paciente primário legado) sempre que o telefone é
 * identificado como de um responsável.
 */

import { getContactDisplayNameForList } from '../../src/lib/contactsFilter';
import { WhatsAppContact, WhatsAppContactRelations } from '../../src/types/whatsapp';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`FALHA NA ASSERÇÃO: ${message}. Esperado: "${expected}", Obtido: "${actual}"`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES: NOME EXIBIDO DO CONTATO RESPONSÁVEL (A31)');
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

  // Reproduz exatamente o cenário real relatado: contato cujo patient_id
  // primário (legado) é "Sebastião", mas o número pertence ao responsável Marilda.
  const contatoDoTelefoneDaMarilda: WhatsAppContact = {
    id: 'ctc_sebastiao',
    tenant_id: 'clinic_teste',
    patient_id: 'pat_sebastiao',
    name: 'Sebastião',
    whatsapp_number: '5534999741748',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    patient: { id: 'pat_sebastiao', name: 'Sebastião' },
  };

  const relationMarilda: WhatsAppContactRelations = {
    patientCount: 2,
    patientNames: ['Sebastião', 'Leonardo'],
    isGuardianPhone: true,
    guardianName: 'Marilda Ricardo Arantes',
    guardianDependentCount: 2,
    guardianIsAlsoPatient: false,
  };

  await test('Contato de telefone de responsável mostra o NOME DO RESPONSÁVEL, não o paciente primário legado', () => {
    const displayed = getContactDisplayNameForList(contatoDoTelefoneDaMarilda, relationMarilda);
    assertEqual(displayed, 'Marilda Ricardo Arantes', 'Deve mostrar Marilda, nunca Sebastião, para este contato');
  });

  await test('Sebastião não deve aparecer como se fosse responsável por si mesmo (nome ≠ paciente primário)', () => {
    const displayed = getContactDisplayNameForList(contatoDoTelefoneDaMarilda, relationMarilda);
    assertEqual(displayed === contatoDoTelefoneDaMarilda.patient?.name, false, 'Nome exibido não pode ser igual ao paciente primário quando é telefone de responsável');
  });

  await test('Sem relation (ainda não carregou getContactRelations) cai de volta para o nome do paciente, sem quebrar', () => {
    const displayed = getContactDisplayNameForList(contatoDoTelefoneDaMarilda, undefined);
    assertEqual(displayed, 'Sebastião', 'Fallback correto enquanto o enriquecimento não chega');
  });

  await test('Telefone próprio do paciente (não é guardian): mantém o nome do paciente normalmente', () => {
    const contatoProprio: WhatsAppContact = {
      ...contatoDoTelefoneDaMarilda,
      id: 'ctc_proprio',
    };
    const relationSemGuardian: WhatsAppContactRelations = {
      patientCount: 1,
      patientNames: ['Sebastião'],
      isGuardianPhone: false,
    };
    const displayed = getContactDisplayNameForList(contatoProprio, relationSemGuardian);
    assertEqual(displayed, 'Sebastião', 'Telefone próprio continua mostrando o nome do paciente');
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
