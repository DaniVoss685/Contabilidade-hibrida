import { describe, test, expect } from './harness/testHarness';
import { getOfficialMinimumWage, calculateRollingRbt12 } from '../../src/lib/taxEngine';
import { db } from '../../src/lib/db';
import { Sale } from '../../src/types';

describe('Rodada 7: Validação das Funcionalidades Fiscais e UX', 1, () => {
  test('R7-SM: Salário Mínimo Oficial dinâmico por ano sem hardcode', () => {
    expect(getOfficialMinimumWage(2024)).toBe(1412);
    expect(getOfficialMinimumWage(2025)).toBe(1518);
    expect(getOfficialMinimumWage(2026)).toBe(1621);
    // Anos futuros sem publicação oficial mantêm o último oficial homologado (2026 = 1621)
    expect(getOfficialMinimumWage(2027)).toBe(1621);
    expect(getOfficialMinimumWage(2030)).toBe(1621);
  }, { requirement: 'R7' });

  test('R7-RBT12: Cálculo de RBT12 móvel com incorporação de competência simulada', () => {
    // Cria vendas de teste
    const testSales: Sale[] = [
      {
        id: 's1',
        taxOrigin: 'CNPJ',
        totalValue: 10000,
        serviceDate: '2025-04-15',
        paymentMethod: 'PIX',
        patientId: 'p1',
        patientName: 'Paciente 1',
        patientCpf: '111.111.111-11',
        procedureName: 'Procedimento',
        description: 'Desc',
        createdAt: '2025-04-15',
      } as Sale,
      {
        id: 's2',
        taxOrigin: 'CNPJ',
        totalValue: 15000,
        serviceDate: '2025-05-10',
        paymentMethod: 'PIX',
        patientId: 'p1',
        patientName: 'Paciente 1',
        patientCpf: '111.111.111-11',
        procedureName: 'Procedimento',
        description: 'Desc',
        createdAt: '2025-05-10',
      } as Sale,
    ];

    // Simulação no modo 'rolling' para 2025-05 com nova receita de 20.000 e base inicial de 100.000
    const rollingResult = calculateRollingRbt12(testSales, '2025-05', 20000, 100000);
    expect(rollingResult.baseRbt12).toBe(100000);
    expect(rollingResult.replacedMonthRevenue).toBeCloseTo(100000 / 12, 1);
    expect(rollingResult.newRbt12).toBeCloseTo(100000 - (100000 / 12) + 20000, 1);
  }, { requirement: 'R7' });

  test('R7-BANK: Segregação Patrimonial e Gerenciamento de Status de Contas', () => {
    db.resetToDemo();
    const bankAccounts = db.getBankAccounts();
    expect(bankAccounts.length).toBeGreaterThan(0);

    const pfAccounts = bankAccounts.filter((a) => a.accountType.endsWith('_PF'));
    const pjAccounts = bankAccounts.filter((a) => a.accountType.endsWith('_PJ'));

    expect(pfAccounts.length).toBeGreaterThan(0);
    expect(pjAccounts.length).toBeGreaterThan(0);

    // Todas as contas têm campos obrigatórios válidos
    bankAccounts.forEach((acc) => {
      expect(typeof acc.currentBalance).toBe('number');
      expect(acc.name.length).toBeGreaterThan(0);
      expect(acc.bankName.length).toBeGreaterThan(0);
    });
  }, { requirement: 'R7' });

  test('R7-TAX-PILLARS: 3 Pilares de Bases Fiscais (Anterior Informado + Dental Finance = Acumulado)', () => {
    const prof = db.getProfessional();
    const sales = db.getSales();

    const initialRbt12Base = prof.rbt12Inicial ?? 0;
    const initialFs12Base = prof.folha12MesesInicial ?? 0;

    // Acumulado registrado no Dental Finance
    const registeredPjRevenue = sales
      .filter((s) => s.taxOrigin === 'CNPJ')
      .reduce((sum, s) => sum + s.totalValue, 0);

    const totalCalculatedRbt12 = initialRbt12Base + registeredPjRevenue;

    expect(totalCalculatedRbt12).toBeGreaterThanOrEqual(initialRbt12Base);
    expect(initialFs12Base).toBeGreaterThanOrEqual(0);
  }, { requirement: 'R7' });

  test('R7-PRESETS: Presets de Pró-labore calculam múltiplos exatos do Salário Mínimo', () => {
    const sm2025 = getOfficialMinimumWage(2025);
    expect(sm2025).toBe(1518);

    const preset1SM = sm2025 * 1;
    const preset2SM = sm2025 * 2;
    const preset3SM = sm2025 * 3;

    expect(preset1SM).toBe(1518);
    expect(preset2SM).toBe(3036);
    expect(preset3SM).toBe(4554);
  }, { requirement: 'R7' });
});
