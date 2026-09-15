import {
  Sale,
  Expense,
  ExpenseCategory,
  BankAccount,
  TaxRulesPf,
  TaxRulesSimples,
  Professional,
  PayrollHistoryEntry,
} from '../types';
import {
  MonthlyCashFlowCol,
  AnnualCashFlowSummary,
  MonthlyDreCol,
  AnnualDreSummary,
  CategoryAnnualControlItem,
  FinancialEntityFilter,
  FinancialItemDetail,
} from '../types/financial';
import { calculateCpfMonthlyTax, calculateSimplesNacionalMonthlyTax } from './taxEngine';
import {
  OPERATIONAL_EXPENSE_GROUPS,
  getOperationalGroup,
  getOperationalGroupName,
} from './chartOfAccountsData';

function getCleanExpenseItemName(exp: Expense): string {
  const raw = (exp.supplierName && exp.supplierName.trim()) || (exp.description && exp.description.trim()) || 'Despesa Diversa';
  const cleaned = raw.replace(/\s*\(\d+\/\d+\)$/, '').trim();
  return cleaned || raw;
}

const MONTH_LABELS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

/**
 * Builds the 12-month side-by-side Annual Cash Flow statement (Regime de Caixa).
 */
export function buildAnnualCashFlow(
  year: number,
  sales: Sale[],
  expenses: Expense[],
  bankAccounts: BankAccount[],
  entityFilter: FinancialEntityFilter = 'ALL'
): AnnualCashFlowSummary {
  // Collect all expense categories and groups present
  const expenseGroupMap = new Map<string, string>();
  const expenseCatMap = new Map<string, { id: string; code: string; name: string; groupCode: string }>();
  const proceduresSet = new Set<string>();

  expenses.forEach((e) => {
    const groupCode = e.categoryCode ? e.categoryCode.split('.')[0] : (e.groupCode || '99');
    const groupName = getOperationalGroupName(groupCode);
    if (!expenseGroupMap.has(groupCode)) {
      expenseGroupMap.set(groupCode, groupName);
    }
    if (e.categoryId && !expenseCatMap.has(e.categoryId)) {
      expenseCatMap.set(e.categoryId, {
        id: e.categoryId,
        code: e.categoryCode,
        name: e.categoryName,
        groupCode,
      });
    }
  });

  sales.forEach((s) => {
    if (s.procedureName) {
      proceduresSet.add(s.procedureName);
    }
  });

  // Calculate starting initial balance from bank accounts
  let runningBalance = bankAccounts
    .filter((b) => {
      if (entityFilter === 'CPF') return b.accountType === 'CORRENTE_PF';
      if (entityFilter === 'CNPJ') return b.accountType === 'CORRENTE_PJ';
      return true;
    })
    .reduce((acc, b) => acc + (b.initialBalance || 0), 0);

  const initialBalanceYear = runningBalance;
  const months: MonthlyCashFlowCol[] = [];
  const expenseItemMap = new Map<string, FinancialItemDetail>();

  for (let m = 1; m <= 12; m++) {
    const monthKey = `${year}-${String(m).padStart(2, '0')}`;
    const monthLabel = MONTH_LABELS[m - 1];

    let realizedInflow = 0;
    let projectedInflow = 0;
    const inflowByProcedure: MonthlyCashFlowCol['inflowByProcedure'] = {};
    const inflowByOrigin = {
      cpfRealized: 0,
      cpfProjected: 0,
      cnpjRealized: 0,
      cnpjProjected: 0,
    };

    // 1. Inflows from Sales & Installments
    sales.forEach((sale) => {
      // Entity filter
      if (entityFilter !== 'ALL' && sale.taxOrigin !== entityFilter) {
        return;
      }

      const procName = sale.procedureName || 'Outros Procedimentos';
      if (!inflowByProcedure[procName]) {
        inflowByProcedure[procName] = { realized: 0, projected: 0, total: 0 };
      }

      sale.installments?.forEach((inst) => {
        // Realized Cash inflow (received in this month)
        const isReceived = inst.status === 'RECEBIDO' || (inst.amountReceived && inst.amountReceived > 0);
        const receiptDate = inst.paymentDate || inst.dueDate;

        if (isReceived && receiptDate && receiptDate.startsWith(monthKey)) {
          const recValue = inst.amountReceived || inst.value;
          realizedInflow += recValue;
          inflowByProcedure[procName].realized += recValue;
          inflowByProcedure[procName].total += recValue;

          if (sale.taxOrigin === 'CPF') {
            inflowByOrigin.cpfRealized += recValue;
          } else {
            inflowByOrigin.cnpjRealized += recValue;
          }
        }

        // Projected Cash inflow (due in this month, not yet received)
        const isPending =
          (inst.status === 'A_RECEBER' || inst.status === 'VENCIDO') ||
          (inst.status !== 'CANCELADO' && inst.value > (inst.amountReceived || 0));

        if (isPending && inst.dueDate && inst.dueDate.startsWith(monthKey)) {
          const pendingBalance = Math.max(0, inst.value - (inst.amountReceived || 0));
          projectedInflow += pendingBalance;
          inflowByProcedure[procName].projected += pendingBalance;
          inflowByProcedure[procName].total += pendingBalance;

          if (sale.taxOrigin === 'CPF') {
            inflowByOrigin.cpfProjected += pendingBalance;
          } else {
            inflowByOrigin.cnpjProjected += pendingBalance;
          }
        }
      });
    });

    // 2. Outflows from Expenses
    let realizedOutflow = 0;
    let projectedOutflow = 0;
    const outflowByGroup: MonthlyCashFlowCol['outflowByGroup'] = {};
    const outflowByCategory: MonthlyCashFlowCol['outflowByCategory'] = {};
    const outflowByItem: MonthlyCashFlowCol['outflowByItem'] = {};

    expenses.forEach((exp) => {
      // Entity filter
      if (entityFilter !== 'ALL' && exp.entity !== entityFilter) {
        return;
      }

      const groupCode = exp.categoryCode ? exp.categoryCode.split('.')[0] : (exp.groupCode || '99');
      const groupName = expenseGroupMap.get(groupCode) || getOperationalGroupName(groupCode);

      if (!outflowByGroup[groupCode]) {
        outflowByGroup[groupCode] = {
          groupCode,
          groupName,
          realized: 0,
          projected: 0,
          total: 0,
        };
      }

      if (!outflowByCategory[exp.categoryId]) {
        outflowByCategory[exp.categoryId] = {
          categoryId: exp.categoryId,
          categoryCode: exp.categoryCode,
          categoryName: exp.categoryName,
          groupCode,
          realized: 0,
          projected: 0,
          total: 0,
        };
      }

      const itemName = getCleanExpenseItemName(exp);
      const itemKey = `${exp.categoryId}__${itemName.toLowerCase()}`;
      if (!expenseItemMap.has(itemKey)) {
        expenseItemMap.set(itemKey, {
          itemKey,
          itemName,
          categoryId: exp.categoryId,
          categoryCode: exp.categoryCode || '',
          groupCode,
        });
      }

      if (!outflowByItem[itemKey]) {
        outflowByItem[itemKey] = {
          itemKey,
          itemName,
          categoryId: exp.categoryId,
          realized: 0,
          projected: 0,
          total: 0,
        };
      }

      // Realized Outflow (paid in this month)
      const payDate = exp.paymentDate || exp.dueDate;
      if (exp.status === 'PAGO' && payDate && payDate.startsWith(monthKey)) {
        realizedOutflow += exp.value;
        outflowByGroup[groupCode].realized += exp.value;
        outflowByGroup[groupCode].total += exp.value;
        outflowByCategory[exp.categoryId].realized += exp.value;
        outflowByCategory[exp.categoryId].total += exp.value;
        outflowByItem[itemKey].realized += exp.value;
        outflowByItem[itemKey].total += exp.value;
      }

      // Projected Outflow (to pay in this month)
      if (
        (exp.status === 'A_PAGAR' || exp.status === 'VENCIDO') &&
        exp.dueDate &&
        exp.dueDate.startsWith(monthKey)
      ) {
        projectedOutflow += exp.value;
        outflowByGroup[groupCode].projected += exp.value;
        outflowByGroup[groupCode].total += exp.value;
        outflowByCategory[exp.categoryId].projected += exp.value;
        outflowByCategory[exp.categoryId].total += exp.value;
        outflowByItem[itemKey].projected += exp.value;
        outflowByItem[itemKey].total += exp.value;
      }
    });

    const totalInflow = realizedInflow + projectedInflow;
    const totalOutflow = realizedOutflow + projectedOutflow;
    const netRealized = realizedInflow - realizedOutflow;
    const netProjected = projectedInflow - projectedOutflow;
    const netCashFlow = totalInflow - totalOutflow;

    const initialBalance = runningBalance;
    const finalBalance = initialBalance + netCashFlow;
    runningBalance = finalBalance; // Carry forward to next month

    months.push({
      monthIndex: m,
      monthLabel,
      monthKey,
      realizedInflow,
      projectedInflow,
      totalInflow,
      inflowByProcedure,
      inflowByOrigin,
      realizedOutflow,
      projectedOutflow,
      totalOutflow,
      outflowByGroup,
      outflowByCategory,
      outflowByItem,
      netRealized,
      netProjected,
      netCashFlow,
      initialBalance,
      finalBalance,
    });
  }

  const totalRealizedInflow = months.reduce((acc, m) => acc + m.realizedInflow, 0);
  const totalProjectedInflow = months.reduce((acc, m) => acc + m.projectedInflow, 0);
  const totalInflow = totalRealizedInflow + totalProjectedInflow;

  const totalRealizedOutflow = months.reduce((acc, m) => acc + m.realizedOutflow, 0);
  const totalProjectedOutflow = months.reduce((acc, m) => acc + m.projectedOutflow, 0);
  const totalOutflow = totalRealizedOutflow + totalProjectedOutflow;

  const netTotalCashFlow = totalInflow - totalOutflow;
  const finalBalanceYear = months[months.length - 1]?.finalBalance || initialBalanceYear;

  const allExpenseGroups = Array.from(expenseGroupMap.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const allExpenseCategories = Array.from(expenseCatMap.values()).sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  const allExpenseItems = Array.from(expenseItemMap.values()).sort((a, b) =>
    a.itemName.localeCompare(b.itemName)
  );

  return {
    year,
    months,
    totalRealizedInflow,
    totalProjectedInflow,
    totalInflow,
    totalRealizedOutflow,
    totalProjectedOutflow,
    totalOutflow,
    netTotalCashFlow,
    initialBalanceYear,
    finalBalanceYear,
    allExpenseGroups,
    allExpenseCategories,
    allExpenseItems,
    allProcedures: Array.from(proceduresSet).sort(),
  };
}

/**
 * Builds the 12-month side-by-side Annual DRE (Regime de Competência).
 */
export function buildAnnualDre(
  year: number,
  sales: Sale[],
  expenses: Expense[],
  taxRulesPf: TaxRulesPf,
  taxRulesSimples: TaxRulesSimples,
  professional: Professional,
  payrollHistory: PayrollHistoryEntry[],
  entityFilter: FinancialEntityFilter = 'ALL'
): AnnualDreSummary {
  const months: MonthlyDreCol[] = [];
  const allProceduresSet = new Set<string>();
  const variableGroupsMap = new Map<string, string>();
  const fixedGroupsMap = new Map<string, string>();
  const allExpenseCatMap = new Map<string, { id: string; code: string; name: string; groupCode: string }>();

  sales.forEach((s) => {
    if (s.procedureName) allProceduresSet.add(s.procedureName);
  });

  expenses.forEach((e) => {
    const groupCode = e.categoryCode ? e.categoryCode.split('.')[0] : (e.groupCode || '99');
    const groupDef = getOperationalGroup(groupCode);
    const isVariable = groupDef.isVariableCpv;

    if (isVariable) {
      if (!variableGroupsMap.has(groupCode)) {
        variableGroupsMap.set(groupCode, groupDef.name);
      }
    } else {
      if (!fixedGroupsMap.has(groupCode)) {
        fixedGroupsMap.set(groupCode, groupDef.name);
      }
    }

    if (e.categoryId && !allExpenseCatMap.has(e.categoryId)) {
      allExpenseCatMap.set(e.categoryId, {
        id: e.categoryId,
        code: e.categoryCode,
        name: e.categoryName,
        groupCode,
      });
    }
  });

  const fixedItemMap = new Map<string, FinancialItemDetail>();

  for (let m = 1; m <= 12; m++) {
    const monthKey = `${year}-${String(m).padStart(2, '0')}`;
    const monthLabel = MONTH_LABELS[m - 1];

    let grossRevenue = 0;
    let cpfGrossRevenue = 0;
    let cnpjGrossRevenue = 0;
    const revenueByProcedure: Record<string, number> = {};

    // 1. Receita Bruta por Competência (serviceDate)
    sales.forEach((s) => {
      if (entityFilter !== 'ALL' && s.taxOrigin !== entityFilter) {
        return;
      }

      if (s.serviceDate && s.serviceDate.startsWith(monthKey)) {
        grossRevenue += s.totalValue;
        if (s.taxOrigin === 'CPF') {
          cpfGrossRevenue += s.totalValue;
        } else {
          cnpjGrossRevenue += s.totalValue;
        }

        const procName = s.procedureName || 'Outros Procedimentos';
        revenueByProcedure[procName] = (revenueByProcedure[procName] || 0) + s.totalValue;
      }
    });

    // 2. Tributos Diretos / Deduções da Receita
    const cpfTaxCalc = calculateCpfMonthlyTax(
      sales,
      expenses,
      monthKey,
      year,
      taxRulesPf,
      professional.numDependentes,
      professional.inssProprioMensal
    );

    const cnpjTaxCalc = calculateSimplesNacionalMonthlyTax(
      sales,
      monthKey,
      year,
      taxRulesSimples,
      payrollHistory,
      professional.rbt12Inicial,
      professional.folha12MesesInicial
    );

    const cpfTaxes = entityFilter === 'CNPJ' ? 0 : cpfTaxCalc.carneLeaoEstimated;
    const cnpjTaxes = entityFilter === 'CPF' ? 0 : cnpjTaxCalc.dasEstimated;
    const directTaxes = cpfTaxes + cnpjTaxes;

    // 3. Receita Líquida
    const netRevenue = Math.max(0, grossRevenue - directTaxes);

    // 4. Custos Variáveis (Insumos + Laboratório) por Competência
    let variableCosts = 0;
    const variableCostsByGroup: Record<string, number> = {};
    const variableCostsByCategory: Record<string, number> = {};

    // 5. Despesas Fixas & Administrativas por Competência
    let fixedExpenses = 0;
    const fixedExpensesByGroup: Record<string, number> = {};
    const fixedExpensesByCategory: Record<string, number> = {};
    const fixedExpensesByItem: Record<string, number> = {};

    expenses.forEach((e) => {
      if (entityFilter !== 'ALL' && e.entity !== entityFilter) {
        return;
      }

      if (e.competenceDate && e.competenceDate.startsWith(monthKey)) {
        const groupCode = e.categoryCode ? e.categoryCode.split('.')[0] : (e.groupCode || '99');
        const isVariable = getOperationalGroup(groupCode).isVariableCpv;

        if (isVariable) {
          variableCosts += e.value;
          variableCostsByGroup[groupCode] = (variableCostsByGroup[groupCode] || 0) + e.value;
          variableCostsByCategory[e.categoryId] = (variableCostsByCategory[e.categoryId] || 0) + e.value;
        } else {
          fixedExpenses += e.value;
          fixedExpensesByGroup[groupCode] = (fixedExpensesByGroup[groupCode] || 0) + e.value;
          fixedExpensesByCategory[e.categoryId] = (fixedExpensesByCategory[e.categoryId] || 0) + e.value;

          const itemName = getCleanExpenseItemName(e);
          const itemKey = `${e.categoryId}__${itemName.toLowerCase()}`;
          if (!fixedItemMap.has(itemKey)) {
            fixedItemMap.set(itemKey, {
              itemKey,
              itemName,
              categoryId: e.categoryId,
              categoryCode: e.categoryCode || '',
              groupCode,
            });
          }
          fixedExpensesByItem[itemKey] = (fixedExpensesByItem[itemKey] || 0) + e.value;
        }
      }
    });

    // Calculations
    const contributionMargin = netRevenue - variableCosts;
    const contributionMarginPercent = netRevenue > 0 ? (contributionMargin / netRevenue) * 100 : 0;

    const ebitda = contributionMargin - fixedExpenses;
    const ebitdaMarginPercent = grossRevenue > 0 ? (ebitda / grossRevenue) * 100 : 0;

    const netResult = ebitda;
    const netMarginPercent = grossRevenue > 0 ? (netResult / grossRevenue) * 100 : 0;

    months.push({
      monthIndex: m,
      monthLabel,
      monthKey,
      grossRevenue,
      cpfGrossRevenue,
      cnpjGrossRevenue,
      revenueByProcedure,
      directTaxes,
      cpfTaxes,
      cnpjTaxes,
      netRevenue,
      variableCosts,
      variableCostsByGroup,
      variableCostsByCategory,
      contributionMargin,
      contributionMarginPercent,
      fixedExpenses,
      fixedExpensesByGroup,
      fixedExpensesByCategory,
      fixedExpensesByItem,
      ebitda,
      ebitdaMarginPercent,
      netResult,
      netMarginPercent,
    });
  }

  const totalGrossRevenue = months.reduce((acc, m) => acc + m.grossRevenue, 0);
  const totalCpfGrossRevenue = months.reduce((acc, m) => acc + m.cpfGrossRevenue, 0);
  const totalCnpjGrossRevenue = months.reduce((acc, m) => acc + m.cnpjGrossRevenue, 0);
  const totalDirectTaxes = months.reduce((acc, m) => acc + m.directTaxes, 0);
  const totalNetRevenue = months.reduce((acc, m) => acc + m.netRevenue, 0);
  const totalVariableCosts = months.reduce((acc, m) => acc + m.variableCosts, 0);
  const totalContributionMargin = months.reduce((acc, m) => acc + m.contributionMargin, 0);
  const averageContributionMarginPercent =
    totalNetRevenue > 0 ? (totalContributionMargin / totalNetRevenue) * 100 : 0;

  const totalFixedExpenses = months.reduce((acc, m) => acc + m.fixedExpenses, 0);
  const totalEbitda = months.reduce((acc, m) => acc + m.ebitda, 0);
  const totalNetResult = months.reduce((acc, m) => acc + m.netResult, 0);
  const averageNetMarginPercent =
    totalGrossRevenue > 0 ? (totalNetResult / totalGrossRevenue) * 100 : 0;

  const allFixedItems = Array.from(fixedItemMap.values()).sort((a, b) =>
    a.itemName.localeCompare(b.itemName)
  );

  return {
    year,
    months,
    totalGrossRevenue,
    totalCpfGrossRevenue,
    totalCnpjGrossRevenue,
    totalDirectTaxes,
    totalNetRevenue,
    totalVariableCosts,
    totalContributionMargin,
    averageContributionMarginPercent,
    totalFixedExpenses,
    totalEbitda,
    totalNetResult,
    averageNetMarginPercent,
    allVariableGroups: Array.from(variableGroupsMap.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    allFixedGroups: Array.from(fixedGroupsMap.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    allExpenseCategories: Array.from(allExpenseCatMap.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    ),
    allFixedItems,
    allProcedures: Array.from(allProceduresSet).sort(),
  };
}

/**
 * Builds the Category-level control view showing annual totals, payments (Cash),
 * and competence entries (DRE) for every single category.
 */
export function buildCategoryAnnualControl(
  year: number,
  sales: Sale[],
  expenses: Expense[],
  categories: ExpenseCategory[],
  entityFilter: FinancialEntityFilter = 'ALL'
): CategoryAnnualControlItem[] {
  const itemsMap = new Map<string, CategoryAnnualControlItem>();

  // Initialize from categories in Plano de Contas
  categories.forEach((cat) => {
    const groupCode = cat.groupCode || (cat.code ? cat.code.split('.')[0] : '99');
    const groupDef = getOperationalGroup(groupCode);
    const isVariable = groupDef.isVariableCpv;

    itemsMap.set(cat.id, {
      id: cat.id,
      code: cat.code,
      name: cat.name,
      groupCode,
      groupName: cat.groupName || groupDef.name,
      type: 'EXPENSE',
      isVariableCost: isVariable,
      dedutivelLivroCaixaPf: cat.dedutivelLivroCaixaPf,
      impactaFatorRPj: cat.impactaFatorRPj,
      despesaOperacionalPj: cat.despesaOperacionalPj,
      totalCompetence: 0,
      totalPaid: 0,
      totalToPay: 0,
      totalOverdue: 0,
      countTransactions: 0,
      monthsCompetence: new Array(12).fill(0),
      monthsPaid: new Array(12).fill(0),
      monthsToPay: new Array(12).fill(0),
    });
  });

  // Populate from Expenses
  expenses.forEach((exp) => {
    if (entityFilter !== 'ALL' && exp.entity !== entityFilter) {
      return;
    }

    let item = itemsMap.get(exp.categoryId);
    if (!item) {
      const groupCode = exp.categoryCode ? exp.categoryCode.split('.')[0] : (exp.groupCode || '99');
      const groupDef = getOperationalGroup(groupCode);
      item = {
        id: exp.categoryId,
        code: exp.categoryCode,
        name: exp.categoryName,
        groupCode,
        groupName: groupDef.name,
        type: 'EXPENSE',
        isVariableCost: groupDef.isVariableCpv,
        dedutivelLivroCaixaPf: exp.dedutivelLivroCaixaPf,
        impactaFatorRPj: exp.impactaFatorRPj,
        despesaOperacionalPj: exp.despesaOperacionalPj,
        totalCompetence: 0,
        totalPaid: 0,
        totalToPay: 0,
        totalOverdue: 0,
        countTransactions: 0,
        monthsCompetence: new Array(12).fill(0),
        monthsPaid: new Array(12).fill(0),
        monthsToPay: new Array(12).fill(0),
      };
      itemsMap.set(exp.categoryId, item);
    }

    item.countTransactions++;

    // Competence in year
    if (exp.competenceDate && exp.competenceDate.startsWith(`${year}-`)) {
      const m = parseInt(exp.competenceDate.substring(5, 7), 10);
      if (m >= 1 && m <= 12) {
        item.totalCompetence += exp.value;
        item.monthsCompetence[m - 1] += exp.value;
      }
    }

    // Cash Paid in year
    const payDate = exp.paymentDate || exp.dueDate;
    if (exp.status === 'PAGO' && payDate && payDate.startsWith(`${year}-`)) {
      const m = parseInt(payDate.substring(5, 7), 10);
      if (m >= 1 && m <= 12) {
        item.totalPaid += exp.value;
        item.monthsPaid[m - 1] += exp.value;
      }
    }

    // A Pagar in year
    if (
      (exp.status === 'A_PAGAR' || exp.status === 'VENCIDO') &&
      exp.dueDate &&
      exp.dueDate.startsWith(`${year}-`)) {
      const m = parseInt(exp.dueDate.substring(5, 7), 10);
      if (m >= 1 && m <= 12) {
        item.totalToPay += exp.value;
        item.monthsToPay[m - 1] += exp.value;
      }
    }

    if (exp.status === 'VENCIDO') {
      item.totalOverdue += exp.value;
    }
  });

  return Array.from(itemsMap.values()).sort((a, b) => a.code.localeCompare(b.code));
}
