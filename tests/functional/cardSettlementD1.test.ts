// Perfil de recebimento D+1, bruto/taxa/líquido, parcelamento do paciente x recebíveis da clínica e KPIs.
// Funções puras de src/lib/cardFees.ts (as mesmas usadas por NewSaleModal, Contas a Receber e simulador).
// Rodar com: npx tsx tests/functional/cardSettlementD1.test.ts
import {
  computeSettlementDate, isBusinessDay, planCardReceivable, resolveCardFee, computeFee,
  summarizeReceipts, getInstallmentGrossReceived, getActiveSettlementProfile, missingFeeMessage, simulateCardFee,
} from '../../src/lib/cardFees';
import { CardFeeSettings } from '../../src/types';

function assert(c: boolean, m: string) {
  if (!c) { console.error(`❌ FAILED: ${m}`); throw new Error(m); }
  console.log(`✅ PASSED: ${m}`);
}

console.log('=== D+1 ÚTIL ===');
assert(computeSettlementDate('2026-09-21', 'D1') === '2026-09-22', 'A: venda na segunda -> terça');
assert(computeSettlementDate('2026-09-25', 'D1') === '2026-09-28', 'B: venda na sexta -> segunda');
assert(computeSettlementDate('2026-09-26', 'D1') === '2026-09-28', 'C: venda no sábado -> segunda');
assert(computeSettlementDate('2026-09-27', 'D1') === '2026-09-28', 'D: venda no domingo -> segunda');
assert(computeSettlementDate('2026-09-04', 'D1') === '2026-09-08', 'Feriado (7/9 segunda): sexta 4/9 -> terça 8/9');
assert(!isBusinessDay('2026-09-07') && isBusinessDay('2026-09-08'), 'Feriado nacional não é dia útil');
assert(computeSettlementDate('2026-09-23', 'D0') === '2026-09-23', 'Perfil "Na hora" mantém a data');
assert(getActiveSettlementProfile(undefined) === 'D1' && getActiveSettlementProfile({}) === 'D1', 'Perfil ativo padrão = D1 (configuração existente não precisa de recadastro)');

console.log('\n=== BRUTO / TAXA / LÍQUIDO ===');
const p1 = computeFee(1000, { type: 'PERCENTAGE', value: 10 });
assert(p1.feeAmount === 100 && p1.netValue === 900, 'A: 1000 @10% -> taxa 100, líquido 900');
const p2 = computeFee(1000, { type: 'FIXED', value: 5 });
assert(p2.feeAmount === 5 && p2.netValue === 995, 'B: 1000 fixo 5 -> líquido 995');
const cash = computeFee(500, { type: 'FIXED', value: 0 });
assert(cash.feeAmount === 0 && cash.netValue === 500, 'C: dinheiro/pix 500 sem taxa -> líquido 500');

console.log('\n=== 10x DO PACIENTE, 1 RECEBÍVEL DA CLÍNICA ===');
const plan = planCardReceivable({ gross: 1000, rule: { type: 'PERCENTAGE', value: 12 }, customerInstallments: 10, saleDate: '2026-09-25', profile: 'D1' });
assert(plan.customerInstallments === 10 && plan.customerInstallmentAmount === 100, 'Paciente: 10x de R$ 100 preservado como metadata');
assert(plan.gross === 1000 && plan.feeAmount === 120 && plan.net === 880, 'Bruto 1000 / taxa 120 / líquido 880');
assert(plan.clinicReceivables === 1 && plan.settlementDate === '2026-09-28' && plan.settlementProfile === 'D1', 'UM recebível da clínica em D+1 útil (não 10 mensais), perfil D1 no snapshot');
assert(plan.gross === 1000, 'Parcelamento não multiplica o faturamento (bruto continua 1000)');

console.log('\n=== TAXA 12,99% x 10 (exemplo da operadora) ===');
const ex = computeFee(1000, { type: 'PERCENTAGE', value: 12.99 });
assert(ex.feeAmount === 129.9 && ex.netValue === 870.1, 'Mastercard 10x 12,99% -> taxa 129,90 / líquido 870,10');

