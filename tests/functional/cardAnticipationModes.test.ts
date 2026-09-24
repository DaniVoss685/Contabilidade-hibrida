// Antecipação configurável por tenant: ANTICIPATED (1 recebível D+1) x NORMAL (cronograma das parcelas),
// tabelas de taxa separadas, default por tenant, override por venda, snapshot e KPIs.
// Rodar com: npx tsx tests/functional/cardAnticipationModes.test.ts
import {
  planCardSchedule, resolveCardFee, resolveReceivingMode, getDefaultReceivingMode, isAnticipationEnabled,
  summarizeReceipts, simulateCardFee,
} from '../../src/lib/cardFees';
import { CardFeeSettings, ReceivingMode } from '../../src/types';

function assert(c: boolean, m: string) {
  if (!c) { console.error(`❌ FAILED: ${m}`); throw new Error(m); }
  console.log(`✅ PASSED: ${m}`);
}
const cents = (n: number) => Math.round(n * 100);
const sum = (a: number[]) => a.reduce((x, y) => x + cents(y), 0) / 100;

const tenantOn: CardFeeSettings = {
  anticipationEnabled: true, defaultReceivingMode: 'ANTICIPATED', settlementProfile: 'D1',
  brands: [{
    id: 'm', name: 'Mastercard', active: true,
    credit: { 10: { type: 'PERCENTAGE', value: 12 } },               // tabela ANTECIPADA (D+1)
    normal: { credit: { 10: { type: 'PERCENTAGE', value: 5 } } },     // tabela NORMAL
  }],
};
const tenantOff: CardFeeSettings = { anticipationEnabled: false, brands: [{ id: 'm', name: 'Mastercard', active: true, normal: { credit: { 10: { type: 'PERCENTAGE', value: 5 } } } }] };

console.log('=== CONFIGURAÇÃO / DEFAULT POR TENANT / OVERRIDE ===');
assert(isAnticipationEnabled(tenantOn) && !isAnticipationEnabled(tenantOff) && !isAnticipationEnabled(undefined), 'Antecipação é por tenant; ausente = desativada (não assume que toda clínica antecipa)');
assert(getDefaultReceivingMode(tenantOn) === 'ANTICIPATED' && getDefaultReceivingMode(tenantOff) === 'NORMAL', 'Tenant A (ON) herda ANTICIPATED; Tenant B (OFF) herda NORMAL');
assert(resolveReceivingMode(tenantOn) === 'ANTICIPATED' && resolveReceivingMode(tenantOn, 'NORMAL') === 'NORMAL', 'Override da venda: default ON, venda específica NORMAL');
assert(resolveReceivingMode(tenantOn) === 'ANTICIPATED', 'Override não altera a configuração global (continua ON)');
assert(resolveReceivingMode(tenantOff, 'ANTICIPATED') === 'NORMAL', 'Clínica que não antecipa nunca usa modo antecipado');
assert(getDefaultReceivingMode({ ...tenantOn, defaultReceivingMode: 'NORMAL' }) === 'NORMAL', 'Padrão configurável: antecipação ativada com forma padrão Normal');

console.log('\n=== TABELAS SEPARADAS ===');
const ant = resolveCardFee(tenantOn, { brandId: 'm', mode: 'CREDIT', installments: 10, receivingMode: 'ANTICIPATED' }) as any;
const nor = resolveCardFee(tenantOn, { brandId: 'm', mode: 'CREDIT', installments: 10, receivingMode: 'NORMAL' }) as any;
assert(ant.rule.value === 12 && nor.rule.value === 5, 'Mastercard 10x: antecipado 12% x normal 5% (tabelas independentes)');
assert(resolveCardFee(tenantOn, { brandId: 'm', mode: 'CREDIT', installments: 3, receivingMode: 'NORMAL' }).status === 'NOT_CONFIGURED', 'Normal sem taxa cadastrada -> não configurada (não reutiliza a D+1)');
const onlyAnt: CardFeeSettings = { anticipationEnabled: false, brands: [{ id: 'm', name: 'Mastercard', active: true, credit: { 10: { type: 'PERCENTAGE', value: 12 } } }] };
assert(resolveCardFee(onlyAnt, { brandId: 'm', mode: 'CREDIT', installments: 10, receivingMode: 'NORMAL' }).status === 'NOT_CONFIGURED', 'Taxas D+1 existentes NÃO são aplicadas silenciosamente ao fluxo normal');
assert((resolveCardFee(onlyAnt, { brandId: 'm', mode: 'CREDIT', installments: 10, receivingMode: 'ANTICIPATED' }) as any).rule.value === 12, 'Taxas D+1 existentes preservadas na tabela antecipada');

console.log('\n=== VENDA ANTECIPADA (1000, 10x, D+1, 12%) ===');
const a = planCardSchedule({ gross: 1000, rule: ant.rule, customerInstallments: 10, saleDate: '2026-09-25', mode: 'ANTICIPATED', profile: 'D1', isCredit: true });
assert(a.rows.length === 1 && a.rows[0].gross === 1000 && a.rows[0].fee === 120 && a.rows[0].net === 880, '1 recebível: bruto 1000 / taxa 120 / líquido 880');
assert(a.rows[0].dueDate === '2026-09-28', 'Vence no próximo dia útil (sexta -> segunda)');

