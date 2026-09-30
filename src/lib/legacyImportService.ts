// Orquestração da migração de sistema anterior (Clientes.xls + Prontuarios.xls):
// parse -> normalização -> matching -> plano de responsáveis -> preview/dry-run
// (sem gravar dado de negócio) -> commit em lotes de PACIENTES via a Edge
// Function dental-legacy-patient-import (tenant travado na sessão, JWT real).
//
// Fase atual da migração: só pacientes/responsáveis/vínculos/mapa legado.
// Prontuários são lidos apenas para validar a resolução prontuário -> paciente
// (gate da próxima fase) — nenhum df_clinical_records é gravado; a própria
// Edge Function recusa commit_records_batch nesta fase.

import { supabase, SupabaseService } from './supabaseClient';
import type { Patient, LegacyImportSession } from '../types';
import {
  parseLegacySpreadsheetFile,
  findMissingColumns,
  CLIENTES_REQUIRED_COLUMNS,
  PRONTUARIOS_REQUIRED_COLUMNS,
} from './legacyImportParsers';
import {
  buildNormalizedClient,
  buildNormalizedRecord,
  classifyPatientRows,
  classifyRecordRows,
  applyReviewImportPolicy,
  isCreatableResult,
  planGuardians,
  resolveRecordsToPatients,
  ClientMatchResult,
  RecordMatchResult,
  RecordResolutionResult,
  NormalizedLegacyClient,
  GuardianPlan,
  GuardianReviewItem,
} from './legacyImportMatching';
import {
  ReviewIssueDraft,
  deriveFieldIssues,
  makeIdentityIssue,
  dedupeDrafts,
} from './patientReviewIssues';
import { proposeProfessionalMapping, ProfessionalProposal } from './legacyProfessionalMapping';
import { legacyProfessionalKey } from './legacyClinicalPlan';

export const LEGACY_SOURCE_SYSTEM = 'legacy_dental_system_xls_v1';
// Lotes de 100: o servidor aceita até 250, mas cada lote faz consultas com
// cláusulas IN(...) sobre os ids — 100 mantém a URL bem abaixo dos limites.
export const LEGACY_COMMIT_BATCH_SIZE = 100;
export const LEGACY_ISSUE_BATCH_SIZE = 150;

async function extractEdgeFunctionError(error: any): Promise<string> {
  if (!error) return 'Erro desconhecido.';
  try {
    if (error.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      if (body?.error) return body.error;
    }
  } catch (_e) {
    /* noop */
  }
  return error.message || 'Falha na comunicação com o servidor.';
}

export async function computeFileChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const countBy = <T,>(arr: T[], pred: (x: T) => boolean) => arr.reduce((n, x) => (pred(x) ? n + 1 : n), 0);

// ----------------------------------------------------------------------
// DRY RUN — client-side, nunca grava dado de negócio.
// ----------------------------------------------------------------------

export interface DryRunSummary {
  totalClients: number;
  newPatients: number;
  linkedPatients: number;
  linkedByLegacyMap: number;
  linkedByCpf: number;
  linkedByStrong: number;
  conflicts: number;
  invalid: number;
  reviewRequired: number;
  /** Clientes que a classificação mandaria para revisão e que ENTRAM como cadastro provisório. */
  provisionalPatients: number;
  /** Cadastros legados já excluídos/rejeitados pela clínica (nunca recriados). */
  ignoredByClinic: number;
  reviewByCategory: Record<string, number>;
  reviewIssues: { rows: number; planned: number; byCode: Record<string, number>; backfillRows: number };
  cpf: { valid: number; blank: number; placeholder: number; invalid: number; duplicatedValidRows: number };
  phones: { valid: number; blank: number; placeholder: number; invalid: number };
  phoneOwner: { patient: number; responsible: number; responsibleWithoutOwnPhone: number; withoutPhone: number };
  guardians: {
    patientsWithGuardianData: number;
    selfReferences: number;
    patientsLinkedToGuardian: number;
    guardiansPlanned: number;
    guardiansReusingExisting: number;
    groupsWithTwoOrMore: number;
    largestGroup: number;
    phoneConflictGroups: number;
    reviewItems: number;
  };
  totalRecords: number;
  validRecords: number;
  problemRecords: number;
  recordResolution: Record<string, number>;
  recordsNeedingReview: number;
}

export interface DryRunResult {
  clientResults: ClientMatchResult[];
  recordResults: RecordMatchResult[];
  recordResolution: RecordResolutionResult[];
  guardianPlan: GuardianPlan;
  summary: DryRunSummary;
  distinctLegacyDentists: string[];
  /** Linhas para sincronizar pendências cadastrais (novos + provisórios + backfill dos já importados). */
  issueSyncRows: IssueSyncRow[];
  /** Proposta de dentista legado -> profissional atual (só propõe; confirmação é do usuário). */
  professionalProposals: ProfessionalProposal[];
  /** Mapeamentos de profissional já confirmados neste tenant (df_legacy_import_map entity 'professional'). */
  confirmedProfessionalMappings: Array<{ legacyName: string; professionalId: string }>;
  distinctTuss: { code: string; description: string; count: number }[];
  clientsFileChecksum: string;
  recordsFileChecksum?: string;
}

