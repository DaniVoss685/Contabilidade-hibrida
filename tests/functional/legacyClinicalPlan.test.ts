// Preparação da importação CLÍNICA: elegibilidade por linha (NÃO tudo-ou-nada), chave de idempotência,
// estrutura de cada registro, status histórico, profissional e ZERO efeito financeiro.
// Nada é gravado (funções puras). Rodar com: npx tsx tests/functional/legacyClinicalPlan.test.ts

import { buildNormalizedClient, buildNormalizedRecord, classifyPatientRows, applyReviewImportPolicy, resolveRecordsToPatients } from '../../src/lib/legacyImportMatching';
import {
  planClinicalCommit,
  buildClinicalCommitRow,
  buildClinicalCommitRows,
  legacyProfessionalKey,
  payloadHasFinancialKeys,
  HISTORICAL_STATUS_MAP,
} from '../../src/lib/legacyClinicalPlan';
import { buildProfessionalMappingFromConfirmed } from '../../src/lib/legacyProfessionalMapping';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

const client = (n: number, over: Record<string, any> = {}) =>
  buildNormalizedClient({ identificador: `u${n}`, id_cliente: String(n), nome_completo: `Paciente ${n}`, ...over }, 'legacy_test');

let seq = 0;
const rec = (cli: number, over: Record<string, any> = {}) => {
  seq++;
  return buildNormalizedRecord({
    identificador_prontuario: `rec-${seq}`,
    identificador_cliente: `u${cli}`,
    id_cliente: String(cli),
    dentista: 'DRA AMANDA FERRAZ',
    codigo_tuss: '85100196',
    descricao: 'RESTAURACAO EM RESINA',
    procedimentos: '',
    dente_regiao: '22',
    face: 'P',
    data_abertura: '05/11/2024 15:50:00',
    data_realizacao: '05/11/2024 15:51:00',
    status: 'Finalizado',
    identificador_guia: 'g1',
    id_guia: '1',
    id_item_guia: '77', // repetido entre linhas de propósito: NÃO é chave
    ...over,
  });
};

function scenario() {
  const clients = [client(1, { cpf: '' }), client(2, { cpf: '', data_nascimento: '15/03/1801' }), client(3), client(4)];
  const results = applyReviewImportPolicy(classifyPatientRows(clients, [], new Map()), []);
  const byLegacy = new Map(results.map((r) => [r.row.legacyId, r]));
  // u1 e u2 têm patient_id (u2 é provisório); u3 NÃO tem mapa; u4 tem mapa divergente entre as duas chaves.
  const byPrimary = new Map([['u1', 'pat_1'], ['u2', 'pat_2'], ['u4', 'pat_4']]);
  const bySecondary = new Map([['1', 'pat_1'], ['2', 'pat_2'], ['4', 'pat_OUTRO']]);
  return { byLegacy, byPrimary, bySecondary };
}

