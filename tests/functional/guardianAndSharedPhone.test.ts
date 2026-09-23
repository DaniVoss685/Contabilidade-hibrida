// Testes do modelo de RESPONSÁVEL (guardian) + TELEFONE COMPARTILHADO entre
// pacientes (ver CLAUDE.md "Guardian / responsável e telefone compartilhado").
// Segue o mesmo padrão dos demais testes deste projeto: lógica pura,
// nenhuma escrita em banco real (ver patientHealthAlertsPersistence.test.ts /
// legacyImportTenantIsolation.test.ts para o mesmo estilo).
// Rodar com: npx tsx tests/functional/guardianAndSharedPhone.test.ts

import { mapDbPatientToApp, mapAppPatientToDb } from '../../src/lib/supabaseClient';
import { Patient } from '../../src/types';
import { resolveUniquePendingAppointment } from '../../src/lib/whatsappAmbiguityResolution';
import { resolveGuardianMatch } from '../../src/lib/guardianMatching';
import { getEffectivePatientPhone } from '../../src/lib/patientPhoneResolution';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function runTests() {
  console.log('====================================================');
  console.log('TESTES: RESPONSÁVEL (GUARDIAN) + TELEFONE COMPARTILHADO');
  console.log('====================================================\n');

  // ---------------------------------------------------------------------
  // A. Mesmo telefone em dois pacientes -> permitido (nenhuma checagem de
  //    unicidade no mapper/payload; a única fonte de verdade de duplicidade
  //    é a UI, que agora apenas avisa, nunca bloqueia).
  // ---------------------------------------------------------------------
  {
    const mae: Patient = {
      id: 'pat_mae', orgId: 'org_1', name: 'Maria Silva', cpf: '11111111111',
      phone: '31999998888', phoneOwner: 'PATIENT', createdAt: '2026-01-01T00:00:00Z',
    };
    const filho: Patient = {
      id: 'pat_filho', orgId: 'org_1', name: 'João Silva', cpf: '22222222222',
      phone: '31999998888', phoneOwner: 'RESPONSIBLE', createdAt: '2026-01-01T00:00:00Z',
    };
    const filha: Patient = {
      id: 'pat_filha', orgId: 'org_1', name: 'Ana Silva', cpf: '33333333333',
      phone: '31999998888', phoneOwner: 'RESPONSIBLE', createdAt: '2026-01-01T00:00:00Z',
    };
    const payloadMae = mapAppPatientToDb(mae, 'tenant_1');
    const payloadFilho = mapAppPatientToDb(filho, 'tenant_1');
    const payloadFilha = mapAppPatientToDb(filha, 'tenant_1');
    assert(
      payloadMae.phone === payloadFilho.phone && payloadFilho.phone === payloadFilha.phone,
      'A-01: três pacientes distintos podem carregar o mesmo telefone no payload de escrita (nenhuma checagem de unicidade no mapper)'
    );
    assert(
      payloadMae.id !== payloadFilho.id && payloadFilho.id !== payloadFilha.id,
      'A-02: mesmo com telefone igual, cada paciente mantém identidade própria (id) intacta'
    );
  }

  // ---------------------------------------------------------------------
  // C. CPF dos pacientes diferentes -> não bloqueia (CPF nunca é comparado
  //    a partir do telefone; cada paciente carrega seu próprio CPF).
  // ---------------------------------------------------------------------
  {
    const filho = mapDbPatientToApp({
      id: 'pat_filho', tenant_id: 't1', org_id: 'org_1', name: 'João Silva', cpf: '22222222222',
      phone: '31999998888', phone_owner: 'RESPONSIBLE', created_at: '2026-01-01T00:00:00Z',
    });
    const filha = mapDbPatientToApp({
      id: 'pat_filha', tenant_id: 't1', org_id: 'org_1', name: 'Ana Silva', cpf: '33333333333',
      phone: '31999998888', phone_owner: 'RESPONSIBLE', created_at: '2026-01-01T00:00:00Z',
    });
    assert(filho.cpf !== filha.cpf, 'C-01: CPFs distintos preservados mesmo com telefone (do responsável) idêntico');
    assert(filho.phone === filha.phone, 'C-02: telefone compartilhado não é alterado/anonimizado por paciente');
  }

  // ---------------------------------------------------------------------
  // phoneOwner: round-trip DB <-> App, e default seguro para dados legados.
  // ---------------------------------------------------------------------
  {
    const asResponsible = mapDbPatientToApp({
      id: 'p1', tenant_id: 't1', org_id: 'o1', name: 'X', cpf: '', phone: '31900000000',
      phone_owner: 'RESPONSIBLE', created_at: '2026-01-01T00:00:00Z',
    });
    assert(asResponsible.phoneOwner === 'RESPONSIBLE', 'PHONE_OWNER-01: mapDbPatientToApp lê phone_owner = RESPONSIBLE corretamente');

    const legacyRow = mapDbPatientToApp({
      id: 'p2', tenant_id: 't1', org_id: 'o1', name: 'Y', cpf: '', phone: '31900000001',
      created_at: '2026-01-01T00:00:00Z',
    });
    assert(
      legacyRow.phoneOwner === 'PATIENT',
      'PHONE_OWNER-02: paciente legado sem a coluna phone_owner assume PATIENT por padrão (Fase 15 — não inventar responsável)'
    );

    const dbPayload = mapAppPatientToDb(asResponsible, 't1');
    assert(dbPayload.phone_owner === 'RESPONSIBLE', 'PHONE_OWNER-03: mapAppPatientToDb grava phone_owner de volta corretamente');
  }

  // ---------------------------------------------------------------------
  // E/H. Ambiguidade: resposta "Sim" só confirma automaticamente quando há
  // EXATAMENTE UMA consulta pendente entre TODOS os pacientes vinculados ao
  // contato (não apenas de um único paciente) — mesma regra usada em
  // supabase/functions/dental-whatsapp-webhook/index.ts.
  // ---------------------------------------------------------------------
  {
    const nenhuma = resolveUniquePendingAppointment([]);
    assert(nenhuma.outcome === 'NONE', 'AMBIG-01: sem consultas pendentes -> NONE, nunca confirma nada');

    const unica = resolveUniquePendingAppointment([{ id: 'apt_1', patientId: 'pat_filho' }]);
    assert(unica.outcome === 'UNIQUE' && unica.appointment.id === 'apt_1', 'AMBIG-02: exatamente 1 consulta pendente (de qualquer um dos pacientes do telefone) -> confirma');

    // João e Ana (mesmo telefone da mãe) têm consultas pendentes distintas
    const ambigua = resolveUniquePendingAppointment([
      { id: 'apt_joao', patientId: 'pat_filho' },
      { id: 'apt_ana', patientId: 'pat_filha' },
    ]);
    assert(
      ambigua.outcome === 'AMBIGUOUS' && ambigua.candidates.length === 2,
      'AMBIG-03: dois pacientes do mesmo telefone com consultas pendentes distintas -> AMBIGUOUS, resposta "Sim" não confirma paciente errado'
    );
  }

  // ---------------------------------------------------------------------
  // B/6. Responsável compartilhado: reaproveitar por CPF, ou por
  // nome+telefone normalizados; nunca reaproveitar só por telefone solto
  // (números são reciclados entre pessoas reais).
  // ---------------------------------------------------------------------
  {
    const candidates = [
      { id: 'grd_maria', name: 'Maria da Silva', cpf: '11122233344', phone: '31999998888' },
      { id: 'grd_outra', name: 'Outra Pessoa', cpf: '', phone: '31955554444' },
    ];

    const byCpf = resolveGuardianMatch(candidates, { name: 'Maria Silva (nome digitado diferente)', cpf: '111.222.333-44' });
    assert(byCpf?.id === 'grd_maria', 'GUARDIAN-01: CPF válido e igual reaproveita o responsável, mesmo com nome digitado diferente');

    const byNamePhone = resolveGuardianMatch(candidates, { name: '  MARIA   DA SILVA ', phone: '(31) 99999-8888' });
    assert(byNamePhone?.id === 'grd_maria', 'GUARDIAN-02: nome normalizado + telefone normalizado iguais reaproveita o responsável');

    const noMatchByPhoneAlone = resolveGuardianMatch(candidates, { name: 'Pessoa Completamente Diferente', phone: '31999998888' });
    assert(
      noMatchByPhoneAlone === null,
      'GUARDIAN-03: telefone igual sozinho (sem nome nem CPF batendo) NÃO reaproveita — evita juntar pessoas diferentes por número reciclado'
    );

    const newGuardian = resolveGuardianMatch(candidates, { name: 'Pedro Novo', phone: '31900001111' });
    assert(newGuardian === null, 'GUARDIAN-04: responsável sem nenhum critério seguro batendo -> cria novo, não força reaproveitamento');
  }

  // ---------------------------------------------------------------------
  // 15/17. Telefone efetivo: fonte canônica é o responsável quando
  // phone_owner = RESPONSIBLE; df_patients.phone é o cache já sincronizado
  // pelas triggers fn_sync_guardian_phone_to_patients /
  // fn_sync_patient_link_phone (validado com dados sintéticos reais nesta
  // sessão — ver relatório).
  // ---------------------------------------------------------------------
  {
    const ownPhonePatient = { phone: '31988887777', phoneOwner: 'PATIENT' as const };
    assert(
      getEffectivePatientPhone(ownPhonePatient) === '31988887777',
      'EFFECTIVE-01: PATIENT -> telefone efetivo é o próprio patient.phone'
    );

    const responsiblePatientCached = { phone: '31999990002', phoneOwner: 'RESPONSIBLE' as const };
    assert(
      getEffectivePatientPhone(responsiblePatientCached) === '31999990002',
      'EFFECTIVE-02: RESPONSIBLE sem override -> usa o cache já sincronizado (patient.phone)'
    );

    const responsiblePatientWithExplicitGuardianPhone = { phone: '31999990001', phoneOwner: 'RESPONSIBLE' as const };
    assert(
      getEffectivePatientPhone(responsiblePatientWithExplicitGuardianPhone, '31999990002') === '31999990002',
      'EFFECTIVE-03: RESPONSIBLE com telefone do responsável passado explicitamente (ex.: form ainda não salvo) prevalece sobre o cache desatualizado'
    );
  }

  console.log('\n🎉 TODOS OS TESTES DE RESPONSÁVEL + TELEFONE COMPARTILHADO PASSARAM!');
}

runTests();
