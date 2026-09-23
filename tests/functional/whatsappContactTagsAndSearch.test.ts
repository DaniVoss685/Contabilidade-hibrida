/**
 * SUÍTE DE TESTES FUNCIONAIS: TAGS DE RESPONSÁVEL/PACIENTE E BUSCA ESTENDIDA (A3-A6/A32)
 * Cobre o cenário do próprio pedido: Maria (responsável) por João e Ana, e o caso em que
 * Maria também é paciente cadastrada da clínica (linked_patient_id).
 */

import { filterContacts, getContactTags } from '../../src/lib/contactsFilter';
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
    id: 'ctc_default',
    tenant_id: 'clinic_teste',
    patient_id: null,
    name: 'Contato Padrão',
    whatsapp_number: '5534999999999',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

async function runTests() {
  console.log('===============================================================');
  console.log('🚀 INICIANDO TESTES: TAGS DE RESPONSÁVEL/PACIENTE E BUSCA ESTENDIDA');
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

  // -------------------------------------------------------------
  // A6/A37: exemplo do pedido — Maria responsável por João e Ana
  // -------------------------------------------------------------
  const maria = makeContact({ id: 'ctc_maria', name: 'Maria Teste', whatsapp_number: '5534999990001' });
  const mariaRelation: WhatsAppContactRelations = {
    patientCount: 2,
    patientNames: ['João Teste', 'Ana Teste'],
    isGuardianPhone: true,
    guardianName: 'Maria Teste',
    guardianDependentCount: 2,
    guardianIsAlsoPatient: false,
  };

  await test('Maria (responsável por 2, não é paciente): tag única "Responsável por 2 pacientes"', () => {
    const tags = getContactTags(maria, mariaRelation);
    assertEqual(tags.length, 1, 'Deve ter exatamente 1 tag');
    assertEqual(tags[0].label, 'Responsável por 2 pacientes', 'Label deve indicar a contagem');
  });

  await test('Maria também é paciente (linked_patient_id): combina Responsável + Paciente', () => {
    const relation: WhatsAppContactRelations = { ...mariaRelation, guardianIsAlsoPatient: true };
    const tags = getContactTags(maria, relation);
    const labels = tags.map((t) => t.label);
    assert(labels.includes('Responsável por 2 pacientes'), 'Deve manter a tag de responsável');
    assert(labels.includes('Paciente'), 'Deve mostrar também Paciente, sem esconder nenhuma das duas condições');
  });

  await test('Responsável por exatamente 1 paciente: label simples "Responsável" (sem "por 1 pacientes")', () => {
    const relation: WhatsAppContactRelations = { ...mariaRelation, patientCount: 1, guardianDependentCount: 1 };
    const tags = getContactTags(maria, relation);
    assertEqual(tags[0].label, 'Responsável', 'Não deve dizer "por 1 pacientes"');
  });

  // -------------------------------------------------------------
  // Caso clássico: telefone do próprio paciente (não é responsável de ninguém)
  // -------------------------------------------------------------
  await test('Paciente com telefone próprio: tag "Paciente" simples', () => {
    const ctc = makeContact({ id: 'ctc_pac', patient_id: 'pat_1' });
    const relation: WhatsAppContactRelations = {
      patientCount: 1,
      patientNames: ['Paciente Próprio'],
      isGuardianPhone: false,
    };
    const tags = getContactTags(ctc, relation);
    assertEqual(tags.length, 1, 'Deve ter só 1 tag');
    assertEqual(tags[0].label, 'Paciente', 'Deve ser Paciente');
  });

  await test('Contato sem paciente e sem responsável: "Não cadastrado"', () => {
    const ctc = makeContact({ id: 'ctc_novo' });
    const tags = getContactTags(ctc, undefined);
    assertEqual(tags[0].label, 'Não cadastrado', 'Sem relação nenhuma deve ser Não cadastrado');
  });

  await test('Grupo do WhatsApp: sempre tag única "Grupo", nunca vira paciente/responsável', () => {
    const grupo = makeContact({ id: 'ctc_grupo', whatsapp_number: '123456-group@g.us' });
    const tags = getContactTags(grupo, mariaRelation);
    assertEqual(tags.length, 1, 'Grupo deve ter só 1 tag');
    assertEqual(tags[0].label, 'Grupo', 'Grupo nunca deve ganhar tag de paciente/responsável');
  });

  await test('Sem enriquecimento carregado (relation undefined) ainda usa patient_id legado como fallback', () => {
    const ctc = makeContact({ id: 'ctc_legado', patient_id: 'pat_legado' });
    const tags = getContactTags(ctc, undefined);
    assertEqual(tags[0].label, 'Paciente', 'Fallback para patient_id legado enquanto relations não carrega');
  });

  // -------------------------------------------------------------
  // A32: busca por nome de responsável e por nome de dependente
  // -------------------------------------------------------------
  const joao = makeContact({ id: 'ctc_joao_proprio', name: 'João Próprio Número', whatsapp_number: '5534988887777' });
  const contatos = [maria, joao];
  const relations: Record<string, WhatsAppContactRelations> = { ctc_maria: mariaRelation };

  await test('Buscar "João" encontra Maria, indicando que ela é responsável por ele', () => {
    const result = filterContacts(contatos, 'João', relations);
    assert(result.some((c) => c.id === 'ctc_maria'), 'Maria deve aparecer ao buscar pelo dependente João');
  });

  await test('Buscar "Ana" encontra Maria (segunda dependente)', () => {
    const result = filterContacts(contatos, 'Ana', relations);
    assert(result.some((c) => c.id === 'ctc_maria'), 'Maria deve aparecer ao buscar pela dependente Ana');
  });

  await test('Buscar "Maria" encontra o próprio contato pelo nome', () => {
    const result = filterContacts(contatos, 'Maria', relations);
    assert(result.some((c) => c.id === 'ctc_maria'), 'Busca direta pelo nome do contato deve continuar funcionando');
  });

  await test('Sem relations carregadas, busca cai de volta para nome/telefone apenas (não quebra)', () => {
    const result = filterContacts(contatos, 'João');
    assert(result.some((c) => c.id === 'ctc_joao_proprio'), 'Contato com nome João deve ser encontrado por nome próprio');
    assert(!result.some((c) => c.id === 'ctc_maria'), 'Sem relations, não pode inferir vínculo de dependente');
  });

  await test('Busca tenant-scoped: filterContacts nunca extrapola o array recebido (isolamento é responsabilidade do fetch)', () => {
    const result = filterContacts(contatos, 'Maria', relations);
    assert(result.every((c) => contatos.includes(c)), 'Resultado deve ser subconjunto do array de entrada');
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
