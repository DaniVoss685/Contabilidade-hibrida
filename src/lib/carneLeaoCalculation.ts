import type { IrpfBracket, TaxRulesPf } from '../types';
import { CARNE_LEAO_RULES_2026 } from './carneLeaoRules';

export type CarneLeaoDeductionType = 'DEDUCOES_LEGAIS' | 'DESCONTO_SIMPLIFICADO';
export type CarneLeaoReductionBand = 'INTEGRAL' | 'PARCIAL' | 'SEM_REDUCAO' | 'NAO_APLICAVEL';

export interface CarneLeaoMonthlyInput {
  year: number;
  month: number;
  taxableIncome: number;
  livroCaixaExpensesPaid: number;
  previousLivroCaixaExcess: number;
  deductibleInss: number;
  deductibleDependents: number;
  deductibleAlimony?: number;
  otherLegalDeductions?: number;
  /** Required for years other than 2026; the statutory 2026 rules always come from the central config. */
  taxRules?: TaxRulesPf;
}

export interface CarneLeaoMonthlyResult {
  year: number;
  month: number;
  rendimentosTributaveis: number;
  despesasLivroCaixaMes: number;
  excessoLivroCaixaAnterior: number;
  livroCaixaDisponivel: number;
  livroCaixaUtilizado: number;
  excessoLivroCaixaProximoMes: number;
  excessoLivroCaixaEncerradoNoAno: number;
  inssDedutivel: number;
  dependentesDedutiveis: number;
  pensaoDedutivel: number;
  outrasDeducoesLegais: number;
  deducoesLegais: number;
  descontoSimplificado: number;
  deducaoEscolhida: number;
  tipoDeducaoEscolhida: CarneLeaoDeductionType;
  deducaoAplicada: number;
  baseCalculo: number;
  faixaTabela: number;
  aliquota: number;
  parcelaDeduzir: number;
  impostoTabela: number;
  faixaReducao2026: CarneLeaoReductionBand;
  reducaoEspecial: number;
  impostoFinal: number;
}

export type CarneLeaoScenario = 'REALIZADO' | 'PROJETADO';

/** Seleciona um resultado completo do mesmo motor, sem recombinar campos dos dois cenários. */
export function selectCarneLeaoScenario(
  realizado: CarneLeaoMonthlyResult,
  projetado: CarneLeaoMonthlyResult,
  scenario: CarneLeaoScenario
): CarneLeaoMonthlyResult {
  return scenario === 'PROJETADO' ? projetado : realizado;
}

function toCents(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round((value + Number.EPSILON) * 100));
}

function fromCents(value: number): number {
  return value / 100;
}

function selectBracket(baseCents: number, brackets: readonly IrpfBracket[]) {
  const selectedIndex = brackets.findIndex((bracket) => {
    const min = toCents(bracket.min);
    const max = Number.isFinite(bracket.max) ? toCents(bracket.max) : Number.POSITIVE_INFINITY;
    return baseCents >= min && baseCents <= max;
  });
  const index = selectedIndex >= 0 ? selectedIndex : Math.max(0, brackets.length - 1);
  return { bracket: brackets[index], index };
}

