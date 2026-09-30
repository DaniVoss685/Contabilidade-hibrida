// Migração Odonto Minas — regras da fase de commit de pacientes:
// classificação de telefone (placeholder nunca vira telefone/contato),
// responsáveis (reaproveitamento por CPF / nome+telefone, nunca por nome ou
// telefone sozinhos), phone_owner, segurança do vínculo com paciente
// existente e resolução prontuário -> paciente pelo mapa legado.
// Rodar com: npx tsx tests/functional/legacyImportGuardiansAndPhones.test.ts

import { classifyBrazilianPhone } from '../../src/lib/phoneUtils';
import {
  buildNormalizedClient,
  buildNormalizedRecord,
  classifyPatientRows,
  planGuardians,
  resolveRecordsToPatients,
  ClientMatchResult,
} from '../../src/lib/legacyImportMatching';
import { buildPatientCommitRow } from '../../src/lib/legacyImportService';
import { LegacyCellValue } from '../../src/lib/legacyImportParsers';
import { Patient } from '../../src/types';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

let seq = 0;
function client(overrides: Partial<Record<string, LegacyCellValue>>) {
  seq++;
  return buildNormalizedClient(
    {
      identificador: `uuid-${seq}`,
      id_cliente: String(seq),
      nome_completo: `Paciente ${seq}`,
      cpf: '',
      data_nascimento: '',
      telefone1: '',
      ...overrides,
    },
    'legacy_test'
  );
}

const patient = (o: Partial<Patient>): Patient => ({ id: `pat_${++seq}`, orgId: 'org', name: 'X', cpf: '', createdAt: '', ...o });

// ---------------------------------------------------------------- telefones
{
  assert(classifyBrazilianPhone('(34)99874-3774').classification === 'VALID', 'TEL-V1: celular com 9 dígitos é VALID');
  assert(classifyBrazilianPhone('(34)99874-3774').normalized === '34998743774', 'TEL-V2: normalizado sem DDI');
  assert(classifyBrazilianPhone('(34) 8874-3774').normalized === '34988743774', 'TEL-V3: celular antigo de 8 dígitos ganha o 9');
  assert(classifyBrazilianPhone('(34) 3212-3456').normalized === '3432123456', 'TEL-V4: fixo mantém 8 dígitos');
  assert(classifyBrazilianPhone('+55 34 99874-3774').normalized === '34998743774', 'TEL-V5: DDI 55 removido');
  assert(classifyBrazilianPhone('99999999999').classification === 'PLACEHOLDER', 'TEL-P1: 99999999999 é PLACEHOLDER');
  assert(classifyBrazilianPhone('(34) 99999-9999').classification === 'PLACEHOLDER', 'TEL-P2: número local repetido é PLACEHOLDER');
  assert(classifyBrazilianPhone('(34) 2345-6789').classification === 'PLACEHOLDER', 'TEL-P3: sequência consecutiva é PLACEHOLDER');
  assert(classifyBrazilianPhone('').classification === 'BLANK', 'TEL-B1: vazio é BLANK');
  assert(classifyBrazilianPhone('998743774').classification === 'INVALID', 'TEL-I1: sem DDD é INVALID');
  assert(classifyBrazilianPhone('(20) 99874-3774').classification === 'INVALID', 'TEL-I2: DDD inexistente é INVALID');
  assert(classifyBrazilianPhone('(34) 1234-5678').classification !== 'VALID', 'TEL-I3: prefixo local impossível não é VALID');
}

