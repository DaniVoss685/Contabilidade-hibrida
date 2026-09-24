// Pagamento dividido em até 2 formas na MESMA venda. Lógica pura de src/lib/salePayments.ts (a mesma que a
// Nova Receita usa via buildSaleInstallments/evaluateAllocation/validateSplit) + KPIs de src/lib/cardFees.ts.
// Rodar com: npx tsx tests/functional/splitPayments.test.ts
import { readFileSync } from 'fs';
import {
  validateSplit, evaluateAllocation, buildSaleInstallments, getSaleAllocations, saleMethodsLabel,
  saleHasPaymentMethod, saleFeeTotals, isSplitSale, planAllocation, BuildAllocation,
} from '../../src/lib/salePayments';
import { summarizeReceipts } from '../../src/lib/cardFees';
import { CardFeeSettings, PaymentMethod, ReceivingMode } from '../../src/types';

function assert(c: boolean, m: string) {
  if (!c) { console.error(`❌ FAILED: ${m}`); throw new Error(m); }
  console.log(`✅ PASSED: ${m}`);
}
const c100 = (n: number) => Math.round(n * 100);
const sum = (a: number[]) => a.reduce((x, y) => x + c100(y), 0) / 100;

const cfg = (mode: ReceivingMode): CardFeeSettings => ({
  anticipationEnabled: true, defaultReceivingMode: mode, settlementProfile: 'D1',
  brands: [
    { id: 'visa', name: 'Visa', active: true, credit: { 1: { type: 'PERCENTAGE', value: 3 }, 4: { type: 'PERCENTAGE', value: 10 }, 5: { type: 'PERCENTAGE', value: 10 } }, normal: { credit: { 4: { type: 'PERCENTAGE', value: 6 } } }, debit: { type: 'PERCENTAGE', value: 1.5 } },
    { id: 'mc', name: 'Mastercard', active: true, credit: { 1: { type: 'PERCENTAGE', value: 5 } } },
  ],
});

interface Spec { method: PaymentMethod; amount: number; brand?: string; n?: number; received?: boolean; mode?: ReceivingMode }
function build(settings: CardFeeSettings, specs: Spec[], opts: { prev?: any[]; saleDate?: string } = {}) {
  const allocations: BuildAllocation[] = specs.map((sp, i) => {
    const ev = evaluateAllocation(settings, { method: sp.method, amount: sp.amount, brandId: sp.brand, installments: sp.n || 1, receivingOverride: sp.mode });
    return { n: i + 1, method: sp.method, amount: sp.amount, ev, brandBased: ev.isCard && !!ev.feeRule && !!sp.brand, brandId: sp.brand, brandName: sp.brand, received: !!sp.received };
  });
  const installments = buildSaleInstallments({
    allocations, split: specs.length > 1, saleDate: opts.saleDate || '2026-09-25', paymentDate: opts.saleDate || '2026-09-25',
    profile: 'D1', taxOrigin: 'CPF', receiptIdentifier: '', bankAccountId: 'bank1', prev: opts.prev || [], saleId: 's1', isEditing: !!opts.prev, idSeed: 1,
  });
  return { installments, allocations };
}
const sale = (installments: any[], total: number, method: PaymentMethod = 'PIX') => ({ installments, paymentMethod: method, totalValue: total, installmentsCount: 1 }) as any;

console.log('=== VALIDAÇÃO DA SOMA ===');
assert(validateSplit(100, [50, 50]).ok, 'SPLIT-01: 100 = 50 Pix + 50 Dinheiro');
assert(validateSplit(1000, [200, 800]).ok, 'SPLIT-02: 1000 = 200 Pix + 800 Cartão');
const low = validateSplit(1000, [200, 700]);
assert(!low.ok && low.message === 'Faltam R$ 100,00 para completar o pagamento.'.replace(/ /g, ' ') || low.message?.includes('Faltam') === true, 'SPLIT-03: soma menor bloqueada ("Faltam R$ 100,00...")');
const high = validateSplit(1000, [200, 900]);
assert(!high.ok && !!high.message?.includes('excede o valor da venda em'), 'SPLIT-04: soma maior bloqueada ("O pagamento excede...")');
assert(validateSplit(0.3, [0.1, 0.2]).ok, 'Soma exata em centavos (0,1 + 0,2 = 0,3 sem erro de float)');
assert(!validateSplit(100, [100, 0]).ok, 'Valor zero em uma das formas é rejeitado');
assert(validateSplit(1000, [200, 800]).remaining === 0, 'Restante = 0 quando reconciliado');

