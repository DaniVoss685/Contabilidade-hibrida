// Bug: ao EDITAR o valor de uma receita já recebida (ex.: R$ 3.000 -> R$ 4.000, R$ 250 -> R$ 750), o valor
// "recebido" (amountReceived) ficava no valor antigo. A parcela aparecia "Totalmente recebida" em Receitas/Vendas,
// mas o Carnê-Leão (caixa) somava só o antigo — e o saldo da conta ficava creditado a menos.
// Rodar com: npx tsx tests/functional/saleEditReceivedAmount.test.ts
import { evaluateAllocation, buildSaleInstallments, BuildAllocation } from '../../src/lib/salePayments';
import { getInstallmentGrossReceived } from '../../src/lib/cardFees';
import { calculateCpfMonthlyTax } from '../../src/lib/taxEngine';
import { CardFeeSettings, PaymentMethod, Sale, SaleInstallment } from '../../src/types';

function assert(c: boolean, m: string) {
  if (!c) { console.error(`❌ FAILED: ${m}`); throw new Error(m); }
  console.log(`✅ PASSED: ${m}`);
}

const cfg: CardFeeSettings = { brands: [] };
function build(amount: number, date: string, prev: SaleInstallment[] = [], editing = false, method: PaymentMethod = 'PIX') {
  const ev = evaluateAllocation(cfg, { method, amount, installments: 1 });
  const allocations: BuildAllocation[] = [
    { n: 1, method, amount, ev, brandBased: false, received: true, bankAccountId: 'b1', paymentDate: date },
  ];
  return buildSaleInstallments({
    allocations, split: false, saleDate: date, paymentDate: date, profile: 'D1', taxOrigin: 'CPF',
    receiptIdentifier: '', bankAccountId: 'b1', prev, saleId: 's1', isEditing: editing, idSeed: 5,
  });
}

console.log('=== 1. Receita criada com R$ 3.000 e editada para R$ 4.000 (caso real da Bizone) ===');
{
  const original = build(3000, '2026-09-10');
  assert(original[0].amountReceived === 3000, 'criada: recebido R$ 3.000');
  const edited = build(4000, '2026-09-10', original, true);
  assert(edited[0].value === 4000, 'editada: valor R$ 4.000');
  assert(edited[0].amountReceived === 4000, `o recebido acompanha o novo valor (obtido ${edited[0].amountReceived})`);
  assert(edited[0].status === 'RECEBIDO', 'continua recebida');
}

console.log('\n=== 2. Mesmo caso com R$ 250 -> R$ 750 ===');
{
  const original = build(250, '2026-09-17');
  const edited = build(750, '2026-09-17', original, true);
  assert(edited[0].amountReceived === 750, `R$ 250 editado para R$ 750 passa a ter R$ 750 recebidos (obtido ${edited[0].amountReceived})`);
}

console.log('\n=== 3. Valor reduzido na edição também acompanha ===');
{
  const original = build(1000, '2026-09-17');
  const edited = build(600, '2026-09-17', original, true);
  assert(edited[0].amountReceived === 600, 'R$ 1.000 editado para R$ 600: recebido R$ 600');
}

console.log('\n=== 4. Edição sem mudar o valor preserva o recebido já gravado (ex.: baixa com valor ajustado) ===');
{
  const original = build(2000, '2026-09-17');
  const ajustada: SaleInstallment[] = [{ ...original[0], amountReceived: 1900 }];
  const edited = build(2000, '2026-10-02', ajustada, true);
  assert(edited[0].amountReceived === 1900, 'valor igual: mantém os R$ 1.900 efetivamente recebidos');
  assert(edited[0].paymentDate === '2026-10-02', 'e a troca de data continua valendo');
}

console.log('\n=== 5. Efeito no Carnê-Leão: setembro soma o valor inteiro ===');
{
  const claudio = build(4000, '2026-09-10', build(3000, '2026-09-10'), true);
  const priscila = build(750, '2026-09-17', build(250, '2026-09-17'), true);
  const mk = (id: string, inst: SaleInstallment[]) => ({ id, taxOrigin: 'CPF', installments: inst, totalValue: inst[0].value, serviceDate: inst[0].paymentDate }) as unknown as Sale;
  const r = calculateCpfMonthlyTax([mk('a', claudio), mk('b', priscila)], [], '2026-09', 2026).grossRevenueReceived;
  assert(r === 4750, `Carnê-Leão de setembro = R$ 4.750 (obtido ${r}); antes ficava R$ 3.250`);
  assert(getInstallmentGrossReceived(claudio[0]) === 4000 && getInstallmentGrossReceived(priscila[0]) === 750, 'bruto recebido = valor da parcela');
}

console.log('\n=== 6. Cartão: o recebido continua LÍQUIDO (valor − taxa) ===');
{
  const cardCfg: CardFeeSettings = { brands: [{ id: 'v', name: 'Visa', active: true, normal: { debit: { type: 'PERCENTAGE', value: 2 } } }] } as CardFeeSettings;
  const ev = evaluateAllocation(cardCfg, { method: 'CARTAO_DEBITO', amount: 1000, brandId: 'v', installments: 1 });
  const al: BuildAllocation = { n: 1, method: 'CARTAO_DEBITO', amount: 1000, ev, brandBased: true, brandId: 'v', brandName: 'Visa', received: true, bankAccountId: 'b1', paymentDate: '2026-09-10' };
  const base = { split: false, saleDate: '2026-09-10', paymentDate: '2026-09-10', profile: 'D1' as const, taxOrigin: 'CPF' as const, receiptIdentifier: '', bankAccountId: 'b1', saleId: 's1', idSeed: 9 };
  const first = buildSaleInstallments({ ...base, allocations: [al], prev: [], isEditing: false });
  const ev2 = evaluateAllocation(cardCfg, { method: 'CARTAO_DEBITO', amount: 2000, brandId: 'v', installments: 1 });
  const edited = buildSaleInstallments({ ...base, allocations: [{ ...al, amount: 2000, ev: ev2 }], prev: first, isEditing: true });
  assert(first[0].amountReceived === 980 && edited[0].amountReceived === 1960, `líquido acompanha o novo valor com taxa de 2% (980 -> ${edited[0].amountReceived})`);
}

console.log('\nTodas as verificações passaram.');