// ─── Elegibilidade por linha — não é tudo-ou-nada ────────────────────────────────────
{
  const { byLegacy, byPrimary, bySecondary } = scenario();
  const records = [
    rec(1), rec(1, { status: 'Em Execução', data_realizacao: '' }), rec(2),
    rec(1, { data_abertura: '12/05/4021 15:17:00', data_realizacao: '12/05/4021 00:00:00' }), // data 4021
    rec(3),                                                       // sem patient_id
    rec(4),                                                       // conflito de identidade (mapa divergente)
    rec(1, { identificador_cliente: 'u999', id_cliente: '999' }), // órfão
    rec(1, { status: 'Cancelado' }),                              // status desconhecido
  ];
  const res = resolveRecordsToPatients(records, byLegacy, byPrimary, bySecondary);
  const plan = planClinicalCommit(res);
  assert(plan.total === 8 && plan.allOrNothing === false, 'plano por linha, sem regra all-or-nothing');
  assert(plan.counts.ELIGIBLE === 3, '3 elegíveis (Finalizado, Em Execução e o do paciente provisório)');
  assert(plan.counts.REVIEW_INVALID_RECORD_DATE === 1, 'a data 12/05/4021 vira REVIEW_INVALID_RECORD_DATE');
  assert(plan.counts.PATIENT_ID_MISSING === 1 && plan.counts.IDENTITY_CONFLICT === 1 && plan.counts.ORPHAN === 1, 'sem patient_id, conflito de identidade e órfão são classificados separadamente');
  assert(plan.counts.REVIEW_INVALID_RECORD_STATUS === 1, 'status legado desconhecido vai para revisão (não é inventado)');
  assert(plan.eligible.every((i) => Boolean(i.patientId)), 'todo elegível tem patient_id');
  const invalid = plan.quarantined.find((q) => q.eligibility === 'REVIEW_INVALID_RECORD_DATE')!;
  assert(invalid.recordDate === undefined && /4021/.test(invalid.reason) && !/2021/.test(invalid.reason), 'a data 4021 NÃO é corrigida para 2021 (nem sugerida no plano)');
  assert(buildClinicalCommitRow(invalid) === null, 'registro em quarentena nunca gera linha de commit');
  const rows = buildClinicalCommitRows(plan, {});
  assert(rows.length === 3, 'as linhas elegíveis geram commit MESMO com registros em quarentena no arquivo');
}

// ─── Escala real: 9.004 linhas -> 9.003 elegíveis + 1 em revisão ─────────────────────
{
  const clients = Array.from({ length: 50 }, (_, i) => client(i + 1));
  const results = applyReviewImportPolicy(classifyPatientRows(clients, [], new Map()), []);
  const byLegacy = new Map(results.map((r) => [r.row.legacyId, r]));
  const byPrimary = new Map(clients.map((c) => [c.legacyId, `pat_${c.legacyClientId}`]));
  const bySecondary = new Map(clients.map((c) => [c.legacyClientId, `pat_${c.legacyClientId}`]));
  seq = 100000;
  const records = Array.from({ length: 9004 }, (_, i) =>
    i === 4021
      ? rec((i % 50) + 1, { data_abertura: '12/05/4021 15:17:00', data_realizacao: '12/05/4021 00:00:00', identificador_prontuario: '24e8168e-bb37-498b-a174-ca6c9a8ca69d' })
      : rec((i % 50) + 1, { status: i % 250 === 0 ? 'Em Execução' : 'Finalizado' })
  );
  const res = resolveRecordsToPatients(records, byLegacy, byPrimary, bySecondary);
  const plan = planClinicalCommit(res);
  assert(plan.total === 9004 && plan.eligible.length === 9003, 'TOTAL 9004 -> 9003 ELEGÍVEIS');
  assert(plan.counts.REVIEW_INVALID_RECORD_DATE === 1 && plan.quarantined.length === 1, 'exatamente 1 em REVIEW_INVALID_RECORD_DATE (quarentena)');
  assert(plan.counts.ORPHAN === 0 && plan.counts.PATIENT_ID_MISSING === 0 && plan.counts.IDENTITY_CONFLICT === 0, 'órfãos 0, sem patient_id 0, conflito de identidade 0');
  assert(new Set(plan.eligible.map((i) => i.legacyId)).size === 9003, 'identificador_prontuario único em todas as elegíveis');

  // idempotência: depois de "importar" as 9.003, uma segunda execução não recria nada
  const already = new Set(plan.eligible.map((i) => i.legacyId));
  const again = planClinicalCommit(res, already);
  assert(again.eligible.length === 0 && again.counts.ALREADY_IMPORTED === 9003, 'segunda execução: 0 elegíveis, 9003 já importadas (não duplica procedimento)');
  assert(again.counts.REVIEW_INVALID_RECORD_DATE === 1, 'a linha 4021 continua em quarentena na segunda execução');
}

