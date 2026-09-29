// Bug: excluir uma venda (ou uma parcela do contas a receber) não revertia o saldo bancário que ela
// havia creditado — updateSale já usava reconcileBankBalances, mas deleteSale/batchDeleteSales/
// deleteReceivableInstallment/batchDeleteReceivables pulavam a reconciliação, criando saldo fantasma.
// Corrigido reusando a MESMA rotina canônica (reconcileBankBalances / receivedByAccount) — nunca uma
// segunda lógica paralela. batchDeleteSales também não chamava o servidor (a venda "excluída"
// reaparecia ao recarregar) — corrigido no mesmo lote.
// Rodar com: npx tsx tests/functional/saleDeletionBankReconciliation.test.ts

import { readFileSync } from 'fs';
import { db } from '../../src/lib/db';
import { Sale, SaleInstallment, PaymentMethod } from '../../src/types';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

db.loginDemo();

function openAccount(name: string, initial: number): string {
  const acc = db.addBankAccount({
    name,
    bankName: 'Banco Teste',
    accountType: 'CORRENTE_PJ',
    initialBalance: initial,
    currentBalance: initial,
    isActive: true,
    isPreferred: false,
  });
  return acc.id;
}

function balanceOf(accountId: string): number {
  return db.getBankAccounts().find((a) => a.id === accountId)?.currentBalance ?? NaN;
}

function inst(over: Partial<SaleInstallment> & { id: string }): SaleInstallment {
  return {
    saleId: 's',
    installmentNumber: 1,
    totalInstallments: 1,
    value: 0,
    dueDate: '2026-09-20',
    status: 'A_RECEBER',
    ...over,
  } as SaleInstallment;
}

function makeSale(over: Partial<Sale> & { installments: SaleInstallment[] }): Sale {
  const base: Omit<Sale, 'id' | 'orgId' | 'createdAt'> = {
    taxOrigin: 'CPF',
    patientId: 'pat_1',
    patientName: 'Paciente Teste',
    patientCpf: '',
    payerIsBeneficiary: true,
    procedureName: 'Procedimento Teste',
    description: '',
    totalValue: over.installments.reduce((s, i) => s + i.value, 0),
    serviceDate: '2026-09-20',
    paymentMethod: (over.installments[0]?.paymentMethod || 'PIX') as PaymentMethod,
    installmentsCount: over.installments.length,
    installments: over.installments,
  };
  const saved = db.addSale({ ...base, ...over });
  return saved;
}

// Credita manualmente a conta como se a venda já tivesse sido criada de verdade (fora do modo demo,
// addSale credita o banco na criação — em demo esse passo é pulado; simulamos o estado "já recebido").
function creditAsIfAlreadyReceived(accountId: string, amount: number) {
  db.updateBankAccountBalance(accountId, amount);
}

console.log('\n=== 1. deleteSale (venda única) ===');
{
  const acc = openAccount('Conta DEL-01', 1000);
  creditAsIfAlreadyReceived(acc, 500);
  assert(balanceOf(acc) === 1500, 'Saldo inicial após crédito simulado: 1.500');

  const sale = makeSale({
    installments: [inst({ id: 'i_del01', value: 500, status: 'RECEBIDO', amountReceived: 500, bankAccountId: acc, paymentMethod: 'PIX' })],
  });

  const ok = db.deleteSale(sale.id);
  assert(ok === true, 'deleteSale retorna true');
  assert(!db.getSales().some((s) => s.id === sale.id), 'Venda removida de getSales()');
  assert(balanceOf(acc) === 1000, 'BUG CORRIGIDO: saldo volta a 1.000 (os 500 fantasmas foram revertidos)');
}

console.log('\n=== 2. deleteSale com pagamento dividido (2 contas diferentes) ===');
{
  const accA = openAccount('Conta DEL-02-A', 2000);
  const accB = openAccount('Conta DEL-02-B', 3000);
  creditAsIfAlreadyReceived(accA, 300);
  creditAsIfAlreadyReceived(accB, 700);

  const sale = makeSale({
    installments: [
      inst({ id: 'i_del02_1', value: 300, status: 'RECEBIDO', amountReceived: 300, bankAccountId: accA, paymentMethod: 'PIX', allocationNumber: 1 } as any),
      inst({ id: 'i_del02_2', value: 700, status: 'RECEBIDO', amountReceived: 700, bankAccountId: accB, paymentMethod: 'DINHEIRO', allocationNumber: 2 } as any),
    ],
  });

  db.deleteSale(sale.id);
  assert(balanceOf(accA) === 2000, 'Conta A (alocação 1) reverte exatamente 300, nada da alocação 2');
  assert(balanceOf(accB) === 3000, 'Conta B (alocação 2) reverte exatamente 700 — cada alocação na SUA própria conta');
}

