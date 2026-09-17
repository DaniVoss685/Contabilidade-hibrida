// Types for Dental Finance - Hybrid Tax & Financial SaaS for Brazilian Dentists

export type TaxOrigin = 'CPF' | 'CNPJ';
export type ExpenseEntity = 'CPF' | 'CNPJ';

export type InstallmentStatus = 'A_RECEBER' | 'RECEBIDO' | 'VENCIDO' | 'EM_ATRASO' | 'CANCELADO';
export type ReceivableOverallStatus = 'A_VENCER' | 'VENCIDO' | 'EM_ATRASO' | 'RECEBIDO' | 
  'PARCIALMENTE_RECEBIDO' | 'CANCELADO';

export type ReceitaSaudeStatus = 'A_EMITIR' | 'EMITIDO' | 'CANCELADO';
export type NfseStatus = 'A_EMITIR' | 'EMITIDA' | 'CANCELADA';

export type LivroCaixaPfDedutibilidade = 'SIM' | 'NAO' | 'CONDICIONAL';
export type SimplesNacionalAnexo = 'ANEXO_III' | 'ANEXO_V';

export type PaymentMethod = 
  | 'PIX'
  | 'CARTAO_CREDITO'
  | 'CARTAO_DEBITO'
  | 'BOLETO'
  | 'DINHEIRO'
  | 'TRANSFERENCIA';

// 1. Organization, Clinic Tenant, User & Auth
export type UserRole =
  | 'OWNER'
  | 'ADMIN'
  | 'PROFESSIONAL'
  | 'DENTIST'
  | 'RECEPTION'
  | 'ASSISTANT'
  | 'PLATFORM_ADMIN'
  | 'SUPER_ADMIN';

export interface ClinicTenant {
  id: string; // e.g. "tenant_demo" or "clinic_uuid"
  name: string;
  tradeName?: string;
  cro: string;
  croUf: string;
  cpfCnpj?: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  city?: string;
  uf?: string;
  isDemo?: boolean;
  isActive?: boolean;
  isTest?: boolean;
  createdAt: string;
}

export interface DentalTenantOption {
  tenant_id: string;
  clinic_name: string;
  trade_name?: string;
  owner_name?: string;
  owner_email?: string;
  total_users: number;
  created_at: string;
}

export interface StoredUserAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash?: string; // Optional: Supabase Auth handles password hashes
  passwordSalt?: string;
  salt?: string;
  clinicId: string;
  clinicName?: string;
  authUserId?: string; // UUID in auth.users
  emailVerified?: boolean;
  isActive?: boolean;
  isPrimary?: boolean;
  createdAt: string;
}

export interface SupportSessionState {
  isSupportMode?: boolean;
  platformAdminId?: string;
  platformAdminName?: string;
  originalAdminUserId?: string;
  originalAdminName?: string;
  targetClinicId?: string;
  targetTenantId?: string;
  targetClinicName?: string;
  targetTenantName?: string;
  reason?: string;
  startedAt: string;
}

export type TenantAuthStatus =
  | 'AUTH_LOADING'
  | 'AUTHENTICATED_WITH_TENANT'
  | 'AUTHENTICATED_WITHOUT_TENANT'
  | 'UNAUTHENTICATED'
  | 'DEMO';

export interface AuthSession {
  token?: string;
  user: User;
  clinic: ClinicTenant;
  tenantId?: string;
  authUserId?: string;
  isDemo: boolean;
  createdAt?: string;
  expiresAt?: string;
  supportSession?: SupportSessionState | null;
}

export interface Organization {
  id: string;
  name: string; // e.g. "Clínica Odontológica Mendes"
  tradeName?: string;
  createdAt: string;
}

export interface User {
  id: string;
  orgId: string;
  name: string;
  email: string;
  role: UserRole;
  isPrimary?: boolean;
}

// 2. Professional (Dentist Profile & Tax Settings)
export interface Professional {
  id: string;
  orgId: string;
  name: string;
  cpf: string;
  cro: string;
  croUf: string;
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  municipio: string;
  regimeTributario: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO';
  optanteSimples: boolean;
  dataAbertura?: string;
  rbt12Inicial: number;
  folha12MesesInicial: number;
  proLaboreMensal: number;
  baselineConfigured?: boolean; // false para novos tenants até confirmação explícita
  fiscalSourceType?: FiscalSourceType; // 'MANUAL_TOTAL' | 'MANUAL_MONTHLY' | 'CONTABILEX' | 'ACCOUNTING_MANUAL'
  fiscalSnapshots?: FiscalTotalSnapshot[]; // Histórico de snapshots de totais informados
  contabilexClientId?: string; // ID interno futuro do cliente no Contábilex
  initialFiscalHistory?: MonthlyFiscalHistoryEntry[]; // Histórico mês a mês dos 12 meses anteriores
  phone?: string;
  email?: string;
  especialidade?: string;
  anexoPadrao?: 'III' | 'V';
  uf?: string;
  // PF Tax parameters
  numDependentes: number; // Dedução PF ~ R$ 189,59 cada
  inssProprioMensal: number; // Previdência oficial própria (dedutível no Carnê-Leão)
  outrosRendimentosTributaveis: number; // Rendimentos externos que somam na base
}