console.log('\n=== PIX + DINHEIRO ===');
{
  const { installments } = build(cfg('ANTICIPATED'), [{ method: 'PIX', amount: 500, received: true }, { method: 'DINHEIRO', amount: 500, received: true }]);
  const t = saleFeeTotals(sale(installments, 1000));
  assert(t.gross === 1000 && t.fees === 0 && t.net === 1000, 'Pix 500 + Dinheiro 500: gross 1000 / fees 0 / net 1000');
  assert(installments.length === 2 && installments.every((i) => i.status === 'RECEBIDO'), 'Duas alocações, cada uma com seu recebimento');
}

console.log('\n=== PIX 200 + CARTÃO 800 (Visa 10%) ===');
{
  const settings = cfg('ANTICIPATED');
  const { installments, allocations } = build(settings, [{ method: 'PIX', amount: 200, received: true }, { method: 'CARTAO_CREDITO', amount: 800, brand: 'visa', n: 5 }]);
  const t = saleFeeTotals(sale(installments, 1000));
  assert(allocations[1].ev.feeAmount === 80 && allocations[1].ev.netValue === 720, 'SPLIT-05: taxa = 80 (10% de 800), líquido do cartão 720');
  assert(allocations[1].ev.feeAmount !== 100, 'SPLIT-06: taxa NÃO calculada sobre 1000 (seria 100)');
  assert(t.gross === 1000 && t.fees === 80 && t.net === 920, 'Venda: gross 1000 / fees 80 / net 920 (Pix 200 + cartão 720)');
  assert(installments.filter((i) => i.allocationNumber === 2).length === 1, 'SPLIT-08: cartão antecipado = 1 recebível D+1 líquido');
  const card = installments.find((i) => i.allocationNumber === 2)!;
  assert(card.value === 800 && card.netValue === 720 && card.dueDate === '2026-09-28' && card.receivingMode === 'ANTICIPATED', 'Recebível do cartão: bruto 800, líquido 720, D+1 útil (sex→seg)');
  const pix = installments.find((i) => i.allocationNumber === 1)!;
  assert(pix.paymentMethod === 'PIX' && pix.value === 200 && pix.status === 'RECEBIDO' && card.status === 'A_RECEBER', 'Pix recebido; cartão NÃO marcado como recebido só porque o Pix entrou');
  assert(card.customerInstallments === 5, 'Parcelas do paciente (5x) preservadas como metadata');
}

console.log('\n=== PARCELAMENTO: 800 EM 4x ===');
{
  const { installments, allocations } = build(cfg('NORMAL'), [{ method: 'PIX', amount: 200, received: true }, { method: 'CARTAO_CREDITO', amount: 800, brand: 'visa', n: 4, mode: 'NORMAL' }]);
  const cardRows = installments.filter((i) => i.allocationNumber === 2);
  assert(cardRows.length === 4 && cardRows.every((r) => r.value === 200), 'SPLIT-07/09: 4x de R$ 200 (sobre 800), não 4x de 250');
  assert(sum(cardRows.map((r) => r.value)) === 800, 'Cronograma do cartão soma 800 (não 1000)');
  assert(sum(cardRows.map((r) => r.cardFeeAmount || 0)) === 48 && allocations[1].ev.feeAmount === 48, 'Tabela NORMAL 6%: taxa total 48 rateada (não × 4)');
  assert(cardRows[0].dueDate === '2026-09-25' && cardRows[3].dueDate === '2026-12-25', 'Recebíveis mensais do cartão');
  const t = saleFeeTotals(sale(installments, 1000));
  assert(t.gross === 1000 && t.fees === 48 && t.net === 952, 'Venda: gross 1000, fees 48, net 952');
  assert(installments.length === 5, 'Pix 1 + cartão 4 = 5 recebíveis (sem duplicação)');
}

