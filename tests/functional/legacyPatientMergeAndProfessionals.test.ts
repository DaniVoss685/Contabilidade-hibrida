// Fecha as pendências de identidade antes da fase clínica da Odonto Minas:
//  1. consolidação de paciente duplicado (canônico pelas referências, mapa legado reapontado
//     nas DUAS chaves, vínculos movidos sem duplicar, zero referência pendente, recusa quando
//     não é a mesma pessoa ou quando há dado de negócio no duplicado);
//  2. pré-resolução dos prontuários depois da consolidação (todo prontuário do cliente resolve
//     para o paciente canônico; nenhum aponta para o removido; revisão continua bloqueando);
//  3. proposta de mapeamento dos dentistas legados (só propõe; nunca confirma nem cria).
// Rodar com: npx tsx tests/functional/legacyPatientMergeAndProfessionals.test.ts

import {
  applyPatientMerge,
  chooseCanonical,
  findDanglingReferences,
  buildResolutionMaps,
  MergeSnapshot,
} from '../../src/lib/legacyPatientMerge';
import {
  buildNormalizedClient,
  buildNormalizedRecord,
  resolveRecordsToPatients,
  ClientMatchResult,
} from '../../src/lib/legacyImportMatching';
import { proposeProfessionalMapping, professionalNameTokens } from '../../src/lib/legacyProfessionalMapping';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

const MANUAL = 'pat_1790274664867_wjik';
const IMPORTED = 'pat_lgc_e94a6a00661cae07f729cc15';
const CONTACT = 'ctc_1790179763540_u7b1d';
const LEGACY_ID = '7e439fee-0000-0000-0000-000000000001';
const LEGACY_CLIENT_ID = '4242';

// Cenário real (dados sintéticos com a mesma FORMA): duas linhas de paciente, um contato
// WhatsApp compartilhado cujo primário é o importado, mapa legado apontando para o importado,
// venda real no cadastro manual.
function scenario(): MergeSnapshot {
  return {
    patients: [
      { id: MANUAL, name: 'Fulana de Tal', cpf: '52998224725', birthDate: '1985-03-02', createdAt: '2026-09-24T18:31:00Z', legacyMetadata: null },
      {
        id: IMPORTED,
        name: 'FULANA DE TAL',
        cpf: '52998224725',
        birthDate: '1985-03-02',
        createdAt: '2026-09-24T17:00:00Z',
        legacyMetadata: { legacyClientUuid: LEGACY_ID, address: { city: 'X' } },
      },
      { id: 'pat_other', name: 'Outra Pessoa', cpf: '11144477735', createdAt: '2026-01-01T00:00:00Z' },
    ],
    mapRows: [
      { entityType: 'patient', legacyId: LEGACY_ID, legacySecondaryId: LEGACY_CLIENT_ID, targetId: IMPORTED, matchKind: 'CREATED' },
      { entityType: 'patient', legacyId: 'cli-other', legacySecondaryId: '9', targetId: 'pat_other', matchKind: 'CREATED' },
    ],
    contacts: [{ id: CONTACT, patientId: IMPORTED }],
    contactLinks: [
      { contactId: CONTACT, patientId: IMPORTED, isPrimary: true },
      { contactId: CONTACT, patientId: MANUAL, isPrimary: false },
    ],
    guardianLinks: [{ guardianId: 'grd_1', patientId: IMPORTED, isPrimary: true }],
    guardians: [{ id: 'grd_self', linkedPatientId: IMPORTED }],
    businessRefs: {
      [MANUAL]: { df_sales: 1 },
      [IMPORTED]: {},
    },
  };
}

