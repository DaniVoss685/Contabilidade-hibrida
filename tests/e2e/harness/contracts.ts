/**
 * Interface Contracts and Canonical Validators for Dental Finance E2E Testing
 * Derived strictly from PROJECT.md § Interface Contracts and ORIGINAL_REQUEST.md
 */

import {
  TaxOrigin,
  InstallmentStatus,
  PaymentMethod,
  ReceitaSaudeStatus,
  NfseStatus,
  LivroCaixaPfDedutibilidade,
} from '../../../src/types';
import { calculateSimplesNacionalMonthlyTax } from '../../../src/lib/taxEngine';

export interface ContractValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Interface Contract: AccountReceivableItem with paymentDate (R5.2 / PROJECT.md)
 */
export interface CanonicalAccountReceivableItem {
  id: string;
  saleId: string;
  installmentNumber: number;
  totalInstallments: number;
  patientId: string;
  patientName: string;
  patientCpf: string;
  amount: number;
  amountReceived: number;
  balance: number;
  dueDate: string;
  paymentDate?: string; // NOVO: data de efetiva liquidação
  status: 'A_VENCER' | 'VENCIDO' | 'RECEBIDO';
  taxOrigin: 'CPF' | 'CNPJ';
  paymentMethod?: string;
  receiptStatus?: 'PENDING' | 'ISSUED' | 'EXEMPT';
  observations?: string;
}

export function validateAccountReceivableContract(item: any): ContractValidationResult {
  const errors: string[] = [];
  if (!item.saleId) errors.push('Missing saleId');
  if (typeof item.amount !== 'number' && typeof item.value !== 'number') {
    errors.push('Missing numeric amount/value');
  }
  if (!item.dueDate) errors.push('Missing dueDate');
  if (!['CPF', 'CNPJ'].includes(item.taxOrigin)) {
    errors.push(`Invalid taxOrigin: ${item.taxOrigin}`);
  }
  if (item.status === 'RECEBIDO' && !item.paymentDate && item.paymentDate !== undefined) {
    // If received, paymentDate is expected or supported
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Interface Contract: BankAccount & Methods (R7.2 / PROJECT.md)
 */
export interface CanonicalBankAccount {
  id: string;
  orgId: string;
  name: string;
  bankName: string;
  accountType: 'CORRENTE_PF' | 'CORRENTE_PJ' | 'POUPANCA' | 'INVESTIMENTO';
  agency?: string;
  accountNumber?: string;
  pixKey?: string;
  pixKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA';
  isActive: boolean;
  initialBalance: number;
  currentBalance: number;
}

export function validateBankAccountContract(account: any): ContractValidationResult {
  const errors: string[] = [];
  if (!account.id) errors.push('Missing id');
  if (!account.name) errors.push('Missing name');
  if (!account.bankName) errors.push('Missing bankName');
  const validTypes = ['CORRENTE_PF', 'CORRENTE_PJ', 'POUPANCA', 'INVESTIMENTO'];
  if (!validTypes.includes(account.accountType)) {
    errors.push(`Invalid accountType: ${account.accountType}`);
  }
  if (typeof account.initialBalance !== 'number') errors.push('Missing numeric initialBalance');
  if (typeof account.currentBalance !== 'number') errors.push('Missing numeric currentBalance');
  return { valid: errors.length === 0, errors };
}

/**
 * Interface Contract: Toast Context & Types (R6.1 / PROJECT.md)
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface CanonicalToastNotification {
  id: string;
  message: string;
  type: ToastType;
  durationMs: number; // 3500ms default
}

export function validateToastContract(toast: Partial<CanonicalToastNotification>): ContractValidationResult {
  const errors: string[] = [];
  if (!toast.message) errors.push('Toast requires a non-empty message');
  const validTypes: ToastType[] = ['success', 'error', 'warning', 'info'];
  if (!toast.type || !validTypes.includes(toast.type)) {
    errors.push(`Invalid toast type: ${toast.type}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Interface Contract: ConfirmDialogProps (R6.2 / PROJECT.md)
 */
export interface CanonicalConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  message?: string; // alias
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
  onCancel?: () => void; // alias
}

export function validateConfirmDialogProps(props: CanonicalConfirmDialogProps): ContractValidationResult {
  const errors: string[] = [];
  if (!props.title) errors.push('ConfirmDialog requires a title');
  if (!props.description && !props.message) {
    errors.push('ConfirmDialog requires description or message');
  }
  if (typeof props.onConfirm !== 'function') errors.push('onConfirm must be a function');
  if (typeof props.onClose !== 'function') errors.push('onClose must be a function');
  return { valid: errors.length === 0, errors };
}

/**
 * Interface Contract: ReceiptUploader & Attachment Metadata (R5.3 / PROJECT.md)
 */
export const ALLOWED_RECEIPT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];
export const ALLOWED_RECEIPT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
];
export const MAX_RECEIPT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface AttachmentMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  uploadedAt: string;
}