console.log('\n=== DINHEIRO 300 + CARTÃO 700 ===');
{
  const { allocations } = build(cfg('ANTICIPATED'), [{ method: 'DINHEIRO', amount: 300, received: true }, { method: 'CARTAO_CREDITO', amount: 700, brand: 'visa', n: 4 }]);
  assert(allocations[1].ev.feeAmount === 70, 'Taxa só sobre os 700 (10% = 70)');
}

console.log('\n=== DOIS CARTÕES ===');
{
  const { installments, allocations } = build(cfg('ANTICIPATED'), [
    { method: 'CARTAO_CREDITO', amount: 500, brand: 'visa', n: 1 },
    { method: 'CARTAO_CREDITO', amount: 500, brand: 'mc', n: 1 },
  ]);
  assert(allocations[0].ev.feeAmount === 15 && allocations[1].ev.feeAmount === 25, 'Visa 3% de 500 = 15; Mastercard 5% de 500 = 25 (taxas independentes)');
  const t = saleFeeTotals(sale(installments, 1000));
  assert(t.gross === 1000 && t.fees === 40 && t.net === 960, 'Soma gross 1000 / fees 40 / net 960');
  assert(installments[0].cardBrandName === 'visa' && installments[1].cardBrandName === 'mc', 'Bandeira própria por alocação');
}

console.log('\n=== KPIs (sem dupla contagem) ===');
{
  const { installments } = build(cfg('ANTICIPATED'), [{ method: 'PIX', amount: 200, received: true }, { method: 'CARTAO_CREDITO', amount: 800, brand: 'visa', n: 5 }]);
  // tudo recebido: amountReceived = líquido
  const received = installments.map((i) => ({ ...i, status: 'RECEBIDO', amountReceived: i.netValue }));
  const k = summarizeReceipts(received as any);
  assert(k.gross === 1000 && k.fees === 80 && k.net === 920, 'Tudo recebido: bruto 1000 / taxas 80 / líquido 920 (não 1800)');
  const partial = summarizeReceipts(installments as any);
  assert(partial.gross === 200 && partial.fees === 0 && partial.net === 200, 'Só o Pix entrou: caixa recebido = 200 (faturamento da venda continua 1000)');
}

console.log('\n=== LEITURA / FILTRO / TABELA / RETROCOMPATIBILIDADE ===');
{
  const { installments } = build(cfg('ANTICIPATED'), [{ method: 'PIX', amount: 200, received: true }, { method: 'CARTAO_CREDITO', amount: 800, brand: 'visa', n: 5 }]);
  const s = sale(installments, 1000, 'PIX');
  assert(isSplitSale(s) && getSaleAllocations(s).length === 2, 'Venda dividida reconhecida (2 alocações)');
  assert(saleHasPaymentMethod(s, 'PIX') && saleHasPaymentMethod(s, 'CARTAO_CREDITO') && !saleHasPaymentMethod(s, 'DINHEIRO'), 'Filtro Pix e Cartão encontram a venda mista; Dinheiro não');
  const l = saleMethodsLabel(s);
  assert(l.label === '2 formas' && l.title.toLowerCase().includes('pix') && l.title.toLowerCase().includes('visa 5x') && l.title.includes('800'), 'Tabela: "2 formas" com detalhe (Pix R$ 200 / Visa 5x R$ 800)');
  const al = getSaleAllocations(s);
  assert(al[1].brandName === 'visa' && al[1].customerInstallments === 5 && al[1].receivingMode === 'ANTICIPATED' && al[1].amount === 800, 'Detalhe: valor, bandeira, parcelas e recebimento por forma');
  const legacy = sale([{ id: 'i1', value: 100, installmentNumber: 1, totalInstallments: 1, status: 'RECEBIDO', paymentMethod: 'PIX', dueDate: '2026-01-01' }], 100, 'PIX');
  assert(!isSplitSale(legacy) && getSaleAllocations(legacy).length === 1 && saleMethodsLabel(legacy).label === 'PIX', 'Venda antiga (sem allocationNumber) segue como forma única');
}

