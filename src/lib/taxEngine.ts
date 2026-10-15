import {
  TaxRulesPf,
  TaxRulesSimples,
  MonthlyPfTaxSummary,
  MonthlyPjTaxSummary,
  Sale,
  Expense,
  Professional,
  PayrollHistoryEntry,
  MonthlyFiscalHistoryEntry,
  SimplesAnnexRange,
} from '../types';

import {
  getOfficialMinimumWage as getMinWageCentral,
  getMinimumWageParameter,
  checkUpcomingYearWageReview,
  INITIAL_OFFICIAL_FISCAL_PARAMETERS,
} from './fiscalParameters';

import {
  calculateDashboardProjection,
  DashboardProjectionParams,
  DashboardProjectionResult,
  getCompetenceDateBounds,
} from './dashboardProjection';

import { isTaxableForCarneLeao } from './fiscalClassification';
import { getInstallmentGrossReceived } from './cardFees';
import { calculateCarneLeaoMensal } from './carneLeaoCalculation';
import { CARNE_LEAO_RULES_2026 } from './carneLeaoRules';

export {
  getMinimumWageParameter,
  checkUpcomingYearWageReview,
  calculateDashboardProjection,
  getCompetenceDateBounds,
};
export type { DashboardProjectionParams, DashboardProjectionResult };

// ==========================================
// 0. OFFICIAL MINIMUM WAGE & ROLLING WINDOW
// ==========================================

export const OFFICIAL_MINIMUM_WAGE_BY_YEAR: Record<number, number> = {
  2024: 1412.0,
  2025: 1518.0,
  2026: 1621.0,
};

export function getOfficialMinimumWage(yearOrDate: number | string = 2026): number {
  return getMinWageCentral(yearOrDate);
}

/**
 * Recalcula a janela dos últimos 12 meses (RBT12) incorporando a competência simulada.
 * Substitui o mês homólogo que sai da janela pelo faturamento simulado.
 */
export function calculateRollingRbt12(
  sales: Sale[],
  simulatedYearMonth: string,
  simulatedMonthlyRevenue: number,
  initialRbt12Base = 0
) {
  const [yearStr, monthStr] = (simulatedYearMonth || '2025-05').split('-');
  const simYear = parseInt(yearStr, 10) || 2025;
  const simMonth = parseInt(monthStr, 10) || 5;

  const windowMonths: string[] = [];
  for (let i = 12; i >= 1; i--) {
    let m = simMonth - i;
    let y = simYear;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    windowMonths.push(`${y}-${String(m).padStart(2, '0')}`);
  }

  let systemRecorded12m = 0;
  for (const s of sales) {
    if (s.taxOrigin !== 'CNPJ') continue;
    const saleYM = (s.serviceDate || '').substring(0, 7);
    if (windowMonths.includes(saleYM)) {
      systemRecorded12m += s.totalValue;
    }
  }

  const oldestMonth = windowMonths[0];
  let oldestMonthRevenue = 0;
  for (const s of sales) {
    if (s.taxOrigin !== 'CNPJ') continue;
    if ((s.serviceDate || '').startsWith(oldestMonth)) {
      oldestMonthRevenue += s.totalValue;
    }
  }

  if (oldestMonthRevenue === 0 && initialRbt12Base > 0) {
    oldestMonthRevenue = initialRbt12Base / 12;
  }

  const baseRbt12 = initialRbt12Base > 0 ? initialRbt12Base : systemRecorded12m;
  const newRbt12 = Math.max(0, baseRbt12 - oldestMonthRevenue + simulatedMonthlyRevenue);

  return {
    baseRbt12,
    systemRecorded12m,
    oldestMonth,
    replacedMonthRevenue: oldestMonthRevenue,
    newRbt12,
    windowMonths,
  };
}

// ==========================================
// 1. DEFAULT PARAMETRIZED TAX RULES BY YEAR
// ==========================================

export const DEFAULT_TAX_RULES_PF: Record<number, TaxRulesPf> = {
  2025: {
    year: 2025,
    effectiveDate: '2025-01-01',
    dependentDeductionMonthly: 189.59,
    simplifiedDiscountLimitMonthly: 564.80, // Desconto simplificado padrão mensal
    descontoSimplificadoMensal: 564.80,
    deducaoDependenteMensal: 189.59,
    brackets: [
      { min: 0, max: 2259.20, rate: 0.0, deduction: 0 },
      { min: 2259.21, max: 2826.65, rate: 0.075, deduction: 169.44 },
      { min: 2826.66, max: 3751.05, rate: 0.15, deduction: 381.44 },
      { min: 3751.06, max: 4664.68, rate: 0.225, deduction: 662.77 },
      { min: 4664.69, max: Infinity, rate: 0.275, deduction: 896.00 },
    ],
  },
  2026: {
    year: CARNE_LEAO_RULES_2026.year,
    effectiveDate: CARNE_LEAO_RULES_2026.effectiveDate,
    dependentDeductionMonthly: CARNE_LEAO_RULES_2026.dependentDeductionMonthly,
    simplifiedDiscountLimitMonthly: CARNE_LEAO_RULES_2026.simplifiedDiscountMonthly,
    descontoSimplificadoMensal: CARNE_LEAO_RULES_2026.simplifiedDiscountMonthly,
    deducaoDependenteMensal: CARNE_LEAO_RULES_2026.dependentDeductionMonthly,
    brackets: CARNE_LEAO_RULES_2026.brackets.map((bracket) => ({ ...bracket })),
  },
  2027: {
    year: 2027,
    effectiveDate: '2027-01-01',
    dependentDeductionMonthly: 210.00, // Projected / Configurable future table
    simplifiedDiscountLimitMonthly: 600.00,
    descontoSimplificadoMensal: 600.00,
    deducaoDependenteMensal: 210.00,
    brackets: [
      { min: 0, max: 2500.00, rate: 0.0, deduction: 0 },
      { min: 2500.01, max: 3200.00, rate: 0.075, deduction: 187.50 },
      { min: 3200.01, max: 4200.00, rate: 0.15, deduction: 427.50 },
      { min: 4200.01, max: 5200.00, rate: 0.225, deduction: 742.50 },
      { min: 5200.01, max: Infinity, rate: 0.275, deduction: 1002.50 },
    ],
  },
};