// ---------------------------------------------------------------- placeholder no payload
{
  const c = client({ telefone1: '99999999999', cpf: '' });
  assert(c.phone === '', 'PH-1: placeholder não vira telefone do paciente');
  assert(c.legacyMetadata.rawPhoneOriginal === '99999999999', 'PH-2: valor original preservado só em metadata');
  assert((c.legacyMetadata.reviewFlags || []).includes('TELEFONE_PLACEHOLDER'), 'PH-3: flag de placeholder registrada');
  const [res] = classifyPatientRows([c], [], new Map());
  const plan = planGuardians([res], []);
  const row = buildPatientCommitRow(res, plan)!;
  assert(row.action === 'CREATE' && row.patient.own_phone === '', 'PH-4: payload de commit leva telefone vazio, nunca o placeholder');
  assert(!JSON.stringify(row.patient).includes('"99999999999"') || row.patient.legacy_metadata.rawPhoneOriginal === '99999999999', 'PH-5: placeholder só aparece dentro de legacy_metadata');
}
{
  const c = client({ telefone1: '(34) 99874-3774', nome_responsavel: 'Maria Souza', telefone1_responsavel: '99999999999' });
  assert(c.guardian?.phone.classification === 'PLACEHOLDER', 'PH-6: telefone placeholder do responsável classificado');
  const [res] = classifyPatientRows([c], [], new Map());
  const plan = planGuardians([res], []);
  const row = buildPatientCommitRow(res, plan)!;
  assert(row.guardian?.phone === '', 'PH-7: responsável não recebe telefone placeholder');
  assert(row.patient.phone_owner === 'PATIENT', 'PH-8: sem telefone válido do responsável o telefone continua do paciente');
}

// ---------------------------------------------------------------- responsáveis
{
  // Maria (CPF) mãe de João e Ana; o registro da Ana não tem o CPF da mãe mas tem nome+telefone iguais.
  const mom = { nome_responsavel: 'MARIA DA SILVA', telefone1_responsavel: '(34) 99874-3774', grau_parentesco: 'MÃE' };
  const joao = client({ ...mom, nome_completo: 'JOAO DA SILVA', cpf_responsavel: '111.444.777-35', telefone1: '(34) 99874-3774' });
  const ana = client({ ...mom, nome_completo: 'ANA DA SILVA', telefone1: '' });
  const pedro = client({ nome_completo: 'PEDRO LIMA', telefone1: '(34) 99111-2233', nome_responsavel: 'CARLOS LIMA', telefone1_responsavel: '(34) 99555-6677' });
  const results = classifyPatientRows([joao, ana, pedro], [], new Map());
  const plan = planGuardians(results, []);
  const momCluster = plan.clusters.find((c) => c.clusterKey === 'cpf:11144477735');
  assert(Boolean(momCluster) && momCluster!.memberLegacyIds.length === 2, 'GRD-1: irmãos compartilham 1 responsável (CPF + nome/telefone) — nunca "Maria #1 / Maria #2"');
  assert(plan.clusters.length === 2, 'GRD-2: 2 responsáveis distintos (Maria e Carlos)');
  assert(plan.phoneOwnerByLegacyId.get(joao.legacyId)?.phoneOwner === 'RESPONSIBLE', 'GRD-3: telefone do paciente igual ao do responsável -> RESPONSIBLE');
  assert(plan.phoneOwnerByLegacyId.get(ana.legacyId)?.basis === 'SEM_TELEFONE_PROPRIO_USA_RESPONSAVEL', 'GRD-4: sem telefone próprio usa o do responsável (não inventa número)');
  assert(plan.phoneOwnerByLegacyId.get(pedro.legacyId)?.phoneOwner === 'PATIENT', 'GRD-5: telefone próprio diferente do responsável -> PATIENT');
  const rowAna = buildPatientCommitRow(results[1], plan)!;
  assert(rowAna.guardian?.cluster_key === 'cpf:11144477735' && rowAna.guardian?.relationship_type === 'MÃE', 'GRD-6: payload leva a chave do responsável e o parentesco');
}
{
  // Mesmo nome de responsável sem CPF nem telefone em 2 pacientes: ambíguo -> revisão.
  const a = client({ nome_completo: 'A1', nome_responsavel: 'JOSEFA SANTOS' });
  const b = client({ nome_completo: 'B1', nome_responsavel: 'JOSEFA SANTOS' });
  const plan = planGuardians(classifyPatientRows([a, b], [], new Map()), []);
  assert(plan.clusters.length === 0 && plan.review.length === 2, 'GRD-7: responsável só por nome repetido nunca é mesclado nem duplicado — vai para revisão');
}
{
  // Responsável = o próprio paciente.
  const c = client({ nome_completo: 'JOSE ALVES', nome_responsavel: 'JOSE ALVES', telefone1_responsavel: '(34) 99874-3774' });
  const plan = planGuardians(classifyPatientRows([c], [], new Map()), []);
  assert(plan.clusters.length === 0 && plan.selfReferenceCount === 1, 'GRD-8: responsável igual ao próprio paciente não vira guardian');
}
{
  // Mesmo CPF de responsável com telefones diferentes entre irmãos.
  const g = { nome_responsavel: 'LUCIA PAZ', cpf_responsavel: '111.444.777-35' };
  const a = client({ ...g, nome_completo: 'F1', telefone1: '(34) 99874-3774', telefone1_responsavel: '(34) 99874-3774' });
  const b = client({ ...g, nome_completo: 'F2', telefone1: '(34) 99222-3344', telefone1_responsavel: '(34) 99222-3344' });
  const plan = planGuardians(classifyPatientRows([a, b], [], new Map()), []);
  assert(plan.clusters[0].phoneConflict && plan.clusters[0].phone === '', 'GRD-9: telefones divergentes -> responsável criado sem telefone');
  assert(plan.phoneOwnerByLegacyId.get(a.legacyId)?.phoneOwner === 'PATIENT', 'GRD-10: nesse caso o paciente mantém o próprio telefone (trigger não o apaga)');
}
{
  // Reaproveita responsável já cadastrado por CPF; se o telefone dele diverge, paciente fica PATIENT.
  const c = client({ nome_completo: 'K1', telefone1: '(34) 99874-3774', nome_responsavel: 'RITA', cpf_responsavel: '111.444.777-35', telefone1_responsavel: '(34) 99874-3774' });
  const plan = planGuardians(classifyPatientRows([c], [], new Map()), [{ id: 'grd_manual', name: 'Rita', cpf: '11144477735', phone: '34991112222' }]);
  assert(plan.clusters[0].existingGuardianId === 'grd_manual', 'GRD-11: responsável existente reaproveitado por CPF');
  assert(plan.phoneOwnerByLegacyId.get(c.legacyId)?.phoneOwner === 'PATIENT', 'GRD-12: responsável existente com outro telefone não sobrescreve o telefone do paciente');
}

