// Revisão cadastral de pacientes (qualidade de dado / identidade).
//
// NÃO é alerta clínico: alergias/condições/medicações/anotações clínicas nunca representam
// problema cadastral. As pendências vivem em df_patient_review_issues (tenant-scoped) e
// esta camada é PURA (testável sem React/banco): códigos, severidade, textos, derivação a
// partir do que a migração encontrou, resolução automática objetiva, prioridade de fila,
// badge/filtro e o critério de exclusão segura.
//
// Dois NÍVEIS conceituais (a estrutura física não muda: severity LOW/MEDIUM/HIGH já os representa):
//  A. CADASTRO INCOMPLETO (INFO)   — campo que simplesmente não veio do sistema antigo (MISSING_*).
//     O paciente continua válido; não é identidade suspeita; badge discreto.
//  B. REVISÃO NECESSÁRIA           — dado inválido (WARNING: INVALID_*, PLACEHOLDER_PHONE, GUARDIAN_REVIEW,
//     OTHER_DATA_REVIEW) ou ambiguidade de identidade (HIGH: POSSIBLE_DUPLICATE, DUPLICATE_CPF,
//     EXISTING_PATIENT_DIVERGENCE, MULTIPLE_LEGACY_SAME_PATIENT).
//
// Regras centrais:
//  - Pendência NÃO bloqueia a operação normal do paciente.
//  - Campo faltante/inválido se resolve sozinho quando o dado passa a ser objetivamente
//    válido (CPF válido e único, nascimento plausível, telefone válido).
//  - Ambiguidade de identidade (possível duplicidade etc.) NUNCA se resolve sozinha:
//    exige decisão explícita ("Marcar como revisada" ou consolidação).
//  - Estado global é CALCULADO das pendências (nunca um booleano que pode divergir).

import { classifyBrazilianPhone } from './phoneUtils';
import { isValidCpf, isValidCnpj, isValidCivilDate, isFutureCivilDate } from './masks';

export type ReviewIssueCode =
  | 'MISSING_CPF'
  | 'INVALID_CPF'
  | 'DUPLICATE_CPF'
  | 'MISSING_BIRTH_DATE'
  | 'INVALID_BIRTH_DATE'
  | 'MISSING_PHONE'
  | 'INVALID_PHONE'
  | 'PLACEHOLDER_PHONE'
  | 'POSSIBLE_DUPLICATE'
  | 'EXISTING_PATIENT_DIVERGENCE'
  | 'MULTIPLE_LEGACY_SAME_PATIENT'
  | 'GUARDIAN_REVIEW'
  | 'OTHER_DATA_REVIEW';

export const ALL_REVIEW_ISSUE_CODES: ReviewIssueCode[] = [
  'MISSING_CPF',
  'INVALID_CPF',
  'DUPLICATE_CPF',
  'MISSING_BIRTH_DATE',
  'INVALID_BIRTH_DATE',
  'MISSING_PHONE',
  'INVALID_PHONE',
  'PLACEHOLDER_PHONE',
  'POSSIBLE_DUPLICATE',
  'EXISTING_PATIENT_DIVERGENCE',
  'MULTIPLE_LEGACY_SAME_PATIENT',
  'GUARDIAN_REVIEW',
  'OTHER_DATA_REVIEW',
];

export type ReviewSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
/** Nome de exibição da severidade física: LOW = INFO (campo ausente), MEDIUM = WARNING (dado inválido), HIGH. */
export type ReviewSeverityLabel = 'INFO' | 'WARNING' | 'HIGH';
export const SEVERITY_LABEL: Record<ReviewSeverity, ReviewSeverityLabel> = { LOW: 'INFO', MEDIUM: 'WARNING', HIGH: 'HIGH' };
/** A = cadastro incompleto (só falta dado) · B = revisão necessária (inválido/ambíguo). */
export type ReviewLevel = 'INCOMPLETE' | 'REVIEW';
export type ReviewIssueStatus = 'OPEN' | 'RESOLVED' | 'REVIEWED' | 'DISMISSED';

/** Ordem de prioridade da fila: duplicidade -> dado inválido -> outros -> dado faltante. */
export type ReviewIssueGroup = 'DUPLICATE' | 'INVALID' | 'OTHER' | 'MISSING';
const GROUP_ORDER: Record<ReviewIssueGroup, number> = { DUPLICATE: 0, INVALID: 1, OTHER: 2, MISSING: 3 };

