import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ClinicTenant,
  StoredUserAccount,
  Professional,
  PayrollHistoryEntry,
  Patient,
  Sale,
  Expense,
  ExpenseRecurrenceSeries,
  DentalProcedure,
  ClinicalInput,
  BankAccount,
  Appointment,
  SystemPreferences,
  AuditLog,
  DentalTenantOption,
  Organization,
  ConsultingPortfolioData,
  ConsultingClientSummary,
  ConsultingPortfolioTotals,
  ConsultingPriorityAlert,
  ClinicalRecord,
  ClinicalAttachment,
  ClinicalRecordAmendment,
  ClinicalBeforeAfterPair,
  LegacyImportMapEntry,
  ClinicalProfessional,
  StockMovement,
  StockMovementType,
  Budget,
  BudgetItem,
} from '../types';
import { resolveGuardianMatch } from './guardianMatching';
import type { PatientReviewIssue, ReviewIssueCode, PatientDeleteCheck } from './patientReviewIssues';

export const SUPABASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  'https://fbkouuvupdyffizwoiti.supabase.co';
export const SUPABASE_ANON_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia291dXZ1cGR5ZmZpendvaXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTI2NDUsImV4cCI6MjA3MDg2ODY0NX0.9xN5BQug6yHm_k9H20v524XFuCbd1JzW2aRSQJWstfo';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const REST_URL = `${SUPABASE_URL}/rest/v1`;

// PostgREST corta respostas em 1000 linhas (max-rows do projeto). Leituras que
// precisam do conjunto COMPLETO de um tenant (ex.: dry-run da migração legada,
// que decide o que é duplicata) devem paginar — uma lista truncada em silêncio
// faria pacientes existentes parecerem "novos". Qualquer erro de página aborta.
async function fetchAllPages<T>(endpoint: string, pageSize = 1000): Promise<{ data: T[] | null; error: string | null }> {
  const all: T[] = [];
  // A ordenação precisa ser total (terminar em id) para a paginação não pular
  // nem repetir linhas que compartilham o mesmo valor (ex.: created_at igual
  // em linhas gravadas no mesmo lote).
  const hasOrder = /[?&]order=/.test(endpoint);
  for (let offset = 0; ; offset += pageSize) {
    const sep = endpoint.includes('?') ? '&' : '?';
    const orderPart = hasOrder ? '' : 'order=id.asc&';
    const { data, error } = await supabaseFetch<T[]>(`${endpoint}${sep}${orderPart}limit=${pageSize}&offset=${offset}`, {
      timeoutMs: 30000,
    });
    if (error) return { data: null, error };
    const page = data || [];
    all.push(...page);
    if (page.length < pageSize) return { data: all, error: null };
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
}

async function supabaseFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<{ data: T | null; error: string | null }> {
  const { method = 'GET', headers = {}, body, timeoutMs = 8000 } = options;

  let controller: AbortController | null = null;
  let timeoutId: any = null;
  if (typeof AbortController !== 'undefined') {
    controller = new AbortController();
    timeoutId = setTimeout(() => controller?.abort(), timeoutMs);
  }

  try {
    let authHeader = headers.Authorization;
    if (!authHeader) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        let token = sessionData?.session?.access_token;
        if (!token && typeof localStorage !== 'undefined') {
          try {
            const rawAuth = localStorage.getItem('df_auth_session_v1');
            if (rawAuth) {
              const parsed = JSON.parse(rawAuth);
              if (parsed?.token && !parsed?.isDemo) {
                token = parsed.token;
              }
            }
          } catch {}
        }
        authHeader = token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`;
      } catch {
        authHeader = `Bearer ${SUPABASE_ANON_KEY}`;
      }
    }

    const res = await fetch(`${REST_URL}/${endpoint}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined,
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (import.meta.env.DEV || (typeof window !== 'undefined' && (window as any).__DF_DEBUG__)) {
        console.error(`[Supabase Fetch Error] ${method} ${endpoint} => HTTP ${res.status}:`, errText || res.statusText);
      }
      return { data: null, error: `HTTP ${res.status}: ${errText || res.statusText}` };
    }

    if (res.status === 204) {
      return { data: null, error: null };
    }

    const text = await res.text();
    if (!text) {
      return { data: null, error: null };
    }

    try {
      const json = JSON.parse(text);
      return { data: json as T, error: null };
    } catch {
      return { data: null, error: null };
    }
  } catch (err: any) {
    if (timeoutId) clearTimeout(timeoutId);
    return { data: null, error: err?.message || 'Erro de conexão com o banco de dados' };
  }
}

// -------------------------------------------------------------
// Type Mappers: Snake_case (Postgres) <-> CamelCase (Frontend)
// -------------------------------------------------------------

export function mapDbTenantToApp(db: any): ClinicTenant {
  return {
    id: db.id,
    name: db.name,
    tradeName: db.trade_name || db.name,
    cnpj: db.cnpj || '',
    cpfCnpj: db.cpf_cnpj || db.cnpj || '',
    cro: db.cro || '',
    croUf: db.cro_uf || db.uf || 'SP',
    email: db.email || '',
    phone: db.phone || '',
    city: db.city || '',
    uf: db.uf || 'SP',
    isDemo: Boolean(db.is_demo),
    isActive: Boolean(db.is_active ?? true),
    isTest: Boolean(db.is_test),
    createdAt: db.created_at || new Date().toISOString(),
  };
}

export function mapDbReviewIssueToApp(row: any): PatientReviewIssue {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    source: row.source || 'LEGACY_IMPORT',
    issueCode: row.issue_code as ReviewIssueCode,
    fieldName: row.field_name || '',
    severity: row.severity || 'MEDIUM',
    message: row.message || '',
    legacyValue: row.legacy_value || undefined,
    relatedPatientId: row.related_patient_id || undefined,
    dedupeKey: row.dedupe_key || '',
    status: row.status || 'OPEN',
    resolvedAt: row.resolved_at || undefined,
    resolvedBy: row.resolved_by || undefined,
    resolutionNote: row.resolution_note || undefined,
    createdAt: row.created_at || '',
  };
}

export function mapAppTenantToDb(app: ClinicTenant): any {
  return {
    id: app.id,
    name: app.name,
    trade_name: app.tradeName || app.name,
    cnpj: app.cnpj || '',
    cpf_cnpj: app.cpfCnpj || app.cnpj || '',
    cro: app.cro || '',
    cro_uf: app.croUf || app.uf || 'SP',
    email: app.email || '',
    phone: app.phone || '',
    city: app.city || '',
    uf: app.uf || 'SP',
    is_demo: Boolean(app.isDemo),
    is_active: app.isActive !== false,
    is_test: Boolean(app.isTest),
    created_at: app.createdAt || new Date().toISOString(),
  };
}

export function mapDbUserToApp(db: any): StoredUserAccount {
  return {
    id: db.id,
    clinicId: db.clinic_id,
    email: db.email,
    name: db.name,
    whatsappDisplayName: db.whatsapp_display_name || undefined,
    role: db.role,
    authUserId: db.auth_user_id || undefined,
    passwordHash: db.password_hash || undefined,
    salt: db.salt || undefined,
    isActive: db.is_active !== false,
    isPrimary: db.is_primary === true || db.role === 'SUPER_ADMIN',
    permissions: db.permissions || null,
    createdAt: db.created_at || new Date().toISOString(),
  };
}

export function mapAppUserToDb(app: StoredUserAccount): any {
  return {
    id: app.id,
    clinic_id: app.clinicId,
    email: app.email.trim().toLowerCase(),
    name: app.name,
    whatsapp_display_name: app.whatsappDisplayName || null,
    role: app.role,
    auth_user_id: app.authUserId || null,
    password_hash: app.passwordHash || null,
    salt: app.salt || null,
    is_active: app.isActive !== false,
    permissions: app.permissions || null,
    created_at: app.createdAt || new Date().toISOString(),
  };
}

export function mapDbProfessionalToApp(db: any, tenantId: string): Professional {
  return {
    id: db.id || `prof_${tenantId}`,
    orgId: db.org_id || `org_${tenantId}`,
    name: db.name || '',
    cpf: db.cpf || '',
    cro: db.cro || '',
    croUf: db.cro_uf || db.uf || 'SP',
    cnpj: db.cnpj || '',
    razaoSocial: db.razao_social || db.name || '',
    nomeFantasia: db.nome_fantasia || db.razao_social || '',
    municipio: db.municipio || 'São Paulo - SP',
    regimeTributario: db.regime_tributario || 'SIMPLES_NACIONAL',
    optanteSimples: db.optante_simples !== false,
    dataAbertura: db.data_abertura || '',
    rbt12Inicial: Number(db.rbt12_inicial || 0),
    folha12MesesInicial: Number(db.folha_12m_inicial || 0),
    proLaboreMensal: Number(db.pro_labore_mensal || 0),
    baselineConfigured: Boolean(db.baseline_configured),
    fiscalSourceType: db.fiscal_source_type || 'MANUAL_TOTAL',
    fiscalSnapshots: Array.isArray(db.fiscal_snapshots) ? db.fiscal_snapshots : [],
    initialFiscalHistory: Array.isArray(db.initial_fiscal_history) ? db.initial_fiscal_history : [],
    contabilexClientId: db.contabilex_client_id || undefined,
    phone: db.phone || '',
    email: db.email || '',
    especialidade: db.especialidade || '',
    anexoPadrao: db.anexo_padrao || 'III',
    uf: db.uf || 'SP',
    numDependentes: Number(db.num_dependentes || 0),
    inssProprioMensal: Number(db.inss_proprio_mensal || 0),
    outrosRendimentosTributaveis: Number(db.outros_rendimentos_tributaveis || 0),
  };
}

export function mapAppProfessionalToDb(app: Professional, tenantId: string): any {
  return {
    tenant_id: tenantId,
    id: app.id || `prof_${tenantId}`,
    org_id: app.orgId || `org_${tenantId}`,
    name: app.name || '',
    cpf: app.cpf || '',
    cro: app.cro || '',
    cro_uf: app.croUf || app.uf || 'SP',
    cnpj: app.cnpj || '',
    razao_social: app.razaoSocial || app.name || '',
    nome_fantasia: app.nomeFantasia || app.razaoSocial || '',
    municipio: app.municipio || 'São Paulo - SP',
    regime_tributario: app.regimeTributario || 'SIMPLES_NACIONAL',
    optante_simples: app.optanteSimples !== false,
    data_abertura: app.dataAbertura || '',
    rbt12_inicial: Number(app.rbt12Inicial || 0),
    folha_12m_inicial: Number(app.folha12MesesInicial || 0),
    pro_labore_mensal: Number(app.proLaboreMensal || 0),
    baseline_configured: Boolean(app.baselineConfigured),
    fiscal_source_type: app.fiscalSourceType || 'MANUAL_TOTAL',
    fiscal_snapshots: app.fiscalSnapshots || [],
    initial_fiscal_history: app.initialFiscalHistory || [],
    contabilex_client_id: app.contabilexClientId || null,
    phone: app.phone || '',
    email: app.email || '',
    especialidade: app.especialidade || '',
    anexo_padrao: app.anexoPadrao || 'III',
    uf: app.uf || 'SP',
    num_dependentes: Number(app.numDependentes || 0),
    inss_proprio_mensal: Number(app.inssProprioMensal || 0),
    outros_rendimentos_tributaveis: Number(app.outrosRendimentosTributaveis || 0),
    updated_at: new Date().toISOString(),
  };
}

