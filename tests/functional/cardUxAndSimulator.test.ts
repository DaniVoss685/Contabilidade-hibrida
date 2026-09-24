// UX do cartão: switch "Valor já recebido", recebimento da clínica com 2 opções, simulador em Receitas/Vendas.
// Lógica pura (mesmas funções de src/lib/cardFees.ts usadas por NewSaleModal e CardFeeSimulatorModal) + checagem
// estática dos componentes. Rodar com: npx tsx tests/functional/cardUxAndSimulator.test.ts
import { readFileSync } from 'fs';
import {
  receivedSwitchLabel, receivingModeOptions, resolveReceivingMode, simulateCardFee, planCardSchedule,
  resolveCardFee, computeFee, getActiveBrands,
} from '../../src/lib/cardFees';
import { CardFeeSettings } from '../../src/types';

function assert(c: boolean, m: string) {
  if (!c) { console.error(`❌ FAILED: ${m}`); throw new Error(m); }
  console.log(`✅ PASSED: ${m}`);
}
const src = (p: string) => readFileSync(p, 'utf-8');

const cfg: CardFeeSettings = {
  anticipationEnabled: true, defaultReceivingMode: 'ANTICIPATED', settlementProfile: 'D1',
  brands: [
    { id: 'visa', name: 'Visa', active: true, debit: { type: 'PERCENTAGE', value: 1.5 }, credit: { 1: { type: 'PERCENTAGE', value: 3 }, 5: { type: 'PERCENTAGE', value: 9.99 }, 12: { type: 'PERCENTAGE', value: 14 } }, normal: { credit: { 5: { type: 'PERCENTAGE', value: 5 } } } },
    { id: 'mc', name: 'Mastercard', active: true, credit: { 5: { type: 'PERCENTAGE', value: 10.5 } } },
    { id: 'elo', name: 'Elo', active: true, credit: { 5: { type: 'FIXED', value: 5 } } },
    { id: 'hip', name: 'Hipercard', active: true, credit: { 5: { type: 'PERCENTAGE', value: 8 } } },
    { id: 'off', name: 'Amex', active: false },
  ],
};

console.log('=== VALOR JÁ RECEBIDO ===');
assert(receivedSwitchLabel(1) === 'Valor já recebido', 'UX-01: pagamento único (Pix/dinheiro/débito) -> "Valor já recebido"');
assert(receivedSwitchLabel(1) === 'Valor já recebido', 'UX-02/03: switch ON/OFF usa o mesmo rótulo; estado é controlado pelo componente Switch');
assert(receivedSwitchLabel(10) === '1ª parcela já recebida', 'UX-04: cartão normal parcelado NÃO parece marcar a venda inteira como recebida');
const antPlan = planCardSchedule({ gross: 1000, rule: { type: 'PERCENTAGE', value: 12 }, customerInstallments: 10, saleDate: '2026-09-25', mode: 'ANTICIPATED', isCredit: true });
assert(receivedSwitchLabel(antPlan.rows.length) === 'Valor já recebido', 'Cartão antecipado (1 liquidação) -> "Valor já recebido"');

console.log('\n=== RECEBIMENTO DA CLÍNICA ===');
assert(resolveReceivingMode(cfg) === 'ANTICIPATED', 'UX-05: padrão antecipado -> dropdown inicia Antecipado');
assert(resolveReceivingMode({ ...cfg, defaultReceivingMode: 'NORMAL' }) === 'NORMAL', 'UX-06: padrão normal -> dropdown inicia Normal');
const opts = receivingModeOptions('D1');
assert(opts.length === 2 && opts[0].label === 'Antecipado — 1 dia útil' && opts[1].label === 'Normal — conforme parcelas', 'UX-07: exatamente 2 opções (sem "Usar padrão")');
assert(!opts.some((o) => /padr/i.test(o.label)), 'Nenhuma opção contém "padrão"');
assert(resolveReceivingMode(cfg, 'NORMAL') === 'NORMAL' && resolveReceivingMode(cfg) === 'ANTICIPATED', 'UX-08: override troca só a venda; configuração continua Antecipado');