export interface ReviewIssueMeta {
  group: ReviewIssueGroup;
  /** INCOMPLETE = só ausência de dado; REVIEW = dado inválido ou identidade ambígua. */
  level: ReviewLevel;
  severity: ReviewSeverity;
  /** Campo (rótulo curto) exibido no painel. */
  field: string;
  /** Problema em uma frase (rótulo). */
  problem: string;
  /** Orientação ao usuário. */
  guidance: string;
  /** true = nunca se resolve sozinha; exige "Marcar como revisada" ou consolidação. */
  manual: boolean;
  /** Bucket do relatório de contagem. */
  bucket: ReviewBucket;
}

export type ReviewBucket = 'CPF' | 'NASCIMENTO' | 'TELEFONE' | 'DUPLICIDADE' | 'RESPONSAVEL' | 'OUTROS';

export const ISSUE_META: Record<ReviewIssueCode, ReviewIssueMeta> = {
  MISSING_CPF: {
    group: 'MISSING', level: 'INCOMPLETE', severity: 'LOW', field: 'CPF', problem: 'CPF não informado no sistema anterior.',
    guidance: 'Preencha o CPF quando tiver o documento do paciente.', manual: false, bucket: 'CPF',
  },
  INVALID_CPF: {
    group: 'INVALID', level: 'REVIEW', severity: 'MEDIUM', field: 'CPF', problem: 'CPF inválido no sistema anterior.',
    guidance: 'Verifique o documento do paciente e informe o CPF correto.', manual: false, bucket: 'CPF',
  },
  DUPLICATE_CPF: {
    group: 'DUPLICATE', level: 'REVIEW', severity: 'HIGH', field: 'CPF', problem: 'CPF repetido em outro cadastro.',
    guidance: 'O CPF não foi gravado neste cadastro para não conflitar. Confira se é a mesma pessoa antes de preencher.', manual: false, bucket: 'DUPLICIDADE',
  },
  MISSING_BIRTH_DATE: {
    group: 'MISSING', level: 'INCOMPLETE', severity: 'LOW', field: 'Nascimento', problem: 'Data de nascimento não informada no sistema anterior.',
    guidance: 'Preencha a data de nascimento quando confirmar com o paciente.', manual: false, bucket: 'NASCIMENTO',
  },
  INVALID_BIRTH_DATE: {
    group: 'INVALID', level: 'REVIEW', severity: 'MEDIUM', field: 'Nascimento', problem: 'Data de nascimento inválida no sistema anterior.',
    guidance: 'Confirme com o paciente ou com o cadastro antigo e informe a data correta.', manual: false, bucket: 'NASCIMENTO',
  },
  MISSING_PHONE: {
    group: 'MISSING', level: 'INCOMPLETE', severity: 'LOW', field: 'Telefone', problem: 'Telefone não informado no sistema anterior.',
    guidance: 'Sem telefone válido o WhatsApp fica indisponível. Preencha quando tiver o número.', manual: false, bucket: 'TELEFONE',
  },
  INVALID_PHONE: {
    group: 'INVALID', level: 'REVIEW', severity: 'MEDIUM', field: 'Telefone', problem: 'Telefone inválido no sistema anterior.',
    guidance: 'O número não foi gravado. Confirme o telefone com o paciente.', manual: false, bucket: 'TELEFONE',
  },
  PLACEHOLDER_PHONE: {
    group: 'INVALID', level: 'REVIEW', severity: 'MEDIUM', field: 'Telefone', problem: 'Telefone de exemplo (placeholder) no sistema anterior.',
    guidance: 'O número não é real e não foi gravado. Confirme o telefone com o paciente.', manual: false, bucket: 'TELEFONE',
  },
  POSSIBLE_DUPLICATE: {
    group: 'DUPLICATE', level: 'REVIEW', severity: 'HIGH', field: 'Possível duplicidade', problem: 'Existe outro cadastro semelhante.',
    guidance: 'Compare os dois cadastros antes de consolidar. Depois de analisar, marque a pendência como revisada.', manual: true, bucket: 'DUPLICIDADE',
  },
  EXISTING_PATIENT_DIVERGENCE: {
    group: 'DUPLICATE', level: 'REVIEW', severity: 'HIGH', field: 'Possível duplicidade', problem: 'Parece ser um paciente que já existia, mas os dados divergem.',
    guidance: 'Confirme se é a mesma pessoa e qual dado está correto. Nada foi mesclado automaticamente.', manual: true, bucket: 'DUPLICIDADE',
  },
  MULTIPLE_LEGACY_SAME_PATIENT: {
    group: 'DUPLICATE', level: 'REVIEW', severity: 'HIGH', field: 'Possível duplicidade', problem: 'Mais de um cadastro do sistema anterior aponta para o mesmo paciente.',
    guidance: 'Decida qual cadastro é o correto (ou consolide) e marque a pendência como revisada.', manual: true, bucket: 'DUPLICIDADE',
  },
  GUARDIAN_REVIEW: {
    group: 'OTHER', level: 'REVIEW', severity: 'MEDIUM', field: 'Responsável', problem: 'O responsável precisa de conferência.',
    guidance: 'Confira nome, CPF e telefone do responsável e marque a pendência como revisada.', manual: true, bucket: 'RESPONSAVEL',
  },
  OTHER_DATA_REVIEW: {
    group: 'OTHER', level: 'REVIEW', severity: 'MEDIUM', field: 'Outros dados', problem: 'Outro dado do cadastro precisa de conferência.',
    guidance: 'Confira o cadastro e marque a pendência como revisada.', manual: true, bucket: 'OUTROS',
  },
};

