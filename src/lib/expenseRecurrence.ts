/**
 * Motor puro do modelo de despesa RECORRENTE (série aberta), separado de PARCELADA
 * (que continua finita, com totalInstallments/installmentGroupId — inalterada por este arquivo).
 *
 * Regra de negócio: uma recorrência (aluguel, água, internet, faxineira, software...) NÃO tem uma
 * quantidade total de ocorrências. Ela existe enquanto `status === 'ACTIVE'`; "Encerrar recorrência"
 * marca `status = 'ENDED'` e para a geração de novas ocorrências — nunca apaga o que já existe/foi pago.
 *
 * PARCELADA (finita, com número de parcelas conhecido) é um conceito diferente e não é tocada aqui.
 */

export type RecurrenceStatus = 'ACTIVE' | 'ENDED';

export interface RecurrenceIntervalPreset {
  months: number;
  label: string;
}

/** Presets canônicos de periodicidade — fonte única para o seletor da UI. */
export const RECURRENCE_INTERVAL_PRESETS: RecurrenceIntervalPreset[] = [
  { months: 1, label: 'Mensal' },
  { months: 2, label: 'Bimestral' },
  { months: 3, label: 'Trimestral' },
  { months: 6, label: 'Semestral' },
  { months: 12, label: 'Anual' },
];

export const MIN_CUSTOM_INTERVAL_MONTHS = 1;
export const MAX_CUSTOM_INTERVAL_MONTHS = 36;

/** Label amigável para qualquer intervalo (preset ou personalizado) — fonte única, nunca "1/N". */
export function getRecurrenceIntervalLabel(intervalMonths: number | null | undefined): string {
  const months = Number(intervalMonths);
  if (!Number.isFinite(months) || months <= 0) return 'Recorrente';
  const preset = RECURRENCE_INTERVAL_PRESETS.find((p) => p.months === months);
  if (preset) return preset.label;
  return months === 1 ? 'Mensal' : `A cada ${months} meses`;
}

export function isValidCustomIntervalMonths(months: number): boolean {
  return Number.isInteger(months) && months >= MIN_CUSTOM_INTERVAL_MONTHS && months <= MAX_CUSTOM_INTERVAL_MONTHS;
}

/**
 * Soma meses a uma data ISO (YYYY-MM-DD) preservando o dia quando possível e usando o ÚLTIMO DIA
 * VÁLIDO do mês de destino quando não (ex.: 31/01 + 1 mês = 28 ou 29/02, nunca "estoura" para março).
 * Fonte única — mesma lógica que já existia (correta) em NewExpenseModal.tsx para parceladas.
 */
