import {
  Organization,
  User,
  Professional,
  Patient,
  Sale,
  Expense,
  ExpenseCategory,
  BankAccount,
  PayrollHistoryEntry,
  MonthlyFiscalHistoryEntry,
  AuditLog,
  TaxRulesPf,
  TaxRulesSimples,
  InstallmentStatus,
  ReceitaSaudeStatus,
  PaymentMethod,
  AccountReceivableItem,
  DentalProcedure,
  ClinicalInput,
  TaxOrigin,
  SavedFiscalScenario,
  Appointment,
  AppointmentStatus,
  SaleOverallPaymentStatus,
  SalePaymentSummary,
  UserRole,
  ClinicTenant,
  StoredUserAccount,
  SupportSessionState,
  AuthSession,
  FiscalParameter,
  SystemPreferences,
  FiscalSourceType,
  FiscalTotalSnapshot,
  TenantAuthStatus,
} from '../types';
import {
  DEMO_ORGANIZATION,
  DEMO_USER,
  DEMO_PROFESSIONAL,
  DEMO_BANK_ACCOUNTS,
  DEMO_PATIENTS,
  DEMO_SALES,
  DEMO_EXPENSES,
  DEMO_PAYROLL_HISTORY,
  DEMO_PROCEDURES,
  DEMO_CLINICAL_INPUTS,
  DEMO_APPOINTMENTS,
} from './demoData';
import { INITIAL_CHART_OF_ACCOUNTS } from './chartOfAccountsData';
import {
  DEFAULT_TAX_RULES_PF,
  DEFAULT_TAX_RULES_SIMPLES,
} from './taxEngine';
import {
  INITIAL_OFFICIAL_FISCAL_PARAMETERS,
  getOfficialMinimumWage as getMinWageCentral,
  checkUpcomingYearWageReview,
} from './fiscalParameters';
import { augmentYearlyDataset } from './annualFinanceData';
import { hashPassword, verifyPassword, generateSalt } from './authCrypto';
import { isValidEmail } from './masks';
import { SupabaseService, supabase, getRecoveryRedirectUrl } from './supabaseClient';

export const GLOBAL_STORAGE_KEYS = {
  ACTIVE_TENANT: 'df_active_tenant_v1',
  AUTH_SESSION: 'df_auth_session_v1',
  REGISTERED_CLINICS: 'df_registered_clinics_v1',
  STORED_USERS: 'df_stored_users_v1',
  FISCAL_PARAMETERS: 'df_fiscal_params_v1',
};

export const PRESEEDED_CLINICS: ClinicTenant[] = [
  {
    id: 'tenant_demo',
    name: DEMO_ORGANIZATION.name,
    tradeName: DEMO_ORGANIZATION.tradeName,
    cnpj: DEMO_PROFESSIONAL.cnpj,
    cpfCnpj: DEMO_PROFESSIONAL.cnpj || DEMO_PROFESSIONAL.cpf,
    cro: DEMO_PROFESSIONAL.cro,
    croUf: DEMO_PROFESSIONAL.croUf,
    uf: DEMO_PROFESSIONAL.croUf,
    email: 'carlos@mendesodonto.com.br',
    phone: '(11) 98765-4321',
    city: DEMO_PROFESSIONAL.municipio,
    createdAt: '2025-01-01T00:00:00.000Z',
    isActive: true,
    isDemo: true,
  },
];

export const PRESEEDED_USERS: StoredUserAccount[] = [
  {
    id: 'usr_carlos_01',
    email: 'carlos@mendesodonto.com.br',
    name: 'Dr. Carlos Eduardo Mendes',
    salt: 'a1b2c3d4e5f607182938475610293847',
    passwordHash: '792a1306d905e867fb71cb0a8923f738bfda34e8db645f341da473146988685c',
    clinicId: 'tenant_demo',
    role: 'OWNER',
    createdAt: '2025-01-01T00:00:00.000Z',
    isActive: true,
  },
];

const STORAGE_KEYS = {
  ORGANIZATION: 'df_org_v1',
  USER: 'df_user_v1',
  PROFESSIONAL: 'df_prof_v1',
  PATIENTS: 'df_patients_v1',
  SALES: 'df_sales_v1',
  EXPENSES: 'df_expenses_v1',
  CATEGORIES: 'df_categories_v1',
  BANK_ACCOUNTS: 'df_banks_v1',
  PAYROLL_HISTORY: 'df_payroll_v1',
  AUDIT_LOGS: 'df_audit_v1',
  TAX_RULES_PF: 'df_tax_pf_v1',
  TAX_RULES_SIMPLES: 'df_tax_simples_v1',
  PROCEDURES: 'df_procedures_v2',
  CLINICAL_INPUTS: 'df_clinical_inputs_v1',
  FISCAL_SCENARIOS: 'df_fiscal_scenarios_v1',
  APPOINTMENTS: 'df_appointments_v1',
  SYSTEM_PREFERENCES: 'df_preferences_v1',
};

let globalActiveTenantId = 'tenant_demo';

export function setActiveTenantIdGlobal(tenantId: string) {
  globalActiveTenantId = tenantId;
}

export function getScopedStorageKey(baseKey: string, tenantId: string = globalActiveTenantId): string {
  // Global cross-tenant keys are never prefixed
  if (
    baseKey === GLOBAL_STORAGE_KEYS.ACTIVE_TENANT ||
    baseKey === GLOBAL_STORAGE_KEYS.AUTH_SESSION ||
    baseKey === GLOBAL_STORAGE_KEYS.REGISTERED_CLINICS ||
    baseKey === GLOBAL_STORAGE_KEYS.STORED_USERS ||
    baseKey === GLOBAL_STORAGE_KEYS.FISCAL_PARAMETERS
  ) {
    return baseKey;
  }
  // Demo tenant keeps exact base keys for 100% legacy backward compatibility
  if (tenantId === 'tenant_demo') {
    return baseKey;
  }
  return `df_${tenantId}_${baseKey}`;
}

