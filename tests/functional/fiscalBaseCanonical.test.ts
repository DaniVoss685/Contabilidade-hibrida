// Fonte canônica da base fiscal (RBT12 / FS12 / Fator R / Anexo / alíquota).
// Bug real (Odonto Minas): o Dashboard lia rbt12Inicial/folha12MesesInicial do cadastro (0 no modo Contaju) e
// classificava Anexo V / 15,5% / DAS R$ 1.110,37, enquanto a tela Motores lia os snapshots oficiais (68,1% / Anexo III / 6%).
// Aqui testamos o MESMO código que Dashboard, Motores, Simulador, Relatórios e DRE usam.
// Rodar com: npx tsx tests/functional/fiscalBaseCanonical.test.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  addMonthsToCompetency,
  computeSnapshotWindow,
  estimateSimplesFromBase,
  factorRBadgeLabel,
  formatCompetencyShortName,
  getLatestClosedFiscalCompetency,
  lastClosedCalendarCompetency,
  resolveFiscalBase,
  type ResolveFiscalBaseInput,
} from '../../src/lib/fiscalBase';
import {
  DEFAULT_SIMPLES_ANNEX_III,
  DEFAULT_TAX_RULES_SIMPLES,
  calculateSimplesForParameters,
  calculateSimplesNacionalMonthlyTax,
  isFatorRAtOrAboveThreshold,
} from '../../src/lib/taxEngine';
import { ContabilexIntegrationService } from '../../src/services/contabilexIntegrationService';
import {
  getFiscalContabilexState,
  loadFiscalContabilex,
  publishFiscalContabilex,
  resetFiscalStore,
} from '../../src/services/fiscalBaseStore';
import { buildAnnualDre } from '../../src/lib/financialEngine';
import { DEFAULT_TAX_RULES_PF } from '../../src/lib/taxEngine';
import type { ContabilexSnapshotPayload } from '../../src/types/contabilexIntegration';
import type { Sale } from '../../src/types';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------- dados reais da Odonto Minas (Contaju)
function snap(competency: string, gross: number, payrollBase: number, rate: number | null = 6): ContabilexSnapshotPayload {
  return {
    id: `snap_${competency}`,
    contabilex_client_id: 'cli',
    dental_tenant_id: 'clinic_1790017750_be6b',
    competency,
    gross_revenue: gross,
    payroll_total: payrollBase,
    pro_labore: null,
    fgts: null,
    inss: null,
    irrf: null,
    factor_r_payroll_base: payrollBase,
    das_total: null,
    effective_rate: rate,
    version: 1,
    status: 'PUBLISHED',
    content_hash: 'h',
    published_at: '2026-09-21T19:34:29Z',
    updated_at: '2026-09-21T19:34:29Z',
    source: 'contabilex',
  };
}
const ODONTO_SNAPSHOTS: ContabilexSnapshotPayload[] = [
  snap('2026-04', 0, 0, 0),
  snap('2026-05', 0, 2929.27, 0),
  snap('2026-06', 5830.2, 3721.81),
  snap('2026-07', 9396.2, 3721.81),
  snap('2026-08', 12152.0, 3721.81),
];

// professional do Odonto Minas: modo CONTABILEX, baseline true, e RBT12/FS12 locais ZERADOS (a causa do bug)
const ODONTO_PROFESSIONAL = {
  fiscalSourceType: 'CONTABILEX' as const,
  baselineConfigured: true,
  rbt12Inicial: 0,
  folha12MesesInicial: 0,
  initialFiscalHistory: undefined,
};

function input(over: Partial<ResolveFiscalBaseInput> = {}): ResolveFiscalBaseInput {
  return {
    todayStr: '2026-09-25',
    professional: ODONTO_PROFESSIONAL,
    contabilex: { loaded: true, linkStatus: 'ACTIVE', snapshots: ODONTO_SNAPSHOTS },
    sales: [],
    payrollHistory: [],
    taxRules: DEFAULT_TAX_RULES_SIMPLES[2026],
    year: 2026,
    ...over,
  };
}

