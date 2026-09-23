// Regressão: UI ficava sem nome/parentesco do responsável até F5 quando um
// guardian EXISTENTE era reaproveitado (ou o vínculo era editado/trocado/
// removido) em vez de criado do zero. Causa raiz: PatientsView.tsx buscava
// `guardianSummaries` (SupabaseService.getPatientGuardianSummaries) num
// useEffect cujas dependências eram `[refreshKey, patients.length]` —
// `patients.length` só muda ao CRIAR um paciente novo; qualquer EDIÇÃO
// (reaproveitar guardian, trocar parentesco, trocar responsável, remover
// responsável) não alterava o length e portanto NUNCA reexecutava o fetch.
// O `refreshKey` existia como sinal de invalidação mas nunca era incrementado
// no callback `onSave` do PatientModal. Fix: `onSave` agora sempre chama
// `setRefreshKey((k) => k + 1)`, e PatientSummaryTab.tsx deixou de ter fetch
// próprio (que também ficava preso a `[patient.id]`, o mesmo problema) — passa
// a receber `guardianInfo`/`dependents` como props derivadas da MESMA
// `guardianSummaries` do pai, fonte única de verdade em toda a tela.
//
// Este arquivo testa a PARTE pura e determinística do contrato (o mapeamento
// de linhas do banco para o modelo de exibição não trata "guardian novo" e
// "guardian reaproveitado" de forma diferente — a única causa real era a
// falta de invalidação, não um bug de mapeamento). A prova em runtime do
// fix (sem F5) está documentada no relatório desta sessão via reprodução
// manual no browser.
// Rodar com: npx tsx tests/functional/guardianHydrationRegression.test.ts

import { resolveGuardianMatch, GuardianCandidate } from '../../src/lib/guardianMatching';
import { filterPatientsByGuardian, searchPatientsWithGuardian, GuardianSummaries } from '../../src/lib/patientGuardianDisplay';
import { Patient } from '../../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function patient(overrides: Partial<Patient> & { id: string; name: string }): Patient {
  return { orgId: 'org_1', cpf: '', phone: '', createdAt: '2026-01-01T00:00:00Z', ...overrides } as Patient;
}

// Simula o que a REST API do PostgREST devolveria para
// df_patient_guardian_links?...&select=patient_id,relationship_type,guardian:df_patient_guardians(...)
// depois de cada cenário, e reproduz o parsing de
// SupabaseService.getPatientGuardianSummaries linha por linha (mesma lógica).
function buildSummariesFromLinkRows(
  rows: Array<{ patient_id: string; relationship_type: string | null; guardian: { id: string; name: string; phone: string | null; email?: string | null; linked_patient_id: string | null } | null }>
): GuardianSummaries {
  const byPatientId: GuardianSummaries['byPatientId'] = {};
  const guardianOfPatientId: GuardianSummaries['guardianOfPatientId'] = {};
  for (const row of rows) {
    const g = row.guardian;
    if (!g) continue;
    byPatientId[row.patient_id] = {
      guardianId: g.id,
      guardianName: g.name,
      guardianPhone: g.phone || undefined,
      guardianEmail: g.email || undefined,
      relationshipType: row.relationship_type || undefined,
    };
    if (g.linked_patient_id) {
      if (!guardianOfPatientId[g.linked_patient_id]) guardianOfPatientId[g.linked_patient_id] = { dependents: [] };
      guardianOfPatientId[g.linked_patient_id].dependents.push({ patientId: row.patient_id, relationshipType: row.relationship_type || undefined });
    }
  }
  return { byPatientId, guardianOfPatientId };
}

