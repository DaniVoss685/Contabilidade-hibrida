import { mapDbPatientToApp, mapAppPatientToDb } from '../../src/lib/supabaseClient';
import { Patient } from '../../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function runTests() {
  console.log('====================================================');
  console.log('TESTES DE PERSISTÊNCIA DOS ALERTAS DE SAÚDE (df_patients)');
  console.log('====================================================\n');

  // 1. mapAppPatientToDb deve incluir as 4 colunas de alertas no payload enviado ao Supabase
  const appPatient: Patient = {
    id: 'pat_1',
    orgId: 'org_1',
    name: 'Paciente Teste',
    cpf: '12345678901',
    allergies: ['Látex', 'Dipirona'],
    conditions: ['Diabetes', 'Hipertensão'],
    medications: ['Losartana'],
    clinicalNotes: 'Atenção à pressão arterial',
    createdAt: '2026-01-01T00:00:00Z',
  };

  const dbPayload = mapAppPatientToDb(appPatient, 'tenant_1');
  assert(
    Array.isArray(dbPayload.allergies) && dbPayload.allergies.length === 2,
    'ALERTS-01: mapAppPatientToDb inclui allergies no payload de escrita'
  );
  assert(
    Array.isArray(dbPayload.conditions) && dbPayload.conditions.includes('Diabetes'),
    'ALERTS-02: mapAppPatientToDb inclui conditions no payload de escrita'
  );
  assert(
    Array.isArray(dbPayload.medications) && dbPayload.medications.includes('Losartana'),
    'ALERTS-03: mapAppPatientToDb inclui medications no payload de escrita'
  );
  assert(
    dbPayload.clinical_notes === 'Atenção à pressão arterial',
    'ALERTS-04: mapAppPatientToDb inclui clinical_notes no payload de escrita'
  );

  // 2. mapDbPatientToApp deve reconstruir corretamente allergies/conditions/medications/clinicalNotes na releitura (F5/login)
  const dbRow = {
    id: 'pat_1',
    tenant_id: 'tenant_1',
    org_id: 'org_1',
    name: 'Paciente Teste',
    cpf: '12345678901',
    allergies: ['Látex', 'Dipirona'],
    conditions: ['Diabetes', 'Hipertensão'],
    medications: ['Losartana'],
    clinical_notes: 'Atenção à pressão arterial',
    created_at: '2026-01-01T00:00:00Z',
  };

  const reloaded = mapDbPatientToApp(dbRow);
  assert(
    JSON.stringify(reloaded.allergies) === JSON.stringify(['Látex', 'Dipirona']),
    'ALERTS-05: mapDbPatientToApp reconstrói allergies após releitura'
  );
  assert(
    JSON.stringify(reloaded.conditions) === JSON.stringify(['Diabetes', 'Hipertensão']),
    'ALERTS-06: mapDbPatientToApp reconstrói conditions após releitura'
  );
  assert(
    JSON.stringify(reloaded.medications) === JSON.stringify(['Losartana']),
    'ALERTS-07: mapDbPatientToApp reconstrói medications após releitura'
  );
  assert(
    reloaded.clinicalNotes === 'Atenção à pressão arterial',
    'ALERTS-08: mapDbPatientToApp reconstrói clinicalNotes após releitura'
  );

  // 3. Limpar campos (usuário apaga tudo e salva) não deve reviver valores anteriores
  const clearedPatient: Patient = {
    ...appPatient,
    allergies: [],
    conditions: [],
    medications: [],
    clinicalNotes: '',
  };
  const clearedPayload = mapAppPatientToDb(clearedPatient, 'tenant_1');
  assert(
    Array.isArray(clearedPayload.allergies) && clearedPayload.allergies.length === 0,
    'ALERTS-09: Limpar alergias persiste array vazio, não undefined/null'
  );
  assert(
    clearedPayload.clinical_notes === '',
    'ALERTS-10: Limpar observações persiste string vazia'
  );

  // 4. Linhas nulas/ausentes (paciente legado sem os campos) não devem quebrar a leitura
  const legacyRow = { id: 'pat_2', tenant_id: 'tenant_1', org_id: 'org_1', name: 'Paciente Legado', cpf: '', created_at: '2026-01-01T00:00:00Z' };
  const legacyReloaded = mapDbPatientToApp(legacyRow);
  assert(
    Array.isArray(legacyReloaded.allergies) && legacyReloaded.allergies.length === 0,
    'ALERTS-11: Paciente legado sem colunas de alerta não quebra e retorna array vazio'
  );

  // 5. Troca de paciente: dois pacientes distintos não compartilham referência de array
  const patientA = mapDbPatientToApp({ ...dbRow, id: 'pat_a', allergies: ['Látex'] });
  const patientB = mapDbPatientToApp({ ...dbRow, id: 'pat_b', allergies: [] });
  assert(
    patientA.allergies!.length === 1 && patientB.allergies!.length === 0,
    'ALERTS-12: Pacientes distintos mantêm listas de alergias independentes (sem vazamento de estado)'
  );

  console.log('\n🎉 TODOS OS TESTES DE PERSISTÊNCIA DOS ALERTAS DE SAÚDE PASSARAM!');
}

runTests();