export interface PatientReviewIssue {
  id: string;
  tenantId: string;
  patientId: string;
  source: string;
  issueCode: ReviewIssueCode;
  fieldName: string;
  severity: ReviewSeverity;
  message: string;
  legacyValue?: string;
  relatedPatientId?: string;
  dedupeKey: string;
  status: ReviewIssueStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  createdAt: string;
}

/** Pendência ainda por criar (rascunho gerado pela migração). */
export interface ReviewIssueDraft {
  issueCode: ReviewIssueCode;
  fieldName: string;
  severity: ReviewSeverity;
  message: string;
  legacyValue?: string;
  /** Cliente legado da outra ponta da duplicidade (o servidor resolve o paciente pelo mapa). */
  relatedLegacyId?: string;
  relatedPatientId?: string;
  dedupeKey: string;
}

export function buildDedupeKey(code: ReviewIssueCode, fieldName = '', related = ''): string {
  return [code, fieldName, related].join('|');
}

function draft(
  code: ReviewIssueCode,
  fieldName: string,
  extra: { legacyValue?: string; relatedLegacyId?: string; relatedPatientId?: string; message?: string } = {}
): ReviewIssueDraft {
  const meta = ISSUE_META[code];
  return {
    issueCode: code,
    fieldName,
    severity: meta.severity,
    message: extra.message || meta.problem,
    legacyValue: extra.legacyValue || undefined,
    relatedLegacyId: extra.relatedLegacyId,
    relatedPatientId: extra.relatedPatientId,
    dedupeKey: buildDedupeKey(code, fieldName, extra.relatedLegacyId || extra.relatedPatientId || ''),
  };
}

// ─── Derivação a partir do que a migração encontrou ─────────────────────────────────

export interface FieldIssueInput {
  cpfClassification: 'VALID' | 'BLANK' | 'PLACEHOLDER' | 'INVALID';
  /** Valor original do CPF (preservado só para auditoria/painel). */
  cpfRaw?: string;
  /** CPF válido gravado como canônico neste cadastro. */
  cpfPersisted: boolean;
  /** CPF válido que NÃO foi gravado por conflito com outro cadastro. */
  cpfConflict: boolean;
  birthValue: string | null;
  birthRaw: string;
  birthInvalid: boolean;
  phoneClassification: 'VALID' | 'BLANK' | 'PLACEHOLDER' | 'INVALID';
  phoneRaw?: string;
  /** O paciente tem telefone efetivo (próprio ou herdado do responsável). */
  hasEffectivePhone: boolean;
}