export function addMonthsClamped(dateISO: string, monthsToAdd: number): string {
  if (!dateISO) return dateISO;
  const [y, m, d] = dateISO.split('-').map(Number);
  const target = new Date(y, m - 1 + monthsToAdd, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const finalDay = Math.min(d, daysInTargetMonth);
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(finalDay).padStart(2, '0');
  return `${target.getFullYear()}-${mm}-${dd}`;
}

function compareISODate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface RecurrenceSeriesLike {
  startDate: string;
  intervalMonths: number;
  status: RecurrenceStatus;
  /** due_date da última ocorrência já materializada (a do start_date inclusive). */
  lastGeneratedDueDate: string;
}

/**
 * Datas de vencimento que AINDA faltam materializar para uma série, entre a última já gerada
 * (exclusive) e o horizonte (inclusive). Série ENDED nunca gera nada. Puro e determinístico —
 * chamado repetidamente com o mesmo estado sempre devolve o mesmo resultado (idempotência de
 * geração fica a cargo de quem persiste, usando isto só para saber QUAIS datas faltam).
 */
export function computeMissingOccurrenceDueDates(series: RecurrenceSeriesLike, horizonDateISO: string): string[] {
  if (series.status !== 'ACTIVE') return [];
  if (!series.startDate || !series.intervalMonths || series.intervalMonths <= 0) return [];

  const dates: string[] = [];
  let cursor = series.lastGeneratedDueDate || series.startDate;
  let guard = 0;
  // Se lastGeneratedDueDate ainda não existe (série nova sem nenhuma ocorrência), a primeira
  // ocorrência é o próprio startDate — cabe ao chamador materializá-la e só então chamar isto
  // para as SEGUINTES. Aqui assumimos lastGeneratedDueDate sempre preenchido (>= startDate).
  while (guard < 1000) {
    guard++;
    const next = addMonthsClamped(cursor, series.intervalMonths);
    if (compareISODate(next, horizonDateISO) > 0) break;
    dates.push(next);
    cursor = next;
  }
  return dates;
}

/** Horizonte padrão de materialização antecipada: hoje + N meses (geração sob demanda, idempotente). */
export const DEFAULT_GENERATION_HORIZON_MONTHS = 2;

export function computeGenerationHorizon(todayISO: string, horizonMonths: number = DEFAULT_GENERATION_HORIZON_MONTHS): string {
  return addMonthsClamped(todayISO, horizonMonths);
}

export interface RecurrenceOccurrenceDraftBase {
  supplierName: string;
  supplierCpfCnpj?: string;
  description: string;
  categoryId: string;
  categoryCode?: string;
  categoryName?: string;
  groupCode?: string;
  groupName?: string;
  subCategory?: string;
  value: number;
  entity: 'CPF' | 'CNPJ';
  splitPercentageCpf?: number;
  splitPercentageCnpj?: number;
  bankAccountId?: string;
  documentNumber?: string;
  notes?: string;
  dedutivelLivroCaixaPf: 'SIM' | 'NAO' | 'CONDICIONAL';
  impactaFatorRPj: boolean;
  despesaOperacionalPj: boolean;
  isOverridden?: boolean;
  overrideJustification?: string;
}

export interface RecurrenceSeriesTemplate extends RecurrenceOccurrenceDraftBase {
  id: string;
  intervalMonths: number;
}

/**
 * Monta o payload de UMA ocorrência a partir do template da série — nunca inclui contador na
 * descrição (REC-09). `paymentMethod`/`paymentDate`/status ficam de fora aqui de propósito: seguem
 * a mesma convenção já usada em todo o sistema para despesas (só existem depois de paga), então o
 * chamador decide status inicial (A_PAGAR, ou PAGO só na primeira ocorrência quando lançada já paga).
 */
export function buildOccurrenceDraftFromSeries(series: RecurrenceSeriesTemplate, dueDateISO: string) {
  return {
    supplierName: series.supplierName,
    supplierCpfCnpj: series.supplierCpfCnpj,
    description: series.description,
    categoryId: series.categoryId,
    categoryCode: series.categoryCode,
    categoryName: series.categoryName,
    groupCode: series.groupCode,
    groupName: series.groupName,
    subCategory: series.subCategory,
    value: series.value,
    competenceDate: `${dueDateISO.substring(0, 7)}-01`,
    dueDate: dueDateISO,
    bankAccountId: series.bankAccountId,
    documentNumber: series.documentNumber,
    notes: series.notes,
    entity: series.entity,
    splitPercentageCpf: series.splitPercentageCpf,
    splitPercentageCnpj: series.splitPercentageCnpj,
    dedutivelLivroCaixaPf: series.dedutivelLivroCaixaPf,
    impactaFatorRPj: series.impactaFatorRPj,
    despesaOperacionalPj: series.despesaOperacionalPj,
    isOverridden: series.isOverridden,
    overrideJustification: series.overrideJustification,
    status: 'A_PAGAR' as const,
    expenseType: 'RECORRENTE' as const,
    recurrenceId: series.id,
    intervalMonths: series.intervalMonths,
  };
}

/** Campos do template que uma edição "Esta e as próximas"/"Toda a série" pode propagar para a série. */
export const RECURRENCE_TEMPLATE_EDITABLE_FIELDS: Array<keyof RecurrenceOccurrenceDraftBase> = [
  'supplierName',
  'supplierCpfCnpj',
  'description',
  'categoryId',
  'categoryCode',
  'categoryName',
  'groupCode',
  'groupName',
  'subCategory',
  'value',
  'entity',
  'splitPercentageCpf',
  'splitPercentageCnpj',
  'bankAccountId',
  'documentNumber',
  'notes',
  'dedutivelLivroCaixaPf',
  'impactaFatorRPj',
  'despesaOperacionalPj',
  'isOverridden',
  'overrideJustification',
];

export function pickRecurrenceTemplateUpdates<T extends Record<string, any>>(updates: T): Partial<RecurrenceOccurrenceDraftBase> {
  const out: Partial<RecurrenceOccurrenceDraftBase> = {};
  for (const key of RECURRENCE_TEMPLATE_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      (out as any)[key] = (updates as any)[key];
    }
  }
  return out;
}

export interface EndRecurrenceResult {
  status: 'ENDED';
  endedAt: string;
  endedBy: string;
  endedByName: string;
}

/** "Encerrar recorrência": nunca apaga o passado; só fecha a série (pura, para ser testável). */
export function planEndRecurrence(actorId: string, actorName: string, nowISO: string = new Date().toISOString()): EndRecurrenceResult {
  return { status: 'ENDED', endedAt: nowISO, endedBy: actorId, endedByName: actorName };
}

