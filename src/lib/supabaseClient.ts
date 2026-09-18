import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ClinicTenant,
  StoredUserAccount,
  Professional,
  PayrollHistoryEntry,
  Patient,
  Sale,
  Expense,
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
} from '../types';

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
    role: db.role,
    authUserId: db.auth_user_id || undefined,
    passwordHash: db.password_hash || undefined,
    salt: db.salt || undefined,
    isActive: db.is_active !== false,
    isPrimary: db.is_primary === true || db.role === 'SUPER_ADMIN',
    createdAt: db.created_at || new Date().toISOString(),
  };
}

export function mapAppUserToDb(app: StoredUserAccount): any {
  return {
    id: app.id,
    clinic_id: app.clinicId,
    email: app.email.trim().toLowerCase(),
    name: app.name,
    role: app.role,
    auth_user_id: app.authUserId || null,
    password_hash: app.passwordHash || null,
    salt: app.salt || null,
    is_active: app.isActive !== false,
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

export function mapDbPatientToApp(db: any): Patient {
  return {
    id: db.id,
    tenantId: db.tenant_id,
    orgId: db.org_id,
    name: db.name,
    cpf: db.cpf || '',
    email: db.email || '',
    phone: db.phone || '',
    birthDate: db.birth_date || '',
    notes: db.notes || '',
    createdAt: db.created_at || new Date().toISOString(),
  };
}

export function mapAppPatientToDb(app: Patient, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    org_id: app.orgId || `org_${tenantId}`,
    name: app.name,
    cpf: app.cpf || '',
    email: app.email || '',
    phone: app.phone || '',
    birth_date: app.birthDate || '',
    notes: app.notes || '',
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
    purchasePackageName: db.purchase_package_name,
    packageQuantity: Number(db.package_quantity || 1),
    purchasePrice: Number(db.purchase_price || 0),
    purchaseUnitType: db.purchase_unit_type || 'un',
    usageUnit: db.usage_unit,
    unitCost: Number(db.unit_cost || 0),
    active: db.active !== false,
    notes: db.notes || '',
    createdAt: db.created_at || new Date().toISOString(),
  };
}

export function mapAppClinicalInputToDb(app: ClinicalInput, tenantId: string): any {
  return {
    id: app.id,
    tenant_id: tenantId,
    name: app.name,
    brand: app.brand || '',
    category: app.category,
    purchase_package_name: app.purchasePackageName,
    package_quantity: Number(app.packageQuantity || 1),
    purchase_price: Number(app.purchasePrice || 0),
    purchase_unit_type: app.purchaseUnitType || 'un',
    usage_unit: app.usageUnit,
    unit_cost: Number(app.unitCost || 0),
    active: app.active !== false,
    notes: app.notes || '',
    created_at: app.createdAt || new Date().toISOString(),
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
          .select('id, clinic_id, email, name, role, is_active, auth_user_id, is_primary, created_at')
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
          .select('id, clinic_id, email, name, role, is_active, auth_user_id, is_primary, created_at')
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
      supabaseFetch<any[]>(`df_patients?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`),
      supabaseFetch<any[]>(`df_sales?tenant_id=eq.${tenantId}&order=service_date.desc&select=*`),
      supabaseFetch<any[]>(`df_expenses?tenant_id=eq.${tenantId}&order=competence_date.desc&select=*`),
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

    const { error } = await supabaseFetch('df_tenants?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
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
      cpf: patient.cpf || '',
      email: patient.email || '',
      phone: patient.phone || '',
      birth_date: patient.birthDate || '',
      notes: patient.notes || '',
    };
    const { error } = await supabaseFetch(`df_patients?id=eq.${patient.id}&tenant_id=eq.${tenantId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: payload,
    });
    return { success: !error, error: error || undefined };
  },

  async deletePatient(patientId: string, tenantId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseFetch(`df_patients?id=eq.${patientId}&tenant_id=eq.${tenantId}`, {
      method: 'DELETE',
    });
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


