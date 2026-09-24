import { CardBrand, CardFeeRule, CardFeeSettings, CardFeeType, ReceivingMode, SettlementProfileId } from '../types';
import { getHoliday } from './holidays';

// Motor único de taxas de maquininha (configuração por bandeira). Usado pela
// tela de Configurações, pelo NewSaleModal e pelo simulador — nunca duplicar
// esta lógica. Aritmética em centavos inteiros (sem erro de ponto flutuante).
//
// SEMÂNTICA DA TAXA FIXA: `FIXED` é a taxa TOTAL da transação para aquela
// combinação bandeira/modalidade/parcelas — NÃO é multiplicada pelo número
// de parcelas. Ao gerar os recebíveis, o total é distribuído entre as
// parcelas (resto de centavos na última).

export type CardPaymentMode = 'DEBIT' | 'CREDIT';

export const DEFAULT_CARD_BRAND_NAMES = ['Visa', 'Mastercard', 'Elo'];
export const CREDIT_INSTALLMENTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export type FeeResolution =
  | { status: 'CONFIGURED'; rule: CardFeeRule; source: 'BRAND' | 'LEGACY' }
  | { status: 'NOT_CONFIGURED' };

export interface FeeComputation {
  feeAmount: number;
  netValue: number;
}

const toCents = (v: number) => Math.round(v * 100);
const fromCents = (c: number) => c / 100;

export function validateFeeRule(rule: { type: CardFeeType; value: unknown }): { valid: boolean; error?: string } {
  const v = rule.value;
  if (typeof v !== 'number' || !Number.isFinite(v)) return { valid: false, error: 'Valor inválido.' };
  if (v < 0) return { valid: false, error: 'O valor não pode ser negativo.' };
  if (rule.type === 'PERCENTAGE' && v > 100) return { valid: false, error: 'Percentual máximo é 100%.' };
  if (rule.type !== 'PERCENTAGE' && rule.type !== 'FIXED') return { valid: false, error: 'Tipo de taxa inválido.' };
  return { valid: true };
}

export function computeFee(gross: number, rule: CardFeeRule): FeeComputation {
  const grossCents = toCents(gross);
  let feeCents = 0;
  if (rule.type === 'PERCENTAGE') {
    const basisPoints = Math.round(rule.value * 100); // 2,49% -> 249
    feeCents = Math.round((grossCents * basisPoints) / 10000);
  } else {
    feeCents = toCents(rule.value);
  }
  feeCents = Math.min(feeCents, grossCents);
  return { feeAmount: fromCents(feeCents), netValue: fromCents(grossCents - feeCents) };
}

// Distribui a taxa total entre as parcelas proporcionalmente ao valor, com o
// resto de centavos na última — a soma sempre fecha exatamente com o total.
export function distributeFee(totalFee: number, installmentValues: number[]): number[] {
  const totalCents = toCents(totalFee);
  const sum = installmentValues.reduce((a, v) => a + toCents(v), 0);
  if (installmentValues.length === 0) return [];
  if (sum <= 0) return installmentValues.map(() => 0);
  const result: number[] = [];
  let allocated = 0;
  installmentValues.forEach((v, i) => {
    if (i === installmentValues.length - 1) {
      result.push(fromCents(totalCents - allocated));
    } else {
      const part = Math.round((totalCents * toCents(v)) / sum);
      allocated += part;
      result.push(fromCents(part));
    }
  });
  return result;
}

export function getActiveBrands(settings?: CardFeeSettings): CardBrand[] {
  return (settings?.brands || []).filter((b) => b.active !== false);
}

export function findBrand(settings: CardFeeSettings | undefined, brandId?: string): CardBrand | undefined {
  if (!brandId) return undefined;
  return (settings?.brands || []).find((b) => b.id === brandId);
}