console.log('\n=== 3. deleteSale de venda ainda não recebida (não deve alterar nenhum saldo) ===');
{
  const acc = openAccount('Conta DEL-03', 1000);
  const sale = makeSale({
    installments: [inst({ id: 'i_del03', value: 400, status: 'A_RECEBER', bankAccountId: acc, paymentMethod: 'PIX' })],
  });
  db.deleteSale(sale.id);
  assert(balanceOf(acc) === 1000, 'Parcela nunca recebida não tinha creditado nada — saldo permanece 1.000');
}

console.log('\n=== 4. batchDeleteSales (2 vendas, 2 contas) ===');
{
  const accA = openAccount('Conta BATCH-A', 5000);
  const accB = openAccount('Conta BATCH-B', 5000);
  creditAsIfAlreadyReceived(accA, 200);
  creditAsIfAlreadyReceived(accB, 900);

  const s1 = makeSale({ installments: [inst({ id: 'i_batch1', value: 200, status: 'RECEBIDO', amountReceived: 200, bankAccountId: accA, paymentMethod: 'PIX' })] });
  const s2 = makeSale({ installments: [inst({ id: 'i_batch2', value: 900, status: 'RECEBIDO', amountReceived: 900, bankAccountId: accB, paymentMethod: 'CARTAO_DEBITO' })] });

  const deletedCount = db.batchDeleteSales([s1.id, s2.id]);
  assert(deletedCount === 2, 'batchDeleteSales retorna a contagem correta (2)');
  assert(!db.getSales().some((s) => s.id === s1.id || s.id === s2.id), 'As 2 vendas saíram de getSales()');
  assert(balanceOf(accA) === 5000, 'BUG CORRIGIDO: exclusão em lote reverte a Conta A (200)');
  assert(balanceOf(accB) === 5000, 'BUG CORRIGIDO: exclusão em lote reverte a Conta B (900)');
}

console.log('\n=== 5. deleteReceivableInstallment — última parcela remove a venda inteira ===');
{
  const acc = openAccount('Conta RECV-01', 1000);
  creditAsIfAlreadyReceived(acc, 650);
  const sale = makeSale({
    installments: [inst({ id: 'i_recv01', value: 650, status: 'RECEBIDO', amountReceived: 650, bankAccountId: acc, paymentMethod: 'PIX' })],
  });

  const ok = db.deleteReceivableInstallment('i_recv01');
  assert(ok === true, 'deleteReceivableInstallment retorna true');
  assert(!db.getSales().some((s) => s.id === sale.id), 'Última parcela excluída remove a venda inteira');
  assert(balanceOf(acc) === 1000, 'BUG CORRIGIDO: saldo reverte os 650 mesmo excluindo pelo caminho de Contas a Receber');
}

console.log('\n=== 6. deleteReceivableInstallment — parcela recebida excluída, outra parcela pendente permanece ===');
{
  const acc = openAccount('Conta RECV-02', 1000);
  creditAsIfAlreadyReceived(acc, 300);
  const sale = makeSale({
    installments: [
      inst({ id: 'i_recv02_paid', installmentNumber: 1, totalInstallments: 2, value: 300, status: 'RECEBIDO', amountReceived: 300, bankAccountId: acc, paymentMethod: 'PIX' }),
      inst({ id: 'i_recv02_pending', installmentNumber: 2, totalInstallments: 2, value: 250, status: 'A_RECEBER', paymentMethod: 'PIX' }),
    ],
  });

  db.deleteReceivableInstallment('i_recv02_paid');
  const remaining = db.getSales().find((s) => s.id === sale.id);
  assert(!!remaining && remaining.installments.length === 1 && remaining.installments[0].id === 'i_recv02_pending', 'A venda permanece com a parcela pendente (renumerada), só a recebida saiu');
  assert(remaining!.totalValue === 250, 'totalValue recalculado só com a parcela restante (250)');
  assert(balanceOf(acc) === 1000, 'BUG CORRIGIDO: saldo reverte os 300 da parcela paga excluída, mesmo a venda continuando a existir');
}

