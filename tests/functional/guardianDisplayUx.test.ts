// Testes da rodada de UX do modelo de responsável (guardian) — labels
// dinâmicos, filtros e busca na listagem de pacientes, e vínculo explícito
// guardian<->patient por CPF. Lógica pura, mesmo padrão dos demais testes
// deste projeto (ver guardianAndSharedPhone.test.ts).
// Rodar com: npx tsx tests/functional/guardianDisplayUx.test.ts

import {
  getPhoneFieldLabel,
  filterPatientsByGuardian,
  searchPatientsWithGuardian,
  GuardianSummaries,
} from '../../src/lib/patientGuardianDisplay';
import { Patient } from '../../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function patient(overrides: Partial<Patient> & { id: string; name: string }): Patient {
  return {
    orgId: 'org_1',
    cpf: '',
    phone: '',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Patient;
}

function runTests() {
  console.log('====================================================');
  console.log('TESTES: UX DO RESPONSÁVEL (LABELS, LISTAGEM, FILTROS, BUSCA)');
  console.log('====================================================\n');

  // ---------------------------------------------------------------------
  // Fase 1: label dinâmico do campo de telefone.
  // ---------------------------------------------------------------------
  assert(getPhoneFieldLabel('PATIENT') === 'WhatsApp / Telefone do paciente', 'LABEL-01: phone_owner=PATIENT mostra label do paciente');
  assert(getPhoneFieldLabel('RESPONSIBLE') === 'WhatsApp / Telefone do responsável', 'LABEL-02: phone_owner=RESPONSIBLE mostra label do responsável');
  assert(getPhoneFieldLabel(undefined) === 'WhatsApp / Telefone do paciente', 'LABEL-03: sem phone_owner (legado) assume label do paciente, nunca ambíguo');

  // Cenário de teste: Maria (paciente E responsável de João e Ana), Sebastião (com responsável Marilda, sem cadastro próprio), Pedro (telefone próprio)
  const maria = patient({ id: 'pat_maria', name: 'Maria Silva', cpf: '11111111111', phone: '31999998888', phoneOwner: 'PATIENT' });
  const joao = patient({ id: 'pat_joao', name: 'João Silva', cpf: '22222222222', phone: '31999998888', phoneOwner: 'RESPONSIBLE' });
  const ana = patient({ id: 'pat_ana', name: 'Ana Silva', cpf: '33333333333', phone: '31999998888', phoneOwner: 'RESPONSIBLE' });
  const sebastiao = patient({ id: 'pat_sebastiao', name: 'Sebastião', cpf: '46467084691', phone: '34997417480', phoneOwner: 'RESPONSIBLE' });
  const pedro = patient({ id: 'pat_pedro', name: 'Pedro Costa', cpf: '55555555555', phone: '31955554444', phoneOwner: 'PATIENT' });

  const patients = [maria, joao, ana, sebastiao, pedro];

  const summaries: GuardianSummaries = {
    byPatientId: {
      pat_joao: { guardianId: 'grd_maria', guardianName: 'Maria Silva', guardianPhone: '31999998888', relationshipType: 'Mãe' },
      pat_ana: { guardianId: 'grd_maria', guardianName: 'Maria Silva', guardianPhone: '31999998888', relationshipType: 'Mãe' },
      pat_sebastiao: { guardianId: 'grd_marilda', guardianName: 'Marilda Ricardo Arantes', guardianPhone: '34997417480', relationshipType: 'Esposa' },
    },
    guardianOfPatientId: {
      pat_maria: { dependents: [{ patientId: 'pat_joao', relationshipType: 'Mãe' }, { patientId: 'pat_ana', relationshipType: 'Mãe' }] },
    },
  };

  // ---------------------------------------------------------------------
  // Fase 8/13: filtros COM RESPONSÁVEL / SEM RESPONSÁVEL / RESPONSÁVEIS —
  // semântica independente (Maria está em nenhum "com responsável" mas está
  // em "responsáveis"; João/Ana estão em "com responsável" mas não em
  // "responsáveis").
  // ---------------------------------------------------------------------
  {
    const all = filterPatientsByGuardian(patients, summaries, 'ALL');
    assert(all.length === 5, 'FILTER-01: TODOS retorna todos os pacientes');

    const withGuardian = filterPatientsByGuardian(patients, summaries, 'WITH_GUARDIAN');
    assert(
      withGuardian.map((p) => p.id).sort().join(',') === 'pat_ana,pat_joao,pat_sebastiao',
      'FILTER-02: COM RESPONSÁVEL retorna só quem tem guardian primário (João, Ana, Sebastião)'
    );

    const withoutGuardian = filterPatientsByGuardian(patients, summaries, 'WITHOUT_GUARDIAN');
    assert(
      withoutGuardian.map((p) => p.id).sort().join(',') === 'pat_maria,pat_pedro',
      'FILTER-03: SEM RESPONSÁVEL retorna quem não tem guardian (Maria e Pedro têm telefone próprio)'
    );

    const isGuardian = filterPatientsByGuardian(patients, summaries, 'IS_GUARDIAN');
    assert(
      isGuardian.length === 1 && isGuardian[0].id === 'pat_maria',
      'FILTER-04: RESPONSÁVEIS retorna só quem é guardian de outros (Maria, mesmo sem ela própria ter responsável)'
    );
  }

  // ---------------------------------------------------------------------
  // Fase 14: busca por nome do responsável encontra o paciente dependente,
  // preservando busca por nome/CPF/telefone do próprio paciente.
  // ---------------------------------------------------------------------
  {
    const byGuardianName = searchPatientsWithGuardian(patients, summaries, 'Marilda');
    assert(
      byGuardianName.length === 1 && byGuardianName[0].id === 'pat_sebastiao',
      'SEARCH-01: buscar "Marilda" encontra Sebastião (responsável), como no exemplo do pedido'
    );

    const byOwnName = searchPatientsWithGuardian(patients, summaries, 'Pedro');
    assert(byOwnName.length === 1 && byOwnName[0].id === 'pat_pedro', 'SEARCH-02: busca por nome do próprio paciente continua funcionando');

    const byCpf = searchPatientsWithGuardian(patients, summaries, '464.670.846-91');
    assert(byCpf.length === 1 && byCpf[0].id === 'pat_sebastiao', 'SEARCH-03: busca por CPF continua funcionando');

    const byPhone = searchPatientsWithGuardian(patients, summaries, '999998888');
    assert(
      byPhone.map((p) => p.id).sort().join(',') === 'pat_ana,pat_joao,pat_maria',
      'SEARCH-04: busca por telefone compartilhado encontra TODOS os pacientes com esse número (mãe + filhos), sem tratar como erro'
    );

    const noMatch = searchPatientsWithGuardian(patients, summaries, 'Inexistente');
    assert(noMatch.length === 0, 'SEARCH-05: termo sem correspondência retorna lista vazia, não todos os pacientes');
  }

  // ---------------------------------------------------------------------
  // Isolamento: os mapas de summaries já vêm tenant-scoped de
  // SupabaseService.getPatientGuardianSummaries (filtro .eq('tenant_id', ...)
  // na query) — aqui validamos que a função pura de filtro/busca não faz
  // nenhum acesso a estado global que pudesse vazar entre tenants, operando
  // estritamente sobre os arrays recebidos por parâmetro.
  // ---------------------------------------------------------------------
  {
    const outroTenantSummaries: GuardianSummaries = { byPatientId: {}, guardianOfPatientId: {} };
    const resultado = filterPatientsByGuardian(patients, outroTenantSummaries, 'WITH_GUARDIAN');
    assert(
      resultado.length === 0,
      'TENANT-01: summaries de outro tenant (vazio) não vaza vínculo de responsável — filtro depende só do parâmetro recebido'
    );
  }

  console.log('\n🎉 TODOS OS TESTES DE UX DO RESPONSÁVEL PASSARAM!');
}

runTests();
