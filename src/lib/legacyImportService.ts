// Orquestração da migração de sistema anterior: parse -> normalização ->
// matching -> preview/dry-run (sem gravar nada de negócio) e, quando o
// usuário confirmar, commit em lotes via a Edge Function
// dental-legacy-patient-import.
//
// IMPORTANTE (ver plano em C:\Users\Guilherme\.claude\plans\warm-swimming-kay.md,
// seção "Fase 20"/"Consequência desta rodada"): as funções de commit abaixo
// (commitPatientsBatch/commitRecordsBatch/importAll) existem e estão prontas
// para uso, mas NÃO são invocadas por nenhum fluxo desta rodada — a UI só vai
// até o dry-run. Ficam prontas para a próxima rodada, quando o usuário
// autorizar a importação definitiva.

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
  ClientMatchResult,
  RecordMatchResult,
  NormalizedLegacyClient,
} from './legacyImportMatching';

export const LEGACY_SOURCE_SYSTEM = 'legacy_dental_system_xls_v1';
export const LEGACY_COMMIT_BATCH_SIZE = 200; // teto do servidor é 250 (MAX_BATCH_SIZE na Edge Function)

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

// ----------------------------------------------------------------------
// DRY RUN — 100% client-side, nunca grava df_patients/df_clinical_records.
// ----------------------------------------------------------------------

export interface DryRunSummary {
  totalClients: number;
  newPatients: number;
  linkedPatients: number;
  conflicts: number;
  invalid: number;
  reviewRequired: number;
  totalRecords: number;
  validRecords: number;
  problemRecords: number;
}

export interface DryRunResult {
  clientResults: ClientMatchResult[];
  recordResults: RecordMatchResult[];
  summary: DryRunSummary;
  distinctLegacyDentists: string[];
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

  const [clientsFileChecksum, patientsRes, legacyPatientMapRes] = await Promise.all([
    computeFileChecksum(options.clientsFile),
    SupabaseService.getPatientsForTenant(options.targetTenantId),
    SupabaseService.getLegacyImportMapForTenant(options.targetTenantId, sourceSystem),
  ]);

  const existingPatients: Patient[] = patientsRes.data;
  const existingPatientLegacyMap = new Map<string, string>();
  const existingRecordLegacyMap = new Set<string>();
  for (const entry of legacyPatientMapRes.data) {
    if (entry.entityType === 'patient') existingPatientLegacyMap.set(entry.legacyId, entry.targetId);
    if (entry.entityType === 'clinical_record') existingRecordLegacyMap.add(entry.legacyId);
  }

  const normalizedClients: NormalizedLegacyClient[] = clientsTable.rows.map((row) =>
    buildNormalizedClient(row, sourceSystem)
  );
  const clientResults = classifyPatientRows(normalizedClients, existingPatients, existingPatientLegacyMap);
  const clientMatchByLegacyId = new Map(clientResults.map((r) => [r.row.legacyId, r]));

  let recordResults: RecordMatchResult[] = [];
  let recordsFileChecksum: string | undefined;
  const distinctLegacyDentists = new Set<string>();
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

    for (const r of normalizedRecords) {
      if (r.dentistaLegado) distinctLegacyDentists.add(r.dentistaLegado);
      if (r.codigoTuss) {
        const cur = tussCounts.get(r.codigoTuss) || { description: r.descricao, count: 0 };
        cur.count += 1;
        tussCounts.set(r.codigoTuss, cur);
      }
    }
  }

  const summary: DryRunSummary = {
    totalClients: clientResults.length,
    newPatients: clientResults.filter((r) => r.status === 'NOVO').length,
    linkedPatients: clientResults.filter((r) => r.status === 'VINCULAR').length,
    conflicts: clientResults.filter((r) => r.status === 'CONFLITO').length,
    invalid: clientResults.filter((r) => r.status === 'INVALIDO').length,
    reviewRequired: clientResults.filter((r) => r.status === 'REVISAR').length,
    totalRecords: recordResults.length,
    validRecords: recordResults.filter((r) => r.status === 'NOVO' || r.status === 'VINCULAR').length,
    problemRecords: recordResults.filter((r) => r.status === 'CONFLITO' || r.status === 'INVALIDO' || r.status === 'REVISAR' || r.status === 'IGNORAR')
      .length,
  };

  return {
    clientResults,
    recordResults,
    summary,
    distinctLegacyDentists: Array.from(distinctLegacyDentists).sort(),
    distinctTuss: Array.from(tussCounts.entries())
      .map(([code, v]) => ({ code, description: v.description, count: v.count }))
      .sort((a, b) => b.count - a.count),
    clientsFileChecksum,
    recordsFileChecksum,
  };
}

// ----------------------------------------------------------------------
// Sessão de importação (Edge Function dental-legacy-patient-import) — trava
// de tenant real, ver comentário no topo da Edge Function.
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
// Commit em lote — implementado e revisável, mas NÃO invocado por nenhuma
// tela nesta rodada (ver aviso no topo do arquivo).
// ----------------------------------------------------------------------

