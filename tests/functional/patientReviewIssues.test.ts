// Revisão cadastral de pacientes: pendências (df_patient_review_issues) — derivação, idempotência,
// badge, filtro/fila, resolução automática objetiva, ambiguidade que NÃO se resolve sozinha, estado
// calculado e exclusão segura. Lógica pura (mesmas funções usadas pelo app); o servidor repete a
// reconferência objetiva e a idempotência por índice único.
// Rodar com: npx tsx tests/functional/patientReviewIssues.test.ts

import {
  ALL_REVIEW_ISSUE_CODES,
  ISSUE_META,
  PatientReviewIssue,
  ReviewIssueCode,
  buildDedupeKey,
  countPatientsByBucket,
  countReviewQueues,
  decidePatientDeletion,
  SEVERITY_LABEL,
  sortPatientsForReviewFilter,
  dedupeDrafts,
  deriveFieldIssues,
  filterPatientsByReview,
  findIssuesResolvedByEdit,
  groupIssuesByPatient,
  isIssueObjectivelyResolved,
  makeIdentityIssue,
  maskSensitiveLegacyValue,
  reviewBadge,
  sortIssuesForPanel,
  sortPatientsByReviewPriority,
  summarizeReview,
} from '../../src/lib/patientReviewIssues';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

const VALID_CPF = '52998224725';
const OTHER_CPF = '11144477735';
const NOBODY = { isDocumentTakenByOther: () => false };

let seq = 0;
function issue(patientId: string, code: ReviewIssueCode, status: PatientReviewIssue['status'] = 'OPEN', extra: Partial<PatientReviewIssue> = {}): PatientReviewIssue {
  seq++;
  return {
    id: `rvi_${seq}`,
    tenantId: 't1',
    patientId,
    source: 'LEGACY_IMPORT',
    issueCode: code,
    fieldName: code.includes('CPF') ? 'cpf' : code.includes('BIRTH') ? 'birth_date' : code.includes('PHONE') ? 'phone' : 'identity',
    severity: ISSUE_META[code].severity,
    message: ISSUE_META[code].problem,
    dedupeKey: buildDedupeKey(code, 'x', String(seq)),
    status,
    createdAt: `2026-09-25T00:00:${String(seq).padStart(2, '0')}Z`,
    ...extra,
  };
}

// ─── Códigos suportados ─────────────────────────────────────────────────────────────
{
  const required: ReviewIssueCode[] = [
    'MISSING_CPF', 'INVALID_CPF', 'DUPLICATE_CPF', 'MISSING_BIRTH_DATE', 'INVALID_BIRTH_DATE', 'MISSING_PHONE',
    'INVALID_PHONE', 'PLACEHOLDER_PHONE', 'POSSIBLE_DUPLICATE', 'EXISTING_PATIENT_DIVERGENCE',
    'MULTIPLE_LEGACY_SAME_PATIENT', 'GUARDIAN_REVIEW', 'OTHER_DATA_REVIEW',
  ];
  assert(required.every((c) => ALL_REVIEW_ISSUE_CODES.includes(c) && Boolean(ISSUE_META[c])), 'suporta os 13 códigos de pendência pedidos, todos com metadado');
  assert(ISSUE_META.INVALID_CPF.guidance.includes('documento'), 'orientação do CPF inválido: verificar documento do paciente');
  assert(ISSUE_META.INVALID_BIRTH_DATE.guidance.includes('Confirme'), 'orientação do nascimento inválido: confirmar com o paciente/cadastro antigo');
  assert(ISSUE_META.POSSIBLE_DUPLICATE.guidance.includes('Compare'), 'orientação da duplicidade: comparar antes de consolidar');
}