export const DEFAULT_SIMPLES_ANNEX_III: SimplesAnnexRange[] = [
  { rangeNumber: 1, rangeStart: 0, rangeEnd: 180000.00, nominalRate: 0.0600, deduction: 0 },
  { rangeNumber: 2, rangeStart: 180000.01, rangeEnd: 360000.00, nominalRate: 0.1120, deduction: 9360.00 },
  { rangeNumber: 3, rangeStart: 360000.01, rangeEnd: 720000.00, nominalRate: 0.1350, deduction: 17640.00 },
  { rangeNumber: 4, rangeStart: 720000.01, rangeEnd: 1800000.00, nominalRate: 0.1600, deduction: 35640.00 },
  { rangeNumber: 5, rangeStart: 1800000.01, rangeEnd: 3600000.00, nominalRate: 0.2100, deduction: 125640.00 },
  { rangeNumber: 6, rangeStart: 3600000.01, rangeEnd: 4800000.00, nominalRate: 0.3300, deduction: 648000.00 },
];

export const DEFAULT_SIMPLES_ANNEX_V: SimplesAnnexRange[] = [
  { rangeNumber: 1, rangeStart: 0, rangeEnd: 180000.00, nominalRate: 0.1550, deduction: 0 },
  { rangeNumber: 2, rangeStart: 180000.01, rangeEnd: 360000.00, nominalRate: 0.1800, deduction: 4500.00 },
  { rangeNumber: 3, rangeStart: 360000.01, rangeEnd: 720000.00, nominalRate: 0.1950, deduction: 9900.00 },
  { rangeNumber: 4, rangeStart: 720000.01, rangeEnd: 1800000.00, nominalRate: 0.2050, deduction: 17100.00 },
  { rangeNumber: 5, rangeStart: 1800000.01, rangeEnd: 3600000.00, nominalRate: 0.2300, deduction: 62100.00 },
  { rangeNumber: 6, rangeStart: 3600000.01, rangeEnd: 4800000.00, nominalRate: 0.3050, deduction: 540000.00 },
];

export const DEFAULT_TAX_RULES_SIMPLES: Record<number, TaxRulesSimples> = {
  2025: {
    year: 2025,
    effectiveDate: '2025-01-01',
    annexIII: DEFAULT_SIMPLES_ANNEX_III,
    annexV: DEFAULT_SIMPLES_ANNEX_V,
    anexoIII: DEFAULT_SIMPLES_ANNEX_III,
    anexoV: DEFAULT_SIMPLES_ANNEX_V,
    fatorRThreshold: 0.28,
  },
  2026: {
    year: 2026,
    effectiveDate: '2026-01-01',
    annexIII: DEFAULT_SIMPLES_ANNEX_III,
    annexV: DEFAULT_SIMPLES_ANNEX_V,
    anexoIII: DEFAULT_SIMPLES_ANNEX_III,
    anexoV: DEFAULT_SIMPLES_ANNEX_V,
    fatorRThreshold: 0.28,
  },
  2027: {
    year: 2027,
    effectiveDate: '2027-01-01',
    annexIII: DEFAULT_SIMPLES_ANNEX_III,
    annexV: DEFAULT_SIMPLES_ANNEX_V,
    anexoIII: DEFAULT_SIMPLES_ANNEX_III,
    anexoV: DEFAULT_SIMPLES_ANNEX_V,
    fatorRThreshold: 0.28,
  },
};

// ==========================================
// 2. CPF TAX CALCULATION (CARNÊ-LEÃO / LIVRO CAIXA)
// ==========================================

interface CpfMonthlyCashData {
  receivedGrossCpf: number;
  projectedGrossCpf: number;
  deductibleLivroCaixaPaid: number;
  nonDeductiblePaid: number;
  conditionalPaid: number;
  deductibleLivroCaixaToPay: number;
}

function collectCpfMonthlyCashData(yearMonth: string, sales: Sale[], expenses: Expense[]): CpfMonthlyCashData {
  const data: CpfMonthlyCashData = {
    receivedGrossCpf: 0,
    projectedGrossCpf: 0,
    deductibleLivroCaixaPaid: 0,
    nonDeductiblePaid: 0,
    conditionalPaid: 0,
    deductibleLivroCaixaToPay: 0,
  };
  for (const sale of sales) {
    if (sale.taxOrigin !== 'CPF') continue;
    for (const installment of sale.installments) {
      if (!isTaxableForCarneLeao(installment.fiscalClassification, installment.documentRequested)) continue;
      if (installment.status === 'RECEBIDO') {
        if (installment.paymentDate?.startsWith(yearMonth)) {
          const received = getInstallmentGrossReceived(installment);
          data.receivedGrossCpf += received;
          data.projectedGrossCpf += received;
        }
        continue;
      }
      if (installment.dueDate?.startsWith(yearMonth) && installment.status !== 'CANCELADO') {
        data.projectedGrossCpf += installment.value;
      }
    }
  }
  for (const expense of expenses) {
    if (expense.entity !== 'CPF' || expense.value <= 0) continue;
    const isBookCashEligible =
      expense.dedutivelLivroCaixaPf === 'SIM' || expense.dedutivelLivroCaixaPf === 'CONDICIONAL';
    if (expense.status === 'PAGO' && expense.paymentDate?.startsWith(yearMonth)) {
      if (expense.dedutivelLivroCaixaPf === 'SIM') data.deductibleLivroCaixaPaid += expense.value;
      else if (expense.dedutivelLivroCaixaPf === 'CONDICIONAL') {
        data.conditionalPaid += expense.value;
        data.deductibleLivroCaixaPaid += expense.value;
      } else data.nonDeductiblePaid += expense.value;
    } else if (
      expense.status !== 'PAGO' &&
      expense.status !== 'CANCELADO' &&
      expense.dueDate?.startsWith(yearMonth) &&
      isBookCashEligible
    ) {
      data.deductibleLivroCaixaToPay += expense.value;
    }
  }
  return data;
}

