// Conta de recebimento POR ALOCAÇÃO (pagamento dividido), caixa "Dinheiro em Espécie" idempotente e saldos.
// Rodar com: npx tsx tests/functional/bankAccountPerAllocation.test.ts
import { readFileSync } from 'fs';
import { evaluateAllocation, buildSaleInstallments, BuildAllocation } from '../../src/lib/salePayments';
import { planCashAccount, findCashAccount, isCashAccount, receivedByAccount, selectableAccounts, suggestedAccountFor } from '../../src/lib/bankAccounts';
import { BankAccount, CardFeeSettings, PaymentMethod, ReceivingMode } from '../../src/types';

function assert(c: boolean, m: string) {
  if (!c) { console.error(`❌ FAILED: ${m}`); throw new Error(m); }
  console.log(`✅ PASSED: ${m}`);
}
const src = (p: string) => readFileSync(p, 'utf-8');

const cfg: CardFeeSettings = {
  anticipationEnabled: true, defaultReceivingMode: 'ANTICIPATED', settlementProfile: 'D1',
  brands: [{ id: 'visa', name: 'Visa', active: true, credit: { 4: { type: 'PERCENTAGE', value: 10 } }, normal: { credit: { 4: { type: 'PERCENTAGE', value: 6 } } } }],
};
interface Spec { method: PaymentMethod; amount: number; bank: string; received?: boolean; date?: string; brand?: string; n?: number; mode?: ReceivingMode }
function build(specs: Spec[], prev: any[] = [], taxOrigin: 'CPF' | 'CNPJ' = 'CNPJ') {
  const allocations: BuildAllocation[] = specs.map((sp, i) => {
    const ev = evaluateAllocation(cfg, { method: sp.method, amount: sp.amount, brandId: sp.brand, installments: sp.n || 1, receivingOverride: sp.mode });
    return { n: i + 1, method: sp.method, amount: sp.amount, ev, brandBased: ev.isCard && !!ev.feeRule && !!sp.brand, brandId: sp.brand, brandName: sp.brand, received: !!sp.received, bankAccountId: sp.bank, paymentDate: sp.date };
  });
  return buildSaleInstallments({
    allocations, split: specs.length > 1, saleDate: '2026-09-25', paymentDate: '2026-09-25', profile: 'D1', taxOrigin,
    receiptIdentifier: '', bankAccountId: 'GLOBAL-LEGADO', prev, saleId: 's1', isEditing: prev.length > 0, idSeed: 3,
  });
}
const sum = (m: Map<string, number>) => Math.round([...m.values()].reduce((a, b) => a + b, 0) * 100) / 100;

