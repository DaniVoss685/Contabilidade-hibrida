// Plano da importação CLÍNICA (procedimentos históricos) — PURO e sem efeito: nada é gravado aqui.
//
// Contrato para a tarefa separada que fará o commit dos prontuários seguros:
//  - NÃO é tudo-ou-nada: cada linha é classificada sozinha. As elegíveis entram; as demais ficam em
//    quarentena com o motivo (ex.: a linha com data 12/05/4021 NÃO bloqueia as outras 9.003).
//  - Chave de idempotência: `identificador_prontuario` (único nas 9.004 linhas). `id_item_guia` NÃO é
//    único e nunca é chave. O servidor grava o mapa (tenant, source, 'clinical_record', legacy_id) e o
//    id determinístico do registro; reexecutar não duplica.
//  - Cada linha vira UM registro clínico estruturado (df_clinical_records): tipo PROCEDIMENTO, origem
//    IMPORT, data, procedimento, TUSS, dente, face, dentista, status legado — nunca um texto solto.
//  - ZERO efeito financeiro: o payload não tem (e o teste garante que não pode ter) valor, venda,
//    recebível, alocação, comissão, imposto, Receita Saúde, banco ou agenda. df_clinical_records não
//    possui triggers.
//  - Status: o status técnico é SEMPRE FINALIZED (registro histórico imutável — nunca DRAFT, que é
//    estado operacional editável/excluível); o status ORIGINAL ("Finalizado" | "Em Execução") vai em
//    legacy_status e é o que a UI mostra ("Em Execução (legado)").

import type { RecordResolutionResult, NormalizedLegacyRecord } from './legacyImportMatching';

export type ClinicalEligibility =
  | 'ELIGIBLE'
  | 'REVIEW_INVALID_RECORD_DATE'
  | 'REVIEW_INVALID_RECORD_STATUS'
  | 'ORPHAN'
  | 'PATIENT_ID_MISSING'
  | 'IDENTITY_CONFLICT'
  | 'PATIENT_DELETED'
  | 'ALREADY_IMPORTED'
  | 'DUPLICATE_LEGACY_ID'
  | 'INVALID_LEGACY_ID';

export interface ClinicalPlanItem {
  legacyId: string;
  eligibility: ClinicalEligibility;
  patientId?: string;
  /** data_realizacao (Finalizado) ou data_abertura (Em Execução / sem realização) já normalizada. */
  recordDate?: string;
  reason: string;
  source: RecordResolutionResult;
}

export interface ClinicalCommitPlan {
  total: number;
  counts: Record<ClinicalEligibility, number>;
  eligible: ClinicalPlanItem[];
  /** Tudo que NÃO entra neste commit (revisão/órfão/conflito...) — nunca bloqueia as elegíveis. */
  quarantined: ClinicalPlanItem[];
  /** Sempre false: não existe regra all-or-nothing. */
  allOrNothing: false;
}

const ALL_ELIGIBILITY: ClinicalEligibility[] = [
  'ELIGIBLE', 'REVIEW_INVALID_RECORD_DATE', 'REVIEW_INVALID_RECORD_STATUS', 'ORPHAN', 'PATIENT_ID_MISSING',
  'IDENTITY_CONFLICT', 'PATIENT_DELETED', 'ALREADY_IMPORTED', 'DUPLICATE_LEGACY_ID', 'INVALID_LEGACY_ID',
];

/** Status originais aceitos e como aparecem no sistema atual. Qualquer outro valor vai para revisão. */
export const HISTORICAL_STATUS_MAP: Record<string, { technicalStatus: 'FINALIZED'; label: string }> = {
  Finalizado: { technicalStatus: 'FINALIZED', label: 'Finalizado (legado)' },
  'Em Execução': { technicalStatus: 'FINALIZED', label: 'Em Execução (legado)' },
};

export function recordDateOf(r: NormalizedLegacyRecord): string | undefined {
  if (r.statusLegado === 'Finalizado') return r.dataRealizacao.value || r.dataAbertura.value || undefined;
  return r.dataAbertura.value || undefined;
}

/**
 * Classifica CADA prontuário de forma independente. `alreadyImported` = legacy_ids já presentes no mapa
 * clínico (idempotência: uma segunda execução não recria nem duplica).
 */
