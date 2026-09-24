import { BankAccount, SaleInstallment } from '../types';

// Contas de recebimento (banco, caixa, conta da adquirente…). O modelo existente (`df_bank_accounts`) já é
// tenant-scoped; "Caixa/Dinheiro em espécie" é uma conta do tipo CAIXA (contas antigas de dinheiro criadas
// como CORRENTE_PF com nome de dinheiro/espécie também são reconhecidas). Pode haver vários caixas.

export const CASH_ACCOUNT_NAME = 'Dinheiro em Espécie';

export function isCashAccount(b: Pick<BankAccount, 'accountType' | 'name' | 'bankName'>): boolean {
  if (b.accountType === 'CAIXA') return true;
  return /dinheiro|esp[eé]cie|caixa/i.test(`${b.bankName || ''} ${b.name || ''}`);
}

// Só contas ativas entram em novos lançamentos; a conta já usada por um lançamento antigo continua visível.
export function selectableAccounts(accounts: BankAccount[], currentId?: string): BankAccount[] {
  return accounts.filter((b) => b.isActive !== false || b.id === currentId);
}

export function findCashAccount(accounts: BankAccount[]): BankAccount | undefined {
  const active = accounts.filter((b) => b.isActive !== false && isCashAccount(b));
  // Prefere o tipo CAIXA explícito; depois o mais antigo (ordem de cadastro) — nunca cria outro se já existe algum.
  return active.find((b) => b.accountType === 'CAIXA') || active[0];
}

// Idempotente: retorna o caixa existente ou o rascunho da conta a criar (nunca "Dinheiro em Espécie 2").
export function planCashAccount(accounts: BankAccount[]): { existing?: BankAccount; draft?: Omit<BankAccount, 'id' | 'orgId'> } {
  const existing = findCashAccount(accounts);
  if (existing) return { existing };
  return {
    draft: {
      name: CASH_ACCOUNT_NAME,
      bankName: 'Dinheiro',
      accountType: 'CAIXA',
      initialBalance: 0,
      currentBalance: 0,
      isActive: true,
      isPreferred: false,
    },
  };
}

// Conta sugerida para uma forma de pagamento (visível ao usuário, nunca copiada da outra alocação):
// dinheiro -> caixa; demais -> conta preferida/padrão do tenant.
export function suggestedAccountFor(method: string, accounts: BankAccount[], preferredId: string): string {
  if (method === 'DINHEIRO') return findCashAccount(accounts)?.id || '';
  const active = accounts.filter((b) => b.isActive !== false && !isCashAccount(b));
  return active.find((b) => b.id === preferredId)?.id || active.find((b) => b.isPreferred)?.id || active[0]?.id || '';
}

// Quanto cada conta recebeu de uma venda: cada parcela RECEBIDA credita a conta da SUA alocação com o valor
// líquido que entrou (nunca "tudo na conta global"). Fonte única usada por db.reconcileBankBalances.
export function receivedByAccount(installments: Array<Pick<SaleInstallment, 'status' | 'bankAccountId' | 'amountReceived' | 'netValue' | 'value'>>): Map<string, number> {
  const map = new Map<string, number>();
  (installments || []).forEach((inst) => {
    if (inst.status !== 'RECEBIDO' || !inst.bankAccountId) return;
    const rec = inst.amountReceived ?? inst.netValue ?? inst.value;
    map.set(inst.bankAccountId, Math.round(((map.get(inst.bankAccountId) || 0) + rec) * 100) / 100);
  });
  return map;
}
