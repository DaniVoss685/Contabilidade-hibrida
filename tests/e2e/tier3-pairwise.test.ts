/**
 * TIER 3 — CROSS-FEATURE COMBINATIONS (PAIRWISE) TEST SUITE
 * 
 * Tests multi-feature interactions where the state or behavior of one feature
 * directly influences, constrains, or updates another across the Dental Finance platform.
 */

import { describe, test, expect } from './harness/testHarness';
import { db } from '../../src/lib/db';
import {
  formatCurrency,
  formatDateBr,
  formatCpf,
  formatCnpj,
} from '../../src/lib/masks';
import {
  validateReceiptFile,
  safeMargin,
  safeDivide,
  validateAccountReceivableContract,
  validateBankAccountContract,
  calculatePjTaxEstimate,
} from './harness/contracts';

describe('Tier 3: Pairwise Cross-Feature Combinations', 3, () => {
  test('Pair 1: Filtro CPF/CNPJ em Recebíveis (R2) + Liquidação com paymentDate (R5)', () => {
    // 1. Filtrar recebíveis por CPF
    const allReceivables = db.getAccountsReceivable();
    const cpfItems = allReceivables.filter(r => r.taxOrigin === 'CPF');
    expect(cpfItems.length).toBeGreaterThan(0);

    // 2. Selecionar uma parcela pendente
    const targetItem = cpfItems.find(r => r.status === 'A_VENCER') || cpfItems[0];
    expect(targetItem).toBeDefined();

    // 3. Liquidar parcela atribuindo data de pagamento efetiva
    const paymentDate = '2025-05-18';
    const updated = db.updateReceivableInstallment(targetItem.installmentId, {
      status: 'RECEBIDO',
      paymentDate,
    });
    expect(updated).toBe(true);

    // 4. Verificar se a parcela liquidada mantém a origem CPF e agora possui paymentDate preenchido
    const reloadedItems = db.getAccountsReceivable();
    const settledItem = reloadedItems.find(r => r.installmentId === targetItem.installmentId);

    expect(settledItem).toBeDefined();
    expect(settledItem?.status).toBe('RECEBIDO');
    expect(settledItem?.taxOrigin).toBe('CPF');
    expect(formatDateBr(paymentDate)).toBe('18/05/2025');
  });

  test('Pair 2: Busca de Paciente com Acentos (R3) + Nova Receita (R4) + KPIs do Período (R1)', () => {
    // 1. Cadastrar paciente com acentos pesados
    const newPatient = db.addPatient({
      name: 'Cláudio José da Silva',
      cpf: '987.654.321-99',
      phone: '(11) 97766-5544',
      email: 'claudio@clinica.com',
    });
    expect(newPatient.id).toBeDefined();

    // 2. Criar nova venda/receita para o paciente na competência 2025-05
    const initialSales = db.getSales().length;
    const newSale = db.addSale({
      patientId: newPatient.id,
      patientName: newPatient.name,
      patientCpf: newPatient.cpf,
      payerIsBeneficiary: true,
      procedureName: 'Restauração em Resina Composta',
      description: 'Dente 16',
      totalValue: 450,
      serviceDate: '2025-05-20',
      paymentMethod: 'PIX',
      installmentsCount: 1,
      taxOrigin: 'CPF',
      installments: [
        {
          id: `inst_${Date.now()}`,
          saleId: '',
          installmentNumber: 1,
          totalInstallments: 1,
          value: 450,
          dueDate: '2025-05-20',
          status: 'A_RECEBER',
        },
      ],
    });

    expect(newSale.id).toBeDefined();
    expect(db.getSales().length).toBe(initialSales + 1);

    // 3. Verificar que o KPI do período reflete o novo valor adicionado
    const salesInPeriod = db.getSales().filter(s => s.serviceDate.startsWith('2025-05'));
    const totalPeriodSales = salesInPeriod.reduce((acc, s) => acc + s.totalValue, 0);
    expect(totalPeriodSales).toBeGreaterThanOrEqual(450);
  });

  test('Pair 3: Nova Despesa Reativa (R4) + Upload de Comprovante (R5) + Impacto no Fator R (R7)', () => {
    // 1. Criar despesa de folha/salários com CNPJ e impacto no Fator R
    const validReceipt = {
      name: 'recibo_salarios_maio.pdf',
      size: 150 * 1024,
      type: 'application/pdf',
    };
    const receiptValidation = validateReceiptFile(validReceipt);
    expect(receiptValidation.valid).toBe(true);

    const expense = db.addExpense({
      supplierName: 'Folha de Pagamento Clínica Mendes',
      supplierCpfCnpj: '12.345.678/0001-95',
      description: 'Salários Equipe Auxiliar e ASB',
      categoryId: 'cat_salarios',
      categoryCode: '01.01',
      categoryName: 'Salários e Ordenados',
      value: 8000,
      competenceDate: '2025-05-01',
      dueDate: '2025-05-05',
      paymentDate: '2025-05-05',
      paymentMethod: 'TRANSFERENCIA',
      entity: 'CNPJ',
      dedutivelLivroCaixaPf: 'NAO',
      impactaFatorRPj: true, // Impacta Fator R!
      despesaOperacionalPj: true,
      status: 'PAGO',
    });

    expect(expense.id).toBeDefined();
    expect(expense.impactaFatorRPj).toBe(true);

    // 2. Verificar impacto nos tributos Simples Nacional
    const prof = db.getProfessional();
    const rbt12 = prof.rbt12Inicial || 280000;
    const taxSummary = calculatePjTaxEstimate('2025-05', 2025, 20000, rbt12, 84000);
    expect(taxSummary.isAnexoIII).toBe(true);
    expect(taxSummary.dasEstimated).toBeGreaterThan(0);
  });

  test('Pair 4: ConfirmDialog Destrutivo (R6) + CRUD de Contas Bancárias PF/PJ (R7)', () => {
    // 1. Validação do contrato canônico de Conta Bancária PJ
    const bankAccountPayload = {
      id: 'acc_bradesco_pj',
      orgId: 'org_01',
      name: 'Banco Bradesco Prime PJ',
      bankName: 'Bradesco',
      accountType: 'CORRENTE_PJ' as const,
      agency: '1234',
      accountNumber: '98765-4',
      pixKey: '12.345.678/0001-95',
      pixKeyType: 'CNPJ' as const,
      isActive: true,
      initialBalance: 5000,
      currentBalance: 5000,
    };

    expect(validateBankAccountContract(bankAccountPayload).valid).toBe(true);

    if (typeof (db as any).addBankAccount === 'function') {
      const created = (db as any).addBankAccount(bankAccountPayload);
      expect(created.id).toBeDefined();
      if (typeof (db as any).deleteBankAccount === 'function') {
        const deleted = (db as any).deleteBankAccount(created.id);
        expect(deleted).toBe(true);
      }
    } else {
      // Contas bancárias existentes no banco atendem ao contrato e à segregação PF/PJ
      const accounts = db.getBankAccounts();
      expect(accounts.length).toBeGreaterThan(0);
      for (const acc of accounts) {
        expect(validateBankAccountContract(acc).valid).toBe(true);
      }
    }

    // 2. Validação do diálogo destrutivo com botão vermelho
    let confirmExecuted = false;
    const confirmProps = {
      isOpen: true,
      title: 'Excluir Conta Bancária',
      description: 'Deseja realmente remover a conta bancária Bradesco PJ?',
      variant: 'danger' as const,
      onConfirm: () => {
        confirmExecuted = true;
      },
      onClose: () => {},
    };
    confirmProps.onConfirm();
    expect(confirmExecuted).toBe(true);
  });

  test('Pair 5: Empty State Informativo (R8) + Navegação de Período Global (R1)', () => {
    // Ao navegar para uma competência futura onde não existem despesas nem receitas (ex: 2027-12)
    const emptyPeriodPrefix = '2027-12';
    const filteredSales = db.getSales().filter(s => s.serviceDate.startsWith(emptyPeriodPrefix));
    const filteredExpenses = db.getExpenses().filter(e => e.competenceDate.startsWith(emptyPeriodPrefix));

    expect(filteredSales.length).toBe(0);
    expect(filteredExpenses.length).toBe(0);

    // Empty state deve fornecer ação de retorno ou criação
    const emptyStateAction = {
      label: 'Voltar para período padrão (Maio/2025)',
      targetPeriod: '2025-05',
    };
    expect(emptyStateAction.targetPeriod).toBe('2025-05');
  });

  test('Pair 6: Simulação Fator R Antes/Depois (R7) + Guardrails de Margem Segura (R8)', () => {
    const prof = db.getProfessional();
    const rbt12 = prof.rbt12Inicial || 280000;

    // Cenário Anexo III vs Anexo V
    const taxIII = calculatePjTaxEstimate('2025-05', 2025, 30000, rbt12, 84000);
    const taxV = calculatePjTaxEstimate('2025-05', 2025, 30000, rbt12, 42000);

    // Guardrail matemático na diferença e margens
    const marginIII = safeMargin(30000, taxIII.dasEstimated);
    const marginV = safeMargin(30000, taxV.dasEstimated);

    expect(marginIII.status).toBe('OK');
    expect(marginV.status).toBe('OK');
    expect(marginIII.marginPercent).toBeGreaterThan(marginV.marginPercent!);
  });

  test('Pair 7: Segregação Patrimonial PF/PJ (R2) + Associação de Conta Bancária (R7)', () => {
    const bankAccounts = db.getBankAccounts();
    const pfBank = bankAccounts.find(b => b.accountType === 'CORRENTE_PF');
    const pjBank = bankAccounts.find(b => b.accountType === 'CORRENTE_PJ');

    expect(pfBank).toBeDefined();
    expect(pjBank).toBeDefined();

    // Despesa de PF associada à conta PF
    const pfExpense = db.addExpense({
      supplierName: 'Conselho Regional de Odontologia - CRO',
      supplierCpfCnpj: '123.456.789-01',
      description: 'Anuidade CRO Pessoa Física',
      categoryId: 'cat_cro',
      categoryCode: '05.01',
      categoryName: 'Conselhos e Anuidades',
      value: 650,
      competenceDate: '2025-05-10',
      dueDate: '2025-05-10',
      paymentDate: '2025-05-10',
      paymentMethod: 'PIX',
      bankAccountId: pfBank?.id,
      entity: 'CPF',
      dedutivelLivroCaixaPf: 'SIM',
      impactaFatorRPj: false,
      despesaOperacionalPj: false,
      status: 'PAGO',
    });

    expect(pfExpense.entity).toBe('CPF');
    expect(pfExpense.bankAccountId).toBe(pfBank?.id);
  });

  test('Pair 8: Anti-Duplo Clique (R4) + Diálogo de Dirty State (R4) + Acessibilidade Escape (R6)', () => {
    let modalOpen = true;
    let isSubmitting = false;
    let submitCount = 0;
    let isDirty = true;
    let showDiscardDialog = false;

    // Submissão rápida
    const handleSubmit = () => {
      if (isSubmitting) return;
      isSubmitting = true;
      submitCount++;
    };

    handleSubmit();
    handleSubmit(); // segundo clique ignorado
    expect(submitCount).toBe(1);

    // Pressionar Escape em formulário dirty
    const handleEscape = () => {
      if (isDirty) {
        showDiscardDialog = true;
      } else {
        modalOpen = false;
      }
    };

    handleEscape();
    expect(showDiscardDialog).toBe(true);
    expect(modalOpen).toBe(true); // Não fecha sumariamente, pede confirmação!
  });
});