// ─── Chave de idempotência ───────────────────────────────────────────────────────────
{
  const { byLegacy, byPrimary, bySecondary } = scenario();
  const a = rec(1, { identificador_prontuario: 'same-id' });
  const b = rec(1, { identificador_prontuario: 'same-id' });
  const c = rec(1, { identificador_prontuario: '' });
  const plan = planClinicalCommit(resolveRecordsToPatients([a, b, c], byLegacy, byPrimary, bySecondary));
  assert(plan.counts.ELIGIBLE === 1 && plan.counts.DUPLICATE_LEGACY_ID === 1 && plan.counts.INVALID_LEGACY_ID === 1, 'legacy_id repetido/ausente não gera registro duplicado');
  const r1 = rec(1, { id_item_guia: '77' });
  const r2 = rec(1, { id_item_guia: '77' });
  const p2 = planClinicalCommit(resolveRecordsToPatients([r1, r2], byLegacy, byPrimary, bySecondary));
  assert(p2.counts.ELIGIBLE === 2, 'id_item_guia repetido NÃO derruba nem deduplica registros (não é chave)');
  const row = buildClinicalCommitRow(p2.eligible[0])!;
  assert(row.legacy_id === r1.legacyId && row.checksum === r1.legacyId, 'a chave é o identificador_prontuario');
  assert((row.record.import_metadata as any).idItemGuia === '77', 'id_item_guia fica só como contexto em import_metadata');
}

// ─── Status histórico ────────────────────────────────────────────────────────────────
{
  const { byLegacy, byPrimary, bySecondary } = scenario();
  const plan = planClinicalCommit(resolveRecordsToPatients([rec(1), rec(1, { status: 'Em Execução', data_realizacao: '' })], byLegacy, byPrimary, bySecondary));
  const [fin, exec] = buildClinicalCommitRows(plan, {});
  assert(fin.record.legacy_status === 'Finalizado' && exec.record.legacy_status === 'Em Execução', 'status legado original preservado (Finalizado / Em Execução)');
  assert(fin.record.status === 'FINALIZED' && exec.record.status === 'FINALIZED', 'status técnico sempre FINALIZED — nenhum vira rascunho (DRAFT) editável/excluível');
  assert(HISTORICAL_STATUS_MAP['Em Execução'].label === 'Em Execução (legado)', 'a UI exibe "Em Execução (legado)", não "Finalizado"');
  assert(!JSON.stringify([fin, exec]).includes('DRAFT'), 'nenhum sinal de DRAFT no payload');
  assert(exec.record.record_date === '2024-11-05', 'Em Execução usa data_abertura como data do registro');
}

// ─── Estrutura clínica de cada linha ─────────────────────────────────────────────────
{
  const { byLegacy, byPrimary, bySecondary } = scenario();
  const plan = planClinicalCommit(resolveRecordsToPatients([rec(1, { procedimentos: 'RESTAURACAO EM RESINA FOTOPOLIMERIZAVEL - 1 FACE' }), rec(1, { descricao: 'RADIOGRAFIA PERIAPICAL', codigo_tuss: '', dente_regiao: '', face: '' })], byLegacy, byPrimary, bySecondary));
  const [a, b] = buildClinicalCommitRows(plan, {});
  assert(a.record.record_type === 'PROCEDIMENTO' && a.record.origin === 'IMPORT', 'cada linha é um registro clínico estruturado PROCEDIMENTO / origem IMPORT');
  assert(a.record.tooth_number === '22' && a.record.tooth_face === 'P' && a.record.legacy_tuss_code === '85100196', 'dente, face e TUSS preservados em colunas próprias');
  assert(a.record.record_date === '2024-11-05' && a.patient_id === 'pat_1', 'data e patient_id resolvido');
  assert(a.record.procedure_name === 'RESTAURACAO EM RESINA' && a.record.legacy_procedure_name === 'RESTAURACAO EM RESINA', 'procedimento preservado');
  assert(b.record.tooth_number === undefined && b.record.legacy_tuss_code === undefined, 'campo ausente fica vazio (nada é inventado)');
  assert(a.legacy_id !== b.legacy_id && a.record.evolution !== b.record.evolution, '2 linhas = 2 registros distintos (nunca um texto único concatenado)');
}

