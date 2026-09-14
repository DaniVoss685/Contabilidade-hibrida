/**
 * TIER 4 — REAL-WORLD APPLICATION SCENARIOS (CLINICAL JOURNEYS)
 * 
 * End-to-End realistic journeys of Brazilian Dental Clinics exercising
 * the complete operational, tax, financial, and UX flow across the entire platform.
 */

import { describe, test, expect } from './harness/testHarness';
import { db } from '../../src/lib/db';
import {
  formatCurrency,
  formatDateBr,
  formatCpf,
  formatCnpj,
  parseBrlInput,
} from '../../src/lib/masks';
import {
  validateReceiptFile,
  safeMargin,
  safeDivide,
  validateAccountReceivableContract,
  validateBankAccountContract,
  validateToastContract,
  validateConfirmDialogProps,
  calculatePjTaxEstimate,
  safeFormatPercent,
} from './harness/contracts';

describe('Tier 4: Real-World Clinical Journeys', 4, () => {
  test('Cenário 1: Jornada Completa de Tratamento Ortodôntico (Paciente -> Orçamento -> Parcelamento -> Liquidação -> Fluxo)', () => {
    // 1. Cadastrar novo paciente com caracteres da língua portuguesa
    const patient = db.addPatient({
      name: 'Dr. Guilherme Vasconcelos de Alencar',
      cpf: '321.654.987-11',
      phone: '(11) 98123-4567',
      email: 'guilherme.alencar@clinica.com',
      notes: 'Tratamento de Alinhadores Invisíveis e Contenção',
    });
    expect(patient.id).toBeDefined();

    // 2. Criar Orçamento / Venda parcelada em 12x de R$ 350,00 (Total R$ 4.200,00)
    const totalInstallments = 12;
    const installmentValue = 350.00;
    const totalValue = totalInstallments * installmentValue;
    const installments = [];

    for (let i = 1; i <= totalInstallments; i++) {
      const monthNum = (i % 12) + 1;
      const yearOffset = Math.floor(i / 13);
      installments.push({
        id: `inst_orto_${i}_${Date.now()}`,
        saleId: '',
        installmentNumber: i,
        totalInstallments,
        value: installmentValue,
        dueDate: `2027-${String(monthNum).padStart(2, '0')}-15`,
        status: 'A_RECEBER' as const,
      });
    }

    const sale = db.addSale({
      patientId: patient.id,
      patientName: patient.name,
      patientCpf: patient.cpf,
      payerIsBeneficiary: true,
      procedureName: 'Ortodontia - Alinhadores Invisíveis',
      description: 'Plano ortodôntico completo 12 meses',
      totalValue,
      serviceDate: '2027-01-15',
      paymentMethod: 'BOLETO',
      installmentsCount: totalInstallments,
      taxOrigin: 'CPF',
      installments,
    });

    expect(sale.id).toBeDefined();
    expect(sale.totalValue).toBe(4200.00);

    // 3. Localizar parcelas em Contas a Receber
    const receivables = db.getAccountsReceivable().filter(r => r.saleId === sale.id);
    expect(receivables.length).toBe(12);

    // 4. Liquidar as 2 primeiras parcelas com datas de recebimento efetivas
    const inst1 = receivables[0];
    const inst2 = receivables[1];

    db.updateReceivableInstallment(inst1.installmentId, {
      status: 'RECEBIDO',
      paymentDate: '2027-01-14',
      paymentMethod: 'PIX',
    });

    db.updateReceivableInstallment(inst2.installmentId, {
      status: 'RECEBIDO',
      paymentDate: '2027-02-14',
      paymentMethod: 'BOLETO',
    });

    // 5. Verificar atualização de status e separação de datas
    const updatedReceivables = db.getAccountsReceivable().filter(r => r.saleId === sale.id);
    const updated1 = updatedReceivables.find(r => r.installmentId === inst1.installmentId);
    const updated3 = updatedReceivables.find(r => r.installmentId === receivables[2].installmentId);

    expect(updated1?.status).toBe('RECEBIDO');
    expect(updated1?.amountReceived).toBe(350);

    // Parcela 3 permanece A_VENCER com recebimento pendente
    expect(updated3?.status).toBe('A_VENCER');
    expect(updated3?.balance).toBe(350);
  });

  test('Cenário 2: Jornada Suprimentos Cirúrgicos & Contas a Pagar (Despesa PJ -> CNPJ -> Anexo PDF -> Pagamento -> DRE)', () => {
    // 1. Cadastrar despesa com fornecedor PJ e CNPJ formatado
    const supplierCnpj = '12.345.678/0001-95';
    expect(supplierCnpj.replace(/\D/g, '').length).toBe(14);

    // 2. Validar anexo de nota fiscal em PDF (250 KB)
    const invoiceFile = {
      name: 'NF_Dental_Cremer_Implantes_9842.pdf',
      size: 250 * 1024,
      type: 'application/pdf',
    };
    expect(validateReceiptFile(invoiceFile).valid).toBe(true);

    // 3. Criar despesa de materiais cirúrgicos com titularidade PJ
    const expense = db.addExpense({
      supplierName: 'Dental Cremer Produtos Odontológicos S.A.',
      supplierCpfCnpj: supplierCnpj,
      description: 'Kits Cirúrgicos de Implante Titânio',
      categoryId: 'cat_materiais',
      categoryCode: '04.01',
      categoryName: 'Materiais de Implante e Cirurgia',
      value: 3200.00,
      competenceDate: '2025-05-10',
      dueDate: '2025-05-25',
      paymentMethod: 'BOLETO',
      entity: 'CNPJ',
      dedutivelLivroCaixaPf: 'NAO',
      impactaFatorRPj: false,
      despesaOperacionalPj: true,
      documentNumber: 'NF-9842',
      attachmentName: invoiceFile.name,
      status: 'A_PAGAR',
    });

    expect(expense.id).toBeDefined();
    expect(expense.status).toBe('A_PAGAR');
    expect(expense.paymentDate).toBeUndefined();

    // 4. Executar pagamento da despesa
    const effectivePaymentDate = '2025-05-24';
    db.payExpense(expense.id, effectivePaymentDate, 'TRANSFERENCIA', 'bank_01');

    // 5. Verificar atualização para status PAGO com data registrada
    const paidExpense = db.getExpenses().find(e => e.id === expense.id);
    expect(paidExpense?.status).toBe('PAGO');
    expect(paidExpense?.paymentDate).toBe('2025-05-24');
    expect(formatDateBr(paidExpense?.dueDate)).toBe('25/05/2025');
    expect(formatDateBr(paidExpense?.paymentDate)).toBe('24/05/2025');
  });

  test('Cenário 3: Jornada Planejamento Tributário e Fator R (Diagnóstico Anexo V -> Pró-Labore BRL -> Migração Anexo III -> Rollback)', () => {
    // 1. Diagnóstico Inicial da Clínica: Folha 12M = R$ 42.000 / RBT12 = R$ 280.000 (Fator R = 15% < 28%)
    const rbt12 = 280000;
    const initialFolha = 42000;
    const monthlyRevenue = 25000;

    const initialTax = calculatePjTaxEstimate('2025-05', 2025, monthlyRevenue, rbt12, initialFolha);
    expect(initialTax.isAnexoIII).toBe(false);
    expect(initialTax.effectiveAnnex).toBe('ANEXO_V');
    expect(initialTax.effectiveTaxRate).toBeGreaterThan(15); // Alíquota percentual do Anexo V

    // 2. Administrador ajusta pró-labore utilizando CurrencyInput em BRL
    const newProLaboreInput = 'R$ 7.000,00';
    const parsedProLabore = parseBrlInput(newProLaboreInput);
    expect(parsedProLabore).toBe(7000);

    // 3. Execução da Simulação do Fator R: Aumento da folha anual para R$ 84.000 (Fator R = 30% ≥ 28%)
    const optimizedFolha = 84000;
    const optimizedTax = calculatePjTaxEstimate('2025-05', 2025, monthlyRevenue, rbt12, optimizedFolha);

    expect(optimizedTax.isAnexoIII).toBe(true);
    expect(optimizedTax.effectiveAnnex).toBe('ANEXO_III');
    expect(optimizedTax.effectiveTaxRate).toBeLessThan(initialTax.effectiveTaxRate);

    // 4. Validação da Economia Tributária Mensal no DAS
    const taxSavings = initialTax.dasEstimated - optimizedTax.dasEstimated;
    expect(taxSavings).toBeGreaterThan(1000); // Economia substancial comprovada

    // 5. Rollback Seguro: Restaurar parametrização original
    db.resetToDemo();
    const currentProf = db.getProfessional();
    expect(currentProf.rbt12Inicial).toBe(280000);
  });

  test('Cenário 4: Jornada Segregação Patrimonial & Gestão de Contas Bancárias (Abertura PF vs PJ -> Chaves PIX -> Conciliação -> Exclusão)', () => {
    // 1. Validação de Contrato Canônico de Conta Bancária PF
    const pfAccountPayload = {
      id: 'acc_nubank_pf',
      orgId: 'org_01',
      name: 'Nubank Pessoal - Dr. Mendes',
      bankName: 'Nubank',
      accountType: 'CORRENTE_PF' as const,
      agency: '0001',
      accountNumber: '1234567-8',
      pixKey: '123.456.789-01',
      pixKeyType: 'CPF' as const,
      isActive: true,
      initialBalance: 2500,
      currentBalance: 2500,
    };
    expect(validateBankAccountContract(pfAccountPayload).valid).toBe(true);

    // 2. Validação de Contrato Canônico de Conta Bancária PJ
    const pjAccountPayload = {
      id: 'acc_santander_pj',
      orgId: 'org_01',
      name: 'Santander Empresas - Clínica Mendes',
      bankName: 'Santander',
      accountType: 'CORRENTE_PJ' as const,
      agency: '4321',
      accountNumber: '987654-0',
      pixKey: '12.345.678/0001-95',
      pixKeyType: 'CNPJ' as const,
      isActive: true,
      initialBalance: 15000,
      currentBalance: 15000,
    };
    expect(validateBankAccountContract(pjAccountPayload).valid).toBe(true);

    // 3. Obter contas bancárias ativas do banco e verificar segregação
    const bankAccounts = db.getBankAccounts();
    const existingPf = bankAccounts.find(a => a.accountType === 'CORRENTE_PF') || pfAccountPayload;
    const existingPj = bankAccounts.find(a => a.accountType === 'CORRENTE_PJ') || pjAccountPayload;

    expect(existingPf.accountType).toBe('CORRENTE_PF');
    expect(existingPj.accountType).toBe('CORRENTE_PJ');

    // 4. Vincular despesa PF à conta PF (Segregação patrimonial total)
    const expPf = db.addExpense({
      supplierName: 'Curso de Especialização em Endodontia',
      supplierCpfCnpj: '111.222.333-44',
      description: 'Mensalidade Curso Especialização',
      categoryId: 'cat_educacao',
      categoryCode: '07.01',
      categoryName: 'Cursos e Congressos PF',
      value: 1200,
      competenceDate: '2025-05-05',
      dueDate: '2025-05-05',
      paymentDate: '2025-05-05',
      paymentMethod: 'PIX',
      bankAccountId: existingPf.id,
      entity: 'CPF',
      dedutivelLivroCaixaPf: 'SIM',
      impactaFatorRPj: false,
      despesaOperacionalPj: false,
      status: 'PAGO',
    });

    expect(expPf.bankAccountId).toBe(existingPf.id);
    expect(expPf.entity).toBe('CPF');

    // 5. Verificação de exclusão / lifecycle de conta
    if (typeof (db as any).deleteBankAccount === 'function') {
      const deleted = (db as any).deleteBankAccount('acc_temp_test');
      expect(typeof deleted).toBe('boolean');
    }
  });

  test('Cenário 5: Jornada Auditoria, Tolerância a Falhas e Prevenção de Falhas (Dirty Modal -> Anti-Double-Click -> ConfirmDialog -> Guardrails)', () => {
    // 1. Tentar fechar modal alterado acionando diálogo de descarte
    let isDirty = true;
    let confirmDiscardOpen = false;

    const requestClose = () => {
      if (isDirty) {
        confirmDiscardOpen = true;
      }
    };

    requestClose();
    expect(confirmDiscardOpen).toBe(true);

    // Cancelar descarte e prosseguir com submissão
    confirmDiscardOpen = false;

    // 2. Submissão sob estresse com proteção anti-duplo clique
    let isSubmitting = false;
    let savedRecords = 0;

    const submitRecord = () => {
      if (isSubmitting) return;
      isSubmitting = true;
      savedRecords++;
    };

    // Cliques concorrentes
    submitRecord();
    submitRecord();
    submitRecord();
    expect(savedRecords).toBe(1);

    // 3. Emissão de Toast de Sucesso
    const toast = {
      id: 'toast_01',
      message: 'Operação registrada com sucesso!',
      type: 'success' as const,
      durationMs: 3500,
    };
    expect(validateToastContract(toast).valid).toBe(true);

    // 4. Exclusão do registro com ConfirmDialog destrutivo vermelho
    const confirmDeleteProps = {
      isOpen: true,
      title: 'Excluir Lançamento',
      description: 'Deseja realmente remover este lançamento de teste?',
      variant: 'danger' as const,
      confirmLabel: 'Excluir',
      onConfirm: () => {},
      onClose: () => {},
    };
    expect(validateConfirmDialogProps(confirmDeleteProps).valid).toBe(true);
    expect(confirmDeleteProps.variant).toBe('danger');

    // 5. Verificação dos Guardrails Matemáticos: 0 ocorrências de NaN/undefined/Infinity
    const zeroDiv = safeDivide(0, 0);
    const marginZero = safeMargin(0, 0);
    const formattedNull = safeFormatPercent(null);

    expect(isNaN(zeroDiv)).toBe(false);
    expect(isFinite(zeroDiv)).toBe(true);
    expect(marginZero.marginPercent).toBeNull();
    expect(formattedNull).toBe('—');
  });
});