// ---------------------------------------------------------------- pacientes existentes
{
  const legacy = client({ nome_completo: 'Beatriz Nunes', cpf: '111.444.777-35' });
  const existing = [patient({ name: 'BEATRIZ NUNES', cpf: '11144477735', phone: '34991112222' })];
  const [res] = classifyPatientRows([legacy], existing, new Map());
  const row = buildPatientCommitRow(res, planGuardians([res], []))!;
  assert(row.action === 'LINK_EXISTING' && row.existing_patient_id === existing[0].id, 'EXI-1: vínculo confirmado gera LINK_EXISTING (só mapa)');
  assert(Object.keys(row.patient).join(',') === 'cpf', 'EXI-2: vínculo não leva nenhum campo para sobrescrever o paciente existente');
  assert(row.legacy_secondary_id === legacy.legacyClientId, 'EXI-3: mapa leva a segunda chave (id_cliente)');
}
{
  const a = client({ nome_completo: 'Irmao Duplicado', data_nascimento: '01/01/2010 00:00:00', telefone1: '(34) 99874-3774' });
  const b = client({ nome_completo: 'IRMÃO DUPLICADO', data_nascimento: '01/01/2010 00:00:00', telefone1: '(34) 99874-3774' });
  const res = classifyPatientRows([a, b], [], new Map());
  assert(res.every((r) => r.reviewCategory === 'POSSIVEL_DUPLICATA_ARQUIVO'), 'EXI-4: mesmo nome+nascimento no próprio arquivo -> revisão (nunca 2 pacientes automáticos)');
}
{
  const a = client({ nome_completo: 'Paula Reis', cpf: '111.444.777-35' });
  const b = client({ nome_completo: 'Paula Reis', data_nascimento: '02/02/1990 00:00:00', telefone1: '(34) 99874-3774' });
  const existing = [patient({ name: 'Paula Reis', cpf: '11144477735', birthDate: '1990-02-02', phone: '34998743774' })];
  const res = classifyPatientRows([a, b], existing, new Map());
  assert(res.every((r) => r.reviewCategory === 'MULTIPLOS_LEGADOS_MESMO_PACIENTE'), 'EXI-5: dois clientes legados no mesmo paciente existente -> revisão (sem consolidação automática)');
}
{
  const c = client({ nome_completo: 'Nome Igual Existente' });
  const [res] = classifyPatientRows([c], [patient({ name: 'NOME IGUAL EXISTENTE' })], new Map());
  assert(res.reviewCategory === 'POSSIVEL_DUPLICATA_EXISTENTE', 'EXI-6: mesmo nome de paciente existente sem prova forte -> revisão (não cria duplicata)');
}
{
  const c = client({ nome_completo: 'Data Ruim', cpf: '111.444.777-35', data_nascimento: '09/09/9999 00:00:00' });
  const [res] = classifyPatientRows([c], [], new Map());
  assert(res.status === 'REVISAR' && res.reviewCategory === 'DATA_INVALIDA', 'EXI-7: nascimento implausível sempre vai para revisão, mesmo com CPF válido');
  assert(buildPatientCommitRow(res) === null, 'EXI-8: registro em revisão não gera linha de commit');
}
{
  const c = client({ nome_completo: 'Ja Importado' });
  const [res] = classifyPatientRows([c], [], new Map([[c.legacyId, 'pat_lgc_x']]));
  assert(res.matchKind === 'LEGACY_MAP' && buildPatientCommitRow(res) === null, 'EXI-9: reexecução reconhece o mapa legado e não gera commit (idempotente)');
}