// Resolve a regra da bandeira/modalidade/parcelas. Distingue "não configurada"
// (ausente) de "configurada como zero" (regra presente com value 0).
// Sem brandId (lançamento antigo, sem bandeira) cai na configuração global
// legada (`debit` / `credit[n]`) — nunca inventa taxa.
export function resolveCardFee(
  settings: CardFeeSettings | undefined,
  params: { brandId?: string; mode: CardPaymentMode; installments?: number; receivingMode?: ReceivingMode }
): FeeResolution {
  const inst = params.mode === 'DEBIT' ? 1 : params.installments || 1;
  if (params.brandId) {
    const brand = findBrand(settings, params.brandId);
    const table = params.receivingMode === 'NORMAL' ? brand?.normal : brand;
    const rule = params.mode === 'DEBIT' ? table?.debit : table?.credit?.[inst];
    if (rule && validateFeeRule(rule).valid) return { status: 'CONFIGURED', rule, source: 'BRAND' };
    return { status: 'NOT_CONFIGURED' };
  }
  const legacy = params.mode === 'DEBIT' ? settings?.debit : settings?.credit?.[inst];
  if (typeof legacy === 'number' && Number.isFinite(legacy) && legacy >= 0) {
    return { status: 'CONFIGURED', rule: { type: 'PERCENTAGE', value: legacy }, source: 'LEGACY' };
  }
  return { status: 'NOT_CONFIGURED' };
}

export function newBrandId(): string {
  return `brand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Idempotente: só cria Visa/Mastercard/Elo quando NENHUMA bandeira existe.
// Regras nascem vazias (não configuradas) — nunca copia a taxa global legada,
// pois não há como saber a qual bandeira ela se refere.
export function ensureDefaultBrands(settings: CardFeeSettings | undefined): CardFeeSettings {
  const base = settings || {};
  if (base.brands && base.brands.length > 0) return base;
  return {
    ...base,
    brands: DEFAULT_CARD_BRAND_NAMES.map((name) => ({ id: newBrandId(), name, active: true })),
  };
}

export function hasLegacyFees(settings?: CardFeeSettings): boolean {
  if (!settings) return false;
  const anyCredit = Object.values(settings.credit || {}).some((v) => typeof v === 'number' && v > 0);
  return Boolean((settings.debit || 0) > 0 || anyCredit);
}

export function formatFeeRule(rule: CardFeeRule): string {
  if (rule.type === 'FIXED') {
    return `${rule.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} fixa`;
  }
  return `${rule.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function missingFeeMessage(
  brandName: string,
  mode: CardPaymentMode,
  installments?: number,
  profile?: SettlementProfileId
): string {
  const base = `Taxa não configurada para ${brandName} • ${mode === 'DEBIT' ? 'Débito' : `Crédito • ${installments || 1}x`}`;
  return profile ? `${base} • Recebimento ${settlementProfileLabel(profile)}` : base;
}

// Simulador puro (mesma resolução + cálculo usados na venda).
export function simulateCardFee(
  settings: CardFeeSettings | undefined,
  params: { gross: number; brandId?: string; mode: CardPaymentMode; installments?: number; receivingMode?: ReceivingMode }
): { configured: false } | ({ configured: true; rule: CardFeeRule; gross: number } & FeeComputation) {
  const res = resolveCardFee(settings, params);
  if (res.status !== 'CONFIGURED') return { configured: false };
  return { configured: true, rule: res.rule, gross: params.gross, ...computeFee(params.gross, res.rule) };
}

// ---------------------------------------------------------------------------
// Perfil de recebimento (prazo da clínica) — independente do parcelamento do
// paciente. As taxas configuradas JÁ INCLUEM o custo do perfil ativo: nunca
// somar taxa de antecipação por cima. Cada perfil futuro precisará de sua
// própria tabela de taxas (não reaproveitar a tabela atual sem confirmação).
// ---------------------------------------------------------------------------
export const DEFAULT_SETTLEMENT_PROFILE: SettlementProfileId = 'D1';

export const SETTLEMENT_PROFILES: Record<SettlementProfileId, { label: string; businessDays?: number; calendarDays?: number }> = {
  D0: { label: 'Na hora', businessDays: 0 },
  D1: { label: '1 dia útil', businessDays: 1 },
  D14: { label: '14 dias', calendarDays: 14 },
  D30: { label: '30 dias', calendarDays: 30 },
};

export function getActiveSettlementProfile(settings?: CardFeeSettings): SettlementProfileId {
  const p = settings?.settlementProfile;
  return p && SETTLEMENT_PROFILES[p] ? p : DEFAULT_SETTLEMENT_PROFILE;
}

export function settlementProfileLabel(profile?: SettlementProfileId): string {
  return SETTLEMENT_PROFILES[profile || DEFAULT_SETTLEMENT_PROFILE]?.label || '—';
}

const civil = (d: string) => new Date(`${d.split('T')[0]}T12:00:00`);
const civilStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Dia útil = segunda a sexta, exceto feriados nacionais (src/lib/holidays.ts).
// Limitação: feriados estaduais/municipais e pontos facultativos não entram.
export function isBusinessDay(dateStr: string): boolean {
  const d = civil(dateStr);
  const wd = d.getDay();
  return wd !== 0 && wd !== 6 && !getHoliday(d);
}

export function addBusinessDays(dateStr: string, n: number): string {
  const d = civil(dateStr);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(civilStr(d))) left--;
  }
  return civilStr(d);
}

