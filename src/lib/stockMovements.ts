// Estoque REAL sobre os Insumos existentes (Fase C). Regras puras — a aplicação do saldo em si
// acontece por trigger no banco (fn_apply_stock_movement, migration 20260929150000), nunca aqui;
// este módulo decide O QUE gravar (quais movimentos, quando alertar), não como o saldo muda.

import { DentalProcedure, ProcedureInputItem, StockMovementType } from '../types';

export type StockStatus = 'NAO_CONFIGURADO' | 'SEM_ESTOQUE' | 'BAIXO' | 'NORMAL';

/**
 * minimumQuantity <= 0 = a clínica ainda não configurou controle de estoque para este insumo —
 * nunca alerta sozinho (evita que todo insumo legado apareça "sem estoque" só por existir).
 */
export function computeStockStatus(quantityOnHand: number, minimumQuantity: number): StockStatus {
  if (!minimumQuantity || minimumQuantity <= 0) return 'NAO_CONFIGURADO';
  if (quantityOnHand <= 0) return 'SEM_ESTOQUE';
  if (quantityOnHand <= minimumQuantity) return 'BAIXO';
  return 'NORMAL';
}

/**
 * Alerta EDGE-TRIGGERED (só na transição, nunca a cada render): dispara apenas quando o saldo
 * cruza de "acima do mínimo" para "no mínimo ou abaixo". Voltar a subir (entrada) normaliza sem
 * gerar alerta; cair de novo ao mínimo depois de já ter normalizado pode alertar de novo — porque
 * a comparação é sempre feita entre o saldo IMEDIATAMENTE ANTES e IMEDIATAMENTE DEPOIS desta
 * movimentação específica, nunca contra um estado "já alertado" persistido.
 */
export function didCrossLowThreshold(beforeQty: number, afterQty: number, minimumQuantity: number): boolean {
  if (!minimumQuantity || minimumQuantity <= 0) return false;
  return beforeQty > minimumQuantity && afterQty <= minimumQuantity;
}

export interface PlannedStockMovement {
  inputId: string;
  quantity: number;
  movementType: StockMovementType;
}

/**
 * Consumo gerado pela finalização de UM atendimento — só para insumos do CATÁLOGO vinculados ao
 * procedimento (inputId presente; itens avulsos digitados na hora não têm insumo de estoque real
 * para debitar). Cada linha vira uma movimentação PROCEDURE_CONSUMPTION; a idempotência real (não
 * duplicar ao finalizar duas vezes) é garantida pelo índice único em banco
 * (tenant_id, clinical_record_id, input_id, movement_type) — este helper só decide O QUE consumir.
 */
export function planProcedureConsumption(inputs: ProcedureInputItem[]): PlannedStockMovement[] {
  return inputs
    .filter((item) => item.inputId && item.quantity > 0)
    .map((item) => ({
      inputId: item.inputId as string,
      quantity: item.quantity,
      movementType: 'PROCEDURE_CONSUMPTION' as StockMovementType,
    }));
}

/** Resolve os insumos a consumir a partir do procedimento vinculado a um atendimento finalizado. */
export function resolveConsumptionForClinicalRecord(
  procedure: Pick<DentalProcedure, 'inputs'> | null | undefined
): PlannedStockMovement[] {
  if (!procedure || !Array.isArray(procedure.inputs)) return [];
  return planProcedureConsumption(procedure.inputs);
}

export interface StockSummary {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  estimatedValue: number; // soma de quantityOnHand * unitCost dos insumos com estoque configurado
}

export function computeStockSummary(
  items: Array<{ quantityOnHand: number; minimumQuantity: number; unitCost: number }>
): StockSummary {
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let estimatedValue = 0;
  for (const item of items) {
    const status = computeStockStatus(item.quantityOnHand, item.minimumQuantity);
    if (status === 'BAIXO') lowStockCount++;
    if (status === 'SEM_ESTOQUE') outOfStockCount++;
    estimatedValue += (item.quantityOnHand || 0) * (item.unitCost || 0);
  }
  return { totalItems: items.length, lowStockCount, outOfStockCount, estimatedValue };
}