function runTests() {
  // ─── Escolha do canônico pelos fatos ─────────────────────────────────────────
  {
    const s = scenario();
    const choice = chooseCanonical(s.patients[0], s.patients[1], s.businessRefs);
    assert(choice.canonicalId === MANUAL && choice.duplicateId === IMPORTED, 'canônico = quem é dono da venda real (cadastro manual), não o importado');
    assert(/referência/.test(choice.reason), 'a escolha registra o motivo');

    const tie = chooseCanonical(s.patients[0], s.patients[1], { [MANUAL]: {}, [IMPORTED]: {} });
    assert(tie.canonicalId === IMPORTED, 'sem referências de negócio: mantém o cadastro mais antigo');
  }

  // ─── Consolidação: caminho feliz ─────────────────────────────────────────────
  {
    const s = scenario();
    const before = JSON.stringify(s);
    const { plan, result } = applyPatientMerge(s, MANUAL, IMPORTED);
    assert(plan.ok, `consolidação aceita (erros: ${plan.errors.join('; ') || 'nenhum'})`);
    assert(JSON.stringify(s) === before, 'o snapshot de entrada não é mutado (plano puro)');
    assert(!result.patients.some((p) => p.id === IMPORTED), 'duplicado removido só depois da verificação');
    assert(result.patients.some((p) => p.id === MANUAL) && result.patients.some((p) => p.id === 'pat_other'), 'canônico e demais pacientes preservados');

    // mapa legado: as duas chaves (identificador e id_cliente) resolvem para o canônico
    const { mapByPrimary, mapBySecondary } = buildResolutionMaps(result.mapRows);
    assert(mapByPrimary.get(LEGACY_ID) === MANUAL, 'mapa: identificador legado resolve para o canônico');
    assert(mapBySecondary.get(LEGACY_CLIENT_ID) === MANUAL, 'mapa: id_cliente legado resolve para o canônico');
    assert(result.mapRows.find((r) => r.legacyId === LEGACY_ID)?.matchKind === 'MERGED_MANUAL', 'mapa: match_kind registra MERGED_MANUAL');
    assert(result.mapRows.length === s.mapRows.length, 'mapa: nenhuma linha criada nem apagada (1 linha carrega as 2 chaves)');
    assert(plan.mapRepoints === 1, 'mapa: exatamente 1 linha reapontada');
    assert(result.mapRows.find((r) => r.legacyId === 'cli-other')?.targetId === 'pat_other', 'mapa de outros pacientes intacto');

    // metadados legados preservados no canônico
    assert(
      (result.patients.find((p) => p.id === MANUAL)?.legacyMetadata as any)?.legacyClientUuid === LEGACY_ID,
      'legacy_metadata do importado foi para o canônico (nada perdido)'
    );
    assert(plan.legacyMetadataAction === 'COPIED_TO_CANONICAL', 'ação sobre metadados registrada');

    // contato WhatsApp: canônico vira o primário, sem vínculo duplicado
    assert(result.contacts[0].patientId === MANUAL, 'contato WhatsApp: paciente primário passa a ser o canônico');
    const links = result.contactLinks.filter((l) => l.contactId === CONTACT);
    assert(links.length === 1 && links[0].patientId === MANUAL && links[0].isPrimary, 'contato WhatsApp: 1 vínculo, do canônico, primário (sem duplicar)');

    // responsável: vínculo movido; guardian que era o próprio paciente reapontado
    assert(result.guardianLinks.length === 1 && result.guardianLinks[0].patientId === MANUAL && result.guardianLinks[0].isPrimary, 'responsável: vínculo primário movido para o canônico');
    assert(result.guardians[0].linkedPatientId === MANUAL, 'guardian.linked_patient_id reapontado para o canônico');

    // nenhuma referência pendente
    assert(findDanglingReferences(result, IMPORTED).length === 0, 'ZERO referências pendentes ao paciente removido');
    assert(findDanglingReferences(s, IMPORTED).length > 0, 'controle: antes da consolidação existiam referências ao duplicado');
  }

  // ─── Vínculos repetidos não duplicam ─────────────────────────────────────────
  {
    const s = scenario();
    s.guardianLinks.push({ guardianId: 'grd_1', patientId: MANUAL, isPrimary: true });
    const { plan, result } = applyPatientMerge(s, MANUAL, IMPORTED);
    assert(plan.ok && result.guardianLinks.filter((l) => l.guardianId === 'grd_1').length === 1, 'responsável já vinculado ao canônico não é duplicado');
    assert(plan.guardianLinksDropped === 1 && plan.guardianLinksMoved === 0, 'vínculo repetido é descartado, não movido');
    assert(result.guardianLinks.filter((l) => l.patientId === MANUAL && l.isPrimary).length === 1, 'continua no máximo 1 responsável primário');
  }

  // ─── Metadados nos dois lados: nenhum se perde ───────────────────────────────
  {
    const s = scenario();
    s.patients[0].legacyMetadata = { legacyClientUuid: 'outro' };
    const { plan, result } = applyPatientMerge(s, MANUAL, IMPORTED);
    const meta = result.patients.find((p) => p.id === MANUAL)?.legacyMetadata as any;
    assert(plan.ok && meta.legacyClientUuid === 'outro' && meta.mergedFromDuplicate?.legacyClientUuid === LEGACY_ID, 'metadados dos dois lados preservados (canônico mantido, duplicado arquivado)');
  }

  // ─── Recusas (nunca consolida por palpite) ───────────────────────────────────
  {
    const s = scenario();
    s.patients[1].cpf = '11144477735';
    const r = applyPatientMerge(s, MANUAL, IMPORTED);
    assert(!r.plan.ok && /CPFs divergentes/.test(r.plan.errors.join(' ')), 'recusa: CPFs divergentes');
    assert(r.result === s, 'recusa: nada é alterado');
  }
  {
    const s = scenario();
    s.patients[1].name = 'CICRANA DE TAL';
    assert(!applyPatientMerge(s, MANUAL, IMPORTED).plan.ok, 'recusa: nomes divergentes');
  }
  {
    const s = scenario();
    s.patients[0].cpf = '';
    s.patients[1].cpf = '';
    const r = applyPatientMerge(s, MANUAL, IMPORTED);
    assert(!r.plan.ok && /exige CPF/.test(r.plan.errors.join(' ')), 'recusa: mesmo nome e nascimento SEM CPF não basta (nunca mescla por nome)');
  }
  {
    const s = scenario();
    s.patients[1].birthDate = '1990-01-01';
    assert(!applyPatientMerge(s, MANUAL, IMPORTED).plan.ok, 'recusa: nascimentos divergentes');
  }
  {
    const s = scenario();
    s.businessRefs[IMPORTED] = { df_sales: 1 };
    const r = applyPatientMerge(s, MANUAL, IMPORTED);
    assert(!r.plan.ok && /df_sales/.test(r.plan.errors.join(' ')), 'recusa: duplicado com venda — nada de negócio é movido, decisão humana');
  }
  {
    const s = scenario();
    s.contacts.push({ id: 'ctc_other', patientId: MANUAL });
    assert(!applyPatientMerge(s, MANUAL, IMPORTED).plan.ok, 'recusa: canônico já é primário de outro contato WhatsApp');
  }
  {
    assert(!applyPatientMerge(scenario(), MANUAL, MANUAL).plan.ok, 'recusa: mesmo registro nos dois lados');
    assert(!applyPatientMerge(scenario(), MANUAL, 'pat_inexistente').plan.ok, 'recusa: paciente inexistente');
  }

  // ─── As DUAS duplicatas reais consolidadas em sequência (manual = canônico nos dois pares) ──
  {
    const two = (): MergeSnapshot => ({
      patients: [
        { id: 'pat_1790274664867_wjik', name: 'Fulana de Tal', cpf: '52998224725', birthDate: '1985-10-12', createdAt: '2026-09-24T18:31:00Z', legacyMetadata: null },
        { id: 'pat_lgc_e94a', name: 'FULANA DE TAL', cpf: '52998224725', birthDate: '1985-10-12', createdAt: '2026-09-24T17:00:00Z', legacyMetadata: { legacyClientUuid: 'L1' } },
        { id: 'pat_1790275154063_ybhq', name: 'Beltrano da Silva', cpf: '11144477735', birthDate: '1965-10-01', createdAt: '2026-09-24T18:39:00Z', legacyMetadata: null },
        { id: 'pat_lgc_d220', name: 'BELTRANO DA SILVA', cpf: '11144477735', birthDate: '1965-10-01', createdAt: '2026-09-24T17:00:00Z', legacyMetadata: { legacyClientUuid: 'L2' } },
      ],
      mapRows: [
        { entityType: 'patient', legacyId: 'L1', legacySecondaryId: '1', targetId: 'pat_lgc_e94a', matchKind: 'CREATED' },
        { entityType: 'patient', legacyId: 'L2', legacySecondaryId: '2', targetId: 'pat_lgc_d220', matchKind: 'CREATED' },
      ],
      contacts: [{ id: 'ctc_1', patientId: 'pat_lgc_e94a' }, { id: 'ctc_2', patientId: 'pat_lgc_d220' }],
      contactLinks: [
        { contactId: 'ctc_1', patientId: 'pat_lgc_e94a', isPrimary: true }, { contactId: 'ctc_1', patientId: 'pat_1790274664867_wjik', isPrimary: false },
        { contactId: 'ctc_2', patientId: 'pat_lgc_d220', isPrimary: true }, { contactId: 'ctc_2', patientId: 'pat_1790275154063_ybhq', isPrimary: false },
      ],
      guardianLinks: [],
      guardians: [],
      businessRefs: { pat_1790274664867_wjik: { df_sales: 1 }, pat_1790275154063_ybhq: { df_sales: 1 }, pat_lgc_e94a: {}, pat_lgc_d220: {} },
    });
    const s0 = two();
    const first = applyPatientMerge(s0, 'pat_1790274664867_wjik', 'pat_lgc_e94a');
    assert(first.plan.ok, 'par 1 consolidado (manual canônico)');
    const second = applyPatientMerge(first.result, 'pat_1790275154063_ybhq', 'pat_lgc_d220');
    assert(second.plan.ok, 'par 2 consolidado sobre o resultado do par 1 (manual canônico)');
    const fin = second.result;
    assert(fin.patients.length === 2 && fin.patients.every((p) => p.id.startsWith('pat_1')), 'sobram exatamente os 2 cadastros MANUAIS (um por pessoa)');
    const maps = buildResolutionMaps(fin.mapRows);
    assert(maps.mapByPrimary.get('L1') === 'pat_1790274664867_wjik' && maps.mapBySecondary.get('1') === 'pat_1790274664867_wjik', 'legado do par 1 (identificador e id_cliente) resolve para o manual');
    assert(maps.mapByPrimary.get('L2') === 'pat_1790275154063_ybhq' && maps.mapBySecondary.get('2') === 'pat_1790275154063_ybhq', 'legado do par 2 (identificador e id_cliente) resolve para o manual');
    assert(fin.mapRows.every((r) => r.matchKind === 'MERGED_MANUAL'), 'as duas linhas do mapa marcadas MERGED_MANUAL');
    assert(findDanglingReferences(fin, 'pat_lgc_e94a').length === 0 && findDanglingReferences(fin, 'pat_lgc_d220').length === 0, 'zero referências pendentes aos dois importados removidos');
    assert(fin.contacts.every((c) => c.patientId?.startsWith('pat_1')) && fin.contactLinks.filter((l) => l.isPrimary).length === 2, 'cada contato WhatsApp tem 1 vínculo primário, do manual');
    assert(fin.businessRefs['pat_1790274664867_wjik'].df_sales === 1 && fin.businessRefs['pat_1790275154063_ybhq'].df_sales === 1, 'as vendas dos manuais não são tocadas');
  }

  // ─── Pré-resolução dos prontuários (nenhum é importado) ──────────────────────
  {
    const client = (legacyId: string, clientId: string, name: string) =>
      buildNormalizedClient({ identificador: legacyId, id_cliente: clientId, nome_completo: name }, 'legacy_test');
    const clientMatches = new Map<string, ClientMatchResult>([
      [LEGACY_ID, { row: client(LEGACY_ID, LEGACY_CLIENT_ID, 'Fulana de Tal'), status: 'VINCULAR', reason: 'mapa' }],
      ['cli-other', { row: client('cli-other', '9', 'Outra Pessoa'), status: 'VINCULAR', reason: 'mapa' }],
      ['cli-review', { row: client('cli-review', '11', 'Em Revisao'), status: 'REVISAR', reason: 'CPF duplicado', reviewCategory: 'CPF_DUPLICADO' as any }],
    ]);
    const rec = (id: string, cli: string, cid: string) =>
      buildNormalizedRecord({
        identificador_prontuario: id,
        identificador_cliente: cli,
        id_cliente: cid,
        dentista: 'DRA AMANDA FERRAZ',
        status: 'Finalizado',
        data_abertura: '05/11/2024 15:50:00',
        data_realizacao: '05/11/2024 15:51:00',
      });
    const records = [
      rec('r1', LEGACY_ID, LEGACY_CLIENT_ID),
      rec('r2', LEGACY_ID, LEGACY_CLIENT_ID),
      rec('r3', 'cli-other', '9'),
      rec('r4', 'cli-review', '11'),
      rec('r5', 'cli-fantasma', '999'),
    ];

    const s = scenario();
    const beforeMaps = buildResolutionMaps(s.mapRows);
    const before = resolveRecordsToPatients(records, clientMatches, beforeMaps.mapByPrimary, beforeMaps.mapBySecondary);
    assert(before.filter((r) => r.patientId === IMPORTED).length === 2, 'controle: SEM consolidar, os prontuários do cliente cairiam no paciente ERRADO (o importado)');

    const { result } = applyPatientMerge(s, MANUAL, IMPORTED);
    const afterMaps = buildResolutionMaps(result.mapRows);
    const after = resolveRecordsToPatients(records, clientMatches, afterMaps.mapByPrimary, afterMaps.mapBySecondary);
    const byId = (id: string) => after.find((r) => r.record.legacyId === id)!;
    assert(byId('r1').resolution === 'RESOLVED' && byId('r1').patientId === MANUAL && byId('r2').patientId === MANUAL, 'depois de consolidar: prontuários do cliente resolvem para o paciente canônico');
    assert(byId('r3').patientId === 'pat_other', 'prontuários de outros clientes não mudam de paciente');
    assert(byId('r4').resolution === 'BLOCKED_BY_PATIENT_REVIEW' && !byId('r4').patientId, 'prontuário de cliente em revisão continua BLOQUEADO (sem paciente)');
    assert(byId('r5').resolution === 'ORPHAN', 'prontuário sem cliente continua órfão');
    assert(!after.some((r) => r.patientId === IMPORTED), 'nenhum prontuário resolve para o paciente removido');
    assert(after.filter((r) => r.resolution === 'DIVERGENCE').length === 0, 'zero divergências entre identificador e id_cliente após a consolidação');
  }

  // ─── Dentistas legados: só propõe ────────────────────────────────────────────
  {
    const legacy = [
      { name: 'CAROLINE', count: 10 },
      { name: 'DR. FABIANO BALDISSERA', count: 20 },
      { name: 'DR. JOÃO', count: 30 },
      { name: 'DRA AMANDA FERRAZ', count: 40 },
      { name: 'DRA. JOYCE FELIX', count: 50 },
      { name: 'REJAINE OLIVEIRA DA SILVA', count: 60 },
    ];
    const profs = [{ id: 'prof_clinic_1790017750_be6b', name: 'Amanda Ferraz Dantas' }];
    const out = proposeProfessionalMapping(legacy, profs);
    const by = (n: string) => out.find((o) => o.legacyName === n)!;

    assert(by('DRA AMANDA FERRAZ').candidate?.id === 'prof_clinic_1790017750_be6b', 'Amanda: candidata proposta (Amanda Ferraz Dantas)');
    assert(by('DRA AMANDA FERRAZ').confidence === 'MEDIA', 'Amanda: confiança MÉDIA (nome legado contido, falta o sobrenome)');
    assert(out.filter((o) => o.candidate).length === 1, 'só a Amanda recebe candidata; os outros 5 seguem com nome legado');
    assert(out.filter((o) => o.candidate === null).every((o) => o.fallback === 'KEEP_LEGACY_NAME'), 'sem candidata: nome legado preservado');
    assert(out.every((o) => o.confirmed === false), 'NENHUMA proposta é confirmada automaticamente');
    assert(out.reduce((a, o) => a + o.recordCount, 0) === 210, 'contagem de prontuários por dentista preservada na proposta');

    const exact = proposeProfessionalMapping([{ name: 'DRA. AMANDA FERRAZ DANTAS' }], profs)[0];
    assert(exact.confidence === 'ALTA' && exact.confirmed === false, 'nome igual (ignorando título): ALTA, ainda sem confirmar');

    const ambiguous = proposeProfessionalMapping(
      [{ name: 'DRA AMANDA FERRAZ' }],
      [
        { id: 'a', name: 'Amanda Ferraz Dantas' },
        { id: 'b', name: 'Amanda Ferraz Lima' },
      ]
    )[0];
    assert(ambiguous.candidate === null && ambiguous.confidence === 'NENHUMA', 'dois candidatos compatíveis: não propõe (decisão humana)');

    const single = proposeProfessionalMapping([{ name: 'CAROLINE' }], [{ id: 'c', name: 'Caroline Souza' }])[0];
    assert(single.candidate === null, 'uma palavra em comum não basta para propor');

    assert(professionalNameTokens('DR. JOÃO').join(' ') === 'JOAO', 'título e acento ignorados na normalização');
  }
}

runTests();
console.log(`\n${passed} verificações passaram.`);