export function nextBusinessDayOnOrAfter(dateStr: string): string {
  const d = civil(dateStr);
  while (!isBusinessDay(civilStr(d))) d.setDate(d.getDate() + 1);
  return civilStr(d);
}

export function computeSettlementDate(saleDate: string, profile: SettlementProfileId = DEFAULT_SETTLEMENT_PROFILE): string {
  const def = SETTLEMENT_PROFILES[profile] || SETTLEMENT_PROFILES[DEFAULT_SETTLEMENT_PROFILE];
  if (def.calendarDays) {
    const d = civil(saleDate);
    d.setDate(d.getDate() + def.calendarDays);
    return nextBusinessDayOnOrAfter(civilStr(d));
  }
  const n = def.businessDays ?? 1;
  return n === 0 ? saleDate.split('T')[0] : addBusinessDays(saleDate, n);
}

// Plano de uma venda no cartão: o parcelamento do paciente é só metadata
// comercial; a clínica tem UM recebimento (líquido) na data do perfil.
export function planCardReceivable(params: {
  gross: number;
  rule: CardFeeRule;
  customerInstallments: number;
  saleDate: string;
  profile?: SettlementProfileId;
}) {
  const calc = computeFee(params.gross, params.rule);
  return {
    customerInstallments: params.customerInstallments,
    customerInstallmentAmount: fromCents(Math.round(toCents(params.gross) / Math.max(1, params.customerInstallments))),
    gross: params.gross,
    feeAmount: calc.feeAmount,
    net: calc.netValue,
    clinicReceivables: 1,
    settlementProfile: params.profile || DEFAULT_SETTLEMENT_PROFILE,
    settlementDate: computeSettlementDate(params.saleDate, params.profile || DEFAULT_SETTLEMENT_PROFILE),
  };
}

// ---------------------------------------------------------------------------
// Bruto x Taxa x Líquido de recebimentos. Convenção: `amountReceived` é o
// dinheiro que efetivamente entrou (LÍQUIDO da taxa). O bruto (faturamento,
// base tributária) = líquido + taxa. Recebimentos antigos baixados com o valor
// bruto digitado (amountReceived ≈ value) já são o bruto.
// ---------------------------------------------------------------------------
export interface ReceiptLike {
  value?: number;
  amountReceived?: number;
  cardFeeAmount?: number;
}

export function getInstallmentGrossReceived(inst: ReceiptLike): number {
  const value = inst.value || 0;
  const rec = inst.amountReceived || 0;
  const fee = inst.cardFeeAmount || 0;
  if (rec > 0 && fee > 0 && rec <= value - fee + 0.01) return fromCents(toCents(rec) + toCents(fee));
  return rec > 0 ? rec : value;
}

export function summarizeReceipts(items: Array<ReceiptLike & { status?: string }>): { gross: number; fees: number; net: number } {
  let grossC = 0;
  let feeC = 0;
  items.forEach((i) => {
    if (!(i.status === 'RECEBIDO' || (i.amountReceived || 0) > 0)) return;
    const g = toCents(getInstallmentGrossReceived(i));
    const f = Math.min(g, toCents(i.cardFeeAmount || 0));
    grossC += g;
    feeC += f;
  });
  return { gross: fromCents(grossC), fees: fromCents(feeC), net: fromCents(grossC - feeC) };
}