export function mapDbBudgetToApp(db: any): Budget {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    patientId: db.patient_id,
    patientName: db.patient_name || '',
    status: db.status,
    items: Array.isArray(db.items) ? (db.items as BudgetItem[]) : [],
    subtotal: Number(db.subtotal || 0),
    discountType: db.discount_type || null,
    discountValue: Number(db.discount_value || 0),
    total: Number(db.total || 0),
    validUntil: db.valid_until || null,
    notes: db.notes || '',
    convertedSaleId: db.converted_sale_id || null,
    convertedAt: db.converted_at || null,
    presentedAt: db.presented_at || null,
    decidedAt: db.decided_at || null,
    createdBy: db.created_by || undefined,
    createdByName: db.created_by_name || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapAppBudgetToDb(app: Budget, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    patient_id: app.patientId,
    patient_name: app.patientName,
    status: app.status,
    items: app.items,
    subtotal: Number(app.subtotal || 0),
    discount_type: app.discountType || null,
    discount_value: Number(app.discountValue || 0),
    total: Number(app.total || 0),
    valid_until: app.validUntil || null,
    notes: app.notes || '',
    converted_sale_id: app.convertedSaleId || null,
    converted_at: app.convertedAt || null,
    presented_at: app.presentedAt || null,
    decided_at: app.decidedAt || null,
    created_by: app.createdBy || null,
    created_by_name: app.createdByName || null,
    created_at: app.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function mapDbClinicalProfessionalToApp(db: any): ClinicalProfessional {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    name: db.name || '',
    cro: db.cro || null,
    croUf: db.cro_uf || null,
    especialidade: db.especialidade || null,
    color: db.color || null,
    isActive: db.is_active !== false,
    userId: db.user_id || null,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapDbPayrollToApp(db: any): PayrollHistoryEntry {
  return {
    month: db.month,
    salaries: Number(db.salaries || 0),
    charges: Number(db.charges || 0),
    proLabore: Number(db.pro_labore || 0),
    totalPayroll: Number(db.total_payroll || 0),
  };
}

export function mapAppPayrollToDb(app: PayrollHistoryEntry, tenantId: string): any {
  return {
    id: `${tenantId}_${app.month}`,
    tenant_id: tenantId,
    month: app.month,
    salaries: Number(app.salaries || 0),
    charges: Number(app.charges || 0),
    pro_labore: Number(app.proLabore || 0),
    total_payroll: Number(app.totalPayroll || 0),
    updated_at: new Date().toISOString(),
  };
}

const GENERIC_CLINIC_NAMES = new Set(['Clínica Odontológica', 'Clínica sem nome']);

export function resolveClinicDisplayName(
  tenant: { name?: string | null; trade_name?: string | null } | null,
  professional: { nome_fantasia?: string | null; razao_social?: string | null; name?: string | null } | null
): string {
  const pick = (v?: string | null) => (v && v.trim() && !GENERIC_CLINIC_NAMES.has(v.trim()) ? v.trim() : '');
  return (
    pick(tenant?.name) ||
    pick(tenant?.trade_name) ||
    pick(professional?.nome_fantasia) ||
    pick(professional?.razao_social) ||
    pick(professional?.name) ||
    tenant?.name ||
    'Clínica sem nome'
  );
}

function asStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.trim().length > 0);
  return [];
}

export function mapDbPatientToApp(db: any): Patient {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    orgId: db.org_id,
    name: db.name,
    documentType: db.document_type === 'CNPJ' ? 'CNPJ' : 'CPF',
    cpf: db.cpf || '',
    email: db.email || '',
    phone: db.phone || '',
    phoneOwner: db.phone_owner === 'RESPONSIBLE' ? 'RESPONSIBLE' : 'PATIENT',
    birthDate: db.birth_date || '',
    notes: db.notes || '',
    allergies: asStringArray(db.allergies),
    conditions: asStringArray(db.conditions),
    medications: asStringArray(db.medications),
    clinicalNotes: db.clinical_notes || '',
    legacyMetadata: db.legacy_metadata || undefined,
    isLegacyImport: Boolean(db.legacy_metadata?.legacyClientUuid),
    createdAt: db.created_at || new Date().toISOString(),
  };
}

export function mapAppPatientToDb(app: Patient, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    org_id: app.orgId || `org_${tenantId}`,
    name: app.name,
    document_type: app.documentType === 'CNPJ' ? 'CNPJ' : 'CPF',
    cpf: app.cpf || '',
    email: app.email || '',
    phone: app.phone || '',
    phone_owner: app.phoneOwner === 'RESPONSIBLE' ? 'RESPONSIBLE' : 'PATIENT',
    birth_date: app.birthDate || '',
    notes: app.notes || '',
    allergies: asStringArray(app.allergies),
    conditions: asStringArray(app.conditions),
    medications: asStringArray(app.medications),
    clinical_notes: app.clinicalNotes || '',
    created_at: app.createdAt || new Date().toISOString(),
  };
}

export function mapDbSaleToApp(db: any): Sale {
  const installments = Array.isArray(db.installments) ? db.installments : [];
  const totalInstallmentCardFees = installments.reduce((acc: number, i: any) => acc + (i.cardFeeAmount || 0), 0);
  const cardFeeAmount =
    db.card_fee_amount !== undefined
      ? Number(db.card_fee_amount)
      : totalInstallmentCardFees > 0
      ? totalInstallmentCardFees
      : undefined;
  const cardFeePercent =
    db.card_fee_percent !== undefined
      ? Number(db.card_fee_percent)
      : installments.find((i: any) => i.cardFeePercent)?.cardFeePercent || undefined;
  const netValue =
    db.net_value !== undefined
      ? Number(db.net_value)
      : cardFeeAmount
      ? Math.max(0, Number(db.total_value || 0) - cardFeeAmount)
      : Number(db.total_value || 0);

  return {
    id: db.id,
    orgId: db.org_id,
    taxOrigin: db.tax_origin,
    patientId: db.patient_id || '',
    patientName: db.patient_name,
    patientCpf: db.patient_cpf || '',
    payerIsBeneficiary: db.payer_is_beneficiary !== false,
    payerName: db.payer_name || '',
    payerCpf: db.payer_cpf || '',
    procedureId: db.procedure_id || '',
    procedureName: db.procedure_name || '',
    description: db.description || '',
    totalValue: Number(db.total_value || 0),
    cardFeePercent,
    cardFeeAmount,
    netValue,
    bankAccountId: db.bank_account_id || installments[0]?.bankAccountId || undefined,
    serviceDate: db.service_date,
    paymentMethod: db.payment_method,
    installmentsCount: Number(db.installments_count || 1),
    nfseStatus: db.nfse_status || undefined,
    nfseNumber: db.nfse_number || undefined,
    nfseVerificationCode: db.nfse_verification_code || undefined,
    nfseEmittedAt: db.nfse_emitted_at || undefined,
    installments,
    notes: db.notes || '',
    appointmentId: db.appointment_id || undefined,
    origin: db.origin || (db.appointment_id ? 'AGENDA' : 'MANUAL'),
    originalEstimatedValue: db.original_estimated_value !== undefined ? Number(db.original_estimated_value) : undefined,
    priceHistory: Array.isArray(db.price_history) ? db.price_history : [],
    createdAt: db.created_at || new Date().toISOString(),
  };
}

export function mapAppSaleToDb(app: Sale, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    org_id: app.orgId || `org_${tenantId}`,
    tax_origin: app.taxOrigin,
    patient_id: app.patientId || null,
    patient_name: app.patientName,
    patient_cpf: app.patientCpf || '',
    payer_is_beneficiary: app.payerIsBeneficiary !== false,
    payer_name: app.payerName || '',
    payer_cpf: app.payerCpf || '',
    procedure_id: app.procedureId || null,
    procedure_name: app.procedureName || '',
    description: app.description || '',
    total_value: Number(app.totalValue || 0),
    service_date: app.serviceDate,
    payment_method: app.paymentMethod,
    installments_count: Number(app.installmentsCount || 1),
    nfse_status: app.nfseStatus || null,
    nfse_number: app.nfseNumber || null,
    nfse_verification_code: app.nfseVerificationCode || null,
    nfse_emitted_at: app.nfseEmittedAt || null,
    installments: app.installments || [],
    notes: app.notes || '',
    appointment_id: app.appointmentId || null,
    origin: app.origin || (app.appointmentId ? 'AGENDA' : 'MANUAL'),
    created_at: app.createdAt || new Date().toISOString(),
  };
}

export function mapDbExpenseToApp(db: any): Expense {
  return {
    id: db.id,
    orgId: db.org_id,
    supplierName: db.supplier_name,
    supplierCpfCnpj: db.supplier_cpf_cnpj || '',
    description: db.description,
    categoryId: db.category_id,
    categoryCode: db.category_code || '',
    categoryName: db.category_name || '',
    groupCode: db.group_code || '',
    groupName: db.group_name || '',
    subCategory: db.sub_category || '',
    value: Number(db.value || 0),
    competenceDate: db.competence_date,
    dueDate: db.due_date,
    paymentDate: db.payment_date || undefined,
    paymentMethod: db.payment_method || undefined,
    bankAccountId: db.bank_account_id || undefined,
    documentNumber: db.document_number || '',
    attachmentName: db.attachment_name || undefined,
    attachment: db.attachment || null,
    notes: db.notes || '',
    entity: db.entity || 'CPF',
    splitPercentageCpf: Number(db.split_percentage_cpf ?? 100),
    splitPercentageCnpj: Number(db.split_percentage_cnpj ?? 0),
    dedutivelLivroCaixaPf: db.dedutivel_livro_caixa_pf || 'SIM',
    impactaFatorRPj: Boolean(db.impacta_fator_r_pj),
    despesaOperacionalPj: Boolean(db.despesa_operacional_pj ?? true),
    isOverridden: Boolean(db.is_overridden),
    overrideJustification: db.override_justification || '',
    status: db.status || 'A_PAGAR',
    createdAt: db.created_at || new Date().toISOString(),
    expenseType: (db.expense_type as any) || (db.total_installments ? 'PARCELADA' : db.recurrence_id ? 'RECORRENTE' : 'UNICA'),
    recurrenceId: db.recurrence_id || undefined,
    recurrenceFrequency: db.recurrence_frequency || undefined,
    recurrenceCount: db.recurrence_count != null ? Number(db.recurrence_count) : undefined,
    recurrenceIndex: db.recurrence_index != null ? Number(db.recurrence_index) : undefined,
    installmentGroupId: db.installment_group_id || undefined,
    installmentNumber: db.installment_number != null ? Number(db.installment_number) : undefined,
    totalInstallments: db.total_installments != null ? Number(db.total_installments) : undefined,
    intervalMonths: db.interval_months != null ? Number(db.interval_months) : undefined,
  };
}

export function mapAppExpenseToDb(app: Expense, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    org_id: app.orgId || `org_${tenantId}`,
    supplier_name: app.supplierName,
    supplier_cpf_cnpj: app.supplierCpfCnpj || '',
    description: app.description,
    category_id: app.categoryId,
    category_code: app.categoryCode || '',
    category_name: app.categoryName || '',
    group_code: app.groupCode || '',
    group_name: app.groupName || '',
    sub_category: app.subCategory || '',
    value: Number(app.value || 0),
    competence_date: app.competenceDate,
    due_date: app.dueDate,
    payment_date: app.paymentDate || null,
    payment_method: app.paymentMethod || null,
    bank_account_id: app.bankAccountId || null,
    document_number: app.documentNumber || '',
    attachment_name: app.attachmentName || null,
    attachment: app.attachment || null,
    notes: app.notes || '',
    entity: app.entity || 'CPF',
    split_percentage_cpf: Number(app.splitPercentageCpf ?? 100),
    split_percentage_cnpj: Number(app.splitPercentageCnpj ?? 0),
    dedutivel_livro_caixa_pf: app.dedutivelLivroCaixaPf || 'SIM',
    impacta_fator_r_pj: Boolean(app.impactaFatorRPj),
    despesa_operacional_pj: Boolean(app.despesaOperacionalPj ?? true),
    is_overridden: Boolean(app.isOverridden),
    override_justification: app.overrideJustification || null,
    status: app.status || 'A_PAGAR',
    created_at: app.createdAt || new Date().toISOString(),
    expense_type: app.expenseType || (app.totalInstallments ? 'PARCELADA' : app.recurrenceId ? 'RECORRENTE' : 'UNICA'),
    recurrence_id: app.recurrenceId || null,
    recurrence_frequency: app.recurrenceFrequency || null,
    recurrence_count: app.recurrenceCount != null ? Number(app.recurrenceCount) : null,
    recurrence_index: app.recurrenceIndex != null ? Number(app.recurrenceIndex) : null,
    installment_group_id: app.installmentGroupId || null,
    installment_number: app.installmentNumber != null ? Number(app.installmentNumber) : null,
    total_installments: app.totalInstallments != null ? Number(app.totalInstallments) : null,
    interval_months: app.intervalMonths != null ? Number(app.intervalMonths) : null,
  };
}

