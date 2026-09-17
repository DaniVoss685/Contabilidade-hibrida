/**
 * Helpers canonicos para calculo de data civil e status efetivo em atraso
 * para Contas a Pagar e Contas a Receber no Dental Finance.
 * 
 * Regras Canonicas:
 * 1. Data civil local (YYYY-MM-DD): evita distorcao de timezone UTC.
 * 2. SE item em aberto E dueDate < hoje -> "EM ATRASO".
 * 3. SE dueDate === hoje -> Permanece "A PAGAR" ou "A RECEBER" (atraso inicia no dia seguinte).
 * 4. Itens liquidados permanecem "PAGO" ou "RECEBIDO" (nunca retroagem para atraso).
 */

import { Expense, AccountReceivableItem } from '../types';

/**
 * Retorna a data civil local de hoje no formato YYYY-MM-DD.
 * Nao usa toISOString() para nao sofrer antecipacao de dia devido a fuso horario (ex: GMT-3 a noite).
 */
export function getTodayCivilDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type EffectivePayableStatus = 'PAGO' | 'EM_ATRASO' | 'A_PAGAR' | 'CANCELADO';

/**
 * Determina o status operacional efetivo de uma Despesa / Conta a Pagar.
 */
export function getEffectivePayableStatus(
  expense: Pick<Expense, 'status' | 'dueDate'>,
  todayStr: string = getTodayCivilDate()
): EffectivePayableStatus {
  if (expense.status === 'PAGO') return 'PAGO';
  if (expense.status === 'CANCELADO') return 'CANCELADO';

  if (!expense.dueDate) return 'A_PAGAR';

  // Se o vencimento e estritamente anterior a data de hoje, esta em atraso
  if (expense.dueDate < todayStr) {
    return 'EM_ATRASO';
  }

  return 'A_PAGAR';
}

export type EffectiveReceivableStatus =
  | 'RECEBIDO'
  | 'EM_ATRASO'
  | 'A_VENCER'
  | 'PARCIALMENTE_RECEBIDO'
  | 'CANCELADO';

/**
 * Determina o status operacional efetivo de um item de Contas a Receber / Parcela.
 */
export function getEffectiveReceivableStatus(
  item: {
    status?: string;
    dueDate?: string;
    balance?: number;
    amountReceived?: number;
    value?: number;
  },
  todayStr: string = getTodayCivilDate()
): EffectiveReceivableStatus {
  if (item.status === 'CANCELADO') return 'CANCELADO';

  // Se ja foi totalmente recebido ou saldo restante e zero
  const isFullyReceived =
    item.status === 'RECEBIDO' ||
    (item.balance !== undefined && item.balance <= 0 && (item.amountReceived || 0) > 0);

  if (isFullyReceived) {
    return 'RECEBIDO';
  }

  const isPartial =
    item.status === 'PARCIALMENTE_RECEBIDO' ||
    ((item.amountReceived || 0) > 0 && (item.balance || 0) > 0);

  const dueDate = item.dueDate || '';

  // Se esta vencido (dueDate < hoje civil)
  if (dueDate && dueDate < todayStr) {
    return 'EM_ATRASO';
  }

  if (isPartial) {
    return 'PARCIALMENTE_RECEBIDO';
  }

  return 'A_VENCER';
}

export interface ClosedCompetenceInfo {
  year: number;
  month: number;
  competenceStr: string; // YYYY-MM
}

/**
 * Retorna a ultima competencia contabil/fiscal encerrada (sempre o mes civil anterior).
 * Ex: Se hoje for 16/09/2026, a ultima competencia valida encerrada e Agosto/2026 (2026-08).
 * No mes seguinte (Outubro/2026), a competencia encerrada sera Setembro/2026 (2026-09).
 */
export function getLastClosedCompetence(): ClosedCompetenceInfo {
  const todayStr = getTodayCivilDate();
  const [yearStr, monthStr] = todayStr.split('-');
  const civilYear = parseInt(yearStr, 10);
  const civilMonth = parseInt(monthStr, 10); // 1 a 12

  const closedMonth = civilMonth === 1 ? 12 : civilMonth - 1;
  const closedYear = civilMonth === 1 ? civilYear - 1 : civilYear;
  const competenceStr = `${closedYear}-${String(closedMonth).padStart(2, '0')}`;

  return { year: closedYear, month: closedMonth, competenceStr };
}
