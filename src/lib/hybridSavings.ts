import { calculateCarneLeaoMensal, type CarneLeaoMonthlyResult } from './carneLeaoCalculation';
import type { TaxRulesPf } from '../types';

/**
 * Comparação do modelo HÍBRIDO (parte da receita em PF/Carnê-Leão e parte em PJ/Simples) com as duas alternativas
 * "puras": tudo no Carnê-Leão ou tudo no CNPJ. Estimativa do imposto do mês, na mesma base do Dashboard.
 *
 * Premissas (ficam visíveis na tela):
 *  - Tudo no CPF: apuração do Carnê-Leão sobre a receita total, com as MESMAS despesas de Livro Caixa, excesso
 *    trazido, INSS e dependentes do mês (calculateCarneLeaoMensal).
 *  - Tudo no CNPJ: alíquota efetiva atual do Simples Nacional aplicada à receita total.
 *  - Híbrido: o imposto que o sistema já estima (Carnê-Leão da parte PF + DAS da parte PJ).
 */
export interface HybridSavingsInput {
  /** Apuração do Carnê-Leão do mês exibido (realizado ou projetado). */
  cpf: CarneLeaoMonthlyResult;
  /** Faturamento PJ do mês (base do DAS). */
  cnpjRevenue: number;
  /** DAS estimado do mês pelo motor do Simples (0 quando indisponível). */
  hybridDas: number;
  /** Alíquota efetiva do Simples em % (ex.: 6 = 6%). null = base fiscal indisponível. */
  simplesEffectiveRatePct: number | null;
  taxRules?: TaxRulesPf;
}

export interface HybridSavings {
  receitaCpf: number;
  receitaCnpj: number;
  receitaTotal: number;
  hibrido: { carneLeao: number; das: number; total: number };
  tudoCpf: { imposto: number };
  /** null quando a base fiscal do Simples não está disponível. */
  tudoCnpj: { imposto: number | null };
  /** Quanto o híbrido economiza contra "tudo no Carnê-Leão" (negativo = custa mais). */
  economiaVsCpf: number;
  economiaVsCnpj: number | null;
  /** Melhor alternativa "pura" (a de menor imposto entre as disponíveis). */
  melhorAlternativa: 'CPF' | 'CNPJ';
  melhorAlternativaImposto: number;
  /** Economia contra a MELHOR alternativa pura (a medida honesta). Negativa = híbrido mais caro. */
  economia: number;
  /** Economia ÷ imposto da melhor alternativa (0 se ela for zero). */
  economiaPercentual: number;
  /** Economia contra a PIOR alternativa pura (o "quanto poderia estar pagando"). */
  economiaMaxima: number;
  comparacaoCompleta: boolean;
}

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

export function computeHybridSavings(input: HybridSavingsInput): HybridSavings {
  const { cpf, cnpjRevenue, hybridDas, simplesEffectiveRatePct, taxRules } = input;
  const receitaCpf = cpf.rendimentosTributaveis;
  const receitaCnpj = Math.max(0, cnpjRevenue || 0);
  const receitaTotal = round2(receitaCpf + receitaCnpj);

  const carneLeaoHibrido = cpf.impostoFinal;
  const das = Math.max(0, hybridDas || 0);
  const totalHibrido = round2(carneLeaoHibrido + das);

  // Tudo no Carnê-Leão: a receita total entra na apuração PF, com as mesmas deduções do mês.
  const tudoCpf = calculateCarneLeaoMensal({
    year: cpf.year,
    month: cpf.month,
    taxableIncome: receitaTotal,
    livroCaixaExpensesPaid: cpf.despesasLivroCaixaMes,
    previousLivroCaixaExcess: cpf.excessoLivroCaixaAnterior,
    deductibleInss: cpf.inssDedutivel,
    deductibleDependents: cpf.dependentesDedutiveis,
    deductibleAlimony: cpf.pensaoDedutivel,
    otherLegalDeductions: cpf.outrasDeducoesLegais,
    taxRules,
  }).impostoFinal;

  // Tudo no CNPJ: alíquota efetiva atual do Simples sobre a receita total.
  const tudoCnpj = simplesEffectiveRatePct === null ? null : round2(receitaTotal * (simplesEffectiveRatePct / 100));

  const economiaVsCpf = round2(tudoCpf - totalHibrido);
  const economiaVsCnpj = tudoCnpj === null ? null : round2(tudoCnpj - totalHibrido);

  const melhorAlternativa: 'CPF' | 'CNPJ' = tudoCnpj !== null && tudoCnpj < tudoCpf ? 'CNPJ' : 'CPF';
  const melhorAlternativaImposto = melhorAlternativa === 'CNPJ' ? (tudoCnpj as number) : tudoCpf;
  const piorAlternativaImposto = tudoCnpj === null ? tudoCpf : Math.max(tudoCpf, tudoCnpj);
  const economia = round2(melhorAlternativaImposto - totalHibrido);

  return {
    receitaCpf: round2(receitaCpf),
    receitaCnpj: round2(receitaCnpj),
    receitaTotal,
    hibrido: { carneLeao: round2(carneLeaoHibrido), das: round2(das), total: totalHibrido },
    tudoCpf: { imposto: round2(tudoCpf) },
    tudoCnpj: { imposto: tudoCnpj },
    economiaVsCpf,
    economiaVsCnpj,
    melhorAlternativa,
    melhorAlternativaImposto: round2(melhorAlternativaImposto),
    economia,
    economiaPercentual: melhorAlternativaImposto > 0 ? round2((economia / melhorAlternativaImposto) * 100) : 0,
    economiaMaxima: round2(piorAlternativaImposto - totalHibrido),
    comparacaoCompleta: tudoCnpj !== null,
  };
}