console.log('\n=== 7. batchDeleteReceivables — mistura de venda inteira removida + venda parcialmente afetada ===');
{
  const accA = openAccount('Conta RECV-BATCH-A', 800);
  const accB = openAccount('Conta RECV-BATCH-B', 800);
  creditAsIfAlreadyReceived(accA, 400);
  creditAsIfAlreadyReceived(accB, 150);

  // Venda inteira será removida (única parcela)
  const saleWhole = makeSale({ installments: [inst({ id: 'i_bulk_whole', value: 400, status: 'RECEBIDO', amountReceived: 400, bankAccountId: accA, paymentMethod: 'PIX' })] });
  // Venda com 2 parcelas: só a recebida (accB) entra no lote de exclusão
  const salePartial = makeSale({
    installments: [
      inst({ id: 'i_bulk_partial_paid', installmentNumber: 1, totalInstallments: 2, value: 150, status: 'RECEBIDO', amountReceived: 150, bankAccountId: accB, paymentMethod: 'PIX' }),
      inst({ id: 'i_bulk_partial_pending', installmentNumber: 2, totalInstallments: 2, value: 90, status: 'A_RECEBER', paymentMethod: 'PIX' }),
    ],
  });

  const deletedCount = db.batchDeleteReceivables(['i_bulk_whole', 'i_bulk_partial_paid']);
  assert(deletedCount === 2, 'batchDeleteReceivables retorna a contagem de parcelas excluídas (2)');
  assert(!db.getSales().some((s) => s.id === saleWhole.id), 'A venda de parcela única foi removida por inteiro');
  const remainingPartial = db.getSales().find((s) => s.id === salePartial.id);
  assert(!!remainingPartial && remainingPartial.installments.length === 1 && remainingPartial.installments[0].id === 'i_bulk_partial_pending', 'A venda parcial mantém só a parcela pendente');
  assert(balanceOf(accA) === 800, 'BUG CORRIGIDO: Conta A reverte os 400 da venda removida por inteiro');
  assert(balanceOf(accB) === 800, 'BUG CORRIGIDO: Conta B reverte os 150 da parcela paga excluída dentro do lote');
}

console.log('\n=== 8. Checagem estática — nenhum caminho de exclusão pula a reconciliação ===');
{
  const src = readFileSync('src/lib/db.ts', 'utf-8');
  const fn = (name: string) => {
    // Extrai um trecho generoso a partir da declaração (public ou private) até o próximo método de classe.
    const pub = src.indexOf(`public ${name}`);
    const priv = src.indexOf(`private ${name}`);
    const declStart = pub !== -1 ? pub : priv;
    assert(declStart !== -1, `Método ${name} encontrado em db.ts`);
    const nextMethod = src.slice(declStart + 10).search(/\n {2}(public|private) /);
    return nextMethod === -1 ? src.slice(declStart) : src.slice(declStart, declStart + 10 + nextMethod);
  };

  assert(fn('removeSaleFromState').includes('reconcileBankBalances'), 'removeSaleFromState (usado por deleteSale/deleteSaleAsync) chama reconcileBankBalances');
  assert(fn('deleteSale').includes('removeSaleFromState') && !fn('deleteSale').includes('deleteSaleAsync'), 'deleteSale usa a rotina compartilhada (não chama mais deleteSaleAsync em paralelo)');
  assert(fn('batchDeleteSales').includes('reconcileBankBalances') && fn('batchDeleteSales').includes('SupabaseService.deleteSale'), 'batchDeleteSales reconcilia E chama o servidor (2º bug: exclusão em lote nunca apagava no backend)');
  assert(fn('deleteReceivableInstallment').includes('reconcileBankBalances'), 'deleteReceivableInstallment chama reconcileBankBalances');
  assert(fn('batchDeleteReceivables').includes('reconcileBankBalances'), 'batchDeleteReceivables chama reconcileBankBalances');
  assert(src.includes('newSale: Sale | undefined'), 'reconcileBankBalances aceita newSale=undefined (venda excluída) na mesma assinatura, sem lógica paralela');
}

console.log(`\n${passed} verificações passaram.`);
