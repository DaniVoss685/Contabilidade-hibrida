// Orçamentos (Fase D) — regras puras. Criar/editar um orçamento nunca produz efeito financeiro,
// fiscal ou de estoque; só decide valores/status do próprio documento. A conversão em venda é uma
// ação SEPARADA e explícita do usuário (abre Nova Receita pré-preenchida) — nunca automática.

import { BudgetItem, BudgetStatus, DentalProcedure } from '../types';

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

/** "A, B e C" — nunca ", e" nem vírgula sobrando antes do último item. */
function joinHumanList(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/**
 * Payload de pré-preenchimento para Nova Receita — Sale é de UM procedimento só (mesmo modelo já
 * usado por Appointment/ClinicalRecord neste projeto), então um orçamento com vários itens vira um
 * resumo no nome. A descrição é sempre texto 100% humano — nunca IDs técnicos (`budget_...`,
 * `item_...`) nem valores crus sem formatação; quem precisa da itemização completa com preços
 * consulta o orçamento original através do vínculo estruturado (`budgetId`, ver BUDGET-CONV-01/02),
 * nunca precisou estar na descrição. O item já perdido (se algum dia precisar auditar) continua
 * 100% preservado no próprio Budget — a conversão nunca o altera.
 */
export interface SaleDraftFromBudget {
  procedureName: string;
  totalValue: number;
  notes: string;
  budgetId: string;
}

/** Resumo curto dos procedimentos de um orçamento — fonte única usada tanto para pré-preencher o
 * nome do procedimento na conversão em venda quanto no agendamento ("Agendar tratamento"). */
export function summarizeBudgetItemNames(items: Pick<BudgetItem, 'procedureName'>[]): string {
  const names = items.map((i) => i.procedureName).filter(Boolean);
  return names.length <= 1
    ? names[0] || 'Procedimentos do orçamento'
    : names.length <= 3
    ? names.join(' + ')
    : `${names.slice(0, 2).join(' + ')} + ${names.length - 2} outro(s)`;
}

/**
 * Resolve o procedimento de catálogo representado pelo orçamento quando todos os itens apontam
 * para o mesmo procedimento. Primeiro usa o ID persistido; em orçamentos legados sem ID, tenta
 * uma correspondência exata e sem distinção entre maiúsculas/minúsculas pelo nome.
 * Orçamentos com procedimentos distintos não podem ser vinculados a um único Sale.procedureId.
 */
export function resolveBudgetCatalogProcedure(
  items: Pick<BudgetItem, 'procedureId' | 'procedureName'>[],
  procedures: DentalProcedure[]
): DentalProcedure | undefined {
  if (items.length === 0) return undefined;

  const matches = items.map((item) => {
    const byId = item.procedureId
      ? procedures.find((procedure) => procedure.id === item.procedureId)
      : undefined;
    if (byId) return byId;

    const normalizedName = item.procedureName.trim().toLocaleLowerCase();
    return normalizedName
      ? procedures.find((procedure) => procedure.name.trim().toLocaleLowerCase() === normalizedName)
      : undefined;
  });

  const first = matches[0];
  return first && matches.every((procedure) => procedure?.id === first.id) ? first : undefined;
}

export function buildSaleDraftFromBudget(budget: {
  items: BudgetItem[];
  total: number;
  id: string;
}): SaleDraftFromBudget {
  const names = budget.items.map((i) => i.procedureName).filter(Boolean);
  const procedureName = summarizeBudgetItemNames(budget.items);

  const humanList = joinHumanList(names);
  let notes: string;
  if (names.length <= 1) {
    notes = 'Tratamento odontológico conforme orçamento aprovado.';
  } else if (humanList.length <= 110) {
    notes = `Tratamento conforme orçamento: ${humanList}.`;
  } else {
    notes = `Tratamento conforme orçamento — ${names.length} procedimentos.`;
  }

  return {
    procedureName,
    totalValue: budget.total,
    notes,
    budgetId: budget.id,
  };
}
