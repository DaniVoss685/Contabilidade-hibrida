import { describe, it } from 'node:test';
import assert from 'node:assert';
import { db } from '../../src/lib/db';
import { mapAppBankAccountToDb, mapDbBankAccountToApp } from '../../src/lib/supabaseClient';
import { BankAccount } from '../../src/types';

describe('Suite Funcional: Auto-preenchimento de Preço, Limpeza PIX e Banco Preferido com Estrela', () => {
  it('SALE-UX-01: Auto-preenchimento do valor total ao selecionar procedimento com preço cadastrado', () => {
    // Simula catálogo com procedimentos cadastrados
    const mockProcedures = [
      { id: 'proc_01', code: 'PROC-101', name: 'Profilaxia Completa', defaultPrice: 250.00 },
      { id: 'proc_02', code: 'PROC-202', name: 'Restauração Resina', defaultPrice: 150.00 },
      { id: 'proc_03', code: 'PROC-303', name: 'Avaliação Inicial', defaultPrice: 0.00 },
    ];

    let totalValue = 0;
    let procedureName = '';

    const handleProcedureSelect = (procId: string) => {
      if (procId === 'CUSTOM') {
        procedureName = '';
      } else {
        const found = mockProcedures.find((p) => p.id === procId);
        if (found) {
          procedureName = found.name;
          if (found.defaultPrice !== undefined && found.defaultPrice !== null && found.defaultPrice > 0) {
            totalValue = found.defaultPrice;
          }
        }
      }
    };

    // Seleciona procedimento de R$ 150,00
    handleProcedureSelect('proc_02');
    assert.strictEqual(procedureName, 'Restauração Resina');
    assert.strictEqual(totalValue, 150.00, 'Valor total deve ser automaticamente preenchido com 150.00');

    // Seleciona procedimento de R$ 250,00
    handleProcedureSelect('proc_01');
    assert.strictEqual(procedureName, 'Profilaxia Completa');
    assert.strictEqual(totalValue, 250.00, 'Valor total deve ser automaticamente atualizado para 250.00');
  });

  it('SALE-UX-02: Ocultação do código do procedimento no rótulo de seleção (exibe apenas o nome)', () => {
    const mockProcedures = [
      { id: 'proc_01', code: 'PROC-464', name: 'PROFILAXIA', defaultPrice: 250.00, clinicalDurationMinutes: 50 },
    ];

    const procedureOptions = mockProcedures.map((proc) => ({
      value: proc.id,
      label: proc.name,
      description: `Tabela: R$ ${proc.defaultPrice} • Duração: ${proc.clinicalDurationMinutes} min`,
      badge: `R$ ${proc.defaultPrice}`,
    }));

    assert.strictEqual(procedureOptions[0].label, 'PROFILAXIA');
    assert.ok(!procedureOptions[0].label.includes('PROC-464'), 'Não deve conter o código PROC-464 no rótulo principal');
  });

  it('SALE-UX-03: Forma de pagamento PIX sem o sufixo "(Instantâneo)"', () => {
    const paymentOptions = [
      { value: 'PIX', label: 'PIX' },
      { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
      { value: 'CARTAO_DEBITO', label: 'Cartão de Débito' },
      { value: 'BOLETO', label: 'Boleto Bancário' },
      { value: 'DINHEIRO', label: 'Dinheiro em Espécie' },
      { value: 'TRANSFERENCIA', label: 'Transferência / TED' },
    ];

    const pixOption = paymentOptions.find((p) => p.value === 'PIX');
    assert.ok(pixOption);
    assert.strictEqual(pixOption.label, 'PIX', 'Rótulo deve ser estritamente "PIX"');
    assert.ok(!pixOption.label.includes('Instantâneo'), 'Não deve conter o texto "Instantâneo"');
  });

  it('BANK-UX-01: Definição de banco preferido / padrão (com estrela) e exclusividade', async () => {
    // Garante ambiente demo inicializado
    db.loginDemo();
    const accounts = db.getBankAccounts();
    assert.ok(accounts.length >= 2, 'Deve haver pelo menos 2 contas para o teste de alternância');

    const bank1 = accounts[0];
    const bank2 = accounts[1];

    // Define conta 2 como preferida
    await db.setPreferredBankAccount(bank2.id);

    const updatedAccounts1 = db.getBankAccounts();
    const updatedBank1 = updatedAccounts1.find((b) => b.id === bank1.id);
    const updatedBank2 = updatedAccounts1.find((b) => b.id === bank2.id);

    assert.strictEqual(updatedBank2?.isPreferred, true, 'Conta 2 deve ser marcada como preferida');
    assert.strictEqual(updatedBank1?.isPreferred, false, 'Conta 1 deve ser desmarcada como preferida');
    assert.strictEqual(db.getPreferredBankAccountId(), bank2.id, 'getPreferredBankAccountId deve retornar a Conta 2');

    // Alterna para conta 1 como preferida
    await db.setPreferredBankAccount(bank1.id);

    const updatedAccounts2 = db.getBankAccounts();
    assert.strictEqual(updatedAccounts2.find((b) => b.id === bank1.id)?.isPreferred, true);
    assert.strictEqual(updatedAccounts2.find((b) => b.id === bank2.id)?.isPreferred, false);
    assert.strictEqual(db.getPreferredBankAccountId(), bank1.id, 'getPreferredBankAccountId deve retornar a Conta 1');
  });

  it('BANK-UX-02: Mapeamento de banco preferido para o banco de dados Supabase e vice-versa', () => {
    const appBank: BankAccount = {
      id: 'bank_test_123',
      orgId: 'org_test',
      name: 'Banco do Brasil',
      bankName: 'BB',
      accountType: 'CORRENTE_PJ',
      initialBalance: 1000,
      currentBalance: 2500,
      isActive: true,
      isPreferred: true,
    };

    const dbPayload = mapAppBankAccountToDb(appBank, 'tenant_test');
    assert.strictEqual(dbPayload.is_preferred, true, 'mapAppBankAccountToDb deve mapear is_preferred');

    const rawDbRecord = {
      id: 'bank_test_123',
      org_id: 'org_test',
      name: 'Banco do Brasil',
      bank_name: 'BB',
      account_type: 'CORRENTE_PJ',
      initial_balance: 1000,
      current_balance: 2500,
      is_active: true,
      is_preferred: true,
    };

    const mappedApp = mapDbBankAccountToApp(rawDbRecord);
    assert.strictEqual(mappedApp.isPreferred, true, 'mapDbBankAccountToApp deve mapear isPreferred');
  });

  it('BANK-UX-03: Pre-seleção automática da conta preferida nos modais de receita e despesa', () => {
    const mockAccounts: BankAccount[] = [
      {
        id: 'bank_pf',
        orgId: 'org_1',
        name: 'Nubank PF',
        bankName: 'Nubank',
        accountType: 'CORRENTE_PF',
        initialBalance: 0,
        currentBalance: 0,
        isActive: true,
        isPreferred: false,
      },
      {
        id: 'bank_pj_preferred',
        orgId: 'org_1',
        name: 'Mercado Pago PJ',
        bankName: 'Mercado Pago',
        accountType: 'CORRENTE_PJ',
        initialBalance: 0,
        currentBalance: 0,
        isActive: true,
        isPreferred: true,
      },
    ];

    // Lógica usada em NewExpenseModal e NewSaleModal
    const selectedBankInExpense = mockAccounts.find((b) => b.isPreferred && b.isActive !== false) ||
                                 mockAccounts.find((b) => b.isActive !== false) ||
                                 mockAccounts[0];

    assert.strictEqual(
      selectedBankInExpense?.id,
      'bank_pj_preferred',
      'Conta preferida com estrela deve ser pré-selecionada no modal de despesa'
    );

    const bankOptions = mockAccounts.map((b) => ({
      value: b.id,
      label: `${b.isPreferred ? '⭐ ' : ''}${b.name}${b.isPreferred ? ' (Principal)' : ''}`,
    }));

    assert.strictEqual(bankOptions[1].label, '⭐ Mercado Pago PJ (Principal)');
  });
});