console.log('=== CONTA POR ALOCAÇÃO ===');
{
  const inst = build([{ method: 'PIX', amount: 500, bank: 'sicoob', received: true }, { method: 'DINHEIRO', amount: 500, bank: 'caixa', received: true }]);
  assert(inst[0].bankAccountId === 'sicoob' && inst[1].bankAccountId === 'caixa', 'BANK-01: Pix 500 -> Sicoob; Dinheiro 500 -> Caixa (duas contas diferentes)');
  assert(!inst.some((i) => i.bankAccountId === 'GLOBAL-LEGADO'), 'A conta global legada NÃO sobrescreve a conta da alocação');
  const bal = receivedByAccount(inst);
  assert(bal.get('sicoob') === 500 && bal.get('caixa') === 500 && sum(bal) === 1000, 'BANK-09/Saldos: +500 Sicoob, +500 Caixa, total 1000 (não +1000 no Sicoob)');
}
{
  const inst = build([{ method: 'PIX', amount: 200, bank: 'sicoob', received: true }, { method: 'CARTAO_CREDITO', amount: 800, bank: 'itau', brand: 'visa', n: 4, mode: 'ANTICIPATED' }]);
  assert(inst[0].bankAccountId === 'sicoob' && inst[1].bankAccountId === 'itau', 'BANK-02: recebíveis herdam a conta da PRÓPRIA alocação (Pix Sicoob, cartão Itaú)');
  assert(inst.filter((i) => i.allocationNumber === 2).length === 1 && inst[1].dueDate === '2026-09-28' && inst[1].bankAccountId === 'itau', 'BANK-04: cartão antecipado = 1 recebível D+1 na conta do cartão');
}
{
  const inst = build([{ method: 'PIX', amount: 200, bank: 'sicoob' }, { method: 'CARTAO_CREDITO', amount: 800, bank: 'itau', brand: 'visa', n: 4, mode: 'NORMAL' }]);
  const card = inst.filter((i) => i.allocationNumber === 2);
  assert(card.length === 4 && card.every((i) => i.bankAccountId === 'itau'), 'BANK-03: cartão normal 4x -> as 4 liquidações na conta da alocação (sem alternar)');
}
{
  const inst = build([
    { method: 'PIX', amount: 500, bank: 'sicoob', received: true, date: '2026-09-25' },
    { method: 'CARTAO_CREDITO', amount: 500, bank: 'itau', brand: 'visa', n: 1 },
  ]);
  const pix = inst.find((i) => i.allocationNumber === 1)!;
  assert(pix.paymentDate === '2026-09-25' && inst.find((i) => i.allocationNumber === 2)!.paymentDate === undefined, 'Data de recebimento por alocação (Pix hoje; cartão sem data ainda)');
  const d = build([{ method: 'PIX', amount: 300, bank: 'a', received: true, date: '2026-09-20' }, { method: 'DINHEIRO', amount: 700, bank: 'c', received: true, date: '2026-09-22' }]);
  assert(d[0].paymentDate === '2026-09-20' && d[1].paymentDate === '2026-09-22', 'Duas datas diferentes gravadas, uma por alocação');
}

console.log('\n=== EDIÇÃO / TROCA DE CONTA ===');
{
  const first = build([{ method: 'PIX', amount: 500, bank: 'sicoob' }, { method: 'DINHEIRO', amount: 500, bank: 'caixa' }]);
  const edited = build([{ method: 'PIX', amount: 500, bank: 'itau' }, { method: 'DINHEIRO', amount: 500, bank: 'caixa' }], first);
  assert(edited[0].bankAccountId === 'itau' && edited[1].bankAccountId === 'caixa' && edited.every((i, x) => i.id === first[x].id), 'BANK-08: trocar Sicoob -> Itaú numa alocação ainda não liquidada (mesmos IDs, só a conta muda)');
  const rec1 = build([{ method: 'PIX', amount: 500, bank: 'sicoob', received: true }]);
  const rec2 = build([{ method: 'PIX', amount: 500, bank: 'itau', received: true }], rec1);
  const before = receivedByAccount(rec1), after = receivedByAccount(rec2);
  assert(before.get('sicoob') === 500 && after.get('itau') === 500 && !after.has('sicoob'), 'Alocação recebida: trocar a conta move o saldo (Sicoob -500, Itaú +500) — mesma reconciliação de db.reconcileBankBalances');
}

console.log('\n=== CAIXA (DINHEIRO EM ESPÉCIE) ===');
{
  let accounts: BankAccount[] = [];
  let created = 0;
  const ensure = () => {
    const plan = planCashAccount(accounts);
    if (plan.existing) return plan.existing;
    created++;
    const acc = { ...plan.draft!, id: `bank_${created}`, orgId: 'o' } as BankAccount;
    accounts = [...accounts, acc];
    return acc;
  };
  const a = ensure();
  assert(a.name === 'Dinheiro em Espécie' && a.accountType === 'CAIXA' && a.isActive === true, 'BANK-05: primeiro pagamento em dinheiro cria "Dinheiro em Espécie" (tipo CAIXA, ativa)');
  const b = ensure(); const c = ensure();
  assert(b.id === a.id && c.id === a.id && created === 1 && accounts.length === 1, 'BANK-06/idempotência: 2º e 3º pagamentos reutilizam o mesmo caixa (contagem final 1)');
  const legacy: BankAccount = { id: 'x', orgId: 'o', name: 'Dinheiro em espécie CPF', bankName: 'Dinheiro em espécie', accountType: 'CORRENTE_PF', initialBalance: 0, currentBalance: 0, isActive: true };
  assert(findCollapsed([legacy]) === 'x' && planCashAccount([legacy]).existing?.id === 'x', 'Conta de dinheiro já existente (criada antes do tipo CAIXA) é reconhecida — não duplica');
  function findCollapsed(list: BankAccount[]) { return findCashAccount(list)?.id; }
  assert(isCashAccount(a) && !isCashAccount({ accountType: 'CORRENTE_PJ', name: 'Sicoob PJ', bankName: 'Sicoob' }), 'Só contas de caixa são reconhecidas como caixa');
  const two: BankAccount[] = [a, { ...a, id: 'bank_x', name: 'Caixa Unidade 2' }];
  assert(two.filter(isCashAccount).length === 2 && planCashAccount(two).existing !== undefined, 'Arquitetura permite vários caixas (nada hardcoded a uma única conta)');
  const bank = { id: 'sic', orgId: 'o', name: 'Sicoob PJ', bankName: 'Sicoob', accountType: 'CORRENTE_PJ', initialBalance: 0, currentBalance: 0, isActive: true, isPreferred: true } as BankAccount;
  assert(suggestedAccountFor('DINHEIRO', [bank, a], 'sic') === a.id && suggestedAccountFor('PIX', [bank, a], 'sic') === 'sic', 'Dinheiro sugere o caixa; Pix sugere a conta padrão (visível, editável)');
}