// ─── Derivação de pendências de campo ───────────────────────────────────────────────
{
  const base = {
    cpfClassification: 'VALID' as const, cpfPersisted: true, cpfConflict: false,
    birthValue: '1990-01-01', birthRaw: '01/01/1990', birthInvalid: false,
    phoneClassification: 'VALID' as const, hasEffectivePhone: true,
  };
  assert(deriveFieldIssues(base).length === 0, 'paciente completo e válido não gera pendência');

  const blank = deriveFieldIssues({ ...base, cpfClassification: 'BLANK', cpfPersisted: false, birthValue: null, birthRaw: '', phoneClassification: 'BLANK', hasEffectivePhone: false });
  assert(blank.map((i) => i.issueCode).join() === 'MISSING_CPF,MISSING_BIRTH_DATE,MISSING_PHONE', 'paciente incompleto: MISSING_CPF, MISSING_BIRTH_DATE, MISSING_PHONE');

  const invalidCpf = deriveFieldIssues({ ...base, cpfClassification: 'INVALID', cpfRaw: '12345678900', cpfPersisted: false });
  assert(invalidCpf.length === 1 && invalidCpf[0].issueCode === 'INVALID_CPF' && invalidCpf[0].legacyValue === '12345678900', 'CPF inválido: INVALID_CPF com o valor original só para auditoria');
  const placeholderCpf = deriveFieldIssues({ ...base, cpfClassification: 'PLACEHOLDER', cpfRaw: '99999999999', cpfPersisted: false });
  assert(placeholderCpf[0].issueCode === 'INVALID_CPF', 'CPF placeholder também é INVALID_CPF (nunca vira CPF operacional)');
  const dupCpf = deriveFieldIssues({ ...base, cpfPersisted: false, cpfConflict: true, cpfRaw: VALID_CPF });
  assert(dupCpf.length === 1 && dupCpf[0].issueCode === 'DUPLICATE_CPF', 'CPF válido conflitante e não gravado: DUPLICATE_CPF');

  const invalidBirth = deriveFieldIssues({ ...base, birthValue: null, birthRaw: '12/05/4021', birthInvalid: true });
  assert(invalidBirth.length === 1 && invalidBirth[0].issueCode === 'INVALID_BIRTH_DATE' && invalidBirth[0].legacyValue === '12/05/4021', 'nascimento implausível: INVALID_BIRTH_DATE com o valor original preservado');

  const placeholderPhone = deriveFieldIssues({ ...base, phoneClassification: 'PLACEHOLDER', phoneRaw: '99999999999', hasEffectivePhone: false });
  assert(placeholderPhone[0].issueCode === 'PLACEHOLDER_PHONE', 'telefone placeholder: PLACEHOLDER_PHONE');
  const invalidPhone = deriveFieldIssues({ ...base, phoneClassification: 'INVALID', phoneRaw: '123', hasEffectivePhone: false });
  assert(invalidPhone[0].issueCode === 'INVALID_PHONE', 'telefone inválido: INVALID_PHONE');
  const viaGuardian = deriveFieldIssues({ ...base, phoneClassification: 'BLANK', hasEffectivePhone: true });
  assert(viaGuardian.length === 0, 'sem telefone próprio mas com telefone do responsável: sem pendência de telefone');
}

// ─── Idempotência ───────────────────────────────────────────────────────────────────
{
  const a = deriveFieldIssues({ cpfClassification: 'BLANK', cpfPersisted: false, cpfConflict: false, birthValue: null, birthRaw: '', birthInvalid: false, phoneClassification: 'BLANK', hasEffectivePhone: false });
  const b = deriveFieldIssues({ cpfClassification: 'BLANK', cpfPersisted: false, cpfConflict: false, birthValue: null, birthRaw: '', birthInvalid: false, phoneClassification: 'BLANK', hasEffectivePhone: false });
  assert(a.map((i) => i.dedupeKey).join('|') === b.map((i) => i.dedupeKey).join('|'), 'reexecução gera as MESMAS chaves de deduplicação (o índice único impede duplicata)');
  assert(dedupeDrafts([...a, ...b]).length === a.length, 'dedupeDrafts remove pendência repetida na mesma chave');
  const dupA = makeIdentityIssue('POSSIBLE_DUPLICATE', { relatedLegacyId: 'L1' });
  const dupB = makeIdentityIssue('POSSIBLE_DUPLICATE', { relatedLegacyId: 'L2' });
  assert(dupA.dedupeKey !== dupB.dedupeKey, 'possível duplicidade com pares diferentes são pendências distintas');
  assert(makeIdentityIssue('POSSIBLE_DUPLICATE', { relatedLegacyId: 'L1' }).dedupeKey === dupA.dedupeKey, 'mesma duplicidade reexecutada mantém a mesma chave');
}

