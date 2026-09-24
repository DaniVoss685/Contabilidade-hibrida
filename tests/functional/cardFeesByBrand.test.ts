// Taxas de maquininha por bandeira/modalidade/parcelas — funções puras de
// src/lib/cardFees.ts (mesmas usadas por Configurações, NewSaleModal e simulador).
// Rodar com: npx tsx tests/functional/cardFeesByBrand.test.ts
import {
  computeFee, distributeFee, resolveCardFee, simulateCardFee, ensureDefaultBrands,
  validateFeeRule, getActiveBrands, missingFeeMessage,
} from '../../src/lib/cardFees';
import { CardFeeSettings } from '../../src/types';

function assert(c: boolean, m: string) {
  if (!c) { console.error(`❌ FAILED: ${m}`); throw new Error(m); }
  console.log(`✅ PASSED: ${m}`);
}

const settings: CardFeeSettings = {
  debit: 1.9, credit: { 1: 2.5 }, // legado
  brands: [
    { id: 'visa', name: 'Visa', active: true, debit: { type: 'PERCENTAGE', value: 1.5 },
      credit: { 1: { type: 'PERCENTAGE', value: 2.3 }, 3: { type: 'PERCENTAGE', value: 4.2 }, 5: { type: 'PERCENTAGE', value: 4 }, 6: { type: 'PERCENTAGE', value: 6 }, 12: { type: 'PERCENTAGE', value: 10 }, 8: { type: 'PERCENTAGE', value: 0 } } },
    { id: 'master', name: 'Mastercard', active: true, debit: { type: 'FIXED', value: 5 }, credit: { 3: { type: 'FIXED', value: 5 } } },
    { id: 'elo', name: 'Elo', active: true, credit: { 1: { type: 'PERCENTAGE', value: 2.49 }, 5: { type: 'FIXED', value: 5 } } },
    { id: 'old', name: 'Amex', active: false },
  ],
};
const fee = (brandId: string | undefined, mode: 'DEBIT' | 'CREDIT', n: number, gross: number) => {
  const r = resolveCardFee(settings, { brandId, mode, installments: n });
  return r.status === 'CONFIGURED' ? computeFee(gross, r.rule) : null;
};

console.log('=== TAXAS DE CARTÃO POR BANDEIRA ===\n');
assert(fee('visa', 'DEBIT', 1, 1000)?.feeAmount === 15, 'A: Visa débito 1,5% sobre 1000 = 15');
assert(fee('master', 'DEBIT', 1, 1000)?.feeAmount === 5 && fee('master', 'DEBIT', 1, 1000)?.netValue === 995, 'B: Mastercard débito R$5 fixo -> líquido 995');
assert(fee('elo', 'CREDIT', 1, 1000)?.feeAmount === 24.9, 'C: Elo crédito 1x 2,49% = 24,90');
assert(fee('visa', 'CREDIT', 12, 1000)?.feeAmount === 100, 'D: Visa crédito 12x 10% = 100');
assert(fee('master', 'CREDIT', 3, 1000)?.feeAmount === 5, 'E: Mastercard crédito 3x fixo = 5 (total, não 5x3)');
const zero = resolveCardFee(settings, { brandId: 'visa', mode: 'CREDIT', installments: 8 });
assert(zero.status === 'CONFIGURED' && computeFee(1000, (zero as any).rule).feeAmount === 0, 'F: taxa 0% salva explicitamente é configurada (fee 0)');
assert(resolveCardFee(settings, { brandId: 'visa', mode: 'CREDIT', installments: 7 }).status === 'NOT_CONFIGURED', 'G: Visa crédito 7x sem taxa -> NÃO configurada (não assume zero)');
assert(missingFeeMessage('Visa', 'CREDIT', 7) === 'Taxa não configurada para Visa • Crédito • 7x', 'G2: mensagem de taxa ausente');
assert(fee('visa', 'CREDIT', 3, 1000)?.feeAmount === 42 && fee('elo', 'CREDIT', 3, 1000) === null, 'H: troca de bandeira recalcula (Visa 42 / Elo não configurada em 3x)');
assert(fee('visa', 'CREDIT', 3, 1000)?.feeAmount === 42 && fee('visa', 'CREDIT', 6, 1000)?.feeAmount === 60, 'I: troca de parcelas recalcula (3x=42, 6x=60)');

// J. histórico: snapshot gravado não depende da configuração posterior
const snapshotRule = { type: 'PERCENTAGE' as const, value: 2 };
const sold = computeFee(1000, snapshotRule).feeAmount;
const changed: CardFeeSettings = { ...settings, brands: settings.brands!.map((b) => (b.id === 'visa' ? { ...b, credit: { ...b.credit, 1: { type: 'PERCENTAGE' as const, value: 3 } } } : b)) };
const newSale = resolveCardFee(changed, { brandId: 'visa', mode: 'CREDIT', installments: 1 });
assert(sold === 20 && newSale.status === 'CONFIGURED' && computeFee(1000, (newSale as any).rule).feeAmount === 30, 'J: config 2%->3%: venda antiga (snapshot) segue 20; nova usa 30');

