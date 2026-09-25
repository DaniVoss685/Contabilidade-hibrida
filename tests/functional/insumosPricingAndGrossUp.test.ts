// Insumos (embalagem → custo unitário), consumo no procedimento, preço/margem, permissões e gross-up do cartão.
// Testa as MESMAS funções usadas pelas telas (lib/procedureCosting, lib/cardFees, lib/permissions, mapeadores do
// supabaseClient) + estrutura das telas por verificação estática (este repo não tem testing-library).
// Rodar com: npx tsx tests/functional/insumosPricingAndGrossUp.test.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BASE_UNITS,
  PACKAGE_TYPES,
  buildAdHocProcedureItem,
  buildCatalogProcedureItem,
  buildPackageName,
  computeInputUnitCost,
  computeItemCost,
  computePriceMargin,
  computeProcedureCosts,
  computeSuggestedPrice,
  evaluateMargin,
  formatMarginPercent,
  formatUnitCost,
  isCatalogItem,
  resolvePricingParams,
  updateProcedureItem,
  validatePricingSettings,
} from '../../src/lib/procedureCosting';
import { computeFee, grossUpCardFee, simulateCardFee, solveGrossForNet } from '../../src/lib/cardFees';
import { getPricingAccess, hasPermission, getPermissionsFromTabs, PRICING_FINANCIAL_PERMISSIONS } from '../../src/lib/permissions';
import {
  mapAppClinicalInputToDb,
  mapAppPreferencesToDb,
  mapAppProcedureToDb,
  mapDbClinicalInputToApp,
  mapDbPreferencesToApp,
  mapDbProcedureToApp,
} from '../../src/lib/supabaseClient';
import type { CardFeeSettings, ClinicalInput, DentalProcedure } from '../../src/types';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function luva(): ClinicalInput {
  const unitCost = computeInputUnitCost(27.99, 100);
  return {
    id: 'inp_luva',
    name: 'Luva',
    category: 'Biossegurança & Descartáveis',
    packageType: 'Caixa',
    purchasePackageName: buildPackageName('Caixa', 100, 'un'),
    packageQuantity: 100,
    purchasePrice: 27.99,
    usageUnit: 'un',
    unitCost,
    active: true,
  };
}

const CARD_SETTINGS: CardFeeSettings = {
  anticipationEnabled: true,
  defaultReceivingMode: 'ANTICIPATED',
  brands: [
    {
      id: 'visa',
      name: 'Visa',
      active: true,
      debit: { type: 'PERCENTAGE', value: 1.5 },
      credit: { 1: { type: 'PERCENTAGE', value: 3.51 }, 2: { type: 'PERCENTAGE', value: 5.2 }, 3: { type: 'PERCENTAGE', value: 6.1 } },
      normal: { debit: { type: 'PERCENTAGE', value: 1.1 }, credit: { 1: { type: 'PERCENTAGE', value: 2.9 }, 2: { type: 'PERCENTAGE', value: 4.4 } } },
    },
    {
      id: 'master',
      name: 'Mastercard',
      active: true,
      credit: { 1: { type: 'PERCENTAGE', value: 3.9 } },
    },
    { id: 'fixa', name: 'Taxa fixa', active: true, credit: { 1: { type: 'FIXED', value: 4.5 } } },
  ],
} as CardFeeSettings;

