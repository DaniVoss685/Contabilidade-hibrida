// Regra da clínica: dado cadastral incompleto ou identidade ambígua NÃO bloqueia a importação.
// Todo cliente com identidade legada própria (identificador + nome) entra com patient_id, mapa legado,
// metadata original e pendências estruturadas — sem inventar dado, sem mesclar/vincular sozinho e sem
// enfraquecer a unicidade de CPF. Também cobre: idempotência das pendências, cadastro excluído que a
// migração não recria, mapeamento definitivo de dentista e a pré-resolução dos prontuários.
// Rodar com: npx tsx tests/functional/legacyImportReviewPolicy.test.ts

import {
  buildNormalizedClient,
  buildNormalizedRecord,
  classifyPatientRows,
  applyReviewImportPolicy,
  planGuardians,
  isCreatableResult,
  resolveRecordsToPatients,
  ClientMatchResult,
} from '../../src/lib/legacyImportMatching';
import { buildPatientCommitRow, buildIssueSyncRows } from '../../src/lib/legacyImportService';
import {
  buildProfessionalMappingFromConfirmed,
  findConfirmedProfessional,
  proposeProfessionalMapping,
} from '../../src/lib/legacyProfessionalMapping';
import { buildRecordCommitRow } from '../../src/lib/legacyImportService';
import { classifyRecordRows } from '../../src/lib/legacyImportMatching';
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