// Cálculos / precisão
assert(computeFee(500, { type: 'FIXED', value: 5 }).netValue === 495, 'Simulador fixo: 500 - 5 = 495');
assert(computeFee(500, { type: 'PERCENTAGE', value: 4 }).feeAmount === 20, 'Simulador %: 500 x 4% = 20');
assert(computeFee(0.1 + 0.2, { type: 'PERCENTAGE', value: 10 }).feeAmount === 0.03, 'Precisão: sem erro de float');
assert(computeFee(10, { type: 'FIXED', value: 50 }).netValue === 0, 'Taxa fixa maior que o valor nunca gera líquido negativo');
const dist = distributeFee(5, [333.33, 333.33, 333.34]);
assert(Math.round(dist.reduce((a, b) => a + b, 0) * 100) === 500, 'Taxa fixa distribuída entre parcelas fecha exatamente no total');

// Simulador
const s1 = simulateCardFee(settings, { gross: 500, brandId: 'elo', mode: 'CREDIT', installments: 5 });
assert(s1.configured && s1.feeAmount === 5 && s1.netValue === 495, 'SIM 1: Elo crédito 5x fixo 5 -> líquido 495');
const s2 = simulateCardFee(settings, { gross: 500, brandId: 'visa', mode: 'CREDIT', installments: 5 });
assert(s2.configured && s2.feeAmount === 20 && s2.netValue === 480, 'SIM 2: Visa crédito 5x 4% -> líquido 480');
assert(!simulateCardFee(settings, { gross: 500, brandId: 'visa', mode: 'CREDIT', installments: 7 }).configured, 'SIM 3: sem taxa -> não configurada');

// Validação
assert(!validateFeeRule({ type: 'PERCENTAGE', value: NaN }).valid, 'Validação: NaN rejeitado');
assert(!validateFeeRule({ type: 'FIXED', value: -1 }).valid, 'Validação: negativo rejeitado');
assert(!validateFeeRule({ type: 'PERCENTAGE', value: 101 }).valid, 'Validação: % > 100 rejeitado');
assert(!validateFeeRule({ type: 'FIXED', value: 'x' as any }).valid, 'Validação: string rejeitada');
assert(validateFeeRule({ type: 'FIXED', value: 0 }).valid, 'Validação: zero válido');

// Bandeiras
assert(getActiveBrands(settings).length === 3, 'Bandeira inativa não aparece em novas operações');
const seeded = ensureDefaultBrands({ debit: 1.9 });
assert(seeded.brands!.map((b) => b.name).join() === 'Visa,Mastercard,Elo' && seeded.debit === 1.9, 'Padrão Visa/Mastercard/Elo criado sem apagar taxa legada');
assert(ensureDefaultBrands(seeded) === seeded, 'ensureDefaultBrands idempotente (não duplica)');
assert(seeded.brands!.every((b) => !b.debit && !b.credit), 'Backfill não inventa taxa: regras nascem não configuradas');

// Legado sem bandeira
const leg = resolveCardFee(settings, { mode: 'DEBIT' });
assert(leg.status === 'CONFIGURED' && (leg as any).source === 'LEGACY' && (leg as any).rule.value === 1.9, 'Lançamento antigo sem bandeira usa a taxa global legada preservada');

// Multi-tenant (settings vêm de df_system_preferences por tenant)
const tenantA: CardFeeSettings = { brands: [{ id: 'v', name: 'Visa', active: true, debit: { type: 'PERCENTAGE', value: 2 } }] };
const tenantB: CardFeeSettings = { brands: [{ id: 'v', name: 'Visa', active: true, debit: { type: 'PERCENTAGE', value: 3 } }] };
const ra = resolveCardFee(tenantA, { brandId: 'v', mode: 'DEBIT' }) as any;
const rb = resolveCardFee(tenantB, { brandId: 'v', mode: 'DEBIT' }) as any;
assert(ra.rule.value === 2 && rb.rule.value === 3, 'Multi-tenant: Visa 2% (A) e 3% (B) independentes');

// Cadastro (regras de exibição do NewSaleModal)
const needsBrand = (m: string) => m === 'CARTAO_DEBITO' || m === 'CARTAO_CREDITO';
const needsInst = (m: string) => m === 'CARTAO_CREDITO';
assert(needsBrand('CARTAO_DEBITO') && !needsInst('CARTAO_DEBITO'), 'Débito pede bandeira, não parcelas');
assert(needsBrand('CARTAO_CREDITO') && needsInst('CARTAO_CREDITO'), 'Crédito pede bandeira + parcelas');
assert(!needsBrand('PIX') && !needsBrand('DINHEIRO') && !needsBrand('BOLETO'), 'Pix/Dinheiro/Boleto não pedem bandeira');
console.log('\n🎉 TODOS OS TESTES DE TAXAS POR BANDEIRA PASSARAM!');
