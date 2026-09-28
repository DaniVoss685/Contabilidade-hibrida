/**
 * FONTE CANÔNICA DA BASE FISCAL (RBT12 / FS12 / Fator R / Anexo / alíquota).
 *
 * Existe UM só caminho de cálculo. Dashboard, Motores de Cálculo Tributário, Simulador Fiscal,
 * Relatórios e DRE consomem `resolveFiscalBase` + `estimateSimplesFromBase` — nenhuma tela monta
 * RBT12/FS12 por conta própria.
 *
 * Conceitos que NÃO se misturam:
 *  - MÊS OPERACIONAL: o mês que o Dashboard mostra (ex.: setembro, em andamento). Nunca é alterado aqui.
 *  - COMPETÊNCIA FISCAL FECHADA (`referenceCompetency`): a última competência cuja base oficial já existe
 *    (ex.: agosto). É ela que define RBT12, FS12, Fator R, Anexo e alíquota. A estimativa do mês
 *    operacional aplica esse enquadramento sobre a receita do mês.
 *
 * Regras:
 *  - Base oficial do Contaju (snapshots publicados) tem precedência quando o modo fiscal é CONTABILEX.
 *  - Nunca cair em zero silencioso: sem base carregada/configurada o estado é explícito
 *    (LOADING / UNAVAILABLE / INSUFFICIENT) e NENHUM anexo é classificado (nem Anexo V "por padrão").
 *  - A competência de referência NÃO é hardcoded e não é simplesmente "mês anterior": é o mais recente entre
 *    (última competência oficial publicada) e (último mês civil encerrado).
 *  - A janela de RBT12/FS12 de uma competência C são os 12 meses ESTRITAMENTE anteriores a C
 *    (LC 123/2006, art. 18 §1º) — regra já vigente na tela Motores, preservada.
 */

import type { ContabilexSnapshotPayload, IntegrationLinkStatus } from '../types/contabilexIntegration';
import type {
  FiscalSourceType,
  MonthlyFiscalHistoryEntry,
  PayrollHistoryEntry,
  Professional,
  Sale,
  TaxRulesSimples,
} from '../types';
import {
  DEFAULT_FATOR_R_THRESHOLD,
  calculateSimplesForParameters,
  computeRolling12MonthsData,
  isFatorRAtOrAboveThreshold,
  sumCnpjRevenueForCompetence,
} from './taxEngine';

// ==========================================
// Competências (YYYY-MM)
// ==========================================

const COMPETENCY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isCompetency(value: unknown): value is string {
  return typeof value === 'string' && COMPETENCY_RE.test(value);
}