export function planClinicalCommit(
  resolutions: RecordResolutionResult[],
  alreadyImported: Set<string> = new Set()
): ClinicalCommitPlan {
  const counts = Object.fromEntries(ALL_ELIGIBILITY.map((k) => [k, 0])) as Record<ClinicalEligibility, number>;
  const seen = new Set<string>();
  const items: ClinicalPlanItem[] = resolutions.map((res) => {
    const legacyId = res.record.legacyId;
    const mk = (eligibility: ClinicalEligibility, reason: string): ClinicalPlanItem => ({
      legacyId,
      eligibility,
      patientId: res.patientId,
      recordDate: recordDateOf(res.record),
      reason,
      source: res,
    });

    if (!legacyId) return mk('INVALID_LEGACY_ID', 'identificador_prontuario ausente — sem chave de idempotência.');
    if (seen.has(legacyId)) return mk('DUPLICATE_LEGACY_ID', 'identificador_prontuario repetido no arquivo.');
    seen.add(legacyId);
    if (alreadyImported.has(legacyId)) return mk('ALREADY_IMPORTED', 'Já importado (mapa clínico) — não é recriado.');

    switch (res.resolution) {
      case 'ORPHAN':
        return mk('ORPHAN', res.reason);
      case 'DIVERGENCE':
        return mk('IDENTITY_CONFLICT', res.reason);
      case 'PATIENT_DELETED':
        return mk('PATIENT_DELETED', res.reason);
      case 'BLOCKED_BY_PATIENT_REVIEW':
      case 'PENDING_PATIENT_IMPORT':
        return mk('PATIENT_ID_MISSING', res.reason);
      case 'RESOLVED':
        break;
    }
    if (!res.patientId) return mk('PATIENT_ID_MISSING', 'Sem patient_id resolvido.');

    // Problema do PRÓPRIO registro: fica de fora sozinho, sem afetar os demais.
    if (res.record.dataAbertura.reviewRequired || res.record.dataRealizacao.reviewRequired) {
      return mk('REVIEW_INVALID_RECORD_DATE', `Data implausível (${res.record.dataRealizacao.raw || res.record.dataAbertura.raw}) — não é corrigida automaticamente.`);
    }
    if (!HISTORICAL_STATUS_MAP[res.record.statusLegado] || !recordDateOf(res.record)) {
      return mk('REVIEW_INVALID_RECORD_STATUS', `Status "${res.record.statusLegado}" desconhecido ou sem data utilizável.`);
    }
    return mk('ELIGIBLE', 'Elegível para o commit histórico.');
  });

  for (const it of items) counts[it.eligibility]++;
  return {
    total: items.length,
    counts,
    eligible: items.filter((i) => i.eligibility === 'ELIGIBLE'),
    quarantined: items.filter((i) => i.eligibility !== 'ELIGIBLE' && i.eligibility !== 'ALREADY_IMPORTED'),
    allOrNothing: false,
  };
}

// ─── Profissional ───────────────────────────────────────────────────────────────────

/**
 * df_clinical_records.professional_id é NOT NULL. Dentista SEM mapeamento confirmado recebe uma CHAVE de
 * agrupamento `legacy_dentist:<nome>` — NÃO é usuário, NÃO é profissional, não existe em df_professionals
 * nem df_users, e nada é criado. O nome real fica em professional_name e legacy_dentist_name; se a clínica
 * um dia cadastrar o profissional, um UPDATE controlado por legacy_dentist_name religa os registros.
 */
export const LEGACY_PROFESSIONAL_KEY_PREFIX = 'legacy_dentist:';