// ─── Resolução automática objetiva ──────────────────────────────────────────────────
{
  const patient = { documentType: 'CPF' as const, cpf: '', phone: '', birthDate: '' };
  const open = [issue('p1', 'INVALID_CPF'), issue('p1', 'MISSING_BIRTH_DATE'), issue('p1', 'MISSING_PHONE'), issue('p1', 'POSSIBLE_DUPLICATE')];
  assert(findIssuesResolvedByEdit(open, patient, NOBODY).length === 0, 'nada preenchido: nenhuma pendência é resolvida');

  const fixedCpf = findIssuesResolvedByEdit(open, { ...patient, cpf: VALID_CPF }, NOBODY);
  assert(fixedCpf.length === 1 && fixedCpf[0].issueCode === 'INVALID_CPF', 'INVALID_CPF resolve quando o usuário salva CPF válido e único');
  assert(findIssuesResolvedByEdit(open, { ...patient, cpf: VALID_CPF }, { isDocumentTakenByOther: (d) => d === VALID_CPF }).length === 0, 'CPF válido mas já usado por outro paciente NÃO resolve');
  assert(findIssuesResolvedByEdit(open, { ...patient, cpf: '11111111111' }, NOBODY).length === 0, 'CPF inválido digitado NÃO resolve');

  const fixedBirth = findIssuesResolvedByEdit(open, { ...patient, birthDate: '1990-05-10' }, NOBODY);
  assert(fixedBirth.length === 1 && fixedBirth[0].issueCode === 'MISSING_BIRTH_DATE', 'nascimento válido resolve MISSING_BIRTH_DATE');
  assert(!isIssueObjectivelyResolved('INVALID_BIRTH_DATE', { ...patient, birthDate: '2999-01-01' }, NOBODY), 'nascimento futuro NÃO resolve');
  assert(isIssueObjectivelyResolved('INVALID_BIRTH_DATE', { documentType: 'CNPJ', birthDate: '' }, NOBODY), 'paciente vira CNPJ: pendência de nascimento deixa de se aplicar');

  const fixedPhone = findIssuesResolvedByEdit(open, { ...patient, phone: '(34) 99874-3774' }, NOBODY);
  assert(fixedPhone.length === 1 && fixedPhone[0].issueCode === 'MISSING_PHONE', 'telefone válido resolve MISSING_PHONE');
  assert(!isIssueObjectivelyResolved('PLACEHOLDER_PHONE', { phone: '99999999999' }, NOBODY), 'telefone placeholder digitado NÃO resolve');

  const everything = findIssuesResolvedByEdit(open, { documentType: 'CPF', cpf: VALID_CPF, phone: '(34) 99874-3774', birthDate: '1990-05-10' }, NOBODY);
  assert(everything.length === 3 && !everything.some((i) => i.issueCode === 'POSSIBLE_DUPLICATE'), 'com tudo corrigido, só as pendências de CAMPO resolvem — POSSIBLE_DUPLICATE continua aberta');
}

// ─── Ambiguidade de identidade nunca se resolve sozinha ─────────────────────────────
{
  const manual: ReviewIssueCode[] = ['POSSIBLE_DUPLICATE', 'MULTIPLE_LEGACY_SAME_PATIENT', 'EXISTING_PATIENT_DIVERGENCE', 'GUARDIAN_REVIEW', 'OTHER_DATA_REVIEW'];
  const complete = { documentType: 'CPF' as const, cpf: VALID_CPF, phone: '(34) 99874-3774', birthDate: '1990-05-10' };
  assert(manual.every((c) => ISSUE_META[c].manual && !isIssueObjectivelyResolved(c, complete, NOBODY)), 'duplicidade/divergência/vários legados/responsável: NUNCA resolvem por alteração de campo');
  assert(manual.every((c) => findIssuesResolvedByEdit([issue('p', c)], complete, NOBODY).length === 0), 'edição completa do cadastro não encerra pendência de identidade');
}

