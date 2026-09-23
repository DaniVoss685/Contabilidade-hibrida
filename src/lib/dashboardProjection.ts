/**
 * Motor Canônico de Projeção Financeira e Fluxo de Caixa do Dental Finance.
 * Centraliza os cálculos de Realizado (Caixa) vs Projetado (+ A Vencer).
 *
 * REGRAS CANÔNICAS:
 * 1. REALIZADO (CAIXA):
 *    - Considera estritamente movimentações financeiras com confirmação efetiva de recebimento/pagamento
 *      (paymentDate / recebido / quitado) cuja data de liquidação pertença à competência selecionada.
 *
 * 2. PROJETADO (+ A VENCER):
 *    - RESULTADO PROJETADO = RECEITAS (Realizadas + Abertas) - DESPESAS (Pagas + Abertas) - IMPOSTOS PROJETADOS.
 *    - Inclui:
 *      a) Parcelas e lançamentos já realizados no período;
 *      b) Parcelas e despesas abertas a vencer até o fim da competência (dueDate <= periodEnd);
 *      c) Parcelas e despesas em atraso de competências anteriores que continuam pendentes (carry-over de atrasados).
 *    - Exclui:
 *      a) Lançamentos futuros com vencimento posterior ao fim da competência (dueDate > periodEnd);
 *      b) Lançamentos cancelados;
 *      c) Duplicidades (um item pago entra no bloco realizado e NÃO no aberto).
 *
 * 3. CONSISTÊNCIA DE SEGREGACÃO (CPF / CNPJ):
 *    - Subtotais de CPF e PJ somam rigorosamente 100% dos totais dos cards em ambos os modos.
 */

import { Sale, Expense } from '../types';

export interface DashboardProjectionParams {
  sales: Sale[];
  expenses: Expense[];
  competence: string; // "YYYY-MM" ou "YYYY-MM-DD"
  viewMode: 'REALIZADO' | 'PROJETADO';
  taxesEstimated?: number; // Provisão tributária (Carnê-Leão + DAS)
  todayDate?: string; // Data de corte para atrasados (default: data atual)
}

export interface RevenueBreakdown {
  total: number;
  cpf: number;
  cnpj: number;
  count: number;
}

export interface OpenRevenueBreakdown extends RevenueBreakdown {
  overdue: number; // Em atraso (dueDate < today && dueDate <= periodEnd)
  upcoming: number; // A vencer no período (dueDate >= today && dueDate <= periodEnd)
  overdueCount: number;
  upcomingCount: number;
}

export interface ProjectedRevenueBreakdown extends RevenueBreakdown {
  overdue: number;
  upcoming: number;
  pending: number;
}

export interface ExpensesBreakdown {
  total: number;
  cpfDeductible: number;
  cnpjOperational: number;
  nonDeductible: number;
  count: number;
}

export interface OpenExpensesBreakdown extends ExpensesBreakdown {
  overdue: number; // Em atraso (dueDate < today && dueDate <= periodEnd)
  upcoming: number; // A vencer no período (dueDate >= today && dueDate <= periodEnd)
  overdueCount: number;
  upcomingCount: number;
}

export interface ProjectedExpensesBreakdown extends ExpensesBreakdown {
  overdue: number;
  upcoming: number;
  pending: number;
}

export interface DashboardProjectionResult {
  competence: string;
  viewMode: 'REALIZADO' | 'PROJETADO';

  // RECEITAS
  realizedRevenue: RevenueBreakdown;
  openReceivables: OpenRevenueBreakdown;
  projectedRevenue: ProjectedRevenueBreakdown; // realized + open

  // DESPESAS
  realizedExpenses: ExpensesBreakdown;
  openPayables: OpenExpensesBreakdown;
  projectedExpenses: ProjectedExpensesBreakdown; // realized + open

  // VALORES ATIVOS (Refletem o viewMode selecionado)
  activeRevenue: {
    total: number;
    cpf: number;
    cnpj: number;
    salesCount: number;
    installmentsCount: number;
  };
  activeExpenses: {
    total: number;
    cpfDeductible: number;
    cnpjOperational: number;
    count: number;
  };

  // RESULTADOS
  operatingResult: number; // activeRevenue.total - activeExpenses.total
  taxesEstimated: number; // Provisão tributária aplicável
  netResult: number; // operatingResult - taxesEstimated
  netMarginPercent: number; // Margem líquida percentual segura (0 se receita <= 0)
}