export function addMonthsToCompetency(competency: string, delta: number): string {
  const [y, m] = competency.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Competência do mês civil de uma data 'YYYY-MM-DD'. */
export function competencyOfDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Último mês civil ENCERRADO em relação a `todayStr` (YYYY-MM-DD). */
export function lastClosedCalendarCompetency(todayStr: string): string {
  return addMonthsToCompetency(competencyOfDate(todayStr), -1);
}

const SHORT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** '2026-08' → 'Ago/2026'. */
export function formatCompetencyShortName(competency: string | null | undefined): string {
  if (!competency || !isCompetency(competency)) return competency || '';
  const [y, m] = competency.split('-').map(Number);
  return `${SHORT_MONTHS[m - 1]}/${y}`;
}

// ==========================================
// Janela oficial do Contaju
// ==========================================

export interface SnapshotWindow {
  rbt12: number;
  fs12: number;
  count: number;
  months: string[];
}

/**
 * Soma a receita bruta e a base da folha (Fator R) dos snapshots publicados nos 12 meses ESTRITAMENTE
 * anteriores a `referenceCompetency`. Ausência de meses não é completada com R$ 0,00 fictício.
 * (Lógica única — `ContabilexIntegrationService.calculateFactorR` delega para esta função.)
 */
export function computeSnapshotWindow(
  snapshots: ContabilexSnapshotPayload[],
  referenceCompetency?: string
): SnapshotWindow {
  const sorted = [...snapshots].sort((a, b) => a.competency.localeCompare(b.competency));
  const windowSnapshots = referenceCompetency
    ? sorted.filter((s) => s.competency < referenceCompetency).slice(-12)
    : sorted.slice(-12);
  return {
    rbt12: windowSnapshots.reduce((acc, s) => acc + (Number(s.gross_revenue) || 0), 0),
    fs12: windowSnapshots.reduce((acc, s) => acc + (Number(s.factor_r_payroll_base) || 0), 0),
    count: windowSnapshots.length,
    months: windowSnapshots.map((s) => s.competency),
  };
}

/** Competência oficial mais recente publicada pelo Contaju (ou null). */
export function latestOfficialCompetency(snapshots: ContabilexSnapshotPayload[]): string | null {
  let latest: string | null = null;
  for (const s of snapshots) {
    if (!isCompetency(s.competency)) continue;
    if (latest === null || s.competency > latest) latest = s.competency;
  }
  return latest;
}

/**
 * Última COMPETÊNCIA FISCAL FECHADA.
 *  - nunca é uma competência ainda em andamento (limitada ao último mês civil encerrado);
 *  - com base oficial publicada, nunca ultrapassa a última competência oficial disponível
 *    (não assume "mês anterior" sem verificar disponibilidade).
 */
export function getLatestClosedFiscalCompetency(args: {
  todayStr: string;
  officialSnapshots?: ContabilexSnapshotPayload[] | null;
}): string {
  const calendarClosed = lastClosedCalendarCompetency(args.todayStr);
  const official = args.officialSnapshots && args.officialSnapshots.length > 0
    ? latestOfficialCompetency(args.officialSnapshots)
    : null;
  if (!official) return calendarClosed;
  return official < calendarClosed ? official : calendarClosed;
}

// ==========================================
// Base canônica
// ==========================================

export type FiscalBaseStatus = 'AVAILABLE' | 'LOADING' | 'UNAVAILABLE' | 'INSUFFICIENT';
export type FiscalBaseSource = 'CONTABILEX' | 'MANUAL_TOTAL' | 'MANUAL_MONTHLY' | 'NONE';
export type FiscalBaseReason =
  | 'LOADING_OFFICIAL_BASE'
  | 'LOAD_ERROR'
  | 'CONTABILEX_NOT_ACTIVE'
  | 'NO_OFFICIAL_SNAPSHOTS'
  | 'NOT_CONFIGURED'
  | 'NO_REVENUE_IN_WINDOW';

export const FISCAL_BASE_REASON_MESSAGE: Record<FiscalBaseReason, string> = {
  LOADING_OFFICIAL_BASE: 'Carregando a base fiscal oficial…',
  LOAD_ERROR: 'Não foi possível carregar a base fiscal oficial.',
  CONTABILEX_NOT_ACTIVE: 'A integração com o Escritório Contaju não está ativa.',
  NO_OFFICIAL_SNAPSHOTS: 'Nenhuma competência foi publicada pelo Escritório Contaju ainda.',
  NOT_CONFIGURED: 'As bases fiscais ainda não foram configuradas.',
  NO_REVENUE_IN_WINDOW: 'Sem receita bruta registrada nos 12 meses anteriores (RBT12 = 0): o Fator R não pode ser apurado.',
};

export interface CanonicalFiscalBase {
  status: FiscalBaseStatus;
  reason: FiscalBaseReason | null;
  reasonMessage: string | null;
  source: FiscalBaseSource;
  /** Competência fiscal fechada de referência ('YYYY-MM'). */
  referenceCompetency: string;
  /** Último mês civil encerrado (informativo). */
  calendarClosedCompetency: string;
  /** Última competência publicada pelo Contaju (null fora do modo oficial / sem publicações). */
  latestOfficialCompetency: string | null;
  rbt12: number;
  fs12: number;
  /** Razão FS12/RBT12 (decimal). null quando não há base. */
  factorR: number | null;
  factorRPercent: number | null;
  /** Limiar do Fator R usado na classificação (decimal, ex.: 0,28). */
  factorRThreshold: number;
  isAnexoIII: boolean | null;
  annex: 'ANEXO_III' | 'ANEXO_V' | null;
  /** Alíquota efetiva (%), calculada pelo motor de Simples por faixa. null quando não há base. */
  effectiveRate: number | null;
  nominalRate: number | null;
  deductionAmount: number | null;
  bracketNumber: number | null;
  /** Nº de competências efetivamente usadas na janela (Contaju). */
  competenciesCount: number;
  isPartialHistory: boolean;
  /** Alíquota que o Contaju publicou para a competência de referência (informativo). */
  officialEffectiveRate: number | null;
  /** Base manual informada com RBT12 = 0 ("início de atividade"). */
  startOfActivity: boolean;
}

export interface ResolveFiscalBaseInput {
  /** Data civil de hoje, YYYY-MM-DD. */
  todayStr: string;
  professional: Pick<
    Professional,
    'fiscalSourceType' | 'baselineConfigured' | 'rbt12Inicial' | 'folha12MesesInicial' | 'initialFiscalHistory'
  >;
  contabilex: {
    /** false enquanto a leitura do vínculo/snapshots deste tenant não terminou. */
    loaded: boolean;
    loadError?: boolean;
    linkStatus: IntegrationLinkStatus | null;
    snapshots: ContabilexSnapshotPayload[];
  };
  sales?: Sale[];
  payrollHistory?: PayrollHistoryEntry[];
  taxRules?: TaxRulesSimples;
  /** Ano das tabelas do Simples. Padrão: ano da competência de referência. */
  year?: number;
  /** Competência escolhida explicitamente (ex.: seletor da tela Motores). */
  referenceCompetencyOverride?: string | null;
}

export function resolveFiscalMode(
  professional: Pick<Professional, 'fiscalSourceType' | 'initialFiscalHistory'>
): FiscalSourceType {
  return (
    professional.fiscalSourceType ||
    (professional.initialFiscalHistory && professional.initialFiscalHistory.length > 0
      ? 'MANUAL_MONTHLY'
      : 'MANUAL_TOTAL')
  );
}

function emptyBase(
  partial: Pick<CanonicalFiscalBase, 'status' | 'reason' | 'source' | 'referenceCompetency' | 'calendarClosedCompetency'> &
    Partial<CanonicalFiscalBase>
): CanonicalFiscalBase {
  return {
    reasonMessage: partial.reason ? FISCAL_BASE_REASON_MESSAGE[partial.reason] : null,
    latestOfficialCompetency: null,
    rbt12: 0,
    fs12: 0,
    factorR: null,
    factorRPercent: null,
    factorRThreshold: DEFAULT_FATOR_R_THRESHOLD,
    isAnexoIII: null,
    annex: null,
    effectiveRate: null,
    nominalRate: null,
    deductionAmount: null,
    bracketNumber: null,
    competenciesCount: 0,
    isPartialHistory: false,
    officialEffectiveRate: null,
    startOfActivity: false,
    ...partial,
  };
}

function classifyBase(
  rbt12: number,
  fs12: number,
  year: number,
  taxRules?: TaxRulesSimples
) {
  // Uma única chamada ao motor de Simples: fator, anexo, faixa e alíquota saem do mesmo lugar.
  const calc = calculateSimplesForParameters(rbt12, fs12, 0, year, taxRules);
  return {
    factorR: calc.fatorR,
    factorRPercent: calc.fatorRPercent,
    factorRThreshold: calc.fatorRThreshold,
    isAnexoIII: calc.isAnexoIII,
    annex: calc.effectiveAnnex,
    effectiveRate: calc.effectiveTaxRate,
    nominalRate: calc.nominalRate,
    deductionAmount: calc.deductionAmount,
    bracketNumber: calc.bracketNumber,
  };
}

export function resolveFiscalBase(input: ResolveFiscalBaseInput): CanonicalFiscalBase {
  const { todayStr, professional, contabilex } = input;
  const mode = resolveFiscalMode(professional);
  const calendarClosed = lastClosedCalendarCompetency(todayStr);
  const override = isCompetency(input.referenceCompetencyOverride) ? input.referenceCompetencyOverride : null;

  // ------------------------------------------------------------------
  // Modo oficial Contaju
  // ------------------------------------------------------------------
  if (mode === 'CONTABILEX') {
    const snapshots = contabilex.snapshots || [];
    const official = latestOfficialCompetency(snapshots);
    const reference =
      override ?? getLatestClosedFiscalCompetency({ todayStr, officialSnapshots: snapshots });
    const common = {
      source: 'CONTABILEX' as const,
      referenceCompetency: reference,
      calendarClosedCompetency: calendarClosed,
      latestOfficialCompetency: official,
    };

    if (!contabilex.loaded) {
      return emptyBase({ ...common, status: 'LOADING', reason: 'LOADING_OFFICIAL_BASE' });
    }
    if (contabilex.loadError && snapshots.length === 0) {
      return emptyBase({ ...common, status: 'UNAVAILABLE', reason: 'LOAD_ERROR' });
    }
    if (contabilex.linkStatus !== 'ACTIVE') {
      return emptyBase({ ...common, status: 'UNAVAILABLE', reason: 'CONTABILEX_NOT_ACTIVE' });
    }
    if (snapshots.length === 0) {
      return emptyBase({ ...common, status: 'UNAVAILABLE', reason: 'NO_OFFICIAL_SNAPSHOTS' });
    }

    const window = computeSnapshotWindow(snapshots, reference);
    if (window.count === 0 || window.rbt12 <= 0) {
      // Há base publicada, mas a janela não tem receita: dividir por zero não é Fator R.
      return emptyBase({
        ...common,
        status: 'INSUFFICIENT',
        reason: 'NO_REVENUE_IN_WINDOW',
        rbt12: window.rbt12,
        fs12: window.fs12,
        competenciesCount: window.count,
        isPartialHistory: window.count < 12,
      });
    }

    const year = input.year ?? Number(reference.slice(0, 4));
    const referenceSnapshot = snapshots
      .filter((s) => s.competency === reference)
      .sort((a, b) => (b.version || 0) - (a.version || 0))[0];
    const officialRate =
      referenceSnapshot && referenceSnapshot.effective_rate !== null && referenceSnapshot.effective_rate !== undefined
        ? Number(referenceSnapshot.effective_rate)
        : null;

    return emptyBase({
      ...common,
      status: 'AVAILABLE',
      reason: null,
      rbt12: window.rbt12,
      fs12: window.fs12,
      competenciesCount: window.count,
      isPartialHistory: window.count < 12,
      officialEffectiveRate: officialRate,
      ...classifyBase(window.rbt12, window.fs12, year, input.taxRules),
    });
  }

  // ------------------------------------------------------------------
  // Modos manuais (total consolidado / mês a mês)
  // ------------------------------------------------------------------
  const source: FiscalBaseSource = mode === 'MANUAL_TOTAL' ? 'MANUAL_TOTAL' : 'MANUAL_MONTHLY';
  const reference = override ?? calendarClosed;
  const common = {
    source,
    referenceCompetency: reference,
    calendarClosedCompetency: calendarClosed,
  };

  if (!professional.baselineConfigured) {
    return emptyBase({ ...common, source: 'NONE', status: 'UNAVAILABLE', reason: 'NOT_CONFIGURED' });
  }

  const rolling = computeRolling12MonthsData(
    input.sales || [],
    reference,
    input.payrollHistory,
    professional.initialFiscalHistory as MonthlyFiscalHistoryEntry[] | undefined,
    professional.rbt12Inicial || 0,
    professional.folha12MesesInicial || 0,
    mode === 'MANUAL_TOTAL'
  );
  const year = input.year ?? Number(reference.slice(0, 4));

  return emptyBase({
    ...common,
    status: 'AVAILABLE',
    reason: null,
    rbt12: rolling.totalRbt12,
    fs12: rolling.totalFs12,
    // "início de atividade": base manual configurada com RBT12 = 0 — regra vigente do motor, sem inventar valores.
    startOfActivity: rolling.totalRbt12 <= 0,
    ...classifyBase(rolling.totalRbt12, rolling.totalFs12, year, input.taxRules),
  });
}

export function isFiscalBaseAvailable(base: CanonicalFiscalBase): boolean {
  return base.status === 'AVAILABLE';
}

// ==========================================
// Estimativa do Simples sobre a receita de uma competência
// ==========================================

export interface SimplesEstimate {
  /** false → NÃO há estimativa (base ausente/insuficiente). Os números abaixo são 0 e não devem ser exibidos como valores. */
  available: boolean;
  base: CanonicalFiscalBase;
  monthlyRevenueNfse: number;
  rbt12: number;
  fs12: number;
  fatorR: number;
  fatorRPercent: number;
  isAnexoIII: boolean;
  effectiveAnnex: 'ANEXO_III' | 'ANEXO_V' | null;
  bracketNumber: number;
  nominalRate: number;
  deductionAmount: number;
  /** Alíquota efetiva em %, ex.: 6 = 6,0%. */
  effectiveTaxRate: number;
  dasEstimated: number;
  potentialMonthlySavings: number;
}

/**
 * Aplica o enquadramento da base canônica sobre a receita PJ de `revenueCompetence`
 * (o mês operacional — pode ser diferente da competência de referência da base).
 */
export function estimateSimplesFromBase(
  base: CanonicalFiscalBase,
  args: { sales: Sale[]; revenueCompetence: string; year: number; taxRules?: TaxRulesSimples }
): SimplesEstimate {
  const monthlyRevenueNfse = sumCnpjRevenueForCompetence(args.sales, args.revenueCompetence);

  if (base.status !== 'AVAILABLE') {
    return {
      available: false,
      base,
      monthlyRevenueNfse,
      rbt12: base.rbt12,
      fs12: base.fs12,
      fatorR: 0,
      fatorRPercent: 0,
      isAnexoIII: false,
      effectiveAnnex: null,
      bracketNumber: 0,
      nominalRate: 0,
      deductionAmount: 0,
      effectiveTaxRate: 0,
      dasEstimated: 0,
      potentialMonthlySavings: 0,
    };
  }

  const calc = calculateSimplesForParameters(base.rbt12, base.fs12, monthlyRevenueNfse, args.year, args.taxRules);
  return {
    available: true,
    base,
    monthlyRevenueNfse,
    rbt12: calc.rbt12,
    fs12: calc.fs12,
    fatorR: calc.fatorR,
    fatorRPercent: calc.fatorRPercent,
    isAnexoIII: calc.isAnexoIII,
    effectiveAnnex: calc.effectiveAnnex,
    bracketNumber: calc.bracketNumber,
    nominalRate: calc.nominalRate,
    deductionAmount: calc.deductionAmount,
    effectiveTaxRate: calc.effectiveTaxRate,
    dasEstimated: calc.dasEstimated,
    potentialMonthlySavings: calc.potentialMonthlySavings,
  };
}

/** Rótulo curto do estado da base quando ela NÃO está disponível (nunca um enquadramento). */
export function fiscalBaseStatusLabel(base: Pick<CanonicalFiscalBase, 'status'>): string {
  if (base.status === 'LOADING') return 'Carregando base fiscal';
  if (base.status === 'INSUFFICIENT') return 'Base fiscal insuficiente';
  return 'Base fiscal indisponível';
}

/** Texto do selo do Fator R (nunca "Abaixo de 28%" quando o Fator R é >= 28%). */
export function factorRBadgeLabel(base: Pick<CanonicalFiscalBase, 'status' | 'factorRPercent' | 'isAnexoIII'>): string {
  if (base.status !== 'AVAILABLE' || base.isAnexoIII === null) return fiscalBaseStatusLabel(base);
  if (!base.isAnexoIII) return 'Abaixo de 28%';
  return (base.factorRPercent ?? 0) > DEFAULT_FATOR_R_THRESHOLD * 100 ? 'Acima de 28%' : 'No limite de 28%';
}

// ---------------------------------------------------------------------------
// Progresso do Fator R em relação à meta (barra do Dashboard)
// ---------------------------------------------------------------------------

export interface FatorRProgress {
  /** REACHED = já está na faixa do Anexo III · BELOW = ainda abaixo da meta · UNAVAILABLE = sem base fiscal. */
  state: 'REACHED' | 'BELOW' | 'UNAVAILABLE';
  percent: number | null;
  thresholdPercent: number;
  /** Distância até a meta, em pontos percentuais (1 casa): quanto passou (REACHED) ou quanto falta (BELOW). */
  diffPoints: number;
  /** true quando está exatamente na meta (diferença < 0,05 ponto). */
  atLimit: boolean;
  /** Fim da escala da barra (%): sempre >= 50 e múltiplo de 10, para o marcador da meta e o valor caberem juntos. */
  scaleMax: number;
  /** Posição do valor e do marcador da meta na barra (0–100% da largura). */
  fillPercent: number;
  markerPercent: number;
  /** R$ de folha (FS12) que faltam para atingir a meta, com o RBT12 atual. null fora do estado BELOW. */
  missingPayroll: number | null;
}

export function describeFatorRProgress(
  base: Pick<CanonicalFiscalBase, 'status' | 'factorRPercent' | 'factorRThreshold' | 'isAnexoIII' | 'rbt12' | 'fs12'>
): FatorRProgress {
  const thresholdPercent = Number((base.factorRThreshold * 100).toFixed(2));
  const ok = base.status === 'AVAILABLE' && base.factorRPercent !== null && base.isAnexoIII !== null;
  const percent = ok ? (base.factorRPercent as number) : null;

  const scaleMax = Math.min(100, Math.max(50, Math.ceil((percent ?? 0) / 10) * 10));
  const pos = (v: number) => Math.min(100, Math.max(0, (v / scaleMax) * 100));
  const markerPercent = pos(thresholdPercent);

  if (!ok || percent === null) {
    return { state: 'UNAVAILABLE', percent: null, thresholdPercent, diffPoints: 0, atLimit: false, scaleMax, fillPercent: 0, markerPercent, missingPayroll: null };
  }

  const reached = base.isAnexoIII === true;
  const diffPoints = Number(Math.abs(percent - thresholdPercent).toFixed(1));

  let missingPayroll: number | null = null;
  if (!reached) {
    // folha mínima em centavos inteiros: FS12 / RBT12 >= limiar  ⇔  FS12 >= limiar × RBT12
    const thresholdBps = Math.round(base.factorRThreshold * 10000);
    const neededCents = Math.ceil((thresholdBps * Math.round(Math.max(0, base.rbt12) * 100)) / 10000);
    missingPayroll = Math.max(0, neededCents - Math.round(Math.max(0, base.fs12) * 100)) / 100;
  }

  return {
    state: reached ? 'REACHED' : 'BELOW',
    percent,
    thresholdPercent,
    diffPoints,
    atLimit: reached && diffPoints < 0.05,
    scaleMax,
    fillPercent: pos(percent),
    markerPercent,
    missingPayroll,
  };
}

export { isFatorRAtOrAboveThreshold };