console.log('\n=== IDEMPOTÊNCIA / EDIÇÃO ===');
{
  const first = build(cfg('ANTICIPATED'), [{ method: 'PIX', amount: 200, received: true }, { method: 'CARTAO_CREDITO', amount: 800, brand: 'visa', n: 5 }]);
  const again = build(cfg('ANTICIPATED'), [{ method: 'PIX', amount: 200, received: true }, { method: 'CARTAO_CREDITO', amount: 800, brand: 'visa', n: 5 }], { prev: first.installments });
  assert(again.installments.length === first.installments.length && again.installments.every((i, x) => i.id === first.installments[x].id), 'Salvar/reeditar não duplica alocações (mesmos IDs, mesma quantidade)');
  const edited = build(cfg('ANTICIPATED'), [{ method: 'PIX', amount: 300, received: true }, { method: 'CARTAO_CREDITO', amount: 700, brand: 'visa', n: 5 }], { prev: first.installments });
  const t = saleFeeTotals(sale(edited.installments, 1000));
  assert(t.gross === 1000 && t.fees === 70 && t.net === 930, 'Edição 200/800 → 300/700: recalcula taxa (70) e líquido (930)');
  const single = build(cfg('ANTICIPATED'), [{ method: 'PIX', amount: 1000, received: true }], { prev: first.installments });
  assert(single.installments.length === 1 && single.installments[0].allocationNumber === undefined, 'Remover segunda forma volta ao pagamento único');
}

console.log('\n=== BASE DA TAXA / MOTOR ===');
{
  const ev = evaluateAllocation(cfg('ANTICIPATED'), { method: 'CARTAO_CREDITO', amount: 800, brandId: 'visa', installments: 5 });
  const rows = planAllocation({ method: 'CARTAO_CREDITO', amount: 800, ev, brandBased: true, saleDate: '2026-09-21' });
  assert(rows.length === 1 && rows[0].value === 800 && rows[0].fee === 80, 'Motor recebe explicitamente o valor da alocação (cardAmount), não o total da venda');
  const ev2 = evaluateAllocation(cfg('ANTICIPATED'), { method: 'CARTAO_CREDITO', amount: 800, brandId: '', installments: 5 });
  assert(ev2.brandRequiredMissing, 'Cartão sem bandeira exige seleção');
  const ev3 = evaluateAllocation(cfg('ANTICIPATED'), { method: 'CARTAO_CREDITO', amount: 800, brandId: 'visa', installments: 9 });
  assert(ev3.missing && !ev3.feeRule, 'Taxa ausente: não assume zero');
}

console.log('\n=== UI (checagem estática) ===');
{
  const modal = readFileSync('src/components/Modals/NewSaleModal.tsx', 'utf-8');
  assert(modal.includes('+ Dividir pagamento') && modal.includes('Remover segunda forma') && modal.includes('Pagamento 2'), 'Botões "+ Dividir pagamento" / "Remover segunda forma" e seção "Pagamento 2"');
  assert(modal.includes('Restante:') && modal.includes('Alocado:') && modal.includes('Valor da venda:'), 'Rodapé Valor da venda / Alocado / Restante');
  assert(!modal.includes('bg-slate-50/70 flex items-center h-[42px]">\n                  <Switch'), 'Switch "Valor já recebido" sem retângulo cinza extra');
  const sales = readFileSync('src/components/Sales/SalesView.tsx', 'utf-8');
  assert(sales.includes('saleHasPaymentMethod'), 'Filtro de Receitas/Vendas considera todas as formas');
}

console.log('\n🎉 TODOS OS TESTES DE PAGAMENTO DIVIDIDO PASSARAM!');