export interface RunDryRunOptions {
  targetTenantId: string;
  sourceSystem?: string;
  clientsFile: File;
  recordsFile?: File | null;
}

export async function runDryRun(options: RunDryRunOptions): Promise<DryRunResult> {
  const sourceSystem = options.sourceSystem || LEGACY_SOURCE_SYSTEM;

  const clientsTable = await parseLegacySpreadsheetFile(options.clientsFile);
  const missingClientCols = findMissingColumns(clientsTable.headers, CLIENTES_REQUIRED_COLUMNS);
  if (missingClientCols.length > 0) {
    throw new Error(
      `Arquivo de clientes não reconhecido — colunas obrigatórias ausentes: ${missingClientCols.join(', ')}. Confira se o arquivo correto foi selecionado.`
    );
  }

  const [clientsFileChecksum, patientsRes, mapRes, guardiansRes] = await Promise.all([
    computeFileChecksum(options.clientsFile),
    SupabaseService.getPatientsForTenant(options.targetTenantId),
    SupabaseService.getLegacyImportMapForTenant(options.targetTenantId, sourceSystem),
    SupabaseService.getGuardiansForTenant(options.targetTenantId),
  ]);
  // Sem a lista completa de pacientes/mapa/responsáveis do tenant, o matching
  // trataria duplicatas como "novas" — o dry-run falha em vez de seguir.
  if (patientsRes.error) throw new Error(`Não foi possível ler os pacientes da clínica: ${patientsRes.error}`);
  if (mapRes.error) throw new Error(`Não foi possível ler o mapa legado da clínica: ${mapRes.error}`);
  if (guardiansRes.error) throw new Error(`Não foi possível ler os responsáveis da clínica: ${guardiansRes.error}`);

  const existingPatients: Patient[] = patientsRes.data;
  const mapByPrimary = new Map<string, string>();
  const mapBySecondary = new Map<string, string>();
  const mapKindByLegacyId = new Map<string, string>();
  // Registros legados que a clínica já revisou/excluiu (status != ACTIVE): nunca recriados.
  const ignoredLegacyIds = new Map<string, string>();
  const existingRecordLegacyMap = new Set<string>();
  const confirmedProfessionalMappings: Array<{ legacyName: string; professionalId: string }> = [];
  for (const entry of mapRes.data) {
    if (entry.entityType === 'patient') {
      if (entry.status && entry.status !== 'ACTIVE') {
        ignoredLegacyIds.set(entry.legacyId, entry.status);
        continue;
      }
      mapByPrimary.set(entry.legacyId, entry.targetId);
      if (entry.legacySecondaryId) mapBySecondary.set(entry.legacySecondaryId, entry.targetId);
      if (entry.matchKind) mapKindByLegacyId.set(entry.legacyId, entry.matchKind);
    }
    if (entry.entityType === 'clinical_record') existingRecordLegacyMap.add(entry.legacyId);
    if (entry.entityType === 'professional' && (!entry.status || entry.status === 'ACTIVE')) {
      confirmedProfessionalMappings.push({ legacyName: entry.legacyId, professionalId: entry.targetId });
    }
  }

  const normalizedClients: NormalizedLegacyClient[] = clientsTable.rows.map((row) => buildNormalizedClient(row, sourceSystem));
  // Classificação bruta (preserva categoria/motivo para o relatório) + política da clínica: dado
  // incompleto ou identidade ambígua NÃO bloqueia — o cliente entra como cadastro (provisório, se
  // ambíguo) com identidade legada própria e pendências estruturadas. Nunca mescla nem vincula sozinho.
  const rawResults = classifyPatientRows(normalizedClients, existingPatients, mapByPrimary, ignoredLegacyIds);
  const clientResults = applyReviewImportPolicy(rawResults, existingPatients);
  const guardianPlan = planGuardians(clientResults, guardiansRes.data);
  const existingPatientById = new Map(existingPatients.map((p) => [p.id, p]));
  const issueSyncRows = buildIssueSyncRows(clientResults, guardianPlan, guardiansRes.data, existingPatientById, mapKindByLegacyId);
  const clientMatchByLegacyId = new Map(clientResults.map((r) => [r.row.legacyId, r]));

  let recordResults: RecordMatchResult[] = [];
  let recordResolution: RecordResolutionResult[] = [];
  let recordsFileChecksum: string | undefined;
  const distinctLegacyDentists = new Set<string>();
  const dentistCounts = new Map<string, number>();
  const tussCounts = new Map<string, { description: string; count: number }>();

  if (options.recordsFile) {
    const recordsTable = await parseLegacySpreadsheetFile(options.recordsFile);
    const missingRecordCols = findMissingColumns(recordsTable.headers, PRONTUARIOS_REQUIRED_COLUMNS);
    if (missingRecordCols.length > 0) {
      throw new Error(
        `Arquivo de prontuários não reconhecido — colunas obrigatórias ausentes: ${missingRecordCols.join(', ')}. Confira se o arquivo correto foi selecionado.`
      );
    }
    recordsFileChecksum = await computeFileChecksum(options.recordsFile);
    const normalizedRecords = recordsTable.rows.map(buildNormalizedRecord);
    recordResults = classifyRecordRows(normalizedRecords, clientMatchByLegacyId, existingRecordLegacyMap);
    recordResolution = resolveRecordsToPatients(normalizedRecords, clientMatchByLegacyId, mapByPrimary, mapBySecondary);

    for (const r of normalizedRecords) {
      if (r.dentistaLegado) {
        distinctLegacyDentists.add(r.dentistaLegado);
        dentistCounts.set(r.dentistaLegado, (dentistCounts.get(r.dentistaLegado) || 0) + 1);
      }
      if (r.codigoTuss) {
        const cur = tussCounts.get(r.codigoTuss) || { description: r.descricao, count: 0 };
        cur.count += 1;
        tussCounts.set(r.codigoTuss, cur);
      }
    }
  }

  const tenantProfessionals = dentistCounts.size > 0 ? await SupabaseService.getProfessionalsForTenant(options.targetTenantId) : [];
  const professionalProposals = proposeProfessionalMapping(
    [...dentistCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    tenantProfessionals
  );

  const reviewByCategory: Record<string, number> = {};
  clientResults.forEach((r) => {
    if (r.reviewCategory) reviewByCategory[r.reviewCategory] = (reviewByCategory[r.reviewCategory] || 0) + 1;
  });
  const decisions = [...guardianPlan.phoneOwnerByLegacyId.values()];
  const groupSizes = guardianPlan.clusters.map((c) => c.memberLegacyIds.length);
  const recordResolutionCounts: Record<string, number> = {};
  recordResolution.forEach((r) => (recordResolutionCounts[r.resolution] = (recordResolutionCounts[r.resolution] || 0) + 1));

  const summary: DryRunSummary = {
    totalClients: clientResults.length,
    newPatients: countBy(clientResults, (r) => r.status === 'NOVO'),
    linkedPatients: countBy(clientResults, (r) => r.status === 'VINCULAR'),
    linkedByLegacyMap: countBy(clientResults, (r) => r.status === 'VINCULAR' && r.matchKind === 'LEGACY_MAP'),
    linkedByCpf: countBy(clientResults, (r) => r.status === 'VINCULAR' && r.matchKind === 'CPF'),
    linkedByStrong: countBy(clientResults, (r) => r.status === 'VINCULAR' && r.matchKind === 'STRONG'),
    conflicts: countBy(clientResults, (r) => r.status === 'CONFLITO'),
    invalid: countBy(clientResults, (r) => r.status === 'INVALIDO'),
    reviewRequired: countBy(clientResults, (r) => r.status === 'REVISAR'),
    provisionalPatients: countBy(clientResults, (r) => r.status === 'PROVISORIO'),
    ignoredByClinic: ignoredLegacyIds.size,
    reviewByCategory,
    reviewIssues: {
      rows: issueSyncRows.length,
      planned: issueSyncRows.reduce((n, r) => n + r.review_issues.length, 0),
      byCode: issueSyncRows.reduce((acc, r) => {
        r.review_issues.forEach((i) => (acc[i.issueCode] = (acc[i.issueCode] || 0) + 1));
        return acc;
      }, {} as Record<string, number>),
      backfillRows: issueSyncRows.filter((r) => r.backfill).length,
    },
    cpf: {
      valid: countBy(normalizedClients, (c) => c.cpf.classification === 'VALID'),
      blank: countBy(normalizedClients, (c) => c.cpf.classification === 'BLANK'),
      placeholder: countBy(normalizedClients, (c) => c.cpf.classification === 'PLACEHOLDER'),
      invalid: countBy(normalizedClients, (c) => c.cpf.classification === 'INVALID'),
      duplicatedValidRows: countBy(clientResults, (r) => r.reviewCategory === 'CPF_DUPLICADO'),
    },
    phones: {
      valid: countBy(normalizedClients, (c) => c.phoneInfo.classification === 'VALID'),
      blank: countBy(normalizedClients, (c) => c.phoneInfo.classification === 'BLANK'),
      placeholder: countBy(normalizedClients, (c) => c.phoneInfo.classification === 'PLACEHOLDER'),
      invalid: countBy(normalizedClients, (c) => c.phoneInfo.classification === 'INVALID'),
    },
    phoneOwner: {
      patient: countBy(decisions, (d) => d.phoneOwner === 'PATIENT'),
      responsible: countBy(decisions, (d) => d.phoneOwner === 'RESPONSIBLE'),
      responsibleWithoutOwnPhone: countBy(decisions, (d) => d.basis === 'SEM_TELEFONE_PROPRIO_USA_RESPONSAVEL'),
      withoutPhone: countBy(decisions, (d) => d.basis === 'SEM_TELEFONE'),
    },
    guardians: {
      patientsWithGuardianData: countBy(normalizedClients, (c) => Boolean(c.guardian?.name)),
      selfReferences: guardianPlan.selfReferenceCount,
      patientsLinkedToGuardian: guardianPlan.assignmentByLegacyId.size,
      guardiansPlanned: guardianPlan.clusters.length,
      guardiansReusingExisting: countBy(guardianPlan.clusters, (c) => Boolean(c.existingGuardianId)),
      groupsWithTwoOrMore: countBy(groupSizes, (n) => n > 1),
      largestGroup: groupSizes.length > 0 ? Math.max(...groupSizes) : 0,
      phoneConflictGroups: countBy(guardianPlan.clusters, (c) => c.phoneConflict),
      reviewItems: guardianPlan.review.length,
    },
    totalRecords: recordResults.length,
    validRecords: countBy(recordResults, (r) => r.status === 'NOVO' || r.status === 'VINCULAR'),
    problemRecords: countBy(recordResults, (r) => !(r.status === 'NOVO' || r.status === 'VINCULAR')),
    recordResolution: recordResolutionCounts,
    recordsNeedingReview: countBy(recordResolution, (r) => r.recordNeedsReview),
  };

  return {
    clientResults,
    recordResults,
    recordResolution,
    guardianPlan,
    summary,
    distinctLegacyDentists: Array.from(distinctLegacyDentists).sort(),
    issueSyncRows,
    professionalProposals,
    confirmedProfessionalMappings,
    distinctTuss: Array.from(tussCounts.entries())
      .map(([code, v]) => ({ code, description: v.description, count: v.count }))
      .sort((a, b) => b.count - a.count),
    clientsFileChecksum,
    recordsFileChecksum,
  };
}

// ----------------------------------------------------------------------
// Sessão de importação (Edge Function dental-legacy-patient-import)
// ----------------------------------------------------------------------

export async function createImportSession(params: {
  targetTenantId: string;
  sourceSystem?: string;
  clientsFileName: string;
  clientsFileChecksum: string;
  recordsFileName?: string;
  recordsFileChecksum?: string;
}): Promise<{ success: boolean; session?: LegacyImportSession; error?: string }> {
  const { data, error } = await supabase.functions.invoke('dental-legacy-patient-import', {
    body: {
      action: 'create_session',
      target_tenant_id: params.targetTenantId,
      source_system: params.sourceSystem || LEGACY_SOURCE_SYSTEM,
      clients_file_name: params.clientsFileName,
      clients_file_checksum: params.clientsFileChecksum,
      records_file_name: params.recordsFileName,
      records_file_checksum: params.recordsFileChecksum,
    },
  });
  if (error) return { success: false, error: await extractEdgeFunctionError(error) };
  if (!data?.success) return { success: false, error: data?.error || 'Falha ao criar sessão de importação.' };
  return { success: true, session: mapSessionFromApi(data.session) };
}

function mapSessionFromApi(row: any): LegacyImportSession {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    targetTenantName: row.target_tenant_name,
    sourceSystem: row.source_system,
    status: row.status,
    clientsFileName: row.clients_file_name,
    clientsFileChecksum: row.clients_file_checksum,
    recordsFileName: row.records_file_name,
    recordsFileChecksum: row.records_file_checksum,
    drySummary: row.dry_run_summary,
    professionalMapping: row.professional_mapping,
    procedureMapping: row.procedure_mapping,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveDryRunResult(params: {
  sessionId: string;
  summary: DryRunSummary;
  professionalMapping: Record<string, { professionalId?: string; displayName: string; keepLegacy: boolean }>;
  procedureMapping: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('dental-legacy-patient-import', {
    body: {
      action: 'save_dry_run_result',
      session_id: params.sessionId,
      summary: params.summary,
      professional_mapping: params.professionalMapping,
      procedure_mapping: params.procedureMapping,
    },
  });
  if (error) return { success: false, error: await extractEdgeFunctionError(error) };
  if (!data?.success) return { success: false, error: data?.error || 'Falha ao salvar resultado do dry run.' };
  return { success: true };
}

export async function invalidateImportSession(sessionId: string): Promise<void> {
  await supabase.functions.invoke('dental-legacy-patient-import', {
    body: { action: 'invalidate_session', session_id: sessionId },
  });
}

// ----------------------------------------------------------------------
// Commit de PACIENTES
// ----------------------------------------------------------------------

export interface PatientCommitRow {
  action: 'CREATE' | 'LINK_EXISTING';
  legacy_id: string;
  legacy_secondary_id: string;
  checksum: string;
  existing_patient_id?: string;
  match_kind?: 'LINKED_CPF' | 'LINKED_STRONG';
  /** Cadastro provisório de revisão (identidade ambígua): criado com identidade legada própria, nunca mesclado. */
  provisional?: boolean;
  patient: Record<string, any>;
  guardian?: {
    cluster_key: string;
    name: string;
    cpf: string;
    phone: string;
    email: string;
    relationship_type: string;
  };
}

/**
 * Linha de commit de um cliente: CREATE para NOVO, LINK_EXISTING para vínculo
 * confirmado com paciente existente (CPF/combinação forte — só grava o mapa,
 * nunca altera o paciente). null para tudo o que não é importado automaticamente
 * (conflito, revisão, inválido) e para o que já está no mapa legado.
 */
export function buildPatientCommitRow(result: ClientMatchResult, plan?: GuardianPlan): PatientCommitRow | null {
  const r = result.row;
  const base = { legacy_id: r.legacyId, legacy_secondary_id: r.legacyClientId, checksum: r.legacyId };

  if (result.status === 'VINCULAR') {
    if (result.matchKind === 'LEGACY_MAP' || !result.matchedPatientId) return null;
    return {
      ...base,
      action: 'LINK_EXISTING',
      existing_patient_id: result.matchedPatientId,
      match_kind: result.matchKind === 'STRONG' ? 'LINKED_STRONG' : 'LINKED_CPF',
      patient: { cpf: r.cpf.classification === 'VALID' ? r.cpf.cleaned : '' },
    };
  }
  if (!isCreatableResult(result)) return null;

  const provisional = result.status === 'PROVISORIO';
  // CPF válido só vira canônico quando não conflita com outro cadastro (política de revisão).
  const persistCpf = provisional ? Boolean(result.provisional?.persistCpf) : true;
  const decision = plan?.phoneOwnerByLegacyId.get(r.legacyId);
  const assignment = plan?.assignmentByLegacyId.get(r.legacyId);
  const cluster = assignment ? plan?.clusters.find((c) => c.clusterKey === assignment.clusterKey) : undefined;

  return {
    ...base,
    action: 'CREATE',
    provisional,
    patient: {
      name: r.name,
      cpf: r.cpf.classification === 'VALID' && persistCpf ? r.cpf.cleaned : '',
      email: r.email || '',
      own_phone: r.phone, // '' quando telefone1 não é VALID
      phone_owner: decision?.phoneOwner || 'PATIENT',
      birth_date: r.birthDate.value || '',
      notes: r.notes || '',
      clinical_notes: r.clinicalNotes || '',
      // df_patients não tem city/state: cidade/UF ficam em legacy_metadata.address.
      legacy_metadata: r.legacyMetadata,
    },
    guardian: cluster
      ? {
          cluster_key: cluster.clusterKey,
          name: cluster.name,
          cpf: cluster.cpf,
          phone: cluster.phone,
          email: cluster.email,
          relationship_type: assignment?.relationshipType || '',
        }
      : undefined,
  };
}

export function buildPatientCommitRows(dryRun: DryRunResult): PatientCommitRow[] {
  return dryRun.clientResults
    .map((r) => buildPatientCommitRow(r, dryRun.guardianPlan))
    .filter((r): r is PatientCommitRow => r !== null);
}

export interface PatientImportProgress {
  batchesDone: number;
  batchesTotal: number;
  rowsDone: number;
  rowsTotal: number;
  created: number;
  linked: number;
  alreadyImported: number;
  errors: number;
}

export interface PatientImportOutcome {
  success: boolean;
  error?: string;
  failedBatch?: number;
  progress: PatientImportProgress;
  rowErrors: Array<{ legacy_id: string; error: string }>;
  counters: { guardiansCreated: number; guardiansReused: number; linksCreated: number };
  issues: { rowsSent: number; created: number; alreadyExisting: number; skippedResolved: number; mirrored: number; rejected: number };
}

/**
 * Importa SOMENTE pacientes (criação + vínculo a existentes), em lotes. Para no
 * primeiro lote que falhar como um todo (não segue "como se tivesse passado"),
 * registra o erro na sessão e devolve o último lote consistente — reexecutar é
 * seguro (idempotência por mapa legado + ids determinísticos no servidor).
 */
export async function importPatients(
  sessionId: string,
  dryRun: DryRunResult,
  onProgress?: (p: PatientImportProgress) => void
): Promise<PatientImportOutcome> {
  const rows = buildPatientCommitRows(dryRun);
  const batches = chunk(rows, LEGACY_COMMIT_BATCH_SIZE);
  const progress: PatientImportProgress = {
    batchesDone: 0,
    batchesTotal: batches.length,
    rowsDone: 0,
    rowsTotal: rows.length,
    created: 0,
    linked: 0,
    alreadyImported: 0,
    errors: 0,
  };
  const rowErrors: Array<{ legacy_id: string; error: string }> = [];
  const counters = { guardiansCreated: 0, guardiansReused: 0, linksCreated: 0 };
  const issues = { rowsSent: 0, created: 0, alreadyExisting: 0, skippedResolved: 0, mirrored: 0, rejected: 0 };
  onProgress?.({ ...progress });

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const { data, error } = await supabase.functions.invoke('dental-legacy-patient-import', {
      body: { action: 'commit_patients_batch', session_id: sessionId, rows: batch },
    });
    const batchError = error ? await extractEdgeFunctionError(error) : !data?.success ? data?.error || 'Falha no lote.' : null;
    if (batchError) {
      await supabase.functions.invoke('dental-legacy-patient-import', {
        body: {
          action: 'record_batch_error',
          session_id: sessionId,
          batch: i + 1,
          legacy_ids: batch.map((r) => r.legacy_id),
          error: batchError,
          last_consistent_batch: i,
        },
      });
      return { success: false, error: batchError, failedBatch: i + 1, progress, rowErrors, counters, issues };
    }
    for (const res of data.results || []) {
      if (res.status === 'created') progress.created++;
      else if (res.status === 'linked') progress.linked++;
      else if (res.status === 'already_imported') progress.alreadyImported++;
      else if (res.status === 'error') {
        progress.errors++;
        rowErrors.push({ legacy_id: res.legacy_id, error: res.error });
      }
    }
    counters.guardiansCreated += data.counters?.guardiansCreated || 0;
    counters.guardiansReused += data.counters?.guardiansReused || 0;
    counters.linksCreated += data.counters?.linksCreated || 0;
    progress.batchesDone = i + 1;
    progress.rowsDone += batch.length;
    onProgress?.({ ...progress });
  }

  // Pendências cadastrais (novos + provisórios + backfill dos já importados), idempotentes no servidor.
  const issueBatches = chunk(dryRun.issueSyncRows, LEGACY_ISSUE_BATCH_SIZE);
  for (let i = 0; i < issueBatches.length; i++) {
    const { data, error } = await supabase.functions.invoke('dental-legacy-patient-import', {
      body: { action: 'apply_review_issues', session_id: sessionId, rows: issueBatches[i] },
    });
    const issueError = error ? await extractEdgeFunctionError(error) : !data?.success ? data?.error || 'Falha ao gravar pendências.' : null;
    if (issueError) {
      return { success: false, error: `Pendências cadastrais (lote ${i + 1}): ${issueError}`, failedBatch: i + 1, progress, rowErrors, counters, issues };
    }
    issues.rowsSent += issueBatches[i].length;
    issues.created += data.counters?.created || 0;
    issues.alreadyExisting += data.counters?.alreadyExisting || 0;
    issues.skippedResolved += data.counters?.skippedResolved || 0;
    issues.mirrored += data.counters?.mirrored || 0;
    issues.rejected += data.counters?.rejected || 0;
  }

  await supabase.functions.invoke('dental-legacy-patient-import', {
    body: {
      action: 'finalize_session',
      session_id: sessionId,
      client_summary: { ...progress, counters, issues, rowErrors: rowErrors.slice(0, 200) },
    },
  });
  return { success: true, progress, rowErrors, counters, issues };
}

// ----------------------------------------------------------------------
// Pendências cadastrais (df_patient_review_issues)
// ----------------------------------------------------------------------

export interface IssueSyncRow {
  legacy_id: string;
  review_issues: ReviewIssueDraft[];
  /** true = paciente JÁ importado antes desta regra (backfill); o servidor só grava se o dado atual ainda falta. */
  backfill?: boolean;
}

/**
 * Linhas de pendência a sincronizar:
 *  - clientes que ENTRAM agora (NOVO/PROVISORIO): as pendências derivadas na política + revisão de responsável;
 *  - pacientes JÁ criados por migração (mapa CREATED/CREATED_REVIEW): backfill do que ainda falta NO
 *    CADASTRO ATUAL (o servidor reconfere contra o paciente real e nunca duplica).
 * Pacientes vinculados a existentes / consolidados manualmente não geram pendência (o cadastro
 * é da clínica, não da migração).
 */
export function buildIssueSyncRows(
  results: ClientMatchResult[],
  plan: GuardianPlan,
  existingGuardians: Array<{ id: string; name: string; cpf?: string; phone?: string }>,
  existingPatientById: Map<string, Patient>,
  mapKindByLegacyId: Map<string, string>
): IssueSyncRow[] {
  const guardianDraft = (item: GuardianReviewItem) =>
    makeIdentityIssue('GUARDIAN_REVIEW', { message: `${item.reason} (${item.requiredDecision})` });

  const reviewByLegacy = new Map<string, GuardianReviewItem[]>();
  plan.review.forEach((g) => reviewByLegacy.set(g.legacyId, [...(reviewByLegacy.get(g.legacyId) || []), g]));

  // Backfill de responsável: refaz o plano tratando os já criados como criáveis (mesmas decisões da
  // importação original) para reencontrar os vínculos ambíguos que ficaram sem responsável.
  const shadow: ClientMatchResult[] = results.map((r) =>
    r.status === 'VINCULAR' &&
    r.matchKind === 'LEGACY_MAP' &&
    ['CREATED', 'CREATED_REVIEW'].includes(mapKindByLegacyId.get(r.row.legacyId) || '')
      ? { ...r, status: 'NOVO' }
      : r
  );
  const shadowReview = planGuardians(shadow, existingGuardians).review;
  const shadowReviewByLegacy = new Map<string, GuardianReviewItem[]>();
  shadowReview.forEach((g) => shadowReviewByLegacy.set(g.legacyId, [...(shadowReviewByLegacy.get(g.legacyId) || []), g]));

  const rows: IssueSyncRow[] = [];
  for (const r of results) {
    if (isCreatableResult(r)) {
      const drafts = dedupeDrafts([...(r.reviewIssues || []), ...(reviewByLegacy.get(r.row.legacyId) || []).map(guardianDraft)]);
      if (drafts.length > 0) rows.push({ legacy_id: r.row.legacyId, review_issues: drafts });
      continue;
    }
    const kind = mapKindByLegacyId.get(r.row.legacyId) || '';
    if (r.status === 'VINCULAR' && r.matchKind === 'LEGACY_MAP' && ['CREATED', 'CREATED_REVIEW'].includes(kind) && r.matchedPatientId) {
      const patient = existingPatientById.get(r.matchedPatientId);
      if (!patient) continue;
      const row = r.row;
      const drafts = deriveFieldIssues({
        // Só pendência do que AINDA falta no cadastro atual (a recepção pode já ter preenchido).
        cpfClassification: patient.cpf ? 'VALID' : row.cpf.classification === 'VALID' ? 'BLANK' : row.cpf.classification,
        cpfRaw: row.legacyMetadata.rawCpfOriginal || row.legacyMetadata.legacyCpfRaw,
        cpfPersisted: Boolean(patient.cpf),
        cpfConflict: false,
        birthValue: patient.birthDate || null,
        birthRaw: patient.birthDate ? patient.birthDate : row.birthDate.raw,
        birthInvalid: !patient.birthDate && row.birthDate.reviewRequired,
        phoneClassification: patient.phone ? 'VALID' : row.phoneInfo.classification === 'VALID' ? 'BLANK' : row.phoneInfo.classification,
        phoneRaw: row.legacyMetadata.rawPhoneOriginal,
        hasEffectivePhone: Boolean(patient.phone),
      });
      const all = dedupeDrafts([...drafts, ...(shadowReviewByLegacy.get(row.legacyId) || []).map(guardianDraft)]);
      if (all.length > 0) rows.push({ legacy_id: row.legacyId, review_issues: all, backfill: true });
    }
  }
  return rows;
}

// ----------------------------------------------------------------------
// Mapeamento definitivo de dentista legado -> profissional atual
// ----------------------------------------------------------------------

export async function confirmProfessionalMapping(
  sessionId: string,
  entries: Array<{ legacyName: string; professionalId: string; aliases?: string[] }>
): Promise<{ success: boolean; error?: string; saved?: number }> {
  const { data, error } = await supabase.functions.invoke('dental-legacy-patient-import', {
    body: {
      action: 'confirm_professional_mapping',
      session_id: sessionId,
      entries: entries.map((e) => ({ legacy_name: e.legacyName, professional_id: e.professionalId, aliases: e.aliases || [] })),
    },
  });
  if (error) return { success: false, error: await extractEdgeFunctionError(error) };
  if (!data?.success) return { success: false, error: data?.error || 'Falha ao confirmar o mapeamento do profissional.' };
  return { success: true, saved: data.saved };
}

// ----------------------------------------------------------------------
// Relatório de revisão (somente problemas — registros seguros não entram)
// ----------------------------------------------------------------------

export type ReviewSheet = { name: string; rows: (string | number)[][] };

export function buildReviewSheets(dryRun: DryRunResult): ReviewSheet[] {
  const header = ['identificador', 'id_cliente', 'nome', 'status', 'motivo', 'decisão necessária'];
  const clientLine = (r: ClientMatchResult, extra: (string | number)[] = []) => [
    r.row.legacyId,
    r.row.legacyClientId,
    r.row.name,
    r.status,
    r.reason,
    r.requiredDecision || '',
    ...extra,
  ];
  const notImported = dryRun.clientResults.filter((r) => r.status !== 'NOVO' && r.status !== 'VINCULAR');
  const byCat = (cat: string) => dryRun.clientResults.filter((r) => r.reviewCategory === cat);
  const clientById = new Map(dryRun.clientResults.map((r) => [r.row.legacyId, r]));

  const phoneProblems = dryRun.clientResults.filter(
    (r) => r.row.phoneInfo.classification === 'PLACEHOLDER' || r.row.phoneInfo.classification === 'INVALID'
  );

  const matchReview = dryRun.clientResults.filter(
    (r) =>
      r.reviewCategory === 'MATCH_EXISTENTE_REVIEW' ||
      r.reviewCategory === 'MULTIPLOS_LEGADOS_MESMO_PACIENTE' ||
      r.reviewCategory === 'MATCH_MULTIPLO_EXISTENTE' ||
      r.reviewCategory === 'CPF_MULTIPLOS_EXISTENTES' ||
      r.reviewCategory === 'POSSIVEL_DUPLICATA_EXISTENTE'
  );

  const phoneConflictKeys = new Set(dryRun.guardianPlan.clusters.filter((c) => c.phoneConflict).map((c) => c.clusterKey));

  return [
    { name: 'CLIENTES_NAO_IMPORTADOS', rows: [header, ...notImported.map((r) => clientLine(r))] },
    {
      name: 'CPF_CONFLITOS',
      rows: [
        [...header, 'cpf'],
        ...byCat('CPF_DUPLICADO').map((r) => clientLine(r, [r.row.cpf.cleaned])),
      ],
    },
    {
      name: 'DATAS_INVALIDAS',
      rows: [
        [...header, 'valor original', 'valor normalizado'],
        ...dryRun.clientResults
          .filter((r) => r.row.birthDate.reviewRequired)
          .map((r) => clientLine(r, [r.row.birthDate.raw, '(nenhum — não corrigido)'])),
      ],
    },
    {
      name: 'MATCHS_EXISTENTES_REVIEW',
      rows: [
        [...header, 'paciente candidato', 'qualidade', 'comparação por campo'],
        ...matchReview.map((r) =>
          clientLine(r, [
            r.matchedPatientId || (r.conflictCandidateIds || []).join(';'),
            r.existingQuality || '',
            (r.fieldComparison || []).map((f) => `${f.field}:${f.result}`).join(' | '),
          ])
        ),
      ],
    },
    {
      name: 'RESPONSAVEIS_REVIEW',
      rows: [
        ['identificador', 'id_cliente', 'paciente', 'responsável', 'motivo', 'decisão necessária'],
        ...dryRun.guardianPlan.review.map((g) => [g.legacyId, g.legacyClientId, g.patientName, g.guardianName, g.reason, g.requiredDecision]),
      ],
    },
    {
      name: 'TELEFONES_INVALIDOS',
      rows: [
        [...header, 'telefone original', 'classificação', 'status do paciente'],
        ...phoneProblems.map((r) => [
          r.row.legacyId,
          r.row.legacyClientId,
          r.row.name,
          r.status,
          r.row.phoneInfo.reason || r.row.phoneInfo.classification,
          r.status === 'NOVO' ? 'Importado sem telefone (ou pelo telefone do responsável) — informar número real depois' : r.requiredDecision || '',
          r.row.legacyMetadata.rawPhoneOriginal || '',
          r.row.phoneInfo.classification,
          r.status,
        ]),
      ],
    },
    {
      name: 'GRUPOS_FAMILIARES_REVIEW',
      rows: [
        ['chave do responsável', 'responsável', 'pacientes (identificador)', 'motivo', 'decisão necessária'],
        ...dryRun.guardianPlan.clusters
          .filter((c) => phoneConflictKeys.has(c.clusterKey) || c.nameVariants.length > 1)
          .map((c) => [
            c.clusterKey.startsWith('cpf:') ? 'CPF' : c.clusterKey.split(':')[0].toUpperCase(),
            c.name,
            c.memberLegacyIds.join(';'),
            c.phoneConflict
              ? 'Mesmo responsável (CPF) com telefones diferentes entre os pacientes — criado sem telefone.'
              : `Mesmo CPF com grafias diferentes do nome: ${c.nameVariants.join(' / ')}`,
            c.phoneConflict ? 'Informar o telefone correto do responsável' : 'Conferir o nome do responsável',
          ]),
      ],
    },
    {
      name: 'PRONTUARIOS_BLOQUEADOS',
      rows: [
        ['identificador_prontuario', 'identificador_cliente', 'id_cliente', 'cliente', 'data', 'procedimento', 'dentista', 'situação', 'motivo', 'decisão necessária'],
        ...dryRun.recordResolution
          .filter((x) => (x.resolution !== 'RESOLVED' && x.resolution !== 'PENDING_PATIENT_IMPORT') || x.recordNeedsReview)
          .map((x) => {
            const client = clientById.get(x.record.patientLegacyId);
            return [
              x.record.legacyId,
              x.record.patientLegacyId,
              x.record.patientLegacyClientId,
              x.record.clienteRaw,
              x.record.dataRealizacao.raw || x.record.dataAbertura.raw,
              x.record.descricao,
              x.record.dentistaLegado,
              x.recordNeedsReview && (x.resolution === 'RESOLVED' || x.resolution === 'PENDING_PATIENT_IMPORT') ? 'RECORD_REVIEW' : x.resolution,
              x.recordNeedsReview && (x.resolution === 'RESOLVED' || x.resolution === 'PENDING_PATIENT_IMPORT')
                ? 'Registro com data/status implausível'
                : x.reason,
              x.resolution === 'BLOCKED_BY_PATIENT_REVIEW'
                ? `Resolver antes o cliente (${client?.reviewCategory || client?.status || ''})`
                : 'Corrigir a data/status do procedimento na origem',
            ];
          }),
      ],
    },
  ];
}

// ----------------------------------------------------------------------
// Prontuários — funções puras mantidas para a PRÓXIMA fase (não chamadas
// por nenhuma tela nesta fase; o servidor recusa commit_records_batch).
// ----------------------------------------------------------------------

interface RecordCommitRow {
  legacy_id: string;
  patient_legacy_id: string;
  checksum: string;
  record: Record<string, any>;
}

export function buildRecordCommitRow(
  result: RecordMatchResult,
  professionalMapping: Record<string, { professionalId?: string; displayName: string; keepLegacy: boolean }>,
  procedureMapping: Record<string, string>,
  patientTargetId: string
): RecordCommitRow | null {
  if (result.status !== 'NOVO') return null;
  const r = result.row;
  const dentistChoice = professionalMapping[r.dentistaLegado];
  const professionalName = dentistChoice?.keepLegacy === false ? dentistChoice.displayName : r.dentistaLegado;

  return {
    legacy_id: r.legacyId,
    patient_legacy_id: r.patientLegacyId,
    checksum: r.legacyId,
    record: {
      // professional_id é NOT NULL: sem mapeamento confirmado usa a CHAVE legacy_dentist:<nome> (não é
      // usuário nem profissional; nada é criado). Ver legacyClinicalPlan.ts.
      professional_id:
        dentistChoice?.keepLegacy === false && dentistChoice.professionalId
          ? dentistChoice.professionalId
          : legacyProfessionalKey(r.dentistaLegado),
      professional_name: professionalName,
      record_type: 'PROCEDIMENTO',
      origin: 'IMPORT',
      status: 'FINALIZED',
      finalized_by: 'legacy_import',
      legacy_dentist_name: r.dentistaLegado,
      procedure_id: procedureMapping[r.codigoTuss] || undefined,
      procedure_name: r.descricao,
      legacy_tuss_code: r.codigoTuss || undefined,
      legacy_procedure_name: r.descricao,
      record_date: result.recordDate,
      evolution: r.procedimentos || r.descricao,
      tooth_number: r.denteRegiao || undefined,
      tooth_face: r.face || undefined,
      legacy_status: r.statusLegado,
      import_metadata: {
        dataAbertura: r.dataAbertura.value,
        identificadorGuia: r.identificadorGuia,
        idGuia: r.idGuia,
        idItemGuia: r.idItemGuia,
        clienteRaw: r.clienteRaw,
        patientTargetId,
      },
    },
  };
}