export function deriveFieldIssues(input: FieldIssueInput): ReviewIssueDraft[] {
  const out: ReviewIssueDraft[] = [];

  if (input.cpfClassification === 'BLANK') {
    out.push(draft('MISSING_CPF', 'cpf'));
  } else if (input.cpfClassification === 'PLACEHOLDER' || input.cpfClassification === 'INVALID') {
    out.push(draft('INVALID_CPF', 'cpf', { legacyValue: input.cpfRaw }));
  } else if (input.cpfClassification === 'VALID' && input.cpfConflict && !input.cpfPersisted) {
    out.push(draft('DUPLICATE_CPF', 'cpf', { legacyValue: input.cpfRaw }));
  }

  if (input.birthInvalid) {
    out.push(draft('INVALID_BIRTH_DATE', 'birth_date', { legacyValue: input.birthRaw }));
  } else if (!input.birthValue && !input.birthRaw) {
    out.push(draft('MISSING_BIRTH_DATE', 'birth_date'));
  }

  if (!input.hasEffectivePhone) {
    if (input.phoneClassification === 'PLACEHOLDER') out.push(draft('PLACEHOLDER_PHONE', 'phone', { legacyValue: input.phoneRaw }));
    else if (input.phoneClassification === 'INVALID') out.push(draft('INVALID_PHONE', 'phone', { legacyValue: input.phoneRaw }));
    else if (input.phoneClassification === 'BLANK') out.push(draft('MISSING_PHONE', 'phone'));
  }

  return out;
}

export function makeIdentityIssue(
  code: 'POSSIBLE_DUPLICATE' | 'EXISTING_PATIENT_DIVERGENCE' | 'MULTIPLE_LEGACY_SAME_PATIENT' | 'GUARDIAN_REVIEW' | 'OTHER_DATA_REVIEW',
  opts: { relatedLegacyId?: string; relatedPatientId?: string; message?: string } = {}
): ReviewIssueDraft {
  return draft(code, code === 'GUARDIAN_REVIEW' ? 'guardian' : 'identity', opts);
}

/** Remove repetidas (mesma chave) preservando a primeira — reexecução nunca duplica. */
export function dedupeDrafts(drafts: ReviewIssueDraft[]): ReviewIssueDraft[] {
  const seen = new Set<string>();
  return drafts.filter((d) => (seen.has(d.dedupeKey) ? false : (seen.add(d.dedupeKey), true)));
}

// ─── Resolução automática (objetiva) ────────────────────────────────────────────────

export interface ResolvablePatient {
  documentType?: 'CPF' | 'CNPJ';
  cpf?: string;
  phone?: string;
  birthDate?: string;
}

export interface ResolutionContext {
  /** Outro paciente do tenant já usa este documento (só dígitos)? */
  isDocumentTakenByOther: (digits: string) => boolean;
}

export function isIssueAutoResolvable(code: ReviewIssueCode): boolean {
  return !ISSUE_META[code].manual;
}

/**
 * A pendência foi resolvida OBJETIVAMENTE pelos dados atuais do paciente? Ambiguidade de
 * identidade nunca resolve aqui (manual) — só "Marcar como revisada" ou consolidação.
 */
export function isIssueObjectivelyResolved(code: ReviewIssueCode, patient: ResolvablePatient, ctx: ResolutionContext): boolean {
  if (ISSUE_META[code].manual) return false;
  switch (code) {
    case 'MISSING_CPF':
    case 'INVALID_CPF':
    case 'DUPLICATE_CPF': {
      const digits = (patient.cpf || '').replace(/\D/g, '');
      if (!digits) return false;
      const valid = patient.documentType === 'CNPJ' ? digits.length === 14 && isValidCnpj(digits) : digits.length === 11 && isValidCpf(digits);
      return valid && !ctx.isDocumentTakenByOther(digits);
    }
    case 'MISSING_BIRTH_DATE':
    case 'INVALID_BIRTH_DATE': {
      if (patient.documentType === 'CNPJ') return true; // empresa não tem nascimento
      const b = (patient.birthDate || '').trim();
      return Boolean(b) && isValidCivilDate(b) && !isFutureCivilDate(b);
    }
    case 'MISSING_PHONE':
    case 'INVALID_PHONE':
    case 'PLACEHOLDER_PHONE':
      return classifyBrazilianPhone(patient.phone || '').classification === 'VALID';
    default:
      return false;
  }
}