export function mapDbExpenseRecurrenceToApp(db: any): ExpenseRecurrenceSeries {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    description: db.description,
    supplierName: db.supplier_name || undefined,
    supplierCpfCnpj: db.supplier_cpf_cnpj || undefined,
    categoryId: db.category_id,
    categoryCode: db.category_code || undefined,
    categoryName: db.category_name || undefined,
    groupCode: db.group_code || undefined,
    groupName: db.group_name || undefined,
    subCategory: db.sub_category || undefined,
    value: Number(db.value || 0),
    entity: db.entity || 'CPF',
    splitPercentageCpf: db.split_percentage_cpf != null ? Number(db.split_percentage_cpf) : undefined,
    splitPercentageCnpj: db.split_percentage_cnpj != null ? Number(db.split_percentage_cnpj) : undefined,
    paymentMethod: db.payment_method || undefined,
    bankAccountId: db.bank_account_id || undefined,
    documentNumber: db.document_number || undefined,
    notes: db.notes || undefined,
    dedutivelLivroCaixaPf: db.dedutivel_livro_caixa_pf || 'SIM',
    impactaFatorRPj: Boolean(db.impacta_fator_r_pj),
    despesaOperacionalPj: Boolean(db.despesa_operacional_pj ?? true),
    isOverridden: Boolean(db.is_overridden),
    overrideJustification: db.override_justification || undefined,
    startDate: db.start_date,
    intervalMonths: Number(db.interval_months || 1),
    status: db.status || 'ACTIVE',
    endedAt: db.ended_at || undefined,
    endedBy: db.ended_by || undefined,
    endedByName: db.ended_by_name || undefined,
    lastGeneratedDueDate: db.last_generated_due_date,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapAppExpenseRecurrenceToDb(app: ExpenseRecurrenceSeries, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    description: app.description,
    supplier_name: app.supplierName || null,
    supplier_cpf_cnpj: app.supplierCpfCnpj || null,
    category_id: app.categoryId,
    category_code: app.categoryCode || null,
    category_name: app.categoryName || null,
    group_code: app.groupCode || null,
    group_name: app.groupName || null,
    sub_category: app.subCategory || null,
    value: Number(app.value || 0),
    entity: app.entity || 'CPF',
    split_percentage_cpf: app.splitPercentageCpf != null ? Number(app.splitPercentageCpf) : null,
    split_percentage_cnpj: app.splitPercentageCnpj != null ? Number(app.splitPercentageCnpj) : null,
    payment_method: app.paymentMethod || null,
    bank_account_id: app.bankAccountId || null,
    document_number: app.documentNumber || null,
    notes: app.notes || null,
    dedutivel_livro_caixa_pf: app.dedutivelLivroCaixaPf || 'SIM',
    impacta_fator_r_pj: Boolean(app.impactaFatorRPj),
    despesa_operacional_pj: Boolean(app.despesaOperacionalPj ?? true),
    is_overridden: Boolean(app.isOverridden),
    override_justification: app.overrideJustification || null,
    start_date: app.startDate,
    interval_months: Number(app.intervalMonths || 1),
    status: app.status || 'ACTIVE',
    ended_at: app.endedAt || null,
    ended_by: app.endedBy || null,
    ended_by_name: app.endedByName || null,
    last_generated_due_date: app.lastGeneratedDueDate,
    created_at: app.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function mapDbProcedureToApp(db: any): DentalProcedure {
  return {
    id: db.id,
    code: db.code || '',
    name: db.name,
    category: db.category,
    description: db.description || '',
    clinicalDurationMinutes: Number(db.clinical_duration_minutes || 30),
    professionalHourlyRate: Number(db.professional_hourly_rate || 150),
    professionalCost: Number(db.professional_cost || 75),
    costProfessionalTime: Number(db.cost_professional_time || 75),
    inputs: Array.isArray(db.inputs) ? db.inputs : [],
    inputsCost: Number(db.inputs_cost || 0),
    costInputsTotal: Number(db.cost_inputs_total || 0),
    labCost: Number(db.lab_cost || 0),
    otherCosts: Number(db.other_costs || 0),
    otherDirectCosts: Number(db.other_direct_costs || 0),
    totalCost: Number(db.total_cost || 75),
    totalDirectCost: Number(db.total_direct_cost || 75),
    targetMarginPercent: Number(db.target_margin_percent || 50),
    suggestedMarginPercent: Number(db.suggested_margin_percent || 50),
    estimatedTaxesPercent: Number(db.estimated_taxes_percent || 6),
    suggestedPrice: Number(db.suggested_price || 150),
    structureCostPerHour: Number(db.structure_cost_per_hour || 0),
    defaultPrice: Number(db.default_price || 150),
    active: db.active !== false,
    notes: db.notes || '',
  };
}

export function mapAppProcedureToDb(app: DentalProcedure, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    code: app.code || '',
    name: app.name,
    category: app.category,
    description: app.description || '',
    clinical_duration_minutes: Number(app.clinicalDurationMinutes || 30),
    professional_hourly_rate: Number(app.professionalHourlyRate || 150),
    professional_cost: Number(app.professionalCost || 75),
    cost_professional_time: Number(app.costProfessionalTime || 75),
    inputs: app.inputs || [],
    inputs_cost: Number(app.inputsCost || 0),
    cost_inputs_total: Number(app.costInputsTotal || 0),
    lab_cost: Number(app.labCost || 0),
    other_costs: Number(app.otherCosts || 0),
    other_direct_costs: Number(app.otherDirectCosts || 0),
    total_cost: Number(app.totalCost || 75),
    total_direct_cost: Number(app.totalDirectCost || 75),
    target_margin_percent: Number(app.targetMarginPercent || 50),
    suggested_margin_percent: Number(app.suggestedMarginPercent || 50),
    estimated_taxes_percent: Number(app.estimatedTaxesPercent || 6),
    suggested_price: Number(app.suggestedPrice || 150),
    structure_cost_per_hour: Number(app.structureCostPerHour || 0),
    default_price: Number(app.defaultPrice || 150),
    active: app.active !== false,
    notes: app.notes || '',
  };
}

export function mapDbClinicalInputToApp(db: any): ClinicalInput {
  return {
    id: db.id,
    name: db.name,
    brand: db.brand || '',
    category: db.category,
    packageType: db.package_type || undefined,
    purchasePackageName: db.purchase_package_name,
    packageQuantity: Number(db.package_quantity || 1),
    purchasePrice: Number(db.purchase_price || 0),
    purchaseUnitType: db.purchase_unit_type || 'un',
    usageUnit: db.usage_unit,
    unitCost: Number(db.unit_cost || 0),
    active: db.active !== false,
    notes: db.notes || '',
    createdAt: db.created_at || new Date().toISOString(),
    quantityOnHand: Number(db.quantity_on_hand || 0),
    minimumQuantity: Number(db.minimum_quantity || 0),
    updatedAt: db.updated_at || undefined,
  };
}

// NUNCA inclui quantity_on_hand — o saldo só muda via movimentação (df_stock_movements + trigger
// fn_apply_stock_movement). Incluir aqui permitiria que salvar o cadastro do insumo (nome, preço...)
// sobrescrevesse o saldo com um valor desatualizado do formulário, sem deixar rastro na auditoria.
export function mapAppClinicalInputToDb(app: ClinicalInput, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    name: app.name,
    brand: app.brand || '',
    category: app.category,
    package_type: app.packageType || null,
    purchase_package_name: app.purchasePackageName,
    package_quantity: Number(app.packageQuantity || 1),
    purchase_price: Number(app.purchasePrice || 0),
    purchase_unit_type: app.purchaseUnitType || 'un',
    usage_unit: app.usageUnit,
    unit_cost: Number(app.unitCost || 0),
    active: app.active !== false,
    notes: app.notes || '',
    created_at: app.createdAt || new Date().toISOString(),
    minimum_quantity: Number(app.minimumQuantity || 0),
  };
}

export function mapDbAppointmentToApp(db: any): Appointment {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    orgId: db.org_id,
    patientId: db.patient_id,
    patientName: db.patient_name,
    patientPhone: db.patient_phone || '',
    patientCpf: db.patient_cpf || '',
    date: db.date,
    startTime: db.start_time,
    durationMinutes: Number(db.duration_minutes || 30),
    endTime: db.end_time,
    dentistName: db.dentist_name,
    professionalId: db.professional_id || undefined,
    professionalName: db.professional_name || undefined,
    procedureName: db.procedure_name,
    procedureId: db.procedure_id || undefined,
    status: db.status || 'AGENDADA',
    notes: db.notes || '',
    sendWhatsappReminder: db.send_whatsapp_reminder !== false,
    origin: db.origin || 'RECEPCAO',
    saleId: db.sale_id || undefined,
    createdAt: db.created_at || new Date().toISOString(),
    updatedAt: db.updated_at || new Date().toISOString(),
  };
}

export function mapAppAppointmentToDb(app: Appointment, tenantId: string): any {
  const effectiveTenant = app.tenantId || tenantId;
  return {
    id: app.id,
    tenant_id: effectiveTenant,
    org_id: app.orgId || `org_${effectiveTenant}`,
    patient_id: app.patientId,
    patient_name: app.patientName,
    patient_phone: app.patientPhone || '',
    patient_cpf: app.patientCpf || '',
    date: app.date,
    start_time: app.startTime,
    duration_minutes: Number(app.durationMinutes || 30),
    end_time: app.endTime,
    dentist_name: app.dentistName,
    professional_id: app.professionalId || null,
    professional_name: app.professionalName || null,
    procedure_name: app.procedureName,
    procedure_id: app.procedureId || null,
    status: app.status || 'AGENDADA',
    notes: app.notes || '',
    send_whatsapp_reminder: app.sendWhatsappReminder !== false,
    origin: app.origin || 'RECEPCAO',
    sale_id: app.saleId || null,
    created_at: app.createdAt || new Date().toISOString(),
    updated_at: app.updatedAt || new Date().toISOString(),
  };
}

export function mapDbBankAccountToApp(db: any): BankAccount {
  return {
    id: db.id,
    orgId: db.org_id,
    name: db.name,
    bankName: db.bank_name,
    accountType: db.account_type,
    initialBalance: Number(db.initial_balance || 0),
    currentBalance: Number(db.current_balance || 0),
    isActive: db.is_active !== false,
    isPreferred: Boolean(db.is_preferred),
  };
}

export function mapAppBankAccountToDb(app: BankAccount, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    org_id: app.orgId || `org_${tenantId}`,
    name: app.name,
    bank_name: app.bankName,
    account_type: app.accountType,
    initial_balance: Number(app.initialBalance || 0),
    current_balance: Number(app.currentBalance || 0),
    is_active: app.isActive !== false,
    is_preferred: Boolean(app.isPreferred),
  };
}

export function mapDbPreferencesToApp(db: any): SystemPreferences {
  return {
    hideCpf: Boolean(db.hide_cpf),
    alertFatorR: db.alert_fator_r !== false,
    alertDueDates: db.alert_due_dates !== false,
    operationalReminders: db.operational_reminders !== false,
    lunchBreakEnabled: Boolean(db.lunch_break_enabled),
    lunchBreakStart: db.lunch_break_start || undefined,
    lunchBreakEnd: db.lunch_break_end || undefined,
    cardFees: db.card_fees && typeof db.card_fees === 'object' ? db.card_fees : undefined,
    pricing: db.pricing_settings && typeof db.pricing_settings === 'object' ? db.pricing_settings : undefined,
  };
}

export function mapAppPreferencesToDb(app: SystemPreferences, tenantId: string): any {
  return {
    tenant_id: tenantId,
    hide_cpf: Boolean(app.hideCpf),
    alert_fator_r: app.alertFatorR !== false,
    alert_due_dates: app.alertDueDates !== false,
    operational_reminders: app.operationalReminders !== false,
    lunch_break_enabled: Boolean(app.lunchBreakEnabled),
    lunch_break_start: app.lunchBreakStart || null,
    lunch_break_end: app.lunchBreakEnd || null,
    card_fees: app.cardFees || {},
    pricing_settings: app.pricing || null,
    updated_at: new Date().toISOString(),
  };
}

export function mapDbAuditLogToApp(db: any): AuditLog {
  return {
    id: db.id,
    timestamp: db.timestamp || new Date().toISOString(),
    userId: db.user_id,
    userName: db.user_name,
    action: db.action,
    entityType: db.entity_type,
    entityId: db.entity_id,
    details: db.details,
  };
}

export function mapAppAuditLogToDb(app: AuditLog, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    timestamp: app.timestamp || new Date().toISOString(),
    user_id: app.userId,
    user_name: app.userName,
    action: app.action,
    entity_type: app.entityType,
    entity_id: app.entityId,
    details: app.details,
  };
}

// -------------------------------------------------------------
// Clinical Records & Attachments Mappings
// -------------------------------------------------------------

export function mapDbClinicalRecordToApp(db: any): ClinicalRecord {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    patientId: db.patient_id,
    professionalId: db.professional_id,
    professionalName: db.professional_name || '',
    professionalCro: db.professional_cro || '',
    recordType: db.record_type,
    procedureId: db.procedure_id || undefined,
    procedureName: db.procedure_name || undefined,
    recordDate: db.record_date,
    recordTime: db.record_time || undefined,
    complaint: db.complaint || undefined,
    assessment: db.assessment || undefined,
    conduct: db.conduct || undefined,
    evolution: db.evolution,
    conclusion: db.conclusion || undefined,
    guidance: db.guidance || undefined,
    returnDate: db.return_date || undefined,
    status: db.status || 'DRAFT',
    origin: db.origin || 'MANUAL',
    importMetadata: db.import_metadata || undefined,
    continuationOfRecordId: db.continuation_of_record_id || undefined,
    continuationDate: db.continuation_date || undefined,
    createdBy: db.created_by,
    createdByName: db.created_by_name || undefined,
    createdAt: db.created_at || new Date().toISOString(),
    updatedAt: db.updated_at || undefined,
    finalizedBy: db.finalized_by || undefined,
    finalizedByName: db.finalized_by_name || undefined,
    finalizedAt: db.finalized_at || undefined,
    voidedBy: db.voided_by || undefined,
    voidedByName: db.voided_by_name || undefined,
    voidedAt: db.voided_at || undefined,
    voidReason: db.void_reason || undefined,
    toothNumber: db.tooth_number || undefined,
    toothFace: db.tooth_face || undefined,
    legacyTussCode: db.legacy_tuss_code || undefined,
    legacyProcedureName: db.legacy_procedure_name || undefined,
    legacyDentistName: db.legacy_dentist_name || undefined,
    legacyStatus: db.legacy_status || undefined,
    attachments: [],
    amendments: [],
  };
}

export function mapAppClinicalRecordToDb(app: ClinicalRecord, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    patient_id: app.patientId,
    professional_id: app.professionalId,
    professional_name: app.professionalName || null,
    professional_cro: app.professionalCro || null,
    record_type: app.recordType,
    procedure_id: app.procedureId || null,
    procedure_name: app.procedureName || null,
    record_date: app.recordDate,
    record_time: app.recordTime || null,
    complaint: app.complaint || null,
    assessment: app.assessment || null,
    conduct: app.conduct || null,
    evolution: app.evolution,
    conclusion: app.conclusion || null,
    guidance: app.guidance || null,
    return_date: app.returnDate || null,
    status: app.status || 'DRAFT',
    origin: app.origin || 'MANUAL',
    import_metadata: app.importMetadata || null,
    continuation_of_record_id: app.continuationOfRecordId || null,
    continuation_date: app.continuationDate || null,
    created_by: app.createdBy,
    created_at: app.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    finalized_by: app.finalizedBy || null,
    finalized_at: app.finalizedAt || null,
    voided_by: app.voidedBy || null,
    voided_at: app.voidedAt || null,
    void_reason: app.voidReason || null,
    tooth_number: app.toothNumber || null,
    tooth_face: app.toothFace || null,
    legacy_tuss_code: app.legacyTussCode || null,
    legacy_procedure_name: app.legacyProcedureName || null,
    legacy_dentist_name: app.legacyDentistName || null,
    legacy_status: app.legacyStatus || null,
  };
}