// ─── Níveis: CADASTRO INCOMPLETO × REVISÃO NECESSÁRIA ─────────────────────────────────
{
  const incomplete: ReviewIssueCode[] = ['MISSING_CPF', 'MISSING_BIRTH_DATE', 'MISSING_PHONE'];
  const warning: ReviewIssueCode[] = ['INVALID_CPF', 'INVALID_BIRTH_DATE', 'INVALID_PHONE', 'PLACEHOLDER_PHONE', 'GUARDIAN_REVIEW', 'OTHER_DATA_REVIEW'];
  const high: ReviewIssueCode[] = ['DUPLICATE_CPF', 'POSSIBLE_DUPLICATE', 'EXISTING_PATIENT_DIVERGENCE', 'MULTIPLE_LEGACY_SAME_PATIENT'];
  assert(incomplete.every((c) => ISSUE_META[c].level === 'INCOMPLETE' && SEVERITY_LABEL[ISSUE_META[c].severity] === 'INFO'), 'campo ausente (MISSING_*): nível CADASTRO INCOMPLETO, severidade INFO');
  assert(warning.every((c) => ISSUE_META[c].level === 'REVIEW' && SEVERITY_LABEL[ISSUE_META[c].severity] === 'WARNING'), 'dado inválido/responsável/outros: nível REVISÃO NECESSÁRIA, severidade WARNING');
  assert(high.every((c) => ISSUE_META[c].level === 'REVIEW' && SEVERITY_LABEL[ISSUE_META[c].severity] === 'HIGH'), 'possível duplicidade/conflito de identidade: REVISÃO NECESSÁRIA, severidade HIGH');
  assert(ALL_REVIEW_ISSUE_CODES.every((c) => incomplete.includes(c) || warning.includes(c) || high.includes(c)), 'todo código está classificado em exatamente um dos três grupos');
}

// ─── Estado global calculado + badge ────────────────────────────────────────────────
{
  assert(summarizeReview(undefined).status === 'SEM_PENDENCIAS' && reviewBadge(summarizeReview(undefined)) === null, 'sem pendência: sem badge');

  const onlyMissing = summarizeReview([issue('p', 'MISSING_CPF')]);
  assert(onlyMissing.status === 'PENDENTE' && !onlyMissing.hasReview && onlyMissing.hasIncomplete, 'só sem CPF: paciente válido, SEM revisão necessária');
  assert(reviewBadge(onlyMissing)?.text === 'Cadastro incompleto' && reviewBadge(onlyMissing)?.kind === 'INCOMPLETE', 'paciente só sem CPF: badge discreto "Cadastro incompleto"');
  const threeMissing = summarizeReview([issue('p', 'MISSING_CPF'), issue('p', 'MISSING_PHONE'), issue('p', 'MISSING_BIRTH_DATE')]);
  assert(reviewBadge(threeMissing)?.text === 'Cadastro incompleto' && !threeMissing.hasReview, 'sem CPF+telefone+nascimento continua só "Cadastro incompleto" (sem tom de erro)');
  assert(!/pendência|problema/i.test(reviewBadge(threeMissing)!.text), 'o badge de dado ausente não diz "pendência" nem "possível problema"');

  const invalid = summarizeReview([issue('p', 'INVALID_CPF')]);
  assert(reviewBadge(invalid)?.text === 'Revisar cadastro' && reviewBadge(invalid)?.kind === 'REVIEW', 'CPF inválido: "Revisar cadastro"');
  const dup = summarizeReview([issue('p', 'MISSING_CPF'), issue('p', 'INVALID_PHONE'), issue('p', 'POSSIBLE_DUPLICATE')]);
  assert(reviewBadge(dup)?.text === 'Possível duplicidade' && reviewBadge(dup)?.kind === 'DUPLICATE', 'várias categorias: UM badge, o de maior severidade (duplicidade)');
  const mixed = summarizeReview([issue('p', 'MISSING_CPF'), issue('p', 'MISSING_PHONE'), issue('p', 'INVALID_BIRTH_DATE')]);
  assert(reviewBadge(mixed)?.text === 'Revisar cadastro' && mixed.reviewCount === 1 && mixed.incompleteCount === 2, 'ausente + inválido: "Revisar cadastro" (o incompleto não some do resumo, só não gera badge extra)');
  assert(reviewBadge(summarizeReview([issue('p', 'DUPLICATE_CPF')]))?.kind === 'DUPLICATE', 'DUPLICATE_CPF usa o badge de duplicidade');
  assert(reviewBadge(summarizeReview([issue('p', 'EXISTING_PATIENT_DIVERGENCE')]))?.kind === 'DUPLICATE', 'EXISTING_PATIENT_DIVERGENCE usa o badge de duplicidade');
  assert(reviewBadge(summarizeReview([issue('p', 'GUARDIAN_REVIEW')]))?.text === 'Revisar cadastro', 'responsável a conferir: "Revisar cadastro"');
  assert(!/\d/.test(reviewBadge(mixed)!.text), 'o texto do badge nunca mostra números/CPF/telefone (um único badge por linha)');

  const reviewed = summarizeReview([issue('p', 'MISSING_CPF', 'REVIEWED'), issue('p', 'INVALID_PHONE', 'RESOLVED')]);
  assert(reviewed.status === 'REVISADO' && reviewBadge(reviewed) === null, 'todas resolvidas/revisadas: estado calculado REVISADO e sem badge');
  const partial = summarizeReview([issue('p', 'MISSING_CPF', 'REVIEWED'), issue('p', 'INVALID_PHONE')]);
  assert(partial.status === 'PENDENTE' && partial.openCount === 1, 'uma aberta entre revisadas: continua PENDENTE (estado vem das pendências, não de um booleano)');
  assert(summarizeReview([issue('p', 'MISSING_CPF', 'DISMISSED')]).status === 'SEM_PENDENCIAS', 'pendência encerrada por exclusão não conta como revisão');

  assert(maskSensitiveLegacyValue('INVALID_CPF', '12345678900') === '***.***.***-00', 'CPF legado mascarado fora da ficha');
  assert(maskSensitiveLegacyValue('PLACEHOLDER_PHONE', '(34) 99999-9999') === '(**) *****-9999', 'telefone legado mascarado fora da ficha');
}

