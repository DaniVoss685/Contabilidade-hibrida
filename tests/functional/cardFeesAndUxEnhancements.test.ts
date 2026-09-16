import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  calculateCpfMonthlyTax,
  calculateMonthlyPfTax,
  DEFAULT_TAX_RULES_PF,
} from '../../src/lib/taxEngine';
import {
  mapDbPreferencesToApp,
  mapAppPreferencesToDb,
} from '../../src/lib/supabaseClient';
import { Sale, Expense, Professional, SystemPreferences, CardFeeSettings } from '../../src/types';

describe('Suíte Funcional: 5 Melhorias de UX e Lógica de Negócio', () => {

  // ========================================================
  // REQUISITO 1: Remoção da aba Despesas Recorrentes na Sidebar
  // ========================================================
  it('1. A aba Despesas Recorrentes deve ter sido removida da Sidebar', () => {
    const sidebarPath = path.resolve(process.cwd(), 'src/components/Layout/Sidebar.tsx');
    const content = fs.readFileSync(sidebarPath, 'utf-8');

    assert.strictEqual(
      content.includes("id: 'recurrent_expenses'"),
      false,
      'A aba recurrent_expenses não deve constar na Sidebar'
    );
    assert.strictEqual(
      content.includes('Despesas Recorrentes'),
      false,
      'O rótulo Despesas Recorrentes não deve constar na navegação da Sidebar'
    );
  });

  // ========================================================
  // REQUISITO 2: Filtro de Receitas/Vendas estritamente pela data da venda (serviceDate)
  // ========================================================
  it('2. Venda parcelada em 5x em setembro deve constar em Vendas apenas em setembro, enquanto as parcelas ficam no Contas a Receber', () => {
    const sale = {
      id: 'sale-sept-5x',
      orgId: 'org_clinic_1',
      patientId: 'pat-1',
      patientName: 'Maria Silva',
      procedureName: 'Prótese Fixa',
      serviceDate: '2026-09-16',
      totalValue: 5000,
      paymentMethod: 'CARTAO_CREDITO' as const,
      taxOrigin: 'CPF' as const,
      installmentsCount: 5,
      createdAt: '2026-09-16T10:00:00Z',
      patientCpf: '12345678901',
      payerIsBeneficiary: true,
      description: 'Venda Teste',
      installments: [
        {
          id: 'inst-1',
          saleId: 'sale-sept-5x',
          installmentNumber: 1,
          totalInstallments: 5,
          value: 1000,
          dueDate: '2026-09-16',
          status: 'A_RECEBER',
        },
        {
          id: 'inst-2',
          saleId: 'sale-sept-5x',
          installmentNumber: 2,
          totalInstallments: 5,
          value: 1000,
          dueDate: '2026-10-16',
          status: 'A_RECEBER',
        },
        {
          id: 'inst-3',
          saleId: 'sale-sept-5x',
          installmentNumber: 3,
          totalInstallments: 5,
          value: 1000,
          dueDate: '2026-11-16',
          status: 'A_RECEBER',
        },
        {
          id: 'inst-4',
          saleId: 'sale-sept-5x',
          installmentNumber: 4,
          totalInstallments: 5,
          value: 1000,
          dueDate: '2026-12-16',
          status: 'A_RECEBER',
        },
        {
          id: 'inst-5',
          saleId: 'sale-sept-5x',
          installmentNumber: 5,
          totalInstallments: 5,
          value: 1000,
          dueDate: '2027-01-16',
          status: 'A_RECEBER',
        },
      ],
    } as unknown as Sale;

    const allSales = [sale];

    const filterSalesByMonth = (salesList: Sale[], year: number, month: number | 'ALL') => {
      if (month === 'ALL') {
        const yearPrefix = year + '-';
        return salesList.filter((s) => s.serviceDate && s.serviceDate.startsWith(yearPrefix));
      }
      const periodPrefix = year + '-' + String(month).padStart(2, '0');
      return salesList.filter((s) => s.serviceDate && s.serviceDate.startsWith(periodPrefix));
    };

    const septSales = filterSalesByMonth(allSales, 2026, 9);
    assert.strictEqual(septSales.length, 1, 'A venda de setembro deve aparecer em setembro');
    assert.strictEqual(septSales[0].id, 'sale-sept-5x');

    const octSales = filterSalesByMonth(allSales, 2026, 10);
    assert.strictEqual(octSales.length, 0, 'A venda de setembro NÃO deve aparecer na lista de vendas de outubro');

    const novSales = filterSalesByMonth(allSales, 2026, 11);
    assert.strictEqual(novSales.length, 0, 'A venda de setembro NÃO deve aparecer na lista de vendas de novembro');

    const octReceivables = sale.installments.filter((i) => i.dueDate.startsWith('2026-10'));
    assert.strictEqual(octReceivables.length, 1, 'A parcela 2 deve constar no Contas a Receber de outubro');
    assert.strictEqual(octReceivables[0].value, 1000);
  });

  // ========================================================
  // REQUISITO 3: Configuração de Taxas de Cartão/Maquininha
  // ========================================================
  it('3. Mapeamento de preferências deve persistir e carregar taxas de cartão (débito e 1x a 12x) perfeitamente', () => {
    const cardFeesConfig: CardFeeSettings = {
      debit: 1.49,
      credit: {
        1: 2.99,
        2: 3.49,
        3: 3.99,
        4: 4.49,
        5: 4.99,
        6: 5.49,
        7: 5.99,
        8: 6.49,
        9: 6.99,
        10: 7.49,
        11: 7.99,
        12: 8.49,
      },
    };

    const appPrefs: SystemPreferences = {
      alertFatorR: true,
      alertDueDates: true,
      operationalReminders: false,
      hideCpf: false,
      lunchBreakEnabled: true,
      lunchBreakStart: '12:00',
      lunchBreakEnd: '13:30',
      cardFees: cardFeesConfig,
    };

    const dbPayload = mapAppPreferencesToDb(appPrefs, 'test-clinic');
    assert.deepStrictEqual(dbPayload.card_fees, cardFeesConfig);

    const restoredApp = mapDbPreferencesToApp({
      ...dbPayload,
      clinic_id: 'test-clinic',
      id: 'pref-1',
    });

    assert.ok(restoredApp.cardFees);
    assert.strictEqual(restoredApp.cardFees.debit, 1.49);
    assert.strictEqual(restoredApp.cardFees.credit?.[5], 4.99);
    assert.strictEqual(restoredApp.cardFees.credit?.[12], 8.49);
  });

  // ========================================================
  // REQUISITO 4: Limite Mensal de Isenção de IRPF no Dashboard
  // ========================================================
  it('4. Deve calcular corretamente o limite mensal de isenção de IRPF e o saldo restante', () => {
    // Cenário 1: 2026 sem faturamento e com R$ 1.000 de livro caixa pago
    const salesCen1: Sale[] = [];
    const expensesCen1: Expense[] = [
      {
        id: 'exp-1',
        description: 'Material Odontológico',
        value: 1000,
        paymentDate: '2026-09-10',
        status: 'PAGO',
        entity: 'CPF',
        dedutivelLivroCaixaPf: 'SIM',
        categoryId: 'cat_insumos',
      } as unknown as Expense,
    ];

    const res1 = calculateCpfMonthlyTax(salesCen1, expensesCen1, '2026-09', 2026, DEFAULT_TAX_RULES_PF[2026], 1, 600);

    assert.ok(res1.exemptionLimitMonthly >= 5000, 'Limite mensal deve ser no mínimo R$ 5.000,00 para 2026');
    assert.strictEqual(res1.isExemptionLimitReached, false, 'Com faturamento zero, não atingiu o limite');
    assert.strictEqual(res1.remainingExemptionBalance, res1.exemptionLimitMonthly, 'Saldo restante deve ser o limite total');
    assert.strictEqual(res1.carneLeaoEstimated, 0, 'IRPF estimado deve ser zero');

    // Cenário 2: Faturamento de R$ 4.000 recebido (abaixo do teto de isenção de 5.000)
    const salesCen2: Sale[] = [
      {
        id: 'sale-1',
        serviceDate: '2026-09-05',
        totalValue: 4000,
        taxOrigin: 'CPF',
        installments: [
          {
            id: 'inst-1',
            saleId: 'sale-1',
            installmentNumber: 1,
            totalInstallments: 1,
            value: 4000,
            amountReceived: 4000,
            dueDate: '2026-09-05',
            paymentDate: '2026-09-05',
            status: 'RECEBIDO',
          },
        ],
      } as unknown as Sale,
    ];

    const res2 = calculateCpfMonthlyTax(salesCen2, [], '2026-09', 2026, DEFAULT_TAX_RULES_PF[2026], 0, 0);
    assert.strictEqual(res2.exemptionLimitMonthly, 5000);
    assert.strictEqual(res2.grossRevenueReceived, 4000);
    assert.strictEqual(res2.remainingExemptionBalance, 1000);
    assert.strictEqual(res2.isExemptionLimitReached, false);
    assert.strictEqual(res2.carneLeaoEstimated, 0, 'Até R$ 5.000,00 em 2026 o IRPF é zero');

    // Cenário 3: Faturamento recebido de R$ 8.000 (acima do teto de isenção)
    const salesCen3: Sale[] = [
      {
        id: 'sale-2',
        serviceDate: '2026-09-10',
        totalValue: 8000,
        taxOrigin: 'CPF',
        installments: [
          {
            id: 'inst-2',
            saleId: 'sale-2',
            installmentNumber: 1,
            totalInstallments: 1,
            value: 8000,
            amountReceived: 8000,
            dueDate: '2026-09-10',
            paymentDate: '2026-09-10',
            status: 'RECEBIDO',
          },
        ],
      } as unknown as Sale,
    ];

    const res3 = calculateCpfMonthlyTax(salesCen3, [], '2026-09', 2026, DEFAULT_TAX_RULES_PF[2026], 0, 0);
    assert.strictEqual(res3.isExemptionLimitReached, true, 'Deve indicar que o limite foi atingido');
    assert.strictEqual(res3.remainingExemptionBalance, 0, 'Não há saldo restante de isenção');
    assert.ok(res3.carneLeaoEstimated > 0, 'Deve gerar IRPF a recolher para R$ 8.000');
  });

  // ========================================================
  // REQUISITO 5: Previsão de Término no Agendamento
  // ========================================================
  it('5. Deve calcular com exatidão a previsão de término baseada no horário de início e na duração clínica', () => {
    function calculateEndTime(start: string, durationMinutes: number): string {
      if (!start) return '';
      const [h, m] = start.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return '';
      const totalMin = h * 60 + m + durationMinutes;
      const endH = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      return String(endH).padStart(2, '0') + ':' + String(endM).padStart(2, '0');
    }

    assert.strictEqual(calculateEndTime('09:00', 50), '09:50');
    assert.strictEqual(calculateEndTime('08:30', 45), '09:15');
    assert.strictEqual(calculateEndTime('11:45', 30), '12:15');
    assert.strictEqual(calculateEndTime('14:00', 90), '15:30');
    assert.strictEqual(calculateEndTime('16:20', 80), '17:40');
  });
});