// ---------------------------------------------------------------------------
// Antecipação por tenant: ANTICIPATED (1 recebível líquido no prazo do perfil)
// x NORMAL (cronograma das parcelas). Cada modo tem sua PRÓPRIA tabela de taxas.
// ---------------------------------------------------------------------------
export function isAnticipationEnabled(settings?: CardFeeSettings): boolean {
  return settings?.anticipationEnabled === true;
}

export function getDefaultReceivingMode(settings?: CardFeeSettings): ReceivingMode {
  return isAnticipationEnabled(settings) ? settings?.defaultReceivingMode || 'ANTICIPATED' : 'NORMAL';
}

// Override da venda só vale quando a clínica antecipa; caso contrário sempre NORMAL.
export function resolveReceivingMode(settings: CardFeeSettings | undefined, override?: ReceivingMode | ''): ReceivingMode {
  if (!isAnticipationEnabled(settings)) return 'NORMAL';
  return override || getDefaultReceivingMode(settings);
}

export function receivingModeLabel(mode?: ReceivingMode, profile?: SettlementProfileId): string {
  if (mode === 'ANTICIPATED') return `Antecipado — ${settlementProfileLabel(profile)}`;
  if (mode === 'NORMAL') return 'Normal — conforme parcelas';
  return '—';
}

export interface ScheduleRow {
  number: number;
  total: number;
  dueDate: string;
  gross: number;
  fee: number;
  net: number;
}

// Cronograma de recebíveis da CLÍNICA. Regra canônica: a taxa da configuração é o TOTAL da venda e é
// rateada entre os recebíveis (soma exata); a soma do bruto = valor da venda (nunca × N).
// NORMAL segue o fluxo já usado pela arquitetura: parcela i vence i-1 meses após a data da venda.
export function planCardSchedule(params: {
  gross: number;
  rule: CardFeeRule;
  customerInstallments: number;
  saleDate: string;
  mode: ReceivingMode;
  profile?: SettlementProfileId;
  isCredit: boolean;
}): { mode: ReceivingMode; totalFee: number; totalNet: number; rows: ScheduleRow[] } {
  const calc = computeFee(params.gross, params.rule);
  const count = params.mode === 'ANTICIPATED' || !params.isCredit ? 1 : Math.max(1, params.customerInstallments);
  const base = Number((params.gross / count).toFixed(2));
  const values: number[] = [];
  let acc = 0;
  for (let k = 1; k <= count; k++) {
    const v = k === count ? Number((params.gross - acc).toFixed(2)) : base;
    acc += v;
    values.push(v);
  }
  const fees = distributeFee(calc.feeAmount, values);
  const rows: ScheduleRow[] = values.map((v, idx) => {
    let dueDate: string;
    if (params.mode === 'ANTICIPATED') {
      dueDate = computeSettlementDate(params.saleDate, params.profile || DEFAULT_SETTLEMENT_PROFILE);
    } else {
      const d = new Date(params.saleDate);
      d.setMonth(d.getMonth() + idx);
      dueDate = d.toISOString().split('T')[0];
    }
    return { number: idx + 1, total: count, dueDate, gross: v, fee: fees[idx], net: fromCents(toCents(v) - toCents(fees[idx])) };
  });
  return { mode: params.mode, totalFee: calc.feeAmount, totalNet: calc.netValue, rows };
}

// Opções visíveis de "Recebimento da clínica": SEMPRE exatamente duas (não existe "usar padrão" — o padrão
// da clínica só define qual delas vem pré-selecionada).
export function receivingModeOptions(profile?: SettlementProfileId): Array<{ value: ReceivingMode; label: string }> {
  return [
    { value: 'ANTICIPATED', label: receivingModeLabel('ANTICIPATED', profile) },
    { value: 'NORMAL', label: receivingModeLabel('NORMAL') },
  ];
}

// Rótulo do switch de recebimento imediato. Ele marca só o 1º recebível da clínica: com mais de um
// (crédito normal parcelado) a venda inteira NÃO está recebida, então o rótulo precisa dizer "1ª parcela".
export function receivedSwitchLabel(clinicReceivablesCount: number): string {
  return clinicReceivablesCount > 1 ? '1ª parcela já recebida' : 'Valor já recebido';
}