export function mapDbClinicalAttachmentToApp(db: any): ClinicalAttachment {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    patientId: db.patient_id,
    clinicalRecordId: db.clinical_record_id || undefined,
    storagePath: db.storage_path,
    originalFilename: db.original_filename,
    mimeType: db.mime_type,
    sizeBytes: Number(db.size_bytes || 0),
    attachmentType: db.attachment_type,
    caption: db.caption || undefined,
    date: db.date || undefined,
    procedureId: db.procedure_id || undefined,
    procedureName: db.procedure_name || undefined,
    beforeAfterPairId: db.before_after_pair_id || undefined,
    createdBy: db.created_by,
    createdAt: db.created_at || new Date().toISOString(),
    source: db.source || undefined,
    sourceMessageId: db.source_message_id || undefined,
    sourceContactId: db.source_contact_id || undefined,
    sourceConversationId: db.source_conversation_id || undefined,
  };
}

export function mapAppClinicalAttachmentToDb(app: ClinicalAttachment, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    patient_id: app.patientId,
    clinical_record_id: app.clinicalRecordId || null,
    storage_path: app.storagePath,
    original_filename: app.originalFilename,
    mime_type: app.mimeType,
    size_bytes: app.sizeBytes,
    attachment_type: app.attachmentType,
    caption: app.caption || null,
    date: app.date || null,
    procedure_id: app.procedureId || null,
    procedure_name: app.procedureName || null,
    before_after_pair_id: app.beforeAfterPairId || null,
    created_by: app.createdBy,
    created_at: app.createdAt || new Date().toISOString(),
    source: app.source || null,
    source_message_id: app.sourceMessageId || null,
    source_contact_id: app.sourceContactId || null,
    source_conversation_id: app.sourceConversationId || null,
  };
}

export function mapDbClinicalAmendmentToApp(db: any): ClinicalRecordAmendment {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    clinicalRecordId: db.clinical_record_id,
    reason: db.reason,
    content: db.content,
    createdBy: db.created_by,
    createdByName: db.created_by_name,
    createdAt: db.created_at || new Date().toISOString(),
  };
}

export function mapAppClinicalAmendmentToDb(app: ClinicalRecordAmendment, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    clinical_record_id: app.clinicalRecordId,
    reason: app.reason,
    content: app.content,
    created_by: app.createdBy,
    created_by_name: app.createdByName,
    created_at: app.createdAt || new Date().toISOString(),
  };
}

export function mapDbBeforeAfterPairToApp(db: any): ClinicalBeforeAfterPair {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    patientId: db.patient_id,
    title: db.title,
    procedureId: db.procedure_id || undefined,
    procedureName: db.procedure_name || undefined,
    observation: db.observation || undefined,
    beforeAttachmentId: db.before_attachment_id,
    afterAttachmentId: db.after_attachment_id,
    beforeDate: db.before_date || undefined,
    afterDate: db.after_date || undefined,
    beforePositionX: db.before_position_x != null ? Number(db.before_position_x) : 0,
    beforePositionY: db.before_position_y != null ? Number(db.before_position_y) : 0,
    beforeZoom: db.before_zoom != null ? Number(db.before_zoom) : 1,
    afterPositionX: db.after_position_x != null ? Number(db.after_position_x) : 0,
    afterPositionY: db.after_position_y != null ? Number(db.after_position_y) : 0,
    afterZoom: db.after_zoom != null ? Number(db.after_zoom) : 1,
    dividerPosition: db.divider_position != null ? Number(db.divider_position) : 50,
    createdBy: db.created_by,
    createdAt: db.created_at || new Date().toISOString(),
  };
}

export function mapAppBeforeAfterPairToDb(app: ClinicalBeforeAfterPair, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    patient_id: app.patientId,
    title: app.title,
    procedure_id: app.procedureId || null,
    procedure_name: app.procedureName || null,
    observation: app.observation || null,
    before_attachment_id: app.beforeAttachmentId,
    after_attachment_id: app.afterAttachmentId,
    before_date: app.beforeDate || null,
    after_date: app.afterDate || null,
    before_position_x: Number(app.beforePositionX ?? 0),
    before_position_y: Number(app.beforePositionY ?? 0),
    before_zoom: Number(app.beforeZoom ?? 1),
    after_position_x: Number(app.afterPositionX ?? 0),
    after_position_y: Number(app.afterPositionY ?? 0),
    after_zoom: Number(app.afterZoom ?? 1),
    divider_position: Number(app.dividerPosition ?? 50),
    created_by: app.createdBy,
    created_at: app.createdAt || new Date().toISOString(),
  };
}

// -------------------------------------------------------------
// Supabase Data Access Service
// -------------------------------------------------------------