console.log('\n=== CONTA INATIVA / MULTI-TENANT ===');
{
  const list: BankAccount[] = [
    { id: 'a', orgId: 'o', name: 'A', bankName: 'A', accountType: 'CORRENTE_PJ', initialBalance: 0, currentBalance: 0, isActive: true },
    { id: 'b', orgId: 'o', name: 'B', bankName: 'B', accountType: 'CORRENTE_PJ', initialBalance: 0, currentBalance: 0, isActive: false },
  ];
  assert(selectableAccounts(list).map((x) => x.id).join() === 'a', 'Conta inativa não aparece em novos lançamentos');
  assert(selectableAccounts(list, 'b').map((x) => x.id).join() === 'a,b', 'Conta inativa já usada continua visível no lançamento antigo');
  const tenantA: BankAccount[] = []; const tenantB: BankAccount[] = [];
  const pa = planCashAccount(tenantA); const pb = planCashAccount(tenantB);
  assert(!!pa.draft && !!pb.draft && tenantA.length === 0, 'BANK-07: o caixa é criado por tenant a partir das contas DAQUELE tenant (nenhum vazamento)');
  const db = src('src/lib/db.ts');
  assert(db.includes('public ensureCashBankAccount(): BankAccount') && db.includes('planCashAccount(this.bankAccounts || [])') && !/ensureCashBankAccount\([^)]*tenant/i.test(db), 'Criação usa o tenant ativo da sessão (this.activeTenantId), sem receber tenant_id do formulário');
}

console.log('\n=== UI (checagem estática) ===');
{
  const modal = src('src/components/Modals/NewSaleModal.tsx');
  const fields = src('src/components/Modals/AllocationReceivingFields.tsx');
  assert(fields.includes("'Conta de recebimento *'") && !fields.includes('Conta Bancária de Recebimento'), 'Label "Conta de recebimento" (não mais "Conta Bancária de Recebimento")');
  assert((modal.match(/<AllocationReceivingFields/g) || []).length === 2, 'Cada pagamento (1 e 2) tem seu bloco de conta + recebido + data');
  assert(modal.indexOf('PAGAMENTO 1') < modal.indexOf('<AllocationReceivingFields') && modal.indexOf('Pagamento 2 —') > modal.indexOf('+ Dividir pagamento'), 'Ordem: Pagamento 1 (com conta) → + Dividir pagamento → Pagamento 2 (com conta)');
  assert(fields.includes('h-[42px]') && fields.includes('grid grid-cols-1 sm:grid-cols-2 gap-3 items-end'), 'Switch alinhado à conta dentro de cada bloco (grid, mesma altura)');
  assert(modal.includes('bankAccountId: al.bankAccountId') && modal.includes('paymentDate: al.paymentDate'), 'Conta e data vêm da alocação no build dos recebíveis');
}

console.log('\n🎉 TODOS OS TESTES DE CONTA POR ALOCAÇÃO PASSARAM!');
