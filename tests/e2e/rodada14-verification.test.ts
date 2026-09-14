import { describe, test, expect } from './harness/testHarness';
import { db } from '../../src/lib/db';
import {
  computeRolling12MonthsData,
  calculateSimplesNacionalMonthlyTax,
  getRolling12Months,
} from '../../src/lib/taxEngine';
import { DEFAULT_SIMPLES_ANNEX_III, DEFAULT_SIMPLES_ANNEX_V, DEFAULT_TAX_RULES_SIMPLES } from '../../src/lib/taxEngine';
import fs from 'fs';
import path from 'path';

describe('Rodada 14: Base Fiscal Flexivel, Login Minimalista, Demo em Dev e Preparacao Contabilex', 1, () => {
  // Test 1: Tipos e Modos de Origem Fiscal
  test('R14-FISCAL-MODES-DISCOVERY: Suporte aos Tres Modos de Origem Fiscal', async () => {
    const freshTenant = db.getProfessional();
    expect(freshTenant).toBeDefined();

    // Novo tenant limpo
    const email = `dentista_r14_${Date.now()}@clinica.com.br`;
    const acc = await db.createAccount({
      email,
      password: 'SenhaForteR14@2026',
      termsAccepted: true,
    });
    expect(acc.success).toBe(true);

    const prof = db.getProfessional();
    expect(prof.baselineConfigured).toBe(false);
    expect(prof.fiscalSourceType).toBeUndefined();
    expect(Array.isArray(prof.fiscalSnapshots)).toBe(true);
  }, { requirement: 'R14' });

  // Test 2: Modo MANUAL_TOTAL (Consolidado sem invencao de meses divididos por 12)
  test('R14-MANUAL-TOTAL-CONSOLIDATED: Apuracao em Tempo Real e Sem Parcelas Ficticias', async () => {
    // Definir bases consolidadas: RBT12 = R$ 300.000,00, FS12 = R$ 75.000,00, Pro-labore = R$ 5.000,00
    db.saveInitialFiscalTotal(300000, 75000, 5000, '2026-05');

    const prof = db.getProfessional();
    expect(prof.baselineConfigured).toBe(true);
    expect(prof.fiscalSourceType).toBe('MANUAL_TOTAL');
    expect(prof.rbt12Inicial).toBe(300000);
    expect(prof.folha12MesesInicial).toBe(75000);
    expect(prof.proLaboreMensal).toBe(5000);

    // Verificar historico de snapshots
    expect(prof.fiscalSnapshots).toBeDefined();
    expect(prof.fiscalSnapshots.length).toBeGreaterThanOrEqual(1);
    const lastSnap = prof.fiscalSnapshots[prof.fiscalSnapshots.length - 1];
    expect(lastSnap.sourceType).toBe('MANUAL_TOTAL');
    expect(lastSnap.rbt12).toBe(300000);
    expect(lastSnap.fs12).toBe(75000);

    // Motor Fiscal: computeRolling12MonthsData NAO divide por 12 gerando meses ficticios
    const rolling = computeRolling12MonthsData(
      [],
      '2026-05',
      [],
      prof.initialFiscalHistory,
      prof.rbt12Inicial,
      prof.folha12MesesInicial,
      true // isConsolidated
    );

    expect(rolling.isConsolidatedTotal).toBe(true);
    expect(rolling.months.length).toBe(0); // Nenhum mes ficticio inventado
    expect(rolling.totalRbt12).toBe(300000);
    expect(rolling.totalFs12).toBe(75000);

    // Fator R = 75.000 / 300.000 = 25% (< 28% -> Anexo V)
    const taxV = calculateSimplesNacionalMonthlyTax(
      [],
      '2026-05',
      2026,
      DEFAULT_TAX_RULES_SIMPLES[2026],
      [],
      prof.rbt12Inicial,
      prof.folha12MesesInicial,
      prof.initialFiscalHistory,
      true
    );

    expect(taxV.rbt12).toBe(300000);
    expect(taxV.fs12).toBe(75000);
    expect(Math.round(taxV.fatorRPercent)).toBe(25);
    expect(taxV.isAnexoIII).toBe(false);

    // Ajustar para FS12 = R$ 84.000,00 -> 84.000 / 300.000 = 28% (>= 28% -> Anexo III)
    db.saveInitialFiscalTotal(300000, 84000, 7000, '2026-05');
    const taxIII = calculateSimplesNacionalMonthlyTax(
      [],
      '2026-05',
      2026,
      DEFAULT_TAX_RULES_SIMPLES[2026],
      [],
      300000,
      84000,
      undefined,
      true
    );
    expect(taxIII.fatorRPercent).toBeGreaterThanOrEqual(28);
    expect(taxIII.isAnexoIII).toBe(true);
  }, { requirement: 'R14' });

  // Test 3: Modo Detalhado Mes a Mes (MANUAL_MONTHLY)
  test('R14-MANUAL-MONTHLY-DETAIL: Janela Movel com 12 Competencias Reais', () => {
    const windowMonths = getRolling12Months('2026-05');
    expect(windowMonths.length).toBe(12);

    const detailedEntries = windowMonths.map((m, idx) => ({
      month: m,
      cnpjRevenue: 20000 + idx * 1000,
      payroll: 6000,
    }));

    db.saveInitialFiscalHistory(detailedEntries, '2026-05');
    const prof = db.getProfessional();
    expect(prof.fiscalSourceType).toBe('MANUAL_MONTHLY');
    expect(prof.initialFiscalHistory).toBeDefined();
    expect(prof.initialFiscalHistory?.length).toBe(12);

    const rolling = computeRolling12MonthsData(
      [],
      '2026-05',
      [],
      prof.initialFiscalHistory,
      prof.rbt12Inicial,
      prof.folha12MesesInicial,
      false // detailed mode
    );

    expect(rolling.isConsolidatedTotal).toBe(false);
    expect(rolling.months.length).toBe(12);
    expect(rolling.totalFs12).toBe(12 * 6000);
  }, { requirement: 'R14' });

  // Test 4: Transicao Entre Modos sem Perda Silenciosa de Dados
  test('R14-FISCAL-MODE-TRANSITION: Troca de Modo Mantem Historico de Snapshots', () => {
    const initialSnaps = db.getProfessional().fiscalSnapshots.length;

    db.switchFiscalMode('MANUAL_TOTAL');
    let prof = db.getProfessional();
    expect(prof.fiscalSourceType).toBe('MANUAL_TOTAL');

    db.switchFiscalMode('MANUAL_MONTHLY');
    prof = db.getProfessional();
    expect(prof.fiscalSourceType).toBe('MANUAL_MONTHLY');

    // Snapshots continuam preservados
    expect(prof.fiscalSnapshots.length).toBeGreaterThanOrEqual(initialSnaps);
  }, { requirement: 'R14' });

  // Test 5: Preparacao Contabilex
  test('R14-CONTABILEX-PREPARATION: Metadados do Sistema Contabilex e CNPJ', () => {
    const taxesViewPath = path.join(process.cwd(), 'src', 'components', 'Taxes', 'TaxesView.tsx');
    const taxesContent = fs.readFileSync(taxesViewPath, 'utf-8');

    expect(taxesContent.includes('app-contaju.vercel.app')).toBe(true);
    expect(taxesContent.includes('Em preparação')).toBe(true);
    expect(taxesContent.includes('Escritório Contaju LTDA')).toBe(true);
  }, { requirement: 'R14' });

  // Test 6: Login Minimalista Centralizado e Sem Termos Tecnicos
  test('R14-MINIMALIST-LOGIN-CLEAN: Layout Centralizado, Sem Split-Screen e Sem Marketing', () => {
    const loginViewPath = path.join(process.cwd(), 'src', 'components', 'Auth', 'LoginView.tsx');
    const loginContent = fs.readFileSync(loginViewPath, 'utf-8');

    // 1. Nao deve conter split-screen com colunas lg:w-1/2 de marketing
    expect(loginContent.includes('lg:w-1/2 bg-gradient-to-br from-slate-900')).toBe(false);

    // 2. Nao deve conter termos tecnicos ou versao tecnica
    expect(loginContent.includes('Versão 2.5')).toBe(false);
    expect(loginContent.includes('PBKDF2')).toBe(false);
    expect(loginContent.includes('HMAC-SHA-256')).toBe(false);
    expect(loginContent.includes('salts de 16 bytes')).toBe(false);

    // 3. Deve conter o rodape oficial da Contaju
    expect(loginContent.includes('© 2026 Escritório Contaju LTDA — CNPJ 66.281.288/0001-28')).toBe(true);
    expect(loginContent.includes('Todos os direitos reservados.')).toBe(true);
  }, { requirement: 'R14' });

  // Test 7: Demo Restrito Estritamente a Desenvolvimento
  test('R14-DEMO-ENVIRONMENT-GUARD: Demo Condicionado a Ambiente de Desenvolvimento', () => {
    const loginViewPath = path.join(process.cwd(), 'src', 'components', 'Auth', 'LoginView.tsx');
    const loginContent = fs.readFileSync(loginViewPath, 'utf-8');

    // Verifica que o demo esta condicionado a isDev / import.meta.env.DEV
    expect(loginContent.includes('isDev &&')).toBe(true);
    expect(loginContent.includes('Ambiente de desenvolvimento •')).toBe(true);
    expect(loginContent.includes('Entrar Demo')).toBe(true);

    // Garante que nao ha card fixo e chamativo de Modo Demonstracao fora de isDev
    expect(loginContent.includes('Pronto para teste')).toBe(false);
  }, { requirement: 'R14' });
});
