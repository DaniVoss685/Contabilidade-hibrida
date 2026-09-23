/**
 * SUÍTE DE TESTES FUNCIONAIS: PERSISTÊNCIA DA ABA WHATSAPP → CONTATOS
 * Valida A1/A27-A30 do hardening de Contatos: a lista de contatos (df_wa_contacts)
 * é independente do status operacional do atendimento (fila/em atendimento/finalizado/
 * sem conversa) e do bug real encontrado nesta rodada (busca vazando entre abas).
 */

import { filterContacts } from '../../src/lib/contactsFilter';
import { WhatsAppContact } from '../../src/types/whatsapp';

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
  console.log('🚀 INICIANDO TESTES FUNCIONAIS: PERSISTÊNCIA DA ABA CONTATOS');
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
  // A1/A27/A28/A29: contato existe independente do estado operacional
  // -------------------------------------------------------------
  const semAtendimento = makeContact({ id: 'ctc_sem', name: 'Sem Atendimento' });
  const emFila = makeContact({ id: 'ctc_fila', name: 'Em Fila' });
  const emAtendimento = makeContact({ id: 'ctc_atend', name: 'Em Atendimento' });
  const finalizado = makeContact({ id: 'ctc_fin', name: 'Finalizado Diomar', patient_id: 'pat_1' });
  const semConversa = makeContact({ id: 'ctc_sem_conv', name: 'Sem Conversa' });

  const todosOsContatos = [semAtendimento, emFila, emAtendimento, finalizado, semConversa];

  await test('Cenário A: sem busca, TODOS os contatos aparecem independente do status do atendimento', () => {
    const result = filterContacts(todosOsContatos, '');
    assertEqual(result.length, 5, 'A lista de contatos deve ser persistente e completa sem busca');
    assert(result.includes(finalizado), 'Contato com atendimento finalizado deve continuar em Contatos');
    assert(result.includes(semConversa), 'Contato sem conversa deve continuar em Contatos');
  });

  await test('Cenário B: WhatsAppContact não possui nenhum campo de status/fila (contrato estrutural)', () => {
    const keys = Object.keys(finalizado);
    assert(!keys.includes('status'), 'df_wa_contacts não deve carregar status operacional de atendimento');
    assert(!keys.includes('assigned_to'), 'df_wa_contacts não deve carregar responsável de atendimento');
  });

  // -------------------------------------------------------------
  // Cenário C: contato + histórico não são mutuamente exclusivos
  // -------------------------------------------------------------
  await test('Cenário C: contato finalizado (presente no Histórico) continua encontrável em Contatos por nome', () => {
    const result = filterContacts(todosOsContatos, 'Diomar');
    assertEqual(result.length, 1, 'Busca por nome deve encontrar o contato finalizado');
    assertEqual(result[0].id, 'ctc_fin', 'Deve retornar o contato correto');
  });

  await test('Cenário D: busca por telefone encontra o contato independente do status', () => {
    const comTelefoneUnico = makeContact({ id: 'ctc_tel', name: 'Weslley', whatsapp_number: '5534997662582' });
    const result = filterContacts([...todosOsContatos, comTelefoneUnico], '997662582');
    assertEqual(result.length, 1, 'Busca por substring do telefone deve encontrar o contato');
    assertEqual(result[0].id, 'ctc_tel', 'Deve retornar o contato correto pelo telefone');
  });

  // -------------------------------------------------------------
  // BUG REAL ENCONTRADO NESTA RODADA: busca vazando entre abas
  // -------------------------------------------------------------
  await test('Cenário E (regressão): busca vazia SEMPRE retorna a lista completa, sem resíduo de estado anterior', () => {
    // Simula: usuário buscou algo em "Em Atendimento", trocou de aba, e a UI
    // limpa o campo de busca (WhatsAppSidebar.onChangeTab agora chama setSearch('')).
    // Aqui validamos apenas o contrato puro: string vazia == nenhum filtro aplicado.
    const buscaResidualLimpa = '';
    const result = filterContacts(todosOsContatos, buscaResidualLimpa);
    assertEqual(result.length, todosOsContatos.length, 'Sem termo de busca, nenhum contato pode ser ocultado');
  });

  await test('Cenário F: busca sem match retorna lista vazia (comportamento correto, não um bug de persistência)', () => {
    const result = filterContacts(todosOsContatos, 'termo-que-nao-existe-em-nenhum-contato');
    assertEqual(result.length, 0, 'Busca sem correspondência deve retornar vazio — isso é esperado, não um bug');
  });

  // -------------------------------------------------------------
  // Cross-tenant: filterContacts não faz isolamento (responsabilidade do backend/RLS),
  // mas não deve nunca "inventar" ou duplicar contatos ao filtrar
  // -------------------------------------------------------------
  await test('Cenário G: filterContacts nunca duplica ou cria contatos, apenas filtra o array recebido', () => {
    const result = filterContacts(todosOsContatos, '');
    const ids = result.map((c) => c.id);
    const uniqueIds = new Set(ids);
    assertEqual(uniqueIds.size, ids.length, 'Nenhum contato deve ser duplicado pela filtragem');
  });

  console.log('\n===============================================================');
  console.log(`RESULTADO: ${passed} PASSOU, ${failed} FALHOU (${passed + failed} total)`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
