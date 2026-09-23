// Testa o histórico de procedimentos (Prontuarios.xls): vínculo com o
// paciente via identificador_cliente/id_cliente, prontuário órfão, status
// Finalizado/Em Execução, TUSS/dente/face, ano implausível (4021) e a garantia
// central: NENHUM registro legado pode ser tratado como rascunho operacional
// atual (DRAFT), mesmo quando o status original era "Em Execução".
// Rodar com: npx tsx tests/functional/legacyImportProntuarios.test.ts

import {
  buildNormalizedClient,
  buildNormalizedRecord,
  classifyPatientRows,
  classifyRecordRows,
  ClientMatchResult,
} from '../../src/lib/legacyImportMatching';
import { LegacyCellValue } from '../../src/lib/legacyImportParsers';
import { buildRecordCommitRow } from '../../src/lib/legacyImportService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function record(overrides: Partial<Record<string, LegacyCellValue>>) {
  return buildNormalizedRecord({
    identificador_prontuario: `rec-${Math.random().toString(36).slice(2, 8)}`,
    identificador_cliente: 'cli-1',
    id_cliente: '1',
    dentista: 'DRA. JOYCE FELIX',
    codigo_tuss: '85100196',
    descricao: 'RESTAURACAO EM RESINA FOTOPOLIMERIZAVEL - 1 FACE',
    dente_regiao: '22',
    face: 'P',
    data_abertura: '05/11/2024 15:50:00',
    data_realizacao: '05/11/2024 15:51:00',
    status: 'Finalizado',
    ...overrides,
  });
}

function makeClientMatch(legacyId: string, status: ClientMatchResult['status'] = 'NOVO'): Map<string, ClientMatchResult> {
  const client = buildNormalizedClient({ identificador: legacyId, id_cliente: '1', nome_completo: 'Paciente Teste' }, 'legacy_test');
  return new Map([[legacyId, { row: client, status, reason: 'teste' }]]);
}

