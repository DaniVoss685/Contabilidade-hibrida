import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCarneLeaoMensal, selectCarneLeaoScenario } from '../../src/lib/carneLeaoCalculation';
import { calculateCpfMonthlyTax } from '../../src/lib/taxEngine';
import type { Expense, Sale } from '../../src/types';

function calculate(input: Partial<Parameters<typeof calculateCarneLeaoMensal>[0]> & { taxableIncome: number }) {
  return calculateCarneLeaoMensal({
    year: 2026,
    month: 1,
    livroCaixaExpensesPaid: 0,
    previousLivroCaixaExcess: 0,
    deductibleInss: 0,
    deductibleDependents: 0,
    ...input,
  });
}

function cpfSale(id: string, receivedAt: string, amount: number, taxOrigin: 'CPF' | 'CNPJ' = 'CPF'): Sale {
  return {
    id,
    orgId: 'org-test',
    taxOrigin,
    patientId: 'patient-test',
    patientName: 'Paciente teste',
    patientCpf: '00000000000',
    payerIsBeneficiary: true,
    procedureName: 'Procedimento',
    description: 'Receita teste',
    totalValue: amount,
    serviceDate: receivedAt,
    paymentMethod: 'PIX' as any,
    installmentsCount: 1,
    createdAt: receivedAt,
    installments: [{
      id: `${id}-installment`,
      saleId: id,
      installmentNumber: 1,
      totalInstallments: 1,
      value: amount,
      amountReceived: amount,
      dueDate: receivedAt,
      paymentDate: receivedAt,
      status: 'RECEBIDO',
      fiscalClassification: 'TRIBUTAVEL',
    }],
  } as Sale;
}

function paidBookCashExpense(id: string, paymentDate: string, amount: number): Expense {
  return {
    id,
    orgId: 'org-test',
    supplierName: 'Fornecedor teste',
    supplierCpfCnpj: '',
    description: 'Material clínico',
    categoryId: 'materials',
    categoryCode: '01',
    categoryName: 'Materiais',
    value: amount,
    competenceDate: paymentDate,
    dueDate: paymentDate,
    paymentDate,
    entity: 'CPF',
    dedutivelLivroCaixaPf: 'SIM',
    impactaFatorRPj: false,
    despesaOperacionalPj: false,
    status: 'PAGO',
    createdAt: paymentDate,
  } as Expense;
}

function pendingBookCashExpense(id: string, dueDate: string, amount: number): Expense {
  const expense = paidBookCashExpense(id, dueDate, amount);
  expense.status = 'A_PAGAR';
  expense.paymentDate = undefined;
  return expense;
}

function pendingCpfSale(id: string, dueDate: string, amount: number): Sale {
  const sale = cpfSale(id, dueDate, amount);
  sale.installments[0].status = 'PENDENTE';
  sale.installments[0].paymentDate = undefined;
  sale.installments[0].amountReceived = 0;
  return sale;
}