console.log('\n=== SIMULADOR (Receitas / Vendas) ===');
const sales = src('src/components/Sales/SalesView.tsx');
assert(sales.includes('Simular Taxa') && sales.includes('CardFeeSimulatorModal'), 'SIM-01: botão "Simular Taxa" em Receitas/Vendas');
assert(!sales.includes('Exportar CSV') && !sales.includes('handleExportCsv'), 'SIM-02: "Exportar CSV" removido da UI desta tela');
const modal = src('src/components/Modals/CardFeeSimulatorModal.tsx');
assert(modal.includes('Simular Taxa do Cartão') && modal.includes('Veja quanto a clínica recebe líquido antes de lançar a venda.'), 'SIM-03: modal com título/subtítulo');
assert(!/db\.(add|update|save|delete)/.test(modal) && !modal.includes('Patient'), 'SIM-16/C19: modal não grava nada e não exige paciente');
assert(!src('src/components/Settings/CardFeesCard.tsx').includes('Simulador de taxa'), 'Simulador removido de Configurações (sem dois simuladores)');
assert(src('src/components/Modals/NewSaleModal.tsx').includes('resolveCardFee') && modal.includes('simulateCardFee'), 'Mesmo motor (cardFees.ts) na Nova Receita e no simulador');

const sim = (brandId: string, mode: 'DEBIT' | 'CREDIT', n: number, gross: number, rm: 'ANTICIPATED' | 'NORMAL' = 'ANTICIPATED') =>
  simulateCardFee(cfg, { gross, brandId, mode, installments: n, receivingMode: rm }) as any;
const v = sim('visa', 'CREDIT', 5, 150);
assert(v.configured && v.feeAmount === 14.99 && v.netValue === 135.01, 'SIM-04/C20: 150 Visa crédito 5x 9,99% -> taxa 14,99 / líquido 135,01');
assert(sim('mc', 'CREDIT', 5, 150).feeAmount === 15.75, 'SIM-05: Mastercard');
assert(sim('elo', 'CREDIT', 5, 150).feeAmount === 5 && sim('elo', 'CREDIT', 5, 150).netValue === 145, 'SIM-06/14: Elo taxa fixa 5');
assert(sim('hip', 'CREDIT', 5, 100).feeAmount === 8, 'SIM-07: bandeira customizada');
assert(sim('visa', 'DEBIT', 1, 200).feeAmount === 3, 'SIM-08: débito');
assert(sim('visa', 'CREDIT', 1, 100).feeAmount === 3, 'SIM-09: crédito 1x');
assert(sim('visa', 'CREDIT', 12, 100).feeAmount === 14, 'SIM-10: crédito 12x');
assert(sim('visa', 'CREDIT', 5, 150, 'ANTICIPATED').feeAmount === 14.99 && sim('visa', 'CREDIT', 5, 150, 'NORMAL').feeAmount === 7.5, 'SIM-11/12: antecipado x normal usam tabelas diferentes');
assert(!sim('visa', 'CREDIT', 7, 150).configured && !sim('mc', 'CREDIT', 5, 150, 'NORMAL').configured, 'SIM-15/D2: taxa ausente -> "não configurada" (nunca 0%)');
assert(getActiveBrands(cfg).length === 4 && !getActiveBrands(cfg).some((b) => b.name === 'Amex'), 'C6: só bandeiras ativas, inclusive customizadas');

const frozen = JSON.stringify(cfg);
sim('visa', 'CREDIT', 5, 150);
assert(JSON.stringify(cfg) === frozen, 'SIM-16: simulação é pura (configuração inalterada, nada persistido)');

// SIM-17 / Parte D: simulador == Nova Receita (resolveCardFee + computeFee + planCardSchedule)
const r = resolveCardFee(cfg, { brandId: 'visa', mode: 'CREDIT', installments: 5, receivingMode: 'ANTICIPATED' }) as any;
const venda = computeFee(1200, r.rule);
const plan = planCardSchedule({ gross: 1200, rule: r.rule, customerInstallments: 5, saleDate: '2026-09-23', mode: 'ANTICIPATED', isCredit: true });
const s1200 = sim('visa', 'CREDIT', 5, 1200);
assert(s1200.feeAmount === venda.feeAmount && s1200.netValue === venda.netValue && plan.totalFee === s1200.feeAmount && plan.totalNet === s1200.netValue, 'SIM-17/D: R$ 1.200 Visa 5x antecipado -> simulador = venda (taxa 119,88 / líquido 1.080,12)');
assert(s1200.feeAmount === 119.88 && s1200.netValue === 1080.12, 'Valores do exemplo do pedido (1.080,12)');

console.log('\n🎉 TODOS OS TESTES DE UX DO CARTÃO E SIMULADOR PASSARAM!');