function cpfFrom(base9: string): string {
  const d = base9.split('').map(Number);
  const dv = (len: number) => {
    const s = d.slice(0, len).reduce((a, n, i) => a + n * (len + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(9));
  d.push(dv(10));
  return d.join('');
}
const CPF_A = cpfFrom('529982247');
const CPF_B = cpfFrom('111444777');
const CPF_C = cpfFrom('390533447');
const CPF_D = cpfFrom('123456789');

let n = 0;
function client(over: Record<string, any> = {}) {
  n++;
  return buildNormalizedClient(
    {
      identificador: `uuid-${n}`,
      id_cliente: String(1000 + n),
      nome_completo: `Paciente Teste ${n}`,
      cpf: '',
      data_nascimento: '',
      telefone1: '',
      ...over,
    },
    'legacy_test'
  );
}

function existing(over: Partial<Patient>): Patient {
  return {
    id: 'pat_x', orgId: 'o', name: 'Existente', cpf: '', phone: '', birthDate: '', email: '', createdAt: '2026-01-01T00:00:00Z',
    ...over,
  } as Patient;
}

const run = (rows: ReturnType<typeof client>[], existingPatients: Patient[] = [], map = new Map<string, string>(), ignored = new Map<string, string>()) =>
  applyReviewImportPolicy(classifyPatientRows(rows, existingPatients, map, ignored), existingPatients);

// ─── Paciente incompleto entra, sem inventar nada ────────────────────────────────────
{
  const c = client({ nome_completo: 'Sem Nada Ainda' });
  const [r] = run([c]);
  assert(r.status === 'NOVO' && isCreatableResult(r), 'cliente sem CPF/nascimento/telefone é IMPORTADO (dado incompleto não bloqueia)');
  const row = buildPatientCommitRow(r)!;
  assert(row.action === 'CREATE' && row.legacy_id === c.legacyId && row.legacy_secondary_id === c.legacyClientId, 'entra com identidade legada própria (identificador + id_cliente)');
  assert(row.patient.cpf === '' && row.patient.birth_date === '' && row.patient.own_phone === '', 'CPF, nascimento e telefone ficam VAZIOS — nada é inventado (nem 000…, nem 999…, nem data falsa)');
  assert((r.reviewIssues || []).map((i) => i.issueCode).sort().join() === 'MISSING_BIRTH_DATE,MISSING_CPF,MISSING_PHONE', 'gera MISSING_CPF, MISSING_BIRTH_DATE e MISSING_PHONE');
}

// ─── CPF inválido ────────────────────────────────────────────────────────────────────
{
  const c = client({ nome_completo: 'Cpf Ruim', cpf: '123.456.789-00', data_nascimento: '10/05/1990', telefone1: '(34) 99874-3774' });
  const [r] = run([c]);
  const row = buildPatientCommitRow(r)!;
  assert(r.isCreatable === undefined && isCreatableResult(r) && row.patient.cpf === '', 'CPF inválido: importado SEM CPF operacional (null)');
  assert(row.patient.legacy_metadata.rawCpfOriginal === '123.456.789-00', 'valor original do CPF preservado só em legacy_metadata');
  assert((r.reviewIssues || []).some((i) => i.issueCode === 'INVALID_CPF' && i.legacyValue === '123.456.789-00'), 'pendência INVALID_CPF criada com o valor original');
}
{
  const c = client({ nome_completo: 'Cpf Placeholder', cpf: '99999999999', data_nascimento: '10/05/1990', telefone1: '(34) 99874-3774' });
  const [r] = run([c]);
  assert(buildPatientCommitRow(r)!.patient.cpf === '' && (r.reviewIssues || []).some((i) => i.issueCode === 'INVALID_CPF'), 'CPF placeholder 99999999999 nunca vira CPF; pendência INVALID_CPF');
}

// ─── Nascimento implausível ──────────────────────────────────────────────────────────
{
  const c = client({ nome_completo: 'Nasc Absurdo', cpf: CPF_A, data_nascimento: '15/03/1801', telefone1: '(34) 99874-3774' });
  const [r] = run([c]);
  const row = buildPatientCommitRow(r)!;
  assert(r.status === 'PROVISORIO' && r.reviewCategory === 'DATA_INVALIDA', 'nascimento implausível: entra como cadastro provisório (antes era bloqueado)');
  assert(row.patient.birth_date === '', 'importado SEM birth_date operacional');
  assert(row.patient.legacy_metadata.legacyBirthDateRaw === '15/03/1801', 'data original preservada em legacy_metadata.legacyBirthDateRaw (não assume data correta)');
  assert((r.reviewIssues || []).some((i) => i.issueCode === 'INVALID_BIRTH_DATE' && i.legacyValue === '15/03/1801'), 'pendência INVALID_BIRTH_DATE (conferir nascimento)');
  assert(row.patient.cpf === CPF_A, 'o CPF válido e único desse mesmo cadastro continua sendo gravado');
}

// ─── Telefone inválido/placeholder ───────────────────────────────────────────────────
{
  const bad = client({ nome_completo: 'Fone Falso', cpf: CPF_B, data_nascimento: '10/05/1990', telefone1: '99999999999' });
  const junk = client({ nome_completo: 'Fone Lixo', cpf: CPF_C, data_nascimento: '10/05/1990', telefone1: '123' });
  const rs = run([bad, junk]);
  const rowBad = buildPatientCommitRow(rs[0])!;
  const rowJunk = buildPatientCommitRow(rs[1])!;
  assert(rowBad.patient.own_phone === '' && rowJunk.patient.own_phone === '', 'telefone placeholder/inválido NUNCA vai para patient.phone (nem para contato de WhatsApp)');
  assert(rowBad.patient.legacy_metadata.rawPhoneOriginal === '99999999999', 'valor original preservado só na auditoria');
  assert((rs[0].reviewIssues || []).some((i) => i.issueCode === 'PLACEHOLDER_PHONE') && (rs[1].reviewIssues || []).some((i) => i.issueCode === 'INVALID_PHONE'), 'pendências PLACEHOLDER_PHONE e INVALID_PHONE');
}

// ─── CPF repetido dentro do arquivo: nenhum vira canônico, ninguém é mesclado ────────
{
  const a = client({ nome_completo: 'Maria Souza Lima', cpf: CPF_D, data_nascimento: '01/01/1980', telefone1: '(34) 99874-3774' });
  const b = client({ nome_completo: 'Maria S Lima', cpf: CPF_D, data_nascimento: '02/02/1981', telefone1: '(34) 99111-2233' });
  const rs = run([a, b]);
  assert(rs.every((r) => r.status === 'PROVISORIO' && r.reviewCategory === 'CPF_DUPLICADO'), 'CPF válido repetido: os DOIS entram como cadastros provisórios');
  const rows = rs.map((r) => buildPatientCommitRow(r)!);
  assert(rows.every((r) => r.action === 'CREATE' && r.provisional === true), 'nenhum é vinculado/mesclado a outro (sempre CREATE, com identidade própria)');
  assert(rows.every((r) => r.patient.cpf === ''), 'o CPF conflitante NÃO é gravado como canônico em NENHUM dos dois (unicidade não enfraquecida)');
  assert(rows.every((r) => r.patient.legacy_metadata.legacyCpfRaw === CPF_D), 'CPF preservado em legacy_metadata.legacyCpfRaw');
  assert(rs.every((r) => (r.reviewIssues || []).some((i) => i.issueCode === 'DUPLICATE_CPF') && (r.reviewIssues || []).some((i) => i.issueCode === 'POSSIBLE_DUPLICATE')), 'ambos marcados com DUPLICATE_CPF + POSSIBLE_DUPLICATE');
  assert((rs[0].reviewIssues || []).some((i) => i.issueCode === 'POSSIBLE_DUPLICATE' && i.relatedLegacyId === b.legacyId), 'cada lado aponta o outro legado (relatedLegacyId)');
}

// ─── Divergência com paciente já existente: não vincula, não altera o existente ─────
{
  const ex = existing({ id: 'pat_manual_1', name: 'Joana Pereira', cpf: CPF_A, birthDate: '1985-01-01', phone: '' });
  const c = client({ nome_completo: 'Joana P Oliveira Santos', cpf: CPF_A, data_nascimento: '1990-01-01' && '01/01/1990', telefone1: '(34) 99874-3774' });
  const [r] = run([c], [ex]);
  assert(r.status === 'PROVISORIO' && r.reviewCategory === 'MATCH_EXISTENTE_REVIEW', 'CPF igual a paciente existente mas dados divergentes: entra como provisório');
  const row = buildPatientCommitRow(r)!;
  assert(row.action === 'CREATE' && row.patient.cpf === '' && row.patient.legacy_metadata.legacyCpfRaw === CPF_A, 'NÃO é vinculado ao existente; o CPF (já dele) não é duplicado');
  const div = (r.reviewIssues || []).find((i) => i.issueCode === 'EXISTING_PATIENT_DIVERGENCE');
  assert(Boolean(div) && div!.relatedPatientId === 'pat_manual_1', 'EXISTING_PATIENT_DIVERGENCE aponta o paciente existente (para o espelho no servidor)');
  assert((r.reviewIssues || []).some((i) => i.issueCode === 'DUPLICATE_CPF'), 'DUPLICATE_CPF registrado');
}

// ─── Possível duplicata de existente (mesmo nome) ────────────────────────────────────
{
  const ex = existing({ id: 'pat_manual_2', name: 'Carlos Alberto Nunes' });
  const c = client({ nome_completo: 'Carlos Alberto Nunes', cpf: '', data_nascimento: '', telefone1: '' });
  const [r] = run([c], [ex]);
  assert(r.status === 'PROVISORIO' && (r.reviewIssues || []).some((i) => i.issueCode === 'POSSIBLE_DUPLICATE' && i.relatedPatientId === 'pat_manual_2'), 'mesmo nome de paciente existente sem confirmação: provisório + POSSIBLE_DUPLICATE (nunca vincula por nome)');
}

// ─── Duplicata dentro do arquivo (mesmo nome + nascimento) ───────────────────────────
{
  const a = client({ nome_completo: 'Rita de Cássia Melo', data_nascimento: '05/05/1975' });
  const b = client({ nome_completo: 'Rita de Cassia Melo', data_nascimento: '05/05/1975' });
  const rs = run([a, b]);
  assert(rs.every((r) => r.status === 'PROVISORIO' && r.reviewCategory === 'POSSIVEL_DUPLICATA_ARQUIVO'), 'mesmo nome+nascimento no arquivo: dois cadastros provisórios separados');
  assert(rs.every((r) => (r.reviewIssues || []).some((i) => i.issueCode === 'POSSIBLE_DUPLICATE')), 'ambos marcados POSSIBLE_DUPLICATE');
  assert(new Set(rs.map((r) => buildPatientCommitRow(r)!.legacy_id)).size === 2, 'cada legado mantém o próprio legacy_id (nenhum some por deduplicação)');
}

// ─── Dois legados no mesmo paciente existente ────────────────────────────────────────
{
  const ex = existing({ id: 'pat_manual_3', name: 'Paulo Roberto Dias', cpf: CPF_B, birthDate: '1970-04-04', phone: '34998743774' });
  // Sem CPF no arquivo: nome + nascimento + telefone batem com o MESMO paciente existente nos dois clientes.
  const a = client({ nome_completo: 'Paulo Roberto Dias', cpf: '', data_nascimento: '04/04/1970', telefone1: '(34) 99874-3774' });
  const b = client({ nome_completo: 'Paulo Roberto Dias', cpf: '', data_nascimento: '04/04/1970', telefone1: '(34) 99874-3774' });
  const rs = run([a, b], [ex]);
  assert(rs.every((r) => r.status === 'PROVISORIO'), 'dois clientes legados que bateriam no mesmo paciente: NÃO consolida sozinho — ambos provisórios');
  assert(rs.every((r) => (r.reviewIssues || []).some((i) => i.issueCode === 'MULTIPLE_LEGACY_SAME_PATIENT')), 'ambos com MULTIPLE_LEGACY_SAME_PATIENT');
  assert(rs.every((r) => buildPatientCommitRow(r)!.action === 'CREATE'), 'nenhum LINK_EXISTING automático');
}

// ─── Identidade inválida continua fora ───────────────────────────────────────────────
{
  const noName = client({ nome_completo: '' });
  const [r] = run([noName]);
  assert(r.status === 'INVALIDO' && !isCreatableResult(r) && buildPatientCommitRow(r) === null, 'sem nome/identificador não há identidade legada: continua não importável');
}

// ─── Idempotência e "todos os 28 representados" ─────────────────────────────────────
{
  const rows = [
    client({ nome_completo: 'Prov Um', data_nascimento: '15/03/1801' }),
    client({ nome_completo: 'Prov Dois', cpf: '12345678900' }),
    client({ nome_completo: 'Normal Tres', cpf: CPF_C, data_nascimento: '10/10/1990', telefone1: '(34) 99874-3774' }),
  ];
  const first = run(rows);
  assert(first.every(isCreatableResult), 'todos os clientes (provisórios e normais) ficam representados: nenhum sem destino');
  const commit1 = first.map((r) => buildPatientCommitRow(r)!);
  // simula o commit: o mapa passa a conter os 3
  const map = new Map(rows.map((c, i) => [c.legacyId, `pat_lgc_${i}`]));
  const second = run(rows, [], map);
  assert(second.every((r) => r.status === 'VINCULAR' && r.matchKind === 'LEGACY_MAP'), 'reexecução: todos já mapeados (LEGACY_MAP)');
  assert(second.map((r) => buildPatientCommitRow(r)).every((x) => x === null), 'reexecução NÃO recria nem duplica nenhum paciente');
  assert(commit1.length === 3, 'primeira execução gerou exatamente 3 linhas de commit');

  const plan = planGuardians(first, []);
  const k1 = buildIssueSyncRows(first, plan, [], new Map(), new Map()).map((r) => r.review_issues.map((i) => i.dedupeKey).join(','));
  const k2 = buildIssueSyncRows(run(rows), planGuardians(run(rows), []), [], new Map(), new Map()).map((r) => r.review_issues.map((i) => i.dedupeKey).join(','));
  assert(k1.join('|') === k2.join('|'), 'pendências: mesmas chaves em reexecução (idempotência por índice único no servidor)');
}

// ─── Backfill dos já importados: só o que AINDA falta ────────────────────────────────
{
  const rows = [
    client({ nome_completo: 'Backfill Sem Cpf', cpf: '', data_nascimento: '10/10/1990', telefone1: '(34) 99874-3774' }),
    client({ nome_completo: 'Backfill Cpf Ja Preenchido', cpf: '', data_nascimento: '10/10/1990', telefone1: '(34) 99874-3774' }),
  ];
  const map = new Map([[rows[0].legacyId, 'pat_a'], [rows[1].legacyId, 'pat_b']]);
  const results = run(rows, [], map);
  const patients = new Map<string, Patient>([
    ['pat_a', existing({ id: 'pat_a', cpf: '', birthDate: '1990-10-10', phone: '34998743774' })],
    ['pat_b', existing({ id: 'pat_b', cpf: CPF_A, birthDate: '1990-10-10', phone: '34998743774' })], // a recepção já preencheu
  ]);
  const kinds = new Map([[rows[0].legacyId, 'CREATED'], [rows[1].legacyId, 'CREATED']]);
  const sync = buildIssueSyncRows(results, planGuardians(results, []), [], patients, kinds);
  assert(sync.length === 1 && sync[0].legacy_id === rows[0].legacyId && sync[0].backfill === true, 'backfill só para quem ainda tem o campo vazio no CADASTRO ATUAL');
  assert(sync[0].review_issues.length === 1 && sync[0].review_issues[0].issueCode === 'MISSING_CPF', 'apenas MISSING_CPF — não recria pendência de campo já preenchido');
  const linked = buildIssueSyncRows(results, planGuardians(results, []), [], patients, new Map([[rows[0].legacyId, 'LINKED_CPF']]));
  assert(linked.length === 0, 'paciente vinculado a existente (não criado pela migração) não gera pendência');
}

// ─── Cadastro excluído: a migração não recria e o prontuário não vira órfão ──────────
{
  const c = client({ nome_completo: 'Foi Excluido Por Engano', cpf: CPF_A });
  const [r] = run([c], [], new Map(), new Map([[c.legacyId, 'DELETED']]));
  assert(r.status === 'IGNORAR' && !isCreatableResult(r) && buildPatientCommitRow(r) === null, 'legacy id marcado como DELETED no mapa: NÃO é recriado por nova importação');
  const rec = buildNormalizedRecord({ identificador_prontuario: 'rec-1', identificador_cliente: c.legacyId, id_cliente: c.legacyClientId, dentista: 'DR X', status: 'Finalizado', data_abertura: '05/11/2024 15:50:00', data_realizacao: '05/11/2024 15:51:00' });
  const [res] = resolveRecordsToPatients([rec], new Map([[c.legacyId, r]]), new Map(), new Map());
  assert(res.resolution === 'PATIENT_DELETED', 'prontuário desse cliente: PATIENT_DELETED (rastreável), não órfão nem resolvido');
  assert(classifyRecordRows([rec], new Map([[c.legacyId, r]]), new Set())[0].status === 'IGNORAR', 'prontuário desse cliente nunca é importado');
}

// ─── Responsáveis dos provisórios: mesmas regras homologadas ─────────────────────────
{
  const g = (over: Record<string, any>) => ({ nome_responsavel: 'Mae Teste', cpf_responsavel: cpfFrom('222333444'), telefone1_responsavel: '(34) 99111-2233', grau_parentesco: 'MAE', ...over });
  const a = client({ nome_completo: 'Filho Um Prov', data_nascimento: '15/03/1801', ...g({}) });
  const b = client({ nome_completo: 'Filho Dois Prov', data_nascimento: '16/03/1801', ...g({}) });
  const rs = run([a, b]);
  assert(rs.every((r) => r.status === 'PROVISORIO'), 'pré-condição: os dois são provisórios');
  const plan = planGuardians(rs, []);
  assert(plan.clusters.length === 1 && plan.clusters[0].memberLegacyIds.length === 2, 'responsável por CPF único: 1 guardian para os 2 irmãos provisórios (mesma regra canônica)');
  const rowA = buildPatientCommitRow(rs[0], plan)!;
  assert(rowA.guardian?.cluster_key === plan.clusters[0].clusterKey && rowA.patient.phone_owner === 'RESPONSIBLE', 'telefone compartilhado: 1 contato → N pacientes (o telefone do responsável)');

  const ambiguous = [
    client({ nome_completo: 'Neto A', ...g({ cpf_responsavel: '', telefone1_responsavel: '', nome_responsavel: 'Vovo Sem Dados' }) }),
    client({ nome_completo: 'Neto B', ...g({ cpf_responsavel: '', telefone1_responsavel: '', nome_responsavel: 'Vovo Sem Dados' }) }),
  ];
  const rs2 = run(ambiguous);
  const plan2 = planGuardians(rs2, []);
  assert(plan2.review.length === 2 && plan2.clusters.length === 0, 'responsável ambíguo (só nome repetido): NÃO inventa guardian — vai para revisão');
  const sync = buildIssueSyncRows(rs2, plan2, [], new Map(), new Map());
  assert(sync.every((row) => row.review_issues.some((i) => i.issueCode === 'GUARDIAN_REVIEW')), 'cada paciente recebe pendência GUARDIAN_REVIEW');
}

// ─── Dentista: Amanda mapeada de forma definitiva ────────────────────────────────────
{
  const profs = [{ id: 'prof_clinic_1790017750_be6b', name: 'Amanda Ferraz Dantas' }];
  const confirmed = [{ legacyName: 'DRA AMANDA FERRAZ', professionalId: 'prof_clinic_1790017750_be6b' }];
  assert(findConfirmedProfessional('DRA. AMANDA FERRAZ', confirmed)?.professionalId === profs[0].id, '"DRA. AMANDA FERRAZ" e "DRA AMANDA FERRAZ" são o mesmo dentista legado');
  const legacyList = ['CAROLINE', 'DR. FABIANO BALDISSERA', 'DR. JOÃO', 'DRA AMANDA FERRAZ', 'DRA. JOYCE FELIX', 'REJAINE OLIVEIRA DA SILVA'];
  const mapping = buildProfessionalMappingFromConfirmed(legacyList, confirmed, profs);
  assert(mapping['DRA AMANDA FERRAZ'].professionalId === profs[0].id && mapping['DRA AMANDA FERRAZ'].keepLegacy === false, 'Amanda → Amanda Ferraz Dantas (mesmo profissional, sem criar outro)');
  assert(legacyList.filter((d) => d !== 'DRA AMANDA FERRAZ').every((d) => mapping[d].keepLegacy === true && !mapping[d].professionalId), 'os outros 5 dentistas preservam o nome legado (sem usuário/profissional criado)');

  const rec = buildNormalizedRecord({ identificador_prontuario: 'rec-9', identificador_cliente: 'u1', id_cliente: '1', dentista: 'DRA AMANDA FERRAZ', status: 'Finalizado', data_abertura: '05/11/2024 15:50:00', data_realizacao: '05/11/2024 15:51:00', descricao: 'RADIOGRAFIA' });
  const [rr] = classifyRecordRows([rec], new Map([['u1', { row: client({ identificador: 'u1' }), status: 'VINCULAR' } as ClientMatchResult]]), new Set());
  const commit = buildRecordCommitRow(rr, mapping, {}, 'pat_x')!;
  assert(commit.record.professional_id === profs[0].id && commit.record.legacy_dentist_name === 'DRA AMANDA FERRAZ', 'prontuário futuro aponta para Amanda Ferraz Dantas E preserva o nome legado para auditoria');
  const other = buildNormalizedRecord({ identificador_prontuario: 'rec-10', identificador_cliente: 'u1', id_cliente: '1', dentista: 'CAROLINE', status: 'Finalizado', data_abertura: '05/11/2024 15:50:00', data_realizacao: '05/11/2024 15:51:00' });
  const [ro] = classifyRecordRows([other], new Map([['u1', { row: client({ identificador: 'u1' }), status: 'VINCULAR' } as ClientMatchResult]]), new Set());
  const cOther = buildRecordCommitRow(ro, mapping, {}, 'pat_x')!;
  assert(String(cOther.record.professional_id).startsWith('legacy_dentist:') && cOther.record.professional_name === 'CAROLINE' && cOther.record.legacy_dentist_name === 'CAROLINE', 'dentista sem mapeamento: nome legado preservado; professional_id é só a CHAVE legacy_dentist:<nome> (nenhum profissional/usuário criado)');
  assert(proposeProfessionalMapping([{ name: 'DRA AMANDA FERRAZ' }], profs)[0].confirmed === false, 'a PROPOSTA continua sem confirmar; só a decisão do usuário (USER_CONFIRMED) grava o mapeamento');
}

// ─── Pré-resolução dos prontuários (nada é importado) ────────────────────────────────
{
  const clients = [client({ nome_completo: 'Resolvido Um', cpf: CPF_A, data_nascimento: '10/10/1990', telefone1: '(34) 99874-3774' }), client({ nome_completo: 'Prov Dois', data_nascimento: '15/03/1801' })];
  const results = run(clients);
  const byLegacy = new Map(results.map((r) => [r.row.legacyId, r]));
  const map1 = new Map(clients.map((c, i) => [c.legacyId, `pat_lgc_${i}`]));
  const map2 = new Map(clients.map((c, i) => [c.legacyClientId, `pat_lgc_${i}`]));
  const rec = (id: string, c: (typeof clients)[number], extra: Record<string, any> = {}) =>
    buildNormalizedRecord({ identificador_prontuario: id, identificador_cliente: c.legacyId, id_cliente: c.legacyClientId, dentista: 'DR X', status: 'Finalizado', data_abertura: '05/11/2024 15:50:00', data_realizacao: '05/11/2024 15:51:00', ...extra });
  const records = [rec('r1', clients[0]), rec('r2', clients[1]), rec('r3', clients[1], { data_realizacao: '12/05/4021 00:00:00', data_abertura: '12/05/4021 15:17:00' })];

  const before = resolveRecordsToPatients(records, byLegacy, new Map(), new Map());
  assert(before.filter((r) => r.resolution === 'BLOCKED_BY_PATIENT_REVIEW').length === 0, 'provisório NÃO bloqueia mais os prontuários (antes: BLOCKED_BY_PATIENT_REVIEW)');
  const after = resolveRecordsToPatients(records, byLegacy, map1, map2);
  assert(after.every((r) => r.resolution === 'RESOLVED' && Boolean(r.patientId)), 'com o mapa dos 28: TODOS os prontuários resolvem para paciente (0 órfãos, 0 divergências)');
  const bad = after.filter((r) => r.recordNeedsReview);
  assert(bad.length === 1 && bad[0].record.legacyId === 'r3' && bad[0].recordReviewCode === 'REVIEW_INVALID_RECORD_DATE', 'a data 12/05/4021 fica como REVIEW_INVALID_RECORD_DATE (não é corrigida para 2021)');
  assert(after.filter((r) => !r.recordNeedsReview).length === 2 && after.filter((r) => !r.recordNeedsReview).every((r) => r.resolution === 'RESOLVED'), 'a linha da data inválida NÃO bloqueia os outros registros (nem do mesmo paciente)');
  assert(after.filter((r) => r.resolution === 'ORPHAN').length === 0 && after.filter((r) => r.resolution === 'DIVERGENCE').length === 0, 'zero órfãos e zero divergências de mapa');
}

console.log(`\n${passed} verificações passaram.`);