// ─── Profissional ────────────────────────────────────────────────────────────────────
{
  const { byLegacy, byPrimary, bySecondary } = scenario();
  const legacy = ['DRA AMANDA FERRAZ', 'CAROLINE', 'DR. JOÃO'];
  const profs = [{ id: 'prof_clinic_1790017750_be6b', name: 'Amanda Ferraz Dantas' }];
  const mapping = buildProfessionalMappingFromConfirmed(legacy, [{ legacyName: 'DRA AMANDA FERRAZ', professionalId: profs[0].id }], profs);
  const plan = planClinicalCommit(resolveRecordsToPatients([rec(1), rec(1, { dentista: 'CAROLINE' }), rec(1, { dentista: 'DR. JOÃO' })], byLegacy, byPrimary, bySecondary));
  const [amanda, caroline, joao] = buildClinicalCommitRows(plan, mapping);
  assert(amanda.record.professional_id === profs[0].id && amanda.record.professional_name === 'Amanda Ferraz Dantas', 'Amanda → profissional canônico Amanda Ferraz Dantas');
  assert(amanda.record.legacy_dentist_name === 'DRA AMANDA FERRAZ' && (amanda.record.import_metadata as any).legacyProfessionalName === 'DRA AMANDA FERRAZ', 'nome histórico "DRA AMANDA FERRAZ" preservado mesmo mapeado');
  assert((amanda.record.import_metadata as any).professionalMapping === 'USER_CONFIRMED', 'origem do vínculo registrada: USER_CONFIRMED');
  assert(caroline.record.professional_name === 'CAROLINE' && joao.record.professional_name === 'DR. JOÃO', 'demais dentistas continuam com o nome histórico');
  assert(caroline.record.professional_id === 'legacy_dentist:caroline' && joao.record.professional_id === 'legacy_dentist:dr_joao', 'sem mapeamento: só uma CHAVE de agrupamento legacy_dentist:<nome> (professional_id é NOT NULL)');
  assert(legacyProfessionalKey('DRA. JOYCE FELIX') === 'legacy_dentist:dra_joyce_felix' && legacyProfessionalKey('DR. JOÃO') === legacyProfessionalKey('dr. joao'), 'a chave é estável (sem acento/pontuação)');
  assert((caroline.record.import_metadata as any).professionalMapping === 'LEGACY_NAME_PRESERVED', 'registro indica que o nome legado foi preservado (sem mapeamento)');
}

// ─── ZERO efeito financeiro ──────────────────────────────────────────────────────────
{
  const { byLegacy, byPrimary, bySecondary } = scenario();
  // mesmo que o arquivo trouxesse colunas de valor, o payload nunca as carrega
  const r = rec(1, { valor: '150,00', preco: '150', total: '150', forma_pagamento: 'PIX' });
  const plan = planClinicalCommit(resolveRecordsToPatients([r], byLegacy, byPrimary, bySecondary));
  const [row] = buildClinicalCommitRows(plan, {});
  assert(payloadHasFinancialKeys(row as any).length === 0, 'payload sem venda/valor/recebível/pagamento/comissão/imposto/banco/agenda');
  assert(!JSON.stringify(row).includes('150'), 'valores presentes no arquivo não vazam para o registro clínico');
  assert(payloadHasFinancialKeys({ record: { sale_id: 'x', nested: { total_value: 1 } } }).length === 2, 'o detector de chaves financeiras funciona (controle positivo)');
  const allowed = new Set(['professional_id', 'professional_name', 'legacy_dentist_name', 'record_type', 'origin', 'status', 'legacy_status', 'record_date', 'procedure_id', 'procedure_name', 'legacy_procedure_name', 'legacy_tuss_code', 'evolution', 'tooth_number', 'tooth_face', 'finalized_by', 'import_metadata']);
  assert(Object.keys(row.record).every((k) => allowed.has(k)), 'o registro só tem colunas clínicas da allowlist (df_clinical_records não tem trigger financeiro)');
}

console.log(`\n${passed} verificações passaram.`);
