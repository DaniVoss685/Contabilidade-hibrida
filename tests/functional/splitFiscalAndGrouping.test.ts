// Documento fiscal x pagamento dividido, agrupamento visual de recebíveis da mesma venda e layout do switch.
// Rodar com: npx tsx tests/functional/splitFiscalAndGrouping.test.ts
import { readFileSync } from 'fs';
import {
  evaluateAllocation, buildSaleInstallments, getFiscalCoverage, validateFiscalCoverage, saleFeeTotals,
  buildSplitGroups, orderSplitGroups, getSaleAllocations, BuildAllocation,
} from '../../src/lib/salePayments';
import { summarizeReceipts } from '../../src/lib/cardFees';
import { PaymentMethod } from '../../src/types';
import { isTaxableForCarneLeao } from '../../src/lib/fiscalClassification';

function assert(c: boolean, m: string) {
  if (!c) { console.error(`❌ FAILED: ${m}`); throw new Error(m); }
  console.log(`✅ PASSED: ${m}`);
}
const src = (p: string) => readFileSync(p, 'utf-8');

function build(specs: Array<{ method: PaymentMethod; amount: number; received?: boolean; documentRequested?: boolean }>, coverage?: Record<number, number> | null, taxOrigin: 'CPF' | 'CNPJ' = 'CPF') {
  const allocations: BuildAllocation[] = specs.map((sp, i) => ({
    n: i + 1, method: sp.method, amount: sp.amount,
    ev: evaluateAllocation(undefined, { method: sp.method, amount: sp.amount, installments: 1 }),
    brandBased: false, received: !!sp.received, documentRequested: sp.documentRequested,
  }));
  return buildSaleInstallments({
    allocations, split: specs.length > 1, saleDate: '2026-09-24', paymentDate: '2026-09-24', profile: 'D1', taxOrigin,
    receiptIdentifier: '', bankAccountId: 'b1', prev: [], saleId: 's1', isEditing: false, idSeed: 7, fiscalCoverage: coverage ?? null,
  });
}
const asSale = (installments: any[], total: number, taxOrigin: 'CPF' | 'CNPJ' = 'CPF', method: PaymentMethod = 'PIX') => ({ installments, paymentMethod: method, totalValue: total, installmentsCount: 1, taxOrigin }) as any;