function getPfTaxRules(year: number, customRules?: TaxRulesPf): TaxRulesPf {
  if (year === CARNE_LEAO_RULES_2026.year) return DEFAULT_TAX_RULES_PF[2026];
  if (customRules && Array.isArray(customRules.brackets) && customRules.brackets.length > 0) return customRules;
  return DEFAULT_TAX_RULES_PF[year] || DEFAULT_TAX_RULES_PF[2025];
}

function calculateCpfYearToMonth(
  sales: Sale[],
  expenses: Expense[],
  yearMonth: string,
  year: number,
  customRules: TaxRulesPf | undefined,
  dependentCount: number,
  inssProprio: number
) {
  const targetMonth = Number(yearMonth.slice(5, 7));
  const rules = getPfTaxRules(year, customRules);
  const dependentDeduction = Math.max(0, dependentCount || 0) * rules.dependentDeductionMonthly;
  let previousExcess = 0;
  let realized;
  let targetData = collectCpfMonthlyCashData(yearMonth, sales, expenses);
  for (let month = 1; month <= targetMonth; month += 1) {
    const monthKey = year + '-' + String(month).padStart(2, '0');
    const data = collectCpfMonthlyCashData(monthKey, sales, expenses);
    const monthResult = calculateCarneLeaoMensal({
      year,
      month,
      taxableIncome: data.receivedGrossCpf,
      livroCaixaExpensesPaid: data.deductibleLivroCaixaPaid,
      previousLivroCaixaExcess: previousExcess,
      deductibleInss: inssProprio,
      deductibleDependents: dependentDeduction,
      taxRules: rules,
    });
    if (month === targetMonth) {
      realized = monthResult;
      targetData = data;
    } else {
      previousExcess = month < 12 ? monthResult.excessoLivroCaixaProximoMes : 0;
    }
  }
  const projected = calculateCarneLeaoMensal({
    year,
    month: targetMonth,
    taxableIncome: targetData.projectedGrossCpf,
    livroCaixaExpensesPaid: targetData.deductibleLivroCaixaPaid + targetData.deductibleLivroCaixaToPay,
    previousLivroCaixaExcess: previousExcess,
    deductibleInss: inssProprio,
    deductibleDependents: dependentDeduction,
    taxRules: rules,
  });
  return { rules, targetData, previousExcess, realized: realized!, projected };
}

/** Compatibility wrapper; both public PF APIs share the same calculation path. */
export function calculateMonthlyPfTax(
  yearMonth: string,
  sales: Sale[],
  expenses: Expense[],
  professional: Professional,
  customRules?: TaxRulesPf
): MonthlyPfTaxSummary {
  const calculation = calculateCpfMonthlyTax(
    sales,
    expenses,
    yearMonth,
    Number(yearMonth.slice(0, 4)),
    customRules,
    professional.numDependentes || 0,
    professional.inssProprioMensal || 0
  );
  return {
    month: yearMonth,
    year: Number(yearMonth.slice(0, 4)),
    receivedGrossCpf: calculation.grossRevenueReceived,
    projectedGrossCpf: calculation.grossRevenueProjected,
    deductibleLivroCaixaPaid: calculation.deductibleExpensesLivroCaixa,
    nonDeductiblePaid: calculation.nonDeductibleExpenses,
    conditionalPaid: calculation.conditionalExpenses,
    inssProprioDeduction: calculation.inssDeductionTotal,
    dependentDeduction: calculation.dependentDeductionTotal,
    simplifiedDiscountUsed: calculation.deductionOptionUsed === 'SIMPLIFICADO',
    simplifiedDiscountValue: calculation.simplifiedDiscountAmount,
    legalDeductionsValue: calculation.legalDeductionsTotal,
    selectedDeductionType: calculation.deductionOptionUsed === 'SIMPLIFICADO' ? 'SIMPLIFICADO' : 'LEGAL',
    additionalReduction2026: calculation.additionalReduction,
    irpfBeforeReduction: calculation.taxBeforeReduction,
    reductionFormulaDescription: calculation.reductionFormulaDescription,
    effectiveDeductions: calculation.legalDeductionsTotal,
    taxableBaseRealized: calculation.taxBase,
    taxableBaseProjected: calculation.taxableBaseProjected,
    irpfRealized: calculation.carneLeaoEstimated,
    irpfProjected: calculation.irpfProjected,
    effectiveRate: calculation.grossRevenueReceived > 0
      ? calculation.carneLeaoEstimated / calculation.grossRevenueReceived
      : 0,
    exemptionLimitMonthly: calculation.exemptionLimitMonthly,
    remainingExemptionBalance: calculation.remainingExemptionBalance,
    isExemptionLimitReached: calculation.isExemptionLimitReached,
    exemptionUsagePercent: calculation.exemptionUsagePercent,
    baseExemptionFloor: calculation.baseExemptionFloor,
    exemptionLimitCurrent: calculation.exemptionLimitCurrent,
    deductibleExpensesToPay: calculation.deductibleExpensesToPay,
    deductibleExpensesProjected: calculation.deductibleExpensesProjected,
    grossRevenueToReceive: calculation.grossRevenueToReceive,
    exemptionLimitProjected: calculation.exemptionLimitProjected,
    remainingExemptionProjected: calculation.remainingExemptionProjected,
    isExemptionLimitReachedProjected: calculation.isExemptionLimitReachedProjected,
    exemptionUsagePercentProjected: calculation.exemptionUsagePercentProjected,
    excessLivroCaixaPrevious: calculation.excessLivroCaixaPrevious,
    livroCaixaAvailable: calculation.livroCaixaAvailable,
    livroCaixaUsed: calculation.livroCaixaUsed,
    excessLivroCaixaNext: calculation.excessLivroCaixaNext,
    legalDeductionsTotal: calculation.legalDeductionsTotal,
    appliedDeduction: calculation.appliedDeduction,
    reductionBand2026: calculation.reductionBand2026,
  };
}

