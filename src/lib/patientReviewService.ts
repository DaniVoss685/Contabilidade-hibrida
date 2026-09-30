// Orquestração da revisão cadastral (pendências de paciente) no app: encerra automaticamente as
// pendências objetivamente resolvidas por uma edição e marca pendências como revisadas.
// A lógica de decisão é pura (patientReviewIssues.ts); aqui só há I/O.

import type { Patient } from '../types';
import { SupabaseService } from './supabaseClient';
import { findIssuesResolvedByEdit } from './patientReviewIssues';

/**
 * Depois de salvar um paciente: pendências ABERTAS cujo campo agora está objetivamente válido
 * (CPF válido e único, nascimento plausível, telefone válido) são encerradas como RESOLVED.
 * Pendência de identidade (possível duplicidade etc.) nunca é resolvida aqui.
 * Devolve quantas foram encerradas. Falhas de rede não interrompem o salvamento do paciente.
 */
export async function autoResolveIssuesAfterSave(params: {
  tenantId: string;
  patient: Pick<Patient, 'id' | 'documentType' | 'cpf' | 'phone' | 'birthDate'>;
  resolvedBy: string;
  isDocumentTakenByOther: (digits: string) => boolean;
}): Promise<number> {
  try {
    const open = await SupabaseService.getOpenReviewIssuesForPatient(params.tenantId, params.patient.id);
    if (open.length === 0) return 0;
    const toClose = findIssuesResolvedByEdit(open, params.patient, { isDocumentTakenByOther: params.isDocumentTakenByOther });
    let closed = 0;
    for (const issue of toClose) {
      const res = await SupabaseService.closeReviewIssue(issue.id, params.tenantId, 'RESOLVED', params.resolvedBy, 'Corrigido no cadastro');
      if (res.success) closed++;
    }
    return closed;
  } catch (err) {
    console.warn('[patientReviewService] Falha ao resolver pendências automaticamente:', err);
    return 0;
  }
}

export async function markIssueReviewed(
  issueId: string,
  tenantId: string,
  resolvedBy: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  return SupabaseService.closeReviewIssue(issueId, tenantId, 'REVIEWED', resolvedBy, note || 'Revisada manualmente');
}