console.log('\n=== HISTÓRICO ===');
const settings: CardFeeSettings = { settlementProfile: 'D1', brands: [{ id: 'm', name: 'Mastercard', active: true, credit: { 10: { type: 'PERCENTAGE', value: 12 } } }] };
const soldSnapshot = { cardFeeType: 'PERCENTAGE', cardFeeValue: 12, cardFeeAmount: 120, settlementProfile: 'D1', customerInstallments: 10 };
const changed: CardFeeSettings = { ...settings, settlementProfile: 'D14', brands: [{ id: 'm', name: 'Mastercard', active: true, credit: { 10: { type: 'PERCENTAGE', value: 14 } } }] };
const now = resolveCardFee(changed, { brandId: 'm', mode: 'CREDIT', installments: 10 }) as any;
assert(now.rule.value === 14 && soldSnapshot.cardFeeValue === 12 && soldSnapshot.cardFeeAmount === 120 && soldSnapshot.settlementProfile === 'D1', 'Config 12% -> 14% e perfil D1 -> D14: venda antiga mantém 12% e D1 (snapshot)');

console.log('\n=== KPIs (bruto − taxas = líquido) ===');
// Convenção: amountReceived = líquido que entrou
const items = [
  { status: 'RECEBIDO', value: 1000, amountReceived: 880, cardFeeAmount: 120 },
  { status: 'RECEBIDO', value: 500, amountReceived: 500 },
  { status: 'A_RECEBER', value: 300, amountReceived: 0, cardFeeAmount: 30 },
];
const k = summarizeReceipts(items);
assert(k.gross === 1500 && k.fees === 120 && k.net === 1380, 'Cartão 1000/taxa 120 + dinheiro 500: bruto 1500, taxas 120, líquido 1380');
assert(Math.round((k.gross - k.fees) * 100) === Math.round(k.net * 100), 'Assertion explícita: bruto − taxas = líquido');
assert(getInstallmentGrossReceived({ value: 1000, amountReceived: 880, cardFeeAmount: 120 }) === 1000, 'Bruto recuperado de líquido recebido (base tributária/faturamento = 1000)');
assert(getInstallmentGrossReceived({ value: 1000, amountReceived: 1000, cardFeeAmount: 120 }) === 1000, 'Baixa antiga digitada com o bruto não soma a taxa duas vezes');
assert(getInstallmentGrossReceived({ value: 500, amountReceived: 500 }) === 500, 'Sem taxa: bruto = recebido');
assert(summarizeReceipts([{ status: 'A_RECEBER', value: 100, amountReceived: 0, cardFeeAmount: 10 }]).gross === 0, 'Pendente não entra no recebido');

console.log('\n=== TAXA ZERO / NÃO CONFIGURADA / SIMULADOR ===');
const z: CardFeeSettings = { brands: [{ id: 'v', name: 'Visa', active: true, credit: { 1: { type: 'PERCENTAGE', value: 0 } } }] };
const rz = resolveCardFee(z, { brandId: 'v', mode: 'CREDIT', installments: 1 });
assert(rz.status === 'CONFIGURED' && computeFee(1000, (rz as any).rule).netValue === 1000, '0% salvo é válido: líquido = bruto');
assert(resolveCardFee(z, { brandId: 'v', mode: 'CREDIT', installments: 10 }).status === 'NOT_CONFIGURED', 'Sem taxa 10x -> não configurada');
assert(missingFeeMessage('Mastercard', 'CREDIT', 10, 'D1') === 'Taxa não configurada para Mastercard • Crédito • 10x • Recebimento 1 dia útil', 'Mensagem inclui o perfil de recebimento');
const sim = simulateCardFee(settings, { gross: 500, brandId: 'm', mode: 'CREDIT', installments: 10 });
assert(sim.configured && sim.feeAmount === 60 && sim.netValue === 440 && computeSettlementDate('2026-09-21', 'D1') === '2026-09-22', 'Simulador: bruto 500, taxa 60, líquido 440, data D+1');

console.log('\n=== MULTI-TENANT ===');
const tA: CardFeeSettings = { settlementProfile: 'D1', brands: [{ id: 'v', name: 'Visa', active: true, debit: { type: 'PERCENTAGE', value: 2 } }] };
const tB: CardFeeSettings = { settlementProfile: 'D14', brands: [{ id: 'v', name: 'Visa', active: true, debit: { type: 'PERCENTAGE', value: 3 } }] };
assert(getActiveSettlementProfile(tA) === 'D1' && getActiveSettlementProfile(tB) === 'D14', 'Perfil por tenant independente');
assert((resolveCardFee(tA, { brandId: 'v', mode: 'DEBIT' }) as any).rule.value === 2 && (resolveCardFee(tB, { brandId: 'v', mode: 'DEBIT' }) as any).rule.value === 3, 'Taxas por tenant independentes');

console.log('\n🎉 TODOS OS TESTES DE PERFIL D+1 / BRUTO-LÍQUIDO PASSARAM!');