// 2.1 Modos de Origem das Bases Fiscais
export type FiscalSourceType = 'MANUAL_TOTAL' | 'MANUAL_MONTHLY' | 'CONTABILEX' | 'ACCOUNTING_MANUAL';

export interface FiscalTotalSnapshot {
  competence: string; // YYYY-MM de referência
  rbt12: number;
  fs12: number;
  proLaboreMensal?: number;
  sourceType: FiscalSourceType;
  updatedAt: string; // ISO 8601
}

// 2.2 Histórico Fiscal Mensal (12 meses anteriores para RBT12 e FS12)
export interface MonthlyFiscalHistoryEntry {
  month: string; // YYYY-MM
  cnpjRevenue: number; // Receita bruta PJ do mês
  payroll: number; // Folha de salários + encargos + pró-labore do mês
}

// 3. Patient & Payer
export interface Patient {
  id: string;
  orgId: string;
  name: string;
  cpf: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  notes?: string;
  createdAt: string;
}

export interface Payer {
  id: string;
  orgId: string;
  patientId: string;
  isSelf: boolean;
  name: string;
  cpf: string;
}

// 4. Procedures & Pricing (Precificação Odontológica)
export type InputUsageUnit = 'tubete' | 'ml' | 'g' | 'dose' | 'kit' | 'un';

export interface ClinicalInput {
  id: string;
  name: string;
  brand?: string;
  category: string; // Dentística, Biossegurança, Anestésicos, Cirurgia, Moldagem, Endodontia, Prótese, Implantodontia, Ortodontia, Geral
  
  // Embalagem de compra
  purchasePackageName: string; // Ex: "Caixa com 50 tubetes", "Frasco de 1 Litro (1000 ml)", "Seringa 4g"
  packageQuantity: number; // Quantidade de consumo contida na embalagem
  purchasePrice: number; // Preço pago na embalagem (R$)
  purchaseUnitType?: 'tubete' | 'L' | 'ml' | 'kg' | 'g' | 'dose' | 'kit' | 'un'; // Tipo de unidade da embalagem comprada
  
  // Unidade de aplicação e custo unitário
  usageUnit: InputUsageUnit; // 'tubete' | 'ml' | 'g' | 'dose' | 'kit' | 'un'
  unitCost: number; // Custo por unidade de consumo (calculado automaticamente por divisão)
  
  active: boolean;
  notes?: string;
  createdAt?: string;
}

export interface ProcedureInputItem {
  id: string;
  inputId?: string; // Vínculo com ClinicalInput, se selecionado do catálogo
  name: string;
  unit: string; // 'tubete', 'ml', 'g', 'dose', 'kit', 'un'
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface DentalProcedure {
  id: string;
  code: string;
  name: string;
  category: any; // Dentística, Endodontia, Cirurgia, Prótese, Periodontia, Ortodontia, Estética, Implantodontia, Preventiva, etc.
  description?: string;

  // Precificação / Custos
  clinicalDurationMinutes: number; // Duração clínica em minutos (ex: 45 min)
  professionalHourlyRate: number; // Custo hora clínica do dentista (ex: R$ 150/h)
  professionalCost?: number; // Calculado: (clinicalDurationMinutes / 60) * professionalHourlyRate
  costProfessionalTime?: number;

  inputs: ProcedureInputItem[]; // Insumos / Materiais diretos
  inputsCost?: number; // Soma dos insumos
  costInputsTotal?: number;

  labCost: number; // Custo de laboratório / protético (ex: R$ 350)
  otherCosts?: number; // Custos indiretos / biossegurança / esterilização
  otherDirectCosts?: number;

  totalCost?: number; // professionalCost + inputsCost + labCost + otherCosts
  totalDirectCost?: number;

  targetMarginPercent?: number; // Margem de lucro desejada (ex: 50%)
  suggestedMarginPercent?: number;
  estimatedTaxesPercent?: number; // Estimativa de impostos (ex: 6% Simples ou 15% Carnê-Leão)
  suggestedPrice?: number; // Preço sugerido calculado
  defaultPrice: number; // Preço de tabela / Venda praticado

  active: boolean;
  isIncomplete?: boolean;
  notes?: string;
}

// 5. Sales & Installments
export interface SaleInstallment {
  id: string;
  saleId: string;
  installmentNumber: number;
  totalInstallments: number;
  value: number;
  dueDate: string; // Vencimento YYYY-MM-DD
  paymentDate?: string; // Data de recebimento YYYY-MM-DD
  amountReceived?: number;
  status: InstallmentStatus;
  
