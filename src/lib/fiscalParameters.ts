import { FiscalParameter } from '../types';

/**
 * Catálogo Oficial e Central de Parâmetros Fiscais e Legais Versionados
 * Fonte única da verdade governada pela plataforma para garantir que
 * valores legais (como Salário Mínimo e Tetos) sejam resolvidos por vigência oficial.
 */
export const INITIAL_OFFICIAL_FISCAL_PARAMETERS: FiscalParameter[] = [
  {
    id: 'param_sm_2024',
    type: 'SALARIO_MINIMO',
    name: 'Salário Mínimo Nacional 2024',
    value: 1412.0,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2024-12-31',
    sourceLaw: 'Decreto nº 11.864/2023',
    status: 'REVOGADO',
    updatedAt: '2024-01-01T00:00:00.000Z',
    updatedBy: 'Governo Federal / Diário Oficial da União',
    notes: 'Salário mínimo nacional vigente no exercício de 2024.',
  },
  {
    id: 'param_sm_2025',
    type: 'SALARIO_MINIMO',
    name: 'Salário Mínimo Nacional 2025',
    value: 1518.0,
    effectiveFrom: '2025-01-01',
    effectiveTo: '2025-12-31',
    sourceLaw: 'Decreto nº 12.342/2024',
    status: 'REVOGADO',
    updatedAt: '2025-01-01T00:00:00.000Z',
    updatedBy: 'Governo Federal / Diário Oficial da União',
    notes: 'Salário mínimo nacional vigente no exercício de 2025.',
  },
  {
    id: 'param_sm_2026',
    type: 'SALARIO_MINIMO',
    name: 'Salário Mínimo Nacional 2026',
    value: 1621.0,
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-12-31',
    sourceLaw: 'Decreto nº 12.797/2025',
    status: 'ATIVO',
    updatedAt: '2025-12-29T10:00:00.000Z',
    updatedBy: 'Platform Admin (Publicação Oficial DOU)',
    notes: 'Salário mínimo nacional oficial fixado em R$ 1.621,00 para o exercício de 2026.',
  },
];

/**
 * Normaliza ano ou string de data para o formato comparável 'YYYY-MM-DD'
 */
function normalizeDateStr(dateOrYear: number | string): string {
  if (typeof dateOrYear === 'number') {
    return `${dateOrYear}-07-01`;
  }
  const clean = (dateOrYear || '').trim();
  if (clean.length === 4 && /^\d{4}$/.test(clean)) {
    return `${clean}-07-01`;
  }
  if (clean.length === 7 && /^\d{4}-\d{2}$/.test(clean)) {
    return `${clean}-01`;
  }
  return clean.split('T')[0] || new Date().toISOString().split('T')[0];
}

/**
 * Busca o parâmetro de Salário Mínimo oficial vigente para uma determinada data ou ano.
 * Resolução estrita por vigência legal (effectiveFrom <= date <= effectiveTo).
 * NÃO inventa projeções futuras automáticas (+X%).
 */
export function getMinimumWageParameter(
  dateOrYear: number | string = 2026,
  parameters: FiscalParameter[] = INITIAL_OFFICIAL_FISCAL_PARAMETERS
): FiscalParameter | undefined {
  const targetDate = normalizeDateStr(dateOrYear);
  const targetYear = parseInt(targetDate.substring(0, 4), 10);

  const wageParams = parameters.filter((p) => p.type === 'SALARIO_MINIMO');

  // 1. Procura parâmetro exato cuja janela de vigência compreenda a data
  const exactMatch = wageParams.find((p) => {
    const fromOk = p.effectiveFrom <= targetDate;
    const toOk = !p.effectiveTo || p.effectiveTo >= targetDate;
    return fromOk && toOk;
  });

  if (exactMatch) {
    return exactMatch;
  }

  // 2. Se for um ano passado registrado
  const pastMatch = wageParams
    .filter((p) => p.effectiveFrom <= targetDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];

  if (pastMatch) {
    return pastMatch;
  }

  // Fallback padrão 2026
  return wageParams.find((p) => p.id === 'param_sm_2026') || wageParams[wageParams.length - 1];
}

/**
 * Retorna o valor numérico oficial do Salário Mínimo para a competência indicada.
 */
export function getOfficialMinimumWage(
  dateOrYear: number | string = 2026,
  parameters: FiscalParameter[] = INITIAL_OFFICIAL_FISCAL_PARAMETERS
): number {
  const param = getMinimumWageParameter(dateOrYear, parameters);
  return param ? param.value : 1621.0;
}

/**
 * Verifica se um ano futuro possui Salário Mínimo oficial homologado.
 */
export function hasOfficialMinimumWageForYear(
  year: number,
  parameters: FiscalParameter[] = INITIAL_OFFICIAL_FISCAL_PARAMETERS
): boolean {
  const yearStr = `${year}-01-01`;
  return parameters.some(
    (p) =>
      p.type === 'SALARIO_MINIMO' &&
      p.status === 'ATIVO' &&
      p.effectiveFrom <= yearStr &&
      (!p.effectiveTo || p.effectiveTo >= yearStr)
  );
}

/**
 * Alerta administrativo preventivo no final de ano (a partir de Dezembro)
 * para conferência e parametrização do Salário Mínimo do próximo exercício.
 */
export function checkUpcomingYearWageReview(
  currentDateStr?: string,
  parameters: FiscalParameter[] = INITIAL_OFFICIAL_FISCAL_PARAMETERS
): {
  needsReview: boolean;
  message: string;
  upcomingYear: number;
  targetYear?: number;
  status: 'CONFIGURADO' | 'PENDENTE' | 'NAO_APLICAVEL';
} {
  const now = currentDateStr ? new Date(currentDateStr) : new Date();
  const currentMonth = now.getMonth() + 1; // 1 to 12
  const currentYear = now.getFullYear();
  const upcomingYear = currentYear + 1;

  // Alerta relevante especialmente a partir de Dezembro (mês 12) ou Janeiro de transição
  const isDecemberOrYearEnd = currentMonth === 12;

  const hasFutureParam = hasOfficialMinimumWageForYear(upcomingYear, parameters);

  if (hasFutureParam) {
    const futureParam = getMinimumWageParameter(upcomingYear, parameters);
    return {
      needsReview: false,
      message: `Salário mínimo de ${upcomingYear} configurado para vigorar em 01/01/${upcomingYear} (${futureParam?.sourceLaw || 'Decreto Oficial'}).`,
      upcomingYear,
      targetYear: upcomingYear,
      status: 'CONFIGURADO',
    };
  }

  if (isDecemberOrYearEnd) {
    return {
      needsReview: true,
      message: `Revisar salário mínimo do próximo exercício: O salário mínimo pode ser atualizado no início do próximo ano. Verifique se o parâmetro oficial do próximo exercício (${upcomingYear}) já foi publicado.`,
      upcomingYear,
      targetYear: upcomingYear,
      status: 'PENDENTE',
    };
  }

  return {
    needsReview: false,
    message: `Exercício corrente (${currentYear}) com parâmetros oficiais homologados.`,
    upcomingYear,
    targetYear: upcomingYear,
    status: 'NAO_APLICAVEL',
  };
}