// ==========================================
// 3. CNPJ TAX CALCULATION (SIMPLES NACIONAL COM FATOR R)
// ==========================================

export function calculateMonthlyPjTax(
  yearMonth: string, // "YYYY-MM"
  sales: Sale[],
  payrollHistory: PayrollHistoryEntry[],
  professional: Professional,
  customSimplesRules?: TaxRulesSimples
): MonthlyPjTaxSummary {
  const [yearStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const rules = customSimplesRules || DEFAULT_TAX_RULES_SIMPLES[year] || DEFAULT_TAX_RULES_SIMPLES[2025];

  // 1. Receita Bruta PJ do mês (Competência ou Caixa)
  // No Simples Nacional odontológico padrão: Regime de Competência para emissão de NFS-e ou Caixa
  let grossRevenueRealized = 0;
  let grossRevenueProjected = 0;

  for (const sale of sales) {
    if (sale.taxOrigin !== 'CNPJ') continue;
    // Realized: sales in this competence month with at least one received installment or issued NFS-e
    if (sale.serviceDate.startsWith(yearMonth)) {
      grossRevenueRealized += sale.totalValue;
    }
    // Projected for due dates in this month
    for (const inst of sale.installments) {
      if (inst.dueDate.startsWith(yearMonth) && inst.status !== 'CANCELADO') {
        grossRevenueProjected += inst.value;
      }
    }
  }

  if (grossRevenueProjected === 0 && grossRevenueRealized > 0) {
    grossRevenueProjected = grossRevenueRealized;
  }

  // 2. RBT12 (Receita Bruta Acumulada dos últimos 12 meses anteriores ao período de apuração)
  // Base inicial de cadastro + soma de vendas CNPJ dos 12 meses anteriores
  const rbt12 = professional.rbt12Inicial || 0;

  // 3. FS12 (Folha de Salários Acumulada dos últimos 12 meses, incluindo encargos e pró-labore)
  let calculatedFs12 = 0;
  if (payrollHistory && payrollHistory.length > 0) {
    // take last 12 entries
    const last12 = payrollHistory.slice(-12);
    calculatedFs12 = last12.reduce((acc, curr) => acc + curr.totalPayroll, 0);
  }
  const fs12 = calculatedFs12 > 0 ? calculatedFs12 : (professional.folha12MesesInicial || 0);

  // 4. FATOR R = FS12 / RBT12
  const fatorR = rbt12 > 0 ? (fs12 / rbt12) : 0;
  const isAnexoIII = fatorR >= rules.fatorRThreshold;
  const annex: 'ANEXO_III' | 'ANEXO_V' = isAnexoIII ? 'ANEXO_III' : 'ANEXO_V';
  const tableRanges = isAnexoIII ? rules.annexIII : rules.annexV;

  // 5. Encontrar Faixa do Simples correspondente ao RBT12
  let selectedRange = tableRanges[0];
  for (const range of tableRanges) {
    if (rbt12 >= range.rangeStart && rbt12 <= range.rangeEnd) {
      selectedRange = range;
      break;
    }
  }

  // 6. Alíquota Efetiva:
  // Alíquota efetiva = (RBT12 × alíquota nominal - parcela a deduzir) / RBT12
  let effectiveRate = 0;
  if (rbt12 > 0) {
    effectiveRate = (rbt12 * selectedRange.nominalRate - selectedRange.deduction) / rbt12;
    if (effectiveRate < 0) effectiveRate = selectedRange.nominalRate;
  } else {
    effectiveRate = selectedRange.nominalRate;
  }

  // 7. DAS Estimado:
  // Receita tributável do período × alíquota efetiva
  const dasRealized = grossRevenueRealized * effectiveRate;
  const dasProjected = grossRevenueProjected * effectiveRate;

  return {
    month: yearMonth,
    year,
    grossRevenueRealized,
    grossRevenueProjected,
    rbt12,
    fs12,
    fatorR,
    isAnexoIII,
    annex,
    nominalRate: selectedRange.nominalRate,
    deductionRange: selectedRange.deduction,
    effectiveRate,
    dasRealized,
    dasProjected,
  };
}

// ==========================================
// 4. EXTENDED TAX & CASHFLOW UTILITIES FOR UI
// ==========================================

function makeCpfMonthSummary(
  yearMonth: string,
  year: number,
  dependentCount: number,
  context: ReturnType<typeof calculateCpfYearToMonth>
) {
  const { rules, targetData, previousExcess, realized, projected } = context;
  const deductionOptionUsed = realized.tipoDeducaoEscolhida === 'DESCONTO_SIMPLIFICADO'
    ? 'SIMPLIFICADO'
    : 'LEGAL';
  const reductionRules = CARNE_LEAO_RULES_2026.specialReduction;
  const reductionFormulaDescription =
    realized.faixaReducao2026 === 'INTEGRAL'
      ? 'Redução integral do imposto, limitada ao teto legal e ao imposto calculado (' + reductionRules.law + ').'
      : realized.faixaReducao2026 === 'PARCIAL'
      ? 'Redução parcial calculada sobre os rendimentos tributáveis do mês (' + reductionRules.law + ').'
      : realized.faixaReducao2026 === 'SEM_REDUCAO'
      ? 'Sem redução especial para rendimentos acima da faixa prevista em lei (' + reductionRules.law + ').'
      : 'Sem redução especial para este ano-calendário.';
  const exemptionThreshold = year === 2026 ? reductionRules.fullReductionIncomeLimit : 0;
  const remaining = (income: number) => Math.max(0, exemptionThreshold - income);
  const usage = (income: number) => exemptionThreshold > 0
    ? Math.min(100, (income / exemptionThreshold) * 100)
    : 0;

  return {
    month: yearMonth,
    year,
    isAnnualSummary: false,
    annualSummary: null,
    monthlyResults: undefined,
    monthlyCalculations: [realized],
    grossRevenueReceived: realized.rendimentosTributaveis,
    grossRevenueProjected: projected.rendimentosTributaveis,
    grossRevenueToReceive: Math.max(0, projected.rendimentosTributaveis - realized.rendimentosTributaveis),
    deductibleExpensesLivroCaixa: realized.despesasLivroCaixaMes,
    nonDeductibleExpenses: targetData.nonDeductiblePaid,
    conditionalExpenses: targetData.conditionalPaid,
    deductibleExpensesToPay: targetData.deductibleLivroCaixaToPay,
    deductibleExpensesProjected: targetData.deductibleLivroCaixaPaid + targetData.deductibleLivroCaixaToPay,
    dependentCount: Math.max(0, dependentCount || 0),
    dependentDeductionTotal: realized.dependentesDedutiveis,
    inssDeductionTotal: realized.inssDedutivel,
    deductionOptionUsed,
    deductionType: realized.tipoDeducaoEscolhida,
    simplifiedDiscountAmount: realized.descontoSimplificado,
    legalDeductionsTotal: realized.deducoesLegais,
    effectivePersonalDeduction:
      realized.inssDedutivel + realized.dependentesDedutiveis +
      realized.pensaoDedutivel + realized.outrasDeducoesLegais,
    appliedDeduction: realized.deducaoAplicada,
    taxBase: realized.baseCalculo,
    taxableBaseProjected: projected.baseCalculo,
    bracketNumber: realized.faixaTabela,
    nominalRate: realized.aliquota,
    deductionAmount: realized.parcelaDeduzir,
    taxBeforeReduction: realized.impostoTabela,
    additionalReduction: realized.reducaoEspecial,
    reductionBand2026: realized.faixaReducao2026,
    reductionFormulaDescription,
    carneLeaoEstimated: realized.impostoFinal,
    irpfProjected: projected.impostoFinal,
    effectiveTaxRate: realized.rendimentosTributaveis > 0
      ? (realized.impostoFinal / realized.rendimentosTributaveis) * 100
      : 0,
    excessLivroCaixaPrevious: realized.excessoLivroCaixaAnterior,
    livroCaixaAvailable: realized.livroCaixaDisponivel,
    livroCaixaUsed: realized.livroCaixaUtilizado,
    excessLivroCaixaNext: realized.excessoLivroCaixaProximoMes,
    excessLivroCaixaClosedAtYearEnd: realized.excessoLivroCaixaEncerradoNoAno,
    legalDeductionsBreakdown: {
      inss: realized.inssDedutivel,
      dependents: realized.dependentesDedutiveis,
      alimony: realized.pensaoDedutivel,
      other: realized.outrasDeducoesLegais,
      livroCaixaUsed: realized.livroCaixaUtilizado,
    },
    monthlyCalculation: realized,
    projectedCalculation: projected,
    exemptionLimitMonthly: exemptionThreshold,
    remainingExemptionBalance: remaining(realized.rendimentosTributaveis),
    isExemptionLimitReached:
      exemptionThreshold > 0 && realized.rendimentosTributaveis >= exemptionThreshold,
    exemptionUsagePercent: usage(realized.rendimentosTributaveis),
    baseExemptionFloor: exemptionThreshold,
    exemptionLimitCurrent: exemptionThreshold,
    exemptionLimitProjected: exemptionThreshold,
    remainingExemptionProjected: remaining(projected.rendimentosTributaveis),
    isExemptionLimitReachedProjected:
      exemptionThreshold > 0 && projected.rendimentosTributaveis >= exemptionThreshold,
    exemptionUsagePercentProjected: usage(projected.rendimentosTributaveis),
    previousExcess,
    rules,
  };
}

function roundTaxSum(values: number[]): number {
  return Math.round((values.reduce((total, value) => total + value, 0) + Number.EPSILON) * 100) / 100;
}

export function calculateCpfMonthlyTax(
  sales: Sale[],
  expenses: Expense[],
  yearMonth: string,
  year: number,
  customRules?: TaxRulesPf,
  dependentCount = 0,
  inssProprio = 0
) {
  if (yearMonth === String(year)) {
    const monthlyResults = Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const monthKey = year + '-' + String(month).padStart(2, '0');
      const context = calculateCpfYearToMonth(
        sales, expenses, monthKey, year, customRules, dependentCount, inssProprio
      );
      return makeCpfMonthSummary(monthKey, year, dependentCount, context);
    });
    const monthlyCalculations = monthlyResults.map((result) => result.monthlyCalculation);
    const lastMonth = monthlyResults[11];
    const sum = (getValue: (result: (typeof monthlyResults)[number]) => number) =>
      roundTaxSum(monthlyResults.map(getValue));
    const annualSummary = {
      grossRevenueReceived: sum((result) => result.grossRevenueReceived),
      projectedGrossRevenue: sum((result) => result.grossRevenueProjected),
      deductibleExpensesPaid: sum((result) => result.deductibleExpensesLivroCaixa),
      livroCaixaUsed: sum((result) => result.livroCaixaUsed),
      projectedLivroCaixaUsed: sum((result) => result.projectedCalculation.livroCaixaUtilizado),
      legalDeductions: sum((result) => result.legalDeductionsTotal),
      projectedLegalDeductions: sum((result) => result.projectedCalculation.deducoesLegais),
      simplifiedDiscountsAvailable: sum((result) => result.simplifiedDiscountAmount),
      projectedSimplifiedDiscountsAvailable: sum((result) => result.projectedCalculation.descontoSimplificado),
      appliedDeductions: sum((result) => result.appliedDeduction),
      projectedAppliedDeductions: sum((result) => result.projectedCalculation.deducaoAplicada),
      taxableBase: sum((result) => result.taxBase),
      projectedTaxableBase: sum((result) => result.taxableBaseProjected),
      tableTax: sum((result) => result.taxBeforeReduction),
      projectedTableTax: sum((result) => result.projectedCalculation.impostoTabela),
      specialReduction: sum((result) => result.additionalReduction),
      projectedSpecialReduction: sum((result) => result.projectedCalculation.reducaoEspecial),
      finalTax: sum((result) => result.carneLeaoEstimated),
      projectedFinalTax: sum((result) => result.irpfProjected),
      excessClosedAtYearEnd: lastMonth.monthlyCalculation.excessoLivroCaixaEncerradoNoAno,
    };

    return {
      ...lastMonth,
      month: yearMonth,
      isAnnualSummary: true,
      annualSummary,
      monthlyResults,
      monthlyCalculations,
      grossRevenueReceived: annualSummary.grossRevenueReceived,
      grossRevenueProjected: sum((result) => result.grossRevenueProjected),
      grossRevenueToReceive: sum((result) => result.grossRevenueToReceive),
      deductibleExpensesLivroCaixa: annualSummary.deductibleExpensesPaid,
      nonDeductibleExpenses: sum((result) => result.nonDeductibleExpenses),
      conditionalExpenses: sum((result) => result.conditionalExpenses),
      deductibleExpensesToPay: sum((result) => result.deductibleExpensesToPay),
      deductibleExpensesProjected: sum((result) => result.deductibleExpensesProjected),
      dependentDeductionTotal: sum((result) => result.dependentDeductionTotal),
      inssDeductionTotal: sum((result) => result.inssDeductionTotal),
      deductionOptionUsed: 'POR_COMPETENCIA',
      deductionType: 'POR_COMPETENCIA',
      simplifiedDiscountAmount: sum((result) => result.simplifiedDiscountAmount),
      legalDeductionsTotal: annualSummary.legalDeductions,
      effectivePersonalDeduction: sum((result) => result.effectivePersonalDeduction),
      appliedDeduction: annualSummary.appliedDeductions,
      taxBase: annualSummary.taxableBase,
      taxableBaseProjected: sum((result) => result.taxableBaseProjected),
      bracketNumber: 0,
      nominalRate: 0,
      deductionAmount: 0,
      taxBeforeReduction: annualSummary.tableTax,
      additionalReduction: annualSummary.specialReduction,
      reductionBand2026: 'POR_COMPETENCIA',
      carneLeaoEstimated: annualSummary.finalTax,
      irpfProjected: sum((result) => result.irpfProjected),
      effectiveTaxRate: annualSummary.grossRevenueReceived > 0
        ? (annualSummary.finalTax / annualSummary.grossRevenueReceived) * 100
        : 0,
      excessLivroCaixaPrevious: 0,
      livroCaixaAvailable: sum((result) => result.livroCaixaAvailable),
      livroCaixaUsed: annualSummary.livroCaixaUsed,
      excessLivroCaixaNext: annualSummary.excessClosedAtYearEnd,
      excessLivroCaixaClosedAtYearEnd: annualSummary.excessClosedAtYearEnd,
      exemptionLimitMonthly: 0,
      remainingExemptionBalance: 0,
      isExemptionLimitReached: false,
      exemptionUsagePercent: 0,
      baseExemptionFloor: 0,
      exemptionLimitCurrent: 0,
      exemptionLimitProjected: 0,
      remainingExemptionProjected: 0,
      isExemptionLimitReachedProjected: false,
      exemptionUsagePercentProjected: 0,
    };
  }

  const context = calculateCpfYearToMonth(
    sales, expenses, yearMonth, year, customRules, dependentCount, inssProprio
  );
  return makeCpfMonthSummary(yearMonth, year, dependentCount, context);
}