// ---------------------------------------------------------------- prontuário -> paciente
{
  const ok = client({ nome_completo: 'Resolvido' });
  const blocked = client({ nome_completo: 'Bloqueado', data_nascimento: '09/09/9999 00:00:00' });
  const results = classifyPatientRows([ok, blocked], [], new Map());
  const byId = new Map<string, ClientMatchResult>(results.map((r) => [r.row.legacyId, r]));
  const rec = (cli: typeof ok, extra: Partial<Record<string, LegacyCellValue>> = {}) =>
    buildNormalizedRecord({ identificador_prontuario: `rec-${++seq}`, identificador_cliente: cli.legacyId, id_cliente: cli.legacyClientId, status: 'Finalizado', data_realizacao: '01/01/2024 10:00:00', ...extra });
  const recs = [rec(ok), rec(blocked), buildNormalizedRecord({ identificador_prontuario: 'rec-orf', identificador_cliente: 'nao-existe', id_cliente: '999999', status: 'Finalizado' }), rec(ok, { id_cliente: blocked.legacyClientId })];
  const before = resolveRecordsToPatients(recs, byId, new Map(), new Map());
  assert(before[0].resolution === 'PENDING_PATIENT_IMPORT', 'PRT-1: antes do commit o prontuário de paciente NOVO fica pendente');
  assert(before[1].resolution === 'BLOCKED_BY_PATIENT_REVIEW', 'PRT-2: prontuário de cliente em revisão fica bloqueado (nunca órfão criado)');
  assert(before[2].resolution === 'ORPHAN', 'PRT-3: sem cliente no arquivo -> órfão');
  assert(before[3].resolution === 'DIVERGENCE', 'PRT-4: identificador e id_cliente apontando para clientes diferentes -> divergência');
  const after = resolveRecordsToPatients(recs, byId, new Map([[ok.legacyId, 'pat_lgc_ok']]), new Map([[ok.legacyClientId, 'pat_lgc_ok']]));
  assert(after[0].resolution === 'RESOLVED' && after[0].patientId === 'pat_lgc_ok', 'PRT-5: depois do commit resolve pelo mapa (duas chaves)');
  const inconsistent = resolveRecordsToPatients([recs[0]], byId, new Map([[ok.legacyId, 'pat_a']]), new Map([[ok.legacyClientId, 'pat_b']]));
  assert(inconsistent[0].resolution === 'DIVERGENCE', 'PRT-6: mapa inconsistente entre as chaves nunca resolve');
}

console.log(`\n🎉 legacyImportGuardiansAndPhones: ${passed} critérios passaram.`);