interface PatientCommitRow {
  legacy_id: string;
  checksum: string;
  patient: Record<string, any>;
}

interface RecordCommitRow {
  legacy_id: string;
  patient_legacy_id: string;
  checksum: string;
  record: Record<string, any>;
}

export function buildPatientCommitRow(result: ClientMatchResult): PatientCommitRow | null {
  if (result.status !== 'NOVO') return null;
  const r = result.row;
  return {
    legacy_id: r.legacyId,
    checksum: r.legacyId,
    patient: {
      name: r.name,
      cpf: r.cpf.classification === 'VALID' ? r.cpf.cleaned : '',
      email: r.email || undefined,
      phone: r.phone || undefined,
      birth_date: r.birthDate.value || undefined,
      notes: r.notes || undefined,
      // df_patients NÃO tem colunas city/state (verificado contra o schema
      // remoto real — CLAUDE.md > Patients: health alerts persistence tinha
      // um precedente parecido, mas aqui a causa raiz é diferente: as colunas
      // nunca existiram, não é um "3 lugares" esquecido). Cidade/UF do
      // paciente já vêm preservadas em legacy_metadata.address.cidade/.uf
      // (ver buildAddress em legacyImportMatching.ts) — nunca enviar
      // city/state soltos no payload de df_patients.
      legacy_metadata: { ...r.legacyMetadata, clinicalNotesSeed: r.clinicalNotes || undefined },
    },
  };
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
      professional_id: dentistChoice?.keepLegacy === false ? dentistChoice.professionalId : undefined,
      professional_name: professionalName,
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
      },
    },
    __patientTargetId: patientTargetId,
  } as RecordCommitRow & { __patientTargetId: string };
}

export interface CommitProgress {
  patientsDone: number;
  patientsTotal: number;
  recordsDone: number;
  recordsTotal: number;
}

/**
 * Executa o commit definitivo em lotes. NÃO chamada por nenhuma tela nesta
 * rodada — ver aviso no topo do arquivo e Fase 20 do pedido original.
 */
export async function importAll(
  sessionId: string,
  dryRun: DryRunResult,
  professionalMapping: Record<string, { professionalId?: string; displayName: string; keepLegacy: boolean }>,
  procedureMapping: Record<string, string>,
  onProgress?: (p: CommitProgress) => void
): Promise<{ success: boolean; error?: string; patientLegacyIdToTargetId: Map<string, string> }> {
  const patientRows = dryRun.clientResults.map(buildPatientCommitRow).filter((r): r is PatientCommitRow => r !== null);
  const patientLegacyIdToTargetId = new Map<string, string>();

  // Pacientes já vinculados (status VINCULAR) já têm target_id conhecido —
  // usado depois para resolver o patient_legacy_id dos registros clínicos.
  for (const r of dryRun.clientResults) {
    if (r.status === 'VINCULAR' && r.matchedPatientId) {
      patientLegacyIdToTargetId.set(r.row.legacyId, r.matchedPatientId);
    }
  }

  let patientsDone = 0;
  for (const batch of chunk(patientRows, LEGACY_COMMIT_BATCH_SIZE)) {
    const { data, error } = await supabase.functions.invoke('dental-legacy-patient-import', {
      body: { action: 'commit_patients_batch', session_id: sessionId, rows: batch },
    });
    if (error) return { success: false, error: await extractEdgeFunctionError(error), patientLegacyIdToTargetId };
    if (!data?.success) return { success: false, error: data?.error || 'Falha ao importar lote de pacientes.', patientLegacyIdToTargetId };
    for (const res of data.results || []) {
      if (res.target_id) patientLegacyIdToTargetId.set(res.legacy_id, res.target_id);
    }
    patientsDone += batch.length;
    onProgress?.({ patientsDone, patientsTotal: patientRows.length, recordsDone: 0, recordsTotal: dryRun.recordResults.length });
  }

  const recordRows = dryRun.recordResults
    .map((r) => {
      const targetPatientId = patientLegacyIdToTargetId.get(r.row.patientLegacyId);
      if (!targetPatientId) return null;
      return buildRecordCommitRow(r, professionalMapping, procedureMapping, targetPatientId);
    })
    .filter((r): r is RecordCommitRow => r !== null);

  let recordsDone = 0;
  for (const batch of chunk(recordRows, LEGACY_COMMIT_BATCH_SIZE)) {
    const { data, error } = await supabase.functions.invoke('dental-legacy-patient-import', {
      body: { action: 'commit_records_batch', session_id: sessionId, rows: batch },
    });
    if (error) return { success: false, error: await extractEdgeFunctionError(error), patientLegacyIdToTargetId };
    if (!data?.success) return { success: false, error: data?.error || 'Falha ao importar lote de prontuários.', patientLegacyIdToTargetId };
    recordsDone += batch.length;
    onProgress?.({ patientsDone: patientRows.length, patientsTotal: patientRows.length, recordsDone, recordsTotal: recordRows.length });
  }

  await supabase.functions.invoke('dental-legacy-patient-import', {
    body: { action: 'finalize_session', session_id: sessionId },
  });

  return { success: true, patientLegacyIdToTargetId };
}
