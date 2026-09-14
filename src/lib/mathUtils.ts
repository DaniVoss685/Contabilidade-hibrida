/**
 * Utilitários matemáticos e financeiros com guardrails universais contra
 * divisões por zero, NaN, undefined, null e Infinity no Dental Finance.
 */

export interface SafeMarginResult {
  marginPercent: number | null;
  profit: number;
  status: 'OK' | 'WAITING_COSTS' | 'NO_PRICE';
}

/**
 * Realiza divisão segura entre dois números.
 * Se o denominador for zero, nulo, indefinido ou se o resultado for NaN/Infinity, retorna fallback.
 */
export function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  fallback = 0
): number {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator === 0 ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator)
  ) {
    return fallback;
  }

  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Calcula a margem de contribuição e lucro de um procedimento ou receita.
 * Implementa o guardrail contábil R8.2:
 * - Se revenue <= 0 -> NO_PRICE (marginPercent: null, profit: 0)
 * - Se cost <= 0 ou ausente -> WAITING_COSTS (marginPercent: null, profit: revenue)
 * - Se válido -> OK (marginPercent arredondado a 1 casa decimal)
 */
export function safeMargin(
  revenue: number | null | undefined,
  cost: number | null | undefined
): SafeMarginResult {
  const cleanRevenue = typeof revenue === 'number' && Number.isFinite(revenue) ? revenue : 0;
  const cleanCost = typeof cost === 'number' && Number.isFinite(cost) ? cost : 0;

  if (cleanRevenue <= 0) {
    return {
      marginPercent: null,
      profit: 0,
      status: 'NO_PRICE',
    };
  }

  if (cleanCost <= 0) {
    return {
      marginPercent: null,
      profit: cleanRevenue,
      status: 'WAITING_COSTS',
    };
  }

  const profit = cleanRevenue - cleanCost;
  const rawMargin = (profit / cleanRevenue) * 100;
  const marginPercent = Number.isFinite(rawMargin) ? Number(rawMargin.toFixed(1)) : 0;

  return {
    marginPercent,
    profit,
    status: 'OK',
  };
}

/**
 * Formata valores percentuais com guardrail universal.
 * Se o valor for null, undefined ou inválido, retorna fallback (default: '—').
 * Ex: 15.5 -> '15,5%'
 */
export function formatPercent(
  val: number | null | undefined,
  fallback = '—',
  decimals = 1
): string {
  if (val === null || val === undefined || isNaN(val) || !Number.isFinite(val)) {
    return fallback;
  }
  return `${val.toFixed(decimals).replace('.', ',')}%`;
}

/**
 * Arredonda valores monetários a 2 casas decimais evitando erros clássicos de IEEE-754.
 */
export function roundCurrency(amount: number | null | undefined): number {
  if (amount === null || amount === undefined || isNaN(amount) || !Number.isFinite(amount)) {
    return 0;
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Soma um array de números de forma segura, descartando nulos e NaNs.
 */
export function safeSum(values: (number | null | undefined)[]): number {
  if (!Array.isArray(values)) return 0;
  return values.reduce<number>((acc, val) => {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return roundCurrency(acc + val);
    }
    return acc;
  }, 0);
}

/**
 * Realiza o rateio exato de uma despesa mista (CPF / CNPJ) garantindo
 * conservação exata da soma dos centavos (valueCpf + valueCnpj === value).
 */
export function calculateSplit(
  value: number,
  splitPercentageCpf: number
): { valueCpf: number; valueCnpj: number } {
  const cleanVal = roundCurrency(value);
  if (cleanVal <= 0) return { valueCpf: 0, valueCnpj: 0 };

  const pct = Math.max(0, Math.min(100, splitPercentageCpf));
  const valueCpf = roundCurrency((cleanVal * pct) / 100);
  const valueCnpj = roundCurrency(cleanVal - valueCpf);

  return { valueCpf, valueCnpj };
}

/**
 * Formata valores numéricos para moeda brasileira BRL com guardrail.
 */
export function formatBrl(value: number | null | undefined, fallback = 'R$ 0,00'): string {
  if (value === null || value === undefined || isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