export function validateReceiptFile(file: { name: string; size: number; type: string }): {
  valid: boolean;
  error?: string;
} {
  if (file.size <= 0) {
    return { valid: false, error: 'O arquivo está vazio.' };
  }
  if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Tamanho excede o limite máximo permitido de 5MB (${(file.size / (1024 * 1024)).toFixed(2)}MB).`,
    };
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const validExt = ALLOWED_RECEIPT_EXTENSIONS.includes(ext);
  const validMime = ALLOWED_RECEIPT_MIME_TYPES.includes(file.type.toLowerCase());

  if (!validExt && !validMime) {
    return {
      valid: false,
      error: `Formato não suportado (${ext || file.type}). Permitidos apenas PDF, PNG, JPG e JPEG.`,
    };
  }

  return { valid: true };
}

/**
 * Interface Contract: Safe Math Utilities (R8.1 / PROJECT.md § Interface Contracts)
 */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || isNaN(denominator) || !isFinite(denominator) || denominator === 0) {
    return fallback;
  }
  if (isNaN(numerator) || !isFinite(numerator)) {
    return fallback;
  }
  const result = numerator / denominator;
  return isNaN(result) || !isFinite(result) ? fallback : result;
}

export interface SafeMarginResult {
  marginPercent: number | null;
  profit: number;
  status: 'OK' | 'WAITING_COSTS' | 'NO_PRICE';
}

export function safeMargin(revenue: number, cost: number): SafeMarginResult {
  if (revenue <= 0 || isNaN(revenue) || !isFinite(revenue)) {
    return { marginPercent: null, profit: 0 - (cost || 0), status: 'NO_PRICE' };
  }
  if (cost === undefined || cost === null || isNaN(cost) || cost === 0) {
    return { marginPercent: null, profit: revenue, status: 'WAITING_COSTS' };
  }
  const profit = revenue - cost;
  const marginPercent = Number(((profit / revenue) * 100).toFixed(1));
  return { marginPercent, profit, status: 'OK' };
}

export function safeFormatPercent(val: number | null | undefined, fallback = '—'): string {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
    return fallback;
  }
  return `${val.toFixed(1).replace('.', ',')}%`;
}

export function calculatePjTaxEstimate(
  yearMonth: string,
  year: number,
  monthlyRevenue: number,
  rbt12: number,
  folha12: number
) {
  const mockSales: any = [
    {
      id: 'mock_sale_test',
      orgId: 'org_test',
      taxOrigin: 'CNPJ',
      patientId: 'p_test',
      patientName: 'Paciente Teste',
      patientCpf: '12345678900',
      payerIsBeneficiary: true,
      procedureName: 'Procedimento Geral',
      description: 'Atendimento Clínico',
      totalValue: monthlyRevenue,
      serviceDate: `${yearMonth}-01`,
      paymentMethod: 'PIX',
      installmentsCount: 1,
      installments: [],
      createdAt: new Date().toISOString(),
    },
  ];

  return calculateSimplesNacionalMonthlyTax(
    mockSales,
    yearMonth,
    year,
    undefined,
    undefined,
    rbt12,
    folha12
  );
}

export function simulateFatorRComparison(
  yearMonth: string,
  rbt12: number,
  folha12: number,
  payrollHistory: any[],
  currentProLabore: number,
  projectedProLabore: number,
  monthlyRevenue: number,
  year = 2025
) {
  const currentFatorR = rbt12 > 0 ? folha12 / rbt12 : 0;
  const folhaProjected = folha12 + (projectedProLabore - currentProLabore) * 12;
  const projectedFatorR = rbt12 > 0 ? folhaProjected / rbt12 : 0;

  const currentTax = calculatePjTaxEstimate(yearMonth, year, monthlyRevenue, rbt12, folha12);
  const projectedTax = calculatePjTaxEstimate(yearMonth, year, monthlyRevenue, rbt12, folhaProjected);

  return {
    current: {
      fatorR: currentFatorR,
      isAnexoIII: currentTax.isAnexoIII,
      annex: currentTax.effectiveAnnex,
      effectiveRate: currentTax.effectiveTaxRate,
      dasEstimated: currentTax.dasEstimated,
    },
    projected: {
      fatorR: projectedFatorR,
      isAnexoIII: projectedTax.isAnexoIII,
      annex: projectedTax.effectiveAnnex,
      effectiveRate: projectedTax.effectiveTaxRate,
      dasEstimated: projectedTax.dasEstimated,
    },
    savingsMonthly: currentTax.dasEstimated - projectedTax.dasEstimated,
  };
}