describe('Motor mensal do Carnê-Leão 2026', () => {
  it('trata receita zero e valores negativos sem gerar base, dedução ou imposto negativos', () => {
    const zero = calculate({ taxableIncome: 0 });
    assert.equal(zero.baseCalculo, 0);
    assert.equal(zero.impostoTabela, 0);
    assert.equal(zero.impostoFinal, 0);

    const negative = calculate({
      taxableIncome: -100,
      livroCaixaExpensesPaid: -300,
      previousLivroCaixaExcess: -200,
      deductibleInss: -50,
    });
    assert.equal(negative.rendimentosTributaveis, 0);
    assert.equal(negative.deducoesLegais, 0);
    assert.equal(negative.baseCalculo, 0);
    assert.equal(negative.impostoFinal, 0);
  });

  it('aplica o desconto simplificado e a redução integral no cenário de R$ 5.000,00', () => {
    const result = calculate({ taxableIncome: 5000 });
    assert.equal(result.tipoDeducaoEscolhida, 'DESCONTO_SIMPLIFICADO');
    assert.equal(result.descontoSimplificado, 607.2);
    assert.equal(result.deducaoAplicada, 607.2);
    assert.equal(result.baseCalculo, 4392.8);
    assert.equal(result.impostoTabela, 312.89);
    assert.equal(result.reducaoEspecial, 312.89);
    assert.equal(result.impostoFinal, 0);
  });

  it('usa rendimentos tributáveis para selecionar as faixas de redução, incluindo os limites exatos', () => {
    const atFiveThousand = calculate({ taxableIncome: 5000 });
    const justAboveFiveThousand = calculate({ taxableIncome: 5000.01 });
    const partial = calculate({ taxableIncome: 6000 });
    const atUpperLimit = calculate({ taxableIncome: 7350 });
    const aboveUpperLimit = calculate({ taxableIncome: 7350.01 });

    assert.equal(atFiveThousand.faixaReducao2026, 'INTEGRAL');
    assert.equal(justAboveFiveThousand.faixaReducao2026, 'PARCIAL');
    assert.equal(partial.faixaReducao2026, 'PARCIAL');
    assert.equal(partial.reducaoEspecial, 179.75);
    assert.equal(atUpperLimit.faixaReducao2026, 'PARCIAL');
    assert.equal(atUpperLimit.reducaoEspecial, 0);
    assert.equal(aboveUpperLimit.faixaReducao2026, 'SEM_REDUCAO');
    assert.equal(aboveUpperLimit.reducaoEspecial, 0);
  });

  it('limita o Livro Caixa ao rendimento do mês e conserva separadamente disponível, utilizado e excesso', () => {
    const belowIncome = calculate({ taxableIncome: 5000, livroCaixaExpensesPaid: 500 });
    assert.equal(belowIncome.livroCaixaDisponivel, 500);
    assert.equal(belowIncome.livroCaixaUtilizado, 500);
    assert.equal(belowIncome.excessoLivroCaixaProximoMes, 0);

    const equalIncome = calculate({ taxableIncome: 5000, livroCaixaExpensesPaid: 5000 });
    assert.equal(equalIncome.livroCaixaUtilizado, 5000);
    assert.equal(equalIncome.excessoLivroCaixaProximoMes, 0);

    const aboveIncome = calculate({ taxableIncome: 3500, livroCaixaExpensesPaid: 3800 });
    assert.equal(aboveIncome.livroCaixaDisponivel, 3800);
    assert.equal(aboveIncome.livroCaixaUtilizado, 3500);
    assert.equal(aboveIncome.excessoLivroCaixaProximoMes, 300);
    assert.equal(aboveIncome.deducoesLegais, 3500);
    assert.equal(aboveIncome.tipoDeducaoEscolhida, 'DEDUCOES_LEGAIS');
    assert.equal(aboveIncome.baseCalculo, 0);
    assert.equal(aboveIncome.impostoTabela, 0);
    assert.equal(aboveIncome.impostoFinal, 0);
  });

  it('carrega excesso para o mês seguinte dentro do mesmo ano e não leva dezembro para janeiro', () => {
    const january = calculateCpfMonthlyTax(
      [cpfSale('jan-income', '2026-01-15', 1500)],
      [paidBookCashExpense('jan-expense', '2026-01-20', 4900)],
      '2026-01', 2026, undefined, 0, 0
    );
    assert.equal(january.livroCaixaUsed, 1500);
    assert.equal(january.excessLivroCaixaNext, 3400);

    const february = calculateCpfMonthlyTax(
      [
        cpfSale('jan-income', '2026-01-15', 1500),
        cpfSale('feb-income', '2026-02-15', 8370),
      ],
      [
        paidBookCashExpense('jan-expense', '2026-01-20', 4900),
        paidBookCashExpense('feb-expense', '2026-02-20', 5000),
      ],
      '2026-02', 2026, undefined, 0, 0
    );
    assert.equal(february.excessLivroCaixaPrevious, 3400);
    assert.equal(february.livroCaixaAvailable, 8400);
    assert.equal(february.livroCaixaUsed, 8370);
    assert.equal(february.excessLivroCaixaNext, 30);
    assert.equal(february.taxBase, 0);

    const december = calculateCpfMonthlyTax(
      [cpfSale('dec-income', '2026-12-15', 200)],
      [paidBookCashExpense('dec-expense', '2026-12-20', 1000)],
      '2026-12', 2026, undefined, 0, 0
    );
    assert.equal(december.excessLivroCaixaClosedAtYearEnd, 800);

    const nextJanuary = calculateCpfMonthlyTax(
      [cpfSale('next-jan-income', '2027-01-15', 500)],
      [],
      '2027-01', 2027, undefined, 0, 0
    );
    assert.equal(nextJanuary.excessLivroCaixaPrevious, 0);
  });

  it('seleciona o maior entre deduções legais completas e desconto simplificado, sem somá-los', () => {
    const bookCashIsBetter = calculate({ taxableIncome: 8000, livroCaixaExpensesPaid: 3800 });
    assert.equal(bookCashIsBetter.deducoesLegais, 3800);
    assert.equal(bookCashIsBetter.descontoSimplificado, 607.2);
    assert.equal(bookCashIsBetter.tipoDeducaoEscolhida, 'DEDUCOES_LEGAIS');
    assert.equal(bookCashIsBetter.baseCalculo, 4200);
    assert.equal(bookCashIsBetter.faixaReducao2026, 'SEM_REDUCAO');
    assert.equal(bookCashIsBetter.reducaoEspecial, 0);

    const legalWithInssIsBetter = calculate({ taxableIncome: 3000, deductibleInss: 800 });
    assert.equal(legalWithInssIsBetter.deducoesLegais, 800);
    assert.equal(legalWithInssIsBetter.tipoDeducaoEscolhida, 'DEDUCOES_LEGAIS');
    assert.equal(legalWithInssIsBetter.deducaoAplicada, 800);

    const reductionNeverExceedsTax = calculate({ taxableIncome: 5000, deductibleInss: 1000 });
    assert.ok(reductionNeverExceedsTax.reducaoEspecial <= reductionNeverExceedsTax.impostoTabela);
    assert.ok(reductionNeverExceedsTax.impostoFinal >= 0);
  });

  it('agrega somente recebimentos CPF pela data de pagamento e soma as apurações no modo ano inteiro', () => {
    const result = calculateCpfMonthlyTax(
      [
        cpfSale('cpf-jan', '2026-01-05', 2000),
        cpfSale('cnpj-jan', '2026-01-06', 9000, 'CNPJ'),
        cpfSale('cpf-dec', '2026-12-05', 1000),
      ],
      [],
      '2026',
      2026,
      undefined,
      0,
      0
    );

    assert.equal(result.isAnnualSummary, true);
    assert.equal(result.grossRevenueReceived, 3000);
    assert.equal(result.monthlyResults[0].grossRevenueReceived, 2000);
    assert.equal(result.monthlyResults[11].grossRevenueReceived, 1000);
    assert.equal(result.carneLeaoEstimated, result.monthlyResults.reduce((sum, month) => sum + month.carneLeaoEstimated, 0));
  });

  it('mantém realizado e projeção independentes no cenário de R$ 200 realizados e R$ 6.950 projetados', () => {
    const result = calculateCpfMonthlyTax(
      [
        cpfSale('cpf-realizado', '2026-09-10', 200),
        pendingCpfSale('cpf-a-receber', '2026-09-25', 6750),
      ],
      [pendingBookCashExpense('livro-caixa-projetado', '2026-09-25', 3800)],
      '2026-09',
      2026,
      undefined,
      0,
      0
    );

    assert.equal(result.monthlyCalculation.rendimentosTributaveis, 200);
    assert.equal(result.monthlyCalculation.despesasLivroCaixaMes, 0);
    assert.equal(result.monthlyCalculation.baseCalculo, 0);
    assert.equal(result.monthlyCalculation.impostoFinal, 0);

    assert.equal(result.projectedCalculation.rendimentosTributaveis, 6950);
    assert.equal(result.projectedCalculation.despesasLivroCaixaMes, 3800);
    assert.equal(result.deductibleExpensesLivroCaixa, 0);
    assert.equal(result.deductibleExpensesToPay, 3800);
    assert.equal(result.deductibleExpensesProjected, 3800);
    assert.equal(result.projectedCalculation.livroCaixaUtilizado, 3800);
    assert.equal(result.projectedCalculation.baseCalculo, 3150);
    assert.equal(result.projectedCalculation.impostoTabela, 78.34);
    assert.equal(result.projectedCalculation.reducaoEspecial, 53.26);
    assert.equal(result.projectedCalculation.impostoFinal, 25.08);
    assert.equal(result.irpfProjected, 25.08);
    assert.equal(result.carneLeaoEstimated, 0);

    const realizedDisplay = selectCarneLeaoScenario(
      result.monthlyCalculation,
      result.projectedCalculation,
      'REALIZADO'
    );
    const projectedDisplay = selectCarneLeaoScenario(
      result.monthlyCalculation,
      result.projectedCalculation,
      'PROJETADO'
    );
    assert.equal(realizedDisplay, result.monthlyCalculation);
    assert.equal(realizedDisplay.rendimentosTributaveis, 200);
    assert.equal(realizedDisplay.baseCalculo, 0);
    assert.equal(realizedDisplay.impostoFinal, 0);
    assert.equal(projectedDisplay, result.projectedCalculation);
    assert.equal(projectedDisplay.rendimentosTributaveis, 6950);
    assert.equal(projectedDisplay.baseCalculo, 3150);
    assert.equal(projectedDisplay.impostoTabela, 78.34);
    assert.equal(projectedDisplay.reducaoEspecial, 53.26);
    assert.equal(projectedDisplay.impostoFinal, 25.08);
  });
});