export const DEFAULT_FATOR_R_THRESHOLD = 0.28;

/**
 * Regra do limiar do Fator R: FS12 / RBT12 >= limiar → Anexo III (inclusive no 28,00% exato).
 * A comparação é feita em centavos inteiros (nunca por divisão em ponto flutuante), para que
 * valores como 28,00% não caiam para 27,999…% por erro de representação.
 * RBT12 <= 0 nunca classifica: não existe Fator R sem receita (o chamador trata o estado explicitamente).
 */
export function isFatorRAtOrAboveThreshold(
  fs12: number,
  rbt12: number,
  threshold: number = DEFAULT_FATOR_R_THRESHOLD
): boolean {
  const rbtCents = Math.round(Math.max(0, rbt12) * 100);
  const fsCents = Math.round(Math.max(0, fs12) * 100);
  if (rbtCents <= 0) return false;
  const thresholdBps = Math.round(threshold * 10000);
  return fsCents * 10000 >= thresholdBps * rbtCents;
}

/** Faturamento PJ (NFS-e) da competência — usado pelo motor e pela estimativa canônica. */
export function sumCnpjRevenueForCompetence(sales: Sale[], yearMonth: string): number {
  let total = 0;
  for (const sale of sales) {
    if (sale.taxOrigin !== 'CNPJ') continue;
    if ((sale.serviceDate || '').startsWith(yearMonth)) {
      total += sale.totalValue;
    }
  }
  return total;
}