/** Quais pendências ABERTAS a edição acabou de resolver. */
export function findIssuesResolvedByEdit(
  openIssues: PatientReviewIssue[],
  patient: ResolvablePatient,
  ctx: ResolutionContext
): PatientReviewIssue[] {
  return openIssues.filter((i) => i.status === 'OPEN' && isIssueObjectivelyResolved(i.issueCode, patient, ctx));
}

// ─── Resumo, badge, filtro e fila ───────────────────────────────────────────────────

export type PatientReviewStatus = 'SEM_PENDENCIAS' | 'PENDENTE' | 'REVISADO';

export interface ReviewSummary {
  status: PatientReviewStatus;
  openCount: number;
  /** Abertas de nível REVISÃO NECESSÁRIA (inválido/ambíguo) — NÃO inclui campo apenas ausente. */
  reviewCount: number;
  /** Abertas de nível CADASTRO INCOMPLETO (campo ausente). */
  incompleteCount: number;
  hasReview: boolean;
  hasIncomplete: boolean;
  totalCount: number;
  hasDuplicate: boolean;
  /** Menor ordem de grupo entre as abertas (0 = duplicidade). */
  topGroupOrder: number;
  openIssues: PatientReviewIssue[];
}

export function summarizeReview(issues: PatientReviewIssue[] | undefined): ReviewSummary {
  const list = issues || [];
  const open = list.filter((i) => i.status === 'OPEN');
  const hasDuplicate = open.some((i) => ISSUE_META[i.issueCode]?.group === 'DUPLICATE');
  const reviewCount = open.filter((i) => ISSUE_META[i.issueCode]?.level !== 'INCOMPLETE').length;
  const incompleteCount = open.length - reviewCount;
  const topGroupOrder = open.length ? Math.min(...open.map((i) => GROUP_ORDER[ISSUE_META[i.issueCode]?.group || 'OTHER'])) : 99;
  return {
    status: open.length > 0 ? 'PENDENTE' : list.some((i) => i.status !== 'DISMISSED') ? 'REVISADO' : 'SEM_PENDENCIAS',
    openCount: open.length,
    reviewCount,
    incompleteCount,
    hasReview: reviewCount > 0,
    hasIncomplete: incompleteCount > 0,
    totalCount: list.length,
    hasDuplicate,
    topGroupOrder,
    openIssues: open,
  };
}

export type ReviewBadgeKind = 'DUPLICATE' | 'REVIEW' | 'INCOMPLETE';
export interface ReviewBadge {
  /** DUPLICATE = identidade ambígua; REVIEW = dado inválido/outros; INCOMPLETE = só falta dado (visual discreto). */
  kind: ReviewBadgeKind;
  text: string;
  title: string;
}

/**
 * Badge da lista: UM só, o de MAIOR severidade (duplicidade > revisar > incompleto) — nunca vários
 * badges na mesma linha, nunca valores sensíveis. Só falta CPF/nascimento/telefone = "Cadastro
 * incompleto" (discreto, sem tom de erro). null quando não há pendência aberta.
 */
export function reviewBadge(summary: ReviewSummary): ReviewBadge | null {
  if (summary.openCount === 0) return null;
  const more = (n: number) => (n > 0 ? ` (+${n})` : '');
  if (summary.hasDuplicate) {
    return {
      kind: 'DUPLICATE',
      text: 'Possível duplicidade',
      title: `Possível duplicidade — conferir identidade${more(summary.openCount - 1)}`,
    };
  }
  if (summary.hasReview) {
    return {
      kind: 'REVIEW',
      text: 'Revisar cadastro',
      title: `Dado a revisar: ${summary.reviewCount}${summary.incompleteCount ? ` · campos ausentes: ${summary.incompleteCount}` : ''}`,
    };
  }
  return {
    kind: 'INCOMPLETE',
    text: 'Cadastro incompleto',
    title: `Campos não informados no sistema anterior: ${summary.incompleteCount}`,
  };
}

/** NEEDS_REVIEW = "Revisar cadastro" (inválido/ambíguo — NÃO conta campo apenas ausente); INCOMPLETE = "Cadastro incompleto". */
export type ReviewFilter = 'ALL' | 'NEEDS_REVIEW' | 'INCOMPLETE' | 'POSSIBLE_DUPLICATE';