/**
 * Retorna o período inicial e final (limite estrito do horizonte) para uma competência informada.
 * Se competence for "2026-09" ou "2026-09-15", periodStart é "2026-09-01" e periodEnd é "2026-09-30".
 * Se competence for "2026", periodStart é "2026-01-01" e periodEnd é "2026-12-31".
 */
export function getCompetenceDateBounds(competence: string): {
  periodStart: string;
  periodEnd: string;
  year: number;
  month?: number;
} {
  const cleanComp = (competence || '').trim();
  const parts = cleanComp.split('-');
  const year = parseInt(parts[0], 10) || new Date().getFullYear();

  if (parts.length >= 2) {
    const month = parseInt(parts[1], 10) || 1;
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { periodStart, periodEnd, year, month };
  }

  return {
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    year,
  };
}

/**
 * Função canônica centralizada para cálculo de projeção e realizado do Dashboard do Dental Finance.
 */
export function calculateDashboardProjection(
  params: DashboardProjectionParams
): DashboardProjectionResult {
  const { sales = [], expenses = [], competence, viewMode, taxesEstimated = 0, todayDate } = params;

  const todayStr = todayDate || new Date().toISOString().split('T')[0];
  const { periodStart, periodEnd } = getCompetenceDateBounds(competence);

  // -------------------------------------------------------------
  // 1. PROCESSAMENTO DAS RECEITAS (VENDAS E PARCELAS)
  // -------------------------------------------------------------
  let realizedTotal = 0;
  let realizedCpf = 0;
  let realizedCnpj = 0;
  let realizedCount = 0;

  let openTotal = 0;
  let openCpf = 0;
  let openCnpj = 0;
  let openOverdue = 0;
  let openUpcoming = 0;
  let openOverdueCount = 0;
  let openUpcomingCount = 0;
  let openCount = 0;

  const realizedSalesSet = new Set<string>();
  const projectedSalesSet = new Set<string>();

  for (const sale of sales) {
    const originStr = String(
      sale.taxOrigin ||
      (sale as any).category ||
      (sale as any).entityType ||
      (sale as any).entity ||
      ''
    ).toUpperCase();
    const isCpf = originStr === 'CPF' || originStr === 'PF';

    // Suporte polimórfico a parcelas: sale.installments ou (sale as any).paymentDetails
    const rawInstallments =
      Array.isArray(sale.installments) && sale.installments.length > 0
        ? sale.installments
        : Array.isArray((sale as any).paymentDetails) && (sale as any).paymentDetails.length > 0
        ? (sale as any).paymentDetails
        : null;

    if (rawInstallments) {
      for (const inst of rawInstallments) {
        const statusStr = String(inst.status || '').toUpperCase();
        if (statusStr === 'CANCELADO' || statusStr === 'CANCELLED') continue;

        const payDate = (inst.paymentDate || (inst as any).paidDate || (sale as any).receivedAt || '').trim();
        const isReceived =
          statusStr === 'RECEBIDO' ||
          statusStr === 'RECEIVED' ||
          statusStr === 'PAGO' ||
          statusStr === 'PAID' ||
          (payDate !== '' &&
            statusStr !== 'PENDING' &&
            statusStr !== 'A_RECEBER' &&
            statusStr !== 'OVERDUE' &&
            statusStr !== 'EM_ATRASO');

        const val = Number(inst.amountReceived || inst.value || (inst as any).amount || 0);
        const dueDate = (inst.dueDate || (inst as any).due_date || (inst as any).vencimento || '').trim();

        if (isReceived) {
          // REALIZADO: Confirmação de recebimento dentro do período [periodStart, periodEnd]
          if (payDate >= periodStart && payDate <= periodEnd) {
            realizedTotal += val;
            if (isCpf) realizedCpf += val;
            else realizedCnpj += val;
            realizedCount++;
            realizedSalesSet.add(sale.id);
            projectedSalesSet.add(sale.id);
          }
        } else {
          // EM ABERTO: A vencer ou em atraso de competências anteriores (dueDate <= periodEnd)
          if (dueDate !== '' && dueDate <= periodEnd) {
            openTotal += val;
            if (isCpf) openCpf += val;
            else openCnpj += val;
            openCount++;
            projectedSalesSet.add(sale.id);

            if (dueDate < todayStr) {
              openOverdue += val;
              openOverdueCount++;
            } else {
              openUpcoming += val;
              openUpcomingCount++;
            }
          }
        }
      }
    } else {
      // Venda à vista sem lista explícita de parcelas
      const saleStatusStr = String((sale as any).status || (sale as any).paymentStatus || '').toUpperCase();
      const salePayDate = (
        (sale as any).receivedAt ||
        (sale as any).paidDate ||
        sale.serviceDate ||
        (sale as any).date ||
        ''
      ).trim();

      const isSaleReceived =
        saleStatusStr === 'RECEBIDO' ||
        saleStatusStr === 'RECEIVED' ||
        saleStatusStr === 'COMPLETED' ||
        (sale as any).paymentStatus === 'received' ||
        (salePayDate !== '' &&
          (sale as any).paymentStatus !== 'pending' &&
          (sale as any).paymentStatus !== 'overdue' &&
          (sale as any).paymentStatus !== 'a_receber');

      const val = Number(sale.totalValue || (sale as any).totalAmount || (sale as any).amount || 0);
      const dueDate = (sale.serviceDate || (sale as any).date || '').trim();

      if (isSaleReceived) {
        if (salePayDate >= periodStart && salePayDate <= periodEnd) {
          realizedTotal += val;
          if (isCpf) realizedCpf += val;
          else realizedCnpj += val;
          realizedCount++;
          realizedSalesSet.add(sale.id);
          projectedSalesSet.add(sale.id);
        }
      } else {
        if (dueDate !== '' && dueDate <= periodEnd) {
          openTotal += val;
          if (isCpf) openCpf += val;
          else openCnpj += val;
          openCount++;
          projectedSalesSet.add(sale.id);

          if (dueDate < todayStr) {
            openOverdue += val;
            openOverdueCount++;
          } else {
            openUpcoming += val;
            openUpcomingCount++;
          }
        }
      }
    }
  }

  const realizedRevenue: RevenueBreakdown = {
    total: Math.round(realizedTotal * 100) / 100,
    cpf: Math.round(realizedCpf * 100) / 100,
    cnpj: Math.round(realizedCnpj * 100) / 100,
    count: realizedCount,
  };

  const openReceivables: OpenRevenueBreakdown = {
    total: Math.round(openTotal * 100) / 100,
    cpf: Math.round(openCpf * 100) / 100,
    cnpj: Math.round(openCnpj * 100) / 100,
    overdue: Math.round(openOverdue * 100) / 100,
    upcoming: Math.round(openUpcoming * 100) / 100,
    overdueCount: openOverdueCount,
    upcomingCount: openUpcomingCount,
    count: openCount,
  };

  const projectedRevenue: ProjectedRevenueBreakdown = {
    total: Math.round((realizedTotal + openTotal) * 100) / 100,
    cpf: Math.round((realizedCpf + openCpf) * 100) / 100,
    cnpj: Math.round((realizedCnpj + openCnpj) * 100) / 100,
    overdue: Math.round(openOverdue * 100) / 100,
    upcoming: Math.round(openUpcoming * 100) / 100,
    pending: Math.round(openTotal * 100) / 100,
    count: realizedCount + openCount,
  };

  // -------------------------------------------------------------
  // 2. PROCESSAMENTO DAS DESPESAS (CONTAS A PAGAR)
  // -------------------------------------------------------------
  let expRealizedTotal = 0;
  let expRealizedCpfDeductible = 0;
  let expRealizedCnpjOperational = 0;
  let expRealizedCount = 0;

  let expOpenTotal = 0;
  let expOpenCpfDeductible = 0;
  let expOpenCnpjOperational = 0;
  let expOpenOverdue = 0;
  let expOpenUpcoming = 0;
  let expOpenOverdueCount = 0;
  let expOpenUpcomingCount = 0;
  let expOpenCount = 0;

  for (const exp of expenses) {
    const statusStr = String(exp.status || '').toUpperCase();
    if (statusStr === 'CANCELADO' || statusStr === 'CANCELLED') continue;

    const val = Number(exp.value || (exp as any).amount || 0);
    const entityStr = String(
      exp.entity ||
      (exp as any).entityType ||
      ((exp as any).taxOrigin === 'CPF' ? 'CPF' : 'CNPJ')
    ).toUpperCase();
    const isCpf = entityStr === 'CPF' || entityStr === 'PF';

    const payDate = (exp.paymentDate || (exp as any).paidDate || '').trim();
    const isPaid =
      statusStr === 'PAGO' ||
      statusStr === 'PAID' ||
      (payDate !== '' &&
        statusStr !== 'PENDING' &&
        statusStr !== 'A_PAGAR' &&
        statusStr !== 'OVERDUE' &&
        statusStr !== 'EM_ATRASO');

    const dueDate = (exp.dueDate || (exp as any).due_date || (exp as any).expenseDate || (exp as any).date || '').trim();

    if (isPaid) {
      // DESPESA PAGA (REALIZADO): Quitação dentro do período [periodStart, periodEnd]
      if (payDate >= periodStart && payDate <= periodEnd) {
        expRealizedTotal += val;
        expRealizedCount++;
        if (isCpf) {
          expRealizedCpfDeductible += val;
        } else {
          expRealizedCnpjOperational += val;
        }
      }
    } else {
      // DESPESA EM ABERTO: Vencimento até o fim do período (dueDate <= periodEnd)
      if (dueDate !== '' && dueDate <= periodEnd) {
        expOpenTotal += val;
        expOpenCount++;
        if (isCpf) {
          expOpenCpfDeductible += val;
        } else {
          expOpenCnpjOperational += val;
        }

        if (dueDate < todayStr) {
          expOpenOverdue += val;
          expOpenOverdueCount++;
        } else {
          expOpenUpcoming += val;
          expOpenUpcomingCount++;
        }
      }
    }
  }

  const realizedExpenses: ExpensesBreakdown = {
    total: Math.round(expRealizedTotal * 100) / 100,
    cpfDeductible: Math.round(expRealizedCpfDeductible * 100) / 100,
    cnpjOperational: Math.round(expRealizedCnpjOperational * 100) / 100,
    nonDeductible: 0,
    count: expRealizedCount,
  };

  const openPayables: OpenExpensesBreakdown = {
    total: Math.round(expOpenTotal * 100) / 100,
    cpfDeductible: Math.round(expOpenCpfDeductible * 100) / 100,
    cnpjOperational: Math.round(expOpenCnpjOperational * 100) / 100,
    nonDeductible: 0,
    overdue: Math.round(expOpenOverdue * 100) / 100,
    upcoming: Math.round(expOpenUpcoming * 100) / 100,
    overdueCount: expOpenOverdueCount,
    upcomingCount: expOpenUpcomingCount,
    count: expOpenCount,
  };

  const projectedExpenses: ProjectedExpensesBreakdown = {
    total: Math.round((expRealizedTotal + expOpenTotal) * 100) / 100,
    cpfDeductible: Math.round((expRealizedCpfDeductible + expOpenCpfDeductible) * 100) / 100,
    cnpjOperational: Math.round((expRealizedCnpjOperational + expOpenCnpjOperational) * 100) / 100,
    nonDeductible: 0,
    overdue: Math.round(expOpenOverdue * 100) / 100,
    upcoming: Math.round(expOpenUpcoming * 100) / 100,
    pending: Math.round(expOpenTotal * 100) / 100,
    count: expRealizedCount + expOpenCount,
  };

  // -------------------------------------------------------------
  // 3. SELEÇÃO DINÂMICA CONFORME O MODO (REALIZADO vs PROJETADO)
  // -------------------------------------------------------------
  const isRealized = viewMode === 'REALIZADO';

  const activeRevenue = isRealized
    ? {
        total: realizedRevenue.total,
        cpf: realizedRevenue.cpf,
        cnpj: realizedRevenue.cnpj,
        salesCount: realizedSalesSet.size,
        installmentsCount: realizedRevenue.count,
      }
    : {
        total: projectedRevenue.total,
        cpf: projectedRevenue.cpf,
        cnpj: projectedRevenue.cnpj,
        salesCount: projectedSalesSet.size,
        installmentsCount: projectedRevenue.count,
      };

  const activeExpenses = isRealized
    ? {
        total: realizedExpenses.total,
        cpfDeductible: realizedExpenses.cpfDeductible,
        cnpjOperational: realizedExpenses.cnpjOperational,
        count: realizedExpenses.count,
      }
    : {
        total: projectedExpenses.total,
        cpfDeductible: projectedExpenses.cpfDeductible,
        cnpjOperational: projectedExpenses.cnpjOperational,
        count: projectedExpenses.count,
      };

  // -------------------------------------------------------------
  // 4. RESULTADOS E MARGEM LÍQUIDA CANÔNICA
  // -------------------------------------------------------------
  const operatingResult = Math.round((activeRevenue.total - activeExpenses.total) * 100) / 100;
  const netResult = Math.round((operatingResult - taxesEstimated) * 100) / 100;

  const netMarginPercent =
    activeRevenue.total > 0 ? (netResult / activeRevenue.total) * 100 : 0;

  return {
    competence,
    viewMode,
    realizedRevenue,
    openReceivables,
    projectedRevenue,
    realizedExpenses,
    openPayables,
    projectedExpenses,
    activeRevenue,
    activeExpenses,
    operatingResult,
    taxesEstimated,
    netResult,
    netMarginPercent,
  };
}