  // Receita Saúde (per payment for CPF)
  receitaSaudeStatus?: ReceitaSaudeStatus;
  receitaSaudeId?: string; // External identifier / registration
  receitaSaudeEmittedAt?: string;

  paymentMethod?: PaymentMethod;
  bankAccountId?: string;
  cardFeePercent?: number;
  cardFeeAmount?: number;
  netValue?: number;
}

export interface Sale {
  id: string;
  orgId: string;
  taxOrigin: TaxOrigin; // CPF ou CNPJ
  patientId: string;
  patientName: string;
  patientCpf: string;
  
  // Payer details (mandatory for CPF if different from patient)
  payerIsBeneficiary: boolean;
  payerName?: string;
  payerCpf?: string;

  procedureId?: string;
  procedureName: string;
  description: string;
  totalValue: number;
  serviceDate: string; // Competência YYYY-MM-DD
  paymentMethod: PaymentMethod;
  installmentsCount: number;

  // Cartão / Taxa de Maquininha
  cardFeePercent?: number;
  cardFeeAmount?: number;
  netValue?: number;
  bankAccountId?: string;

  // CNPJ NFS-e details
  nfseStatus?: NfseStatus;
  nfseNumber?: string;
  nfseVerificationCode?: string;
  nfseEmittedAt?: string;

  installments: SaleInstallment[];
  createdAt: string;
  notes?: string;
  appointmentId?: string;
  origin?: 'AGENDA' | 'MANUAL';
  originalEstimatedValue?: number;
  priceHistory?: Array<{ date: string; from: number; to: number; note?: string }>;
}

// 6. Accounts Receivable View
export interface AccountReceivableItem {
  installmentId: string;
  saleId: string;
  patientName: string;
  taxOrigin: TaxOrigin;
  documentSummary: string; // "Receita Saúde #..." or "NFS-e #..."
  procedureName: string;
  competenceDate: string;
  dueDate: string;
  paymentDate?: string;
  value: number;
  amountReceived: number;
  balance: number;
  status: ReceivableOverallStatus;
  receitaSaudeStatus?: ReceitaSaudeStatus;
  receitaSaudeId?: string;
  installmentNumber: number;
  totalInstallments: number;
  notes?: string;
  appointmentId?: string;
  origin?: 'AGENDA' | 'MANUAL';
  serviceDate?: string;
  cardFeePercent?: number;
  cardFeeAmount?: number;
  netValue?: number;
  paymentMethod?: PaymentMethod;
  bankAccountId?: string;
  originalEstimatedValue?: number;
  priceHistory?: Array<{ date: string; from: number; to: number; note?: string }>;
}

// 7. Chart of Accounts (Plano de Contas)
export interface ExpenseCategory {
  id: string;
  code: string; // e.g. "01.01", "04.01"
  groupCode: string; // "01", "04"
  groupName: string; // "PESSOAL", "MATERIAIS ODONTOLÓGICOS"
  name: string; // "Salários", "Anestésicos"
  
  // 3 Essential Attributes
  dedutivelLivroCaixaPf: LivroCaixaPfDedutibilidade;
  impactaFatorRPj: boolean;
  despesaOperacionalPj: boolean;
  
  active: boolean;
  noticeText?: string;
}

// 8.1 Attachment & Receipts Metadata
export type AllowedReceiptExtension = 'pdf' | 'png' | 'jpg' | 'jpeg';

export interface AttachmentMetadata {
  id?: string;
  name: string;
  size: number; // tamanho em bytes
  formattedSize: string; // ex: "245 KB", "1.8 MB"
  type: string; // MIME type, ex: "application/pdf", "image/png"
  extension: AllowedReceiptExtension;
  dataUrl?: string; // payload base64 para preview imediato
  url?: string; // URL externa ou blob URL
  storagePath?: string; // Caminho seguro no bucket dental-private (ex: tenant_id/expenses/xxx.pdf)
  signedUrl?: string; // Signed URL temporária autenticada
  uploadedAt?: string; // ISO 8601
}

// 8. Expenses / Contas a Pagar
export interface Expense {
  id: string;
  orgId: string;
  supplierName: string;
  supplierCpfCnpj: string;
  description: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  groupCode?: string;
  groupName?: string;
  subCategory?: string;
  value: number;
  competenceDate: string;
  dueDate: string;
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  bankAccountId?: string;
  documentNumber?: string;
  attachmentName?: string;
  attachment?: AttachmentMetadata | null;
  notes?: string;