export function groupIssuesByPatient(issues: PatientReviewIssue[]): Record<string, PatientReviewIssue[]> {
  const out: Record<string, PatientReviewIssue[]> = {};
  for (const i of issues) (out[i.patientId] ||= []).push(i);
  return out;
}

export function filterPatientsByReview<T extends { id: string }>(
  patients: T[],
  issuesByPatient: Record<string, PatientReviewIssue[]>,
  filter: ReviewFilter
): T[] {
  if (filter === 'ALL') return patients;
  return patients.filter((p) => {
    const s = summarizeReview(issuesByPatient[p.id]);
    if (filter === 'NEEDS_REVIEW') return s.hasReview;
    if (filter === 'INCOMPLETE') return s.hasIncomplete;
    return s.hasDuplicate;
  });
}

/**
 * Fila de revisão: duplicidade primeiro, depois dado inválido, depois outros, por fim dado
 * faltante; dentro do mesmo grupo, mais pendências de REVISÃO primeiro; empate por nome (estável).
 */
export function sortPatientsByReviewPriority<T extends { id: string; name: string }>(
  patients: T[],
  issuesByPatient: Record<string, PatientReviewIssue[]>
): T[] {
  return [...patients].sort((a, b) => {
    const sa = summarizeReview(issuesByPatient[a.id]);
    const sb = summarizeReview(issuesByPatient[b.id]);
    if (sa.topGroupOrder !== sb.topGroupOrder) return sa.topGroupOrder - sb.topGroupOrder;
    // Na fila de revisão, campo apenas AUSENTE não pesa: conta só o que é inválido/ambíguo.
    if (sa.reviewCount !== sb.reviewCount) return sb.reviewCount - sa.reviewCount;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

/**
 * Ordem da fila conforme o filtro: "Revisar cadastro"/"Possível duplicidade" -> duplicidade primeiro,
 * depois dado inválido, depois outros; "Cadastro incompleto" -> quem tem MAIS campos ausentes primeiro
 * (completar de uma vez), depois nome. Sem filtro: a ordem original é preservada.
 */
export function sortPatientsForReviewFilter<T extends { id: string; name: string }>(
  patients: T[],
  issuesByPatient: Record<string, PatientReviewIssue[]>,
  filter: ReviewFilter
): T[] {
  if (filter === 'ALL') return patients;
  if (filter === 'INCOMPLETE') {
    return [...patients].sort((a, b) => {
      const ia = summarizeReview(issuesByPatient[a.id]).incompleteCount;
      const ib = summarizeReview(issuesByPatient[b.id]).incompleteCount;
      return ib - ia || a.name.localeCompare(b.name, 'pt-BR');
    });
  }
  return sortPatientsByReviewPriority(patients, issuesByPatient);
}

export interface ReviewQueueCounts {
  /** Pendências ABERTAS por nível. */
  issues: { total: number; incomplete: number; review: number; duplicate: number };
  /** PACIENTES distintos com pelo menos uma pendência aberta do nível. */
  patients: { any: number; incomplete: number; review: number; duplicate: number };
}

export function countReviewQueues(issues: PatientReviewIssue[]): ReviewQueueCounts {
  const out: ReviewQueueCounts = {
    issues: { total: 0, incomplete: 0, review: 0, duplicate: 0 },
    patients: { any: 0, incomplete: 0, review: 0, duplicate: 0 },
  };
  const sets = { any: new Set<string>(), incomplete: new Set<string>(), review: new Set<string>(), duplicate: new Set<string>() };
  for (const i of issues) {
    if (i.status !== 'OPEN') continue;
    const meta = ISSUE_META[i.issueCode];
    out.issues.total++;
    sets.any.add(i.patientId);
    if (meta?.level === 'INCOMPLETE') {
      out.issues.incomplete++;
      sets.incomplete.add(i.patientId);
    } else {
      out.issues.review++;
      sets.review.add(i.patientId);
    }
    if (meta?.group === 'DUPLICATE') {
      out.issues.duplicate++;
      sets.duplicate.add(i.patientId);
    }
  }
  out.patients = { any: sets.any.size, incomplete: sets.incomplete.size, review: sets.review.size, duplicate: sets.duplicate.size };
  return out;
}

/** Linhas do painel de pendências, na ordem de prioridade (abertas primeiro). */
export function sortIssuesForPanel(issues: PatientReviewIssue[]): PatientReviewIssue[] {
  const rank = (i: PatientReviewIssue) => (i.status === 'OPEN' ? 0 : 1) * 10 + GROUP_ORDER[ISSUE_META[i.issueCode]?.group || 'OTHER'];
  return [...issues].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
}

/** Contagem de PACIENTES distintos com pendência aberta, por bucket do relatório. */
export function countPatientsByBucket(issues: PatientReviewIssue[]): Record<ReviewBucket | 'TOTAL', number> {
  const byBucket: Record<ReviewBucket, Set<string>> = {
    CPF: new Set(), NASCIMENTO: new Set(), TELEFONE: new Set(), DUPLICIDADE: new Set(), RESPONSAVEL: new Set(), OUTROS: new Set(),
  };
  const total = new Set<string>();
  for (const i of issues) {
    if (i.status !== 'OPEN') continue;
    byBucket[ISSUE_META[i.issueCode]?.bucket || 'OUTROS'].add(i.patientId);
    total.add(i.patientId);
  }
  return {
    TOTAL: total.size,
    CPF: byBucket.CPF.size,
    NASCIMENTO: byBucket.NASCIMENTO.size,
    TELEFONE: byBucket.TELEFONE.size,
    DUPLICIDADE: byBucket.DUPLICIDADE.size,
    RESPONSAVEL: byBucket.RESPONSAVEL.size,
    OUTROS: byBucket.OUTROS.size,
  };
}

/** Máscara para badge/lista: nunca o valor completo. */
export function maskSensitiveLegacyValue(code: ReviewIssueCode, raw: string | undefined): string {
  const v = (raw || '').trim();
  if (!v) return '';
  const digits = v.replace(/\D/g, '');
  if (ISSUE_META[code].bucket === 'CPF' && digits.length >= 4) return `***.***.***-${digits.slice(-2)}`;
  if (ISSUE_META[code].bucket === 'TELEFONE' && digits.length >= 4) return `(**) *****-${digits.slice(-4)}`;
  return v;
}

// ─── Exclusão segura ────────────────────────────────────────────────────────────────

export interface PatientDeleteCheck {
  ok: boolean;
  code?: string;
  message?: string;
  canDelete?: boolean;
  blocking?: Record<string, number>;
  detach?: Record<string, number>;
}

const BLOCKING_LABELS: Record<string, string> = {
  sales: 'venda(s)/recebível(is)',
  appointments: 'consulta(s) na agenda',
  clinical_records: 'registro(s) de prontuário',
  clinical_attachments: 'documento(s) anexado(s)',
  before_after_pairs: 'registro(s) de antes/depois',
};
const DETACH_LABELS: Record<string, string> = {
  guardian_links: 'vínculo(s) de responsável',
  guardian_is_this_patient: 'responsável ligado a este paciente',
  whatsapp_links: 'vínculo(s) de contato WhatsApp',
};

export function describeReferences(refs: Record<string, number> | undefined, kind: 'blocking' | 'detach'): string[] {
  const labels = kind === 'blocking' ? BLOCKING_LABELS : DETACH_LABELS;
  return Object.entries(refs || {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${labels[k] || k}`);
}

export type DeletionDecision =
  | { kind: 'BLOCKED_HISTORY'; message: string; references: string[] }
  | { kind: 'ALLOWED'; detach: string[] }
  | { kind: 'ERROR'; message: string };

/** Traduz a resposta do servidor em decisão de UI (a verdade é sempre a do servidor). */
export function decidePatientDeletion(check: PatientDeleteCheck | null | undefined): DeletionDecision {
  if (!check || !check.ok) return { kind: 'ERROR', message: check?.message || 'Não foi possível verificar as referências do paciente.' };
  if (!check.canDelete) {
    return {
      kind: 'BLOCKED_HISTORY',
      message: 'Este paciente possui histórico e não pode ser excluído diretamente.',
      references: describeReferences(check.blocking, 'blocking'),
    };
  }
  return { kind: 'ALLOWED', detach: describeReferences(check.detach, 'detach') };
}
