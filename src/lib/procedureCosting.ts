/**
 * Insumos e precificação de procedimentos — lógica pura (sem React, sem banco).
 *
 * Três conceitos que NÃO se misturam:
 *  1. COMO O INSUMO É COMPRADO  → embalagem (tipo, quantidade em unidade base, preço) e o custo unitário derivado.
 *  2. QUANTO É CONSUMIDO NO PROCEDIMENTO → só a QUANTIDADE UTILIZADA; a unidade e o custo base vêm do cadastro.
 *  3. COMO O PROCEDIMENTO É PRECIFICADO → custo estimado, preço sugerido, preço praticado e margem real.
 *
 * Aritmética: o custo unitário guarda até 6 casas (a UI só arredonda na exibição); os componentes de custo do
 * procedimento fecham em centavos.
 */

import type { ClinicalInput, InputUsageUnit, PricingSettings, ProcedureInputItem } from '../types';
import { safeMargin } from './mathUtils';

// ---------------------------------------------------------------------------
// Embalagem e unidade base
// ---------------------------------------------------------------------------

export const PACKAGE_TYPES = ['Caixa', 'Embalagem', 'Frasco', 'Pacote', 'Seringa', 'Tubo', 'Kit', 'Unidade'] as const;
export const DEFAULT_PACKAGE_TYPE = 'Caixa';

export const BASE_UNITS: Array<{ id: InputUsageUnit; label: string }> = [
  { id: 'un', label: 'Unidade (un)' },
  { id: 'ml', label: 'Mililitro (ml)' },
  { id: 'g', label: 'Grama (g)' },
  { id: 'tubete', label: 'Tubete' },
  { id: 'dose', label: 'Dose' },
  { id: 'kit', label: 'Kit' },
];

export function baseUnitLabel(unit: string): string {
  return BASE_UNITS.find((u) => u.id === unit)?.label || unit;
}

const roundTo = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
};
const round2 = (v: number) => roundTo(v, 2);

export const UNIT_COST_DECIMALS = 6;

/** custo_base = preço da embalagem ÷ quantidade na embalagem (0 quando algum dos dois é inválido). */
export function computeInputUnitCost(packagePrice: number, packageQuantity: number): number {
  if (!Number.isFinite(packagePrice) || !Number.isFinite(packageQuantity)) return 0;
  if (packagePrice <= 0 || packageQuantity <= 0) return 0;
  return roundTo(packagePrice / packageQuantity, UNIT_COST_DECIMALS);
}

/** "Caixa com 100 un" — descrição gerada da embalagem de compra (o campo legado purchasePackageName). */
export function buildPackageName(packageType: string, packageQuantity: number, unit: string): string {
  const qty = Number.isFinite(packageQuantity) ? packageQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '';
  return `${packageType || 'Embalagem'} com ${qty} ${unit}`.trim();
}

/**
 * Custo unitário para exibição.
 *  - 'exact'   → mostra o valor calculado sem arredondar demais: R$ 0,2799 · R$ 3,00 · R$ 20,00
 *  - 'compact' → listas: R$ 0,28 (≥ R$ 0,10) · R$ 0,028 (≥ R$ 0,01) · R$ 0,0028
 */
export function formatUnitCost(cost: number, mode: 'exact' | 'compact' = 'exact'): string {
  const value = Number.isFinite(cost) && cost > 0 ? cost : 0;
  let decimals: number;
  if (mode === 'compact') {
    decimals = value >= 0.1 || value === 0 ? 2 : value >= 0.01 ? 3 : 4;
  } else {
    decimals = 2;
    for (let d = 4; d > 2; d--) {
      // usa a menor quantidade de casas (2–4) que preserva o valor até 4 casas
      if (Math.abs(roundTo(value, d) - roundTo(value, d - 1)) > 1e-9) {
        decimals = d;
        break;
      }
    }
  }
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function formatQuantity(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '0';
}

// ---------------------------------------------------------------------------
// Consumo no procedimento
// ---------------------------------------------------------------------------

/** Item veio do catálogo (herda unidade e custo) ou é avulso (unidade e custo manuais). */
export function isCatalogItem(item: Pick<ProcedureInputItem, 'inputId'>): boolean {
  return Boolean(item.inputId);
}

/** custo da linha = quantidade utilizada × custo base (4 casas; o arredondamento em centavos é do total). */
export function computeItemCost(quantity: number, unitCost: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost) || quantity <= 0 || unitCost <= 0) return 0;
  return roundTo(quantity * unitCost, 4);
}