export function legacyProfessionalKey(legacyName: string): string {
  const slug = (legacyName || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${LEGACY_PROFESSIONAL_KEY_PREFIX}${slug || 'sem_nome'}`;
}

// ─── Linha de commit (estrutura clínica) ────────────────────────────────────────────

export type ProfessionalChoice = { professionalId?: string; displayName: string; keepLegacy: boolean };

export interface ClinicalRecordPayload {
  professional_id: string;
  professional_name: string;
  /** Nome do dentista NO ARQUIVO, sempre preservado (auditoria histórica), mesmo quando mapeado. */
  legacy_dentist_name: string;
  record_type: 'PROCEDIMENTO';
  origin: 'IMPORT';
  status: 'FINALIZED';
  legacy_status: string;
  record_date: string;
  procedure_id?: string;
  procedure_name: string;
  legacy_procedure_name: string;
  legacy_tuss_code?: string;
  evolution: string;
  tooth_number?: string;
  tooth_face?: string;
  finalized_by: 'legacy_import';
  import_metadata: Record<string, unknown>;
}

export interface ClinicalCommitRow {
  legacy_id: string; // identificador_prontuario — chave de idempotência
  patient_legacy_id: string;
  patient_id: string;
  checksum: string;
  record: ClinicalRecordPayload;
}

/** Campos que NUNCA podem aparecer num registro clínico histórico (zero efeito financeiro/agenda). */
export const FORBIDDEN_FINANCIAL_KEYS = [
  'sale_id', 'sale', 'total_value', 'value', 'price', 'amount', 'installments', 'receivable', 'payment',
  'commission', 'tax', 'receita_saude', 'bank_account_id', 'appointment_id', 'expense', 'cost',
];

export function payloadHasFinancialKeys(payload: Record<string, unknown>): string[] {
  const hit: string[] = [];
  const walk = (obj: unknown, path: string) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (FORBIDDEN_FINANCIAL_KEYS.includes(k.toLowerCase())) hit.push(path + k);
      walk(v, `${path}${k}.`);
    }
  };
  walk(payload, '');
  return hit;
}

/** Linha estruturada de um prontuário ELEGÍVEL. Devolve null para qualquer item não elegível. */
export function buildClinicalCommitRow(
  item: ClinicalPlanItem,
  professionalMapping: Record<string, ProfessionalChoice> = {},
  procedureMapping: Record<string, string> = {}
): ClinicalCommitRow | null {
  if (item.eligibility !== 'ELIGIBLE' || !item.patientId || !item.recordDate) return null;
  const r = item.source.record;
  const historical = HISTORICAL_STATUS_MAP[r.statusLegado];
  if (!historical) return null;

  const choice = professionalMapping[r.dentistaLegado];
  const mapped = choice && choice.keepLegacy === false && choice.professionalId;
  const description = r.descricao || r.procedimentos || '';

  return {
    legacy_id: r.legacyId,
    patient_legacy_id: r.patientLegacyId,
    patient_id: item.patientId,
    checksum: r.legacyId,
    record: {
      professional_id: mapped ? choice!.professionalId! : legacyProfessionalKey(r.dentistaLegado),
      professional_name: mapped ? choice!.displayName : r.dentistaLegado,
      legacy_dentist_name: r.dentistaLegado,
      record_type: 'PROCEDIMENTO',
      origin: 'IMPORT',
      status: historical.technicalStatus,
      legacy_status: r.statusLegado,
      record_date: item.recordDate,
      procedure_id: procedureMapping[r.codigoTuss] || undefined,
      procedure_name: description,
      legacy_procedure_name: r.descricao,
      legacy_tuss_code: r.codigoTuss || undefined,
      evolution: r.procedimentos || description,
      tooth_number: r.denteRegiao || undefined,
      tooth_face: r.face || undefined,
      finalized_by: 'legacy_import',
      import_metadata: {
        dataAbertura: r.dataAbertura.value,
        dataRealizacao: r.dataRealizacao.value,
        identificadorGuia: r.identificadorGuia,
        idGuia: r.idGuia,
        idItemGuia: r.idItemGuia, // contexto — NÃO é chave (não é único)
        clienteRaw: r.clienteRaw,
        legacyProfessionalName: r.dentistaLegado,
        professionalMapping: mapped ? 'USER_CONFIRMED' : 'LEGACY_NAME_PRESERVED',
      },
    },
  };
}

/** Linhas de commit de TODAS as elegíveis (independentes entre si). */
export function buildClinicalCommitRows(
  plan: ClinicalCommitPlan,
  professionalMapping: Record<string, ProfessionalChoice> = {},
  procedureMapping: Record<string, string> = {}
): ClinicalCommitRow[] {
  return plan.eligible
    .map((i) => buildClinicalCommitRow(i, professionalMapping, procedureMapping))
    .filter((r): r is ClinicalCommitRow => r !== null);
}