console.log('=== DOCUMENTO FISCAL ===');
{
  // Pix + Pix (sem dinheiro): documento cobre o total, nada é gravado
  const inst = build([{ method: 'PIX', amount: 500 }, { method: 'TRANSFERENCIA', amount: 500 }]);
  const fc = getFiscalCoverage(asSale(inst, 1000));
  assert(fc.gross === 1000 && fc.covered === 1000 && fc.uncovered === 0 && fc.coverage === 'TOTAL', 'FISCAL-01: sem dinheiro o documento cobre o total (1000)');
  assert(inst.every((i) => i.fiscalCoveredAmount === undefined), 'Sem dinheiro nada é gravado (padrão = total)');
}
{
  // REGRA DA CLÍNICA (CNPJ): dinheiro não gera nota. 1650 = 1000 Pix + 650 dinheiro -> nota só sobre 1000
  const inst = build([{ method: 'PIX', amount: 1000 }, { method: 'DINHEIRO', amount: 650 }], null, 'CNPJ');
  const s = asSale(inst, 1650, 'CNPJ');
  const fc = getFiscalCoverage(s);
  assert(fc.covered === 1000 && fc.uncovered === 650 && fc.gross === 1650, 'CNPJ: 1000 Pix + 650 dinheiro -> nota só sobre 1000 (dinheiro fora); venda 1650');
  assert(inst[1].fiscalCoveredAmount === 0 && inst[0].fiscalCoveredAmount === 1000, 'Parcela em dinheiro marcada como fora do documento (sem NFS-e pendente)');
  assert(saleFeeTotals(s).gross === 1650, 'Faturamento gerencial preservado (1650)');
  assert(fc.status === 'Pendente', 'A NFS-e continua pendente só pelos 1000 do Pix');
}
{
  // CNPJ: 1000 Pix + 650 cartão -> os dois somam e fazem nota (1650)
  const inst = build([{ method: 'PIX', amount: 1000 }, { method: 'CARTAO_CREDITO', amount: 650 }], null, 'CNPJ');
  const fc = getFiscalCoverage(asSale(inst, 1650, 'CNPJ'));
  assert(fc.covered === 1650 && fc.coverage === 'TOTAL', 'CNPJ: Pix 1000 + cartão 650 -> a nota cobre 1650');
}
{
  const inst = build([{ method: 'DINHEIRO', amount: 800 }], null, 'CNPJ');
  const fc = getFiscalCoverage(asSale(inst, 800, 'CNPJ', 'DINHEIRO'));
  assert(fc.covered === 0 && fc.status === 'Não aplicável', 'CNPJ 100% dinheiro: nenhuma nota a emitir (não aplicável)');
}
{
  // CPF: dinheiro sem documento solicitado fica fora do documento e (via documentRequested=false) do Carnê-Leão
  const notReq = build([{ method: 'PIX', amount: 1000, received: true }, { method: 'DINHEIRO', amount: 650, received: true, documentRequested: false }], null, 'CPF');
  const fc = getFiscalCoverage(asSale(notReq, 1650, 'CPF'));
  assert(fc.covered === 1000 && fc.uncovered === 650, 'CPF: dinheiro NÃO solicitado fica fora do documento (1000 de 1650)');
  assert(notReq[1].documentRequested === false && notReq[0].documentRequested === undefined, 'Dinheiro gravado com documentRequested=false (fora do Carnê-Leão, sem alerta de Receita Saúde); Pix não recebe o campo');
  assert(isTaxableForCarneLeao(undefined, notReq[1].documentRequested) === false && isTaxableForCarneLeao(undefined, notReq[0].documentRequested) === true, 'Carnê-Leão: dinheiro sem documento fora da base; Pix dentro. Ambos continuam no faturamento');
  const req = build([{ method: 'PIX', amount: 1000, received: true }, { method: 'DINHEIRO', amount: 650, received: true, documentRequested: true }], null, 'CPF');
  assert(getFiscalCoverage(asSale(req, 1650, 'CPF')).covered === 1650 && req[1].documentRequested === true, 'CPF: dinheiro com documento solicitado entra no documento e no Carnê-Leão');
}
{
  // Decisão explícita do usuário sobrepõe o default (cobertura parcial manual)
  const inst = build([{ method: 'PIX', amount: 500 }, { method: 'DINHEIRO', amount: 500 }], { 1: 300, 2: 500 }, 'CNPJ');
  const fc = getFiscalCoverage(asSale(inst, 1000, 'CNPJ'));
  assert(fc.covered === 800 && fc.perAllocation[1].covered === 500, 'Override manual: usuário pode cobrir dinheiro/ajustar o valor (a regra é só o padrão)');
  const partialOnPix = getFiscalCoverage(asSale(build([{ method: 'PIX', amount: 1000 }], { 1: 400 }), 1000));
  assert(partialOnPix.covered === 400 && partialOnPix.uncovered === 600, 'Cobertura parcial em venda de forma única (400 de 1000)');
}
{
  assert(validateFiscalCoverage(1000, [500, 500], [500, 500]).ok, 'Cobertura total válida');
  assert(!validateFiscalCoverage(1000, [500, 500], [600, 0]).ok, 'FISCAL-04: cobertura de uma forma não pode exceder o valor dela');
  assert(!validateFiscalCoverage(1000, [1500], [1200]).ok, 'FISCAL-04: cobertura nunca > gross da venda');
  assert(!validateFiscalCoverage(1000, [500, 500], [0, 0]).ok, 'Cobertura zero explícita é rejeitada (para "sem nota" deixe o padrão)');
  const p = validateFiscalCoverage(1000, [500, 500], [500, 0]);
  assert(p.ok && p.uncovered === 500, 'Não coberto pelo documento: 500');
}
{
  const cnpj = getFiscalCoverage({ ...asSale(build([{ method: 'PIX', amount: 1000 }], null, 'CNPJ'), 1000, 'CNPJ'), nfseStatus: 'EMITIDA' });
  assert(cnpj.documentType === 'NFS-e' && cnpj.status === 'Emitido', 'CNPJ: tipo NFS-e, status conforme nfseStatus');
  const cpf = getFiscalCoverage(asSale(build([{ method: 'PIX', amount: 1000 }]), 1000));
  assert(cpf.documentType === 'Receita Saúde' && cpf.status === 'Pendente', 'CPF: tipo Receita Saúde, pendente até emitir');
}