export const SupabaseService = {
  // Clinicas e Usuários Globais
  async getAllClinics(): Promise<ClinicTenant[]> {
    const { data, error } = await supabaseFetch<any[]>('df_tenants?select=*');
    if (error || !data) return [];
    return data.map(mapDbTenantToApp);
  },

  /**
   * @deprecated ELIMINADO POR SEGURANÇA (Fase 1).
   * Nunca mais consultar df_users sem escopo nem baixar hashes de senha para o frontend.
   */
  async getAllUsers(): Promise<StoredUserAccount[]> {
    console.warn('[SECURITY] getAllUsers() foi permanentemente desativado na migração para Supabase Auth.');
    return [];
  },

  /**
   * Busca com segurança o perfil do usuário autenticado a partir do seu UID do Supabase Auth.
   * Não baixa senhas, hashes nem salts para o cliente.
   */
  async fetchUserProfileByAuthId(authUserId: string, email?: string): Promise<StoredUserAccount | null> {
    try {
      // 1. Tenta buscar pelo auth_user_id vinculado
      if (authUserId) {
        const { data, error } = await supabase
          .from('df_users')
          .select('id, clinic_id, email, name, whatsapp_display_name, role, is_active, auth_user_id, is_primary, permissions, created_at')
          .eq('auth_user_id', authUserId)
          .maybeSingle();

        if (data && !error) {
          return mapDbUserToApp(data);
        }
      }

      // 2. Fallback por e-mail para vinculação automática do auth_user_id no primeiro login
      if (email) {
        const cleanEmail = email.trim().toLowerCase();
        const { data, error } = await supabase
          .from('df_users')
          .select('id, clinic_id, email, name, whatsapp_display_name, role, is_active, auth_user_id, is_primary, permissions, created_at')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (data && !error) {
          if (authUserId && !data.auth_user_id) {
            await supabase
              .from('df_users')
              .update({ auth_user_id: authUserId })
              .eq('id', data.id);
            data.auth_user_id = authUserId;
          }
          return mapDbUserToApp(data);
        }
      }

      return null;
    } catch (err) {
      console.error('[SupabaseService] Erro ao buscar perfil do usuário:', err);
      return null;
    }
  },

  /**
   * Obtém a lista de todas as clínicas para acesso exclusivo da conta primária de consultoria.
   */
  async getAllTenantsForSupport(): Promise<DentalTenantOption[]> {
    try {
      const { data, error } = await supabase.rpc('get_all_dental_tenants');
      if (error) {
        console.warn('[SupabaseService] Erro ao carregar clientes para suporte:', error.message);
        return [];
      }
      const rawList = (data || []).map((t: any) => ({
        tenant_id: t.tenant_id,
        clinic_name: t.clinic_name || t.trade_name || 'Clínica',
        trade_name: t.trade_name,
        owner_name: t.owner_name,
        owner_email: t.owner_email,
        total_users: Number(t.total_users || 0),
        created_at: t.created_at,
      }));

      // Camada defensiva: garantir unicidade estrita por tenant_id
      const seenTenants = new Set<string>();
      return rawList.filter((t: DentalTenantOption) => {
        if (!t.tenant_id || seenTenants.has(t.tenant_id)) return false;
        seenTenants.add(t.tenant_id);
        return true;
      });
    } catch (err) {
      console.error('[SupabaseService] Falha ao invocar get_all_dental_tenants:', err);
      return [];
    }
  },

  /**
   * Obtém o resumo completo da carteira de clínicas supervisionadas pela Consultoria (Contaju),
   * agregando métricas fiscais, financeiras, atrasos e alertas da competência indicada.
   */
  async getConsultingPortfolioSummary(competency?: string): Promise<ConsultingPortfolioData | null> {
    try {
      const { data, error } = await supabase.rpc('get_consulting_portfolio_summary', {
        p_competency: competency || null,
      });

      if (error) {
        console.warn('[SupabaseService] Erro ao invocar get_consulting_portfolio_summary:', error.message);
        return null;
      }

      if (!data) return null;

      // Camada defensiva: deduplicação de clientes por tenant_id
      const seenClients = new Set<string>();
      const rawClients = Array.isArray(data.clients) ? data.clients : [];
      const uniqueClients = rawClients
        .filter((c: any) => {
          if (!c?.tenant_id || seenClients.has(c.tenant_id)) return false;
          seenClients.add(c.tenant_id);
          return true;
        })
        .map((c: any) => ({
          tenant_id: c.tenant_id,
          clinic_name: c.clinic_name || 'Clínica',
          trade_name: c.trade_name || c.clinic_name || 'Clínica',
          cnpj: c.cnpj || '',
          owner_name: c.owner_name || 'Cirurgião-Dentista',
          owner_email: c.owner_email || '',
          owner_phone: c.owner_phone || '',
          monthly_revenue: Number(c.monthly_revenue || 0),
          monthly_expenses: Number(c.monthly_expenses || 0),
          payroll_amount: Number(c.payroll_amount || 0),
          rbt12: Number(c.rbt12 || 0),
          fs12: Number(c.fs12 || c.payroll_amount || 0),
          effective_rate: Number(c.effective_rate || 0),
          estimated_das: Number(c.estimated_das || 0),
          r_factor: Number(c.r_factor || 0),
          annex: c.annex === 'III' ? 'III' : 'V',
          overdue_receivables: Number(c.overdue_receivables || 0),
          overdue_payables: Number(c.overdue_payables || 0),
          open_receivables: Number(c.open_receivables || 0),
          open_payables: Number(c.open_payables || 0),
          contaju_sync_status: c.contaju_sync_status || 'PENDING',
          health_status: c.health_status || 'HEALTHY',
          health_reasons: Array.isArray(c.health_reasons) ? c.health_reasons : [],
        }));

      // Deduplicação defensiva de alertas por tenant_id + type + message
      const seenAlerts = new Set<string>();
      const rawAlerts = Array.isArray(data.priority_alerts) ? data.priority_alerts : [];
      const uniqueAlerts = rawAlerts
        .filter((a: any) => {
          const key = `${a?.tenant_id}_${a?.type}_${a?.message}`;
          if (seenAlerts.has(key)) return false;
          seenAlerts.add(key);
          return true;
        })
        .map((a: any) => ({
          tenant_id: a.tenant_id,
          clinic_name: a.clinic_name,
          severity: a.severity || 'INFO',
          type: a.type || 'FATOR_R',
          message: a.message,
          action_label: a.action_label,
        }));

      const parsedData: ConsultingPortfolioData = {
        portfolio_summary: {
          competency: data.portfolio_summary?.competency || competency || '',
          total_active_clinics: Number(data.portfolio_summary?.total_active_clinics || 0),
          total_portfolio_revenue: Number(data.portfolio_summary?.total_portfolio_revenue || 0),
          total_portfolio_expenses: Number(data.portfolio_summary?.total_portfolio_expenses || 0),
          total_portfolio_open_receivables: Number(data.portfolio_summary?.total_portfolio_open_receivables || 0),
          total_portfolio_open_payables: Number(data.portfolio_summary?.total_portfolio_open_payables || 0),
          total_portfolio_overdue: Number(data.portfolio_summary?.total_portfolio_overdue || 0),
          healthy_count: Number(data.portfolio_summary?.healthy_count || 0),
          warning_count: Number(data.portfolio_summary?.warning_count || 0),
          critical_count: Number(data.portfolio_summary?.critical_count || 0),
          annex_iii_count: Number(data.portfolio_summary?.annex_iii_count || 0),
          annex_v_count: Number(data.portfolio_summary?.annex_v_count || 0),
          estimated_total_das: Number(data.portfolio_summary?.estimated_total_das || 0),
          pending_closing_count: Number(data.portfolio_summary?.pending_closing_count || 0),
        },
        clients: uniqueClients,
        priority_alerts: uniqueAlerts,
      };

      return parsedData;
    } catch (err) {
      console.error('[SupabaseService] Falha geral ao carregar carteira de consultoria:', err);
      return null;
    }
  },

  /**
   * Reconcilia um usuário existente (caso legado) ou provisiona atômica e seguramente
   * uma nova clínica para novo cadastro no Supabase.
   */
  async reconcileOrProvisionDentalUser(params?: {
    clinicName?: string;
    tradeName?: string;
  }): Promise<{
    success: boolean;
    is_reconciled: boolean;
    tenant_id: string;
    user_id: string;
    role: string;
    clinic_name: string;
    trade_name?: string;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.rpc('reconcile_or_provision_dental_user', {
        p_clinic_name: params?.clinicName || null,
        p_trade_name: params?.tradeName || null,
      });

      if (error) {
        console.error('[SupabaseService] Erro no RPC reconcile_or_provision_dental_user:', error);
        return {
          success: false,
          is_reconciled: false,
          tenant_id: '',
          user_id: '',
          role: '',
          clinic_name: '',
          error: error.message,
        };
      }

      return data as {
        success: boolean;
        is_reconciled: boolean;
        tenant_id: string;
        user_id: string;
        role: string;
        clinic_name: string;
        trade_name?: string;
      };
    } catch (err: any) {
      console.error('[SupabaseService] Exceção em reconcileOrProvisionDentalUser:', err);
      return {
        success: false,
        is_reconciled: false,
        tenant_id: '',
        user_id: '',
        role: '',
        clinic_name: '',
        error: err?.message || 'Falha na comunicação de provisionamento com o servidor.',
      };
    }
  },

  async getClinic(clinicId: string): Promise<ClinicTenant | null> {
    try {
      const { data, error } = await supabase
        .from('df_tenants')
        .select('*')
        .eq('id', clinicId)
        .maybeSingle();

      if (data && !error) {
        return mapDbTenantToApp(data);
      }
      return null;
    } catch (err) {
      console.error('[SupabaseService] Erro ao buscar clínica:', err);
      return null;
    }
  },

  async saveClinic(clinic: ClinicTenant): Promise<{ success: boolean; error?: string }> {
    const payload = mapAppTenantToDb(clinic);
    const { error } = await supabaseFetch('df_tenants?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async deleteTenantCascading(tenantId: string): Promise<boolean> {
    if (
      !tenantId ||
      tenantId === 'clinic_1789405023533_phq5' ||
      tenantId === 'clinic_1789153962617_gpw1' ||
      tenantId === 'tenant_demo'
    ) {
      return false; // Proteção estrita contra exclusão acidental de contas reais de produção
    }
    try {
      await Promise.allSettled([
        supabaseFetch(`df_payroll_history?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_expenses?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_sales?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_patients?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_procedures?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_clinical_inputs?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_bank_accounts?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_appointments?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_system_preferences?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_audit_logs?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_professionals?tenant_id=eq.${tenantId}`, { method: 'DELETE' }),
        supabaseFetch(`df_users?clinic_id=eq.${tenantId}`, { method: 'DELETE' }),
      ]);
      await supabaseFetch(`df_tenants?id=eq.${tenantId}`, { method: 'DELETE' });
      return true;
    } catch {
      return false;
    }
  },

  async saveUser(user: StoredUserAccount): Promise<{ success: boolean; error?: string }> {
    const payload = mapAppUserToDb(user);
    const { error } = await supabaseFetch('df_users?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async fetchProfessional(tenantId: string): Promise<Professional | null> {
    const { data } = await supabaseFetch<any[]>(`df_professionals?tenant_id=eq.${tenantId}&select=*`);
    if (!data || data.length === 0) return null;
    return mapDbProfessionalToApp(data[0], tenantId);
  },

  async fetchPayrollHistory(tenantId: string): Promise<PayrollHistoryEntry[]> {
    const { data } = await supabaseFetch<any[]>(`df_payroll_history?tenant_id=eq.${tenantId}&order=month.asc&select=*`);
    if (!data) return [];
    return data.map(mapDbPayrollToApp);
  },

  // Dados do Tenant Específico (Clínica)
  async getTenantData(tenantId: string): Promise<{
    organization: Organization | null;
    professional: Professional | null;
    payrollHistory: PayrollHistoryEntry[];
    patients: Patient[];
    sales: Sale[];
    expenses: Expense[];
    expenseRecurrences: ExpenseRecurrenceSeries[];
    procedures: DentalProcedure[];
    clinicalInputs: ClinicalInput[];
    bankAccounts: BankAccount[];
    appointments: Appointment[];
    preferences: SystemPreferences | null;
    auditLogs: AuditLog[];
    error: string | null;
  }> {
    const [
      tenantRes,
      profRes,
      payrollRes,
      patientsRes,
      salesRes,
      expensesRes,
      expenseRecurrencesRes,
      proceduresRes,
      inputsRes,
      banksRes,
      apptsRes,
      prefsRes,
      logsRes,
    ] = await Promise.all([
      supabaseFetch<any[]>(`df_tenants?id=eq.${tenantId}&select=*`),
      supabaseFetch<any[]>(`df_professionals?tenant_id=eq.${tenantId}&select=*`),
      supabaseFetch<any[]>(`df_payroll_history?tenant_id=eq.${tenantId}&order=month.asc&select=*`),
      // Paginado: um único GET é cortado em 1000 linhas pelo PostgREST (clínicas
      // migradas de sistema anterior têm milhares de pacientes).
      fetchAllPages<any>(`df_patients?tenant_id=eq.${tenantId}&order=created_at.desc,id.asc&select=*`),
      supabaseFetch<any[]>(`df_sales?tenant_id=eq.${tenantId}&order=service_date.desc&select=*`),
      supabaseFetch<any[]>(`df_expenses?tenant_id=eq.${tenantId}&order=competence_date.desc&select=*`),
      supabaseFetch<any[]>(`df_expense_recurrences?tenant_id=eq.${tenantId}&select=*`),
      supabaseFetch<any[]>(`df_procedures?tenant_id=eq.${tenantId}&order=name.asc&select=*`),
      supabaseFetch<any[]>(`df_clinical_inputs?tenant_id=eq.${tenantId}&order=name.asc&select=*`),
      supabaseFetch<any[]>(`df_bank_accounts?tenant_id=eq.${tenantId}&select=*`),
      supabaseFetch<any[]>(`df_appointments?tenant_id=eq.${tenantId}&order=date.asc&select=*`),
      supabaseFetch<any[]>(`df_system_preferences?tenant_id=eq.${tenantId}&select=*`),
      supabaseFetch<any[]>(`df_audit_logs?tenant_id=eq.${tenantId}&order=timestamp.desc&limit=50&select=*`),
    ]);

    const error =
      profRes.error ||
      payrollRes.error ||
      patientsRes.error ||
      salesRes.error ||
      expensesRes.error ||
      proceduresRes.error ||
      inputsRes.error;

    const rawTenant = tenantRes.data && tenantRes.data.length > 0 ? tenantRes.data[0] : null;
    const rawProf = profRes.data && profRes.data.length > 0 ? profRes.data[0] : null;
    const mappedProf = rawProf ? mapDbProfessionalToApp(rawProf, tenantId) : null;

    const orgClinicName =
      (rawTenant?.name && rawTenant.name !== 'Clínica Odontológica' ? rawTenant.name : '') ||
      (rawTenant?.trade_name && rawTenant.trade_name !== 'Clínica Odontológica' ? rawTenant.trade_name : '') ||
      mappedProf?.nomeFantasia ||
      mappedProf?.razaoSocial ||
      mappedProf?.name ||
      rawTenant?.name ||
      'Clínica sem nome';

    const orgEntity: Organization | null = rawTenant
      ? {
          id: `org_${tenantId}`,
          name: orgClinicName,
          tradeName: rawTenant.trade_name || orgClinicName,
          createdAt: rawTenant.created_at || new Date().toISOString(),
        }
      : null;

    return {
      organization: orgEntity,
      professional: mappedProf,
      payrollHistory: payrollRes.data ? payrollRes.data.map(mapDbPayrollToApp) : [],
      patients: patientsRes.data ? patientsRes.data.map(mapDbPatientToApp) : null,
      sales: salesRes.data ? salesRes.data.map(mapDbSaleToApp) : null,
      expenses: expensesRes.data ? expensesRes.data.map(mapDbExpenseToApp) : null,
      expenseRecurrences: expenseRecurrencesRes.data ? expenseRecurrencesRes.data.map(mapDbExpenseRecurrenceToApp) : [],
      procedures: proceduresRes.data ? proceduresRes.data.map(mapDbProcedureToApp) : null,
      clinicalInputs: inputsRes.data ? inputsRes.data.map(mapDbClinicalInputToApp) : null,
      bankAccounts: banksRes.data ? banksRes.data.map(mapDbBankAccountToApp) : null,
      appointments: apptsRes.data ? apptsRes.data.map(mapDbAppointmentToApp) : null,
      preferences: prefsRes.data && prefsRes.data.length > 0 ? mapDbPreferencesToApp(prefsRes.data[0]) : null,
      auditLogs: (logsRes.data || []).map(mapDbAuditLogToApp),
      error,
    };
  },

  // Garantia Atômica de Existência do Tenant Pai (evita 23503 / 409 Conflict)
  async ensureTenantExists(
    tenantId: string,
    fallback?: Partial<ClinicTenant>
  ): Promise<{ success: boolean; error?: string }> {
    if (!tenantId) return { success: false, error: 'tenant_id é obrigatório' };

    const initialName = fallback?.name || fallback?.tradeName || 'Clínica sem nome';
    const initialTradeName = fallback?.tradeName || fallback?.name || initialName;

    const payload: any = {
      id: tenantId,
      name: initialName,
      trade_name: initialTradeName,
      cnpj: fallback?.cnpj || '',
      cpf_cnpj: fallback?.cpfCnpj || fallback?.cnpj || '',
      cro: fallback?.cro || '',
      cro_uf: fallback?.croUf || fallback?.uf || 'SP',
      email: fallback?.email || '',
      phone: fallback?.phone || '',
      city: fallback?.city || 'São Paulo - SP',
      uf: fallback?.uf || 'SP',
      is_demo: fallback?.isDemo ?? (tenantId === 'tenant_demo'),
      is_active: fallback?.isActive ?? true,
      created_at: fallback?.createdAt || new Date().toISOString(),
    };

    // ignore-duplicates: só garante que a linha existe (FK). Com merge-duplicates cada gravação de
    // paciente/venda/etc. sobrescrevia nome, CNPJ, e-mail, telefone, cidade, is_active e created_at da
    // clínica com os valores padrão ("Clínica sem nome"). Quem quer ALTERAR o tenant usa PATCH explícito
    // (saveProfessional / updateTenantClinicName).
    const { error } = await supabaseFetch('df_tenants?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: payload,
    });

    if (error) {
      console.warn(`[SupabaseService] Aviso ao assegurar tenant ${tenantId}:`, error);
      return { success: false, error };
    }
    return { success: true };
  },

  // Atualização direta do nome da clínica em df_tenants e df_professionals
  async updateTenantClinicName(tenantId: string, clinicName: string): Promise<{ success: boolean; error?: string }> {
    const trimmed = clinicName.trim();
    if (!trimmed) return { success: false, error: 'Nome da clínica é obrigatório.' };

    const [tRes, pRes] = await Promise.all([
      supabaseFetch(`df_tenants?id=eq.${tenantId}`, {
        method: 'PATCH',
        body: { name: trimmed, trade_name: trimmed },
      }),
      supabaseFetch(`df_professionals?tenant_id=eq.${tenantId}`, {
        method: 'PATCH',
        body: { nome_fantasia: trimmed, razao_social: trimmed },
      }),
    ]);

    const err = tRes.error || pRes.error;
    return { success: !err, error: err || undefined };
  },

  // Gravações no PostgreSQL por Tenant com Proteção de FK
  async saveProfessional(prof: Professional, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const realClinicName = (prof.nomeFantasia || prof.razaoSocial || prof.name || 'Clínica sem nome').trim();

    await this.ensureTenantExists(tenantId, {
      name: realClinicName,
      tradeName: realClinicName,
      cnpj: prof.cnpj || '',
      cro: prof.cro || '',
      croUf: prof.croUf || prof.uf || 'SP',
      uf: prof.uf || 'SP',
      email: prof.email || '',
      phone: prof.phone || '',
      city: prof.municipio || 'São Paulo - SP',
      isDemo: tenantId === 'tenant_demo',
    });

    // Atualiza explicitamente df_tenants para garantir que o nome real e CNPJ persistam imediatamente
    if (realClinicName && realClinicName !== 'Clínica Odontológica') {
      supabaseFetch(`df_tenants?id=eq.${tenantId}`, {
        method: 'PATCH',
        body: {
          name: realClinicName,
          trade_name: realClinicName,
          cnpj: prof.cnpj || '',
          cpf_cnpj: prof.cnpj || '',
        },
      }).catch(console.warn);
    }

    const payload = mapAppProfessionalToDb(prof, tenantId);
    const { error } = await supabaseFetch('df_professionals?on_conflict=tenant_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async savePayrollEntry(entry: PayrollHistoryEntry, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppPayrollToDb(entry, tenantId);
    const { error } = await supabaseFetch('df_payroll_history?on_conflict=tenant_id,month', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async savePatient(patient: Patient, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppPatientToDb(patient, tenantId);
    const { error } = await supabaseFetch('df_patients?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async updatePatient(patient: Patient, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = {
      name: patient.name,
      document_type: patient.documentType === 'CNPJ' ? 'CNPJ' : 'CPF',
      cpf: patient.cpf || '',
      email: patient.email || '',
      phone: patient.phone || '',
      phone_owner: patient.phoneOwner === 'RESPONSIBLE' ? 'RESPONSIBLE' : 'PATIENT',
      birth_date: patient.birthDate || '',
      notes: patient.notes || '',
      allergies: asStringArray(patient.allergies),
      conditions: asStringArray(patient.conditions),
      medications: asStringArray(patient.medications),
      clinical_notes: patient.clinicalNotes || '',
    };
    const { error } = await supabaseFetch(`df_patients?id=eq.${patient.id}&tenant_id=eq.${tenantId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  // Exclusão de paciente SÓ pelo caminho seguro (RPC no servidor): verifica venda/agenda/
  // prontuário/documentos (várias referências não têm foreign key), grava auditoria, marca o
  // mapa legado como DELETED e encerra pendências. Não existe mais DELETE direto de paciente.
  async checkPatientDeletion(patientId: string): Promise<PatientDeleteCheck> {
    const { data, error } = await supabaseFetch<any>('rpc/dental_patient_delete_check', {
      method: 'POST',
      body: { p_patient_id: patientId },
    });
    if (error || !data) return { ok: false, message: error || 'Não foi possível verificar as referências do paciente.' };
    return data as PatientDeleteCheck;
  },

  async deletePatientSafe(patientId: string, reason?: string): Promise<{
    ok: boolean;
    code?: string;
    message?: string;
    blocking?: Record<string, number>;
    detached?: Record<string, number>;
  }> {
    const { data, error } = await supabaseFetch<any>('rpc/dental_delete_patient_safe', {
      method: 'POST',
      body: { p_patient_id: patientId, p_reason: reason || null },
    });
    if (error || !data) return { ok: false, message: error || 'Falha ao excluir o paciente.' };
    return data;
  },

  // --- Revisão cadastral (pendências) ---------------------------------------
  // Fila de pendências do tenant inteira, paginada (um paciente pode ter várias; a clínica tem
  // milhares de pacientes). Histórico (resolvidas/revisadas) vem junto para o painel da ficha.
  async getReviewIssuesForTenant(tenantId: string, openOnly = true): Promise<{ data: PatientReviewIssue[]; error?: string }> {
    const { data, error } = await fetchAllPages<any>(
      `df_patient_review_issues?tenant_id=eq.${tenantId}${openOnly ? '&status=eq.OPEN' : ''}&order=created_at.asc,id.asc&select=*`
    );
    if (error || !data) return { data: [], error: error || undefined };
    return { data: data.map(mapDbReviewIssueToApp) };
  },

  // Histórico COMPLETO (abertas + resolvidas + revisadas) de um paciente — painel da ficha.
  async getReviewIssuesForPatient(tenantId: string, patientId: string): Promise<PatientReviewIssue[]> {
    const { data, error } = await supabaseFetch<any[]>(
      `df_patient_review_issues?tenant_id=eq.${tenantId}&patient_id=eq.${encodeURIComponent(patientId)}&order=created_at.asc,id.asc&select=*`
    );
    if (error || !data) throw new Error(error || 'Falha ao ler pendências do paciente.');
    return data.map(mapDbReviewIssueToApp);
  },

  async getOpenReviewIssuesForPatient(tenantId: string, patientId: string): Promise<PatientReviewIssue[]> {
    const { data, error } = await supabaseFetch<any[]>(
      `df_patient_review_issues?tenant_id=eq.${tenantId}&patient_id=eq.${encodeURIComponent(patientId)}&status=eq.OPEN&select=*`
    );
    if (error || !data) throw new Error(error || 'Falha ao ler pendências do paciente.');
    return data.map(mapDbReviewIssueToApp);
  },

  // Encerra UMA pendência aberta (RESOLVED = objetivamente resolvida; REVIEWED = revisada por
  // um usuário). A trigger de guarda impede reabrir/alterar identidade; o filtro status=OPEN
  // garante que só se encerra o que ainda está aberto.
  async closeReviewIssue(
    issueId: string,
    tenantId: string,
    status: 'RESOLVED' | 'REVIEWED',
    resolvedBy: string,
    note?: string
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(
      `df_patient_review_issues?id=eq.${encodeURIComponent(issueId)}&tenant_id=eq.${tenantId}&status=eq.OPEN`,
      {
        method: 'PATCH',
        body: {
          status,
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy,
          resolution_note: note || null,
        },
      }
    );
    return { success: !error, error: error || undefined };
  },

  // --- Responsável (guardian) ---------------------------------------------
  // Modelo: df_patient_guardians (entidade responsável, reutilizável entre
  // irmãos) + df_patient_guardian_links (vínculo N:N paciente<->responsável,
  // no máximo 1 primário por paciente). Ver CLAUDE.md "Guardian / responsável".

  async findGuardianCandidates(
    tenantId: string,
    query: { phone?: string; cpf?: string }
  ): Promise<Array<{ id: string; name: string; cpf?: string; phone?: string; email?: string }>> {
    const cleanPhone = (query.phone || '').replace(/\D/g, '');
    const cleanCpf = (query.cpf || '').replace(/\D/g, '');
    if (!cleanPhone && !cleanCpf) return [];

    const filters: string[] = [];
    if (cleanPhone) filters.push(`phone.eq.${cleanPhone}`);
    if (cleanCpf) filters.push(`cpf.eq.${cleanCpf}`);

    const { data, error } = await supabaseFetch(
      `df_patient_guardians?tenant_id=eq.${tenantId}&or=(${filters.join(',')})&select=id,name,cpf,phone,email`,
      { method: 'GET' }
    );
    if (error || !Array.isArray(data)) return [];
    return data.map((g: any) => ({ id: g.id, name: g.name, cpf: g.cpf || undefined, phone: g.phone || undefined, email: g.email || undefined }));
  },

  async upsertGuardian(
    tenantId: string,
    guardian: { id?: string; name: string; cpf?: string; phone?: string; email?: string }
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    // Sem id explícito: nunca cria duplicado quando já existe um responsável
    // com CPF igual, ou nome+telefone iguais (Fase 6 do hardening — critério
    // em src/lib/guardianMatching.ts, mesmo usado pelo futuro importador).
    let id = guardian.id;
    if (!id) {
      const candidates = await this.findGuardianCandidates(tenantId, { phone: guardian.phone, cpf: guardian.cpf });
      const match = resolveGuardianMatch(candidates, { name: guardian.name, cpf: guardian.cpf, phone: guardian.phone });
      if (match) id = match.id;
    }
    id = id || `grd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cleanCpf = (guardian.cpf || '').replace(/\D/g, '') || null;
    const cleanPhone = (guardian.phone || '').replace(/\D/g, '') || null;
    const payload = {
      id,
      tenant_id: tenantId,
      name: guardian.name,
      cpf: cleanCpf,
      phone: cleanPhone,
      email: guardian.email || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseFetch('df_patient_guardians?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, id, error: error || undefined };
  },

  async linkGuardianToPatient(
    tenantId: string,
    patientId: string,
    guardianId: string,
    opts?: { relationshipType?: string; isPrimary?: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    const isPrimary = opts?.isPrimary !== false;

    // Troca de responsável (Fase 5 do hardening): a unique index
    // uq_df_patient_guardian_links_primary só permite 1 vínculo primário por
    // paciente — desmarca qualquer outro primário ANTES de gravar o novo,
    // sem apagar o vínculo antigo (o paciente pode voltar a usá-lo depois, e
    // o responsável anterior não é afetado se ainda estiver ligado a outros
    // pacientes, ex.: Maria continua responsável de Ana quando João passa
    // para Carlos).
    if (isPrimary) {
      await supabaseFetch(
        `df_patient_guardian_links?tenant_id=eq.${tenantId}&patient_id=eq.${patientId}&is_primary=eq.true&guardian_id=neq.${guardianId}`,
        { method: 'PATCH', body: { is_primary: false } }
      );
    }

    const payload = {
      tenant_id: tenantId,
      patient_id: patientId,
      guardian_id: guardianId,
      relationship_type: opts?.relationshipType || null,
      is_primary: isPrimary,
    };
    const { error } = await supabaseFetch('df_patient_guardian_links?on_conflict=patient_id,guardian_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async getPrimaryGuardianForPatient(
    tenantId: string,
    patientId: string
  ): Promise<{ id: string; name: string; cpf?: string; phone?: string; email?: string; relationshipType?: string } | null> {
    const { data, error } = await supabaseFetch(
      `df_patient_guardian_links?tenant_id=eq.${tenantId}&patient_id=eq.${patientId}&is_primary=eq.true&select=relationship_type,guardian:df_patient_guardians(id,name,cpf,phone,email)`,
      { method: 'GET' }
    );
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as any;
    const g = row.guardian;
    if (!g) return null;
    return { id: g.id, name: g.name, cpf: g.cpf || undefined, phone: g.phone || undefined, email: g.email || undefined, relationshipType: row.relationship_type || undefined };
  },

  // Resumo de responsável para TODOS os pacientes do tenant em 2 queries (sem
  // N+1) — alimenta listagem/ficha/filtros/busca por responsável.
  // - byPatientId: pacientes que TÊM responsável (guardian primário).
  // - guardianOfPatientId: pacientes que SÃO responsáveis de outros
  //   (vínculo explícito guardian.linked_patient_id, só por CPF único —
  //   nunca por nome/telefone, ver migration 20260923000000).
  async getPatientGuardianSummaries(
    tenantId: string
  ): Promise<{
    byPatientId: Record<string, { guardianId: string; guardianName: string; guardianPhone?: string; guardianEmail?: string; relationshipType?: string }>;
    guardianOfPatientId: Record<string, { dependents: Array<{ patientId: string; relationshipType?: string }> }>;
  }> {
    const byPatientId: Record<string, { guardianId: string; guardianName: string; guardianPhone?: string; guardianEmail?: string; relationshipType?: string }> = {};
    const guardianOfPatientId: Record<string, { dependents: Array<{ patientId: string; relationshipType?: string }> }> = {};

    const { data: linkRows } = await fetchAllPages<any>(
      `df_patient_guardian_links?tenant_id=eq.${tenantId}&is_primary=eq.true&order=patient_id.asc,guardian_id.asc&select=patient_id,relationship_type,guardian:df_patient_guardians(id,name,phone,email,linked_patient_id)`
    );
    if (Array.isArray(linkRows)) {
      for (const row of linkRows as any[]) {
        const g = row.guardian;
        if (!g) continue;
        byPatientId[row.patient_id] = {
          guardianId: g.id,
          guardianName: g.name,
          guardianPhone: g.phone || undefined,
          guardianEmail: g.email || undefined,
          relationshipType: row.relationship_type || undefined,
        };
        if (g.linked_patient_id) {
          if (!guardianOfPatientId[g.linked_patient_id]) guardianOfPatientId[g.linked_patient_id] = { dependents: [] };
          guardianOfPatientId[g.linked_patient_id].dependents.push({
            patientId: row.patient_id,
            relationshipType: row.relationship_type || undefined,
          });
        }
      }
    }

    return { byPatientId, guardianOfPatientId };
  },

  // Remove o vínculo PRIMÁRIO de responsável de um paciente (ex.: usuário
  // trocou o telefone de "Do responsável" de volta para "Do paciente").
  // Soft-unlink (is_primary=false), nunca apaga a linha nem o guardian —
  // preserva histórico e não afeta outros pacientes vinculados ao mesmo
  // responsável (ver Fase 12 do hardening: Maria pode continuar responsável
  // de Ana mesmo que o vínculo com João seja removido).
  async unlinkPrimaryGuardianFromPatient(
    tenantId: string,
    patientId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(
      `df_patient_guardian_links?tenant_id=eq.${tenantId}&patient_id=eq.${patientId}&is_primary=eq.true`,
      { method: 'PATCH', body: { is_primary: false } }
    );
    return { success: !error, error: error || undefined };
  },

  // "Responsável por": pacientes dependentes de um paciente que também é
  // guardian (vínculo explícito por CPF, ver migration 20260923000000).
  async getPatientsGuardedByPatient(
    tenantId: string,
    patientId: string
  ): Promise<Array<{ patientId: string; name: string; relationshipType?: string }>> {
    const { data: guardianRows, error } = await supabaseFetch(
      `df_patient_guardians?tenant_id=eq.${tenantId}&linked_patient_id=eq.${patientId}&select=id`,
      { method: 'GET' }
    );
    if (error || !Array.isArray(guardianRows) || guardianRows.length === 0) return [];

    const guardianIds = guardianRows.map((g: any) => g.id);
    const orFilter = guardianIds.map((id: string) => `guardian_id.eq.${id}`).join(',');
    const { data: linkRows } = await supabaseFetch(
      `df_patient_guardian_links?tenant_id=eq.${tenantId}&or=(${orFilter})&select=patient_id,relationship_type,patient:df_patients(name)`,
      { method: 'GET' }
    );
    if (!Array.isArray(linkRows)) return [];
    return linkRows
      .filter((r: any) => r.patient_id !== patientId)
      .map((r: any) => ({ patientId: r.patient_id, name: r.patient?.name || '—', relationshipType: r.relationship_type || undefined }));
  },

  // Todos os pacientes vinculados (primário + secundários) a um contato
  // WhatsApp — usado quando um número é compartilhado entre irmãos.
  async getPatientsForWaContact(
    tenantId: string,
    contactId: string
  ): Promise<Array<{ patientId: string; isPrimary: boolean; relationshipType?: string }>> {
    const { data, error } = await supabaseFetch(
      `df_wa_contact_patients?tenant_id=eq.${tenantId}&contact_id=eq.${contactId}&select=patient_id,is_primary,relationship_type`,
      { method: 'GET' }
    );
    if (error || !Array.isArray(data)) return [];
    return data.map((r: any) => ({ patientId: r.patient_id, isPrimary: !!r.is_primary, relationshipType: r.relationship_type || undefined }));
  },

  // -------------------------------------------------------------
  // Profissionais CLÍNICOS (equipe de dentistas — distinto do Professional fiscal único por
  // tenant). Ver comentário completo em df_clinical_professionals (migration 20260929140000).
  // -------------------------------------------------------------
  async getClinicalProfessionals(tenantId: string): Promise<ClinicalProfessional[]> {
    const { data, error } = await fetchAllPages<any>(
      `df_clinical_professionals?tenant_id=eq.${tenantId}&order=name.asc`
    );
    if (error || !Array.isArray(data)) return [];
    return data.map(mapDbClinicalProfessionalToApp);
  },

  async upsertClinicalProfessional(
    tenantId: string,
    professional: {
      id?: string;
      name: string;
      cro?: string | null;
      croUf?: string | null;
      especialidade?: string | null;
      color?: string | null;
      isActive?: boolean;
      userId?: string | null;
    }
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const id = professional.id || `clprof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const payload = {
      id,
      tenant_id: tenantId,
      name: professional.name,
      cro: professional.cro || null,
      cro_uf: professional.croUf || null,
      especialidade: professional.especialidade || null,
      color: professional.color || null,
      is_active: professional.isActive ?? true,
      user_id: professional.userId || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseFetch('df_clinical_professionals?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, id, error: error || undefined };
  },

  async setClinicalProfessionalActive(
    tenantId: string,
    professionalId: string,
    isActive: boolean
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(
      `df_clinical_professionals?tenant_id=eq.${tenantId}&id=eq.${professionalId}`,
      { method: 'PATCH', body: { is_active: isActive, updated_at: new Date().toISOString() } }
    );
    return { success: !error, error: error || undefined };
  },

  // Vínculo procedimento <-> profissionais habilitados. Ausência de qualquer linha para o
  // procedimento = disponível a todos os ativos (ver resolveEligibleProfessionals).
  async getProcedureProfessionalLinks(tenantId: string): Promise<Record<string, string[]>> {
    // df_procedure_professionals não tem coluna id (PK composta procedure_id+professional_id) —
    // fetchAllPages só acrescenta 'order=id.asc' automaticamente quando o endpoint NÃO já traz um
    // order=; sem este explícito, a paginação quebrava com 42703 "column ...id does not exist"
    // (bug real encontrado ao testar ao vivo: a restrição de profissionais por procedimento nunca
    // carregava, sempre retornando vazio/erro em silêncio).
    const { data, error } = await fetchAllPages<any>(
      `df_procedure_professionals?tenant_id=eq.${tenantId}&select=procedure_id,professional_id&order=procedure_id.asc,professional_id.asc`
    );
    const byProcedure: Record<string, string[]> = {};
    if (error || !Array.isArray(data)) return byProcedure;
    for (const row of data as any[]) {
      if (!byProcedure[row.procedure_id]) byProcedure[row.procedure_id] = [];
      byProcedure[row.procedure_id].push(row.professional_id);
    }
    return byProcedure;
  },

  // Substitui o conjunto de profissionais habilitados de um procedimento (delete + insert do
  // lote novo) — lista vazia = "todos os profissionais ativos podem executar" (nunca uma
  // restrição implícita a zero profissionais).
  async setProcedureProfessionals(
    tenantId: string,
    procedureId: string,
    professionalIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    const { error: delErr } = await supabaseFetch(
      `df_procedure_professionals?tenant_id=eq.${tenantId}&procedure_id=eq.${procedureId}`,
      { method: 'DELETE' }
    );
    if (delErr) return { success: false, error: delErr };
    if (professionalIds.length === 0) return { success: true };
    const rows = professionalIds.map((professionalId) => ({
      tenant_id: tenantId,
      procedure_id: procedureId,
      professional_id: professionalId,
    }));
    const { error } = await supabaseFetch('df_procedure_professionals', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: rows,
    });
    return { success: !error, error: error || undefined };
  },

  // -------------------------------------------------------------
  // Estoque real (Fase C) — o saldo (df_clinical_inputs.quantity_on_hand) só muda por movimentação;
  // ver migration 20260929150000 (trigger fn_apply_stock_movement, AFTER INSERT — nunca BEFORE,
  // senão um upsert com ignore-duplicates aplicaria o delta mesmo quando a linha é descartada por
  // conflito, corrompendo o saldo sem histórico correspondente).
  // -------------------------------------------------------------
  // Refetch pontual (nunca via getTenantData) para trazer o saldo AUTORITATIVO logo após gravar
  // movimentações — o trigger no banco é quem calcula quantity_on_hand, o cliente nunca confia no
  // que tinha antes de recarregar.
  async getClinicalInputs(tenantId: string): Promise<ClinicalInput[]> {
    const { data, error } = await fetchAllPages<any>(`df_clinical_inputs?tenant_id=eq.${tenantId}&order=name.asc`);
    if (error || !Array.isArray(data)) return [];
    return data.map(mapDbClinicalInputToApp);
  },

  async getStockMovements(
    tenantId: string,
    filters?: { inputId?: string; clinicalRecordId?: string }
  ): Promise<StockMovement[]> {
    let filter = '';
    if (filters?.inputId) filter += `&input_id=eq.${filters.inputId}`;
    if (filters?.clinicalRecordId) filter += `&clinical_record_id=eq.${filters.clinicalRecordId}`;
    const { data, error } = await fetchAllPages<any>(
      `df_stock_movements?tenant_id=eq.${tenantId}${filter}&order=created_at.desc`
    );
    if (error || !Array.isArray(data)) return [];
    return data.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      inputId: r.input_id,
      movementType: r.movement_type,
      quantity: Number(r.quantity),
      balanceAfter: Number(r.balance_after),
      clinicalRecordId: r.clinical_record_id || null,
      reason: r.reason || null,
      createdBy: r.created_by || null,
      createdByName: r.created_by_name || null,
      createdAt: r.created_at,
    }));
  },

  // Lote de movimentações com a MESMA origem (ex.: todos os insumos de UM atendimento finalizado).
  // Idempotente: onConflict casa exatamente o índice único da migration — reentrega (ex.: finalizar
  // o mesmo atendimento duas vezes) nunca duplica o consumo, porque a linha conflitante é descartada
  // ANTES de chegar no trigger (AFTER INSERT só dispara para linhas realmente gravadas).
  async recordStockMovements(
    tenantId: string,
    movements: Array<{
      inputId: string;
      movementType: StockMovementType;
      quantity: number;
      clinicalRecordId?: string | null;
      reason?: string | null;
      createdBy?: string | null;
      createdByName?: string | null;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    if (movements.length === 0) return { success: true };
    const rows = movements.map((m, idx) => ({
      id: `stkmv_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      tenant_id: tenantId,
      input_id: m.inputId,
      movement_type: m.movementType,
      quantity: m.quantity,
      clinical_record_id: m.clinicalRecordId || null,
      reason: m.reason || null,
      created_by: m.createdBy || null,
      created_by_name: m.createdByName || null,
    }));
    const { error } = await supabaseFetch(
      'df_stock_movements?on_conflict=tenant_id,clinical_record_id,input_id,movement_type',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: rows,
      }
    );
    return { success: !error, error: error || undefined };
  },

  // Alerta de estoque mínimo — broadcast (user_id null) para toda a equipe elegível, mesma
  // semântica de "notificação de fila" já usada no webhook do WhatsApp. Edge-triggered: só é
  // chamado quando o saldo realmente CRUZOU o mínimo nesta movimentação (ver didCrossLowThreshold,
  // src/lib/stockMovements.ts) — nunca a cada leitura/render.
  //
  // IMPORTANTE: df_notifications não tem policy de INSERT para usuários comuns (só SELECT/UPDATE,
  // de propósito — ninguém deve conseguir forjar notificação direto do navegador). Por isso esta
  // gravação passa pela Edge Function dental-create-notification (service_role, allowlist fechado
  // de "type"), nunca por um INSERT REST direto — um INSERT direto aqui sempre falharia com 403
  // (bug real encontrado testando ao vivo: o alerta nunca era criado, sempre bloqueado por RLS).
  async createLowStockNotification(tenantId: string, inputName: string, inputId: string): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('dental-create-notification', {
        body: {
          tenant_id: tenantId,
          type: 'low_stock',
          title: 'Estoque mínimo atingido',
          notification_body: `${inputName} atingiu o estoque mínimo configurado.`,
          entity_id: inputId,
        },
      });
      if (error) console.warn('[Stock] Aviso ao criar notificação de estoque mínimo:', error.message);
    } catch (err) {
      console.warn('[Stock] Aviso ao criar notificação de estoque mínimo:', err);
    }
  },

  // -------------------------------------------------------------
  // Orçamentos (Fase D) — CRUD simples, sem nenhum efeito colateral financeiro/fiscal/estoque.
  // -------------------------------------------------------------
  async getBudgets(tenantId: string): Promise<Budget[]> {
    const { data, error } = await fetchAllPages<any>(`df_budgets?tenant_id=eq.${tenantId}&order=created_at.desc`);
    if (error || !Array.isArray(data)) return [];
    return data.map(mapDbBudgetToApp);
  },

  async saveBudget(budget: Budget, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const payload = mapAppBudgetToDb(budget, tenantId);
    const { error } = await supabaseFetch('df_budgets?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async deleteBudget(id: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(`df_budgets?id=eq.${id}&tenant_id=eq.${tenantId}`, { method: 'DELETE' });
    return { success: !error, error: error || undefined };
  },

  async saveSale(sale: Sale, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppSaleToDb(sale, tenantId);
    const { error } = await supabaseFetch('df_sales?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async deleteSale(saleId: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(`df_sales?id=eq.${saleId}&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
    return { success: !error, error: error || undefined };
  },

  async saveExpense(expense: Expense, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppExpenseToDb(expense, tenantId);
    const { error } = await supabaseFetch('df_expenses?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
      timeoutMs: 35000,
    });
    if (error) {
      console.error('[SupabaseService] Erro ao salvar despesa:', error, 'Payload ID:', payload?.id);
    }
    return { success: !error, error: error || undefined };
  },

  async saveExpensesBulk(expenses: Expense[], tenantId: string): Promise<{ success: boolean; error?: string }> {
    if (!expenses || expenses.length === 0) return { success: true };
    await this.ensureTenantExists(tenantId);
    const payloads = expenses.map((exp) => mapAppExpenseToDb(exp, tenantId));
    const { error } = await supabaseFetch('df_expenses?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payloads,
      timeoutMs: 45000,
    });
    if (error) {
      console.error('[SupabaseService] Erro ao salvar despesas em lote:', error, 'Qtd:', payloads.length);
    }
    return { success: !error, error: error || undefined };
  },

  async deleteExpense(expenseId: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(`df_expenses?id=eq.${expenseId}&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
    return { success: !error, error: error || undefined };
  },

  async deleteExpenses(expenseIds: string[], tenantId: string): Promise<{ success: boolean; error?: string }> {
    if (!expenseIds.length) return { success: true };
    const { error } = await supabaseFetch(`df_expenses?id=in.(${expenseIds.join(',')})&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
    return { success: !error, error: error || undefined };
  },

  async getExpenseRecurrences(tenantId: string): Promise<{ data: ExpenseRecurrenceSeries[] | null; error?: string }> {
    const { data, error } = await supabaseFetch<any[]>(`df_expense_recurrences?tenant_id=eq.${tenantId}&select=*`);
    return { data: data ? data.map(mapDbExpenseRecurrenceToApp) : null, error: error || undefined };
  },

  async saveExpenseRecurrence(series: ExpenseRecurrenceSeries, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const payload = mapAppExpenseRecurrenceToDb(series, tenantId);
    const { error } = await supabaseFetch('df_expense_recurrences?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    if (error) {
      console.error('[SupabaseService] Erro ao salvar série de despesa recorrente:', error, 'ID:', payload?.id);
    }
    return { success: !error, error: error || undefined };
  },

  async saveProcedure(proc: DentalProcedure, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppProcedureToDb(proc, tenantId);
    const { error } = await supabaseFetch('df_procedures?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async deleteProcedure(procId: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(`df_procedures?id=eq.${procId}&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
    return { success: !error, error: error || undefined };
  },

  async saveClinicalInput(input: ClinicalInput, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppClinicalInputToDb(input, tenantId);
    const { error } = await supabaseFetch('df_clinical_inputs?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async deleteClinicalInput(inputId: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(`df_clinical_inputs?id=eq.${inputId}&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
    return { success: !error, error: error || undefined };
  },

  async saveBankAccount(account: BankAccount, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppBankAccountToDb(account, tenantId);
    const { error } = await supabaseFetch('df_bank_accounts?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async saveBankAccountsBulk(accounts: BankAccount[], tenantId: string): Promise<{ success: boolean; error?: string }> {
    if (!accounts || accounts.length === 0) return { success: true };
    await this.ensureTenantExists(tenantId);
    const payloads = accounts.map((acc) => mapAppBankAccountToDb(acc, tenantId));
    const { error } = await supabaseFetch('df_bank_accounts?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payloads,
    });
    return { success: !error, error: error || undefined };
  },

  async deleteBankAccount(id: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const { error } = await supabaseFetch(`df_bank_accounts?id=eq.${id}&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
    return { success: !error, error: error || undefined };
  },

  async saveAppointment(appt: Appointment, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppAppointmentToDb(appt, tenantId);
    const { error } = await supabaseFetch('df_appointments?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async deleteAppointment(apptId: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(`df_appointments?id=eq.${apptId}&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
    return { success: !error, error: error || undefined };
  },

  async savePreferences(prefs: SystemPreferences, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppPreferencesToDb(prefs, tenantId);
    const { error } = await supabaseFetch('df_system_preferences?on_conflict=tenant_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async logAudit(log: AuditLog, tenantId: string): Promise<{ success: boolean }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppAuditLogToDb(log, tenantId);
    const { error } = await supabaseFetch('df_audit_logs', {
      method: 'POST',
      body: payload,
    });
    return { success: !error };
  },

  // -----------------------------------------------------------
  // Prontuário Clínico, Anexos, Adendos e Pares Antes/Depois
  // -----------------------------------------------------------
  async getClinicalRecords(tenantId: string, patientId?: string): Promise<{ data: ClinicalRecord[]; error?: string }> {
    await this.ensureTenantExists(tenantId);
    let endpoint = `df_clinical_records?tenant_id=eq.${tenantId}&order=record_date.desc,created_at.desc`;
    if (patientId) {
      endpoint += `&patient_id=eq.${patientId}`;
    }
    const { data, error } = await supabaseFetch<any[]>(endpoint);
    if (error || !data) return { data: [], error: error || undefined };

    const records = data.map(mapDbClinicalRecordToApp);

    // Carrega adendos e anexos vinculados para compor cada registro
    const [amendRes, attachRes] = await Promise.all([
      supabaseFetch<any[]>(`df_clinical_record_amendments?tenant_id=eq.${tenantId}&order=created_at.asc`),
      supabaseFetch<any[]>(`df_clinical_attachments?tenant_id=eq.${tenantId}&order=created_at.asc`),
    ]);

    const amendments = (amendRes.data || []).map(mapDbClinicalAmendmentToApp);
    const attachments = (attachRes.data || []).map(mapDbClinicalAttachmentToApp);

    for (const rec of records) {
      rec.amendments = amendments.filter((a) => a.clinicalRecordId === rec.id);
      rec.attachments = attachments.filter((att) => att.clinicalRecordId === rec.id);
      rec.attachmentsCount = rec.attachments.length;
    }

    return { data: records };
  },

  async saveClinicalRecord(record: ClinicalRecord, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppClinicalRecordToDb(record, tenantId);
    const { error } = await supabaseFetch('df_clinical_records?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async finalizeClinicalRecord(
    recordId: string,
    finalizedBy: string,
    finalizedByName: string,
    tenantId: string
  ): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const now = new Date().toISOString();
    const { error } = await supabaseFetch(`df_clinical_records?id=eq.${recordId}&tenant_id=eq.${tenantId}`, {
      method: 'PATCH',
      body: {
        status: 'FINALIZED',
        finalized_by: finalizedBy,
        finalized_at: now,
        updated_at: now,
      },
    });
    return { success: !error, error: error || undefined };
  },

  async addClinicalRecordAmendment(
    amendment: ClinicalRecordAmendment,
    tenantId: string
  ): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppClinicalAmendmentToDb(amendment, tenantId);
    const { error: insertError } = await supabaseFetch('df_clinical_record_amendments', {
      method: 'POST',
      body: payload,
    });
    if (insertError) return { success: false, error: insertError };

    // Atualiza status do registro para AMENDED
    await supabaseFetch(`df_clinical_records?id=eq.${amendment.clinicalRecordId}&tenant_id=eq.${tenantId}`, {
      method: 'PATCH',
      body: { status: 'AMENDED', updated_at: new Date().toISOString() },
    });

    return { success: true };
  },

  async voidClinicalRecord(
    recordId: string,
    voidedBy: string,
    voidedByName: string,
    voidReason: string,
    tenantId: string
  ): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const now = new Date().toISOString();
    const { error } = await supabaseFetch(`df_clinical_records?id=eq.${recordId}&tenant_id=eq.${tenantId}`, {
      method: 'PATCH',
      body: {
        status: 'VOIDED',
        voided_by: voidedBy,
        voided_by_name: voidedByName,
        voided_at: now,
        void_reason: voidReason,
        updated_at: now,
      },
    });
    return { success: !error, error: error || undefined };
  },

  async getClinicalAttachments(tenantId: string, patientId?: string): Promise<{ data: ClinicalAttachment[]; error?: string }> {
    await this.ensureTenantExists(tenantId);
    let endpoint = `df_clinical_attachments?tenant_id=eq.${tenantId}&order=created_at.desc`;
    if (patientId) {
      endpoint += `&patient_id=eq.${patientId}`;
    }
    const { data, error } = await supabaseFetch<any[]>(endpoint);
    if (error || !data) return { data: [], error: error || undefined };
    return { data: data.map(mapDbClinicalAttachmentToApp) };
  },

  async saveClinicalAttachment(attachment: ClinicalAttachment, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppClinicalAttachmentToDb(attachment, tenantId);
    const { error } = await supabaseFetch('df_clinical_attachments?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async deleteClinicalAttachment(attachmentId: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(`df_clinical_attachments?id=eq.${attachmentId}&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
    return { success: !error, error: error || undefined };
  },

  async getBeforeAfterPairs(tenantId: string, patientId?: string): Promise<{ data: ClinicalBeforeAfterPair[]; error?: string }> {
    await this.ensureTenantExists(tenantId);
    let endpoint = `df_clinical_before_after_pairs?tenant_id=eq.${tenantId}&order=created_at.desc`;
    if (patientId) {
      endpoint += `&patient_id=eq.${patientId}`;
    }
    const { data, error } = await supabaseFetch<any[]>(endpoint);
    if (error || !data) return { data: [], error: error || undefined };
    return { data: data.map(mapDbBeforeAfterPairToApp) };
  },

  async saveBeforeAfterPair(pair: ClinicalBeforeAfterPair, tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payload = mapAppBeforeAfterPairToDb(pair, tenantId);
    const { error } = await supabaseFetch('df_clinical_before_after_pairs?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async deleteBeforeAfterPair(pairId: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(`df_clinical_before_after_pairs?id=eq.${pairId}&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
    return { success: !error, error: error || undefined };
  },

  async savePatientsBulk(patients: Patient[], tenantId: string): Promise<{ success: boolean; error?: string }> {
    await this.ensureTenantExists(tenantId);
    const payloads = patients.map((p) => mapAppPatientToDb(p, tenantId));
    const { error } = await supabaseFetch('df_patients?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: payloads,
    });
    return { success: !error, error: error || undefined };
  },

  // Leitura explícita por tenantId (nunca pelo activeTenantId implícito do
  // singleton `db`) — usada pelo dry-run da migração de sistema anterior,
  // que precisa comparar contra os pacientes/mapeamentos de UM tenant alvo
  // específico, independentemente de qual clínica está ativa na sessão do
  // usuário no momento da leitura.
  async getPatientsForTenant(tenantId: string): Promise<{ data: Patient[]; error?: string }> {
    const { data, error } = await fetchAllPages<any>(`df_patients?tenant_id=eq.${tenantId}&select=*`);
    if (error || !data) return { data: [], error: error || undefined };
    return { data: data.map(mapDbPatientToApp) };
  },

  async getLegacyImportMapForTenant(
    tenantId: string,
    sourceSystem: string
  ): Promise<{ data: LegacyImportMapEntry[]; error?: string }> {
    const { data, error } = await fetchAllPages<any>(
      `df_legacy_import_map?tenant_id=eq.${tenantId}&source_system=eq.${encodeURIComponent(sourceSystem)}&select=*`
    );
    if (error || !data) return { data: [], error: error || undefined };
    return {
      data: data.map((row: any) => ({
        entityType: row.entity_type,
        legacyId: row.legacy_id,
        legacySecondaryId: row.legacy_secondary_id || undefined,
        matchKind: row.match_kind || undefined,
        status: row.status || 'ACTIVE',
        details: row.details || undefined,
        targetId: row.target_id,
        importSessionId: row.import_session_id || undefined,
        importedAt: row.imported_at,
      })),
    };
  },

  // Duplicidade de CPF/CNPJ checada NO SERVIDOR (o cache local pode estar defasado ou
  // incompleto — foi assim que um cadastro manual duplicou um paciente recém-importado).
  // Devolve ids de outros pacientes do tenant com o mesmo documento (só dígitos).
  // Em falha de rede devolve null: o chamador decide (o modal segue com a checagem local).
  async findPatientIdsByCpf(tenantId: string, cpfDigits: string, excludeId?: string): Promise<string[] | null> {
    const clean = (cpfDigits || '').replace(/\D/g, '');
    if (!tenantId || !clean) return [];
    const { data, error } = await supabaseFetch<any[]>(
      `df_patients?tenant_id=eq.${tenantId}&cpf=eq.${clean}&select=id&limit=5`
    );
    if (error || !data) return null;
    return data.map((r: any) => r.id).filter((id: string) => id !== excludeId);
  },

  // Busca de pacientes no servidor (nome/CPF/telefone), para seletores que não podem
  // carregar milhares de registros. Sempre escopada ao tenant e limitada.
  async searchPatientsForTenant(
    tenantId: string,
    term: string,
    limit = 30
  ): Promise<Array<{ id: string; name: string; cpf: string; phone: string }>> {
    const t = (term || '').trim();
    if (!tenantId) return [];
    const digits = t.replace(/\D/g, '');
    // caracteres que quebram a sintaxe do filtro `or=(...)` do PostgREST
    const safe = t.replace(/[(),*%\\"]/g, ' ').replace(/\s+/g, ' ').trim();
    const filters: string[] = [];
    if (safe) {
      // PostgREST não tem unaccent: busca a grafia digitada E a sem acento (nomes legados vêm sem acento).
      const stripped = safe.normalize('NFD').replace(/[̀-ͯ]/g, '');
      new Set([safe, stripped]).forEach((v) =>
        filters.push(`name.ilike.*${encodeURIComponent(v).replace(/%20/g, '*')}*`)
      );
    }
    if (digits.length >= 3) {
      filters.push(`cpf.ilike.*${digits}*`);
      filters.push(`phone.ilike.*${digits}*`);
    }
    const orPart = filters.length ? `&or=(${filters.join(',')})` : '';
    const { data, error } = await supabaseFetch<any[]>(
      `df_patients?tenant_id=eq.${tenantId}${orPart}&select=id,name,cpf,phone&order=name.asc,id.asc&limit=${limit}`
    );
    if (error || !data) return [];
    return data.map((r: any) => ({ id: r.id, name: r.name, cpf: r.cpf || '', phone: r.phone || '' }));
  },

  // Leitura dos responsáveis de UM tenant explícito (dry-run da migração legada).
  async getGuardiansForTenant(
    tenantId: string
  ): Promise<{ data: Array<{ id: string; name: string; cpf?: string; phone?: string }>; error?: string }> {
    const { data, error } = await fetchAllPages<any>(`df_patient_guardians?tenant_id=eq.${tenantId}&select=id,name,cpf,phone`);
    if (error || !data) return { data: [], error: error || undefined };
    return { data: data.map((g: any) => ({ id: g.id, name: g.name, cpf: g.cpf || undefined, phone: g.phone || undefined })) };
  },

  // Profissionais de UM tenant explícito (mapeamento de dentistas da migração legada).
  async getProfessionalsForTenant(tenantId: string): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await supabaseFetch<any[]>(`df_professionals?tenant_id=eq.${tenantId}&select=id,name`);
    if (error || !data) return [];
    return data.map((p: any) => ({ id: p.id, name: p.name || '' }));
  },

  // Nome de exibição da clínica com a mesma precedência de getTenantData
  // (df_tenants.name costuma ficar genérico — "Clínica sem nome" — e o nome
  // real está no perfil do profissional/nome fantasia).
  async getTenantInfo(tenantId: string): Promise<{ id: string; name: string } | null> {
    const [tenantRes, profRes] = await Promise.all([
      supabaseFetch<any[]>(`df_tenants?id=eq.${tenantId}&select=id,name,trade_name`),
      supabaseFetch<any[]>(`df_professionals?tenant_id=eq.${tenantId}&select=name,nome_fantasia,razao_social&limit=1`),
    ]);
    if (tenantRes.error || !tenantRes.data || tenantRes.data.length === 0) return null;
    const t = tenantRes.data[0];
    const p = profRes.data && profRes.data.length > 0 ? profRes.data[0] : null;
    return { id: t.id, name: resolveClinicDisplayName(t, p) };
  },
};

export const supabaseClient = SupabaseService;
export default SupabaseService;

/**
 * Retorna a URL canônica para redirecionamento de recuperação de senha,
 * adaptando-se automaticamente a localhost ou produção Vercel sem hardcode.
 */
export const getRecoveryRedirectUrl = (): string => {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/auth/recovery`;
};