  // Entity separation
  entity: ExpenseEntity;
  splitPercentageCpf?: number; // e.g. 50 (50% CPF, 50% CNPJ)
  splitPercentageCnpj?: number;

  // Parcelamento & Recorrência
  expenseType?: 'UNICA' | 'PARCELADA' | 'RECORRENTE';
  installmentNumber?: number;
  totalInstallments?: number;
  installmentGroupId?: string;
  recurrenceId?: string;
  recurrenceFrequency?: 'MENSAL' | 'SEMANAL' | 'ANUAL';
  recurrenceCount?: number;
  recurrenceIndex?: number;

  // Attributes snapshot with manual override & justification
  dedutivelLivroCaixaPf: LivroCaixaPfDedutibilidade;
  impactaFatorRPj: boolean;
  despesaOperacionalPj: boolean;
  isOverridden?: boolean;
  overrideJustification?: string;

  status: 'A_PAGAR' | 'PAGO' | 'VENCIDO' | 'EM_ATRASO' | 'CANCELADO';
  createdAt: string;
}

// 9. Bank Accounts
export interface BankAccount {
  id: string;
  orgId: string;
  name: string;
  bankName: string;
  accountType: 'CORRENTE_PF' | 'CORRENTE_PJ' | 'POUPANCA' | 'INVESTIMENTO';
  initialBalance: number;
  currentBalance: number;
  isActive?: boolean;
  isPreferred?: boolean;
}

// 10. Tax Brackets & Rules (Parametrized by Year)
export interface IrpfBracket {
  min: number;
  max: number;
  rate: number; // e.g. 0, 0.075, 0.15, 0.225, 0.275
  deduction: number;
}

export interface TaxRulesPf {
  year: number;
  brackets: IrpfBracket[];
  dependentDeductionMonthly: number; // e.g. 189.59
  simplifiedDiscountLimitMonthly: number; // e.g. 564.80
  effectiveDate: string;
  descontoSimplificadoMensal?: number;
  deducaoDependenteMensal?: number;
}

export interface SimplesAnnexRange {
  rangeNumber: number;
  rangeStart: number;
  rangeEnd: number;
  nominalRate: number; // e.g. 0.06
  deduction: number; // parcela a deduzir
}

export interface TaxRulesSimples {
  year: number;
  annexIII: SimplesAnnexRange[];
  annexV: SimplesAnnexRange[];
  fatorRThreshold: number; // 0.28 (28%)
  effectiveDate: string;
  anexoIII?: SimplesAnnexRange[];
  anexoV?: SimplesAnnexRange[];
}

// 11. Payroll & Pró-labore history (12-month window for Fator R)
export interface PayrollHistoryEntry {
  month: string; // YYYY-MM
  salaries: number;
  charges: number; // INSS patronal, FGTS, etc.
  proLabore: number;
  totalPayroll: number;
}

// 12. Monthly Tax Calculation Output
export interface MonthlyPfTaxSummary {
  month: string; // YYYY-MM
  year: number;
  receivedGrossCpf: number;
  projectedGrossCpf: number;
  deductibleLivroCaixaPaid: number;
  nonDeductiblePaid: number;
  conditionalPaid: number;
  inssProprioDeduction: number;
  dependentDeduction: number;
  simplifiedDiscountUsed: boolean;
  simplifiedDiscountValue?: number;
  legalDeductionsValue?: number;
  selectedDeductionType?: 'SIMPLIFICADO' | 'LEGAL';
  additionalReduction2026?: number;
  irpfBeforeReduction?: number;
  reductionFormulaDescription?: string;
  effectiveDeductions: number;
  taxableBaseRealized: number;
  taxableBaseProjected: number;
  irpfRealized: number;
  irpfProjected: number;
  effectiveRate: number;
  exemptionLimitMonthly: number;
  remainingExemptionBalance: number;
  isExemptionLimitReached: boolean;
  exemptionUsagePercent: number;
}

export interface MonthlyPjTaxSummary {
  month: string; // YYYY-MM
  year: number;
  grossRevenueRealized: number; // faturamento do mês
  grossRevenueProjected: number;
  rbt12: number; // Receita Bruta dos últimos 12 meses
  fs12: number; // Folha dos últimos 12 meses
  fatorR: number; // FS12 / RBT12
  isAnexoIII: boolean;
  annex: SimplesNacionalAnexo;
  nominalRate: number;
  deductionRange: number;
  effectiveRate: number;
  dasRealized: number;
  dasProjected: number;
}

// 13. Audit Log
export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
}