// Safe storage accessors with automatic multi-tenant scoping
function loadItem<T>(key: string, fallback: T, tenantId?: string): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const scopedKey = getScopedStorageKey(key, tenantId || globalActiveTenantId);
    const raw = localStorage.getItem(scopedKey);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Failed to read ${key} from storage:`, e);
    return fallback;
  }
}

// Verificador universal de chaves protegidas (NUNCA DELETAR)
export function isProtectedStorageKey(key: string): boolean {
  if (!key) return true;
  // Sessão oficial e tokens do Supabase Auth (sb-*)
  if (key.startsWith('sb-') || key.includes('-auth-token')) {
    return true;
  }
  // Chaves de infraestrutura mínimas do sistema
  if (
    key === GLOBAL_STORAGE_KEYS.ACTIVE_TENANT ||
    key === GLOBAL_STORAGE_KEYS.AUTH_SESSION ||
    key === GLOBAL_STORAGE_KEYS.REGISTERED_CLINICS ||
    key === GLOBAL_STORAGE_KEYS.STORED_USERS ||
    key === GLOBAL_STORAGE_KEYS.FISCAL_PARAMETERS
  ) {
    return true;
  }
  return false;
}

// Detecção universal de erro de quota de armazenamento local
export function isStorageQuotaError(e: any): boolean {
  if (!e) return false;
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014 ||
    (typeof e.message === 'string' &&
      (e.message.toLowerCase().includes('quota') ||
        e.message.toLowerCase().includes('exceeded')))
  );
}

// Inspeção de métricas de armazenamento (sem imprimir conteúdos confidenciais)
export function getLocalStorageStats(): {
  totalBytes: number;
  keyCount: number;
  keys: Array<{ key: string; bytes: number }>;
} {
  if (typeof localStorage === 'undefined') {
    return { totalBytes: 0, keyCount: 0, keys: [] };
  }
  const keys: Array<{ key: string; bytes: number }> = [];
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const val = localStorage.getItem(key) || '';
    const bytes = (key.length + val.length) * 2;
    totalBytes += bytes;
    keys.push({ key, bytes });
  }
  keys.sort((a, b) => b.bytes - a.bytes);
  return { totalBytes, keyCount: keys.length, keys };
}

// Limpeza emergencial de caches dispensáveis do Dental Finance
export function pruneAllDispensableCaches(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (isProtectedStorageKey(key)) continue;

      if (
        key.startsWith('df_clinic_') ||
        key.startsWith('df_tenant_') ||
        key.startsWith('df_expenses_') ||
        key.startsWith('df_sales_') ||
        key.startsWith('df_patients_') ||
        key.startsWith('df_audit_') ||
        key.startsWith('df_appointments_') ||
        key.startsWith('df_clinical_inputs_') ||
        key.includes('_df_audit_v1') ||
        key.includes('_df_expenses_v1') ||
        key.includes('_df_sales_v1') ||
        key.includes('_df_appointments_v1') ||
        key.includes('_df_patients_v1') ||
        key.includes('tenant_demo') ||
        key === 'df_audit_v1' ||
        key === 'df_expenses_v1' ||
        key === 'df_sales_v1' ||
        key === 'df_appointments_v1' ||
        key === 'df_patients_v1'
      ) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch (err) {
    console.warn('[Storage] Falha ao executar pruneAllDispensableCaches:', err);
  }
}

// Auto-limpeza inteligente e hierárquica para evitar QuotaExceededError
export function pruneLocalStorage(keepTenantId?: string, aggressive: boolean = false): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const active = keepTenantId || globalActiveTenantId;
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // 1. Chaves protegidas nunca são removidas
      if (isProtectedStorageKey(key)) continue;

      // 2. Descartar caches de outros tenants inativos
      const isOtherTenant =
        (key.startsWith('df_clinic_') || key.startsWith('df_tenant_')) &&
        !key.startsWith(`df_${active}_`);

      if (isOtherTenant) {
        keysToRemove.push(key);
        continue;
      }

      // 3. Descartar caches legados de demo quando operando em tenant real
      if (
        active !== 'tenant_demo' &&
        (key.includes('tenant_demo') ||
          key === 'df_audit_v1' ||
          key === 'df_expenses_v1' ||
          key === 'df_sales_v1' ||
          key === 'df_appointments_v1' ||
          key === 'df_patients_v1')
      ) {
        keysToRemove.push(key);
        continue;
      }

      // 4. Limpeza agressiva: descarta coleções pesadas reconstruíveis do tenant ativo
      if (aggressive) {
        if (
          key.includes('_df_audit_v1') ||
          key.includes('_df_expenses_v1') ||
          key.includes('_df_sales_v1') ||
          key.includes('_df_appointments_v1') ||
          key.includes('_df_patients_v1')
        ) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });

    // Truncar coleções de logs volumosos no localStorage
    const auditKey = getScopedStorageKey(STORAGE_KEYS.AUDIT_LOGS, active);
    const rawAudit = localStorage.getItem(auditKey);
    if (rawAudit) {
      try {
        const parsed = JSON.parse(rawAudit);
        if (Array.isArray(parsed) && parsed.length > 20) {
          localStorage.setItem(auditKey, JSON.stringify(parsed.slice(0, 20)));
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[Storage] Falha ao executar pruneLocalStorage:', err);
  }
}

// Assegura capacidade de armazenamento em localStorage ANTES de acionar a persistência do Supabase Auth
export function ensureAuthStorageCapacity(requiredBytes: number = 32768): boolean {
  if (typeof localStorage === 'undefined') return true;

  const probeKey = '__df_auth_probe__';
  try {
    const probe = 'X'.repeat(requiredBytes);
    localStorage.setItem(probeKey, probe);
    localStorage.removeItem(probeKey);
    return true;
  } catch {
    console.warn('[Storage] Capacidade reduzida para persistir sessão Auth. Executando limpeza preventiva...');
  }

  // Nível 1: limpeza normal
  pruneLocalStorage(undefined, false);
  try {
    const probe = 'X'.repeat(requiredBytes);
    localStorage.setItem(probeKey, probe);
    localStorage.removeItem(probeKey);
    return true;
  } catch {}

  // Nível 2: limpeza agressiva
  pruneLocalStorage(undefined, true);
  try {
    const probe = 'X'.repeat(requiredBytes);
    localStorage.setItem(probeKey, probe);
    localStorage.removeItem(probeKey);
    return true;
  } catch {}

  // Nível 3: remoção de todos os caches dispensáveis do Dental Finance
  pruneAllDispensableCaches();
  try {
    const probe = 'X'.repeat(requiredBytes);
    localStorage.setItem(probeKey, probe);
    localStorage.removeItem(probeKey);
    return true;
  } catch {
    console.warn('[Storage] Não foi possível reservar espaço de probe antes do login.');
    return false;
  }
}

// Higieniza payloads pesados (como base64 em anexos) antes de gravar no cache de localStorage
function sanitizeForCache<T>(key: string, value: T): T {
  if (!value) return value;
  if (key.includes('df_expenses_v1') && Array.isArray(value)) {
    return value.map((exp: any) => {
      if (exp?.attachment?.dataUrl && exp.attachment.dataUrl.length > 50000) {
        const { dataUrl, ...restAtt } = exp.attachment;
        return {
          ...exp,
          attachment: restAtt,
        };
      }
      return exp;
    }) as any;
  }
  if (key.includes('df_audit_v1') && Array.isArray(value)) {
    return value.slice(0, 20) as any;
  }
  return value;
}

function saveItem<T>(key: string, value: T, tenantId?: string): void {
  if (typeof localStorage === 'undefined') return;
  const targetTenant = tenantId || globalActiveTenantId;
  const scopedKey = getScopedStorageKey(key, targetTenant);
  const cacheValue = sanitizeForCache(key, value);

  try {
    localStorage.setItem(scopedKey, JSON.stringify(cacheValue));
    if (targetTenant === 'tenant_demo' && scopedKey !== key) {
      localStorage.setItem(key, JSON.stringify(cacheValue));
    }
  } catch (e: any) {
    if (isStorageQuotaError(e)) {
      console.warn(`[Storage] QuotaExceededError ao persistir cache de ${scopedKey}. Executando auto-limpeza...`);
      pruneLocalStorage(targetTenant, true);
      try {
        localStorage.setItem(scopedKey, JSON.stringify(cacheValue));
        if (targetTenant === 'tenant_demo' && scopedKey !== key) {
          localStorage.setItem(key, JSON.stringify(cacheValue));
        }
      } catch {
        // PostgreSQL no Supabase é a fonte da verdade definitiva. O cache local falhar nunca interrompe o app!
        console.warn(`[Storage] Cache local não pôde ser gravado para ${scopedKey}, persistência garantida no PostgreSQL.`);
      }
    } else {
      console.warn(`Failed to save ${key} to storage:`, e);
    }
  }
}

const DEFAULT_FISCAL_SCENARIOS: SavedFiscalScenario[] = [
  {
    id: 'scen_01',
    name: 'Cenário Otimizado — Fator R ≥ 28% (Anexo III)',
    description: 'Pró-labore estratégico de R$ 7.000/mês mantendo a razão folha/faturamento em 30%, garantindo alíquota de 6% e economia tributária.',
    createdAt: '2025-05-01T10:00:00.000Z',
    parameters: {
      rbt12: 280000,
      fs12: 84000,
      monthlyRevenueNfse: 25000,
      monthlyProLabore: 7000,
    },
    results: {
      fatorR: 0.3,
      fatorRPercent: 30,
      effectiveAnnex: 'ANEXO_III',
      bracketNumber: 1,
      nominalRate: 0.06,
      deductionAmount: 0,
      effectiveTaxRate: 6.0,
      dasEstimated: 1500,
      potentialMonthlySavings: 2375,
    },
  },
  {
    id: 'scen_02',
    name: 'Cenário Conservador — Pró-labore Mínimo (Anexo V)',
    description: 'Pró-labore reduzido em R$ 3.500/mês, resultando em Fator R de 15% e tributação majorada pelo Anexo V (15,5%).',
    createdAt: '2025-05-01T10:05:00.000Z',
    parameters: {
      rbt12: 280000,
      fs12: 42000,
      monthlyRevenueNfse: 25000,
      monthlyProLabore: 3500,
    },
    results: {
      fatorR: 0.15,
      fatorRPercent: 15,
      effectiveAnnex: 'ANEXO_V',
      bracketNumber: 1,
      nominalRate: 0.155,
      deductionAmount: 0,
      effectiveTaxRate: 15.5,
      dasEstimated: 3875,
      potentialMonthlySavings: 2375,
    },
  },
];

export class DentalFinanceDB {
  private static instance: DentalFinanceDB;

  private activeTenantId: string = 'tenant_demo';
  private isDemoMode: boolean = true;
  private currentSession: AuthSession | null = null;
  private registeredClinics: ClinicTenant[] = [];
  private storedUsers: StoredUserAccount[] = [];

  private org!: Organization;
  private user!: User;
  private professional!: Professional;
  private patients!: Patient[];
  private sales!: Sale[];
  private expenses!: Expense[];
  private categories!: ExpenseCategory[];
  private bankAccounts!: BankAccount[];
  private payrollHistory!: PayrollHistoryEntry[];
  private auditLogs!: AuditLog[];
  private taxRulesPf!: Record<number, TaxRulesPf>;
  private taxRulesSimples!: Record<number, TaxRulesSimples>;
  private procedures!: DentalProcedure[];
  private clinicalInputs!: ClinicalInput[];
  private fiscalScenarios!: SavedFiscalScenario[];
  private appointments!: Appointment[];
  private preferences!: SystemPreferences;
  private fiscalParameters!: FiscalParameter[];
  private listeners: (() => void)[] = [];
  private isHydrating: boolean = false;
  private isAuthReady: boolean = false;
  private hydratePromise: Promise<void> | null = null;
  private hasHydratedWithAuth: boolean = false;
  private isPasswordRecoveryMode: boolean = false;

  public getIsHydrating(): boolean {
    return this.isHydrating;
  }

  public getIsAuthReady(): boolean {
    return this.isAuthReady;
  }

  public getIsPasswordRecovery(): boolean {
    return this.isPasswordRecoveryMode;
  }

  public setIsPasswordRecovery(val: boolean): void {
    this.isPasswordRecoveryMode = val;
    this.notify();
  }

  private constructor() {
    this.registeredClinics = loadItem<ClinicTenant[]>(
      GLOBAL_STORAGE_KEYS.REGISTERED_CLINICS,
      PRESEEDED_CLINICS
    );
    this.storedUsers = loadItem<StoredUserAccount[]>(
      GLOBAL_STORAGE_KEYS.STORED_USERS,
      PRESEEDED_USERS
    );
    this.fiscalParameters = loadItem<FiscalParameter[]>(
      GLOBAL_STORAGE_KEYS.FISCAL_PARAMETERS,
      INITIAL_OFFICIAL_FISCAL_PARAMETERS
    );
    this.currentSession = loadItem<AuthSession | null>(
      GLOBAL_STORAGE_KEYS.AUTH_SESSION,
      null
    );

    let initialTenant = 'tenant_demo';
    let isDemo = true;
    if (this.currentSession) {
      if (this.currentSession.supportSession?.targetTenantId) {
        initialTenant = this.currentSession.supportSession.targetTenantId;
        isDemo = initialTenant === 'tenant_demo';
      } else {
        initialTenant =
          this.currentSession.tenantId ||
          this.currentSession.clinic?.id ||
          (this.currentSession.user?.orgId ? this.currentSession.user.orgId.replace(/^org_/, '') : '') ||
          'tenant_demo';
        this.currentSession.tenantId = initialTenant;
        isDemo = Boolean(this.currentSession.isDemo) || initialTenant === 'tenant_demo';
      }
    }

    // Previne hidratação precoce caso o usuário acesse link oficial de recuperação de senha
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      if (hash.includes('type=recovery') || search.includes('type=recovery')) {
        this.isPasswordRecoveryMode = true;
      }
    }

    this.loadTenant(initialTenant, isDemo);
    pruneLocalStorage(initialTenant, false);

    if (this.currentSession && !isDemo && initialTenant !== 'tenant_demo') {
      // Barreira de hidratação: indica carregamento até restauração da sessão oficial Supabase Auth
      this.isHydrating = true;
      this.isAuthReady = false;
    } else {
      this.isAuthReady = true;
    }

    // Inicializar sincronização reativa com Supabase Auth
    this.setupSupabaseAuthListener();
  }

  private setupSupabaseAuthListener(): void {
    // 1. Escuta eventos oficiais de autenticação
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        this.isPasswordRecoveryMode = true;
        this.notify();
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Se estiver em modo de recuperação de senha, NÃO sincronizar a sessão de trabalho nem redirecionar para o dashboard!
        if (this.isPasswordRecoveryMode) {
          return;
        }
        if (session?.user && (!this.currentSession || !this.currentSession.isDemo)) {
          await this.syncSessionFromSupabase(session);
        }
      } else if (event === 'SIGNED_OUT') {
        if (this.currentSession && !this.currentSession.isDemo) {
          this.currentSession = null;
          try {
            localStorage.removeItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION);
          } catch (e) {}
          this.loadTenant('tenant_demo', true);
          this.isHydrating = false;
          this.isAuthReady = true;
          this.notify();
        }
      }
    });

    // 2. No carregamento (F5), restaura sessão oficial se existir
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        console.warn('[Supabase Auth] Erro ao recuperar sessão no boot:', error);
      }
      if (this.isPasswordRecoveryMode) {
        // Modo de recuperação de senha ativo: preserva a tela de redefinição
        return;
      }
      if (session?.user && (!this.currentSession || !this.currentSession.isDemo)) {
        await this.syncSessionFromSupabase(session, true /* forceHydrate */);
      } else if (!session?.user && this.currentSession && !this.currentSession.isDemo) {
        this.currentSession = null;
        try {
          localStorage.removeItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION);
        } catch (e) {}
        this.loadTenant('tenant_demo', true);
      }
    }).catch((err) => {
      console.warn('[Supabase Auth] Erro ao recuperar sessão no boot:', err);
    }).finally(() => {
      this.isAuthReady = true;
      this.isHydrating = false;
      this.notify();
    });
  }

  private async syncSessionFromSupabase(session: any, forceHydrate: boolean = false): Promise<void> {
    try {
      const userProfile = await SupabaseService.fetchUserProfileByAuthId(session.user.id, session.user.email);
      if (!userProfile) return;

      const tenantId = userProfile.clinicId;
      let clinic = this.registeredClinics.find((c) => c.id === tenantId);
      if (!clinic) {
        clinic = (await SupabaseService.getClinic(tenantId)) || undefined;
        if (clinic) {
          this.registeredClinics.push(clinic);
          saveItem(GLOBAL_STORAGE_KEYS.REGISTERED_CLINICS, this.registeredClinics);
        }
      }

      const sessionClinic: ClinicTenant = clinic || {
        id: tenantId,
        name: userProfile.clinicName || 'Minha Clínica',
        cro: '00000',
        croUf: 'SP',
        cpfCnpj: '00.000.000/0001-00',
        isDemo: false,
        createdAt: new Date().toISOString(),
      };

      const authSession: AuthSession = {
        token: session.access_token,
        authUserId: session.user.id,
        user: {
          id: userProfile.id,
          orgId: `org_${tenantId}`,
          name: userProfile.name || session.user.email?.split('@')[0] || 'Dentista',
          email: userProfile.email || session.user.email || '',
          role: userProfile.role,
          isPrimary: userProfile.isPrimary ?? false,
        },
        clinic: sessionClinic,
        tenantId,
        isDemo: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(session.expires_at ? session.expires_at * 1000 : Date.now() + 3600 * 1000).toISOString(),
      };

      this.currentSession = authSession;
      saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, authSession);

      if (this.activeTenantId !== tenantId) {
        this.loadTenant(tenantId, false);
      }

      if (forceHydrate || !this.hasHydratedWithAuth || this.activeTenantId !== tenantId) {
        this.hasHydratedWithAuth = true;
        await this.hydrateTenantAsync(tenantId);
      }
      this.notify();
    } catch (e) {
      console.error('[Supabase Auth] Erro ao sincronizar sessão:', e);
    }
  }

  public async hydrateTenantAsync(tenantId: string): Promise<void> {
    if (!tenantId || tenantId === 'tenant_demo') {
      this.isHydrating = false;
      this.notify();
      return;
    }

    if (this.hydratePromise) {
      return this.hydratePromise;
    }

    this.isHydrating = true;
    this.notify();

    this.hydratePromise = (async () => {
      try {
        const res = await SupabaseService.getTenantData(tenantId);
        if (res.error) {
          console.warn(`[Supabase] Erro ao buscar dados do tenant ${tenantId} (${res.error}). Preservando estado.`);
          return;
        }

        if (res.organization) {
          this.org = res.organization;
          saveItem(STORAGE_KEYS.ORGANIZATION, this.org, tenantId);
        }

        if (res.professional) {
          this.professional = res.professional;
          saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional, tenantId);
          const cName = (res.professional.nomeFantasia || res.professional.razaoSocial || '').trim();
          if (cName && (!this.org.name || this.org.name === 'Minha Clínica Odontológica' || this.org.name === 'Clínica Odontológica' || this.org.name === 'Minha Clínica')) {
            this.org = {
              ...this.org,
              name: cName,
              tradeName: cName,
            };
            saveItem(STORAGE_KEYS.ORGANIZATION, this.org, tenantId);
          }
        }
        if (res.payrollHistory && res.payrollHistory.length > 0) {
          this.payrollHistory = res.payrollHistory;
          saveItem(STORAGE_KEYS.PAYROLL_HISTORY, this.payrollHistory, tenantId);
        }
        if (res.patients) {
          this.patients = res.patients;
          saveItem(STORAGE_KEYS.PATIENTS, this.patients, tenantId);
        }
        if (res.sales) {
          this.sales = res.sales;
          saveItem(STORAGE_KEYS.SALES, this.sales, tenantId);
        }
        if (res.expenses) {
          this.expenses = res.expenses;
          saveItem(STORAGE_KEYS.EXPENSES, this.expenses, tenantId);
        }
        if (res.procedures && res.procedures.length > 0) {
          this.procedures = res.procedures;
          saveItem(STORAGE_KEYS.PROCEDURES, this.procedures, tenantId);
        } else if (res.procedures && res.procedures.length === 0 && this.procedures.length > 0) {
          this.procedures.forEach((p) => SupabaseService.saveProcedure(p, tenantId).catch(console.warn));
        }
        if (res.clinicalInputs && res.clinicalInputs.length > 0) {
          this.clinicalInputs = res.clinicalInputs;
          saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs, tenantId);
        } else if (res.clinicalInputs && res.clinicalInputs.length === 0 && this.clinicalInputs.length > 0) {
          this.clinicalInputs.forEach((i) => SupabaseService.saveClinicalInput(i, tenantId).catch(console.warn));
        }
        if (res.bankAccounts) {
          this.bankAccounts = res.bankAccounts;
          saveItem(STORAGE_KEYS.BANK_ACCOUNTS, this.bankAccounts, tenantId);
        }
        if (res.appointments) {
          this.appointments = res.appointments;
          saveItem(STORAGE_KEYS.APPOINTMENTS, this.appointments, tenantId);
        }
        if (res.preferences) {
          this.preferences = res.preferences;
          saveItem(STORAGE_KEYS.SYSTEM_PREFERENCES, this.preferences, tenantId);
        }
        if (res.auditLogs && res.auditLogs.length > 0) {
          this.auditLogs = res.auditLogs;
          saveItem(STORAGE_KEYS.AUDIT_LOGS, this.auditLogs, tenantId);
        }
      } catch (err) {
        console.warn(`Erro ao hidratar tenant ${tenantId} do banco de dados:`, err);
      } finally {
        this.isHydrating = false;
        this.hydratePromise = null;
        this.notify();
      }
    })();

    return this.hydratePromise;
  }

  public loadTenant(tenantId: string, isDemo: boolean = false): void {
    this.activeTenantId = tenantId;
    this.isDemoMode = isDemo || tenantId === 'tenant_demo';
    setActiveTenantIdGlobal(tenantId);

    if (this.isDemoMode) {
      this.org = loadItem<Organization>(STORAGE_KEYS.ORGANIZATION, DEMO_ORGANIZATION, tenantId);
      this.user = loadItem<User>(STORAGE_KEYS.USER, DEMO_USER, tenantId);
      this.professional = loadItem<Professional>(STORAGE_KEYS.PROFESSIONAL, DEMO_PROFESSIONAL, tenantId);
      this.patients = loadItem<Patient[]>(STORAGE_KEYS.PATIENTS, DEMO_PATIENTS, tenantId);
      const loadedSales = loadItem<Sale[]>(STORAGE_KEYS.SALES, DEMO_SALES, tenantId);
      const loadedExpenses = loadItem<Expense[]>(STORAGE_KEYS.EXPENSES, DEMO_EXPENSES, tenantId);
      const curYear = new Date().getFullYear();
      let augmented = augmentYearlyDataset(loadedSales, loadedExpenses, curYear);
      if (curYear !== 2025) {
        augmented = augmentYearlyDataset(augmented.sales, augmented.expenses, 2025);
      }
      this.sales = augmented.sales;
      this.expenses = augmented.expenses;
      const loadedCategories = loadItem<ExpenseCategory[]>(STORAGE_KEYS.CATEGORIES, INITIAL_CHART_OF_ACCOUNTS, tenantId);
      const catMap = new Map<string, ExpenseCategory>();
      INITIAL_CHART_OF_ACCOUNTS.forEach((c) => catMap.set(c.id, c));
      loadedCategories.forEach((c) => {
        const standard = catMap.get(c.id);
        if (standard) {
          catMap.set(c.id, {
            ...standard,
            ...c,
            groupName: standard.groupName,
            groupCode: standard.groupCode,
          });
        } else {
          catMap.set(c.id, c);
        }
      });
      this.categories = Array.from(catMap.values());
      saveItem(STORAGE_KEYS.CATEGORIES, this.categories, tenantId);

      this.bankAccounts = loadItem<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, DEMO_BANK_ACCOUNTS, tenantId);
      this.payrollHistory = loadItem<PayrollHistoryEntry[]>(STORAGE_KEYS.PAYROLL_HISTORY, DEMO_PAYROLL_HISTORY, tenantId);
      this.procedures = loadItem<DentalProcedure[]>(STORAGE_KEYS.PROCEDURES, DEMO_PROCEDURES, tenantId);
      this.clinicalInputs = loadItem<ClinicalInput[]>(STORAGE_KEYS.CLINICAL_INPUTS, DEMO_CLINICAL_INPUTS, tenantId);
      this.fiscalScenarios = loadItem<SavedFiscalScenario[]>(STORAGE_KEYS.FISCAL_SCENARIOS, DEFAULT_FISCAL_SCENARIOS, tenantId);
      this.appointments = loadItem<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, DEMO_APPOINTMENTS, tenantId);
      this.auditLogs = loadItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, [
        {
          id: 'log_01',
          timestamp: new Date().toISOString(),
          userId: 'usr_carlos_01',
          userName: 'Dr. Carlos Eduardo Mendes',
          action: 'SISTEMA_INICIALIZADO',
          entityType: 'ORGANIZATION',
          entityId: 'org_mendes_01',
          details: 'Banco de dados híbrido inicializado com plano de contas odontológico e dados demonstrativos.',
        },
      ], tenantId);
      this.taxRulesPf = loadItem<Record<number, TaxRulesPf>>(STORAGE_KEYS.TAX_RULES_PF, DEFAULT_TAX_RULES_PF, tenantId);
      if (this.taxRulesPf && this.taxRulesPf[2026] && (this.taxRulesPf[2026].simplifiedDiscountLimitMonthly === 564.80 || this.taxRulesPf[2026].brackets?.[0]?.max === 2259.20)) {
        this.taxRulesPf[2026] = DEFAULT_TAX_RULES_PF[2026];
        saveItem(STORAGE_KEYS.TAX_RULES_PF, this.taxRulesPf, tenantId);
      }
      this.taxRulesSimples = loadItem<Record<number, TaxRulesSimples>>(STORAGE_KEYS.TAX_RULES_SIMPLES, DEFAULT_TAX_RULES_SIMPLES, tenantId);
      this.preferences = loadItem<SystemPreferences>(
        STORAGE_KEYS.SYSTEM_PREFERENCES,
        { hideCpf: false, alertFatorR: true, alertDueDates: true, operationalReminders: true },
        tenantId
      );
    } else {
      // REAL CLINIC TENANT — ABSOLUTELY CLEAN, NO MOCKS!
      const clinic = this.registeredClinics.find((c) => c.id === tenantId);
      const defaultOrg: Organization = {
        id: `org_${tenantId}`,
        name: clinic?.name || 'Minha Clínica Odontológica',
        tradeName: clinic?.tradeName || clinic?.name || 'Minha Clínica',
        createdAt: clinic?.createdAt || new Date().toISOString(),
      };
      const defaultUser: User = {
        id: `usr_${tenantId}`,
        name: clinic?.name || 'Cirurgião-Dentista',
        email: clinic?.email || '',
        role: 'ADMIN',
        orgId: defaultOrg.id,
      };
      const defaultProf: Professional = {
        id: `prof_${tenantId}`,
        orgId: defaultOrg.id,
        name: clinic?.name || 'Cirurgião-Dentista',
        cpf: '',
        cro: clinic?.cro || '',
        croUf: clinic?.croUf || clinic?.uf || 'SP',
        cnpj: clinic?.cnpj || clinic?.cpfCnpj || '',
        razaoSocial: clinic?.name || '',
        nomeFantasia: clinic?.tradeName || clinic?.name || '',
        municipio: clinic?.city || 'São Paulo - SP',
        regimeTributario: 'SIMPLES_NACIONAL',
        optanteSimples: true,
        dataAbertura: clinic?.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
        rbt12Inicial: 0,
        folha12MesesInicial: 0,
        proLaboreMensal: 0,
        baselineConfigured: false,
        numDependentes: 0,
        inssProprioMensal: 0,
        outrosRendimentosTributaveis: 0,
      };

      this.org = loadItem<Organization>(STORAGE_KEYS.ORGANIZATION, defaultOrg, tenantId);
      this.user = loadItem<User>(STORAGE_KEYS.USER, defaultUser, tenantId);
      this.professional = loadItem<Professional>(STORAGE_KEYS.PROFESSIONAL, defaultProf, tenantId);

      const candidateRealName = (this.professional.nomeFantasia || this.professional.razaoSocial || clinic?.tradeName || clinic?.name || '').trim();
      if (candidateRealName && (!this.org.name || this.org.name === 'Minha Clínica Odontológica' || this.org.name === 'Clínica Odontológica' || this.org.name === 'Minha Clínica')) {
        this.org = {
          ...this.org,
          name: candidateRealName,
          tradeName: candidateRealName,
        };
        saveItem(STORAGE_KEYS.ORGANIZATION, this.org, tenantId);
      }
      this.patients = loadItem<Patient[]>(STORAGE_KEYS.PATIENTS, [], tenantId);
      this.sales = loadItem<Sale[]>(STORAGE_KEYS.SALES, [], tenantId);
      this.expenses = loadItem<Expense[]>(STORAGE_KEYS.EXPENSES, [], tenantId);
      this.categories = loadItem<ExpenseCategory[]>(STORAGE_KEYS.CATEGORIES, INITIAL_CHART_OF_ACCOUNTS, tenantId);
      this.bankAccounts = loadItem<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, [], tenantId);
      this.payrollHistory = loadItem<PayrollHistoryEntry[]>(STORAGE_KEYS.PAYROLL_HISTORY, [], tenantId);
      this.procedures = loadItem<DentalProcedure[]>(STORAGE_KEYS.PROCEDURES, [], tenantId);
      this.clinicalInputs = loadItem<ClinicalInput[]>(STORAGE_KEYS.CLINICAL_INPUTS, [], tenantId);
      this.fiscalScenarios = loadItem<SavedFiscalScenario[]>(STORAGE_KEYS.FISCAL_SCENARIOS, [], tenantId);
      this.appointments = loadItem<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, [], tenantId);
      this.preferences = loadItem<SystemPreferences>(
        STORAGE_KEYS.SYSTEM_PREFERENCES,
        { hideCpf: false, alertFatorR: true, alertDueDates: true, operationalReminders: true },
        tenantId
      );
      this.auditLogs = loadItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: this.user.id,
          userName: this.user.name,
          action: 'TENANT_CARREGADO',
          entityType: 'CLINIC',
          entityId: tenantId,
          details: `Ambiente da clínica ${this.org.name} carregado com sucesso.`,
        },
      ], tenantId);
      this.taxRulesPf = loadItem<Record<number, TaxRulesPf>>(STORAGE_KEYS.TAX_RULES_PF, DEFAULT_TAX_RULES_PF, tenantId);
      if (this.taxRulesPf && this.taxRulesPf[2026] && (this.taxRulesPf[2026].simplifiedDiscountLimitMonthly === 564.80 || this.taxRulesPf[2026].brackets?.[0]?.max === 2259.20)) {
        this.taxRulesPf[2026] = DEFAULT_TAX_RULES_PF[2026];
        saveItem(STORAGE_KEYS.TAX_RULES_PF, this.taxRulesPf, tenantId);
      }
      this.taxRulesSimples = loadItem<Record<number, TaxRulesSimples>>(STORAGE_KEYS.TAX_RULES_SIMPLES, DEFAULT_TAX_RULES_SIMPLES, tenantId);
    }

    // Sanitizar observações automáticas legadas em vendas (ex: 'Atendimento Clínico - Canal')
    let salesModified = false;
    this.sales = this.sales.map((s) => {
      let changed = false;
      let sDesc = s.description;
      let sNotes = s.notes;
      const procLower = (s.procedureName || '').toLowerCase().trim();
      if (sDesc && (sDesc.toLowerCase().trim().startsWith('atendimento clínico') || sDesc.toLowerCase().trim() === procLower)) {
        sDesc = '';
        changed = true;
      }
      if (sNotes && (sNotes.toLowerCase().trim().startsWith('atendimento clínico') || sNotes.toLowerCase().trim() === procLower || sNotes.toLowerCase().trim() === `atendimento clínico - ${procLower}`)) {
        sNotes = '';
        changed = true;
      }
      if (changed) {
        salesModified = true;
        return { ...s, description: sDesc, notes: sNotes };
      }
      return s;
    });
    if (salesModified) {
      saveItem(STORAGE_KEYS.SALES, this.sales, tenantId);
    }

    // Desduplicar procedimentos com cadastro incompleto se já houver versão oficial cadastrada
    const nameMap = new Map<string, DentalProcedure>();
    const deduplicatedProcedures: DentalProcedure[] = [];
    for (const p of this.procedures) {
      const key = p.name.trim().toLowerCase();
      const existing = nameMap.get(key);
      if (!existing) {
        nameMap.set(key, p);
        deduplicatedProcedures.push(p);
      } else if (existing.isIncomplete && !p.isIncomplete) {
        const idx = deduplicatedProcedures.indexOf(existing);
        if (idx !== -1) {
          deduplicatedProcedures[idx] = p;
        }
        nameMap.set(key, p);
      }
    }
    if (deduplicatedProcedures.length !== this.procedures.length) {
      this.procedures = deduplicatedProcedures;
      saveItem(STORAGE_KEYS.PROCEDURES, this.procedures, tenantId);
    }
  }

  public static getInstance(): DentalFinanceDB {
    if (!DentalFinanceDB.instance) {
      DentalFinanceDB.instance = new DentalFinanceDB();
    }
    return DentalFinanceDB.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // Audit Logging with audited support identification
  public log(action: string, entityType: string, entityId: string, details: string) {
    const isSupport = !!this.currentSession?.supportSession;
    const userId = isSupport
      ? `${this.currentSession!.supportSession!.originalAdminUserId} [SUPPORT]`
      : (this.currentSession?.user?.id || (this.user ? this.user.id : 'sys'));
    const userName = isSupport
      ? `${this.currentSession!.supportSession!.originalAdminName} (Modo Suporte)`
      : (this.currentSession?.user?.name || (this.user ? this.user.name : 'Sistema'));

    const newLog: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      userId,
      userName,
      action,
      entityType,
      entityId,
      details,
    };
    this.auditLogs = [newLog, ...this.auditLogs.slice(0, 24)];
    saveItem(STORAGE_KEYS.AUDIT_LOGS, this.auditLogs);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.logAudit(newLog, this.activeTenantId).catch(() => {});
    }
  }

  // Multi-tenant & Authentication Getters
  public getActiveTenantId(): string {
    if (this.currentSession) {
      if (this.currentSession.supportSession?.targetTenantId) {
        const supportTenant = this.currentSession.supportSession.targetTenantId;
        if (this.activeTenantId !== supportTenant) {
          this.activeTenantId = supportTenant;
          setActiveTenantIdGlobal(supportTenant);
        }
        return supportTenant;
      }
      const candidate =
        this.currentSession.tenantId ||
        this.currentSession.clinic?.id ||
        (this.currentSession.user?.orgId ? this.currentSession.user.orgId.replace(/^org_/, '') : '');
      if (candidate && candidate.trim() !== '') {
        if (!this.currentSession.tenantId) {
          this.currentSession.tenantId = candidate;
        }
        if (this.activeTenantId !== candidate) {
          this.activeTenantId = candidate;
          setActiveTenantIdGlobal(candidate);
        }
        return candidate;
      }
    }
    return this.activeTenantId || 'tenant_demo';
  }

  public getTenantAuthStatus(): TenantAuthStatus {
    if (this.isHydrating) {
      return 'AUTH_LOADING';
    }
    if (!this.currentSession) {
      return 'UNAUTHENTICATED';
    }
    const tenantId = this.getActiveTenantId();
    if (this.currentSession.isDemo || this.isDemoMode || tenantId === 'tenant_demo') {
      return 'DEMO';
    }
    if (!tenantId || tenantId.trim() === '' || tenantId === 'tenant_platform') {
      return 'AUTHENTICATED_WITHOUT_TENANT';
    }
    return 'AUTHENTICATED_WITH_TENANT';
  }

  public getIsDemoMode(): boolean {
    return this.isDemoMode;
  }

  public getCurrentSession(): AuthSession | null {
    if (this.currentSession && !this.currentSession.tenantId) {
      this.currentSession.tenantId = this.getActiveTenantId();
    }
    return this.currentSession;
  }

  public getRegisteredClinics(): ClinicTenant[] {
    return this.registeredClinics;
  }

  public getStoredUsers(): StoredUserAccount[] {
    return this.storedUsers;
  }

  // Authentication Flow via Supabase Auth Oficial
  public async authenticate(
    identifier: string,
    secret: string
  ): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
    const cleanId = identifier.trim().toLowerCase();
    const cleanSecret = secret.trim();

    if (!cleanId || !cleanSecret) {
      return { success: false, error: 'Por favor, informe suas credenciais completas.' };
    }

    // 1. Suporte exclusivo para conta de Demonstração local (em memória)
    if (cleanId === 'carlos@mendesodonto.com.br') {
      if (cleanSecret === 'Dental@2025' || cleanSecret === 'Dental@2026') {
        const demoSession = this.loginDemo();
        return { success: true, session: demoSession };
      }
      return {
        success: false,
        error: 'E-mail ou senha inválidos. Por favor, verifique suas credenciais.',
      };
    }

    // 2. Autenticação REAL e Segura via Supabase Auth Oficial
    let authData: any = null;
    let authError: any = null;

    try {
      // 2.1 Assegura capacidade de armazenamento para a sessão oficial antes de chamar o SDK
      ensureAuthStorageCapacity();

      const res = await supabase.auth.signInWithPassword({
        email: cleanId,
        password: cleanSecret,
      });
      authData = res.data;
      authError = res.error;
    } catch (err: any) {
      if (isStorageQuotaError(err)) {
        console.warn('[Supabase Auth] QuotaExceededError na primeira tentativa de login. Executando limpeza emergencial de cache...');
        pruneAllDispensableCaches();
        try {
          // 1 retry automático conforme especificação
          const retryRes = await supabase.auth.signInWithPassword({
            email: cleanId,
            password: cleanSecret,
          });
          authData = retryRes.data;
          authError = retryRes.error;
        } catch (retryErr: any) {
          if (isStorageQuotaError(retryErr)) {
            return {
              success: false,
              error: 'Não foi possível preparar o armazenamento local para iniciar sua sessão. Tente novamente.',
            };
          }
          console.error('[Auth Error pós-retry]', retryErr);
          return {
            success: false,
            error: 'Erro de comunicação com o servidor de autenticação.',
          };
        }
      } else {
        console.error('[Auth Error]', err);
        return {
          success: false,
          error: 'Erro de comunicação com o servidor de autenticação.',
        };
      }
    }

    if (authError || !authData?.user || !authData?.session) {
      this.log('LOGIN_FALHA', 'AUTH', cleanId, `Falha de autenticação via Supabase Auth: ${authError?.message || 'Credenciais inválidas'}`);
      return {
        success: false,
        error: 'E-mail ou senha inválidos. Por favor, verifique suas credenciais.',
      };
    }

    try {
      // Buscar perfil mapeado na df_users
      const userProfile = await SupabaseService.fetchUserProfileByAuthId(authData.user.id, authData.user.email);
      if (!userProfile) {
        this.log('LOGIN_FALHA', 'AUTH', authData.user.id, `Usuário autenticado no Supabase Auth mas sem perfil mapeado na df_users.`);
        return {
          success: false,
          error: 'Perfil de clínica não configurado para este usuário. Entre em contato com o suporte.',
        };
      }

      const tenantId = userProfile.clinicId;
      let clinic = this.registeredClinics.find((c) => c.id === tenantId);
      if (!clinic) {
        clinic = (await SupabaseService.getClinic(tenantId)) || undefined;
        if (clinic) {
          this.registeredClinics.push(clinic);
          saveItem(GLOBAL_STORAGE_KEYS.REGISTERED_CLINICS, this.registeredClinics);
        }
      }

      const sessionClinic: ClinicTenant = clinic || {
        id: tenantId,
        name: userProfile.clinicName || 'Minha Clínica',
        cro: '00000',
        croUf: 'SP',
        cpfCnpj: '00.000.000/0001-00',
        isDemo: false,
        createdAt: new Date().toISOString(),
      };

      const session: AuthSession = {
        token: authData.session.access_token,
        authUserId: authData.user.id,
        user: {
          id: userProfile.id,
          orgId: `org_${tenantId}`,
          name: userProfile.name || cleanId.split('@')[0],
          email: userProfile.email || cleanId,
          role: userProfile.role,
          isPrimary: userProfile.isPrimary ?? false,
        },
        clinic: sessionClinic,
        tenantId,
        isDemo: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(authData.session.expires_at ? authData.session.expires_at * 1000 : Date.now() + 3600 * 1000).toISOString(),
      };

      this.currentSession = session;
      saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, session);
      this.loadTenant(tenantId, false);
      this.hasHydratedWithAuth = true;
      this.isAuthReady = true;
      await this.hydrateTenantAsync(tenantId);

      this.log('LOGIN_SUCESSO', 'AUTH', userProfile.id, `Usuário ${userProfile.email} autenticado com sucesso via Supabase Auth.`);
      this.notify();

      return { success: true, session };
    } catch (err: any) {
      console.error('[Auth Error]', err);
      return {
        success: false,
        error: 'Erro de comunicação com o servidor de autenticação.',
      };
    }
  }

  // Instant Demo Access
  public loginDemo(): AuthSession {
    const demoUser = this.storedUsers.find((u) => u.clinicId === 'tenant_demo') || PRESEEDED_USERS[0];
    const demoClinic = this.registeredClinics.find((c) => c.id === 'tenant_demo') || PRESEEDED_CLINICS[0];

    const session: AuthSession = {
      token: `sess_demo_${Date.now()}`,
      user: {
        id: demoUser.id,
        orgId: 'org_mendes_01',
        name: demoUser.name,
        email: demoUser.email,
        role: demoUser.role,
      },
      clinic: { ...demoClinic },
      tenantId: 'tenant_demo',
      isDemo: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    };

    this.currentSession = session;
    saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, session);
    this.loadTenant('tenant_demo', true);
    this.log('LOGIN_DEMO', 'AUTH', demoUser.id, 'Acesso rápido ao Modo Demonstração.');
    this.notify();

    return session;
  }

  // Logout Oficial com Supabase Auth
  public async logout(): Promise<void> {
    if (this.currentSession) {
      this.log('LOGOUT', 'AUTH', this.currentSession.user.id, `Logout efetuado por ${this.currentSession.user.email}.`);
    }
    try {
      if (this.currentSession && !this.currentSession.isDemo) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.warn('Erro ao deslogar no Supabase Auth:', e);
    }
    this.currentSession = null;
    this.activeTenantId = 'tenant_demo';
    this.isDemoMode = true;
    setActiveTenantIdGlobal('tenant_demo');
    try {
      localStorage.removeItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION);
    } catch (e) {
      // ignore
    }
    this.notify();
  }

  // Create Access Account (Supabase Auth Oficial)
  public async createAccount(params: {
    email: string;
    password: string;
    termsAccepted?: boolean;
  }): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
    const normalizedEmail = (params.email || '').trim().toLowerCase();

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return { success: false, error: 'Por favor, informe um endereço de e-mail válido.' };
    }
    if (!params.password || params.password.length < 8) {
      return { success: false, error: 'A senha de acesso deve conter no mínimo 8 caracteres.' };
    }
    if (params.termsAccepted === false) {
      return { success: false, error: 'É necessário concordar com os Termos de Uso e Política de Privacidade.' };
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: params.password,
        options: {
          data: {
            app: 'dental_finance',
            origin: 'dental_finance',
          },
        },
      });

      if (authError) {
        console.error('[Supabase Auth] Erro no cadastro:', authError);
        const msg = authError.message || '';
        if (msg.toLowerCase().includes('database error saving new user')) {
          return {
            success: false,
            error: 'Não foi possível concluir seu cadastro no momento. Por favor, tente novamente ou contate o suporte.',
          };
        }
        return { success: false, error: authError.message };
      }

      const authUserId = authData.user?.id;

      // Executa reconciliação segura (caso legado) ou provisionamento atômico (novo usuário) via backend RPC
      const provRes = await SupabaseService.reconcileOrProvisionDentalUser({
        clinicName: 'Minha Clínica',
        tradeName: 'Minha Clínica Odontológica',
      });

      if (!provRes.success || !provRes.tenant_id) {
        return {
          success: false,
          error: provRes.error || 'Não foi possível vincular sua conta à clínica.',
        };
      }

      const tenantId = provRes.tenant_id;
      const userId = provRes.user_id;
      const role = (provRes.role || 'OWNER') as any;

      if (provRes.is_reconciled) {
        // CASO B: Conta reconciliada com sucesso (usuário previamente excluído do Auth mantendo clínica intacta)
        this.loadTenant(tenantId, false);
        await this.hydrateTenantAsync(tenantId);

        const currentOrg = this.getOrg();
        const session: AuthSession = {
          token: authData.session?.access_token || `sess_${Date.now()}`,
          authUserId,
          user: {
            id: userId,
            orgId: `org_${tenantId}`,
            name: normalizedEmail.split('@')[0],
            email: normalizedEmail,
            role,
          },
          clinic: {
            id: tenantId,
            name: provRes.clinic_name || currentOrg.name || 'Minha Clínica',
            tradeName: provRes.trade_name || currentOrg.tradeName || 'Minha Clínica Odontológica',
            cnpj: this.professional.cnpj || '',
            cro: this.professional.cro || '',
            croUf: this.professional.croUf || 'SP',
            uf: this.professional.croUf || 'SP',
            email: normalizedEmail,
            phone: '',
            createdAt: currentOrg.createdAt || new Date().toISOString(),
            isActive: true,
            isDemo: false,
          },
          tenantId,
          isDemo: false,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(authData.session?.expires_at ? authData.session.expires_at * 1000 : Date.now() + 3600 * 1000).toISOString(),
        };

        this.currentSession = session;
        saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, session);
        this.log(
          'CONTA_RECONCILIADA',
          'USER',
          userId,
          `Acesso de usuário legado reconectado com sucesso para ${normalizedEmail}. Dados da clínica preservados.`
        );
        this.notify();
        return { success: true, session };
      }

      // CASO A: Nova clínica provisionada de forma atômica
      const newClinic: ClinicTenant = {
        id: tenantId,
        name: provRes.clinic_name || 'Minha Clínica',
        tradeName: provRes.trade_name || 'Minha Clínica Odontológica',
        cnpj: '',
        cro: '',
        croUf: 'SP',
        uf: 'SP',
        email: normalizedEmail,
        phone: '',
        createdAt: new Date().toISOString(),
        isActive: true,
        isDemo: false,
      };

      const newUser: StoredUserAccount = {
        id: userId,
        email: normalizedEmail,
        authUserId,
        name: normalizedEmail.split('@')[0],
        role,
        clinicId: tenantId,
        createdAt: new Date().toISOString(),
        isActive: true,
      };

      this.registeredClinics.push(newClinic);
      saveItem(GLOBAL_STORAGE_KEYS.REGISTERED_CLINICS, this.registeredClinics);

      this.storedUsers.push(newUser);
      saveItem(GLOBAL_STORAGE_KEYS.STORED_USERS, this.storedUsers);

      // Initialize clean partitions for this new real tenant
      saveItem(STORAGE_KEYS.ORGANIZATION, {
        id: `org_${tenantId}`,
        name: newClinic.name,
        tradeName: newClinic.tradeName,
        createdAt: newClinic.createdAt,
      }, tenantId);

      saveItem(STORAGE_KEYS.USER, {
        id: userId,
        name: newUser.name,
        email: newUser.email,
        role: 'ADMIN',
        orgId: `org_${tenantId}`,
      }, tenantId);

      saveItem(STORAGE_KEYS.PROFESSIONAL, {
        id: `prof_${tenantId}`,
        orgId: `org_${tenantId}`,
        name: '',
        cpf: '',
        cro: '',
        croUf: 'SP',
        cnpj: '',
        razaoSocial: '',
        nomeFantasia: '',
        municipio: 'São Paulo - SP',
        uf: 'SP',
        phone: '',
        regimeTributario: 'SIMPLES_NACIONAL',
        optanteSimples: true,
        dataAbertura: newClinic.createdAt.split('T')[0],
        rbt12Inicial: 0,
        folha12MesesInicial: 0,
        proLaboreMensal: 0,
        baselineConfigured: false,
        fiscalSourceType: undefined,
        fiscalSnapshots: [],
        initialFiscalHistory: [],
        numDependentes: 0,
        inssProprioMensal: 0,
        outrosRendimentosTributaveis: 0,
      }, tenantId);

      saveItem(STORAGE_KEYS.SYSTEM_PREFERENCES, {
        hideCpf: false,
        alertFatorR: true,
        alertDueDates: true,
        operationalReminders: true,
      }, tenantId);

      saveItem(STORAGE_KEYS.PATIENTS, [], tenantId);
      saveItem(STORAGE_KEYS.SALES, [], tenantId);
      saveItem(STORAGE_KEYS.EXPENSES, [], tenantId);
      saveItem(STORAGE_KEYS.CATEGORIES, INITIAL_CHART_OF_ACCOUNTS, tenantId);
      saveItem(STORAGE_KEYS.BANK_ACCOUNTS, [], tenantId);
      saveItem(STORAGE_KEYS.PAYROLL_HISTORY, [], tenantId);
      saveItem(STORAGE_KEYS.PROCEDURES, [], tenantId);
      saveItem(STORAGE_KEYS.CLINICAL_INPUTS, [], tenantId);
      saveItem(STORAGE_KEYS.FISCAL_SCENARIOS, [], tenantId);
      saveItem(STORAGE_KEYS.APPOINTMENTS, [], tenantId);
      saveItem(STORAGE_KEYS.AUDIT_LOGS, [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId,
          userName: newUser.name,
          action: 'CONTA_CRIADA',
          entityType: 'USER',
          entityId: userId,
          details: `Conta criada via Supabase Auth para ${newUser.email}.`,
        },
      ], tenantId);

      const session: AuthSession = {
        token: authData.session?.access_token || `sess_${Date.now()}`,
        authUserId,
        user: {
          id: userId,
          orgId: `org_${tenantId}`,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
        },
        clinic: { ...newClinic },
        tenantId,
        isDemo: false,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(authData.session?.expires_at ? authData.session.expires_at * 1000 : Date.now() + 3600 * 1000).toISOString(),
      };

      this.currentSession = session;
      saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, session);
      this.loadTenant(tenantId, false);

      await SupabaseService.saveProfessional(this.professional, tenantId);
      await SupabaseService.savePreferences(this.preferences, tenantId);

      this.notify();

      return { success: true, session };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao criar conta no Supabase Auth.' };
    }
  }

  // Legacy & Programmatic Clinic Account Creation
  public async createClinicAccount(params: {
    clinicName?: string;
    tradeName?: string;
    cnpj?: string;
    cro?: string;
    uf?: string;
    professionalName?: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
    const normalizedEmail = params.email.trim().toLowerCase();

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return { success: false, error: 'E-mail corporativo válido é obrigatório.' };
    }
    if (!params.password || params.password.length < 6) {
      return { success: false, error: 'A senha deve conter no mínimo 6 caracteres.' };
    }

    if (this.storedUsers.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      return { success: false, error: 'Este e-mail já está cadastrado no Dental Finance.' };
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(params.password, salt);
    const tenantId = `clinic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newClinic: ClinicTenant = {
      id: tenantId,
      name: (params.clinicName || 'Minha Clínica').trim(),
      tradeName: (params.tradeName || params.clinicName || 'Minha Clínica').trim(),
      cnpj: params.cnpj?.trim() || '',
      cro: (params.cro || '').trim(),
      croUf: (params.uf || 'SP').trim().toUpperCase(),
      uf: (params.uf || 'SP').trim().toUpperCase(),
      email: normalizedEmail,
      phone: params.phone?.trim() || '',
      createdAt: new Date().toISOString(),
      isActive: true,
      isDemo: false,
    };

    const newUser: StoredUserAccount = {
      id: userId,
      email: normalizedEmail,
      passwordHash,
      salt,
      name: (params.professionalName || normalizedEmail.split('@')[0]).trim(),
      role: 'OWNER',
      clinicId: tenantId,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    this.registeredClinics.push(newClinic);
    saveItem(GLOBAL_STORAGE_KEYS.REGISTERED_CLINICS, this.registeredClinics);

    this.storedUsers.push(newUser);
    saveItem(GLOBAL_STORAGE_KEYS.STORED_USERS, this.storedUsers);

    // Initialize clean partitions for this new real tenant
    saveItem(STORAGE_KEYS.ORGANIZATION, {
      id: `org_${tenantId}`,
      name: newClinic.name,
      tradeName: newClinic.tradeName,
      createdAt: newClinic.createdAt,
    }, tenantId);

    saveItem(STORAGE_KEYS.USER, {
      id: userId,
      name: newUser.name,
      email: newUser.email,
      role: 'ADMIN',
      orgId: `org_${tenantId}`,
    }, tenantId);

    saveItem(STORAGE_KEYS.PROFESSIONAL, {
      id: `prof_${tenantId}`,
      orgId: `org_${tenantId}`,
      name: newUser.name,
      cpf: '',
      cro: newClinic.cro,
      croUf: newClinic.croUf || newClinic.uf || 'SP',
      cnpj: newClinic.cnpj || '',
      razaoSocial: newClinic.name,
      nomeFantasia: newClinic.tradeName || newClinic.name,
      municipio: newClinic.city || 'São Paulo - SP',
      regimeTributario: 'SIMPLES_NACIONAL',
      optanteSimples: true,
      dataAbertura: newClinic.createdAt.split('T')[0],
      rbt12Inicial: 0,
      folha12MesesInicial: 0,
      proLaboreMensal: 0,
      baselineConfigured: false,
      fiscalSourceType: undefined,
      fiscalSnapshots: [],
      initialFiscalHistory: [],
      numDependentes: 0,
      inssProprioMensal: 0,
      outrosRendimentosTributaveis: 0,
    }, tenantId);

    saveItem(STORAGE_KEYS.SYSTEM_PREFERENCES, {
      hideCpf: false,
      alertFatorR: true,
      alertDueDates: true,
      operationalReminders: true,
    }, tenantId);

    // Operational collections start strictly EMPTY
    saveItem(STORAGE_KEYS.PATIENTS, [], tenantId);
    saveItem(STORAGE_KEYS.SALES, [], tenantId);
    saveItem(STORAGE_KEYS.EXPENSES, [], tenantId);
    saveItem(STORAGE_KEYS.CATEGORIES, INITIAL_CHART_OF_ACCOUNTS, tenantId);
    saveItem(STORAGE_KEYS.BANK_ACCOUNTS, [], tenantId);
    saveItem(STORAGE_KEYS.PAYROLL_HISTORY, [], tenantId);
    saveItem(STORAGE_KEYS.PROCEDURES, [], tenantId);
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, [], tenantId);
    saveItem(STORAGE_KEYS.FISCAL_SCENARIOS, [], tenantId);
    saveItem(STORAGE_KEYS.APPOINTMENTS, [], tenantId);
    saveItem(STORAGE_KEYS.AUDIT_LOGS, [
      {
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId,
        userName: newUser.name,
        action: 'CLINICA_CRIADA',
        entityType: 'CLINIC',
        entityId: tenantId,
        details: `Conta e clínica ${newClinic.name} criadas com sucesso. Ambiente operacional limpo inicializado.`,
      },
    ], tenantId);

    const session: AuthSession = {
      token: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      user: {
        id: userId,
        orgId: `org_${tenantId}`,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
      clinic: { ...newClinic },
      tenantId,
      isDemo: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    };

    this.currentSession = session;
    saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, session);
    this.loadTenant(tenantId, false);

    await SupabaseService.saveClinic(newClinic);
    await SupabaseService.saveUser(newUser);
    await SupabaseService.saveProfessional(this.professional, tenantId);
    await SupabaseService.savePreferences(this.preferences, tenantId);

    this.notify();

    return { success: true, session };
  }

  // Password Recovery Flow via Supabase Auth Oficial
  public async requestPasswordReset(
    email: string
  ): Promise<{ success: boolean; message: string; token?: string }> {
    const cleanEmail = email.trim().toLowerCase();

    try {
      const canonicalRedirect = getRecoveryRedirectUrl();
      await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: canonicalRedirect || (typeof window !== 'undefined' ? window.location.origin : undefined),
      });
    } catch (err) {
      console.warn('[Supabase Auth] Erro na solicitação de reset de senha:', err);
    }

    this.log(
      'PASSWORD_RESET_REQUESTED',
      'AUTH',
      cleanEmail,
      `Solicitação de recuperação de senha disparada para ${cleanEmail}.`
    );

    // Mensagem neutra anti-enumeração (não expõe existência de e-mail e não emite tokens em tela)
    return {
      success: true,
      message: 'Se o e-mail informado estiver cadastrado em nosso sistema, as instruções para redefinição de senha foram enviadas para sua caixa de entrada.',
    };
  }

  public async updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, error: error.message };
      }
      this.isPasswordRecoveryMode = false;
      this.log(
        'PASSWORD_UPDATED',
        'AUTH',
        this.currentSession?.user?.email || 'AUTH_USER',
        'Senha de acesso atualizada com sucesso no Supabase Auth.'
      );
      this.notify();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao atualizar senha no servidor.' };
    }
  }

  public async resetPasswordWithToken(
    _email: string,
    _token: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.updatePassword(newPassword);
  }

  // Audited Support Session Management (Platform Admin)
  public startSupportSession(
    targetTenantId: string,
    reason: string
  ): { success: boolean; error?: string } {
    if (!this.currentSession) {
      return { success: false, error: 'Sessão ativa não encontrada.' };
    }
    const isAllowed =
      this.currentSession.user.role === 'PLATFORM_ADMIN' ||
      this.currentSession.user.role === 'SUPER_ADMIN' ||
      this.currentSession.user.isPrimary === true;

    if (!isAllowed) {
      return {
        success: false,
        error: 'Acesso negado: apenas administradores da plataforma possuem permissão de suporte.',
      };
    }
    if (!reason?.trim()) {
      return {
        success: false,
        error: 'O motivo ou número de chamado deve ser informado para fins de auditoria.',
      };
    }

    const targetClinic =
      this.registeredClinics.find((c) => c.id === targetTenantId) ||
      (targetTenantId === 'tenant_demo' ? PRESEEDED_CLINICS[0] : null);

    if (!targetClinic) {
      return { success: false, error: 'Clínica de destino não encontrada no sistema.' };
    }

    const supportState: SupportSessionState = {
      isSupportMode: true,
      originalAdminUserId: this.currentSession.user.id,
      originalAdminName: this.currentSession.user.name,
      targetTenantId,
      targetTenantName: targetClinic.name,
      startedAt: new Date().toISOString(),
      reason: reason.trim(),
    };

    this.currentSession.supportSession = supportState;
    saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, this.currentSession);

    // Switch tenant
    this.loadTenant(targetTenantId, targetClinic.isDemo || targetTenantId === 'tenant_demo');

    // Register audit log in target clinic's trail!
    this.log(
      'SUPPORT_SESSION_START',
      'SUPPORT',
      targetTenantId,
      `Sessão de suporte iniciada por ${supportState.originalAdminName}. Motivo auditado: "${supportState.reason}".`
    );

    this.notify();
    return { success: true };
  }

  public async startSupportSessionAsync(
    targetTenantId: string,
    targetClinicName?: string,
    reason: string = 'Atendimento e suporte ao cliente da consultoria'
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.currentSession) {
      return { success: false, error: 'Sessão ativa não encontrada.' };
    }
    const isAllowed =
      this.currentSession.user.role === 'PLATFORM_ADMIN' ||
      this.currentSession.user.role === 'SUPER_ADMIN' ||
      this.currentSession.user.isPrimary === true;

    if (!isAllowed) {
      return {
        success: false,
        error: 'Acesso negado: apenas a conta primária ou administradores possuem permissão de suporte.',
      };
    }

    let targetClinic =
      this.registeredClinics.find((c) => c.id === targetTenantId) ||
      (targetTenantId === 'tenant_demo' ? PRESEEDED_CLINICS[0] : null);

    if (!targetClinic && targetTenantId !== 'tenant_demo') {
      const fetched = await SupabaseService.getClinic(targetTenantId);
      if (fetched) {
        targetClinic = fetched;
        this.registeredClinics.push(fetched);
        saveItem(GLOBAL_STORAGE_KEYS.REGISTERED_CLINICS, this.registeredClinics);
      }
    }

    const clinicDisplayName = targetClinic?.name || targetClinicName || 'Clínica Selecionada';

    const supportState: SupportSessionState = {
      isSupportMode: true,
      originalAdminUserId: this.currentSession.user.id,
      originalAdminName: this.currentSession.user.name,
      targetTenantId,
      targetTenantName: clinicDisplayName,
      startedAt: new Date().toISOString(),
      reason: (reason || 'Suporte operacional ao cliente').trim(),
    };

    this.currentSession.supportSession = supportState;
    saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, this.currentSession);

    this.loadTenant(targetTenantId, targetTenantId === 'tenant_demo');
    if (targetTenantId !== 'tenant_demo') {
      await this.hydrateTenantAsync(targetTenantId);
    }

    this.log(
      'SUPPORT_SESSION_START',
      'SUPPORT',
      targetTenantId,
      `Sessão de suporte iniciada por ${supportState.originalAdminName}. Motivo auditado: "${supportState.reason}".`
    );

    this.notify();
    return { success: true };
  }

  public endSupportSession(): { success: boolean; error?: string } {
    if (!this.currentSession?.supportSession) {
      return { success: false, error: 'Nenhuma sessão de suporte está ativa no momento.' };
    }

    const support = this.currentSession.supportSession;
    const targetTenantId = support.targetTenantId || (support as any).targetClinicId || '';
    const adminName = support.originalAdminName || (support as any).platformAdminName || 'Administrador';

    // Log exit in target clinic audit trail
    this.log(
      'SUPPORT_SESSION_END',
      'SUPPORT',
      targetTenantId,
      `Sessão de suporte encerrada por ${adminName}.`
    );

    delete this.currentSession.supportSession;
    saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, this.currentSession);

    // Restore to admin's original tenant
    const origTenant = this.currentSession.tenantId || this.currentSession.clinic.id;
    this.loadTenant(origTenant, this.currentSession.isDemo);
    if (!this.currentSession.isDemo) {
      this.hydrateTenantAsync(origTenant).catch(console.warn);
    }

    // Also log in platform admin's audit trail
    this.log(
      'SUPPORT_SESSION_END',
      'SUPPORT',
      targetTenantId,
      `Sessão de suporte na clínica (${support.targetTenantName || targetTenantId}) finalizada com sucesso por ${adminName}.`
    );

    this.notify();

    return { success: true };
  }

  public resetTenantData(tenantId: string) {
    if (tenantId === 'tenant_demo') {
      this.resetToDemo();
      return;
    }
    // Clean all operational arrays for this tenant
    saveItem(STORAGE_KEYS.PATIENTS, [], tenantId);
    saveItem(STORAGE_KEYS.SALES, [], tenantId);
    saveItem(STORAGE_KEYS.EXPENSES, [], tenantId);
    saveItem(STORAGE_KEYS.APPOINTMENTS, [], tenantId);
    saveItem(STORAGE_KEYS.PROCEDURES, [], tenantId);
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, [], tenantId);
    saveItem(STORAGE_KEYS.BANK_ACCOUNTS, [], tenantId);
    saveItem(STORAGE_KEYS.PAYROLL_HISTORY, [], tenantId);
    saveItem(STORAGE_KEYS.FISCAL_SCENARIOS, [], tenantId);
    saveItem(STORAGE_KEYS.CATEGORIES, INITIAL_CHART_OF_ACCOUNTS, tenantId);

    if (this.activeTenantId === tenantId) {
      this.loadTenant(tenantId, false);
      this.log('RESET_TENANT', 'CLINIC', tenantId, 'Dados da clínica redefinidos para o estado inicial limpo.');
      this.notify();
    }
  }

  // Getters & Preferences
  public getPreferences(): SystemPreferences {
    if (!this.preferences) {
      this.preferences = {
        hideCpf: false,
        alertFatorR: true,
        alertDueDates: true,
        operationalReminders: true,
        lunchBreakEnabled: false,
        lunchBreakStart: undefined,
        lunchBreakEnd: undefined,
      };
    }
    return {
      operationalReminders: true,
      lunchBreakEnabled: false,
      ...this.preferences,
    };
  }

  public updatePreferences(updates: Partial<SystemPreferences>): SystemPreferences {
    this.preferences = { ...this.getPreferences(), ...updates };
    saveItem(STORAGE_KEYS.SYSTEM_PREFERENCES, this.preferences, this.activeTenantId);
    this.log('ATUALIZACAO_PREFERENCIAS', 'PREFERENCES', 'sys', 'Preferências e privacidade do sistema atualizadas.');
    this.notify();
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.savePreferences(this.preferences, this.activeTenantId).catch(console.warn);
    }
    return { ...this.preferences };
  }

  public async updatePreferencesAsync(updates: Partial<SystemPreferences>): Promise<SystemPreferences> {
    const updated = this.updatePreferences(updates);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      await SupabaseService.savePreferences(updated, this.activeTenantId);
    }
    return updated;
  }

  // Versioned Fiscal Parameters (Platform Governance)
  public getFiscalParameters(): FiscalParameter[] {
    return [...this.fiscalParameters];
  }

  public getOfficialMinimumWage(dateOrYear: number | string = 2026): number {
    return getMinWageCentral(dateOrYear, this.fiscalParameters);
  }

  public checkMinimumWageReview(dateStr?: string) {
    return checkUpcomingYearWageReview(dateStr, this.fiscalParameters);
  }

  public updateFiscalParameter(id: string, updates: Partial<FiscalParameter>): boolean {
    let affected = false;
    this.fiscalParameters = this.fiscalParameters.map((p) => {
      if (p.id !== id) return p;
      affected = true;
      return {
        ...p,
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: this.currentSession?.user?.name || 'Platform Admin',
      };
    });
    if (affected) {
      saveItem(GLOBAL_STORAGE_KEYS.FISCAL_PARAMETERS, this.fiscalParameters);
      this.log('PARAMETRO_FISCAL_ATUALIZADO', 'FISCAL_PARAMETER', id, `Parâmetro legal ${id} atualizado.`);
      this.notify();
      return true;
    }
    return false;
  }

  public addFiscalParameter(param: Omit<FiscalParameter, 'id' | 'updatedAt'>): FiscalParameter {
    const newParam: FiscalParameter = {
      ...param,
      id: `param_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      updatedAt: new Date().toISOString(),
    };
    this.fiscalParameters = [...this.fiscalParameters, newParam];
    saveItem(GLOBAL_STORAGE_KEYS.FISCAL_PARAMETERS, this.fiscalParameters);
    this.log('PARAMETRO_FISCAL_CRIADO', 'FISCAL_PARAMETER', newParam.id, `Parâmetro legal ${newParam.name} cadastrado com sucesso.`);
    this.notify();
    return newParam;
  }

  // Getters
  public getOrg(): Organization {
    return this.org;
  }

  public getUser(): User {
    return this.user;
  }

  public getProfessional(): Professional {
    return this.professional;
  }

  public getProfessionals(): Professional[] {
    return [this.professional];
  }

  public getPatients(): Patient[] {
    return this.patients;
  }

  public getSales(): Sale[] {
    return this.sales;
  }

  public getExpenses(): Expense[] {
    return this.expenses;
  }

  public getCategories(): ExpenseCategory[] {
    return this.categories;
  }

  public getBankAccounts(): BankAccount[] {
    return this.bankAccounts || [];
  }

  public hasBankTransactions(id: string): boolean {
    const hasLinkedExpenses = (this.expenses || []).some((e) => e.bankAccountId === id);
    const hasLinkedSales = (this.sales || []).some(
      (s) => s.bankAccountId === id || s.installments?.some((inst) => inst.bankAccountId === id)
    );
    return hasLinkedExpenses || hasLinkedSales;
  }

  public addBankAccount(account: Omit<BankAccount, 'id' | 'orgId'>): BankAccount {
    const newAccount: BankAccount = {
      ...account,
      id: `bank_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orgId: this.org?.id || 'org_dental',
    };
    this.bankAccounts = [...(this.bankAccounts || []), newAccount];
    saveItem(STORAGE_KEYS.BANK_ACCOUNTS, this.bankAccounts, this.activeTenantId);
    this.log('CRIACAO_CONTA_BANCARIA', 'BANK_ACCOUNT', newAccount.id, `Conta bancária "${newAccount.name}" (${newAccount.accountType}) cadastrada.`);
    this.notify();
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveBankAccount(newAccount, this.activeTenantId).catch(console.warn);
    }
    return newAccount;
  }

  public async addBankAccountAsync(account: Omit<BankAccount, 'id' | 'orgId'>): Promise<BankAccount> {
    const newAccount = this.addBankAccount(account);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      await SupabaseService.saveBankAccount(newAccount, this.activeTenantId);
    }
    return newAccount;
  }

  public async updateBankAccount(id: string, updates: Partial<BankAccount>): Promise<void> {
    this.bankAccounts = (this.bankAccounts || []).map((b) => (b.id === id ? { ...b, ...updates } : b));
    saveItem(STORAGE_KEYS.BANK_ACCOUNTS, this.bankAccounts, this.activeTenantId);
    this.log('ATUALIZACAO_CONTA_BANCARIA', 'BANK_ACCOUNT', id, `Conta bancária atualizada.`);
    this.notify();
    const updated = this.bankAccounts.find((b) => b.id === id);
    if (updated && !this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      await SupabaseService.saveBankAccount(updated, this.activeTenantId);
    }
  }

  public deleteBankAccount(id: string): boolean {
    if (this.hasBankTransactions(id)) {
      return false;
    }
    this.bankAccounts = (this.bankAccounts || []).filter((b) => b.id !== id);
    saveItem(STORAGE_KEYS.BANK_ACCOUNTS, this.bankAccounts, this.activeTenantId);
    this.log('EXCLUSAO_CONTA_BANCARIA', 'BANK_ACCOUNT', id, `Conta bancária excluída.`);
    this.notify();
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.deleteBankAccount(id, this.activeTenantId).catch(console.warn);
    }
    return true;
  }

  public async deleteBankAccountAsync(id: string): Promise<{ success: boolean; error?: string; hasTransactions?: boolean }> {
    if (this.hasBankTransactions(id)) {
      return {
        success: false,
        hasTransactions: true,
        error: 'Esta conta possui movimentações vinculadas e não pode ser excluída.',
      };
    }

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const { success, error } = await SupabaseService.deleteBankAccount(id, this.activeTenantId);
      if (!success) {
        return {
          success: false,
          error: error || 'Erro ao excluir conta bancária no servidor.',
        };
      }
    }

    this.bankAccounts = (this.bankAccounts || []).filter((b) => b.id !== id);
    saveItem(STORAGE_KEYS.BANK_ACCOUNTS, this.bankAccounts, this.activeTenantId);
    this.log('EXCLUSAO_CONTA_BANCARIA', 'BANK_ACCOUNT', id, `Conta bancária excluída.`);
    this.notify();
    return { success: true };
  }

  public getPayrollHistory(): PayrollHistoryEntry[] {
    return this.payrollHistory;
  }

  public getAuditLogs(): AuditLog[] {
    return this.auditLogs;
  }

  public getTaxRulesPf(year: number): TaxRulesPf {
    const candidate = this.taxRulesPf && this.taxRulesPf[year];
    if (candidate && Array.isArray(candidate.brackets) && candidate.brackets.length > 0) {
      if (year === 2026 && (candidate.simplifiedDiscountLimitMonthly === 564.80 || candidate.brackets[0]?.max === 2259.20)) {
        return DEFAULT_TAX_RULES_PF[2026];
      }
      return candidate;
    }
    return DEFAULT_TAX_RULES_PF[year] || DEFAULT_TAX_RULES_PF[2026];
  }

  public getTaxRulesSimples(year: number): TaxRulesSimples {
    const candidate = this.taxRulesSimples && this.taxRulesSimples[year];
    if (candidate && (Array.isArray(candidate.annexIII) || Array.isArray(candidate.anexoIII))) {
      return candidate;
    }
    return DEFAULT_TAX_RULES_SIMPLES[year] || DEFAULT_TAX_RULES_SIMPLES[2025];
  }

  // Fiscal Scenarios CRUD
  public getFiscalScenarios(): SavedFiscalScenario[] {
    return this.fiscalScenarios;
  }

  public addFiscalScenario(scenario: Omit<SavedFiscalScenario, 'id' | 'createdAt'>): SavedFiscalScenario {
    const newScenario: SavedFiscalScenario = {
      ...scenario,
      id: `scen_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.fiscalScenarios = [newScenario, ...this.fiscalScenarios];
    saveItem(STORAGE_KEYS.FISCAL_SCENARIOS, this.fiscalScenarios);
    this.log('CRIACAO_CENARIO_FISCAL', 'FISCAL_SCENARIO', newScenario.id, `Cenário fiscal "${newScenario.name}" salvo com sucesso.`);
    this.notify();
    return newScenario;
  }

  public updateFiscalScenario(id: string, updates: Partial<SavedFiscalScenario>): void {
    this.fiscalScenarios = this.fiscalScenarios.map((s) => (s.id === id ? { ...s, ...updates } : s));
    saveItem(STORAGE_KEYS.FISCAL_SCENARIOS, this.fiscalScenarios);
    this.log('ATUALIZACAO_CENARIO_FISCAL', 'FISCAL_SCENARIO', id, `Cenário fiscal atualizado.`);
    this.notify();
  }

  public deleteFiscalScenario(id: string): boolean {
    const prevLen = this.fiscalScenarios.length;
    this.fiscalScenarios = this.fiscalScenarios.filter((s) => s.id !== id);
    if (this.fiscalScenarios.length !== prevLen) {
      saveItem(STORAGE_KEYS.FISCAL_SCENARIOS, this.fiscalScenarios);
      this.log('EXCLUSAO_CENARIO_FISCAL', 'FISCAL_SCENARIO', id, `Cenário fiscal excluído.`);
      this.notify();
      return true;
    }
    return false;
  }

  public applyFiscalScenario(scenario: SavedFiscalScenario): void {
    this.professional = {
      ...this.professional,
      rbt12Inicial: scenario.parameters.rbt12,
      folha12MesesInicial: scenario.parameters.fs12,
      proLaboreMensal: scenario.parameters.monthlyProLabore,
    };
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional);
    this.log(
      'APLICACAO_CENARIO_FISCAL',
      'PROFESSIONAL',
      this.professional.id,
      `Cenário "${scenario.name}" aplicado aos parâmetros oficiais: RBT12 R$ ${scenario.parameters.rbt12.toLocaleString('pt-BR')}, FS12 R$ ${scenario.parameters.fs12.toLocaleString('pt-BR')}, Pró-labore R$ ${scenario.parameters.monthlyProLabore.toLocaleString('pt-BR')}.`
    );
    this.notify();
  }

  // Accounts Receivable View Derived
  public getAccountsReceivable(): AccountReceivableItem[] {
    const items: AccountReceivableItem[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    for (const sale of this.sales) {
      for (const inst of sale.installments) {
        const received = inst.amountReceived || (inst.status === 'RECEBIDO' ? inst.value : 0);
        const balance = Math.max(0, inst.value - received);

        let overallStatus: AccountReceivableItem['status'] = 'A_VENCER';
        if (inst.status === 'CANCELADO') {
          overallStatus = 'CANCELADO';
        } else if (inst.status === 'RECEBIDO' || balance === 0) {
          overallStatus = 'RECEBIDO';
        } else if (received > 0 && balance > 0) {
          overallStatus = 'PARCIALMENTE_RECEBIDO';
        } else if (inst.dueDate < todayStr) {
          overallStatus = 'VENCIDO';
        }

        const docSummary =
          sale.taxOrigin === 'CPF'
            ? inst.status !== 'RECEBIDO'
              ? 'Receita Saúde (A Emitir)'
              : inst.receitaSaudeId
              ? `Receita Saúde #${inst.receitaSaudeId}`
              : `Receita Saúde (Pendente de Emissão)`
            : sale.nfseNumber
            ? `NFS-e #${sale.nfseNumber}`
            : `NFS-e (Pendente)`;

        let effectiveNotes: string | undefined = undefined;
        const rawNote = (sale.notes && sale.notes.trim()) || '';
        const lowerNote = rawNote.toLowerCase();
        const procLower = (sale.procedureName || '').trim().toLowerCase();
        if (
          rawNote &&
          !lowerNote.startsWith('atendimento clínico') &&
          lowerNote !== procLower &&
          lowerNote !== `atendimento clínico - ${procLower}`
        ) {
          effectiveNotes = rawNote;
        }

        items.push({
          installmentId: inst.id,
          saleId: sale.id,
          patientName: sale.patientName,
          taxOrigin: sale.taxOrigin,
          documentSummary: docSummary,
          procedureName: sale.procedureName,
          competenceDate: sale.serviceDate,
          dueDate: inst.dueDate,
          paymentDate: inst.paymentDate,
          value: inst.value,
          amountReceived: received,
          balance,
          status: overallStatus,
          receitaSaudeStatus: inst.receitaSaudeStatus,
          receitaSaudeId: inst.receitaSaudeId,
          installmentNumber: inst.installmentNumber,
          totalInstallments: inst.totalInstallments,
          notes: effectiveNotes,
          appointmentId: sale.appointmentId,
          origin: sale.origin || (sale.appointmentId ? 'AGENDA' : 'MANUAL'),
          serviceDate: sale.serviceDate,
          cardFeePercent: inst.cardFeePercent ?? sale.cardFeePercent,
          cardFeeAmount: inst.cardFeeAmount ?? sale.cardFeeAmount,
          netValue: inst.netValue ?? sale.netValue,
          paymentMethod: inst.paymentMethod || sale.paymentMethod,
          bankAccountId: inst.bankAccountId || sale.bankAccountId,
          originalEstimatedValue: sale.originalEstimatedValue,
          priceHistory: sale.priceHistory,
        });
      }
    }

    // Sort by dueDate asc
    return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  // Setters & Actions
  public updateProfessional(updates: Partial<Professional>): void {
    this.professional = { ...this.professional, ...updates };
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional, this.activeTenantId);

    const clinicName = (updates.nomeFantasia || updates.razaoSocial || '').trim();
    if (clinicName) {
      this.org = {
        ...this.org,
        name: clinicName,
        tradeName: clinicName,
      };
      saveItem(STORAGE_KEYS.ORGANIZATION, this.org, this.activeTenantId);

      const clinicIdx = this.registeredClinics.findIndex((c) => c.id === this.activeTenantId);
      if (clinicIdx >= 0) {
        this.registeredClinics[clinicIdx].name = clinicName;
        this.registeredClinics[clinicIdx].tradeName = clinicName;
        saveItem(GLOBAL_STORAGE_KEYS.REGISTERED_CLINICS, this.registeredClinics);
      }

      if (this.currentSession) {
        if (this.currentSession.supportSession && this.currentSession.supportSession.targetTenantId === this.activeTenantId) {
          this.currentSession.supportSession.targetTenantName = clinicName;
        }
        if (this.currentSession.clinic && this.currentSession.tenantId === this.activeTenantId) {
          this.currentSession.clinic.name = clinicName;
          this.currentSession.clinic.tradeName = clinicName;
        }
        saveItem(GLOBAL_STORAGE_KEYS.AUTH_SESSION, this.currentSession);
      }
    }

    this.log('ATUALIZACAO_PERFIL', 'PROFESSIONAL', this.professional.id, 'Dados cadastrais ou tributários atualizados.');
    this.notify();
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveProfessional(this.professional, this.activeTenantId).catch(console.warn);
    }
  }

  public async updateProfessionalAsync(updates: Partial<Professional>): Promise<{ success: boolean; error?: string }> {
    const previousProf = { ...this.professional };
    const previousOrg = { ...this.org };
    this.updateProfessional(updates);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveProfessional(this.professional, this.activeTenantId);
      if (!res.success) {
        this.professional = previousProf;
        this.org = previousOrg;
        saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional, this.activeTenantId);
        saveItem(STORAGE_KEYS.ORGANIZATION, this.org, this.activeTenantId);
        this.notify();
        return { success: false, error: res.error || 'Erro ao persistir no servidor' };
      }
    }
    return { success: true };
  }

  public async addPatientAsync(patientData: Omit<Patient, 'id' | 'orgId' | 'createdAt'> & { orgId?: string }): Promise<{ success: boolean; patient?: Patient; error?: string }> {
    const newPatient: Patient = {
      ...patientData,
      id: `pat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: patientData.orgId || this.org.id,
      createdAt: new Date().toISOString(),
    };
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.savePatient(newPatient, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao salvar paciente no servidor' };
      }
    }
    this.patients = [newPatient, ...this.patients];
    saveItem(STORAGE_KEYS.PATIENTS, this.patients, this.activeTenantId);
    this.log('CRIACAO_PACIENTE', 'PATIENT', newPatient.id, `Paciente ${newPatient.name} cadastrado.`);
    this.notify();
    return { success: true, patient: newPatient };
  }

  public addPatient(patientData: Omit<Patient, 'id' | 'orgId' | 'createdAt'> & { orgId?: string }): Patient {
    const newPatient: Patient = {
      ...patientData,
      id: `pat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: patientData.orgId || this.org.id,
      createdAt: new Date().toISOString(),
    };
    this.patients = [newPatient, ...this.patients];
    saveItem(STORAGE_KEYS.PATIENTS, this.patients, this.activeTenantId);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.savePatient(newPatient, this.activeTenantId).catch(console.warn);
    }
    this.log('CRIACAO_PACIENTE', 'PATIENT', newPatient.id, `Paciente ${newPatient.name} cadastrado.`);
    this.notify();
    return newPatient;
  }

  public async updatePatientAsync(id: string, updates: Partial<Patient>): Promise<{ success: boolean; error?: string }> {
    const found = this.patients.find((p) => p.id === id);
    if (!found) return { success: false, error: 'Paciente não encontrado' };
    const updated: Patient = { ...found, ...updates };
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.savePatient(updated, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao atualizar paciente no servidor' };
      }
    }
    this.patients = this.patients.map((p) => (p.id === id ? updated : p));
    saveItem(STORAGE_KEYS.PATIENTS, this.patients, this.activeTenantId);
    this.log('ATUALIZACAO_PACIENTE', 'PATIENT', id, `Cadastro do paciente atualizado.`);
    this.notify();
    return { success: true };
  }

  public updatePatient(id: string, updates: Partial<Patient>) {
    this.updatePatientAsync(id, updates).catch(console.warn);
  }

  public async deletePatientAsync(id: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.deletePatient(id, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao excluir paciente no servidor' };
      }
    }
    this.patients = this.patients.filter((p) => p.id !== id);
    saveItem(STORAGE_KEYS.PATIENTS, this.patients, this.activeTenantId);
    this.log('EXCLUSAO_PACIENTE', 'PATIENT', id, `Paciente excluído.`);
    this.notify();
    return { success: true };
  }

  public deletePatient(id: string): boolean {
    this.deletePatientAsync(id).catch(console.warn);
    this.patients = this.patients.filter((p) => p.id !== id);
    saveItem(STORAGE_KEYS.PATIENTS, this.patients, this.activeTenantId);
    this.notify();
    return true;
  }

  public async addSaleAsync(saleData: Omit<Sale, 'id' | 'orgId' | 'createdAt'> & { orgId?: string }): Promise<{ success: boolean; sale?: Sale; error?: string }> {
    const newSale: Sale = {
      ...saleData,
      id: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: saleData.orgId || this.org.id,
      createdAt: new Date().toISOString(),
    };
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveSale(newSale, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao salvar receita no servidor' };
      }
      (newSale.installments || []).forEach((inst) => {
        if (inst.status === 'RECEBIDO' && inst.bankAccountId) {
          const rec = inst.amountReceived ?? inst.netValue ?? inst.value;
          this.updateBankAccountBalance(inst.bankAccountId, rec);
        }
      });
    }
    this.sales = [newSale, ...this.sales];
    saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
    this.log(
      'CRIACAO_RECEITA',
      'SALE',
      newSale.id,
      `Receita ${newSale.taxOrigin} de ${newSale.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrada para ${newSale.patientName}.`
    );
    this.notify();
    return { success: true, sale: newSale };
  }

  public addSale(saleData: Omit<Sale, 'id' | 'orgId' | 'createdAt'> & { orgId?: string }): Sale {
    const newSale: Sale = {
      ...saleData,
      id: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: saleData.orgId || this.org.id,
      createdAt: new Date().toISOString(),
    };
    this.sales = [newSale, ...this.sales];
    saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveSale(newSale, this.activeTenantId).catch(console.warn);
      (newSale.installments || []).forEach((inst) => {
        if (inst.status === 'RECEBIDO' && inst.bankAccountId) {
          const rec = inst.amountReceived ?? inst.netValue ?? inst.value;
          this.updateBankAccountBalance(inst.bankAccountId, rec);
        }
      });
    }
    this.log(
      'CRIACAO_RECEITA',
      'SALE',
      newSale.id,
      `Receita ${newSale.taxOrigin} de ${newSale.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrada para ${newSale.patientName}.`
    );
    this.notify();
    return newSale;
  }

  public async updateSaleAsync(id: string, updates: Partial<Sale>): Promise<{ success: boolean; error?: string }> {
    const found = this.sales.find((s) => s.id === id);
    if (!found) return { success: false, error: 'Receita não encontrada' };
    const updated: Sale = { ...found, ...updates };
    this.sales = this.sales.map((s) => (s.id === id ? updated : s));
    saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
    this.log('ATUALIZACAO_RECEITA', 'SALE', id, `Dados da receita foram atualizados.`);
    this.notify();

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveSale(updated, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao atualizar venda no servidor' };
      }
    }
    return { success: true };
  }

  public updateSale(id: string, updates: Partial<Sale>) {
    const found = this.sales.find((s) => s.id === id);
    if (!found) return;
    const updated: Sale = { ...found, ...updates };
    this.sales = this.sales.map((s) => (s.id === id ? updated : s));
    saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
    this.log('ATUALIZACAO_RECEITA', 'SALE', id, `Dados da receita foram atualizados.`);
    this.notify();

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveSale(updated, this.activeTenantId).catch(console.warn);
    }
  }

  public async deleteSaleAsync(id: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.deleteSale(id, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao excluir venda no servidor' };
      }
    }
    this.sales = this.sales.filter((s) => s.id !== id);
    saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
    this.log('EXCLUSAO_RECEITA', 'SALE', id, `Receita excluída.`);
    this.notify();
    return { success: true };
  }

  public deleteSale(id: string): boolean {
    this.deleteSaleAsync(id).catch(console.warn);
    this.sales = this.sales.filter((s) => s.id !== id);
    saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
    this.notify();
    return true;
  }

  public batchDeleteSales(ids: string[]): number {
    const idSet = new Set(ids);
    const prevLen = this.sales.length;
    this.sales = this.sales.filter((s) => !idSet.has(s.id));
    const deletedCount = prevLen - this.sales.length;
    if (deletedCount > 0) {
      saveItem(STORAGE_KEYS.SALES, this.sales);
      this.log('EXCLUSAO_RECEITA_LOTE', 'SALE', 'batch', `${deletedCount} receitas excluídas em lote.`);
      this.notify();
    }
    return deletedCount;
  }

  public batchUpdateSales(ids: string[], updates: Partial<Sale>): number {
    const idSet = new Set(ids);
    let updatedCount = 0;
    this.sales = this.sales.map((s) => {
      if (idSet.has(s.id)) {
        updatedCount++;
        return { ...s, ...updates };
      }
      return s;
    });
    if (updatedCount > 0) {
      saveItem(STORAGE_KEYS.SALES, this.sales);
      this.log('ATUALIZACAO_RECEITA_LOTE', 'SALE', 'batch', `${updatedCount} receitas atualizadas em lote.`);
      this.notify();
    }
    return updatedCount;
  }

  public updateBankAccountBalance(bankAccountId: string, deltaAmount: number) {
    let updatedAccount: BankAccount | null = null;
    this.bankAccounts = (this.bankAccounts || []).map((acc) => {
      if (acc.id === bankAccountId) {
        const newBalance = Number(((acc.currentBalance || 0) + deltaAmount).toFixed(2));
        updatedAccount = { ...acc, currentBalance: newBalance };
        return updatedAccount;
      }
      return acc;
    });
    if (updatedAccount) {
      saveItem(STORAGE_KEYS.BANK_ACCOUNTS, this.bankAccounts, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveBankAccount(updatedAccount, this.activeTenantId).catch(console.warn);
      }
    }
  }

  public settleInstallment(
    saleId: string,
    installmentId: string,
    paymentDate: string,
    amountReceived: number,
    paymentMethod: PaymentMethod,
    bankAccountId?: string,
    receitaSaudeId?: string,
    receitaSaudeStatus?: ReceitaSaudeStatus
  ) {
    let affectedSale: Sale | null = null;
    this.sales = this.sales.map((sale) => {
      if (sale.id !== saleId) return sale;

      const updatedInstallments = sale.installments.map((inst) => {
        if (inst.id !== installmentId) return inst;

        const isCpf = sale.taxOrigin === 'CPF';
        const finalReceitaStatus = isCpf
          ? receitaSaudeStatus || (receitaSaudeId ? 'EMITIDO' : 'A_EMITIR')
          : undefined;

        return {
          ...inst,
          status: 'RECEBIDO' as InstallmentStatus,
          paymentDate,
          amountReceived,
          paymentMethod,
          bankAccountId: bankAccountId || inst.bankAccountId,
          receitaSaudeId: receitaSaudeId || inst.receitaSaudeId,
          receitaSaudeStatus: finalReceitaStatus,
          receitaSaudeEmittedAt: receitaSaudeId ? new Date().toISOString() : inst.receitaSaudeEmittedAt,
        };
      });

      affectedSale = {
        ...sale,
        installments: updatedInstallments,
      };
      return affectedSale;
    });

    if (affectedSale) {
      saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveSale(affectedSale, this.activeTenantId).catch(console.warn);
      }
      if (bankAccountId) {
        this.updateBankAccountBalance(bankAccountId, amountReceived);
      }
      this.log(
        'RECEBIMENTO_PARCELA',
        'INSTALLMENT',
        installmentId,
        `Recebimento de parcela registrado no valor de R$ ${amountReceived.toFixed(2)}. Data: ${paymentDate}.`
      );
      this.notify();
    }
  }

  public updateReceitaSaude(saleId: string, installmentId: string, status: ReceitaSaudeStatus, identifier: string) {
    let affectedSale: Sale | null = null;
    this.sales = this.sales.map((sale) => {
      if (sale.id !== saleId) return sale;
      const updated = sale.installments.map((inst) => {
        if (inst.id !== installmentId) return inst;
        return {
          ...inst,
          receitaSaudeStatus: status,
          receitaSaudeId: identifier,
          receitaSaudeEmittedAt: status === 'EMITIDO' ? new Date().toISOString() : undefined,
        };
      });
      affectedSale = { ...sale, installments: updated };
      return affectedSale;
    });
    if (affectedSale) {
      saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveSale(affectedSale, this.activeTenantId).catch(console.warn);
      }
      this.log('EMISSAO_RECEITA_SAUDE', 'INSTALLMENT', installmentId, `Status Receita Saúde atualizado para ${status} (ID: ${identifier}).`);
      this.notify();
    }
  }

  public updateNfse(saleId: string, status: Sale['nfseStatus'], number: string, code?: string) {
    let affectedSale: Sale | null = null;
    this.sales = this.sales.map((sale) => {
      if (sale.id !== saleId) return sale;
      affectedSale = {
        ...sale,
        nfseStatus: status,
        nfseNumber: number,
        nfseVerificationCode: code,
        nfseEmittedAt: status === 'EMITIDA' ? new Date().toISOString() : undefined,
      };
      return affectedSale;
    });
    if (affectedSale) {
      saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveSale(affectedSale, this.activeTenantId).catch(console.warn);
      }
      this.log('EMISSAO_NFSE', 'SALE', saleId, `NFS-e atualizada para ${status} (Número: ${number}).`);
      this.notify();
    }
  }

  // Receivables Actions (Exclusão e Edição de Parcelas / Contas a Receber)
  public deleteReceivableInstallment(installmentId: string): boolean {
    let affected = false;
    const updatedSales: Sale[] = [];
    let removedSaleId: string | null = null;
    let modifiedSale: Sale | null = null;

    for (const sale of this.sales) {
      const hasInst = sale.installments.some((inst) => inst.id === installmentId);
      if (!hasInst) {
        updatedSales.push(sale);
        continue;
      }

      affected = true;
      const remainingInstallments = sale.installments.filter((inst) => inst.id !== installmentId);

      // Se a venda não tem mais nenhuma parcela, exclui a venda
      if (remainingInstallments.length === 0) {
        removedSaleId = sale.id;
        this.log('EXCLUSAO_RECEIVABLE', 'INSTALLMENT', installmentId, `Última parcela da venda "${sale.procedureName}" excluída. Venda removida.`);
        continue;
      }

      // Se restam parcelas, renumera e recalcula valor total
      const renumbered = remainingInstallments.map((inst, idx) => ({
        ...inst,
        installmentNumber: idx + 1,
        totalInstallments: remainingInstallments.length,
      }));

      const newTotalValue = renumbered.reduce((sum, inst) => sum + inst.value, 0);

      modifiedSale = {
        ...sale,
        totalValue: newTotalValue,
        installmentsCount: renumbered.length,
        installments: renumbered,
      };
      updatedSales.push(modifiedSale);

      this.log(
        'EXCLUSAO_RECEIVABLE',
        'INSTALLMENT',
        installmentId,
        `Parcela excluída do contas a receber da venda "${sale.procedureName}". Restam ${renumbered.length} parcela(s).`
      );
    }

    if (affected) {
      this.sales = updatedSales;
      saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        if (removedSaleId) {
          SupabaseService.deleteSale(removedSaleId, this.activeTenantId).catch(console.warn);
        } else if (modifiedSale) {
          SupabaseService.saveSale(modifiedSale, this.activeTenantId).catch(console.warn);
        }
      }
      this.notify();
      return true;
    }
    return false;
  }

  public batchDeleteReceivables(installmentIds: string[]): number {
    const idSet = new Set(installmentIds);
    let deletedCount = 0;
    const updatedSales: Sale[] = [];
    const removedSaleIds: string[] = [];
    const changedSales: Sale[] = [];

    for (const sale of this.sales) {
      const matched = sale.installments.filter((inst) => idSet.has(inst.id));
      if (matched.length === 0) {
        updatedSales.push(sale);
        continue;
      }

      deletedCount += matched.length;
      const remaining = sale.installments.filter((inst) => !idSet.has(inst.id));

      if (remaining.length === 0) {
        removedSaleIds.push(sale.id);
        continue; // Venda inteira removida
      }

      const renumbered = remaining.map((inst, idx) => ({
        ...inst,
        installmentNumber: idx + 1,
        totalInstallments: remaining.length,
      }));

      const newTotal = renumbered.reduce((sum, inst) => sum + inst.value, 0);

      const upd: Sale = {
        ...sale,
        totalValue: newTotal,
        installmentsCount: renumbered.length,
        installments: renumbered,
      };
      changedSales.push(upd);
      updatedSales.push(upd);
    }

    if (deletedCount > 0) {
      this.sales = updatedSales;
      saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        removedSaleIds.forEach((id) => SupabaseService.deleteSale(id, this.activeTenantId).catch(console.warn));
        changedSales.forEach((s) => SupabaseService.saveSale(s, this.activeTenantId).catch(console.warn));
      }
      this.log(
        'EXCLUSAO_RECEIVABLE_LOTE',
        'INSTALLMENT',
        'batch',
        `${deletedCount} parcelas de contas a receber excluídas em lote.`
      );
      this.notify();
    }

    return deletedCount;
  }

  public batchUpdateReceivables(
    installmentIds: string[],
    updates: {
      dueDate?: string;
      taxOrigin?: TaxOrigin;
      status?: InstallmentStatus;
      paymentDate?: string;
      paymentMethod?: PaymentMethod;
      bankAccountId?: string;
    }
  ): number {
    const idSet = new Set(installmentIds);
    let updatedCount = 0;
    const changedSales: Sale[] = [];

    this.sales = this.sales.map((sale) => {
      let saleHasMatch = false;
      const updatedInstallments = sale.installments.map((inst) => {
        if (!idSet.has(inst.id)) return inst;

        saleHasMatch = true;
        updatedCount++;

        const isSettling = updates.status === 'RECEBIDO';
        const receivedValue = isSettling ? inst.value : inst.amountReceived;
        const pDate = isSettling
          ? updates.paymentDate || new Date().toISOString().split('T')[0]
          : inst.paymentDate;
        const pMethod = updates.paymentMethod || inst.paymentMethod || sale.paymentMethod;
        const bAccount = updates.bankAccountId || inst.bankAccountId;

        return {
          ...inst,
          dueDate: updates.dueDate || inst.dueDate,
          status: updates.status || inst.status,
          paymentDate: pDate,
          paymentMethod: pMethod,
          bankAccountId: bAccount,
          amountReceived: receivedValue,
        };
      });

      if (!saleHasMatch) return sale;

      const updatedSale: Sale = {
        ...sale,
        taxOrigin: updates.taxOrigin || sale.taxOrigin,
        installments: updatedInstallments,
      };
      changedSales.push(updatedSale);
      return updatedSale;
    });

    if (updatedCount > 0) {
      saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        changedSales.forEach((s) => SupabaseService.saveSale(s, this.activeTenantId).catch(console.warn));
      }
      this.log(
        'ATUALIZACAO_RECEIVABLE_LOTE',
        'INSTALLMENT',
        'batch',
        `${updatedCount} parcelas de contas a receber atualizadas em lote.`
      );
      this.notify();
    }

    return updatedCount;
  }

  public getSaleById(saleId: string): Sale | undefined {
    return this.sales.find((s) => s.id === saleId);
  }

  public updateReceivableInstallment(
    installmentId: string,
    updates: {
      dueDate?: string;
      value?: number;
      cardFeePercent?: number;
      taxOrigin?: TaxOrigin;
      status?: InstallmentStatus;
      paymentDate?: string;
      paymentMethod?: PaymentMethod;
      bankAccountId?: string;
      receitaSaudeId?: string;
      receitaSaudeStatus?: ReceitaSaudeStatus;
      nfseNumber?: string;
    }
  ): boolean {
    let affected = false;
    let modifiedSale: Sale | null = null;
    this.sales = this.sales.map((sale) => {
      const hasInst = sale.installments.some((i) => i.id === installmentId);
      if (!hasInst) return sale;

      affected = true;
      const updatedInstallments = sale.installments.map((inst) => {
        if (inst.id !== installmentId) return inst;

        const isSettled = updates.status === 'RECEBIDO';
        const newVal = updates.value !== undefined ? updates.value : inst.value;
        const feePercent = updates.cardFeePercent !== undefined ? updates.cardFeePercent : (inst.cardFeePercent || sale.cardFeePercent || 0);
        const feeAmount = feePercent > 0 ? Number(((newVal * feePercent) / 100).toFixed(2)) : 0;
        const netVal = feePercent > 0 ? Number((newVal - feeAmount).toFixed(2)) : newVal;
        const newReceived = isSettled ? (inst.amountReceived && inst.amountReceived > 0 && updates.value === undefined ? inst.amountReceived : netVal) : (updates.status === 'A_RECEBER' ? 0 : inst.amountReceived);

        return {
          ...inst,
          dueDate: updates.dueDate || inst.dueDate,
          value: newVal,
          cardFeePercent: feePercent > 0 ? feePercent : undefined,
          cardFeeAmount: feeAmount > 0 ? feeAmount : undefined,
          netValue: netVal,
          status: updates.status || inst.status,
          paymentDate: updates.paymentDate !== undefined ? updates.paymentDate : inst.paymentDate,
          paymentMethod: updates.paymentMethod || inst.paymentMethod,
          bankAccountId: updates.bankAccountId || inst.bankAccountId,
          amountReceived: newReceived,
          receitaSaudeId: updates.receitaSaudeId !== undefined ? updates.receitaSaudeId : inst.receitaSaudeId,
          receitaSaudeStatus: updates.receitaSaudeStatus || inst.receitaSaudeStatus,
        };
      });

      const newTotal = updatedInstallments.reduce((acc, curr) => acc + curr.value, 0);

      modifiedSale = {
        ...sale,
        totalValue: newTotal,
        taxOrigin: updates.taxOrigin || sale.taxOrigin,
        nfseNumber: updates.nfseNumber !== undefined ? updates.nfseNumber : sale.nfseNumber,
        installments: updatedInstallments,
      };
      return modifiedSale;
    });

    if (affected && modifiedSale) {
      saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveSale(modifiedSale, this.activeTenantId).catch(console.warn);
      }
      this.log('ATUALIZACAO_RECEIVABLE', 'INSTALLMENT', installmentId, 'Parcela de conta a receber atualizada com sucesso.');
      this.notify();
      return true;
    }
    return false;
  }

  public unsettleInstallment(saleId: string, installmentId: string): boolean {
    let affected = false;
    let modifiedSale: Sale | null = null;
    let revertedAmount = 0;
    let targetBankId: string | undefined = undefined;

    this.sales = this.sales.map((sale) => {
      if (sale.id !== saleId) return sale;

      const updatedInstallments = sale.installments.map((inst) => {
        if (inst.id !== installmentId) return inst;
        affected = true;
        revertedAmount = inst.amountReceived || inst.value || 0;
        targetBankId = inst.bankAccountId;
        return {
          ...inst,
          status: 'A_RECEBER' as InstallmentStatus,
          paymentDate: undefined,
          amountReceived: 0,
          receitaSaudeStatus: (sale.taxOrigin === 'CPF' ? 'A_EMITIR' : inst.receitaSaudeStatus) as ReceitaSaudeStatus,
        };
      });

      modifiedSale = {
        ...sale,
        installments: updatedInstallments,
      };
      return modifiedSale;
    });

    if (affected && modifiedSale) {
      saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveSale(modifiedSale, this.activeTenantId).catch(console.warn);
      }
      if (targetBankId && revertedAmount > 0) {
        this.updateBankAccountBalance(targetBankId, -revertedAmount);
      }
      this.log(
        'ESTORNO_RECEBIMENTO',
        'INSTALLMENT',
        installmentId,
        `Recebimento da parcela ${installmentId} desfeito. Retornada para A Receber.`
      );
      this.notify();
      return true;
    }
    return false;
  }

  // Expense Actions
  public async addExpenseAsync(expenseData: Omit<Expense, 'id' | 'orgId' | 'createdAt'>): Promise<{ success: boolean; expense?: Expense; error?: string }> {
    const newExpense: Expense = {
      ...expenseData,
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: this.org.id,
      createdAt: new Date().toISOString(),
    };
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveExpense(newExpense, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao salvar despesa no servidor' };
      }
    }
    this.expenses = [newExpense, ...this.expenses];
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
    this.log(
      'CRIACAO_DESPESA',
      'EXPENSE',
      newExpense.id,
      `Despesa ${newExpense.categoryName} no valor de R$ ${newExpense.value.toFixed(2)} cadastrada.`
    );
    this.notify();
    return { success: true, expense: newExpense };
  }

  public addExpense(expenseData: Omit<Expense, 'id' | 'orgId' | 'createdAt'>): Expense {
    const newExpense: Expense = {
      ...expenseData,
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orgId: this.org.id,
      createdAt: new Date().toISOString(),
    };
    this.expenses = [newExpense, ...this.expenses];
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveExpense(newExpense, this.activeTenantId).catch(console.warn);
      if (newExpense.status === 'PAGO' && newExpense.bankAccountId) {
        this.updateBankAccountBalance(newExpense.bankAccountId, -newExpense.value);
      }
    }
    this.log(
      'CRIACAO_DESPESA',
      'EXPENSE',
      newExpense.id,
      `Despesa ${newExpense.categoryName} no valor de R$ ${newExpense.value.toFixed(2)} cadastrada.`
    );
    this.notify();
    return newExpense;
  }

  public payExpense(id: string, paymentDate: string, paymentMethod: PaymentMethod, bankAccountId?: string) {
    this.expenses = this.expenses.map((exp) => {
      if (exp.id !== id) return exp;
      const updated: Expense = {
        ...exp,
        status: 'PAGO',
        paymentDate,
        paymentMethod,
        bankAccountId: bankAccountId || exp.bankAccountId,
      };
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveExpense(updated, this.activeTenantId).catch(console.warn);
      }
      if (updated.bankAccountId) {
        this.updateBankAccountBalance(updated.bankAccountId, -updated.value);
      }
      return updated;
    });
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
    this.log('PAGAMENTO_DESPESA', 'EXPENSE', id, `Despesa marcada como paga em ${paymentDate}.`);
    this.notify();
  }

  public async updateExpenseAsync(id: string, updates: Partial<Expense>): Promise<{ success: boolean; error?: string }> {
    const found = this.expenses.find((e) => e.id === id);
    if (!found) return { success: false, error: 'Despesa não encontrada' };
    const updated: Expense = { ...found, ...updates };
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveExpense(updated, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao atualizar despesa no servidor' };
      }
    }
    this.expenses = this.expenses.map((exp) => (exp.id === id ? updated : exp));
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
    this.log('ATUALIZACAO_DESPESA', 'EXPENSE', id, `Dados da despesa atualizados.`);
    this.notify();
    return { success: true };
  }

  public updateExpense(id: string, updates: Partial<Expense>) {
    const found = this.expenses.find((e) => e.id === id);
    if (found) {
      const updated: Expense = { ...found, ...updates };
      this.expenses = this.expenses.map((exp) => (exp.id === id ? updated : exp));
      saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
      this.log('ATUALIZACAO_DESPESA', 'EXPENSE', id, `Dados da despesa atualizados.`);
      this.notify();
    }
    this.updateExpenseAsync(id, updates).catch(console.warn);
  }

  public async deleteExpenseAsync(id: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.deleteExpense(id, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao excluir despesa no servidor' };
      }
    }
    this.expenses = this.expenses.filter((e) => e.id !== id);
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
    this.log('EXCLUSAO_DESPESA', 'EXPENSE', id, `Despesa excluída.`);
    this.notify();
    return { success: true };
  }

  public deleteExpense(id: string) {
    this.deleteExpenseAsync(id).catch(console.warn);
    this.expenses = this.expenses.filter((e) => e.id !== id);
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
    this.notify();
  }

  public batchDeleteExpenses(ids: string[]): number {
    const idSet = new Set(ids);
    const prevLen = this.expenses.length;
    this.expenses = this.expenses.filter((e) => !idSet.has(e.id));
    const deletedCount = prevLen - this.expenses.length;
    if (deletedCount > 0) {
      saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        ids.forEach((id) => SupabaseService.deleteExpense(id, this.activeTenantId).catch(console.warn));
      }
      this.log('EXCLUSAO_DESPESA_LOTE', 'EXPENSE', 'batch', `${deletedCount} despesas excluídas em lote.`);
      this.notify();
    }
    return deletedCount;
  }

  public batchUpdateExpenses(ids: string[], updates: Partial<Expense>): number {
    const idSet = new Set(ids);
    let updatedCount = 0;
    const changedExpenses: Expense[] = [];
    this.expenses = this.expenses.map((e) => {
      if (idSet.has(e.id)) {
        updatedCount++;
        const upd = { ...e, ...updates };
        changedExpenses.push(upd);
        return upd;
      }
      return e;
    });
    if (updatedCount > 0) {
      saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveExpensesBulk(changedExpenses, this.activeTenantId).catch(console.warn);
      }
      this.log('ATUALIZACAO_DESPESA_LOTE', 'EXPENSE', 'batch', `${updatedCount} despesas atualizadas em lote.`);
      this.notify();
    }
    return updatedCount;
  }

  public addExpenses(expensesData: Array<Omit<Expense, 'id' | 'orgId' | 'createdAt'>>): Expense[] {
    const createdList: Expense[] = [];
    expensesData.forEach((data, index) => {
      const newExpense: Expense = {
        ...data,
        id: `exp_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
        orgId: this.org.id,
        createdAt: new Date().toISOString(),
      };
      createdList.push(newExpense);
    });
    this.expenses = [...createdList, ...this.expenses];
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveExpensesBulk(createdList, this.activeTenantId).catch(console.warn);
      createdList.forEach((exp) => {
        if (exp.status === 'PAGO' && exp.bankAccountId) {
          this.updateBankAccountBalance(exp.bankAccountId, -exp.value);
        }
      });
    }
    this.log(
      'CRIACAO_DESPESA_LOTE',
      'EXPENSE',
      'batch',
      `${createdList.length} despesas cadastradas em lote / série.`
    );
    this.notify();
    return createdList;
  }

  public deleteExpenseSeries(id: string, scope: 'ONLY_THIS' | 'THIS_AND_FUTURE' | 'ALL_SERIES'): number {
    const target = this.expenses.find((e) => e.id === id);
    if (!target) return 0;
    const seriesId = target.installmentGroupId || target.recurrenceId;
    if (!seriesId || scope === 'ONLY_THIS') {
      this.deleteExpense(id);
      return 1;
    }

    const prevLen = this.expenses.length;
    const targetDueDate = target.dueDate;
    const toDelete: Expense[] = [];

    this.expenses = this.expenses.filter((e) => {
      const matchGroup =
        (target.installmentGroupId && e.installmentGroupId === target.installmentGroupId) ||
        (target.recurrenceId && e.recurrenceId === target.recurrenceId);

      if (!matchGroup) return true;

      if (scope === 'ALL_SERIES') {
        toDelete.push(e);
        return false;
      }
      if (scope === 'THIS_AND_FUTURE') {
        if (e.id === target.id || e.dueDate >= targetDueDate) {
          toDelete.push(e);
          return false;
        }
      }
      return true;
    });

    const deletedCount = prevLen - this.expenses.length;
    if (deletedCount > 0) {
      saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        toDelete.forEach((exp) => {
          SupabaseService.deleteExpense(exp.id, this.activeTenantId).catch(console.warn);
        });
      }
      this.log('EXCLUSAO_DESPESA_SERIE', 'EXPENSE', seriesId, `${deletedCount} despesas da série excluídas.`);
      this.notify();
    }
    return deletedCount;
  }

  public updateExpenseSeries(
    id: string,
    updates: Partial<Expense>,
    scope: 'ONLY_THIS' | 'THIS_AND_FUTURE' | 'ALL_SERIES'
  ): number {
    const target = this.expenses.find((e) => e.id === id);
    if (!target) return 0;
    const seriesId = target.installmentGroupId || target.recurrenceId;
    if (!seriesId || scope === 'ONLY_THIS') {
      this.updateExpense(id, updates);
      return 1;
    }

    const targetDueDate = target.dueDate;
    let updatedCount = 0;
    const toSync: Expense[] = [];

    this.expenses = this.expenses.map((e) => {
      const matchGroup =
        (target.installmentGroupId && e.installmentGroupId === target.installmentGroupId) ||
        (target.recurrenceId && e.recurrenceId === target.recurrenceId);

      if (!matchGroup) return e;

      let shouldUpdate = false;
      if (scope === 'ALL_SERIES') {
        shouldUpdate = true;
      } else if (scope === 'THIS_AND_FUTURE') {
        if (e.id === target.id || e.dueDate >= targetDueDate) {
          shouldUpdate = true;
        }
      }

      if (shouldUpdate) {
        updatedCount++;
        const filteredUpdates = { ...updates };
        delete filteredUpdates.installmentNumber;
        delete filteredUpdates.recurrenceIndex;
        delete filteredUpdates.dueDate;
        delete filteredUpdates.competenceDate;
        const updated = { ...e, ...filteredUpdates };
        toSync.push(updated);
        return updated;
      }
      return e;
    });

    if (updatedCount > 0) {
      saveItem(STORAGE_KEYS.EXPENSES, this.expenses, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        toSync.forEach((exp) => {
          SupabaseService.saveExpense(exp, this.activeTenantId).catch(console.warn);
        });
      }
      this.log('ATUALIZACAO_DESPESA_SERIE', 'EXPENSE', seriesId, `${updatedCount} despesas da série atualizadas.`);
      this.notify();
    }
    return updatedCount;
  }


  // Procedure Actions (Tabela de Procedimentos e Precificação)
  public getProcedures(): DentalProcedure[] {
    return this.procedures;
  }

  public async addProcedureAsync(procData: Omit<DentalProcedure, 'id'>): Promise<{ success: boolean; procedure?: DentalProcedure; error?: string }> {
    const newProc: DentalProcedure = {
      ...procData,
      id: `proc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveProcedure(newProc, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao salvar procedimento no servidor' };
      }
    }
    this.procedures = [newProc, ...this.procedures];
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures, this.activeTenantId);
    this.log(
      'CRIACAO_PROCEDIMENTO',
      'PROCEDURE',
      newProc.id,
      `Procedimento "${newProc.name}" (${newProc.category}) cadastrado com preço de tabela R$ ${newProc.defaultPrice.toFixed(2)}.`
    );
    this.notify();
    return { success: true, procedure: newProc };
  }
  public addProcedure(procData: Omit<DentalProcedure, 'id'>): DentalProcedure {
    const defaultPriceVal = procData.defaultPrice ?? procData.suggestedPrice ?? 0;
    const newProc: DentalProcedure = {
      ...procData,
      defaultPrice: defaultPriceVal,
      id: `proc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.procedures = [newProc, ...this.procedures];
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures, this.activeTenantId);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveProcedure(newProc, this.activeTenantId).catch(console.warn);
    }
    this.log(
      'CRIACAO_PROCEDIMENTO',
      'PROCEDURE',
      newProc.id,
      `Procedimento "${newProc.name}" (${newProc.category}) cadastrado com preço de tabela R$ ${(newProc.defaultPrice ?? 0).toFixed(2)}.`
    );
    this.notify();
    return newProc;
  }

  public async updateProcedureAsync(id: string, updates: Partial<DentalProcedure>): Promise<{ success: boolean; procedure?: DentalProcedure; error?: string }> {
    const found = this.procedures.find((p) => p.id === id);
    if (!found) return { success: false, error: 'Procedimento não encontrado' };
    const updated: DentalProcedure = { ...found, ...updates };
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveProcedure(updated, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao atualizar procedimento no servidor' };
      }
    }
    this.procedures = this.procedures.map((p) => (p.id === id ? updated : p));
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures, this.activeTenantId);
    this.log('ATUALIZACAO_PROCEDIMENTO', 'PROCEDURE', id, `Procedimento "${updated.name}" atualizado.`);
    this.notify();
    return { success: true, procedure: updated };
  }

  public updateProcedure(id: string, updates: Partial<DentalProcedure>): DentalProcedure | null {
    let updated: DentalProcedure | null = null;
    this.procedures = this.procedures.map((p) => {
      if (p.id === id) {
        updated = { ...p, ...updates };
        return updated;
      }
      return p;
    });
    if (updated) {
      saveItem(STORAGE_KEYS.PROCEDURES, this.procedures, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveProcedure(updated, this.activeTenantId).catch(console.warn);
      }
      this.log('ATUALIZACAO_PROCEDIMENTO', 'PROCEDURE', id, `Procedimento "${(updated as DentalProcedure).name}" atualizado.`);
      this.notify();
    }
    return updated;
  }

  public async deleteProcedureAsync(id: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.deleteProcedure(id, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao excluir procedimento no servidor' };
      }
    }
    this.procedures = this.procedures.filter((p) => p.id !== id);
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures, this.activeTenantId);
    this.log('EXCLUSAO_PROCEDIMENTO', 'PROCEDURE', id, `Procedimento excluído do catálogo.`);
    this.notify();
    return { success: true };
  }

  public deleteProcedure(id: string): boolean {
    this.deleteProcedureAsync(id).catch(console.warn);
    this.procedures = this.procedures.filter((p) => p.id !== id);
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures, this.activeTenantId);
    this.notify();
    return true;
  }

  public batchDeleteProcedures(ids: string[]): number {
    const idSet = new Set(ids);
    const prevLen = this.procedures.length;
    this.procedures = this.procedures.filter((p) => !idSet.has(p.id));
    const count = prevLen - this.procedures.length;
    if (count > 0) {
      saveItem(STORAGE_KEYS.PROCEDURES, this.procedures);
      this.log('EXCLUSAO_PROCEDIMENTO_LOTE', 'PROCEDURE', 'batch', `${count} procedimentos excluídos em lote.`);
      this.notify();
    }
    return count;
  }

  public resetProceduresToDemo() {
    this.procedures = DEMO_PROCEDURES;
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures);
    this.log('RESET_PROCEDIMENTOS', 'PROCEDURE', 'all', `Catálogo de procedimentos restaurado para os padrões clínicos.`);
    this.notify();
  }

  // Clinical Inputs Actions (Catálogo de Insumos & Materiais Clínicos)
  public getClinicalInputs(): ClinicalInput[] {
    return this.clinicalInputs;
  }

  public async addClinicalInputAsync(data: Omit<ClinicalInput, 'id'>): Promise<{ success: boolean; input?: ClinicalInput; error?: string }> {
    const newInput: ClinicalInput = {
      ...data,
      id: `inp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveClinicalInput(newInput, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao salvar insumo no servidor' };
      }
    }
    this.clinicalInputs = [newInput, ...this.clinicalInputs];
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs, this.activeTenantId);
    this.log(
      'CRIACAO_INSUMO',
      'EXPENSE',
      newInput.id,
      `Insumo "${newInput.name}" (${newInput.usageUnit}) cadastrado. Custo: R$ ${newInput.unitCost.toFixed(3)}/${newInput.usageUnit}.`
    );
    this.notify();
    return { success: true, input: newInput };
  }

  public addClinicalInput(data: Omit<ClinicalInput, 'id'>): ClinicalInput {
    const newInput: ClinicalInput = {
      ...data,
      id: `inp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.clinicalInputs = [newInput, ...this.clinicalInputs];
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs, this.activeTenantId);
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveClinicalInput(newInput, this.activeTenantId).catch(console.warn);
    }
    this.log(
      'CRIACAO_INSUMO',
      'EXPENSE',
      newInput.id,
      `Insumo "${newInput.name}" (${newInput.usageUnit}) cadastrado. Custo: R$ ${newInput.unitCost.toFixed(3)}/${newInput.usageUnit}.`
    );
    this.notify();
    return newInput;
  }

  public async updateClinicalInputAsync(id: string, updates: Partial<ClinicalInput>): Promise<{ success: boolean; input?: ClinicalInput; error?: string }> {
    const found = this.clinicalInputs.find((i) => i.id === id);
    if (!found) return { success: false, error: 'Insumo não encontrado' };
    const updated: ClinicalInput = { ...found, ...updates };
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveClinicalInput(updated, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao atualizar insumo no servidor' };
      }
    }
    this.clinicalInputs = this.clinicalInputs.map((item) => (item.id === id ? updated : item));
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs, this.activeTenantId);
    this.log('ATUALIZACAO_INSUMO', 'EXPENSE', id, `Insumo "${updated.name}" atualizado.`);
    this.notify();
    return { success: true, input: updated };
  }

  public updateClinicalInput(id: string, updates: Partial<ClinicalInput>): ClinicalInput | null {
    let updated: ClinicalInput | null = null;
    this.clinicalInputs = this.clinicalInputs.map((item) => {
      if (item.id === id) {
        updated = { ...item, ...updates };
        return updated;
      }
      return item;
    });

    if (updated) {
      saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs, this.activeTenantId);
      if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
        SupabaseService.saveClinicalInput(updated, this.activeTenantId).catch(console.warn);
      }
      this.log('ATUALIZACAO_INSUMO', 'EXPENSE', id, `Insumo "${(updated as ClinicalInput).name}" atualizado.`);
      this.notify();
    }
    return updated;
  }

  public async deleteClinicalInputAsync(id: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.deleteClinicalInput(id, this.activeTenantId);
      if (!res.success) {
        return { success: false, error: res.error || 'Erro ao excluir insumo no servidor' };
      }
    }
    this.clinicalInputs = this.clinicalInputs.filter((item) => item.id !== id);
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs, this.activeTenantId);
    this.log('EXCLUSAO_INSUMO', 'EXPENSE', id, `Insumo excluído do catálogo.`);
    this.notify();
    return { success: true };
  }

  public deleteClinicalInput(id: string): boolean {
    this.deleteClinicalInputAsync(id).catch(console.warn);
    this.clinicalInputs = this.clinicalInputs.filter((item) => item.id !== id);
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs, this.activeTenantId);
    this.notify();
    return true;
  }

  public batchDeleteClinicalInputs(ids: string[]): number {
    const idSet = new Set(ids);
    const prevLen = this.clinicalInputs.length;
    this.clinicalInputs = this.clinicalInputs.filter((item) => !idSet.has(item.id));
    const count = prevLen - this.clinicalInputs.length;
    if (count > 0) {
      saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs);
      this.log('EXCLUSAO_INSUMO_LOTE', 'EXPENSE', 'batch', `${count} insumos excluídos em lote.`);
      this.notify();
    }
    return count;
  }

  public resetClinicalInputsToDemo() {
    this.clinicalInputs = DEMO_CLINICAL_INPUTS;
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs);
    this.log('RESET_INSUMOS', 'EXPENSE', 'all', `Catálogo de insumos restaurado para a tabela padrão.`);
    this.notify();
  }

  // Category Actions
  public addCategory(cat: Omit<ExpenseCategory, 'id'>): ExpenseCategory {
    const newCat: ExpenseCategory = {
      ...cat,
      id: `cat_${Date.now()}`,
    };
    this.categories = [...this.categories, newCat];
    saveItem(STORAGE_KEYS.CATEGORIES, this.categories);
    this.log('CRIACAO_CATEGORIA', 'CATEGORY', newCat.id, `Categoria ${newCat.name} adicionada ao Plano de Contas.`);
    this.notify();
    return newCat;
  }

  public updateCategory(id: string, updates: Partial<ExpenseCategory>) {
    this.categories = this.categories.map((c) => (c.id === id ? { ...c, ...updates } : c));
    saveItem(STORAGE_KEYS.CATEGORIES, this.categories);
    this.log('ATUALIZACAO_CATEGORIA', 'CATEGORY', id, `Classificação ou atributos da categoria alterados.`);
    this.notify();
  }

  public resetChartOfAccounts(): ExpenseCategory[] {
    this.categories = [...INITIAL_CHART_OF_ACCOUNTS];
    saveItem(STORAGE_KEYS.CATEGORIES, this.categories);
    this.log(
      'RESET_PLANO_CONTAS',
      'CATEGORY',
      'all',
      'Plano de contas padronizado restaurado com todas as categorias e grupos operacionais descritivos.'
    );
    this.notify();
    return this.categories;
  }

  // Payroll Actions
  public updatePayrollHistory(entries: PayrollHistoryEntry[]) {
    this.payrollHistory = entries;
    saveItem(STORAGE_KEYS.PAYROLL_HISTORY, this.payrollHistory);
    this.log('ATUALIZACAO_FOLHA', 'PAYROLL', 'all', `Histórico de folha de salários atualizado.`);
    this.notify();
  }

  // Initial Fiscal History (12 meses anteriores para apuração do Simples Nacional)
  public getInitialFiscalHistory(): MonthlyFiscalHistoryEntry[] {
    return this.professional.initialFiscalHistory || [];
  }

  public saveInitialFiscalTotal(
    rbt12: number,
    fs12: number,
    proLabore: number,
    competence: string
  ): void {
    const refCompetence =
      competence ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const existingSnapshots = this.professional.fiscalSnapshots || [];
    const newSnapshot: FiscalTotalSnapshot = {
      competence: refCompetence,
      rbt12,
      fs12,
      proLaboreMensal: proLabore,
      sourceType: 'MANUAL_TOTAL',
      updatedAt: new Date().toISOString(),
    };

    const filtered = existingSnapshots.filter((s) => s.competence !== refCompetence);
    const updatedSnapshots = [...filtered, newSnapshot].sort((a, b) =>
      a.competence.localeCompare(b.competence)
    );

    const updatedProf: Professional = {
      ...this.professional,
      rbt12Inicial: rbt12,
      folha12MesesInicial: fs12,
      proLaboreMensal: proLabore,
      fiscalSourceType: 'MANUAL_TOTAL',
      fiscalSnapshots: updatedSnapshots,
      baselineConfigured: true,
    };

    this.professional = updatedProf;
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional, this.activeTenantId);
    this.log(
      'CONFIGURACAO_TOTAL_CONSOLIDADO',
      'PROFESSIONAL',
      this.professional.id,
      `Bases fiscais em modo Total Consolidado configuradas para ${refCompetence}: RBT12 R$ ${rbt12.toFixed(2)}, FS12 R$ ${fs12.toFixed(2)}, Pró-labore R$ ${proLabore.toFixed(2)}.`
    );
    this.notify();

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveProfessional(updatedProf, this.activeTenantId).catch(console.warn);
    }
  }

  public async saveInitialFiscalTotalAsync(
    rbt12: number,
    fs12: number,
    proLabore: number,
    competence: string
  ): Promise<{ success: boolean; error?: string }> {
    const previous = { ...this.professional };
    this.saveInitialFiscalTotal(rbt12, fs12, proLabore, competence);

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveProfessional(this.professional, this.activeTenantId);
      if (!res.success) {
        this.professional = previous;
        saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional, this.activeTenantId);
        this.notify();
        return { success: false, error: res.error || 'Erro ao persistir bases fiscais no servidor' };
      }
    }
    return { success: true };
  }

  public saveInitialFiscalHistory(entries: MonthlyFiscalHistoryEntry[], competence?: string): void {
    const totalRbt12 = entries.reduce((sum, e) => sum + (e.cnpjRevenue || 0), 0);
    const totalFs12 = entries.reduce((sum, e) => sum + (e.payroll || 0), 0);
    const refCompetence =
      competence ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const existingSnapshots = this.professional.fiscalSnapshots || [];
    const newSnapshot: FiscalTotalSnapshot = {
      competence: refCompetence,
      rbt12: totalRbt12,
      fs12: totalFs12,
      sourceType: 'MANUAL_MONTHLY',
      updatedAt: new Date().toISOString(),
    };
    const filtered = existingSnapshots.filter((s) => s.competence !== refCompetence);
    const updatedSnapshots = [...filtered, newSnapshot].sort((a, b) =>
      a.competence.localeCompare(b.competence)
    );

    const updatedProf: Professional = {
      ...this.professional,
      initialFiscalHistory: entries,
      rbt12Inicial: totalRbt12,
      folha12MesesInicial: totalFs12,
      fiscalSourceType: 'MANUAL_MONTHLY',
      fiscalSnapshots: updatedSnapshots,
      baselineConfigured: true,
    };

    this.professional = updatedProf;
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional, this.activeTenantId);
    this.log(
      'CONFIGURACAO_HISTORICO_FISCAL',
      'PROFESSIONAL',
      this.professional.id,
      `Histórico fiscal inicial dos 12 meses configurado: RBT12 R$ ${totalRbt12.toFixed(2)}, FS12 R$ ${totalFs12.toFixed(2)}.`
    );
    this.notify();

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveProfessional(updatedProf, this.activeTenantId).catch(console.warn);
    }
  }

  public async saveInitialFiscalHistoryAsync(
    entries: MonthlyFiscalHistoryEntry[],
    competence?: string
  ): Promise<{ success: boolean; error?: string }> {
    const previous = { ...this.professional };
    this.saveInitialFiscalHistory(entries, competence);

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveProfessional(this.professional, this.activeTenantId);
      if (!res.success) {
        this.professional = previous;
        saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional, this.activeTenantId);
        this.notify();
        return { success: false, error: res.error || 'Erro ao persistir histórico fiscal no servidor' };
      }
    }
    return { success: true };
  }

  public switchFiscalMode(newMode: FiscalSourceType, hasValidSnapshots = false): void {
    const updated: Professional = {
      ...this.professional,
      fiscalSourceType: newMode,
      baselineConfigured: newMode === 'CONTABILEX' ? hasValidSnapshots : this.professional.baselineConfigured,
    };
    this.professional = updated;
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional, this.activeTenantId);
    this.log(
      'ALTERACAO_MODO_FISCAL',
      'PROFESSIONAL',
      this.professional.id,
      `Modo de origem das bases fiscais alterado para ${newMode}.`
    );
    this.notify();

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.saveProfessional(updated, this.activeTenantId).catch(console.warn);
    }
  }

  public async switchFiscalModeAsync(newMode: FiscalSourceType, hasValidSnapshots = false): Promise<{ success: boolean; error?: string }> {
    const previous = { ...this.professional };
    this.switchFiscalMode(newMode, hasValidSnapshots);

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const res = await SupabaseService.saveProfessional(this.professional, this.activeTenantId);
      if (!res.success) {
        this.professional = previous;
        saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional, this.activeTenantId);
        this.notify();
        return { success: false, error: res.error || 'Erro ao persistir alteração no servidor' };
      }
    }
    return { success: true };
  }

  public setZeroFiscalHistory(referenceYearMonth: string): void {
    const [yStr, mStr] = (referenceYearMonth || '2026-03').split('-');
    const refYear = parseInt(yStr, 10) || new Date().getFullYear();
    const refMonth = parseInt(mStr, 10) || (new Date().getMonth() + 1);

    const zeroEntries: MonthlyFiscalHistoryEntry[] = [];
    for (let i = 12; i >= 1; i--) {
      let m = refMonth - i;
      let y = refYear;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      zeroEntries.push({
        month: `${y}-${String(m).padStart(2, '0')}`,
        cnpjRevenue: 0,
        payroll: 0,
      });
    }

    this.saveInitialFiscalHistory(zeroEntries, referenceYearMonth);
  }

  // Monthly Payroll per Competence
  public getMonthlyPayroll(monthStr: string): PayrollHistoryEntry | undefined {
    return this.payrollHistory.find((p) => p.month === monthStr);
  }

  public upsertMonthlyPayroll(entry: PayrollHistoryEntry): void {
    const totalPayroll =
      typeof entry.totalPayroll === 'number'
        ? entry.totalPayroll
        : (entry.salaries || 0) + (entry.charges || 0) + (entry.proLabore || 0);
    const normalizedEntry: PayrollHistoryEntry = { ...entry, totalPayroll };

    const idx = this.payrollHistory.findIndex((p) => p.month === normalizedEntry.month);
    if (idx >= 0) {
      this.payrollHistory[idx] = normalizedEntry;
    } else {
      this.payrollHistory.push(normalizedEntry);
      this.payrollHistory.sort((a, b) => a.month.localeCompare(b.month));
    }
    saveItem(STORAGE_KEYS.PAYROLL_HISTORY, this.payrollHistory, this.activeTenantId);
    this.log(
      'UPSERT_FOLHA_MENSAL',
      'PAYROLL',
      normalizedEntry.month,
      `Folha da competência ${normalizedEntry.month} registrada/atualizada no total de R$ ${normalizedEntry.totalPayroll.toFixed(2)}.`
    );
    this.notify();

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      SupabaseService.savePayrollEntry(normalizedEntry, this.activeTenantId).catch(console.warn);
    }
  }

  public async upsertMonthlyPayrollAsync(
    entry: PayrollHistoryEntry
  ): Promise<{ success: boolean; error?: string }> {
    const previous = [...this.payrollHistory];
    this.upsertMonthlyPayroll(entry);

    if (!this.isDemoMode && this.activeTenantId !== 'tenant_demo') {
      const normalizedEntry = this.payrollHistory.find((p) => p.month === entry.month) || entry;
      const res = await SupabaseService.savePayrollEntry(normalizedEntry, this.activeTenantId);
      if (!res.success) {
        this.payrollHistory = previous;
        saveItem(STORAGE_KEYS.PAYROLL_HISTORY, this.payrollHistory, this.activeTenantId);
        this.notify();
        return { success: false, error: res.error || 'Erro ao persistir folha no servidor' };
      }
    }
    return { success: true };
  }

  // Appointment Actions
  public getAppointments(): Appointment[] {
    return [...this.appointments];
  }

  public getAppointmentById(id: string): Appointment | undefined {
    return this.appointments.find((apt) => apt.id === id);
  }

  public addAppointment(
    appointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt' | 'dentistName'> & {
      dentistName?: string;
      price?: number;
      autoCreateSale?: boolean;
    }
  ): Appointment {
    const now = new Date().toISOString();
    const aptId = `apt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Bloqueio rigoroso de sobreposição de horários (conflito de consultas)
    const newStartMin = appointmentData.startTime ? (Number(appointmentData.startTime.split(':')[0]) * 60 + Number(appointmentData.startTime.split(':')[1])) : 0;
    const newEndMin = appointmentData.endTime ? (Number(appointmentData.endTime.split(':')[0]) * 60 + Number(appointmentData.endTime.split(':')[1])) : 0;

    const conflict = this.appointments.find((a) => {
      if (a.date !== appointmentData.date) return false;
      if (a.status === 'CANCELADA') return false;
      if (appointmentData.dentistName && a.dentistName && a.dentistName !== appointmentData.dentistName) return false;
      const aStartMin = a.startTime ? (Number(a.startTime.split(':')[0]) * 60 + Number(a.startTime.split(':')[1])) : 0;
      const aEndMin = a.endTime ? (Number(a.endTime.split(':')[0]) * 60 + Number(a.endTime.split(':')[1])) : 0;
      return newStartMin < aEndMin && newEndMin > aStartMin;
    });

    if (conflict) {
      throw new Error(
        `Conflito de horário! Já existe uma consulta de ${conflict.patientName} (${conflict.procedureName}) agendada das ${conflict.startTime} às ${conflict.endTime}.`
      );
    }

    // Auto-create linked sale if procedure & patient are present and autoCreateSale !== false
    let linkedSaleId: string | undefined = appointmentData.saleId;
    const shouldCreateSale =
      appointmentData.autoCreateSale !== false &&
      Boolean(appointmentData.procedureName && appointmentData.patientName) &&
      !linkedSaleId;

    if (shouldCreateSale) {
      const proc = this.procedures.find(
        (p) =>
          (appointmentData.procedureId && p.id === appointmentData.procedureId) ||
          p.name.trim().toLowerCase() === (appointmentData.procedureName || '').trim().toLowerCase()
      );
      const procId = appointmentData.procedureId || proc?.id;
      const saleVal = Number(appointmentData.price || proc?.defaultPrice || 150);
      linkedSaleId = `sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const installmentId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const newSale: Sale = {
        id: linkedSaleId,
        orgId: appointmentData.orgId || this.org?.id || `org_${this.activeTenantId}`,
        taxOrigin: 'CPF',
        patientId: appointmentData.patientId,
        patientName: appointmentData.patientName,
        patientCpf: appointmentData.patientCpf || '',
        payerIsBeneficiary: true,
        procedureId: procId,
        procedureName: appointmentData.procedureName,
        description: '', // NUNCA gerar observações automáticas como 'Atendimento Clínico - Canal'
        totalValue: saleVal,
        serviceDate: appointmentData.date,
        paymentMethod: 'PIX',
        installmentsCount: 1,
        installments: [
          {
            id: installmentId,
            saleId: linkedSaleId,
            installmentNumber: 1,
            totalInstallments: 1,
            value: saleVal,
            dueDate: appointmentData.date,
            status: 'A_RECEBER',
            receitaSaudeStatus: 'A_EMITIR',
          },
        ],
        notes: appointmentData.notes?.trim() || '',
        appointmentId: aptId,
        origin: 'AGENDA',
        originalEstimatedValue: saleVal,
        createdAt: now,
      };

      this.sales = [newSale, ...this.sales];
      saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
      SupabaseService.saveSale(newSale, this.activeTenantId).catch(console.error);
    }

    const matchedProc = this.procedures.find(
      (p) =>
        (appointmentData.procedureId && p.id === appointmentData.procedureId) ||
        p.name.trim().toLowerCase() === (appointmentData.procedureName || '').trim().toLowerCase()
    );

    const newAppointment: Appointment = {
      dentistName: appointmentData.dentistName || (appointmentData as any).professionalName || 'Dr(a). Dentista',
      status: appointmentData.status || 'PENDENTE',
      ...appointmentData,
      procedureId: appointmentData.procedureId || matchedProc?.id,
      id: aptId,
      saleId: linkedSaleId,
      createdAt: now,
      updatedAt: now,
    };
    this.appointments = [newAppointment, ...this.appointments];
    saveItem(STORAGE_KEYS.APPOINTMENTS, this.appointments, this.activeTenantId);
    SupabaseService.saveAppointment(newAppointment, this.activeTenantId).catch(console.error);
    this.log(
      'CRIACAO_AGENDAMENTO',
      'APPOINTMENT',
      newAppointment.id,
      `Consulta agendada para ${newAppointment.patientName} em ${newAppointment.date} às ${newAppointment.startTime}.`
    );
    this.notify();
    return newAppointment;
  }

  public updateAppointment(id: string, updates: Partial<Appointment> & { price?: number }): boolean {
    const existing = this.appointments.find((a) => a.id === id);
    if (!existing) return false;

    const targetDate = updates.date || existing.date;
    const targetStart = updates.startTime || existing.startTime;
    const targetEnd = updates.endTime || existing.endTime;
    const targetDentist = updates.dentistName || existing.dentistName;
    const targetStatus = updates.status || existing.status;

    if (targetStatus !== 'CANCELADA' && (updates.startTime || updates.endTime || updates.date)) {
      const newStartMin = targetStart ? (Number(targetStart.split(':')[0]) * 60 + Number(targetStart.split(':')[1])) : 0;
      const newEndMin = targetEnd ? (Number(targetEnd.split(':')[0]) * 60 + Number(targetEnd.split(':')[1])) : 0;

      const conflict = this.appointments.find((a) => {
        if (a.id === id) return false;
        if (a.date !== targetDate) return false;
        if (a.status === 'CANCELADA') return false;
        if (targetDentist && a.dentistName && a.dentistName !== targetDentist) return false;
        const aStartMin = a.startTime ? (Number(a.startTime.split(':')[0]) * 60 + Number(a.startTime.split(':')[1])) : 0;
        const aEndMin = a.endTime ? (Number(a.endTime.split(':')[0]) * 60 + Number(a.endTime.split(':')[1])) : 0;
        return newStartMin < aEndMin && newEndMin > aStartMin;
      });

      if (conflict) {
        throw new Error(
          `Conflito de horário! Já existe uma consulta de ${conflict.patientName} (${conflict.procedureName}) agendada das ${conflict.startTime} às ${conflict.endTime}.`
        );
      }
    }

    let affected = false;
    let targetApt: Appointment | undefined;

    this.appointments = this.appointments.map((apt) => {
      if (apt.id !== id) return apt;
      affected = true;
      const { price, ...restUpdates } = updates;
      targetApt = {
        ...apt,
        ...restUpdates,
        updatedAt: new Date().toISOString(),
      };
      return targetApt;
    });

    if (affected && targetApt) {
      saveItem(STORAGE_KEYS.APPOINTMENTS, this.appointments, this.activeTenantId);
      SupabaseService.saveAppointment(targetApt, this.activeTenantId).catch(console.error);

      // Sincronizar venda vinculada se existir
      if (targetApt.saleId) {
        const sale = this.sales.find((s) => s.id === targetApt!.saleId);
        if (sale) {
          const newPrice = updates.price !== undefined ? updates.price : sale.totalValue;
          const origValue = sale.originalEstimatedValue ?? sale.totalValue;
          let newPriceHistory = sale.priceHistory || [];
          if (updates.price !== undefined && updates.price !== sale.totalValue) {
            newPriceHistory = [
              ...newPriceHistory,
              {
                date: new Date().toISOString(),
                from: sale.totalValue,
                to: newPrice,
                note: `Reajuste pós-atendimento (${sale.procedureName})`,
              },
            ];
          }

          const updatedSale: Sale = {
            ...sale,
            patientName: updates.patientName ?? sale.patientName,
            patientId: updates.patientId ?? sale.patientId,
            patientCpf: updates.patientCpf ?? sale.patientCpf,
            procedureName: updates.procedureName ?? sale.procedureName,
            procedureId: updates.procedureId ?? sale.procedureId,
            notes: updates.notes ?? sale.notes,
            serviceDate: updates.date ?? sale.serviceDate,
            totalValue: newPrice,
            originalEstimatedValue: origValue,
            priceHistory: newPriceHistory,
            installments: sale.installments.map((inst) =>
              inst.status === 'A_RECEBER'
                ? {
                    ...inst,
                    dueDate: updates.date ?? inst.dueDate,
                    value: newPrice,
                  }
                : inst
            ),
          };
          this.sales = this.sales.map((s) => (s.id === updatedSale.id ? updatedSale : s));
          saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
          SupabaseService.saveSale(updatedSale, this.activeTenantId).catch(console.error);
        }
      }

      this.log('ATUALIZACAO_AGENDAMENTO', 'APPOINTMENT', id, `Agendamento ${id} atualizado.`);
      this.notify();
      return true;
    }
    return false;
  }

  public updateAppointmentStatus(id: string, status: AppointmentStatus): boolean {
    return this.updateAppointment(id, { status });
  }

  public deleteAppointment(id: string): boolean {
    const apt = this.appointments.find((a) => a.id === id);
    const prevLen = this.appointments.length;
    this.appointments = this.appointments.filter((a) => a.id !== id);
    if (this.appointments.length !== prevLen) {
      saveItem(STORAGE_KEYS.APPOINTMENTS, this.appointments, this.activeTenantId);
      SupabaseService.deleteAppointment(id, this.activeTenantId).catch(console.error);

      // Se havia venda vinculada ainda em aberto (não recebida), remove do financeiro
      if (apt?.saleId) {
        const sale = this.sales.find((s) => s.id === apt.saleId);
        const hasReceived = sale?.installments.some((i) => i.status === 'RECEBIDO');
        if (sale && !hasReceived) {
          this.sales = this.sales.filter((s) => s.id !== apt.saleId);
          saveItem(STORAGE_KEYS.SALES, this.sales, this.activeTenantId);
          SupabaseService.deleteSale(apt.saleId, this.activeTenantId).catch(console.error);
        }
      }

      this.log('EXCLUSAO_AGENDAMENTO', 'APPOINTMENT', id, `Agendamento excluído da agenda.`);
      this.notify();
      return true;
    }
    return false;
  }

  public resetAppointmentsToDemo() {
    this.appointments = DEMO_APPOINTMENTS;
    saveItem(STORAGE_KEYS.APPOINTMENTS, this.appointments);
    this.log('RESET_AGENDAMENTOS', 'APPOINTMENT', 'all', `Agenda restaurada para os dados demonstrativos.`);
    this.notify();
  }

  public getSalePaymentSummary(saleId: string): SalePaymentSummary | null {
    const sale = this.sales.find((s) => s.id === saleId);
    if (!sale) return null;
    return getSalePaymentSummary(sale);
  }

  // Test Runner / Reset to Demo
  public resetToDemo() {
    this.org = DEMO_ORGANIZATION;
    this.user = DEMO_USER;
    this.professional = DEMO_PROFESSIONAL;
    this.patients = DEMO_PATIENTS;
    const curYear = new Date().getFullYear();
    let augmented = augmentYearlyDataset(DEMO_SALES, DEMO_EXPENSES, curYear);
    if (curYear !== 2025) {
      augmented = augmentYearlyDataset(augmented.sales, augmented.expenses, 2025);
    }
    this.sales = augmented.sales;
    this.expenses = augmented.expenses;
    this.categories = INITIAL_CHART_OF_ACCOUNTS;
    this.bankAccounts = DEMO_BANK_ACCOUNTS;
    this.payrollHistory = DEMO_PAYROLL_HISTORY;
    this.taxRulesPf = DEFAULT_TAX_RULES_PF;
    this.taxRulesSimples = DEFAULT_TAX_RULES_SIMPLES;
    this.procedures = DEMO_PROCEDURES;
    this.clinicalInputs = DEMO_CLINICAL_INPUTS;
    this.appointments = DEMO_APPOINTMENTS;

    saveItem(STORAGE_KEYS.ORGANIZATION, this.org);
    saveItem(STORAGE_KEYS.USER, this.user);
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional);
    saveItem(STORAGE_KEYS.PATIENTS, this.patients);
    saveItem(STORAGE_KEYS.SALES, this.sales);
    saveItem(STORAGE_KEYS.EXPENSES, this.expenses);
    saveItem(STORAGE_KEYS.CATEGORIES, this.categories);
    saveItem(STORAGE_KEYS.BANK_ACCOUNTS, this.bankAccounts);
    saveItem(STORAGE_KEYS.PAYROLL_HISTORY, this.payrollHistory);
    saveItem(STORAGE_KEYS.TAX_RULES_PF, this.taxRulesPf);
    saveItem(STORAGE_KEYS.TAX_RULES_SIMPLES, this.taxRulesSimples);
    saveItem(STORAGE_KEYS.PROCEDURES, this.procedures);
    saveItem(STORAGE_KEYS.CLINICAL_INPUTS, this.clinicalInputs);
    saveItem(STORAGE_KEYS.APPOINTMENTS, this.appointments);

    this.log('RESET_DEMO', 'SYSTEM', 'all', 'Dados de demonstração restaurados para estado padrão.');
    this.notify();
  }

  // Scenario quick toggles for section 18 mandatory testing:
  public setFatorRScenario(above28: boolean) {
    if (above28) {
      // Set folha to 84k with RBT12 280k -> 30% (Anexo III)
      this.professional.folha12MesesInicial = 84000;
      this.professional.rbt12Inicial = 280000;
      this.payrollHistory = this.payrollHistory.map((p) => ({
        ...p,
        totalPayroll: 7000,
      }));
    } else {
      // Set folha to 42k with RBT12 280k -> 15% (Anexo V)
      this.professional.folha12MesesInicial = 42000;
      this.professional.rbt12Inicial = 280000;
      this.payrollHistory = this.payrollHistory.map((p) => ({
        ...p,
        totalPayroll: 3500,
        proLabore: 2000,
      }));
    }
    saveItem(STORAGE_KEYS.PROFESSIONAL, this.professional);
    saveItem(STORAGE_KEYS.PAYROLL_HISTORY, this.payrollHistory);
    this.log(
      'CENARIO_TESTE_FATOR_R',
      'SIMPLES',
      above28 ? 'ANEXO_III' : 'ANEXO_V',
      `Cenário alterado para Fator R ${above28 ? '>= 28% (Anexo III)' : '< 28% (Anexo V)'}.`
    );
    this.notify();
  }
}

export function getSalePaymentSummary(sale: Sale): SalePaymentSummary {
  const installments = sale.installments || [];
  const totalValue = sale.totalValue || installments.reduce((acc, i) => acc + (i.value || 0), 0);

  let receivedValue = 0;
  let receivedCount = 0;
  let overdueCount = 0;
  let pendingCount = 0;
  let nextDueDate: string | undefined;
  let lastPaymentDate: string | undefined;

  const todayStr = new Date().toISOString().split('T')[0];

  installments.forEach((inst) => {
    const isPaid = inst.status === 'RECEBIDO';
    if (isPaid) {
      const rec = inst.amountReceived ?? inst.value;
      receivedValue += rec;
      receivedCount++;
      if (inst.paymentDate) {
        if (!lastPaymentDate || inst.paymentDate > lastPaymentDate) {
          lastPaymentDate = inst.paymentDate;
        }
      }
    } else if (inst.status === 'CANCELADO') {
      // ignore
    } else {
      pendingCount++;
      if (inst.dueDate < todayStr) {
        overdueCount++;
      }
      if (!nextDueDate || inst.dueDate < nextDueDate) {
        nextDueDate = inst.dueDate;
      }
    }
  });

  const pendingValue = Math.max(0, totalValue - receivedValue);

  let overallStatus: SaleOverallPaymentStatus = 'PENDENTE';
  const nonCancelledInstallments = installments.filter((i) => i.status !== 'CANCELADO');

  if (installments.length > 0 && nonCancelledInstallments.length === 0) {
    overallStatus = 'CANCELADA';
  } else if (nonCancelledInstallments.length > 0 && receivedCount === nonCancelledInstallments.length) {
    overallStatus = 'TOTALMENTE_RECEBIDA';
  } else if (receivedCount > 0 || receivedValue > 0) {
    overallStatus = 'PARCIALMENTE_RECEBIDA';
  } else if (overdueCount > 0) {
    overallStatus = 'VENCIDA';
  } else {
    overallStatus = 'PENDENTE';
  }

  return {
    overallStatus,
    status: overallStatus,
    totalValue,
    receivedValue,
    pendingValue,
    totalInstallments: installments.length,
    receivedInstallments: receivedCount,
    receivedCount,
    pendingInstallments: pendingCount,
    pendingCount,
    overdueInstallments: overdueCount,
    nextDueDate,
    lastPaymentDate,
  };
}

export const db = DentalFinanceDB.getInstance();
