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

export {
  getMinimumWageParameter,
  checkUpcomingYearWageReview,
};

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
    year: 2026,
    effectiveDate: '2026-01-01',
    dependentDeductionMonthly: 189.59,
    simplifiedDiscountLimitMonthly: 607.20,
    descontoSimplificadoMensal: 607.20,
    deducaoDependenteMensal: 189.59,
    brackets: [
      { min: 0, max: 2428.80, rate: 0.0, deduction: 0 },
      { min: 2428.81, max: 2826.65, rate: 0.075, deduction: 182.16 },
      { min: 2826.66, max: 3751.05, rate: 0.15, deduction: 394.16 },
      { min: 3751.06, max: 4664.68, rate: 0.225, deduction: 675.49 },
      { min: 4664.69, max: Infinity, rate: 0.275, deduction: 908.73 },
    ],
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

export function calculateMonthlyPfTax(
  yearMonth: string, // "YYYY-MM"
  sales: Sale[],
  expenses: Expense[],
  professional: Professional,
  customRules?: TaxRulesPf
): MonthlyPfTaxSummary {
  const [yearStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const rules =
    (customRules && Array.isArray(customRules.brackets) && customRules.brackets.length > 0 ? customRules : null) ||
    DEFAULT_TAX_RULES_PF[year] ||
    DEFAULT_TAX_RULES_PF[2025];

  // 1. Receitas PF:
  // IMPORTANTE:
  // Regime de Caixa no Carnê-Leão!
  // Realizado: parcelas de origem CPF efetivamente RECEBIDAS no mês (paymentDate inicia com YYYY-MM)
  // Projetado: parcelas vencendo no mês que ainda estão a receber + parcelas já recebidas no mês
  let receivedGrossCpf = 0;
  let projectedGrossCpf = 0;

  for (const sale of sales) {
    if (sale.taxOrigin !== 'CPF') continue;
    for (const inst of sale.installments) {
      // Realized: received in this month
      if (inst.status === 'RECEBIDO' && inst.paymentDate && inst.paymentDate.startsWith(yearMonth)) {
        receivedGrossCpf += inst.amountReceived || inst.value;
      }
      // Projected: due in this month (or already received in this month)
      if (inst.dueDate.startsWith(yearMonth) && inst.status !== 'CANCELADO') {
        if (inst.status === 'RECEBIDO') {
          projectedGrossCpf += inst.amountReceived || inst.value;
        } else {
          projectedGrossCpf += inst.value;
        }
      }
    }
  }

  // 2. Despesas Livro Caixa:
  // Efetivamente pagas no mês (paymentDate inicia com YYYY-MM) e vinculadas ao CPF (ou rateadas)
  let deductibleLivroCaixaPaid = 0;
  let nonDeductiblePaid = 0;
  let conditionalPaid = 0;

  for (const exp of expenses) {
    if (exp.status !== 'PAGO' || !exp.paymentDate || !exp.paymentDate.startsWith(yearMonth)) {
      continue;
    }

    // Determine value allocated to CPF
    let cpfPortion = 0;
    if (exp.entity === 'CPF') {
      cpfPortion = exp.value;
    }

    if (cpfPortion <= 0) continue;

    // Check classification
    if (exp.dedutivelLivroCaixaPf === 'SIM') {
      deductibleLivroCaixaPaid += cpfPortion;
    } else if (exp.dedutivelLivroCaixaPf === 'CONDICIONAL') {
      // Conditional: counted in conditional, and counted if explicitly accepted
      conditionalPaid += cpfPortion;
      // In conservative tax modeling, conditional expenses require accountant sign-off;
      // here we treat confirmed expenses as deductible with clear audit indication.
      deductibleLivroCaixaPaid += cpfPortion;
    } else {
      nonDeductiblePaid += cpfPortion;
    }
  }

  // 3. Deduções Legais Oficiais do Carnê-Leão:
  // - INSS próprio pago no mês (previdência oficial obrigatória do profissional autônomo)
  // - Dependentes cadastrados
  const inssProprioDeduction = professional.inssProprioMensal || 0;
  const dependentDeduction = (professional.numDependentes || 0) * rules.dependentDeductionMonthly;
  const totalLegalDeductions = inssProprioDeduction + dependentDeduction + deductibleLivroCaixaPaid;
  const legalDeductionsAfterLivroCaixa = inssProprioDeduction + dependentDeduction;

  // Desconto simplificado mensal alternativo:
  // Se as deduções legais forem menores que o desconto simplificado, pode ser vantajoso usar o desconto simplificado
  const simplifiedDiscount = rules.simplifiedDiscountLimitMonthly || (rules.year >= 2026 ? 607.20 : 564.80);
  const useSimplified = simplifiedDiscount > legalDeductionsAfterLivroCaixa;
  const selectedDeductionType: 'SIMPLIFICADO' | 'LEGAL' = useSimplified ? 'SIMPLIFICADO' : 'LEGAL';
  
  // No Carnê-Leão tradicional, Livro Caixa abate diretamente da receita.
  // Depois, sobre a receita líquida abatida de livro caixa, abate-se dependentes e previdência, ou desconto simplificado.
  const netAfterLivroCaixaRealized = Math.max(0, receivedGrossCpf - deductibleLivroCaixaPaid);
  const netAfterLivroCaixaProjected = Math.max(0, projectedGrossCpf - deductibleLivroCaixaPaid);

  const effectiveSubtractions = Math.max(legalDeductionsAfterLivroCaixa, useSimplified ? simplifiedDiscount : 0);

  const taxableBaseRealized = Math.max(0, netAfterLivroCaixaRealized - effectiveSubtractions);
  const taxableBaseProjected = Math.max(0, netAfterLivroCaixaProjected - effectiveSubtractions);

  // 4. Calcular IRPF Progressivo
  function computeIrpf(base: number): number {
    if (base <= 0) return 0;
    const brackets =
      rules && Array.isArray(rules.brackets) && rules.brackets.length > 0
        ? rules.brackets
        : DEFAULT_TAX_RULES_PF[year]?.brackets || DEFAULT_TAX_RULES_PF[2026].brackets;
    for (const b of brackets) {
      if (base >= b.min && base <= b.max) {
        const tax = base * b.rate - b.deduction;
        return Math.max(0, tax);
      }
    }
    const last = brackets[brackets.length - 1];
    return Math.max(0, base * last.rate - last.deduction);
  }

  const irpfBeforeReductionRealized = computeIrpf(taxableBaseRealized);
  const irpfBeforeReductionProjected = computeIrpf(taxableBaseProjected);

  // 5. Redução Adicional 2026 (Lei nº 15.191/2025 e Lei nº 15.270/2025)
  // Aplica-se a partir de 2026 com base no rendimento bruto tributável
  let additionalReductionRealized = 0;
  let reductionFormulaDesc = '';

  if (year >= 2026 && receivedGrossCpf > 0) {
    if (receivedGrossCpf <= 5000) {
      additionalReductionRealized = irpfBeforeReductionRealized;
      reductionFormulaDesc = 'Isenção total até R$ 5.000,00 (Lei nº 15.191/2025): redução zera o imposto apurado.';
    } else if (receivedGrossCpf <= 7350) {
      additionalReductionRealized = Math.max(0, 978.62 - (0.133145 * receivedGrossCpf));
      reductionFormulaDesc = `Redução decrescente (Lei nº 15.191/2025): 978,62 - (0,133145 × ${receivedGrossCpf.toFixed(2)}) = R$ ${additionalReductionRealized.toFixed(2)}`;
    } else {
      additionalReductionRealized = 0;
      reductionFormulaDesc = 'Rendimento superior a R$ 7.350,00: sem redução adicional aplicável (Lei nº 15.191/2025).';
    }
  }

  let additionalReductionProjected = 0;
  if (year >= 2026 && projectedGrossCpf > 0) {
    if (projectedGrossCpf <= 5000) {
      additionalReductionProjected = irpfBeforeReductionProjected;
    } else if (projectedGrossCpf <= 7350) {
      additionalReductionProjected = Math.max(0, 978.62 - (0.133145 * projectedGrossCpf));
    } else {
      additionalReductionProjected = 0;
    }
  }

  const irpfRealized = Math.max(0, irpfBeforeReductionRealized - additionalReductionRealized);
  const irpfProjected = Math.max(0, irpfBeforeReductionProjected - additionalReductionProjected);
  const effectiveRate = receivedGrossCpf > 0 ? (irpfRealized / receivedGrossCpf) : 0;

  return {
    month: yearMonth,
    year,
    receivedGrossCpf,
    projectedGrossCpf,
    deductibleLivroCaixaPaid,
    nonDeductiblePaid,
    conditionalPaid,
    inssProprioDeduction,
    dependentDeduction,
    simplifiedDiscountUsed: useSimplified,
    simplifiedDiscountValue: simplifiedDiscount,
    legalDeductionsValue: legalDeductionsAfterLivroCaixa,
    selectedDeductionType,
    additionalReduction2026: additionalReductionRealized,
    irpfBeforeReduction: irpfBeforeReductionRealized,
    reductionFormulaDescription: reductionFormulaDesc,
    effectiveDeductions: totalLegalDeductions,
    taxableBaseRealized,
    taxableBaseProjected,
    irpfRealized,
    irpfProjected,
    effectiveRate,
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

export function calculateCpfMonthlyTax(
  sales: Sale[],
  expenses: Expense[],
  yearMonth: string,
  year: number,
  customRules?: TaxRulesPf,
  dependentCount = 1,
  inssProprio = 750
) {
  const rules =
    (customRules && Array.isArray(customRules.brackets) && customRules.brackets.length > 0 ? customRules : null) ||
    DEFAULT_TAX_RULES_PF[year] ||
    DEFAULT_TAX_RULES_PF[2025];

  // 1. Gross received in CPF for this month (Cash basis / Regime de Caixa)
  let grossRevenueReceived = 0;
  let grossRevenueProjected = 0;

  for (const sale of sales) {
    if (sale.taxOrigin !== 'CPF') continue;
    for (const inst of sale.installments) {
      if (inst.status === 'RECEBIDO' && inst.paymentDate && inst.paymentDate.startsWith(yearMonth)) {
        grossRevenueReceived += inst.amountReceived || inst.value;
      }
      if (inst.dueDate.startsWith(yearMonth) && inst.status !== 'CANCELADO') {
        if (inst.status === 'RECEBIDO') {
          grossRevenueProjected += inst.amountReceived || inst.value;
        } else {
          grossRevenueProjected += inst.value;
        }
      }
    }
  }

  // 2. Deductible Expenses Livro Caixa
  let deductibleExpensesLivroCaixa = 0;
  let nonDeductibleExpenses = 0;
  let conditionalExpenses = 0;

  for (const exp of expenses) {
    if (exp.status !== 'PAGO' || !exp.paymentDate || !exp.paymentDate.startsWith(yearMonth)) {
      continue;
    }

    let cpfPortion = 0;
    if (exp.entity === 'CPF') {
      cpfPortion = exp.value;
    }

    if (cpfPortion <= 0) continue;

    if (exp.dedutivelLivroCaixaPf === 'SIM') {
      deductibleExpensesLivroCaixa += cpfPortion;
    } else if (exp.dedutivelLivroCaixaPf === 'CONDICIONAL') {
      conditionalExpenses += cpfPortion;
      deductibleExpensesLivroCaixa += cpfPortion; // Allowed with audit trail
    } else {
      nonDeductibleExpenses += cpfPortion;
    }
  }

  // 3. Official Legal Deductions
  const dependentDeductionTotal = (dependentCount || 0) * rules.dependentDeductionMonthly;
  const inssDeductionTotal = inssProprio || 0;
  const totalLegalPersonalDeductions = dependentDeductionTotal + inssDeductionTotal;

  // Compare with Simplified Monthly Discount
  const simplifiedDiscount = rules.simplifiedDiscountLimitMonthly;
  const deductionOptionUsed = simplifiedDiscount > totalLegalPersonalDeductions ? 'SIMPLIFICADO' : 'LEGAL';
  const effectivePersonalDeduction = Math.max(totalLegalPersonalDeductions, simplifiedDiscount);

  // Net Base after Livro Caixa
  const netAfterLivroCaixa = Math.max(0, grossRevenueReceived - deductibleExpensesLivroCaixa);
  const taxBase = Math.max(0, netAfterLivroCaixa - effectivePersonalDeduction);

  // Apply Progressive Table
  let bracketNumber = 1;
  let nominalRate = 0;
  let deductionAmount = 0;
  const brackets =
    rules && Array.isArray(rules.brackets) && rules.brackets.length > 0
      ? rules.brackets
      : DEFAULT_TAX_RULES_PF[year]?.brackets || DEFAULT_TAX_RULES_PF[2025].brackets;

  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    if (taxBase >= b.min && taxBase <= b.max) {
      bracketNumber = i + 1;
      nominalRate = b.rate;
      deductionAmount = b.deduction;
      break;
    }
  }

  const taxBeforeReduction = Math.max(0, taxBase * nominalRate - deductionAmount);
  let additionalReduction = 0;
  if (year >= 2026 && grossRevenueReceived > 0) {
    if (grossRevenueReceived <= 5000) {
      additionalReduction = taxBeforeReduction;
    } else if (grossRevenueReceived <= 7350) {
      additionalReduction = Math.max(0, 978.62 - (0.133145 * grossRevenueReceived));
    } else {
      additionalReduction = 0;
    }
  }
  const carneLeaoEstimated = Math.max(0, taxBeforeReduction - additionalReduction);
  const effectiveTaxRate = grossRevenueReceived > 0 ? (carneLeaoEstimated / grossRevenueReceived) * 100 : 0;

  return {
    grossRevenueReceived,
    grossRevenueProjected,
    deductibleExpensesLivroCaixa,
    nonDeductibleExpenses,
    conditionalExpenses,
    dependentCount,
    dependentDeductionTotal,
    inssDeductionTotal,
    deductionOptionUsed,
    simplifiedDiscountAmount: simplifiedDiscount,
    taxBase,
    bracketNumber,
    nominalRate,
    deductionAmount,
    taxBeforeReduction,
    additionalReduction,
    carneLeaoEstimated,
    effectiveTaxRate,
  };
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
  const threshold = typeof rules.fatorRThreshold === 'number' ? rules.fatorRThreshold : 0.28;
  const isAnexoIII = fatorR >= threshold;
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
  let monthlyRevenueNfse = 0;
  for (const sale of sales) {
    if (sale.taxOrigin !== 'CNPJ') continue;
    if (sale.serviceDate.startsWith(yearMonth)) {
      monthlyRevenueNfse += sale.totalValue;
    }
  }

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
  let totalReceived = 0;
  let cpfReceived = 0;
  let cnpjReceived = 0;
  let totalPending = 0;
  let totalOverdue = 0;
  let installmentsCount = 0;
  const salesInPeriod = new Set<string>();

  const todayStr = new Date().toISOString().split('T')[0];

  for (const s of sales) {
    let hasPeriodInstallment = false;
    for (const inst of s.installments) {
      if (inst.status === 'RECEBIDO') {
        if (inst.paymentDate && inst.paymentDate.startsWith(yearMonth)) {
          const val = inst.amountReceived || inst.value;
          totalReceived += val;
          if (s.taxOrigin === 'CPF') cpfReceived += val;
          else cnpjReceived += val;
          hasPeriodInstallment = true;
          installmentsCount++;
        }
      } else if (inst.status !== 'CANCELADO') {
        if (inst.dueDate.startsWith(yearMonth)) {
          totalPending += inst.value;
          if (inst.dueDate < todayStr) {
            totalOverdue += inst.value;
          }
          hasPeriodInstallment = true;
          installmentsCount++;
        }
      }
    }
    if (hasPeriodInstallment || (s.serviceDate && s.serviceDate.startsWith(yearMonth))) {
      salesInPeriod.add(s.id);
    }
  }

  const countTotal = salesInPeriod.size;

  return {
    totalReceived,
    cpfReceived,
    cnpjReceived,
    totalPending,
    totalOverdue,
    countTotal,
    salesCount: countTotal,
    installmentsCount,
  };
}

export function getMonthlyExpensesSummary(expenses: Expense[], yearMonth: string) {
  let totalPaid = 0;
  let cpfDeductiblePaid = 0;
  let cnpjOperationalPaid = 0;
  let totalPending = 0;
  let totalOverdue = 0;

  const todayStr = new Date().toISOString().split('T')[0];

  for (const exp of expenses) {
    if (exp.status === 'PAGO') {
      if (exp.paymentDate && exp.paymentDate.startsWith(yearMonth)) {
        totalPaid += exp.value;
        if (exp.entity === 'CPF' && exp.dedutivelLivroCaixaPf === 'SIM') {
          cpfDeductiblePaid += exp.value;
        }

        if (exp.entity === 'CNPJ' && exp.despesaOperacionalPj) {
          cnpjOperationalPaid += exp.value;
        }
      }
    } else if (exp.status !== 'CANCELADO') {
      if (exp.dueDate.startsWith(yearMonth)) {
        totalPending += exp.value;
        if (exp.dueDate < todayStr) {
          totalOverdue += exp.value;
        }
      }
    }
  }

  return {
    totalPaid,
    cpfDeductiblePaid,
    cnpjOperationalPaid,
    totalPending,
    totalOverdue,
  };
}

