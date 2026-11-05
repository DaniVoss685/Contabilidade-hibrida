import { AccountReceivableItem, Expense, TaxOrigin } from '../types';
import { matchDocumentSearch, normalizeSearchText } from './masks';
import { getEffectivePayableStatus, getEffectiveReceivableStatus } from './statusHelper';
import { safeSum } from './mathUtils';

export interface FilteredMoneySummary {
  count: number;
  total: number;
}

export function summarizeFilteredMoney<T>(
  items: readonly T[],
  getValue: (item: T) => number | null | undefined
): FilteredMoneySummary {
  return {
    count: items.length,
    total: safeSum(items.map(getValue)),
  };
}

export interface ExpenseFilters {
  searchTerm: string;
  entityFilter: 'ALL' | 'CPF' | 'CNPJ';
  statusFilter: string;
  categoryFilter: string;
  typeFilter: 'ALL' | 'RECORRENTE' | 'PARCELADA' | 'UNICA';
  paymentMethodFilter: string;
  viewMode: string;
  todayStr?: string;
}

export function filterExpenses(expenses: readonly Expense[], filters: ExpenseFilters): Expense[] {
  const trimmed = filters.searchTerm.trim();
  const normQuery = normalizeSearchText(trimmed);

  return expenses.filter((expense) => {
    const matchesSearch = !trimmed ||
      normalizeSearchText(expense.supplierName).includes(normQuery) ||
      normalizeSearchText(expense.description).includes(normQuery) ||
      normalizeSearchText(expense.categoryName).includes(normQuery) ||
      matchDocumentSearch(expense.supplierCpfCnpj, trimmed);
    const matchesEntity = filters.entityFilter === 'ALL' || expense.entity === filters.entityFilter;
    const effectiveStatus = getEffectivePayableStatus(expense, filters.todayStr);

    let matchesStatus = true;
    if (filters.statusFilter === 'EM_ATRASO' || filters.statusFilter === 'VENCIDO') {
      matchesStatus = effectiveStatus === 'EM_ATRASO';
    } else if (filters.statusFilter === 'A_PAGAR') {
      matchesStatus = effectiveStatus === 'A_PAGAR';
    } else if (filters.statusFilter === 'PAGO') {
      matchesStatus = effectiveStatus === 'PAGO';
    }

    const matchesCategory = filters.categoryFilter === 'ALL' || expense.categoryId === filters.categoryFilter;
    const isRecurrent = expense.expenseType === 'RECORRENTE' || Boolean(expense.recurrenceId);
    const isInstallment = expense.expenseType === 'PARCELADA' || Boolean(expense.installmentGroupId);
    const isSingle = !isRecurrent && !isInstallment;

    let matchesType = true;
    if (filters.viewMode === 'recurrent' || filters.typeFilter === 'RECORRENTE') {
      matchesType = isRecurrent;
    } else if (filters.typeFilter === 'PARCELADA') {
      matchesType = isInstallment;
    } else if (filters.typeFilter === 'UNICA') {
      matchesType = isSingle;
    }

    const matchesPaymentMethod =
      filters.paymentMethodFilter === 'ALL' || expense.paymentMethod === filters.paymentMethodFilter;

    return matchesSearch && matchesEntity && matchesStatus && matchesCategory && matchesType && matchesPaymentMethod;
  });
}

export interface ReceivablesFilters {
  searchTerm: string;
  taxOriginFilter: 'ALL' | TaxOrigin;
  statusFilter: string;
  procedureFilter: string;
  paymentMethodFilter: string;
  todayStr?: string;
}

export function filterReceivables(
  items: readonly AccountReceivableItem[],
  filters: ReceivablesFilters
): AccountReceivableItem[] {
  const trimmed = filters.searchTerm.trim();
  const normQuery = normalizeSearchText(trimmed);

  return items.filter((item) => {
    const matchesSearch = !trimmed ||
      normalizeSearchText(item.patientName).includes(normQuery) ||
      normalizeSearchText(item.documentSummary).includes(normQuery);
    const matchesOrigin = filters.taxOriginFilter === 'ALL' || item.taxOrigin === filters.taxOriginFilter;
    const effectiveStatus = getEffectiveReceivableStatus(item, filters.todayStr);

    let matchesStatus = true;
    if (filters.statusFilter === 'EM_ATRASO' || filters.statusFilter === 'VENCIDO') {
      matchesStatus = effectiveStatus === 'EM_ATRASO' || item.status === 'EM_ATRASO' || item.status === 'VENCIDO';
    } else if (filters.statusFilter === 'A_VENCER') {
      matchesStatus = effectiveStatus === 'A_VENCER' || item.status === 'A_VENCER';
    } else if (filters.statusFilter === 'RECEBIDO') {
      matchesStatus = effectiveStatus === 'RECEBIDO' || item.status === 'RECEBIDO';
    } else if (filters.statusFilter === 'PARCIALMENTE_RECEBIDO') {
      matchesStatus = effectiveStatus === 'PARCIALMENTE_RECEBIDO' || item.status === 'PARCIALMENTE_RECEBIDO';
    } else if (filters.statusFilter !== 'ALL') {
      matchesStatus = item.status === filters.statusFilter;
    }

    const matchesProcedure = filters.procedureFilter === 'ALL' || item.procedureName === filters.procedureFilter;
    const matchesPaymentMethod = filters.paymentMethodFilter === 'ALL'
      ? true
      : filters.paymentMethodFilter === 'CARD_WITH_FEE'
        ? Boolean(item.cardFeeAmount && item.cardFeeAmount > 0)
        : item.paymentMethod === filters.paymentMethodFilter;

    return matchesSearch && matchesOrigin && matchesStatus && matchesProcedure && matchesPaymentMethod;
  });
}