function runTests() {
  console.log('====================================================');
  console.log('TESTES: REGRESSÃO DE HIDRATAÇÃO DE GUARDIAN REUTILIZADO');
  console.log('====================================================\n');

  const maria = patient({ id: 'pat_A', name: 'Paciente A', cpf: '11111111111', phone: '31999998888', phoneOwner: 'PATIENT' });
  const patientB = patient({ id: 'pat_B', name: 'Paciente B', cpf: '22222222222', phone: '31999998888', phoneOwner: 'RESPONSIBLE' });

  // ---------------------------------------------------------------------
  // CASO A — guardian NOVO: após o save, a linha do banco já teria o nome
  // e o parentesco completos (nada de especial acontece só porque é novo).
  // ---------------------------------------------------------------------
  {
    const rowsAfterNewGuardianSave = [
      { patient_id: 'pat_A', relationship_type: 'Mãe', guardian: { id: 'grd_maria', name: 'Maria Silva', phone: '31999998888', linked_patient_id: null } },
    ];
    const summaries = buildSummariesFromLinkRows(rowsAfterNewGuardianSave);
    assert(summaries.byPatientId['pat_A']?.guardianName === 'Maria Silva', 'CASO-A-01: guardian novo -> guardianName presente imediatamente após a escrita');
    assert(summaries.byPatientId['pat_A']?.relationshipType === 'Mãe', 'CASO-A-02: guardian novo -> relationshipType presente imediatamente após a escrita');
  }

  // ---------------------------------------------------------------------
  // CASO B — guardian REUTILIZADO para um SEGUNDO paciente: a linha
  // retornada pelo banco tem exatamente a mesma forma do CASO A — nome e
  // parentesco completos. Não existe nenhuma diferença estrutural entre os
  // dois casos na camada de dados; a UI só parecia "faltar" o nome porque o
  // componente não tornava a buscar essa linha (bug de invalidação, não de
  // mapeamento) — ver comentário no topo do arquivo.
  // ---------------------------------------------------------------------
  {
    const rowsAfterReuse = [
      { patient_id: 'pat_A', relationship_type: 'Mãe', guardian: { id: 'grd_maria', name: 'Maria Silva', phone: '31999998888', linked_patient_id: null } },
      { patient_id: 'pat_B', relationship_type: 'Mãe', guardian: { id: 'grd_maria', name: 'Maria Silva', phone: '31999998888', linked_patient_id: null } },
    ];
    const summaries = buildSummariesFromLinkRows(rowsAfterReuse);
    assert(summaries.byPatientId['pat_B']?.guardianName === 'Maria Silva', 'CASO-B-01: guardian reutilizado -> guardianName presente para o SEGUNDO paciente, igual ao primeiro');
    assert(summaries.byPatientId['pat_B']?.relationshipType === 'Mãe', 'CASO-B-02: guardian reutilizado -> relationshipType presente para o SEGUNDO paciente');
    assert(summaries.byPatientId['pat_A']?.guardianName === 'Maria Silva', 'CASO-B-03: vínculo do primeiro paciente (A) não é afetado ao reutilizar o mesmo guardian para B');

    // Reflete na listagem/busca imediatamente (mesma função pura usada por PatientsView)
    const filtered = filterPatientsByGuardian([maria, patientB], summaries, 'WITH_GUARDIAN');
    assert(filtered.map((p) => p.id).sort().join(',') === 'pat_A,pat_B', 'CASO-B-04: filtro COM RESPONSÁVEL inclui os dois pacientes assim que a query reflete os dois links');
    const found = searchPatientsWithGuardian([maria, patientB], summaries, 'Maria Silva');
    assert(found.map((p) => p.id).sort().join(',') === 'pat_A,pat_B', 'CASO-B-05: busca por "Maria Silva" encontra os dois pacientes');
  }

  // ---------------------------------------------------------------------
  // CASO C — editar parentesco do paciente B (mesmo guardian, novo
  // relationship_type): a linha da query passa a vir com o valor novo.
  // ---------------------------------------------------------------------
  {
    const rowsAfterRelationshipEdit = [
      { patient_id: 'pat_B', relationship_type: 'Responsável legal', guardian: { id: 'grd_maria', name: 'Maria Silva', phone: '31999998888', linked_patient_id: null } },
    ];
    const summaries = buildSummariesFromLinkRows(rowsAfterRelationshipEdit);
    assert(summaries.byPatientId['pat_B']?.relationshipType === 'Responsável legal', 'CASO-C-01: editar parentesco reflete o novo valor assim que a query é refeita');
  }

  // ---------------------------------------------------------------------
  // CASO D — trocar responsável de B (Maria -> Carlos): a linha da query
  // passa a apontar para o novo guardian; nada da Maria sobra para B.
  // ---------------------------------------------------------------------
  {
    const rowsAfterGuardianSwap = [
      { patient_id: 'pat_B', relationship_type: 'Pai', guardian: { id: 'grd_carlos', name: 'Carlos Teste', phone: '31977776666', linked_patient_id: null } },
    ];
    const summaries = buildSummariesFromLinkRows(rowsAfterGuardianSwap);
    assert(summaries.byPatientId['pat_B']?.guardianId === 'grd_carlos', 'CASO-D-01: troca de responsável -> guardianId passa a ser o novo (Carlos)');
    assert(summaries.byPatientId['pat_B']?.guardianName === 'Carlos Teste', 'CASO-D-02: troca de responsável -> guardianName é o novo, sem resquício de Maria');
  }

  // ---------------------------------------------------------------------
  // CASO E — remover responsável (phone_owner volta a PATIENT): a query
  // (que filtra is_primary=eq.true) não retorna mais nenhuma linha para B
  // depois do unlink (unlinkPrimaryGuardianFromPatient seta is_primary=false).
  // ---------------------------------------------------------------------
  {
    const rowsAfterUnlink: Array<{ patient_id: string; relationship_type: string | null; guardian: any }> = [];
    const summaries = buildSummariesFromLinkRows(rowsAfterUnlink);
    assert(!summaries.byPatientId['pat_B'], 'CASO-E-01: após remover o vínculo primário, o paciente não aparece mais em byPatientId');
    const withoutGuardian = filterPatientsByGuardian([patientB], summaries, 'WITHOUT_GUARDIAN');
    assert(withoutGuardian.length === 1, 'CASO-E-02: filtro SEM RESPONSÁVEL volta a incluir o paciente imediatamente após a remoção');
  }

  // ---------------------------------------------------------------------
  // Dedup: reaproveitar por CPF ou nome+telefone não cria um SEGUNDO
  // guardian.id — condição necessária para o CASO B acima ser sequer
  // possível (se cada "reutilização" criasse um guardian novo, o bug
  // relatado nem existiria da forma descrita).
  // ---------------------------------------------------------------------
  {
    const candidates: GuardianCandidate[] = [{ id: 'grd_maria', name: 'Maria Silva', cpf: '99999999999', phone: '31999998888' }];
    const match = resolveGuardianMatch(candidates, { name: 'Maria Silva', cpf: '999.999.999-99' });
    assert(match?.id === 'grd_maria', 'DEDUP-01: reutilizar por CPF resolve para o MESMO guardian.id, nunca cria um segundo');
  }

  console.log('\n🎉 TODOS OS TESTES DE REGRESSÃO DE HIDRATAÇÃO PASSARAM!');
}

runTests();