// ─── Filtros e fila ─────────────────────────────────────────────────────────────────
{
  const patients = [
    { id: 'a', name: 'Ana' }, { id: 'b', name: 'Bia' }, { id: 'c', name: 'Caio' }, { id: 'd', name: 'Duda' }, { id: 'e', name: 'Enzo' }, { id: 'f', name: 'Fábio' },
  ];
  const issues = groupIssuesByPatient([
    issue('a', 'MISSING_CPF'),                                   // só incompleto
    issue('b', 'INVALID_CPF'),                                   // revisar
    issue('c', 'POSSIBLE_DUPLICATE'),                            // duplicidade
    issue('d', 'MISSING_PHONE', 'REVIEWED'),                     // encerrada
    issue('e', 'MISSING_BIRTH_DATE'), issue('e', 'MISSING_PHONE'), // só incompleto (2 campos)
    issue('f', 'MISSING_CPF'), issue('f', 'INVALID_PHONE'),      // incompleto + revisar
  ]);
  assert(filterPatientsByReview(patients, issues, 'ALL').length === 6, 'filtro Todos: nada some (busca/lista não escondem paciente em revisão)');
  assert(filterPatientsByReview(patients, issues, 'NEEDS_REVIEW').map((p) => p.id).join() === 'b,c,f', 'filtro "Revisar cadastro": só dado inválido/ambíguo — NÃO conta simples ausência de CPF/nascimento/telefone');
  assert(filterPatientsByReview(patients, issues, 'INCOMPLETE').map((p) => p.id).join() === 'a,e,f', 'filtro "Cadastro incompleto": só campos ausentes');
  assert(filterPatientsByReview(patients, issues, 'POSSIBLE_DUPLICATE').map((p) => p.id).join() === 'c', 'filtro "Possível duplicidade"');

  const review = sortPatientsForReviewFilter(filterPatientsByReview(patients, issues, 'NEEDS_REVIEW'), issues, 'NEEDS_REVIEW').map((p) => p.id).join();
  assert(review === 'c,b,f', 'fila "Revisar cadastro": duplicidade primeiro, depois dado inválido (mais pendências antes)');
  const inc = sortPatientsForReviewFilter(filterPatientsByReview(patients, issues, 'INCOMPLETE'), issues, 'INCOMPLETE').map((p) => p.id).join();
  assert(inc === 'e,a,f', 'fila "Cadastro incompleto": mais campos ausentes primeiro (completar de uma vez), depois nome');
  assert(sortPatientsForReviewFilter(patients, issues, 'ALL') === patients, 'sem filtro a ordem original é preservada');

  const q = countReviewQueues([
    issue('a', 'MISSING_CPF'), issue('a', 'MISSING_BIRTH_DATE'), issue('b', 'INVALID_CPF'), issue('c', 'POSSIBLE_DUPLICATE'), issue('c', 'MISSING_CPF'),
    issue('d', 'GUARDIAN_REVIEW'), issue('e', 'MISSING_PHONE', 'REVIEWED'),
  ]);
  assert(q.issues.total === 7 - 1 && q.issues.incomplete === 3 && q.issues.review === 3 && q.issues.duplicate === 1, 'contagem de pendências: total = incompleto + revisão (encerradas não contam)');
  assert(q.patients.any === 4 && q.patients.incomplete === 2 && q.patients.review === 3 && q.patients.duplicate === 1, 'contagem de PACIENTES por fila: "Revisar" não inclui quem só tem campo ausente');

  const buckets = countPatientsByBucket([issue('a', 'MISSING_CPF'), issue('a', 'INVALID_CPF'), issue('b', 'INVALID_BIRTH_DATE'), issue('c', 'POSSIBLE_DUPLICATE'), issue('d', 'GUARDIAN_REVIEW'), issue('e', 'MISSING_PHONE'), issue('f', 'MISSING_CPF', 'REVIEWED')]);
  assert(buckets.CPF === 1 && buckets.NASCIMENTO === 1 && buckets.DUPLICIDADE === 1 && buckets.RESPONSAVEL === 1 && buckets.TELEFONE === 1 && buckets.TOTAL === 5, 'contagem por tipo conta PACIENTES distintos com pendência aberta');

  const panel = sortIssuesForPanel([issue('a', 'MISSING_CPF', 'REVIEWED'), issue('a', 'MISSING_PHONE'), issue('a', 'POSSIBLE_DUPLICATE')]);
  assert(panel[0].issueCode === 'POSSIBLE_DUPLICATE' && panel[1].issueCode === 'MISSING_PHONE' && panel[2].status === 'REVIEWED', 'painel: abertas primeiro (duplicidade no topo), histórico por último');
}