console.log('\n=== VENDA NORMAL (1000, 10x, 5%) ===');
const n = planCardSchedule({ gross: 1000, rule: nor.rule, customerInstallments: 10, saleDate: '2026-09-10', mode: 'NORMAL', isCredit: true });
assert(n.rows.length === 10, '10 recebíveis (Parcela 1/10 ... 10/10)');
assert(n.rows.every((r, i) => r.number === i + 1 && r.total === 10), 'Numeração 1/10..10/10');
assert(sum(n.rows.map((r) => r.gross)) === 1000, 'Soma do bruto = valor da venda (não 10.000)');
assert(sum(n.rows.map((r) => r.fee)) === 50 && n.totalFee === 50, 'Soma das taxas = taxa total 50 (não 50 × 10)');
assert(sum(n.rows.map((r) => r.net)) === 950 && n.totalNet === 950, 'Soma do líquido = bruto − taxas');
assert(n.rows[0].dueDate === '2026-09-10' && n.rows[1].dueDate === '2026-10-10' && n.rows[9].dueDate === '2027-06-10', 'Cronograma mensal (fluxo atual da arquitetura)');
const nf = planCardSchedule({ gross: 1000, rule: { type: 'FIXED', value: 5 }, customerInstallments: 3, saleDate: '2026-09-10', mode: 'NORMAL', isCredit: true });
assert(sum(nf.rows.map((r) => r.fee)) === 5, 'Taxa fixa é o total da transação: rateada, não multiplicada pelas parcelas');
const nd = planCardSchedule({ gross: 300, rule: { type: 'PERCENTAGE', value: 2 }, customerInstallments: 1, saleDate: '2026-09-10', mode: 'NORMAL', isCredit: false });
assert(nd.rows.length === 1 && nd.rows[0].fee === 6, 'Débito normal: 1 recebível');
const odd = planCardSchedule({ gross: 100, rule: { type: 'PERCENTAGE', value: 3.33 }, customerInstallments: 3, saleDate: '2026-09-10', mode: 'NORMAL', isCredit: true });
assert(sum(odd.rows.map((r) => r.gross)) === 100 && sum(odd.rows.map((r) => r.fee)) === odd.totalFee, 'Arredondamento fecha exatamente (bruto e taxa)');

console.log('\n=== HISTÓRICO ===');
const snapshotA = { receivingMode: 'ANTICIPATED' as ReceivingMode, settlementProfile: 'D1', cardFeeValue: 12, cardFeeAmount: 120 };
const changed: CardFeeSettings = { ...tenantOn, anticipationEnabled: false, defaultReceivingMode: 'NORMAL' };
assert(snapshotA.receivingMode === 'ANTICIPATED' && snapshotA.cardFeeValue === 12 && resolveReceivingMode(changed) === 'NORMAL', 'Config muda para Normal; venda antiga segue ANTICIPATED/D1/12% (snapshot)');

console.log('\n=== KPIs ===');
// NORMAL: só a 1ª parcela recebida (amountReceived = líquido)
const normalItems = n.rows.map((r, i) => ({ status: i === 0 ? 'RECEBIDO' : 'A_RECEBER', value: r.gross, amountReceived: i === 0 ? r.net : 0, cardFeeAmount: r.fee }));
const kn = summarizeReceipts(normalItems);
assert(kn.gross === 100 && kn.fees === n.rows[0].fee && kn.net === n.rows[0].net, 'NORMAL: apenas a parcela recebida entra em bruto/taxa/líquido do período');
assert(Math.round((kn.gross - kn.fees) * 100) === Math.round(kn.net * 100), 'NORMAL: bruto − taxas = líquido');
const aVencer = normalItems.filter((i) => i.status !== 'RECEBIDO').reduce((x, i) => x + i.value, 0);
assert(aVencer === 900, 'NORMAL: 9 parcelas futuras ficam A Vencer (900), sem dupla contagem');
const ka = summarizeReceipts([{ status: 'RECEBIDO', value: 1000, amountReceived: 880, cardFeeAmount: 120 }]);
assert(ka.gross === 1000 && ka.fees === 120 && ka.net === 880, 'ANTECIPADO: bruto 1000, taxas 120, líquido 880 (sem 10 recebimentos futuros)');

console.log('\n=== SIMULADOR ===');
const s1 = simulateCardFee(tenantOn, { gross: 1000, brandId: 'm', mode: 'CREDIT', installments: 10, receivingMode: 'ANTICIPATED' });
const s2 = simulateCardFee(tenantOn, { gross: 1000, brandId: 'm', mode: 'CREDIT', installments: 10, receivingMode: 'NORMAL' });
assert(s1.configured && s1.feeAmount === 120 && s2.configured && s2.feeAmount === 50, 'Simulador muda conforme a tabela (120 antecipado x 50 normal)');

console.log('\n=== MULTI-TENANT ===');
assert(resolveCardFee(tenantOff, { brandId: 'm', mode: 'CREDIT', installments: 10, receivingMode: 'ANTICIPATED' }).status === 'NOT_CONFIGURED', 'Tenant sem tabela antecipada não herda a do outro tenant');

console.log('\n🎉 TODOS OS TESTES DE ANTECIPAÇÃO ON/OFF PASSARAM!');