// 14. Saved Fiscal Scenarios (Central de Simulações)
export interface SavedFiscalScenario {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  parameters: {
    rbt12: number;
    fs12: number;
    monthlyRevenueNfse: number;
    monthlyProLabore: number;
  };
  results: {
    fatorR: number;
    fatorRPercent: number;
    effectiveAnnex: 'ANEXO_III' | 'ANEXO_V';
    bracketNumber: number;
    nominalRate: number;
    deductionAmount: number;
    effectiveTaxRate: number;
    dasEstimated: number;
    potentialMonthlySavings: number;
  };
}

// 15. Clinical Appointments & Scheduling (Agenda Clínica)
export type AppointmentStatus =
  | 'AGENDADA'
  | 'CONFIRMADA'
  | 'CHEGOU'
  | 'PENDENTE'
  | 'AGUARDANDO'
  | 'EM_ATENDIMENTO'
  | 'FINALIZADA'
  | 'CANCELADA'
  | 'FALTOU';

export type AppointmentOrigin =
  | 'WHATSAPP'
  | 'TELEFONE'
  | 'PRESENCIAL'
  | 'RECEPCAO'
  | 'ONLINE'
  | 'RETORNO'
  | 'INDICACAO'
  | 'OUTRO';

export interface Appointment {
  id: string;
  orgId: string;
  patientId: string;
  patientName: string;
  patientPhone?: string;
  patientCpf?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm (e.g. "09:00")
  durationMinutes: number; // e.g. 30, 45, 60, 90
  endTime: string; // HH:mm (e.g. "09:45")
  dentistName: string;
  professionalId?: string;
  professionalName?: string;
  procedureName: string;
  procedureId?: string;
  status: AppointmentStatus;
  notes?: string;
  sendWhatsappReminder?: boolean;
  origin?: AppointmentOrigin;
  saleId?: string;

  // Rescheduling & Attendance Link
  rescheduledToId?: string;
  rescheduledToDate?: string;
  rescheduledToTime?: string;
  rescheduledFromId?: string;
  rescheduledFromDate?: string;
  missedAt?: string;

  createdAt: string;
  updatedAt: string;
}

// 16. Sale Payment Progress & Settlement Status
export type SaleOverallPaymentStatus =
  | 'TOTALMENTE_RECEBIDA'
  | 'PARCIALMENTE_RECEBIDA'
  | 'PENDENTE'
  | 'VENCIDA'
  | 'CANCELADA';

export interface SalePaymentSummary {
  overallStatus: SaleOverallPaymentStatus;
  status: SaleOverallPaymentStatus;
  totalValue: number;
  receivedValue: number;
  pendingValue: number;
  totalInstallments: number;
  receivedInstallments: number;
  receivedCount: number;
  pendingInstallments: number;
  pendingCount: number;
  overdueInstallments: number;
  nextDueDate?: string;
  lastPaymentDate?: string;
}

// 17. Official Legal & Fiscal Versioned Parameters
export type FiscalParameterType =
  | 'SALARIO_MINIMO'
  | 'TETO_INSS'
  | 'FAIXA_ISENCAO_IRPF'
  | 'ALIQUOTA_BASE_SIMPLES';

export interface FiscalParameter {
  id: string;
  type: FiscalParameterType;
  name: string;
  value: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string; // YYYY-MM-DD
  sourceLaw: string; // e.g. "Decreto nº 12.797/2025"
  status: 'ATIVO' | 'REVOGADO' | 'PREVISTO';
  updatedAt: string;
  updatedBy: string;
  notes?: string;
}

export interface CardFeeSettings {
  debit?: number;
  credit?: Record<number, number>;
}

// 18. System Operational Preferences & Privacy
export interface SystemPreferences {
  hideCpf?: boolean; // Legado; CPF agora é exibido integralmente por padrão
  alertFatorR: boolean; // default: true
  alertDueDates: boolean; // default: true
  operationalReminders: boolean; // default: true
  lunchBreakEnabled?: boolean; // default: false para novos tenants
  lunchBreakStart?: string; // ex: '11:00'
  lunchBreakEnd?: string; // ex: '13:00'
  cardFees?: CardFeeSettings;
}