console.log('\n=== AGRUPAMENTO / MESMA VENDA ===');
{
  const inst = build([{ method: 'PIX', amount: 1000, received: true }, { method: 'DINHEIRO', amount: 650 }]);
  const items = inst.map((i) => ({ ...i, saleId: 'sale_A', installmentId: i.id, value: i.value }));
  const other = { saleId: 'sale_B', installmentId: 'x', value: 300, allocationNumber: undefined as number | undefined, status: 'A_RECEBER' };
  const groups = buildSplitGroups([...items, other] as any);
  assert(groups.size === 1 && groups.get('sale_A')!.length === 2, 'GROUP-01: 1000 Pix + 650 Dinheiro = 2 linhas, mesmo saleId, 1 grupo');
  assert(!groups.has('sale_B'), 'Venda simples não vira grupo');
  const shuffled = [items[0], other, items[1]] as any[];
  const ordered = orderSplitGroups(shuffled, groups);
  assert(ordered.map((x) => x.saleId).join() === 'sale_A,sale_A,sale_B', 'Linhas do mesmo grupo ficam juntas na tabela (a venda simples não é reordenada relativamente)');
  const onlyOne = orderSplitGroups([items[1], other] as any[], groups);
  assert(onlyOne[0] === items[1], 'Com filtro mostrando só uma forma, a linha continua indicando o grupo (grupo calculado sobre TODOS os itens)');
  assert(items[0].status === 'RECEBIDO' && items[1].status === 'A_RECEBER', 'GROUP-04: status individuais preservados (Pix recebido, Dinheiro a receber)');
  assert(items[0].paymentMethod === 'PIX' && items[1].paymentMethod === 'DINHEIRO', 'GROUP-05: forma real da 2ª alocação é Dinheiro (não PIX stale)');
  const k = summarizeReceipts(items as any);
  assert(k.gross === 1000 && k.net === 1000, 'GROUP-06/B9: recebido no período = só o Pix (1000); venda total 1650 sem duplicar');
  assert(getSaleAllocations(asSale(inst, 1650)).reduce((s, a) => s + a.amount, 0) === 1650, 'Faturamento da venda = 1650 (não 3300)');
}

console.log('\n=== UI (checagem estática) ===');
{
  const rv = src('src/components/Receivables/ReceivablesView.tsx');
  assert(rv.includes('Pagamento dividido • mesma venda') && rv.includes('border-l-indigo-400') && rv.includes('↳'), 'Indicador visual: badge "Pagamento dividido • mesma venda", faixa lateral e conector ↳');
  assert(rv.includes('const s = db.getSales().find((x) => x.id === item.saleId);') && rv.includes('onClick={openDetails}'), 'GROUP-02/03: qualquer linha abre a venda completa por saleId (mesmo detalhe)');
  assert(rv.includes('Previsto: {formatPaymentMethodName(inst.paymentMethod || viewingSale.paymentMethod)}'), 'B7: parcela pendente mostra a forma da PRÓPRIA alocação (sem "Previsto: PIX" stale)');
  assert(rv.includes('Documento fiscal') && rv.includes('Valor coberto') && rv.includes('Cobertura'), 'Detalhe da venda: seção DOCUMENTO FISCAL');
  const modal = src('src/components/Modals/NewSaleModal.tsx');
  assert(modal.includes('O documento cobre somente parte da venda') && modal.includes('Não coberto pelo documento'), 'Nova Receita: cobertura fiscal explícita (venda / documento / não coberto)');
  const recv = src('src/components/Modals/AllocationReceivingFields.tsx');
  assert(recv.includes('h-[42px] px-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between'), 'UX-01/03: switch dentro de campo com a mesma altura do select (42px), no grid da conta de recebimento');
  assert(recv.includes('grid grid-cols-1 sm:grid-cols-2 gap-3 items-end'), 'UX-02: grid 1 coluna (mobile) / 2 colunas (desktop) — empilha em tela pequena');
  assert(src('src/components/UI/Switch.tsx').includes('if (bare) return toggle;'), 'Switch com modo bare (só o toggle, sem card flutuante)');
}

console.log('\n🎉 TODOS OS TESTES DE DOCUMENTO FISCAL / AGRUPAMENTO PASSARAM!');