function cnpjSale(serviceDate: string, value: number): Sale {
  return { id: `s_${serviceDate}_${value}`, taxOrigin: 'CNPJ', serviceDate, totalValue: value } as unknown as Sale;
}

async function main() {
  // ================================================================ FACTOR-01
  console.log('\n— FACTOR-01: base oficial da Odonto Minas');
  const base = resolveFiscalBase(input());
  assert(base.status === 'AVAILABLE', 'com snapshots oficiais e vínculo ativo a base está DISPONÍVEL (mesmo com rbt12Inicial local = 0)');
  assert(near(base.rbt12, 15226.4), `RBT12 = R$ 15.226,40 (obtido ${base.rbt12})`);
  assert(near(base.fs12, 10372.89), `FS12 = R$ 10.372,89 (obtido ${base.fs12})`);
  assert(base.factorRPercent !== null && near(base.factorRPercent, 68.12, 0.05), `Fator R ≈ 68,1% (obtido ${base.factorRPercent?.toFixed(2)})`);
  assert(base.annex === 'ANEXO_III' && base.isAnexoIII === true, 'Enquadramento: ANEXO III (68,1% >= 28%)');
  assert(base.effectiveRate !== null && near(base.effectiveRate, 6, 0.0001), 'alíquota efetiva 6,0% (faixa 1 do Anexo III, calculada pelo motor)');
  assert(base.bracketNumber === 1, 'faixa 1');
  assert(factorRBadgeLabel(base) === 'Acima de 28%', 'selo do Fator R: "Acima de 28%" (nunca "Abaixo de 28%")');
  assert(base.competenciesCount === 4 && base.isPartialHistory, 'janela usou 4 competências anteriores a Ago (histórico parcial, sem completar meses com R$ 0)');

  // O caminho da tela Motores (competência explícita = a fechada) e o do Dashboard (sem override) dão o MESMO resultado
  const motores = resolveFiscalBase(input({ referenceCompetencyOverride: '2026-08' }));
  const numeric = (b: typeof base) => JSON.stringify([b.rbt12, b.fs12, b.factorR, b.annex, b.effectiveRate, b.referenceCompetency, b.bracketNumber]);
  assert(numeric(motores) === numeric(base), 'Dashboard e Motores resolvem exatamente a mesma base (RBT12, FS12, Fator R, Anexo, alíquota, competência)');

  // O service legado (usado pela tela Motores) delega para a mesma janela
  const legacy = ContabilexIntegrationService.calculateFactorR(ODONTO_SNAPSHOTS, '2026-08');
  assert(near(legacy.rbt12, base.rbt12) && near(legacy.fs12, base.fs12) && legacy.annex === base.annex, 'ContabilexIntegrationService.calculateFactorR entrega o mesmo RBT12/FS12/anexo (janela única)');
  assert(near(legacy.factorRPercent, 68.12, 0.01), 'calculateFactorR: fator R 68,12%');

  // ================================================================ DAS
  console.log('\n— DAS estimado (setembro, base de agosto)');
  const sepSales = [cnpjSale('2026-09-03', 4000), cnpjSale('2026-09-18', 3163.7), cnpjSale('2026-08-20', 999)];
  const est = estimateSimplesFromBase(base, { sales: sepSales, revenueCompetence: '2026-09', year: 2026, taxRules: DEFAULT_TAX_RULES_SIMPLES[2026] });
  assert(est.available && near(est.monthlyRevenueNfse, 7163.7), `faturamento do MÊS OPERACIONAL (set/2026) = R$ 7.163,70 (obtido ${est.monthlyRevenueNfse})`);
  assert(near(est.dasEstimated, 429.82, 0.005), `DAS estimado = 7.163,70 × 6,0% = R$ 429,82 (obtido ${est.dasEstimated.toFixed(3)})`);
  assert(!near(est.dasEstimated, 1110.37, 1), 'o DAS NÃO é mais R$ 1.110,37 (7.163,70 × 15,5%)');
  assert(est.effectiveAnnex === 'ANEXO_III' && near(est.effectiveTaxRate, 6, 0.0001), 'a estimativa usa Anexo III / 6,0%');

  // ================================================================ FACTOR-02/03/04 — limiar
  console.log('\n— Limiar 28%');
  const manualAt = (rbt: number, fs: number) => resolveFiscalBase(input({
    professional: { fiscalSourceType: 'MANUAL_TOTAL', baselineConfigured: true, rbt12Inicial: rbt, folha12MesesInicial: fs, initialFiscalHistory: undefined },
  }));
  const b2799 = manualAt(10000, 2799);
  const b2800 = manualAt(10000, 2800);
  const b2801 = manualAt(10000, 2801);
  assert(b2799.annex === 'ANEXO_V' && factorRBadgeLabel(b2799) === 'Abaixo de 28%', 'FACTOR-02: 27,99% → Anexo V');
  assert(b2800.annex === 'ANEXO_III' && b2800.isAnexoIII === true, 'FACTOR-03: 28,00% → Anexo III (>= 28, não > 28)');
  assert(b2801.annex === 'ANEXO_III', 'FACTOR-04: 28,01% → Anexo III');
  assert(factorRBadgeLabel(b2800) === 'No limite de 28%' && factorRBadgeLabel(b2801) === 'Acima de 28%', 'selo: exatamente 28,00% = "No limite"; 28,01% = "Acima"');
  const e2799 = calculateSimplesForParameters(10000, 2799, 1000, 2026);
  const e2800 = calculateSimplesForParameters(10000, 2800, 1000, 2026);
  assert(!e2799.isAnexoIII && e2800.isAnexoIII, 'o próprio motor calculateSimplesForParameters respeita o limiar (27,99 V / 28,00 III)');
  // 28% exato em centavos nunca pode virar 27,999…% por ponto flutuante
  let floatFailures = 0;
  for (let k = 1; k <= 20000; k++) {
    const rbt = (25 * k) / 100; // 25k centavos
    const fsExact = (7 * k) / 100; // 7k centavos = exatamente 28%
    const fsBelow = (7 * k - 1) / 100;
    if (!isFatorRAtOrAboveThreshold(fsExact, rbt)) floatFailures++;
    if (isFatorRAtOrAboveThreshold(fsBelow, rbt)) floatFailures++;
  }
  assert(floatFailures === 0, '20.000 pares em centavos: 28,00% exato sempre Anexo III e 1 centavo abaixo sempre Anexo V (sem erro de ponto flutuante)');

  // ================================================================ FACTOR-05 — base oficial sem dados locais
  console.log('\n— FACTOR-05: base oficial + Dashboard sem dados locais');
  const noLocal = resolveFiscalBase(input({ sales: [], payrollHistory: [], professional: { ...ODONTO_PROFESSIONAL, rbt12Inicial: 0, folha12MesesInicial: 0 } }));
  assert(noLocal.status === 'AVAILABLE' && near(noLocal.rbt12, 15226.4), 'sem vendas/folha/rbt12Inicial locais, usa a base oficial (precedência do Contaju)');
  // e o cálculo LOCAL antigo, com os mesmos zeros, dava exatamente o bug relatado:
  const oldDashboard = calculateSimplesNacionalMonthlyTax(sepSales, '2026-09', 2026, DEFAULT_TAX_RULES_SIMPLES[2026], [], 0, 0);
  assert(oldDashboard.effectiveAnnex === 'ANEXO_V' && near(oldDashboard.effectiveTaxRate, 15.5, 0.001) && near(oldDashboard.dasEstimated, 1110.37, 0.01), 'reprodução do bug: cálculo local com zeros dava Anexo V / 15,5% / DAS R$ 1.110,37');

  // ================================================================ FACTOR-06 — nunca zero silencioso
  console.log('\n— FACTOR-06: base indisponível NÃO vira Anexo V');
  const stateChecks: Array<[string, ResolveFiscalBaseInput, string]> = [
    ['ainda carregando', input({ contabilex: { loaded: false, linkStatus: null, snapshots: [] } }), 'LOADING'],
    ['vínculo Contaju não ativo', input({ contabilex: { loaded: true, linkStatus: 'PENDING', snapshots: [] } }), 'UNAVAILABLE'],
    ['sem competências publicadas', input({ contabilex: { loaded: true, linkStatus: 'ACTIVE', snapshots: [] } }), 'UNAVAILABLE'],
    ['erro na leitura sem dado anterior', input({ contabilex: { loaded: true, loadError: true, linkStatus: null, snapshots: [] } }), 'UNAVAILABLE'],
    ['janela sem receita (RBT12 = 0)', input({ contabilex: { loaded: true, linkStatus: 'ACTIVE', snapshots: [snap('2026-04', 0, 0, 0), snap('2026-05', 0, 2929.27, 0), snap('2026-06', 0, 0, 0)] } }), 'INSUFFICIENT'],
    ['manual não configurado', input({ professional: { fiscalSourceType: 'MANUAL_TOTAL', baselineConfigured: false, rbt12Inicial: 0, folha12MesesInicial: 0, initialFiscalHistory: undefined } }), 'UNAVAILABLE'],
  ];
  for (const [label, inp, expectedStatus] of stateChecks) {
    const b = resolveFiscalBase(inp);
    assert(b.status === expectedStatus, `${label}: estado explícito ${expectedStatus}`);
    assert(b.annex === null && b.isAnexoIII === null && b.factorR === null && b.effectiveRate === null, `${label}: NÃO classifica anexo, fator R nem alíquota`);
    assert(b.reasonMessage !== null && b.reasonMessage.length > 0, `${label}: traz mensagem explicável para a UI`);
    const est2 = estimateSimplesFromBase(b, { sales: sepSales, revenueCompetence: '2026-09', year: 2026 });
    assert(!est2.available && est2.effectiveAnnex === null && est2.dasEstimated === 0, `${label}: estimativa marcada como INDISPONÍVEL (não é um DAS calculado sobre zeros)`);
    assert(factorRBadgeLabel(b) !== 'Abaixo de 28%', `${label}: selo nunca diz "Abaixo de 28%"`);
    assert(Number.isFinite(b.rbt12) && Number.isFinite(b.fs12), `${label}: sem NaN/Infinity`);
  }
  const insufficient = resolveFiscalBase(stateChecks[4][1]);
  assert(near(insufficient.fs12, 2929.27) && insufficient.rbt12 === 0, 'RBT12 = 0 com FS12 > 0: divisão por zero tratada explicitamente (sem NaN/Infinity)');

  // erro de leitura COM dado anterior mantém o último dado bom (não zera)
  const keepsLastGood = resolveFiscalBase(input({ contabilex: { loaded: true, loadError: true, linkStatus: 'ACTIVE', snapshots: ODONTO_SNAPSHOTS } }));
  assert(keepsLastGood.status === 'AVAILABLE' && near(keepsLastGood.rbt12, 15226.4), 'falha ao atualizar mantém a última base oficial conhecida (não cai em zero)');

  // ================================================================ COMP-01 / COMP-02
  console.log('\n— COMP: competência operacional × competência fiscal fechada');
  const sep = resolveFiscalBase(input({ todayStr: '2026-09-25' }));
  assert(sep.referenceCompetency === '2026-08', 'COMP-01: hoje é setembro/2026 → base fiscal de AGOSTO/2026');
  assert(formatCompetencyShortName(sep.referenceCompetency) === 'Ago/2026', 'rótulo curto "Ago/2026"');
  const sepEst = estimateSimplesFromBase(sep, { sales: sepSales, revenueCompetence: '2026-09', year: 2026, taxRules: DEFAULT_TAX_RULES_SIMPLES[2026] });
  assert(near(sepEst.monthlyRevenueNfse, 7163.7), 'COMP-01: o faturamento continua sendo o de SETEMBRO (mês operacional intocado)');
  assert(lastClosedCalendarCompetency('2026-09-25') === '2026-08', 'último mês civil encerrado = agosto');

  const withSep = [...ODONTO_SNAPSHOTS, snap('2026-09', 20000, 6000)];
  const oct = resolveFiscalBase(input({ todayStr: '2026-10-03', contabilex: { loaded: true, linkStatus: 'ACTIVE', snapshots: withSep } }));
  assert(oct.referenceCompetency === '2026-09', 'COMP-02: setembro publicado e hoje outubro → base de SETEMBRO/2026');
  assert(near(oct.rbt12, 15226.4 + 12152), 'COMP-02: a janela de setembro passa a incluir agosto (Abr–Ago)');

  const octNoSep = resolveFiscalBase(input({ todayStr: '2026-10-03' }));
  assert(octNoSep.referenceCompetency === '2026-08' && near(octNoSep.rbt12, 15226.4), 'COMP-03: outubro SEM snapshot de setembro publicado → continua em AGOSTO (última competência oficial disponível; não assume o mês anterior)');
  const octStale = resolveFiscalBase(input({
    todayStr: '2026-10-03',
    contabilex: { loaded: true, linkStatus: 'ACTIVE', snapshots: ODONTO_SNAPSHOTS.filter((s) => s.competency <= '2026-07') },
  }));
  assert(octStale.referenceCompetency === '2026-07', 'sem publicações após julho, continua na última competência oficial disponível (não assume o mês anterior)');
  assert(getLatestClosedFiscalCompetency({ todayStr: '2026-09-25', officialSnapshots: ODONTO_SNAPSHOTS }) === '2026-08', 'resolvedor canônico: agosto');
  assert(getLatestClosedFiscalCompetency({ todayStr: '2026-09-25', officialSnapshots: [] }) === '2026-08', 'sem base oficial cai no último mês civil encerrado (manual)');
  assert(getLatestClosedFiscalCompetency({ todayStr: '2026-09-25', officialSnapshots: [...ODONTO_SNAPSHOTS, snap('2026-09', 1, 1)] }) === '2026-08', 'nunca usa uma competência ainda em andamento, mesmo que exista snapshot dela');
  assert(getLatestClosedFiscalCompetency({ todayStr: '2027-01-10', officialSnapshots: [] }) === '2026-12', 'virada de ano: janeiro → dezembro do ano anterior');
  assert(addMonthsToCompetency('2026-01', -1) === '2025-12' && addMonthsToCompetency('2026-12', 1) === '2027-01', 'aritmética de competências na virada do ano');

  // override inválido (ex.: seletor "todos os meses" = "2026") cai na resolução canônica
  const allMonths = resolveFiscalBase(input({ referenceCompetencyOverride: '2026' }));
  assert(allMonths.referenceCompetency === '2026-08' && allMonths.status === 'AVAILABLE', 'competência escolhida inválida ("2026") usa a última fechada em vez de RBT12 = 0');
  const chosen = resolveFiscalBase(input({ referenceCompetencyOverride: '2026-07' }));
  assert(chosen.referenceCompetency === '2026-07' && near(chosen.rbt12, 5830.2), 'Motores com competência escolhida (jul): janela anterior a julho');

  // ================================================================ faixas futuras
  console.log('\n— Cálculo por faixa preservado');
  const big = manualAt(300000, 99000); // 33% → Anexo III, faixa 2
  const bigRange = DEFAULT_SIMPLES_ANNEX_III[1];
  const expectedRate = ((300000 * bigRange.nominalRate - bigRange.deduction) / 300000) * 100;
  assert(big.annex === 'ANEXO_III' && big.bracketNumber === 2 && near(big.effectiveRate!, expectedRate, 1e-9), `RBT12 R$ 300 mil no Anexo III → faixa 2, alíquota efetiva ${expectedRate.toFixed(4)}% (não fixa em 6%)`);
  const bigV = manualAt(300000, 60000); // 20% → Anexo V faixa 2
  assert(bigV.annex === 'ANEXO_V' && bigV.bracketNumber === 2, 'RBT12 R$ 300 mil com Fator R 20% → Anexo V faixa 2');

  // ================================================================ modos manuais — regressão
  console.log('\n— Modos manuais: sem regressão');
  const manualTotal = resolveFiscalBase(input({
    professional: { fiscalSourceType: 'MANUAL_TOTAL', baselineConfigured: true, rbt12Inicial: 280000, folha12MesesInicial: 84000, initialFiscalHistory: undefined },
  }));
  const legacyLocal = calculateSimplesNacionalMonthlyTax(sepSales, '2026-08', 2026, DEFAULT_TAX_RULES_SIMPLES[2026], [], 280000, 84000, undefined, true);
  assert(manualTotal.status === 'AVAILABLE' && manualTotal.source === 'MANUAL_TOTAL', 'total consolidado configurado → base manual disponível');
  assert(near(manualTotal.rbt12, legacyLocal.rbt12) && near(manualTotal.fs12, legacyLocal.fs12) && manualTotal.annex === legacyLocal.effectiveAnnex && near(manualTotal.effectiveRate!, legacyLocal.effectiveTaxRate, 1e-9),
    'base manual = mesmo resultado do motor local que as clínicas manuais já usavam');
  const startup = resolveFiscalBase(input({
    professional: { fiscalSourceType: 'MANUAL_TOTAL', baselineConfigured: true, rbt12Inicial: 0, folha12MesesInicial: 0, initialFiscalHistory: undefined },
  }));
  assert(startup.status === 'AVAILABLE' && startup.startOfActivity, 'manual configurado com zeros = "início de atividade" (regra vigente preservada, sem inventar valores)');

  // ================================================================ DRE anual (financialEngine)
  console.log('\n— DRE: tributos do Simples usam a mesma base');
  const dreProfessional = { ...ODONTO_PROFESSIONAL, numDependentes: 0, inssProprioMensal: 0 } as any;
  const dreSales = [cnpjSale('2026-09-10', 10000)];
  const dreWith = buildAnnualDre(2026, dreSales, [], DEFAULT_TAX_RULES_PF[2026], DEFAULT_TAX_RULES_SIMPLES[2026], dreProfessional, [], 'ALL', base);
  const sepCol = dreWith.months[8];
  assert(near(sepCol.cnpjTaxes, 600, 0.001), `DRE set/2026: DAS = 10.000 × 6,0% = R$ 600,00 (obtido ${sepCol.cnpjTaxes})`);
  assert(dreWith.simplesBaseUnavailable === false, 'DRE com base disponível: sem aviso');
  const dreLegacy = buildAnnualDre(2026, dreSales, [], DEFAULT_TAX_RULES_PF[2026], DEFAULT_TAX_RULES_SIMPLES[2026], dreProfessional, []);
  assert(near(dreLegacy.months[8].cnpjTaxes, 1550, 0.001), 'sem a base canônica (chamada legada) o DRE mantém o cálculo antigo — 15,5% sobre RBT12 zerado (era o bug)');
  const loadingBase = resolveFiscalBase(input({ contabilex: { loaded: false, linkStatus: null, snapshots: [] } }));
  const dreLoading = buildAnnualDre(2026, dreSales, [], DEFAULT_TAX_RULES_PF[2026], DEFAULT_TAX_RULES_SIMPLES[2026], dreProfessional, [], 'ALL', loadingBase);
  assert(dreLoading.months[8].cnpjTaxes === 0 && dreLoading.simplesBaseUnavailable === true && !!dreLoading.simplesBaseReason, 'DRE com base indisponível: DAS não é calculado sobre zeros e o resumo sinaliza o motivo');
  const dreCpfOnly = buildAnnualDre(2026, dreSales, [], DEFAULT_TAX_RULES_PF[2026], DEFAULT_TAX_RULES_SIMPLES[2026], dreProfessional, [], 'CPF', loadingBase);
  assert(dreCpfOnly.simplesBaseUnavailable === false, 'filtro só-CPF não acusa base do Simples indisponível');

  // ================================================================ isolamento por clínica (store)
  console.log('\n— Troca de clínica: nunca reaproveita a base do tenant anterior');
  resetFiscalStore();
  const realFetch = globalThis.fetch;
  const tenantData: Record<string, { status: string; snapshots: any[] }> = {
    clinic_A: { status: 'ACTIVE', snapshots: ODONTO_SNAPSHOTS.map((s) => ({ ...s, dental_tenant_id: 'clinic_A' })) },
    clinic_B: { status: 'ACTIVE', snapshots: [{ ...snap('2026-07', 50000, 5000), dental_tenant_id: 'clinic_B' }] },
    clinic_C: { status: 'PENDING', snapshots: [] },
  };
  const delays: Record<string, number> = { clinic_A: 60, clinic_B: 5, clinic_C: 5 };
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = new URL(String(input));
    const body = init.body ? JSON.parse(init.body) : {};
    let payload: any = [];
    let tenant = '';
    if (url.pathname.endsWith('/integration_client_links')) {
      tenant = (url.searchParams.get('dental_tenant_id') || '').replace('eq.', '');
      const d = tenantData[tenant];
      payload = d ? [{ id: 'l', dental_tenant_id: tenant, status: d.status, cnpj: '0', requested_at: '', linked_at: '', last_sync_at: '', created_at: '', updated_at: '', clinic_name: null, contabilex_client_id: null }] : [];
    } else if (url.pathname.endsWith('/rpc/get_dental_tenant_snapshots')) {
      tenant = body.p_dental_tenant_id;
      payload = tenantData[tenant]?.snapshots ?? [];
    }
    await new Promise((r) => setTimeout(r, delays[tenant] ?? 1));
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as any;

  try {
    const slowA = loadFiscalContabilex('clinic_A'); // resposta lenta de A
    assert(getFiscalContabilexState('clinic_A')?.status === 'LOADING', 'clínica A começa em LOADING');
    assert(getFiscalContabilexState('clinic_B') === null, 'clínica B ainda sem estado (não herda o de A)');
    await loadFiscalContabilex('clinic_B'); // usuário troca para B; B responde antes de A
    const stB = getFiscalContabilexState('clinic_B')!;
    assert(stB.status === 'READY' && stB.snapshots.length === 1 && stB.snapshots[0].dental_tenant_id === 'clinic_B', 'clínica B recebe SÓ os snapshots de B');
    await slowA; // a resposta atrasada de A chega depois
    const stA = getFiscalContabilexState('clinic_A')!;
    assert(stA.snapshots.length === 5 && stA.snapshots.every((s) => s.dental_tenant_id === 'clinic_A'), 'a resposta atrasada de A grava só em A');
    assert(getFiscalContabilexState('clinic_B')!.snapshots.length === 1, 'e não sobrescreve B');

    const baseA = resolveFiscalBase(input({ contabilex: { loaded: true, linkStatus: stA.link!.status, snapshots: stA.snapshots } }));
    const baseB = resolveFiscalBase(input({ contabilex: { loaded: true, linkStatus: stB.link!.status, snapshots: stB.snapshots }, referenceCompetencyOverride: '2026-08' }));
    assert(near(baseA.rbt12, 15226.4), 'Odonto Minas (A): RBT12 R$ 15.226,40');
    assert(near(baseB.rbt12, 50000) && baseB.annex !== baseA.annex, 'outra clínica (B): RBT12 e enquadramento próprios — nada da A');

    await loadFiscalContabilex('clinic_C');
    const baseC = resolveFiscalBase(input({ contabilex: { loaded: true, linkStatus: getFiscalContabilexState('clinic_C')!.link!.status, snapshots: getFiscalContabilexState('clinic_C')!.snapshots } }));
    assert(baseC.status === 'UNAVAILABLE' && baseC.annex === null, 'clínica sem vínculo ativo: base indisponível, sem herdar a A/B');

    // voltar para A mostra A imediatamente (cache por tenant), sem F5
    const back = resolveFiscalBase(input({ contabilex: { loaded: getFiscalContabilexState('clinic_A')!.status !== 'LOADING', linkStatus: getFiscalContabilexState('clinic_A')!.link!.status, snapshots: getFiscalContabilexState('clinic_A')!.snapshots } }));
    assert(near(back.rbt12, 15226.4) && back.annex === 'ANEXO_III', 'A → B → A: volta com a base da A instantaneamente');

    // publicação vinda de outra tela (Motores) atualiza o mesmo cache
    publishFiscalContabilex('clinic_A', stA.link, [...stA.snapshots, { ...snap('2026-09', 1, 1), dental_tenant_id: 'clinic_A' }]);
    assert(getFiscalContabilexState('clinic_A')!.snapshots.length === 6, 'publishFiscalContabilex mantém Motores e Dashboard sincronizados');

    // dado recente não é relido a cada montagem de tela; dado envelhecido (> 60 s) é relido em segundo plano
    let calls = 0;
    const countingFetch = globalThis.fetch;
    globalThis.fetch = (async (i: any, init: any) => { calls++; return (countingFetch as any)(i, init); }) as any;
    await loadFiscalContabilex('clinic_B');
    assert(calls === 0, 'dado recente: nenhuma nova leitura ao montar outra tela');
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    await loadFiscalContabilex('clinic_B');
    Date.now = realNow;
    assert(calls > 0 && getFiscalContabilexState('clinic_B')!.status === 'READY', 'dado envelhecido é relido e continua READY (sem piscar em LOADING)');
    globalThis.fetch = countingFetch;

    // falha de rede: mantém o último dado bom e sinaliza o erro
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as any;
    await loadFiscalContabilex('clinic_A', { force: true });
    const errState = getFiscalContabilexState('clinic_A')!;
    assert(errState.status === 'ERROR' && errState.snapshots.length === 6, 'falha de leitura: estado ERROR, sem apagar a última base conhecida');
  } finally {
    globalThis.fetch = realFetch;
    resetFiscalStore();
  }

  // ================================================================ estático: sem motores concorrentes nas telas
  console.log('\n— Estático: todas as telas consomem a fonte canônica');
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const dashboard = strip(read('src/components/Dashboard/DashboardView.tsx'));
  const reports = strip(read('src/components/Reports/ReportsView.tsx'));
  const taxes = strip(read('src/components/Taxes/TaxesView.tsx'));
  const simulator = strip(read('src/components/Simulator/FiscalSimulatorView.tsx'));
  const financial = strip(read('src/components/Financial/FinancialDashboard.tsx'));
  const engine = strip(read('src/lib/financialEngine.ts'));
  assert(/useFiscalBase\(/.test(dashboard) && !/calculateSimplesNacionalMonthlyTax/.test(dashboard), 'Dashboard usa useFiscalBase e não chama o motor local direto');
  assert(/useFiscalBase\(/.test(reports) && !/calculateSimplesNacionalMonthlyTax/.test(reports), 'Relatórios usam useFiscalBase');
  assert(/resolveFiscalBase\(/.test(taxes) && !/calculateSimplesNacionalMonthlyTax/.test(taxes), 'Motores usa resolveFiscalBase (mesma função) e não chama o motor local direto');
  assert(/useFiscalBase\(/.test(simulator) && !/professional\.rbt12Inicial/.test(simulator), 'Simulador parte da base canônica (não de professional.rbt12Inicial)');
  assert(/useFiscalBase\(/.test(financial) && /fiscalBase/.test(engine), 'DRE recebe a base canônica');
  assert(!/Anexo III \(6%~\)|Anexo V \(15\.5%~\)/.test(dashboard), 'Dashboard não tem 6% / 15,5% escritos no componente');
  assert(!/'0,0%'/.test(dashboard), 'Dashboard não exibe "0,0%" como fallback de Fator R');
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
