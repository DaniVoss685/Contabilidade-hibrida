/**
 * DENTAL FINANCE -> CONTÁBILEX INTEGRATION CONTRACT (FASE 1)
 *
 * Repositório Oficial: Dental Finance (Contabilidade-hibrida dentista)
 * Fonte da Verdade: Contábilex / Escritório Contaju
 */

export type IntegrationLinkStatus = 'PENDING' | 'ACTIVE' | 'DISCONNECTED' | 'REJECTED';

export interface IntegrationClientLink {
  id: string;
  contabilex_client_id: string | null;
  dental_tenant_id: string;
  cnpj: string;
  clinic_name: string | null;
  status: IntegrationLinkStatus;
  requested_at: string;
  linked_at: string | null;
  linked_by?: string | null;
  linked_by_name?: string | null;
  last_sync_at: string | null;
  reject_reason?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ContabilexSnapshotPayload {
  id: string;
  contabilex_client_id: string;
  dental_tenant_id: string;
  competency: string; // Formato interno 'YYYY-MM' (ex: '2026-07')
  gross_revenue: number;
  payroll_total: number;
  pro_labore: number | null; // Regra: pró-labore não existe isolado, sempre null
  fgts: number | null;
  inss: number | null;
  irrf: number | null;
  factor_r_payroll_base: number; // Base oficial da folha para Fator R (gross_salary + fgts)
  das_total: number | null;
  effective_rate: number | null;
  version: number;
  status: string;
  content_hash: string;
  published_at: string;
  updated_at: string;
  source?: string;
}

export type CompetencyConfirmationStatus = 'PENDING_REVIEW' | 'CONFIRMED' | 'REVISION_REQUIRED';

export interface CompetencyConfirmationRecord {
  id?: string;
  tenant_id: string;
  competency: string; // 'YYYY-MM'
  snapshot_version_confirmed: number;
  confirmed_by?: string;
  confirmed_at: string;
  status: CompetencyConfirmationStatus;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FactorRCalculationResult {
  rbt12: number;
  fs12: number;
  factorR: number; // Decimal (ex: 0.285)
  factorRPercent: number; // Percentual formatado (ex: 28.5)
  isAnexoIII: boolean;
  annex: 'ANEXO_III' | 'ANEXO_V';
  competenciesCount: number;
  isPartialHistory: boolean;
  missingMonthsMessage: string;
  proLaboreNote: string;
}

export interface ContabilexVersionDiff {
  competency: string;
  previousVersion: number;
  currentVersion: number;
  revenueBefore: number;
  revenueAfter: number;
  payrollBaseBefore: number;
  payrollBaseAfter: number;
  dasBefore: number | null;
  dasAfter: number | null;
  rateBefore: number | null;
  rateAfter: number | null;
}

/**
 * Normaliza CNPJ removendo pontuação e espaços (retorna até 14 dígitos numéricos, sem preenchimento artificial).
 */
export function normalizeCnpj(cnpj: string): string {
  return (cnpj || '').replace(/\D/g, '').slice(0, 14);
}

/**
 * Aplica máscara visual progressiva de CNPJ: 00.000.000/0000-00.
 * Apenas formata os dígitos digitados, sem preencher com zeros artificiais.
 */
export function formatCnpj(cnpj: string): string {
  const clean = normalizeCnpj(cnpj);
  if (!clean) return '';
  if (clean.length <= 2) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
  if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
  if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
}

/**
 * Converte competência visual (MM/YYYY) para formato interno do snapshot (YYYY-MM).
 */
export function competencyToInternal(display: string): string {
  if (!display) return '';
  const match = display.trim().match(/^(\d{2})\/(\d{4})$/);
  if (match) {
    return `${match[2]}-${match[1]}`;
  }
  return display;
}

/**
 * Converte competência interna (YYYY-MM) para exibição ao usuário (MM/YYYY).
 */
export function competencyToDisplay(internal: string): string {
  if (!internal) return '';
  const match = internal.trim().match(/^(\d{4})-(\d{2})$/);
  if (match) {
    return `${match[2]}/${match[1]}`;
  }
  return internal;
}