function runTests() {
  // PRONT-01: vínculo por identificador_cliente encontra o cliente correspondente
  {
    const r = record({ identificador_cliente: 'cli-1' });
    const clientMap = makeClientMatch('cli-1', 'NOVO');
    const [result] = classifyRecordRows([r], clientMap, new Set());
    assert(result.status === 'NOVO', 'PRONT-01: prontuário vinculado a cliente NOVO válido resulta em NOVO (pronto para importar)');
  }

  // PRONT-02: prontuário órfão (identificador_cliente sem cliente correspondente em Clientes.xls) -> INVALIDO
  {
    const r = record({ identificador_cliente: 'cli-inexistente' });
    const [result] = classifyRecordRows([r], new Map(), new Set());
    assert(result.status === 'INVALIDO', 'PRONT-02: prontuário órfão (sem cliente correspondente) marcado como INVALIDO');
    assert(result.reason.toLowerCase().includes('órfão'), 'PRONT-02b: motivo explica que o prontuário está órfão');
  }

  // PRONT-03: já importado anteriormente (idempotência) -> VINCULAR, não duplica
  {
    const r = record({ identificador_prontuario: 'rec-already' });
    const clientMap = makeClientMatch(r.patientLegacyId, 'NOVO');
    const [result] = classifyRecordRows([r], clientMap, new Set(['rec-already']));
    assert(result.status === 'VINCULAR', 'PRONT-03: identificador_prontuario já em df_legacy_import_map -> VINCULAR (idempotência)');
  }

  // PRONT-04: status "Finalizado" usa data_realizacao como data clínica, preservando data_abertura
  {
    const r = record({ status: 'Finalizado', data_abertura: '01/01/2024 10:00:00', data_realizacao: '05/01/2024 14:00:00' });
    const clientMap = makeClientMatch(r.patientLegacyId, 'NOVO');
    const [result] = classifyRecordRows([r], clientMap, new Set());
    assert(result.status === 'NOVO', 'PRONT-04a: Finalizado com ambas as datas -> NOVO');
    assert(result.recordDate === '2024-01-05', `PRONT-04b: data clínica é data_realizacao, obtido "${result.recordDate}"`);
  }

  // PRONT-05: status "Em Execução" (36 registros reais, sem data_realizacao) usa data_abertura como referência
  {
    const r = record({ status: 'Em Execução', data_abertura: '20/11/2023 08:30:49', data_realizacao: '' });
    const clientMap = makeClientMatch(r.patientLegacyId, 'NOVO');
    const [result] = classifyRecordRows([r], clientMap, new Set());
    assert(result.status === 'NOVO', 'PRONT-05a: Em Execução com data_abertura -> NOVO (histórico pendente/legado)');
    assert(result.recordDate === '2023-11-20', `PRONT-05b: data clínica é data_abertura, obtido "${result.recordDate}"`);
  }

  // PRONT-06: GARANTIA CENTRAL — "Em Execução" nunca vira DRAFT ao montar o payload de commit.
  // status técnico é sempre FINALIZED; legacy_status preserva o valor original para a UI exibir
  // "Em Execução (legado)" em vez de "Finalizado", sem reabrir como rascunho editável/excluível.
  {
    const r = record({ status: 'Em Execução', data_abertura: '20/11/2023 08:30:49', data_realizacao: '' });
    const clientMap = makeClientMatch(r.patientLegacyId, 'NOVO');
    const [matchResult] = classifyRecordRows([r], clientMap, new Set());
    const commitRow = buildRecordCommitRow(matchResult, {}, {}, 'pat_target_123');
    assert(commitRow !== null, 'PRONT-06a: linha NOVO gera payload de commit');
    assert(commitRow!.record.legacy_status === 'Em Execução', 'PRONT-06b: legacy_status preserva o status original "Em Execução"');
    // O payload de commit NUNCA inclui a palavra "DRAFT" — o status técnico é
    // decidido pela Edge Function (sempre FINALIZED), não pelo cliente; aqui
    // garantimos que o payload não carrega nenhum sinal de rascunho.
    assert(JSON.stringify(commitRow!.record).includes('DRAFT') === false, 'PRONT-06c: payload de commit não contém "DRAFT" em nenhum campo');
  }

  // PRONT-07: data ano 4021 (1 registro real confirmado) -> REVIEW_REQUIRED, não importado automaticamente
  {
    const r = record({ data_abertura: '12/05/4021 15:17:00', data_realizacao: '12/05/4021 00:00:00', status: 'Finalizado' });
    const clientMap = makeClientMatch(r.patientLegacyId, 'NOVO');
    const [result] = classifyRecordRows([r], clientMap, new Set());
    assert(result.status === 'REVISAR', 'PRONT-07: data com ano implausível (4021) marca REVISAR, não é importada automaticamente');
  }

  // PRONT-08: dente, face, TUSS e dentista legado preservados sem perda
  {
    const r = record({ dente_regiao: '46', face: 'O', codigo_tuss: '82000980', dentista: 'DRA. JOYCE FELIX' });
    const clientMap = makeClientMatch(r.patientLegacyId, 'NOVO');
    const [matchResult] = classifyRecordRows([r], clientMap, new Set());
    const commitRow = buildRecordCommitRow(matchResult, {}, {}, 'pat_target_123');
    assert(commitRow!.record.tooth_number === '46', 'PRONT-08a: dente_regiao preservado em tooth_number');
    assert(commitRow!.record.tooth_face === 'O', 'PRONT-08b: face preservada em tooth_face');
    assert(commitRow!.record.legacy_tuss_code === '82000980', 'PRONT-08c: código TUSS preservado');
    assert(commitRow!.record.legacy_dentist_name === 'DRA. JOYCE FELIX', 'PRONT-08d: dentista legado preservado');
  }

  // PRONT-09: mapeamento de dentista legado para profissional atual reflete em professional_id/professional_name
  {
    const r = record({ dentista: 'DRA. JOYCE FELIX' });
    const clientMap = makeClientMatch(r.patientLegacyId, 'NOVO');
    const [matchResult] = classifyRecordRows([r], clientMap, new Set());
    const mapping = { 'DRA. JOYCE FELIX': { keepLegacy: false, professionalId: 'prof_1', displayName: 'Dr. João Atual' } };
    const commitRow = buildRecordCommitRow(matchResult, mapping, {}, 'pat_target_123');
    assert(commitRow!.record.professional_id === 'prof_1', 'PRONT-09a: profissional atual mapeado corretamente');
    assert(commitRow!.record.professional_name === 'Dr. João Atual', 'PRONT-09b: nome de exibição usa o profissional atual mapeado');
    assert(commitRow!.record.legacy_dentist_name === 'DRA. JOYCE FELIX', 'PRONT-09c: nome do dentista legado original continua preservado mesmo quando mapeado');
  }

  // PRONT-10: paciente correspondente está em conflito/revisão -> prontuário também exige revisão (não importa sozinho)
  {
    const r = record({});
    const clientMap = makeClientMatch(r.patientLegacyId, 'CONFLITO');
    const [result] = classifyRecordRows([r], clientMap, new Set());
    assert(result.status === 'REVISAR', 'PRONT-10: paciente em conflito -> prontuário também cai em REVISAR');
  }

  console.log('\n🎉 legacyImportProntuarios: todos os critérios passaram.');
}

runTests();
