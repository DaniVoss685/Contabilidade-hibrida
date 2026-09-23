import { Sale, SaleInstallment, PaymentMethod } from '../types';
import {
  getTodayCivilDate,
  calculateCivilDaysDiff,
  formatDateBr,
  isValidCivilDate,
} from './masks';
import { formatPaymentMethodName } from './paymentMethodFormat';

// Reexportado para não quebrar imports existentes (ex.: PatientProcedureModal.tsx)
// — a definição canônica agora vive em src/lib/paymentMethodFormat.ts.
export { formatPaymentMethodName };

export interface PatientPaymentBehavior {
  mostUsedPaymentMethod: string; // Ex: "PIX", "Cartão de Crédito" ou "—"
  onTimeRate: string; // Ex: "83%" ou "Sem histórico suficiente"
  averageDelayDays: string; // Ex: "2 dias", "Sem atrasos" ou "—"
  overdueCount: number; // Quantidade de parcelas vencidas não pagas
  openBalance: number; // Saldo em aberto
  lastPaymentDate: string; // "DD/MM/AAAA" ou "—"
}

export interface PatientFinancialSummary {
  totalCpf: number;
  totalCnpj: number;
  totalReceived: number;
  totalBalance: number;
  behavior: PatientPaymentBehavior;
}

export type AggregatedSaleStatus = 'PAGO' | 'PARCIAL' | 'EM_ABERTO' | 'EM_ATRASO';

export interface EnhancedSaleHistoryItem {
  sale: Sale;
  serviceDate: string;
  procedureName: string;
  taxOrigin: 'CPF' | 'CNPJ';
  totalValue: number;
  installmentsCount: number;
  effectivePaymentMethod: string;
  aggregatedStatus: AggregatedSaleStatus;
  statusBadgeLabel: string;
  timelinessLabel: string;
  timelinessVariant: 'success' | 'warning' | 'danger' | 'neutral';
  nfseOrReceiptSummary: string;
}

/**
 * Calcula o resumo financeiro completo e métricas objetivas de pontualidade
 * sem inventar scores arbitrários.
 */
export function calculatePatientFinancialSummary(
  patientSales: Sale[],
  todayStr: string = getTodayCivilDate()
): PatientFinancialSummary {
  let totalCpf = 0;
  let totalCnpj = 0;
  let totalReceived = 0;
  let totalBalance = 0;

  const settledInstallments: SaleInstallment[] = [];
  const overdueInstallments: SaleInstallment[] = [];
  const methodCounts: Record<string, number> = {};

  for (const sale of patientSales) {
    if (sale.taxOrigin === 'CPF') {
      totalCpf += sale.totalValue || 0;
    } else {
      totalCnpj += sale.totalValue || 0;
    }

    const installments = Array.isArray(sale.installments) && sale.installments.length > 0
      ? sale.installments
      : [
          {
            id: `${sale.id}_inst_1`,
            saleId: sale.id,
            installmentNumber: 1,
            totalInstallments: 1,
            value: sale.totalValue,
            dueDate: sale.serviceDate,
            paymentDate: sale.serviceDate,
            amountReceived: sale.totalValue,
            status: 'RECEBIDO' as const,
            paymentMethod: sale.paymentMethod,
          },
        ];

    for (const inst of installments) {
      if (inst.status === 'CANCELADO') continue;

      const isSettled = inst.status === 'RECEBIDO' || (inst.amountReceived !== undefined && inst.amountReceived >= inst.value);
      if (isSettled) {
        settledInstallments.push(inst);
        const recValue = inst.amountReceived || inst.value || 0;
        totalReceived += recValue;

        const effectiveMethod = inst.paymentMethod || sale.paymentMethod;
        if (effectiveMethod) {
          methodCounts[effectiveMethod] = (methodCounts[effectiveMethod] || 0) + 1;
        }
      } else {
        const remaining = (inst.value || 0) - (inst.amountReceived || 0);
        if (remaining > 0) {
          totalBalance += remaining;
        }

        const due = (inst.dueDate || sale.serviceDate || '').split('T')[0];
        if (due && due < todayStr) {
          overdueInstallments.push(inst);
        }
      }
    }
  }

  // 1. Forma de pagamento mais utilizada entre recebimentos liquidados
  let mostUsedPaymentMethod = '—';
  let maxCount = 0;
  for (const [m, count] of Object.entries(methodCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostUsedPaymentMethod = formatPaymentMethodName(m);
    }
  }

  // 2. Percentual pago no prazo
  // Um recebível é no prazo se liquidado e paymentDate <= dueDate
  let onTimeRate = 'Sem histórico suficiente';
  let averageDelayDays = '—';
  let lastPaymentDate = '—';

  if (settledInstallments.length > 0) {
    let onTimeCount = 0;
    let totalDelayDays = 0;
    let delayedCount = 0;
    let latestPaymentDateStr = '';

    for (const inst of settledInstallments) {
      const payDate = (inst.paymentDate || '').split('T')[0];
      const dueDate = (inst.dueDate || '').split('T')[0];

      if (payDate && (!latestPaymentDateStr || payDate > latestPaymentDateStr)) {
        latestPaymentDateStr = payDate;
      }

      if (payDate && dueDate) {
        if (payDate <= dueDate) {
          onTimeCount++;
        } else {
          delayedCount++;
          const diff = calculateCivilDaysDiff(payDate, dueDate);
          if (diff > 0) {
            totalDelayDays += diff;
          }
        }
      } else {
        onTimeCount++;
      }
    }

    const ratePercent = Math.round((onTimeCount / settledInstallments.length) * 100);
    onTimeRate = `${ratePercent}%`;

    if (delayedCount === 0) {
      averageDelayDays = 'Sem atrasos';
    } else {
      const avg = Math.round(totalDelayDays / delayedCount);
      averageDelayDays = avg === 1 ? '1 dia' : `${avg} dias`;
    }

    if (latestPaymentDateStr && isValidCivilDate(latestPaymentDateStr)) {
      lastPaymentDate = formatDateBr(latestPaymentDateStr);
    }
  }

  return {
    totalCpf,
    totalCnpj,
    totalReceived,
    totalBalance,
    behavior: {
      mostUsedPaymentMethod,
      onTimeRate,
      averageDelayDays,
      overdueCount: overdueInstallments.length,
      openBalance: totalBalance,
      lastPaymentDate,
    },
  };
}

