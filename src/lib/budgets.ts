// Orçamentos (Fase D) — regras puras. Criar/editar um orçamento nunca produz efeito financeiro,
// fiscal ou de estoque; só decide valores/status do próprio documento. A conversão em venda é uma
// ação SEPARADA e explícita do usuário (abre Nova Receita pré-preenchida) — nunca automática.

import { BudgetItem, BudgetStatus } from '../types';

export interface BudgetTotals {
  subtotal: number;
  discountAmount: number;
  total: number;
}

/** Soma dos itens menos o desconto (percentual ou fixo) — nunca deixa o total ficar negativo. */
export function computeBudgetTotals(
  items: Pick<BudgetItem, 'totalPrice'>[],
  discountType: 'PERCENT' | 'FIXED' | null | undefined,
  discountValue: number
): BudgetTotals {
  const subtotal = items.reduce((sum, i) => sum + (i.totalPrice || 0), 0);
  let discountAmount = 0;
  if (discountType === 'PERCENT' && discountValue > 0) {
    discountAmount = subtotal * (Math.min(discountValue, 100) / 100);
  } else if (discountType === 'FIXED' && discountValue > 0) {
    discountAmount = Math.min(discountValue, subtotal);
  }
  const total = Math.max(0, subtotal - discountAmount);
  return { subtotal, discountAmount, total };
}

export function computeItemTotal(quantity: number, unitPrice: number): number {
  return Math.max(0, quantity) * Math.max(0, unitPrice);
}

/**
 * Só pode converter em venda um orçamento que ainda não foi convertido e cuja decisão do paciente
 * não foi negativa/obsoleta. RASCUNHO/APRESENTADO/APROVADO podem converter (a aprovação formal é
 * recomendada mas não é imposta pela UI — a clínica pode pular a etapa de "Apresentado/Aprovado"
 * para um orçamento fechado na hora); RECUSADO/EXPIRADO/CONVERTIDO nunca.
 */
export function canConvertToSale(status: BudgetStatus, convertedSaleId?: string | null): boolean {
  if (convertedSaleId) return false;
  return status !== 'CONVERTIDO' && status !== 'RECUSADO' && status !== 'EXPIRADO';
}

/** Puramente de exibição (badge "Vencido") — nunca muda o status sozinho, nunca precisa de cron. */
export function isPastValidity(validUntil: string | null | undefined, todayISO: string): boolean {
  if (!validUntil) return false;
  return validUntil < todayISO;
}

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  RASCUNHO: 'Rascunho',
  APRESENTADO: 'Apresentado',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
  EXPIRADO: 'Expirado',
  CONVERTIDO: 'Convertido em venda',
};

/**
 * Payload de pré-preenchimento para Nova Receita — Sale é de UM procedimento só (mesmo modelo já
 * usado por Appointment/ClinicalRecord neste projeto), então um orçamento com vários itens vira um
 * resumo no nome + o detalhamento completo nas observações, para não perder a itemização mesmo sem
 * conseguir representá-la 1:1 no cadastro de venda atual.
 */
export interface SaleDraftFromBudget {
  procedureName: string;
  totalValue: number;
  notes: string;
}

export function buildSaleDraftFromBudget(budget: {
  items: BudgetItem[];
  total: number;
  id: string;
}): SaleDraftFromBudget {
  const names = budget.items.map((i) => i.procedureName).filter(Boolean);
  const procedureName =
    names.length <= 1
      ? names[0] || 'Procedimentos do orçamento'
      : names.length <= 3
      ? names.join(' + ')
      : `${names.slice(0, 2).join(' + ')} + ${names.length - 2} outro(s)`;

  const breakdown = budget.items
    .map((i) => {
      const prof = i.professionalName ? ` — ${i.professionalName}` : '';
      return `${i.quantity}x ${i.procedureName}${prof}: ${i.totalPrice.toFixed(2)}`;
    })
    .join('\n');

  return {
    procedureName,
    totalValue: budget.total,
    notes: `Convertido do orçamento ${budget.id}.\n${breakdown}`,
  };
}