export function calculateSimplesForParameters(
  rbt12: number,
  fs12: number,
  monthlyRevenueNfse: number,
  year = 2025,
  customRules?: TaxRulesSimples
) {
  const rules =
    (customRules && (customRules.annexIII || customRules.anexoIII) ? customRules : null) ||
    DEFAULT_TAX_RULES_SIMPLES[year] ||
    DEFAULT_TAX_RULES_SIMPLES[2025];

  const safeRbt12 = Math.max(0, rbt12);
  const safeFs12 = Math.max(0, fs12);
  const safeRevenue = Math.max(0, monthlyRevenueNfse);

  // Fator R = FS12 / RBT12
  const fatorR = safeRbt12 > 0 ? safeFs12 / safeRbt12 : 0;
  const fatorRPercent = fatorR * 100;
  const threshold = typeof rules.fatorRThreshold === 'number' ? rules.fatorRThreshold : DEFAULT_FATOR_R_THRESHOLD;
  const isAnexoIII = isFatorRAtOrAboveThreshold(safeFs12, safeRbt12, threshold);
  const effectiveAnnex: 'ANEXO_III' | 'ANEXO_V' = isAnexoIII ? 'ANEXO_III' : 'ANEXO_V';
  const rawRanges = isAnexoIII ? (rules.annexIII || rules.anexoIII) : (rules.annexV || rules.anexoV);
  const tableRanges =
    Array.isArray(rawRanges) && rawRanges.length > 0
      ? rawRanges
      : isAnexoIII
      ? DEFAULT_SIMPLES_ANNEX_III
      : DEFAULT_SIMPLES_ANNEX_V;

  // Identify Bracket
  let bracketNumber = 1;
  let selectedRange = tableRanges[0];
  for (let i = 0; i < tableRanges.length; i++) {
    const r = tableRanges[i];
    if (safeRbt12 >= r.rangeStart && safeRbt12 <= r.rangeEnd) {
      selectedRange = r;
      bracketNumber = i + 1;
      break;
    }
  }

  // Effective Rate Formula: (RBT12 × Aliquota Nominal - Parcela a Deduzir) / RBT12
  let effectiveTaxRateDecimal = 0;
  if (safeRbt12 > 0) {
    effectiveTaxRateDecimal = (safeRbt12 * selectedRange.nominalRate - selectedRange.deduction) / safeRbt12;
    if (effectiveTaxRateDecimal < 0) effectiveTaxRateDecimal = selectedRange.nominalRate;
  } else {
    effectiveTaxRateDecimal = selectedRange.nominalRate;
  }

  const effectiveTaxRate = effectiveTaxRateDecimal * 100;
  const dasEstimated = safeRevenue * effectiveTaxRateDecimal;

  // Cálculo alternativo no outro anexo para medir a economia potencial:
  const rawAltRanges = isAnexoIII ? (rules.annexV || rules.anexoV) : (rules.annexIII || rules.anexoIII);
  const alternativeRanges =
    Array.isArray(rawAltRanges) && rawAltRanges.length > 0
      ? rawAltRanges
      : isAnexoIII
      ? DEFAULT_SIMPLES_ANNEX_V
      : DEFAULT_SIMPLES_ANNEX_III;

  let altRange = alternativeRanges[0];
  for (let i = 0; i < alternativeRanges.length; i++) {
    const r = alternativeRanges[i];
    if (safeRbt12 >= r.rangeStart && safeRbt12 <= r.rangeEnd) {
      altRange = r;
      break;
    }
  }

  let altEffectiveRateDecimal = safeRbt12 > 0 ? (safeRbt12 * altRange.nominalRate - altRange.deduction) / safeRbt12 : altRange.nominalRate;
  if (altEffectiveRateDecimal < 0) altEffectiveRateDecimal = altRange.nominalRate;
  const altDasEstimated = safeRevenue * altEffectiveRateDecimal;

  const potentialMonthlySavings = isAnexoIII
    ? Math.max(0, altDasEstimated - dasEstimated)
    : Math.max(0, dasEstimated - altDasEstimated);

  return {
    monthlyRevenueNfse: safeRevenue,
    rbt12: safeRbt12,
    fs12: safeFs12,
    fatorR,
    fatorRPercent,
    fatorRThreshold: threshold,
    isAnexoIII,
    effectiveAnnex,
    bracketNumber,
    nominalRate: selectedRange.nominalRate,
    deductionAmount: selectedRange.deduction,
    effectiveTaxRate,
    dasEstimated,
    potentialMonthlySavings,
  };
}