/**
 * Retorna o status agregado e indicadores de pontualidade de uma venda
 */
export function enhanceSaleHistoryItem(
  sale: Sale,
  todayStr: string = getTodayCivilDate()
): EnhancedSaleHistoryItem {
  const installments = Array.isArray(sale.installments) && sale.installments.length > 0
    ? sale.installments
    : [
        {
          id: `${sale.id}_inst_1`,
          saleId: sale.id,
          installmentNumber: 1,
          totalInstallments: 1,
          value: sale.totalValue,
          dueDate: sale.serviceDate,
          paymentDate: sale.serviceDate,
          amountReceived: sale.totalValue,
          status: 'RECEBIDO' as const,
          paymentMethod: sale.paymentMethod,
        },
      ];

  const activeInstallments = installments.filter((i) => i.status !== 'CANCELADO');
  const settled = activeInstallments.filter(
    (i) => i.status === 'RECEBIDO' || (i.amountReceived !== undefined && i.amountReceived >= i.value)
  );
  const open = activeInstallments.filter(
    (i) => i.status !== 'RECEBIDO' && (!i.amountReceived || i.amountReceived < i.value)
  );

  let aggregatedStatus: AggregatedSaleStatus = 'EM_ABERTO';
  let statusBadgeLabel = 'Em aberto';

  if (activeInstallments.length === 0) {
    aggregatedStatus = 'EM_ABERTO';
    statusBadgeLabel = 'Em aberto';
  } else if (settled.length === activeInstallments.length) {
    aggregatedStatus = 'PAGO';
    statusBadgeLabel = 'Pago';
  } else if (settled.length > 0) {
    aggregatedStatus = 'PARCIAL';
    statusBadgeLabel = `Parcial (${settled.length}/${activeInstallments.length})`;
  } else {
    // Nenhuma paga
    const hasOverdue = open.some((i) => {
      const due = (i.dueDate || sale.serviceDate || '').split('T')[0];
      return due && due < todayStr;
    });

    if (hasOverdue) {
      aggregatedStatus = 'EM_ATRASO';
      statusBadgeLabel = 'Em atraso';
    } else {
      aggregatedStatus = 'EM_ABERTO';
      statusBadgeLabel = 'Em aberto';
    }
  }

  // Pontualidade
  let timelinessLabel = '—';
  let timelinessVariant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';

  if (aggregatedStatus === 'PAGO') {
    let maxDelay = 0;
    let allEarly = true;

    for (const inst of settled) {
      const pay = (inst.paymentDate || '').split('T')[0];
      const due = (inst.dueDate || '').split('T')[0];
      if (pay && due) {
        const diff = calculateCivilDaysDiff(pay, due);
        if (diff > 0 && diff > maxDelay) {
          maxDelay = diff;
        }
        if (diff >= 0) {
          allEarly = false;
        }
      }
    }

    if (maxDelay > 0) {
      timelinessLabel = maxDelay === 1 ? 'Pago com 1 dia de atraso' : `Pago com ${maxDelay} dias de atraso`;
      timelinessVariant = 'warning';
    } else if (allEarly && settled.length > 0) {
      timelinessLabel = 'Pago antecipadamente';
      timelinessVariant = 'success';
    } else {
      timelinessLabel = '✓ No prazo';
      timelinessVariant = 'success';
    }
  } else {
    // Há parcelas em aberto
    const overdueList = open.filter((i) => {
      const due = (i.dueDate || sale.serviceDate || '').split('T')[0];
      return due && due < todayStr;
    });

    if (overdueList.length > 0) {
      let maxOverdueDays = 0;
      for (const inst of overdueList) {
        const due = (inst.dueDate || sale.serviceDate || '').split('T')[0];
        const diff = calculateCivilDaysDiff(todayStr, due);
        if (diff > maxOverdueDays) {
          maxOverdueDays = diff;
        }
      }
      timelinessLabel = maxOverdueDays === 1 ? 'Em atraso há 1 dia' : `Em atraso há ${maxOverdueDays} dias`;
      timelinessVariant = 'danger';
    } else {
      // Vencimentos futuros: pegar o mais próximo
      let minFutureDays = Infinity;
      for (const inst of open) {
        const due = (inst.dueDate || sale.serviceDate || '').split('T')[0];
        if (due) {
          const diff = calculateCivilDaysDiff(due, todayStr);
          if (diff >= 0 && diff < minFutureDays) {
            minFutureDays = diff;
          }
        }
      }

      if (minFutureDays === 0) {
        timelinessLabel = 'Vence hoje';
        timelinessVariant = 'warning';
      } else if (minFutureDays === 1) {
        timelinessLabel = 'Vence amanhã';
        timelinessVariant = 'neutral';
      } else if (minFutureDays < Infinity) {
        timelinessLabel = `Vence em ${minFutureDays} dias`;
        timelinessVariant = 'neutral';
      } else {
        timelinessLabel = 'A vencer';
        timelinessVariant = 'neutral';
      }
    }
  }

  // Forma de pagamento exibida
  let effectivePaymentMethod = '';
  const firstSettled = settled[0];
  const count = sale.installmentsCount || activeInstallments.length || 1;

  if (aggregatedStatus === 'PAGO' || aggregatedStatus === 'PARCIAL') {
    const method = (firstSettled?.paymentMethod || sale.paymentMethod);
    const name = formatPaymentMethodName(method);
    effectivePaymentMethod = count > 1 ? `${name} (${count}x)` : name;
  } else {
    const name = formatPaymentMethodName(sale.paymentMethod);
    effectivePaymentMethod = count > 1 ? `Previsto: ${name} (${count}x)` : `Previsto: ${name}`;
  }

  // Documento fiscal
  const nfseOrReceiptSummary =
    sale.taxOrigin === 'CPF'
      ? sale.installments?.[0]?.receitaSaudeId || 'Receita Saúde (Pendente)'
      : `NFS-e #${sale.nfseNumber || 'Pendente'}`;

  return {
    sale,
    serviceDate: sale.serviceDate,
    procedureName: sale.procedureName,
    taxOrigin: sale.taxOrigin,
    totalValue: sale.totalValue,
    installmentsCount: count,
    effectivePaymentMethod,
    aggregatedStatus,
    statusBadgeLabel,
    timelinessLabel,
    timelinessVariant,
    nfseOrReceiptSummary,
  };
}