/** Apuração mensal pura, em centavos, com memória auditável de todas as etapas. */
export function calculateCarneLeaoMensal(input: CarneLeaoMonthlyInput): CarneLeaoMonthlyResult {
  const { year, month } = input;
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('O mês do Carnê-Leão precisa estar entre 1 e 12.');
  }

  const rules = input.year === CARNE_LEAO_RULES_2026.year ? CARNE_LEAO_RULES_2026 : input.taxRules;
  const brackets = (rules?.brackets || CARNE_LEAO_RULES_2026.brackets) as readonly IrpfBracket[];
  const simplifiedDiscountCents = toCents(
    input.year === CARNE_LEAO_RULES_2026.year
      ? CARNE_LEAO_RULES_2026.simplifiedDiscountMonthly
      : input.taxRules?.simplifiedDiscountLimitMonthly
  );

  const incomeCents = toCents(input.taxableIncome);
  const expensesCents = toCents(input.livroCaixaExpensesPaid);
  const previousExcessCents = toCents(input.previousLivroCaixaExcess);
  const availableLivroCaixaCents = expensesCents + previousExcessCents;
  const usedLivroCaixaCents = Math.min(availableLivroCaixaCents, incomeCents);
  const excessLivroCaixaCents = Math.max(0, availableLivroCaixaCents - usedLivroCaixaCents);

  const inssCents = toCents(input.deductibleInss);
  const dependentsCents = toCents(input.deductibleDependents);
  const alimonyCents = toCents(input.deductibleAlimony);
  const otherLegalCents = toCents(input.otherLegalDeductions);
  const legalDeductionsCents =
    usedLivroCaixaCents + inssCents + dependentsCents + alimonyCents + otherLegalCents;
  const selectedDeductionType: CarneLeaoDeductionType =
    legalDeductionsCents >= simplifiedDiscountCents ? 'DEDUCOES_LEGAIS' : 'DESCONTO_SIMPLIFICADO';
  const chosenDeductionCents = Math.max(legalDeductionsCents, simplifiedDiscountCents);
  const appliedDeductionCents = Math.min(incomeCents, chosenDeductionCents);
  const baseCents = Math.max(0, incomeCents - appliedDeductionCents);

  const { bracket, index } = selectBracket(baseCents, brackets);
  const rate = bracket?.rate || 0;
  const tableDeductionCents = toCents(bracket?.deduction || 0);
  const tableTaxCents = Math.max(0, Math.round(baseCents * rate - tableDeductionCents));

  let reductionBand: CarneLeaoReductionBand = 'NAO_APLICAVEL';
  let specialReductionCents = 0;
  if (year === CARNE_LEAO_RULES_2026.year) {
    const reductionRules = CARNE_LEAO_RULES_2026.specialReduction;
    if (incomeCents <= toCents(reductionRules.fullReductionIncomeLimit)) {
      reductionBand = 'INTEGRAL';
      specialReductionCents = Math.min(tableTaxCents, toCents(reductionRules.fullReductionMaximum));
    } else if (incomeCents <= toCents(reductionRules.partialReductionIncomeLimit)) {
      reductionBand = 'PARCIAL';
      const theoreticalCents = Math.max(
        0,
        Math.round(
          toCents(reductionRules.partialReductionConstant) -
            reductionRules.partialReductionIncomeFactor * incomeCents
        )
      );
      specialReductionCents = Math.min(tableTaxCents, theoreticalCents);
    } else {
      reductionBand = 'SEM_REDUCAO';
    }
  }

  return {
    year,
    month,
    rendimentosTributaveis: fromCents(incomeCents),
    despesasLivroCaixaMes: fromCents(expensesCents),
    excessoLivroCaixaAnterior: fromCents(previousExcessCents),
    livroCaixaDisponivel: fromCents(availableLivroCaixaCents),
    livroCaixaUtilizado: fromCents(usedLivroCaixaCents),
    excessoLivroCaixaProximoMes: fromCents(excessLivroCaixaCents),
    excessoLivroCaixaEncerradoNoAno: month === 12 ? fromCents(excessLivroCaixaCents) : 0,
    inssDedutivel: fromCents(inssCents),
    dependentesDedutiveis: fromCents(dependentsCents),
    pensaoDedutivel: fromCents(alimonyCents),
    outrasDeducoesLegais: fromCents(otherLegalCents),
    deducoesLegais: fromCents(legalDeductionsCents),
    descontoSimplificado: fromCents(simplifiedDiscountCents),
    deducaoEscolhida: fromCents(chosenDeductionCents),
    tipoDeducaoEscolhida: selectedDeductionType,
    deducaoAplicada: fromCents(appliedDeductionCents),
    baseCalculo: fromCents(baseCents),
    faixaTabela: index + 1,
    aliquota: rate,
    parcelaDeduzir: fromCents(tableDeductionCents),
    impostoTabela: fromCents(tableTaxCents),
    faixaReducao2026: reductionBand,
    reducaoEspecial: fromCents(specialReductionCents),
    impostoFinal: fromCents(Math.max(0, tableTaxCents - specialReductionCents)),
  };
}