/**
 * Retorna os 12 meses anteriores à competência informada (do mais antigo para o mais recente).
 * Ex: Se referenceYearMonth = '2026-03', retorna ['2025-03', '2025-04', ..., '2026-02'].
 */
export function getRolling12Months(referenceYearMonth: string): string[] {
  const [yStr, mStr] = (referenceYearMonth || '2026-03').split('-');
  const refYear = parseInt(yStr, 10) || 2026;
  const refMonth = parseInt(mStr, 10) || 3;

  const months: string[] = [];
  for (let i = 12; i >= 1; i--) {
    let m = refMonth - i;
    let y = refYear;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    months.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

export interface RollingMonthDetail {
  month: string;
  cnpjRevenue: number;
  revenueSource: 'SISTEMA' | 'HISTORICO' | 'ESTIMADO' | 'ZERADO';
  payroll: number;
  payrollSource: 'SISTEMA' | 'HISTORICO' | 'ESTIMADO' | 'ZERADO';
}

export interface Rolling12MonthsComputation {
  months: RollingMonthDetail[];
  totalRbt12: number;
  totalFs12: number;
  fatorR: number;
  fatorRPercent: number;
  isConsolidatedTotal: boolean;
}

export function computeRolling12MonthsData(
  sales: Sale[],
  referenceYearMonth: string,
  payrollHistory?: PayrollHistoryEntry[],
  initialFiscalHistory?: MonthlyFiscalHistoryEntry[],
  rbt12Initial = 0,
  folha12MesesInicial = 0,
  forceConsolidated?: boolean
): Rolling12MonthsComputation {
  const isConsolidated =
    forceConsolidated ??
    (!initialFiscalHistory || initialFiscalHistory.length === 0);

  // MODO TOTAL CONSOLIDADO:
  // Utiliza estritamente os totais acumulados informados, SEM inventar divisão mensal artificial (RBT12 / 12).
  if (isConsolidated) {
    const totalRbt12 = Math.max(0, rbt12Initial);
    const totalFs12 = Math.max(0, folha12MesesInicial);
    const fatorR = totalRbt12 > 0 ? totalFs12 / totalRbt12 : 0;

    return {
      months: [], // Composição mês a mês não disponível neste modo
      totalRbt12,
      totalFs12,
      fatorR,
      fatorRPercent: fatorR * 100,
      isConsolidatedTotal: true,
    };
  }

  // MODO DETALHADO MÊS A MÊS:
  // Calcula a composição dos 12 meses anteriores com janela móvel.
  const windowMonths = getRolling12Months(referenceYearMonth);
  const initialMap = new Map<string, MonthlyFiscalHistoryEntry>();
  if (initialFiscalHistory && initialFiscalHistory.length > 0) {
    for (const item of initialFiscalHistory) {
      initialMap.set(item.month, item);
    }
  }

  const payrollMap = new Map<string, PayrollHistoryEntry>();
  if (payrollHistory && payrollHistory.length > 0) {
    for (const item of payrollHistory) {
      payrollMap.set(item.month, item);
    }
  }

  const salesMap = new Map<string, number>();
  for (const s of sales) {
    if (s.taxOrigin !== 'CNPJ') continue;
    const m = (s.serviceDate || '').substring(0, 7);
    if (m) {
      salesMap.set(m, (salesMap.get(m) || 0) + s.totalValue);
    }
  }

  const details: RollingMonthDetail[] = [];
  let totalRbt12 = 0;
  let totalFs12 = 0;

  for (const month of windowMonths) {
    let cnpjRevenue = 0;
    let revenueSource: RollingMonthDetail['revenueSource'] = 'ZERADO';

    if (salesMap.has(month)) {
      cnpjRevenue = salesMap.get(month)!;
      revenueSource = 'SISTEMA';
    } else if (initialMap.has(month)) {
      cnpjRevenue = initialMap.get(month)!.cnpjRevenue || 0;
      revenueSource = 'HISTORICO';
    }

    let payroll = 0;
    let payrollSource: RollingMonthDetail['payrollSource'] = 'ZERADO';

    if (payrollMap.has(month)) {
      payroll = payrollMap.get(month)!.totalPayroll;
      payrollSource = 'SISTEMA';
    } else if (initialMap.has(month)) {
      payroll = initialMap.get(month)!.payroll || 0;
      payrollSource = 'HISTORICO';
    }

    totalRbt12 += cnpjRevenue;
    totalFs12 += payroll;

    details.push({
      month,
      cnpjRevenue,
      revenueSource,
      payroll,
      payrollSource,
    });
  }

  const fatorR = totalRbt12 > 0 ? totalFs12 / totalRbt12 : 0;
  const fatorRPercent = fatorR * 100;

  return {
    months: details,
    totalRbt12,
    totalFs12,
    fatorR,
    fatorRPercent,
    isConsolidatedTotal: false,
  };
}

export function calculateSimplesNacionalMonthlyTax(
  sales: Sale[],
  yearMonth: string,
  year: number,
  customRules?: TaxRulesSimples,
  payrollHistory?: PayrollHistoryEntry[],
  rbt12Initial = 0,
  folha12MesesInicial = 0,
  initialFiscalHistory?: MonthlyFiscalHistoryEntry[],
  isConsolidated?: boolean
) {
  const monthlyRevenueNfse = sumCnpjRevenueForCompetence(sales, yearMonth);

  const rolling = computeRolling12MonthsData(
    sales,
    yearMonth,
    payrollHistory,
    initialFiscalHistory,
    rbt12Initial,
    folha12MesesInicial,
    isConsolidated
  );

  return calculateSimplesForParameters(
    rolling.totalRbt12,
    rolling.totalFs12,
    monthlyRevenueNfse,
    year,
    customRules
  );
}

export function getMonthlyReceivablesSummary(sales: Sale[], yearMonth: string) {
  const proj = calculateDashboardProjection({
    sales,
    expenses: [],
    competence: yearMonth,
    viewMode: 'PROJETADO',
  });

  return {
    totalReceived: proj.realizedRevenue.total,
    cpfReceived: proj.realizedRevenue.cpf,
    cnpjReceived: proj.realizedRevenue.cnpj,
    totalToReceive: proj.openReceivables.total,
    totalPending: proj.openReceivables.total,
    totalOverdue: proj.openReceivables.overdue,
    overdueAmount: proj.openReceivables.overdue,
    overdueItemsCount: proj.openReceivables.overdueCount,
    totalUpcoming: proj.openReceivables.upcoming,
    upcomingAmount: proj.openReceivables.upcoming,
    upcomingItemsCount: proj.openReceivables.upcomingCount,
    cpfToReceive: proj.openReceivables.cpf,
    cnpjToReceive: proj.openReceivables.cnpj,
    cpfProjected: proj.projectedRevenue.cpf,
    cnpjProjected: proj.projectedRevenue.cnpj,
    totalProjected: proj.projectedRevenue.total,
    countTotal: proj.activeRevenue.salesCount,
    salesCount: proj.activeRevenue.salesCount,
    installmentsCount: proj.projectedRevenue.count,
  };
}

export function getMonthlyExpensesSummary(expenses: Expense[], yearMonth: string) {
  const proj = calculateDashboardProjection({
    sales: [],
    expenses,
    competence: yearMonth,
    viewMode: 'PROJETADO',
  });

  return {
    totalPaid: proj.realizedExpenses.total,
    totalToPay: proj.openPayables.total,
    totalPending: proj.openPayables.total,
    totalOverdue: proj.openPayables.overdue,
    overdueAmount: proj.openPayables.overdue,
    overdueItemsCount: proj.openPayables.overdueCount,
    totalUpcoming: proj.openPayables.upcoming,
    upcomingAmount: proj.openPayables.upcoming,
    upcomingItemsCount: proj.openPayables.upcomingCount,
    cpfDeductiblePaid: proj.realizedExpenses.cpfDeductible,
    cpfDeductiblePending: proj.openPayables.cpfDeductible,
    cpfDeductibleProjected: proj.projectedExpenses.cpfDeductible,
    cnpjOperationalPaid: proj.realizedExpenses.cnpjOperational,
    cnpjOperationalPending: proj.openPayables.cnpjOperational,
    cnpjOperationalProjected: proj.projectedExpenses.cnpjOperational,
    totalCount: proj.realizedExpenses.count + proj.openPayables.count,
    totalExpensesProjected: proj.projectedExpenses.total,
  };
}

