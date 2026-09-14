import { describe, test, expect } from './harness/testHarness';
import { db } from '../../src/lib/db';
import { parseAndFormatTyping } from '../../src/components/UI/CurrencyInput';
import {
  getRolling12Months,
  computeRolling12MonthsData,
  calculateSimplesForParameters,
  calculateMonthlyPfTax,
} from '../../src/lib/taxEngine';
import fs from 'fs';
import path from 'path';

describe('Rodada 12: Simplificação das Configurações, Onboarding Fiscal Correto, Base Móvel de 12 Meses e CurrencyInput Definitivo', 1, () => {
  // Test 1: CurrencyInput Natural Typing, Erasure and Paste Handling
  test('R12-CURRENCY-NATURAL-INPUT: Digitação Natural da Esquerda para Direita e Apagar Completo', () => {
    // 1. Apagar tudo (Backspace / Ctrl+A) -> display vazio e numérico 0
    const emptyRes = parseAndFormatTyping('');
    expect(emptyRes.display).toBe('');
    expect(emptyRes.numeric).toBe(0);

    const whitespaceRes = parseAndFormatTyping('   ');
    expect(whitespaceRes.display).toBe('');
    expect(whitespaceRes.numeric).toBe(0);

    // 2. Digitação inteira da esquerda para a direita sem forçar ,00 prematuro
    expect(parseAndFormatTyping('1').display).toBe('1');
    expect(parseAndFormatTyping('1').numeric).toBe(1);

    expect(parseAndFormatTyping('12').display).toBe('12');
    expect(parseAndFormatTyping('12').numeric).toBe(12);

    expect(parseAndFormatTyping('125').display).toBe('125');
    expect(parseAndFormatTyping('125').numeric).toBe(125);

    expect(parseAndFormatTyping('1250').display).toBe('1.250');
    expect(parseAndFormatTyping('1250').numeric).toBe(1250);

    // 3. Digitação com vírgula e centavos
    expect(parseAndFormatTyping('1250,').display).toBe('1.250,');
    expect(parseAndFormatTyping('1250,5').display).toBe('1.250,5');
    expect(parseAndFormatTyping('1250,5').numeric).toBe(1250.5);

    expect(parseAndFormatTyping('1250,50').display).toBe('1.250,50');
    expect(parseAndFormatTyping('1250,50').numeric).toBe(1250.5);

    // Ignora além de 2 casas decimais sem crash
    expect(parseAndFormatTyping('1250,509').display).toBe('1.250,50');
    expect(parseAndFormatTyping('1250,509').numeric).toBe(1250.5);

    // 4. Paste com máscara monetária ou ponto decimal
    const pasteFormatted = parseAndFormatTyping('R$ 2.450,75');
    expect(pasteFormatted.display).toBe('2.450,75');
    expect(pasteFormatted.numeric).toBe(2450.75);

    const pasteDot = parseAndFormatTyping('3500.25');
    expect(pasteDot.display).toBe('3.500,25');
    expect(pasteDot.numeric).toBe(3500.25);
  }, { requirement: 'R12' });

  // Test 2: Settings View strictly with 5 fields and removal of redundant fields & selects
  test('R12-SETTINGS-5-FIELDS-ONLY: Configurações Enxutas com 5 Campos e Sem Select de Regime/Anexo', () => {
    const settingsPath = path.join(process.cwd(), 'src', 'components', 'Settings', 'SettingsView.tsx');
    const settingsCode = fs.readFileSync(settingsPath, 'utf-8');

    // 1. Estritamente os 5 campos aprovados
    expect(settingsCode.includes('Nome do Cirurgião-Dentista *')).toBe(true);
    expect(settingsCode.includes('Nome da Clínica *')).toBe(true);
    expect(settingsCode.includes('Número do CRO *')).toBe(true);
    expect(settingsCode.includes('UF do CRO *')).toBe(true);
    expect(settingsCode.includes('Especialidade Principal *')).toBe(true);

    // 2. Remoção de campos desnecessários de Dados Profissionais
    expect(settingsCode.includes('Razão Social (PJ)')).toBe(false);
    expect(settingsCode.includes('Telefone / WhatsApp')).toBe(false);
    expect(settingsCode.includes('Município da Clínica')).toBe(false);
    expect(settingsCode.includes('UF da Clínica')).toBe(false);
    expect(settingsCode.includes('E-mail Profissional')).toBe(false);

    // 3. Remoção de selects de Regime Tributário e Anexo
    expect(settingsCode.includes('<select value={regimeTributario}')).toBe(false);
    expect(settingsCode.includes('<select value={anexoSimples}')).toBe(false);

    // 4. Card explicativo somente leitura de Simples Nacional + Fator R automático
    expect(settingsCode.includes('Simples Nacional (Atividades Odontológicas)')).toBe(true);
    expect(settingsCode.includes('Calculado automaticamente pelo Fator R')).toBe(true);
    expect(settingsCode.includes('O Dental Finance apura o Fator R dinamicamente')).toBe(true);
  }, { requirement: 'R12' });

  // Test 3: Zero Fictitious Values in Clean Tenants and Tax Engine
  test('R12-NO-FICTITIOUS-VALUES: Sem Valores Fictícios (280k/84k) e Baseline Pendente Limpa', async () => {
    const email = `clean_r12_${Date.now()}@clinica.com.br`;
    const reg = await db.createAccount({
      email,
      password: 'SenhaSegura@2026',
      termsAccepted: true,
    });
    expect(reg.success).toBe(true);

    const prof = db.getProfessional();
    expect(prof.baselineConfigured).toBe(false);
    expect(prof.rbt12Inicial).toBe(0);
    expect(prof.folha12MesesInicial).toBe(0);
    expect(prof.initialFiscalHistory).toEqual([]);

    // Motor de cálculo com 0 não inventa 280k ou 84k
    const calc = calculateSimplesForParameters(0, 0, 10000, 2026);

    expect(calc.rbt12).toBe(0);
    expect(calc.fs12).toBe(0);
    expect(calc.fatorR).toBe(0);
    // Sem folha -> Anexo V
    expect(calc.effectiveAnnex).toBe('ANEXO_V');
    expect(calc.isAnexoIII).toBe(false);
  }, { requirement: 'R12' });

  // Test 4: Initial Monthly Fiscal History (12 Months Table + Shortcut)
  test('R12-MONTHLY-FISCAL-HISTORY: Histórico Inicial de 12 Meses e Atalho Início de Atividade', async () => {
    // 1. Salvar histórico de 12 meses preenchidos
    const sampleEntries = [
      { month: '2025-03', cnpjRevenue: 10000, payroll: 3000 },
      { month: '2025-04', cnpjRevenue: 12000, payroll: 3500 },
      { month: '2025-05', cnpjRevenue: 15000, payroll: 4000 },
      { month: '2025-06', cnpjRevenue: 11000, payroll: 3000 },
      { month: '2025-07', cnpjRevenue: 14000, payroll: 4000 },
      { month: '2025-08', cnpjRevenue: 16000, payroll: 4500 },
      { month: '2025-09', cnpjRevenue: 13000, payroll: 3500 },
      { month: '2025-10', cnpjRevenue: 17000, payroll: 5000 },
      { month: '2025-11', cnpjRevenue: 18000, payroll: 5000 },
      { month: '2025-12', cnpjRevenue: 20000, payroll: 6000 },
      { month: '2026-01', cnpjRevenue: 19000, payroll: 5500 },
      { month: '2026-02', cnpjRevenue: 21000, payroll: 6000 },
    ];

    const sumRevenue = sampleEntries.reduce((acc, e) => acc + e.cnpjRevenue, 0); // 186.000
    const sumPayroll = sampleEntries.reduce((acc, e) => acc + e.payroll, 0);     // 53.000

    db.saveInitialFiscalHistory(sampleEntries);

    const updatedProf = db.getProfessional();
    expect(updatedProf.baselineConfigured).toBe(true);
    expect(updatedProf.rbt12Inicial).toBe(sumRevenue);
    expect(updatedProf.folha12MesesInicial).toBe(sumPayroll);
    expect(db.getInitialFiscalHistory().length).toBe(12);

    // 2. Testar atalho Sem histórico anterior (início de atividade)
    db.setZeroFiscalHistory('2026-03');
    const zeroProf = db.getProfessional();
    expect(zeroProf.baselineConfigured).toBe(true);
    expect(zeroProf.rbt12Inicial).toBe(0);
    expect(zeroProf.folha12MesesInicial).toBe(0);
    const zeroHistory = db.getInitialFiscalHistory();
    expect(zeroHistory.length).toBe(12);
    expect(zeroHistory.every(e => e.cnpjRevenue === 0 && e.payroll === 0)).toBe(true);
  }, { requirement: 'R12' });

  // Test 5: Competency Payroll Registration
  test('R12-MONTHLY-PAYROLL-SECTION: Registro de Folha e Pró-labore por Competência', () => {
    const comp = '2026-03';
    db.upsertMonthlyPayroll({
      month: comp,
      proLabore: 5000,
      salaries: 3000,
      charges: 840,
      totalPayroll: 8840,
    });

    const payroll = db.getMonthlyPayroll(comp);
    expect(payroll).toBeDefined();
    expect(payroll?.proLabore).toBe(5000);
    expect(payroll?.salaries).toBe(3000);
    expect(payroll?.charges).toBe(840);
    expect(payroll?.totalPayroll).toBe(8840);
  }, { requirement: 'R12' });

  // Test 6: Rolling 12 Months Computation
  test('R12-ROLLING-WINDOW-COMPUTATION: Janela Móvel dos 12 Meses Anteriores sem Mes Atual', () => {
    const months = getRolling12Months('2026-03');
    expect(months.length).toBe(12);
    expect(months[0]).toBe('2025-03');
    expect(months[11]).toBe('2026-02');
    expect(months.includes('2026-03')).toBe(false);

    // Janela móvel combinando histórico inicial
    const initialEntries = months.map(m => ({
      month: m,
      cnpjRevenue: 10000,
      payroll: 3000,
    }));
    db.saveInitialFiscalHistory(initialEntries);

    const rolling = computeRolling12MonthsData([], '2026-03', [], initialEntries, 0, 0);
    expect(rolling.totalRbt12).toBe(120000);
    expect(rolling.totalFs12).toBe(36000);
    expect(rolling.fatorR).toBe(0.3); // 30% -> Anexo III
    expect(rolling.months.length).toBe(12);
  }, { requirement: 'R12' });

  // Test 7: Strict Segregation Between PF (Carne-Leão) and PJ (Simples Nacional)
  test('R12-SEPARATION-PF-PJ: Segregação Rigorosa das Deduções PF e Impostos PJ', () => {
    // 1. Atualizar deduções de PF não afeta as bases de PJ
    db.updateProfessional({
      numDependentes: 3,
      inssProprioMensal: 800,
    });

    const prof = db.getProfessional();
    expect(prof.numDependentes).toBe(3);
    expect(prof.inssProprioMensal).toBe(800);

    // Cálculo do Simples Nacional não inclui dependentes ou inssProprioMensal
    const simplesCalc = calculateSimplesForParameters(120000, 36000, 20000, 2026);
    expect(simplesCalc.effectiveAnnex).toBe('ANEXO_III'); // Fator R = 30% >= 28%
    expect(simplesCalc.isAnexoIII).toBe(true);
    expect(simplesCalc.dasEstimated).toBe(1200);

    // Cálculo do Carnê-Leão (PF) considera dependentes e INSS configurados no profissional
    const mockSalePf: any = {
      id: 's_pf_1',
      date: '2026-03-05',
      totalValue: 10000,
      taxOrigin: 'CPF',
      installments: [
        {
          id: 'inst_pf_1',
          number: 1,
          value: 10000,
          amountReceived: 10000,
          dueDate: '2026-03-05',
          paymentDate: '2026-03-05',
          status: 'RECEBIDO',
        },
      ],
    };

    const carneCalc = calculateMonthlyPfTax(
      '2026-03',
      [mockSalePf],
      [],
      prof
    );

    // Base de cálculo realizada deduz dependentes e INSS
    expect(carneCalc.taxableBaseRealized).toBeLessThan(10000);
    expect(carneCalc.effectiveDeductions).toBeGreaterThan(0);
    expect(carneCalc.receivedGrossCpf).toBe(10000);
  }, { requirement: 'R12' });
});