// ─── Exclusão segura ────────────────────────────────────────────────────────────────
{
  const free = decidePatientDeletion({ ok: true, canDelete: true, blocking: {}, detach: { whatsapp_links: 1, guardian_links: 2 } });
  assert(free.kind === 'ALLOWED' && free.detach.length === 2, 'paciente sem referências: exclusão permitida, listando só os vínculos que serão desfeitos');

  const withSale = decidePatientDeletion({ ok: true, canDelete: false, blocking: { sales: 1 }, detach: {} });
  assert(withSale.kind === 'BLOCKED_HISTORY' && withSale.message === 'Este paciente possui histórico e não pode ser excluído diretamente.', 'paciente com venda: BLOQUEADO com a mensagem clara');
  assert(withSale.kind === 'BLOCKED_HISTORY' && withSale.references[0].includes('venda'), 'a mensagem informa o que impede (venda/recebível)');

  const withRecord = decidePatientDeletion({ ok: true, canDelete: false, blocking: { clinical_records: 12, clinical_attachments: 2 }, detach: {} });
  assert(withRecord.kind === 'BLOCKED_HISTORY' && withRecord.references.length === 2, 'paciente com prontuário/documento: BLOQUEADO');
  for (const k of ['appointments', 'before_after_pairs']) {
    assert(decidePatientDeletion({ ok: true, canDelete: false, blocking: { [k]: 1 }, detach: {} }).kind === 'BLOCKED_HISTORY', `paciente com ${k}: BLOQUEADO`);
  }
  assert(decidePatientDeletion({ ok: false, code: 'FORBIDDEN', message: 'Sem acesso a esta clínica.' }).kind === 'ERROR', 'sem acesso: erro, nunca exclusão');
  assert(decidePatientDeletion(null).kind === 'ERROR', 'falha na verificação: erro (a exclusão nunca é assumida)');
}

console.log(`\n${passed} verificações passaram.`);
