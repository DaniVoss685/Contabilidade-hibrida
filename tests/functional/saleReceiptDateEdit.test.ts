// Bug: ao EDITAR uma receita já recebida e trocar a data de recebimento (ex.: novembro -> setembro),
// a data antiga era mantida e a nova nunca era salva. Rodar com: npx tsx tests/functional/saleReceiptDateEdit.test.ts
import { evaluateAllocation, buildSaleInstallments, BuildAllocation } from '../../src/lib/salePayments';
import { getInstallmentGrossReceived } from '../../src/lib/cardFees';
import { calculateCpfMonthlyTax } from '../../src/lib/taxEngine';
import { CardFeeSettings, PaymentMethod, Sale, SaleInstallment } from '../../src/types';

function assert(c: boolean, m: string) {
  if (!c) { console.error(`❌ FAILED: ${m}`); throw new Error(m); }
  console.log(`✅ PASSED: ${m}`);
}

const cfg: CardFeeSettings = { brands: [] };
interface Spec { method: PaymentMethod; amount: number; bank: string; received?: boolean; date?: string }
function build(specs: Spec[], prev: SaleInstallment[] = [], editing = false) {
  const allocations: BuildAllocation[] = specs.map((sp, i) => {
    const ev = evaluateAllocation(cfg, { method: sp.method, amount: sp.amount, installments: 1 });
    return { n: i + 1, method: sp.method, amount: sp.amount, ev, brandBased: false, received: !!sp.received, bankAccountId: sp.bank, paymentDate: sp.date };
  });
  return buildSaleInstallments({
    allocations, split: specs.length > 1, saleDate: '2026-09-10', paymentDate: specs[0].date || '2026-09-10', profile: 'D1', taxOrigin: 'CPF',
    receiptIdentifier: '', bankAccountId: 'b1', prev, saleId: 's1', isEditing: editing, idSeed: 7,
  });
}

console.log('=== 1. Receita lançada com recebimento em novembro ===');
const original = build([{ method: 'PIX', amount: 3300, bank: 'b1', received: true, date: '2026-11-10' }]);
assert(original[0].status === 'RECEBIDO' && original[0].paymentDate === '2026-11-10', 'criada: recebida em 10/11/2026');

console.log('\n=== 2. Edição: troca a data de recebimento para setembro ===');
{
  const edited = build([{ method: 'PIX', amount: 3300, bank: 'b1', received: true, date: '2026-09-15' }], original, true);
  assert(edited[0].paymentDate === '2026-09-15', `a nova data (15/09/2026) é salva (obtido ${edited[0].paymentDate})`);
  assert(edited[0].status === 'RECEBIDO', 'continua recebida');
  assert(edited[0].id === original[0].id, 'é a MESMA parcela (não cria outra)');
  assert(edited[0].amountReceived === original[0].amountReceived, 'o valor recebido não muda');
}

console.log('\n=== 3. Edição sem mexer na data mantém a data ===');
{
  const same = build([{ method: 'PIX', amount: 3300, bank: 'b1', received: true, date: '2026-11-10' }], original, true);
  assert(same[0].paymentDate === '2026-11-10', 'sem alterar a data, continua 10/11/2026');
}

console.log('\n=== 4. Edição de outro campo (valor) não perde a data antiga quando a tela não informa data ===');
{
  const semData = build([{ method: 'PIX', amount: 3300, bank: 'b1', received: true }], original, true);
  assert(semData[0].paymentDate === '2026-11-10', 'sem data informada, preserva a data já gravada');
}

console.log('\n=== 5. Pagamento dividido: troca só a data da 2ª forma ===');
{
  const orig2 = build([
    { method: 'PIX', amount: 1000, bank: 'b1', received: true, date: '2026-11-05' },
    { method: 'DINHEIRO', amount: 500, bank: 'b2', received: true, date: '2026-11-08' },
  ]);
  const ed = build([
    { method: 'PIX', amount: 1000, bank: 'b1', received: true, date: '2026-11-05' },
    { method: 'DINHEIRO', amount: 500, bank: 'b2', received: true, date: '2026-09-20' },
  ], orig2, true);
  const a1 = ed.find((i) => i.allocationNumber === 1)!;
  const a2 = ed.find((i) => i.allocationNumber === 2)!;
  assert(a1.paymentDate === '2026-11-05', 'a 1ª forma mantém 05/11');
  assert(a2.paymentDate === '2026-09-20', 'a 2ª forma vai para 20/09');
}

console.log('\n=== 6. Efeito real: a receita sai de novembro e entra em setembro no Carnê-Leão ===');
{
  const edited = build([{ method: 'PIX', amount: 3300, bank: 'b1', received: true, date: '2026-09-15' }], original, true);
  const sale = { id: 's1', taxOrigin: 'CPF', installments: edited, totalValue: 3300, serviceDate: '2026-09-10' } as unknown as Sale;
  const set = calculateCpfMonthlyTax([sale], [], '2026-09', 2026).grossRevenueReceived;
  const nov = calculateCpfMonthlyTax([sale], [], '2026-11', 2026).grossRevenueReceived;
  assert(set === 3300 && nov === 0, `setembro passa a ter R$ 3.300 e novembro R$ 0 (setembro=${set}, novembro=${nov})`);
  assert(getInstallmentGrossReceived(edited[0]) === 3300, 'o bruto recebido continua R$ 3.300');
}

console.log('\nTodas as verificações passaram.');
