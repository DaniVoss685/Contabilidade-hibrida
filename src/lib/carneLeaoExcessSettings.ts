/**
 * Meses desativados no excesso de Livro Caixa (ajuste da clínica, salvo em preferências).
 * Funções puras: nenhuma leitura de banco aqui.
 */

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizeIgnoredMonths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((v): v is string => typeof v === 'string' && MONTH_KEY.test(v)))).sort();
}

/** Devolve uma NOVA lista (ordenada, sem repetição) com o mês ativado ou desativado. */
export function setMonthIgnored(current: readonly string[] | undefined, monthKey: string, ignored: boolean): string[] {
  if (!MONTH_KEY.test(monthKey)) return normalizeIgnoredMonths(current);
  const base = normalizeIgnoredMonths(current).filter((m) => m !== monthKey);
  return ignored ? [...base, monthKey].sort() : base;
}
