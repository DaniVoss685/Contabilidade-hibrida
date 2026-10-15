import type { IrpfBracket } from '../types';

/**
 * Parâmetros mensais oficiais do Carnê-Leão para o ano-calendário de 2026.
 * Centralizados aqui para que o motor, as telas e os testes usem uma única fonte.
 * Fontes: tabela IRPF 2026 da Receita Federal e Lei nº 15.270/2025.
 */
export const CARNE_LEAO_RULES_2026 = {
  year: 2026,
  effectiveDate: '2026-01-01',
  dependentDeductionMonthly: 189.59,
  simplifiedDiscountMonthly: 607.20,
  brackets: [
    { min: 0, max: 2428.80, rate: 0, deduction: 0 },
    { min: 2428.81, max: 2826.65, rate: 0.075, deduction: 182.16 },
    { min: 2826.66, max: 3751.05, rate: 0.15, deduction: 394.16 },
    { min: 3751.06, max: 4664.68, rate: 0.225, deduction: 675.49 },
    { min: 4664.69, max: Number.POSITIVE_INFINITY, rate: 0.275, deduction: 908.73 },
  ] satisfies IrpfBracket[],
  specialReduction: {
    law: 'Lei nº 15.270/2025',
    fullReductionIncomeLimit: 5000,
    fullReductionMaximum: 312.89,
    partialReductionIncomeLimit: 7350,
    partialReductionConstant: 978.62,
    partialReductionIncomeFactor: 0.133145,
  },
} as const;