async function main() {
  // ============================================================ T01/T02 — insumo (embalagem) e custo unitário
  console.log('\n— T01/T02: cadastro do insumo por embalagem');
  const l = luva();
  assert(l.packageType === 'Caixa' && l.packageQuantity === 100 && l.usageUnit === 'un' && l.purchasePrice === 27.99, 'T01: Luva = Caixa, 100 un, R$ 27,99');
  assert(near(l.unitCost, 0.2799), 'T02: custo unitário = 27,99 ÷ 100 = R$ 0,2799 (sem perder precisão)');
  assert(formatUnitCost(l.unitCost) === 'R$ 0,2799', 'T02: exibição exata "R$ 0,2799"');
  assert(formatUnitCost(l.unitCost, 'compact') === 'R$ 0,28', 'exibição compacta (listas) "R$ 0,28" — a UI arredonda, o cálculo não');
  assert(l.purchasePackageName === 'Caixa com 100 un', 'descrição da embalagem gerada: "Caixa com 100 un"');
  const anest = computeInputUnitCost(150, 50);
  assert(anest === 3 && formatUnitCost(anest) === 'R$ 3,00', 'Anestésico: caixa 50 tubetes por R$ 150 = R$ 3,00 / tubete');
  const resina = computeInputUnitCost(80, 4);
  assert(resina === 20 && formatUnitCost(resina) === 'R$ 20,00', 'Resina: 4 g por R$ 80 = R$ 20,00 / g');
  assert(computeInputUnitCost(0, 10) === 0 && computeInputUnitCost(10, 0) === 0 && computeInputUnitCost(NaN, 5) === 0, 'preço/quantidade inválidos → custo 0 (sem NaN/Infinity)');
  assert(near(computeInputUnitCost(10, 3), 3.333333), 'precisão interna de 6 casas (10 ÷ 3 = 3,333333)');
  assert(PACKAGE_TYPES.includes('Caixa') && PACKAGE_TYPES.includes('Embalagem'), 'tipos de embalagem incluem Caixa e Embalagem');
  assert(BASE_UNITS.map((u) => u.id).sort().join() === ['dose', 'g', 'kit', 'ml', 'tubete', 'un'].sort().join(), 'unidades base = un, ml, g, tubete, dose, kit (arquitetura existente)');

  // ============================================================ T03–T07 — consumo no procedimento
  console.log('\n— T03..T07: insumo no procedimento');
  const item = buildCatalogProcedureItem(l, 1, 'i1');
  assert(isCatalogItem(item) && item.unit === 'un' && near(item.unitCost, 0.2799) && item.name === 'Luva', 'T03: Luva entra no procedimento herdando nome, unidade base e custo base');
  assert(item.unit === l.usageUnit, 'T04: a unidade NÃO é escolhida de novo — vem do cadastro do insumo');
  const two = updateProcedureItem(item, 'quantity', 2);
  assert(two.quantity === 2 && two.unit === 'un', 'T05: quantidade utilizada = 2');
  assert(near(two.totalCost, 0.5598, 1e-4) && Math.round(two.totalCost * 100) / 100 === 0.56, `T06: custo no procedimento ≈ R$ 0,56 (${two.totalCost})`);
  const adhoc = buildAdHocProcedureItem('a1');
  assert(!isCatalogItem(adhoc), 'T07: item avulso não tem vínculo com o catálogo');
  const adhoc2 = updateProcedureItem(updateProcedureItem(updateProcedureItem(adhoc, 'name', 'Broca especial'), 'unit', 'kit'), 'unitCost', 12.5);
  const adhoc3 = updateProcedureItem(adhoc2, 'quantity', 3);
  assert(adhoc3.unit === 'kit' && adhoc3.unitCost === 12.5 && adhoc3.totalCost === 37.5, 'T07: item avulso continua permitindo unidade e custo unitário manuais');
  assert(computeItemCost(1000, 0.0001) === 0.1, 'itens de custo muito baixo não somem no arredondamento (4 casas por linha)');
  // muitos itens baratos: a soma usa precisão cheia, arredonda só no total
  const many = Array.from({ length: 100 }, () => ({ quantity: 1, unitCost: 0.004 }));
  const manyCosts = computeProcedureCosts({ durationMinutes: 0, clinicalHourRate: 0, inputs: many });
  assert(manyCosts.inputsCost === 0.4, '100 itens de R$ 0,004 somam R$ 0,40 (não R$ 0,00 por arredondar cada linha a centavos)');

  // ============================================================ T08–T10 — parâmetros da clínica e permissões
  console.log('\n— T08..T10: parâmetros da clínica e visibilidade');
  const legacy = resolvePricingParams(undefined);
  assert(legacy.clinicalHourRate === 220 && legacy.targetMarginPercent === 65 && legacy.structureCostPerHour === 0 && legacy.configured === false, 'sem configuração: padrões históricos (R$ 220/h, 65%) e configured=false');
  const cfg = resolvePricingParams({ clinicalHourRate: 300, structureCostPerHour: 50, targetMarginPercent: 60 });
  assert(cfg.configured && cfg.clinicalHourRate === 300 && cfg.structureCostPerHour === 50 && cfg.targetMarginPercent === 60, 'T09: parâmetros configurados alimentam o procedimento');
  const fromClinic = computeProcedureCosts({ durationMinutes: 60, clinicalHourRate: cfg.clinicalHourRate, structureCostPerHour: cfg.structureCostPerHour, inputs: [] });
  assert(fromClinic.professionalCost === 300 && fromClinic.structureCost === 50 && fromClinic.totalDirectCost === 350, 'T09: hora clínica (R$ 300) + estrutura (R$ 50) da clínica entram no custo sem o usuário digitar nada no procedimento');
  assert(!validatePricingSettings({ clinicalHourRate: 0, structureCostPerHour: 0, targetMarginPercent: 65 }).valid, 'validação: hora clínica zerada é recusada');
  assert(!validatePricingSettings({ clinicalHourRate: 200, structureCostPerHour: -1, targetMarginPercent: 65 }).valid, 'validação: custo de estrutura negativo é recusado');
  assert(!validatePricingSettings({ clinicalHourRate: 200, structureCostPerHour: 0, targetMarginPercent: 96 }).valid && !validatePricingSettings({ clinicalHourRate: 200, structureCostPerHour: 0, targetMarginPercent: 0 }).valid, 'validação: margem fora de 1–95% é recusada');
  assert(validatePricingSettings({ clinicalHourRate: 220, structureCostPerHour: 0, targetMarginPercent: 65 }).valid, 'validação: parâmetros válidos passam');

  // RBAC: reutiliza hasPermission / papéis existentes
  const recep = getPricingAccess('RECEPTION', null, false);
  assert(!recep.canViewCosts && !recep.canEditPrice && !recep.canManagePricingParams, 'T08: recepção NÃO vê custos, não edita preço final nem parâmetros (não precisa preencher hora clínica)');
  const assistant = getPricingAccess('ASSISTANT', ['procedures:view', 'procedures:manage'], false);
  assert(!assistant.canViewCosts && !assistant.canEditPrice, 'lista customizada com a aba de procedimentos NÃO concede acesso financeiro (nunca "de brinde")');
  const owner = getPricingAccess('OWNER', null, false);
  assert(owner.canViewCosts && owner.canEditPrice && owner.canManagePricingParams, 'T10: proprietário/administrador alteram parâmetros e preço');
  const admin = getPricingAccess('ADMIN', ['procedures:view'], false);
  assert(admin.canViewCosts && admin.canEditPrice && admin.canManagePricingParams, 'administrador com lista customizada antiga (sem as permissões novas) NÃO perde acesso: a lista só concede');
  const finance = getPricingAccess('FINANCE', null, false);
  assert(finance.canViewCosts && finance.canEditPrice && finance.canManagePricingParams, 'financeiro tem o pacote completo');
  const dentist = getPricingAccess('DENTIST', null, false);
  assert(dentist.canViewCosts && !dentist.canEditPrice && !dentist.canManagePricingParams, 'dentista mantém o que já via (custos), sem editar preço final nem parâmetros');
  const granted = getPricingAccess('RECEPTION', getPermissionsFromTabs(['procedures', 'settings'], 'RECEPTION', { pricingFinancialAccess: true }), false);
  assert(granted.canViewCosts && granted.canEditPrice && granted.canManagePricingParams, 'concessão explícita (interruptor na equipe) libera o pacote financeiro à recepção');
  const notGranted = getPermissionsFromTabs(['procedures', 'settings'], 'RECEPTION');
  assert(PRICING_FINANCIAL_PERMISSIONS.every((p) => !notGranted.includes(p)), 'sem o interruptor, getPermissionsFromTabs não inclui nenhuma permissão financeira');
  assert(hasPermission('RECEPTION', 'procedures:costs:view', { 'procedures:costs:view': true }, false), 'formato Record<string, boolean> continua suportado');
  assert(!hasPermission('DENTIST', 'procedures:costs:view', { 'procedures:costs:view': false }, false), 'Record com false explícito remove a permissão do papel');

  // ============================================================ T11–T13 — preço, sugerido e margem
  console.log('\n— T11..T13: preço praticado, sugerido e margem');
  const cost165 = computeProcedureCosts({ durationMinutes: 45, clinicalHourRate: 220, inputs: [] });
  assert(cost165.totalDirectCost === 165, 'custo de 45 min a R$ 220/h = R$ 165,00');
  const suggested = computeSuggestedPrice(cost165.totalDirectCost, 65);
  assert(suggested === 471.43, `T12: preço sugerido = 165 ÷ (1 − 65%) = R$ 471,43 (${suggested})`);
  assert(computeSuggestedPrice(0, 65) === 0 && computeSuggestedPrice(-5, 65) === 0, 'sem custo não há preço sugerido');
  assert(computeSuggestedPrice(100, 200) === 2000, 'margem é limitada a 95% (nunca divide por zero)');
  const m500 = computePriceMargin(500, 165);
  assert(m500.status === 'OK' && m500.marginPercent === 67 && m500.grossProfit === 335, 'T13: preço R$ 500 e custo R$ 165 → lucro bruto R$ 335 e margem 67%');
  assert(formatMarginPercent(m500.marginPercent) === '67%', 'margem exibida como "67%"');
  const m600 = computePriceMargin(600, 165);
  assert(m600.marginPercent !== null && m600.marginPercent > m500.marginPercent!, 'T13: a margem sobe quando o preço sobe');
  assert(computePriceMargin(0, 165).status === 'NO_PRICE' && computePriceMargin(500, 0).status === 'WAITING_COSTS', 'guardrails: sem preço / sem custo não calculam margem');
  assert(evaluateMargin(67, legacy) === null && evaluateMargin(10, legacy) === null, 'sem parâmetro configurado NÃO há julgamento de margem (nada de "saudável" inventado)');
  assert(evaluateMargin(67, cfg) === 'HEALTHY' && evaluateMargin(55, cfg) === 'BELOW_TARGET' && evaluateMargin(60, cfg) === 'HEALTHY', 'com margem-alvo configurada: "Margem saudável" / "Abaixo da margem-alvo"');
  const usePrice = suggested; // "Usar preço sugerido" preenche o preço praticado com o valor sugerido em centavos
  assert(computePriceMargin(usePrice, cost165.totalDirectCost).marginPercent === 65, 'ao usar o preço sugerido, a margem real volta a ser a margem-alvo (65%)');

  // ============================================================ T14 — simulador normal
  console.log('\n— T14: quanto a clínica recebe');
  const ruleV1 = { type: 'PERCENTAGE' as const, value: 3.51 };
  const net14 = computeFee(1000, ruleV1);
  assert(near(net14.feeAmount, 35.1) && near(net14.netValue, 964.9), 'T14: cobrar R$ 1.000 a 3,51% → taxa R$ 35,10 e líquido R$ 964,90');
  const sim = simulateCardFee(CARD_SETTINGS, { gross: 1000, brandId: 'visa', mode: 'CREDIT', installments: 1, receivingMode: 'ANTICIPATED' });
  assert(sim.configured && near(sim.netValue, 964.9), 'T14: simulador normal (Visa 1x antecipado) devolve R$ 964,90');

  // ============================================================ T15/T16 — gross-up
  console.log('\n— T15/T16: quanto cobrar (gross-up)');
  const up = grossUpCardFee(CARD_SETTINGS, { netDesired: 1000, brandId: 'visa', mode: 'CREDIT', installments: 1, receivingMode: 'ANTICIPATED' });
  assert(up.configured && up.reachable, 'gross-up resolvido para Visa 1x antecipado');
  if (!(up.configured && up.reachable)) throw new Error('unreachable');
  assert(up.gross === 1036.38, `T15: líquido R$ 1.000 a 3,51% → cobrar R$ 1.036,38 (${up.gross})`);
  assert(near(up.feeAmount, 36.38) && near(up.netValue, 1000), 'taxa estimada R$ 36,38 e líquido R$ 1.000,00');
  assert(near(up.effectiveRatePercent, 3.5103, 1e-3), `taxa efetiva 3,51% (${up.effectiveRatePercent.toFixed(4)}%)`);
  const naive = 1000 * 1.0351;
  assert(computeFee(naive, ruleV1).netValue < 1000, 'NÃO se calcula "1000 + 3,51%": isso deixaria a clínica com menos de R$ 1.000');
  assert(Math.abs(up.gross - 1000 / (1 - 0.0351)) < 0.01, 'coerente com a fórmula direta bruto = líquido ÷ (1 − taxa)');

  // T16 — arredondamento: menor bruto em centavos com líquido >= desejado
  let violations = 0;
  let notMinimal = 0;
  for (const rate of [0.99, 1.5, 2.49, 3.51, 4.99, 7.85, 12.34, 19.99]) {
    const rule = { type: 'PERCENTAGE' as const, value: rate };
    for (let desired = 1; desired <= 3000; desired += 7.37) {
      const d = Math.round(desired * 100) / 100;
      const g = solveGrossForNet(d, (x) => computeFee(x, rule).netValue);
      if (g === null) {
        violations++;
        continue;
      }
      if (computeFee(g, rule).netValue < d - 1e-9) violations++; // líquido >= desejado
      if (computeFee(Math.round((g - 0.01) * 100) / 100, rule).netValue >= d - 1e-9) notMinimal++; // 1 centavo a menos NÃO basta
    }
  }
  assert(violations === 0, 'T16: para 8 taxas × ~400 valores, o líquido após o arredondamento é SEMPRE >= o desejado (nunca R$ 999,99)');
  assert(notMinimal === 0, 'T16: o bruto escolhido é o MENOR em centavos (1 centavo a menos já não entrega o líquido)');
  const oneCentBelow = computeFee(1036.37, ruleV1);
  assert(oneCentBelow.netValue < 1000 && computeFee(1036.38, ruleV1).netValue >= 1000, 'T16 (exemplo): R$ 1.036,37 entrega R$ 999,99; R$ 1.036,38 entrega R$ 1.000,00');

  // taxa fixa, taxa zero, taxa 100%
  const fixed = grossUpCardFee(CARD_SETTINGS, { netDesired: 1000, brandId: 'fixa', mode: 'CREDIT', installments: 1, receivingMode: 'ANTICIPATED' });
  assert(fixed.configured && fixed.reachable && fixed.gross === 1004.5 && fixed.netValue === 1000, 'taxa FIXA de R$ 4,50: cobrar R$ 1.004,50 para receber R$ 1.000,00');
  const zero = grossUpCardFee({ brands: [{ id: 'z', name: 'Z', active: true, credit: { 1: { type: 'PERCENTAGE', value: 0 } } }] } as CardFeeSettings, { netDesired: 500, brandId: 'z', mode: 'CREDIT', installments: 1, receivingMode: 'ANTICIPATED' });
  assert(zero.configured && zero.reachable && zero.gross === 500, 'taxa 0%: cobrar exatamente o desejado');
  const all = grossUpCardFee({ brands: [{ id: 'x', name: 'X', active: true, credit: { 1: { type: 'PERCENTAGE', value: 100 } } }] } as CardFeeSettings, { netDesired: 100, brandId: 'x', mode: 'CREDIT', installments: 1, receivingMode: 'ANTICIPATED' });
  assert(all.configured && !all.reachable, 'taxa de 100%: inalcançável — resultado explícito, sem loop nem NaN');
  const missing = grossUpCardFee(CARD_SETTINGS, { netDesired: 1000, brandId: 'master', mode: 'CREDIT', installments: 6, receivingMode: 'ANTICIPATED' });
  assert(!missing.configured, 'taxa não configurada (Mastercard 6x): sem chute — "não configurada"');
  assert(solveGrossForNet(0, (g) => g) === null && solveGrossForNet(-10, (g) => g) === null, 'líquido desejado zero/negativo não gera cobrança');

  // ============================================================ T17–T19 — recalcula ao trocar bandeira/parcelas/antecipação
  console.log('\n— T17..T19: trocar bandeira, parcelas e antecipação recalcula');
  const gross = (p: Partial<Parameters<typeof grossUpCardFee>[1]>) => {
    const r = grossUpCardFee(CARD_SETTINGS, { netDesired: 1000, brandId: 'visa', mode: 'CREDIT', installments: 1, receivingMode: 'ANTICIPATED', ...p });
    return r.configured && r.reachable ? r.gross : NaN;
  };
  const visa1 = gross({});
  assert(gross({ brandId: 'master' }) !== visa1 && gross({ brandId: 'master' }) === 1040.58, `T17: trocar a bandeira (Visa → Mastercard 3,90%) recalcula: ${visa1} → ${gross({ brandId: 'master' })}`);
  assert(gross({ installments: 2 }) > visa1 && gross({ installments: 3 }) > gross({ installments: 2 }), 'T18: mais parcelas (taxa maior) → valor a cobrar maior');
  assert(gross({ receivingMode: 'NORMAL' }) < visa1, 'T19: antecipação usa a tabela ANTECIPADA; sem antecipação usa a NORMAL (taxa menor → cobra menos)');
  assert(gross({ mode: 'DEBIT' }) < visa1, 'débito usa a taxa de débito');

  // ============================================================ T20 — persistência (mapeadores) ↔ reload
  console.log('\n— T20: persistência das configurações');
  const prefsDb = mapAppPreferencesToDb({ alertFatorR: true, alertDueDates: true, operationalReminders: true, pricing: { clinicalHourRate: 300, structureCostPerHour: 50, targetMarginPercent: 60, updatedAt: '2026-09-25T00:00:00Z' } }, 'clinic_x');
  assert(prefsDb.pricing_settings?.clinicalHourRate === 300, 'parâmetros de precificação vão para df_system_preferences.pricing_settings');
  const prefsBack = mapDbPreferencesToApp(JSON.parse(JSON.stringify(prefsDb)));
  assert(prefsBack.pricing?.clinicalHourRate === 300 && prefsBack.pricing?.structureCostPerHour === 50 && prefsBack.pricing?.targetMarginPercent === 60, 'reload: os parâmetros voltam idênticos do banco');
  assert(mapDbPreferencesToApp({ card_fees: {} }).pricing === undefined, 'clínica sem parâmetros salvos continua "não configurada" (sem inventar)');
  assert(mapAppPreferencesToDb({ alertFatorR: true, alertDueDates: true, operationalReminders: true }, 'c').pricing_settings === null, 'voltar aos padrões grava NULL');
  const inputDb = mapAppClinicalInputToDb(l, 'clinic_x');
  assert(inputDb.package_type === 'Caixa' && inputDb.unit_cost === 0.2799 && inputDb.usage_unit === 'un', 'insumo: tipo de embalagem e custo unitário (0,2799) gravados sem perder precisão');
  const inputBack = mapDbClinicalInputToApp(JSON.parse(JSON.stringify(inputDb)));
  assert(inputBack.packageType === 'Caixa' && inputBack.unitCost === 0.2799 && inputBack.packageQuantity === 100 && inputBack.usageUnit === 'un', 'reload: o insumo volta com embalagem, quantidade, unidade base e custo');
  assert(mapDbClinicalInputToApp({ id: 'a', name: 'Antigo', category: 'X', purchase_package_name: 'Caixa com 50', package_quantity: 50, purchase_price: 10, usage_unit: 'un', unit_cost: 0.2 }).packageType === undefined, 'insumo antigo (sem package_type) continua abrindo');
  const proc: DentalProcedure = {
    id: 'p1', code: 'P', name: 'Restauração', category: 'DENTISTICA', clinicalDurationMinutes: 45, professionalHourlyRate: 220, structureCostPerHour: 40,
    inputs: [two], labCost: 0, defaultPrice: 500, active: true,
  } as DentalProcedure;
  const procBack = mapDbProcedureToApp(JSON.parse(JSON.stringify(mapAppProcedureToDb(proc, 'clinic_x'))));
  assert(procBack.structureCostPerHour === 40 && procBack.clinicalDurationMinutes === 45 && procBack.professionalHourlyRate === 220 && procBack.inputs[0].unit === 'un', 'procedimento: custo/hora da estrutura, duração, hora clínica e itens (com unidade herdada) persistem');

  // ============================================================ estrutura das telas (estático)
  console.log('\n— Telas: estrutura (T04, T07, T08, T11)');
  const procModal = strip(read('src/components/Modals/ProcedureModal.tsx'));
  const inputModal = strip(read('src/components/Modals/ClinicalInputModal.tsx'));
  const simulator = strip(read('src/components/Modals/CardFeeSimulatorModal.tsx'));
  const procView = strip(read('src/components/Procedures/ProceduresView.tsx'));
  const settings = strip(read('src/components/Settings/SettingsView.tsx'));

  assert(!/Como esse material é consumido/.test(inputModal) && /Como este insumo é comprado\?/.test(inputModal), 'cadastro do insumo pergunta "Como este insumo é comprado?" (não mais "Como esse material é consumido")');
  for (const label of ['Tipo de embalagem', 'Quantidade na embalagem', 'Unidade base', 'Preço da embalagem', 'Custo unitário', 'Descrição (opcional)', 'Marca / fabricante', 'Categoria']) {
    assert(inputModal.includes(label), `cadastro do insumo tem o campo "${label}"`);
  }
  assert(/isCatalogItem\(item\)/.test(procModal) && /data-testid="proc-item-unit"/.test(procModal), 'T04: linha de item do catálogo mostra a unidade como texto herdado (proc-item-unit)');
  assert(/CATÁLOGO/.test(procModal) && /AVULSO/.test(procModal), 'catálogo × avulso diferenciados visualmente (badges CATÁLOGO / AVULSO)');
  const idxUnitText = procModal.indexOf('data-testid="proc-item-unit"');
  const idxUnitSelect = procModal.indexOf('BASE_UNITS.map', idxUnitText);
  const between = procModal.slice(idxUnitText, idxUnitSelect);
  assert(idxUnitText > 0 && idxUnitSelect > idxUnitText && between.includes(') : (') && !between.includes('</td>'), 'T07: o seletor de unidade só existe no ramo do ITEM AVULSO (else do mesmo ternário que mostra a unidade herdada)');
  assert(procModal.split('BASE_UNITS.map').length === 2, 'há exatamente UM seletor de unidade no formulário do procedimento (o do item avulso)');
  assert(/canViewCosts &&/.test(procModal) && !/professionalHourlyRate\s*\}?\s*<\/?label/.test(procModal), 'custo/hora/margem só renderizados com canViewCosts');
  assert(!/label="Valor da Hora Clínica do Dentista"/.test(procModal) && !/Margem de Lucro Desejada/.test(procModal), 'T08: o formulário de procedimento não pede mais hora clínica nem margem desejada');
  assert(/Duração do procedimento/.test(procModal) && /data-testid="proc-duration"/.test(procModal), 'a duração do procedimento fica em evidência');
  const priceIdx = procModal.indexOf('4. Preço do procedimento');
  const compIdx = procModal.indexOf('Ver composição do custo');
  assert(priceIdx > 0 && compIdx > priceIdx, 'T11: "Preço do procedimento" vem antes e fora da composição do custo (que fica recolhida no fim)');
  assert(/Quanto será cobrado do paciente\?/.test(procModal) && /Preço praticado/.test(procModal), 'T11: pergunta principal "Quanto será cobrado do paciente?" + campo "Preço praticado"');
  assert(/Usar preço sugerido/.test(procModal) && !/>\s*Adotar\s*</.test(procModal), 'T12: botão "Usar preço sugerido" (sem o ambíguo "Adotar")');
  assert(/Preço sugerido pela clínica/.test(procModal) && /Custo estimado/.test(procModal) && /Margem real/.test(procModal), 'preço sugerido, custo estimado e margem ao lado do preço');
  assert(/showComposition/.test(procModal) && /aria-expanded/.test(procModal), 'composição do custo é uma seção recolhível (modo avançado)');
  assert(/evaluateMargin\(/.test(procModal) && !/marginPercent >= 40/.test(procModal), 'julgamento de margem só via evaluateMargin (sem limite 40% inventado)');
  assert(/canViewCosts \? 9 : 6/.test(procView) && /canViewCosts &&/.test(procView), 'lista de procedimentos esconde custo direto, margem e lucro sem acesso financeiro');
  assert(/PricingSettingsCard/.test(settings), 'Configurações → card de Precificação');
  const card = strip(read('src/components/Settings/PricingSettingsCard.tsx'));
  assert(/canManagePricingParams/.test(card) && /if \(!canViewCosts\) return null/.test(card), 'parâmetros: só quem vê custos enxerga o card; só quem gerencia edita');

  // simulador
  assert(/sim-mode-\$\{m\}/.test(simulator) && /Quero saber quanto recebo/.test(simulator) && /Quero saber quanto cobrar/.test(simulator), 'simulador tem o alternador "Quero saber quanto recebo" / "Quero saber quanto cobrar"');
  assert(/grossUpCardFee\(/.test(simulator) && /simulateCardFee\(/.test(simulator), 'os dois modos usam as funções do motor de taxas (gross-up e simulação)');
  assert(/Este valor foi calculado para que, após as taxas selecionadas/.test(simulator) && /Valor a cobrar/.test(simulator) && /Taxa estimada/.test(simulator) && /Taxa efetiva/.test(simulator) && /Você quer receber/.test(simulator), 'resultado do gross-up: você quer receber, valor a cobrar, taxa estimada, taxa efetiva e o texto explicativo');
}

main()
  .then(() => {
    console.log(`\n${passed} verificações passaram.`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