/** Ao escolher um insumo do catálogo: a unidade e o custo base vêm do cadastro; só falta a quantidade. */
export function buildCatalogProcedureItem(input: ClinicalInput, quantity = 1, id?: string): ProcedureInputItem {
  return {
    id: id || `proc_inp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    inputId: input.id,
    name: input.name,
    unit: input.usageUnit,
    quantity,
    unitCost: input.unitCost,
    totalCost: computeItemCost(quantity, input.unitCost),
  };
}

export function buildAdHocProcedureItem(id?: string): ProcedureInputItem {
  return {
    id: id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    unit: 'un',
    quantity: 1,
    unitCost: 0,
    totalCost: 0,
  };
}

/** Atualiza um campo do item e refaz o custo da linha. */
export function updateProcedureItem(
  item: ProcedureInputItem,
  field: 'name' | 'quantity' | 'unit' | 'unitCost',
  value: string | number
): ProcedureInputItem {
  const next = { ...item, [field]: value } as ProcedureInputItem;
  next.totalCost = computeItemCost(Number(next.quantity), Number(next.unitCost));
  return next;
}

// ---------------------------------------------------------------------------
// Parâmetros da clínica
// ---------------------------------------------------------------------------

/** Padrões históricos do sistema, usados enquanto a clínica não configurar seus parâmetros. */
export const LEGACY_PRICING_DEFAULTS = { clinicalHourRate: 220, structureCostPerHour: 0, targetMarginPercent: 65 } as const;

export interface ResolvedPricingParams {
  clinicalHourRate: number;
  structureCostPerHour: number;
  targetMarginPercent: number;
  /** true → a clínica salvou os parâmetros em Configurações (só então a margem é avaliada). */
  configured: boolean;
}

export function resolvePricingParams(settings?: PricingSettings | null): ResolvedPricingParams {
  const hourOk = settings && Number.isFinite(settings.clinicalHourRate) && settings.clinicalHourRate > 0;
  const marginOk = settings && Number.isFinite(settings.targetMarginPercent) && settings.targetMarginPercent > 0;
  const configured = Boolean(hourOk && marginOk);
  if (!configured || !settings) return { ...LEGACY_PRICING_DEFAULTS, configured: false };
  return {
    clinicalHourRate: settings.clinicalHourRate,
    structureCostPerHour: Number.isFinite(settings.structureCostPerHour) && settings.structureCostPerHour > 0 ? settings.structureCostPerHour : 0,
    targetMarginPercent: settings.targetMarginPercent,
    configured: true,
  };
}

export function validatePricingSettings(input: {
  clinicalHourRate: number;
  structureCostPerHour: number;
  targetMarginPercent: number;
}): { valid: boolean; errors: Partial<Record<'clinicalHourRate' | 'structureCostPerHour' | 'targetMarginPercent', string>> } {
  const errors: Partial<Record<'clinicalHourRate' | 'structureCostPerHour' | 'targetMarginPercent', string>> = {};
  if (!Number.isFinite(input.clinicalHourRate) || input.clinicalHourRate <= 0) errors.clinicalHourRate = 'Informe um valor maior que zero.';
  if (!Number.isFinite(input.structureCostPerHour) || input.structureCostPerHour < 0) errors.structureCostPerHour = 'Não pode ser negativo.';
  if (!Number.isFinite(input.targetMarginPercent) || input.targetMarginPercent < 1 || input.targetMarginPercent > 95) {
    errors.targetMarginPercent = 'Informe uma margem entre 1% e 95%.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

// ---------------------------------------------------------------------------
// Custo do procedimento, preço sugerido e margem
// ---------------------------------------------------------------------------

export interface ProcedureCostInput {
  durationMinutes: number;
  clinicalHourRate: number;
  structureCostPerHour?: number;
  inputs: Array<Pick<ProcedureInputItem, 'quantity' | 'unitCost'>>;
  labCost?: number;
  otherDirectCosts?: number;
}

export interface ProcedureCostBreakdown {
  professionalCost: number; // tempo × hora clínica
  structureCost: number; // tempo × custo/hora da estrutura
  inputsCost: number;
  labCost: number;
  otherDirectCosts: number;
  totalDirectCost: number;
}

export function computeProcedureCosts(input: ProcedureCostInput): ProcedureCostBreakdown {
  const hours = Math.max(0, Number(input.durationMinutes) || 0) / 60;
  const professionalCost = round2(hours * Math.max(0, Number(input.clinicalHourRate) || 0));
  const structureCost = round2(hours * Math.max(0, Number(input.structureCostPerHour) || 0));
  const inputsCost = round2(input.inputs.reduce((sum, i) => sum + computeItemCost(Number(i.quantity), Number(i.unitCost)), 0));
  const labCost = round2(Math.max(0, Number(input.labCost) || 0));
  const otherDirectCosts = round2(Math.max(0, Number(input.otherDirectCosts) || 0));
  const totalDirectCost = round2(professionalCost + structureCost + inputsCost + labCost + otherDirectCosts);
  return { professionalCost, structureCost, inputsCost, labCost, otherDirectCosts, totalDirectCost };
}

/**
 * Preço sugerido = custo ÷ (1 − margem). Fórmula já vigente no sistema (margem sobre o PREÇO), agora em centavos.
 * Sem custo não há sugestão (0).
 */
export function computeSuggestedPrice(totalDirectCost: number, marginPercent: number): number {
  if (!Number.isFinite(totalDirectCost) || totalDirectCost <= 0) return 0;
  const margin = Math.min(Math.max(Number(marginPercent) || 0, 0), 95);
  return round2(totalDirectCost / (1 - margin / 100));
}

export interface PriceMargin {
  status: 'OK' | 'WAITING_COSTS' | 'NO_PRICE';
  marginPercent: number | null;
  grossProfit: number;
}

/** Margem real = (preço − custo) ÷ preço, com os guardrails de safeMargin. */
export function computePriceMargin(price: number, totalDirectCost: number): PriceMargin {
  const m = safeMargin(price, totalDirectCost);
  return {
    status: m.status,
    marginPercent: m.marginPercent,
    grossProfit: m.status === 'NO_PRICE' ? 0 : round2(price - (m.status === 'WAITING_COSTS' ? 0 : totalDirectCost)),
  };
}

export type MarginVerdict = 'HEALTHY' | 'BELOW_TARGET' | null;

/** Só julga a margem quando a clínica CONFIGUROU uma margem-alvo. Sem parâmetro → sem julgamento (null). */
export function evaluateMargin(marginPercent: number | null, params: Pick<ResolvedPricingParams, 'configured' | 'targetMarginPercent'>): MarginVerdict {
  if (!params.configured || marginPercent === null || !Number.isFinite(marginPercent)) return null;
  return marginPercent >= params.targetMarginPercent ? 'HEALTHY' : 'BELOW_TARGET';
}

export function formatMarginPercent(marginPercent: number | null): string {
  if (marginPercent === null || !Number.isFinite(marginPercent)) return '—';
  return Number.isInteger(marginPercent)
    ? `${marginPercent}%`
    : `${marginPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