/**
 * Ao encerrar "após esta ocorrência": ocorrências FUTURAS ainda não pagas (due_date estritamente
 * posterior à ocorrência-âncora) deixam de existir; a âncora e tudo que já foi pago são preservados,
 * mesmo que a data de pagamento seja posterior (histórico nunca é apagado por data).
 */
export function selectOccurrencesToRemoveOnEnd<T extends { id: string; dueDate: string; status: string; recurrenceId?: string }>(
  occurrences: T[],
  seriesId: string,
  anchorDueDate: string
): T[] {
  return occurrences.filter(
    (o) => o.recurrenceId === seriesId && o.status !== 'PAGO' && compareISODate(o.dueDate, anchorDueDate) > 0
  );
}

/** Remove só o sufixo " (i/j)" de contador de parcelamento/recorrência legada — nunca mexe no resto do texto. */
export function stripLegacyOccurrenceCounterSuffix(description: string): string {
  return (description || '').replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
}

// ---------------------------------------------------------------------------------------------
// Migração de séries legadas (mesma lógica espelhada na migration SQL, usada aqui só para dar
// confiança/teste determinístico ao agrupamento — a migration real roda uma vez contra o banco).
// ---------------------------------------------------------------------------------------------
export interface LegacyRecurrenceRow {
  tenantId: string;
  recurrenceId: string;
  description: string;
  dueDate: string;
  categoryId: string;
  categoryCode?: string;
  categoryName?: string;
  value: number;
  bankAccountId?: string;
  entity: 'CPF' | 'CNPJ';
  dedutivelLivroCaixaPf: 'SIM' | 'NAO' | 'CONDICIONAL';
  impactaFatorRPj: boolean;
  despesaOperacionalPj: boolean;
  supplierName?: string;
}

export interface LegacyRecurrenceSeriesDraft {
  id: string;
  tenantId: string;
  description: string;
  categoryId: string;
  categoryCode?: string;
  categoryName?: string;
  value: number;
  bankAccountId?: string;
  entity: 'CPF' | 'CNPJ';
  dedutivelLivroCaixaPf: 'SIM' | 'NAO' | 'CONDICIONAL';
  impactaFatorRPj: boolean;
  despesaOperacionalPj: boolean;
  supplierName?: string;
  startDate: string;
  intervalMonths: number;
  status: 'ACTIVE';
  lastGeneratedDueDate: string;
}

/**
 * Agrupa ocorrências legadas (que já tinham recurrence_id + contador na descrição) por série e
 * deriva o template a partir da ocorrência de MENOR due_date do grupo — a mais próxima da intenção
 * original de cadastro. Decisão registrada no relatório: séries legadas viram ACTIVE (continuam
 * gerando), pois o "recurrenceCount" antigo era só um teto arbitrário de projeção (2 a 60), nunca um
 * fim de contrato real — exatamente os exemplos citados (água, internet, faxineira, software) são,
 * por natureza, recorrências sem data de término conhecida.
 */
export function classifyLegacyExpenseRecurrenceGroups(rows: LegacyRecurrenceRow[]): LegacyRecurrenceSeriesDraft[] {
  const groups = new Map<string, LegacyRecurrenceRow[]>();
  for (const row of rows) {
    const key = `${row.tenantId}::${row.recurrenceId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const drafts: LegacyRecurrenceSeriesDraft[] = [];
  for (const groupRows of groups.values()) {
    const sorted = [...groupRows].sort((a, b) => compareISODate(a.dueDate, b.dueDate));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    drafts.push({
      id: first.recurrenceId,
      tenantId: first.tenantId,
      description: stripLegacyOccurrenceCounterSuffix(first.description),
      categoryId: first.categoryId,
      categoryCode: first.categoryCode,
      categoryName: first.categoryName,
      value: first.value,
      bankAccountId: first.bankAccountId,
      entity: first.entity,
      dedutivelLivroCaixaPf: first.dedutivelLivroCaixaPf,
      impactaFatorRPj: first.impactaFatorRPj,
      despesaOperacionalPj: first.despesaOperacionalPj,
      supplierName: first.supplierName,
      startDate: first.dueDate,
      intervalMonths: 1, // única frequência já usada em produção (MENSAL) — ver auditoria do relatório
      status: 'ACTIVE',
      lastGeneratedDueDate: last.dueDate,
    });
  }
  return drafts.sort((a, b) => `${a.tenantId}${a.id}`.localeCompare(`${b.tenantId}${b.id}`));
}
