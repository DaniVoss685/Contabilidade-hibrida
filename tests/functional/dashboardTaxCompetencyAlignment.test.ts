// Bug: no Dashboard, "DAS Estimado" (PJ) e "IRPF Estimado a Recolher" (PF) usavam a alíquota da
// última competência FECHADA (ex.: Ago/2026) multiplicada pelo faturamento do mês EM ANDAMENTO
// (ex.: Set/2026) — duas competências diferentes na mesma conta. Isso também rotulava o número como
// "Vencimento dia 20" quando na prática o que vence no dia 20 de um mês é apurado sobre o faturamento
// do mês ANTERIOR (LC 123/2006 art. 18 p/ o DAS; Carnê-Leão vence no último dia útil do mês seguinte
// ao recebimento). Corrigido: o faturamento/recebimento usado no card de guia/DARF passa a ser sempre
// da MESMA competência fechada de onde já vem a alíquota (fiscalBase.referenceCompetency para o DAS;
// getLastClosedCompetence — mesma função que a tela Motores já usa — para o Carnê-Leão). O painel
// "Limite de Isenção" (Atual/Previsto) continua com o mês corrente, ao vivo — propósito diferente.
// Rodar com: npx tsx tests/functional/dashboardTaxCompetencyAlignment.test.ts

import { readFileSync } from 'node:fs';
import { resolveFiscalBase, estimateSimplesFromBase, sumCnpjRevenueForCompetence, addMonthsToCompetency } from '../../src/lib/fiscalBase';
import { calculateCpfMonthlyTax, DEFAULT_TAX_RULES_SIMPLES } from '../../src/lib/taxEngine';
import { getLastClosedCompetence, getTodayCivilDate } from '../../src/lib/statusHelper';
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

// ---------------------------------------------------------------------------------------------
console.log('\n=== 1. getLastClosedCompetence — sempre o mês civil ANTERIOR a hoje, nunca o atual ===');
{
  const today = getTodayCivilDate();
  const closed = getLastClosedCompetence();
  const expected = addMonthsToCompetency(today.slice(0, 7), -1);
  assert(closed.competenceStr === expected, `mês fechado = mês atual − 1 (obtido ${closed.competenceStr}, esperado ${expected})`);
  assert(closed.competenceStr < today.slice(0, 7), 'nunca é o mês atual (em andamento)');
}

// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. DAS: alíquota e faturamento SEMPRE da mesma competência (referenceCompetency) ===');
{
  const cnpjSale = (id: string, serviceDate: string, value: number): Sale =>
    ({
      id, orgId: 'o', taxOrigin: 'CNPJ', patientId: 'p', patientName: 'P', patientCpf: '',
      payerIsBeneficiary: true, procedureName: 'Proc', description: '', totalValue: value,
      serviceDate, paymentMethod: 'PIX' as PaymentMethod, installmentsCount: 1,
      installments: [], createdAt: serviceDate,
    } as Sale);

  const sales: Sale[] = [
    cnpjSale('s_ago', '2026-08-12', 100000), // competência fechada (referência)
    cnpjSale('s_set', '2026-09-10', 999999), // mês em andamento — NUNCA deve entrar no DAS
  ];

  const fiscalBase = resolveFiscalBase({
    todayStr: '2026-09-25',
    professional: { fiscalSourceType: 'MANUAL_TOTAL', baselineConfigured: true, rbt12Inicial: 15226.4, folha12MesesInicial: 10372.89, initialFiscalHistory: undefined },
    contabilex: { loaded: true, linkStatus: null, snapshots: [] },
    taxRules: DEFAULT_TAX_RULES_SIMPLES[2026],
    year: 2026,
  });
  assert(fiscalBase.referenceCompetency === '2026-08', `base fiscal fechada em Ago/2026 (obtido ${fiscalBase.referenceCompetency})`);

  // Correto (depois do fix): revenueCompetence = fiscalBase.referenceCompetency
  const fixed = estimateSimplesFromBase(fiscalBase, { sales, revenueCompetence: fiscalBase.referenceCompetency, year: 2026, taxRules: DEFAULT_TAX_RULES_SIMPLES[2026] });
  assert(fixed.monthlyRevenueNfse === 100000, `faturamento usado = só o de Ago (100.000), nunca o de Set (obtido ${fixed.monthlyRevenueNfse})`);
  assert(fixed.dasEstimated === 6000, `DAS = 6% (Anexo III) × 100.000 = 6.000,00 (obtido ${fixed.dasEstimated})`);

  // Confirma o BUG antigo lado a lado: revenueCompetence = mês em andamento pegava a venda errada
  const buggy = estimateSimplesFromBase(fiscalBase, { sales, revenueCompetence: '2026-09', year: 2026, taxRules: DEFAULT_TAX_RULES_SIMPLES[2026] });
  assert(buggy.monthlyRevenueNfse === 999999, 'documentado: com a competência do mês em andamento o DAS pegava a venda de Setembro (o bug relatado)');
  assert(fixed.monthlyRevenueNfse !== buggy.monthlyRevenueNfse, 'a competência realmente importa — não é um detalhe cosmético');

  // Faturamento de um mês SEM nenhuma venda na competência fechada: DAS = 0 (nunca soma outro mês)
  const noAugustRevenue = estimateSimplesFromBase(fiscalBase, { sales: [cnpjSale('s_set_only', '2026-09-10', 5000)], revenueCompetence: fiscalBase.referenceCompetency, year: 2026, taxRules: DEFAULT_TAX_RULES_SIMPLES[2026] });
  assert(noAugustRevenue.monthlyRevenueNfse === 0 && noAugustRevenue.dasEstimated === 0, 'sem faturamento na competência fechada, DAS = R$ 0,00 (nunca soma o mês em andamento por engano)');
}

// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. Carnê-Leão: recebido do mês FECHADO, não do mês em andamento ===');
{
  const inst = (id: string, saleId: string, paymentDate: string, value: number): SaleInstallment =>
    ({
      id, saleId, installmentNumber: 1, totalInstallments: 1, value, dueDate: paymentDate,
      status: 'RECEBIDO', paymentDate, amountReceived: value, paymentMethod: 'PIX' as PaymentMethod,
    } as SaleInstallment);

  const cpfSale = (id: string, installments: SaleInstallment[]): Sale =>
    ({
      id, orgId: 'o', taxOrigin: 'CPF', patientId: 'p', patientName: 'P', patientCpf: '',
      payerIsBeneficiary: true, procedureName: 'Proc', description: '', totalValue: installments[0].value,
      serviceDate: installments[0].paymentDate, paymentMethod: 'PIX' as PaymentMethod, installmentsCount: 1,
      installments, createdAt: installments[0].paymentDate,
    } as Sale);

  const sales: Sale[] = [
    cpfSale('s_ago', [inst('i_ago', 's_ago', '2026-08-15', 8000)]),
    cpfSale('s_set', [inst('i_set', 's_set', '2026-09-15', 777777)]), // mês em andamento — NUNCA deve entrar
  ];

  const dueCompetence = '2026-08';
  const liveCompetence = '2026-09';

  const due = calculateCpfMonthlyTax(sales, [], dueCompetence, 2026);
  assert(due.grossRevenueReceived === 8000, `IRPF a recolher usa só o recebido em Ago (obtido ${due.grossRevenueReceived})`);

  const live = calculateCpfMonthlyTax(sales, [], liveCompetence, 2026);
  assert(live.grossRevenueReceived === 777777, 'o painel "Limite de Isenção" (ao vivo) continua a somar o mês corrente — não foi alterado');

  assert(due.grossRevenueReceived !== live.grossRevenueReceived, 'guia (mês fechado) e painel ao vivo (mês corrente) são deliberadamente NÚMEROS DIFERENTES agora');
}

// ---------------------------------------------------------------------------------------------
console.log('\n=== 4. Checagem estática — DashboardView usa a competência fechada nos cards de guia ===');
{
  const src = readFileSync('src/components/Dashboard/DashboardView.tsx', 'utf-8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const code = strip(src);

  assert(code.includes('revenueCompetence: fiscalBase.referenceCompetency'), 'DAS: revenueCompetence é a MESMA competência da alíquota (fiscalBase.referenceCompetency), não competenceStr');
  assert(!/revenueCompetence:\s*competenceStr/.test(code), 'regressão: nenhum lugar volta a usar competenceStr (mês em andamento) como base do DAS');
  assert(code.includes('getLastClosedCompetence') && code.includes('dueCompetenceStr'), 'IRPF: usa getLastClosedCompetence (mesma função da tela Motores) para o mês do Carnê-Leão devido');
  assert(code.includes('cpfTaxDue') && code.includes('cpfTaxDue.carneLeaoEstimated') && code.includes('cpfTaxDue.effectiveTaxRate'), 'card do IRPF usa cpfTaxDue (mês fechado), não cpfTax (mês corrente)');
  assert(code.includes('const cpfTax = useMemo') && code.includes('cpfTax.grossRevenueReceived'), 'cpfTax (mês corrente, ao vivo) continua existindo e alimentando o painel de Limite de Isenção');
  assert(code.includes('totalTaxesEstimated = cpfTaxDue.carneLeaoEstimated + cnpjTax.dasEstimated'), 'total consolidado (hero "Resultado Líquido") soma as DUAS guias da competência fechada, coerente com o resto do card ser Realizado (Caixa)');
  assert(/Carnê-Leão \(PF\)<\/span>\s*\n\s*<span[^>]*>\{formatCurrency\(cpfTaxDue\.carneLeaoEstimated\)\}/.test(code), 'banner "Consolidação Tributária Híbrida" mostra o MESMO valor do card de IRPF (cpfTaxDue), sem número divergente na mesma tela');
  assert(code.includes('Sobre {fiscalBaseLabel}') || code.includes('Sobre Ago'), 'rótulo do DAS informa de qual competência veio o faturamento (não fica implícito)');
  assert(code.includes('Sobre recebimentos de {dueCompetenceLabel}'), 'rótulo do IRPF informa de qual competência veio o recebimento');
  assert(code.includes('Faturamento em {fiscalBaseLabel} (NFS-e)'), '"Faturamento no Mês" foi renomeado para deixar claro que é da competência fechada, não do mês selecionado na tela');
}

console.log(`\n${passed} verificações passaram.`);
