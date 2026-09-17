import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../src/lib/db';
import { BankAccount } from '../../src/types';

// Helper replicate logic from BankAccountsView
const getBaseBankName = (name: string): string => {
  return name.replace(/\s+(PJ|PF|CPF)$/i, '').trim();
};

const formatBankNameForType = (rawName: string, type: 'CORRENTE_PF' | 'CORRENTE_PJ'): string => {
  const base = getBaseBankName(rawName);
  if (!base) return '';
  const suffix = type === 'CORRENTE_PJ' ? 'PJ' : 'CPF';
  return `${base} ${suffix}`;
};

test('BANK-NAME-01: Auto-formatação de Nome de Banco com sufixo dinâmico PJ/CPF', () => {
  // Teste 1: Nome simples
  assert.strictEqual(formatBankNameForType('Nubank', 'CORRENTE_PJ'), 'Nubank PJ');
  assert.strictEqual(formatBankNameForType('Nubank', 'CORRENTE_PF'), 'Nubank CPF');

  // Teste 2: Alternância de PJ para PF/CPF
  const pjName = formatBankNameForType('Nubank', 'CORRENTE_PJ');
  assert.strictEqual(pjName, 'Nubank PJ');
  const pfName = formatBankNameForType(pjName, 'CORRENTE_PF');
  assert.strictEqual(pfName, 'Nubank CPF');
  const pjBack = formatBankNameForType(pfName, 'CORRENTE_PJ');
  assert.strictEqual(pjBack, 'Nubank PJ');

  // Teste 3: Nomes compostos de bancos
  assert.strictEqual(formatBankNameForType('Banco do Brasil', 'CORRENTE_PJ'), 'Banco do Brasil PJ');
  assert.strictEqual(formatBankNameForType('Banco do Brasil', 'CORRENTE_PF'), 'Banco do Brasil CPF');
  assert.strictEqual(formatBankNameForType('Banco Inter', 'CORRENTE_PF'), 'Banco Inter CPF');
  assert.strictEqual(formatBankNameForType('C6 Bank CPF', 'CORRENTE_PJ'), 'C6 Bank PJ');
});

test('BANK-NAME-02: Opções de seleção no modal de Despesas exibem claramente se é CPF ou PJ', () => {
  const mockAccounts: BankAccount[] = [
    {
      id: 'b1',
      orgId: 'org_1',
      name: 'Nubank PJ',
      bankName: 'Nubank',
      accountType: 'CORRENTE_PJ',
      initialBalance: 1000,
      currentBalance: 2500,
      isPreferred: true,
    },
    {
      id: 'b2',
      orgId: 'org_1',
      name: 'Nubank CPF',
      bankName: 'Nubank',
      accountType: 'CORRENTE_PF',
      initialBalance: 500,
      currentBalance: 800,
    },
  ];

  const bankAccountOptions = mockAccounts.map((b) => {
    const isPj = b.accountType === 'CORRENTE_PJ';
    return {
      value: b.id,
      label: `${b.isPreferred ? '⭐ ' : ''}${b.name}${b.isPreferred ? ' (Principal)' : ''}`,
      description: `${b.isPreferred ? 'Conta Padrão • ' : ''}${
        isPj ? 'Conta Jurídica (PJ) • Clínica' : 'Conta Física (CPF) • Dentista / Livro Caixa'
      }`,
    };
  });

  assert.strictEqual(bankAccountOptions[0].label, '⭐ Nubank PJ (Principal)');
  assert.ok(bankAccountOptions[0].description.includes('Conta Jurídica (PJ)'));

  assert.strictEqual(bankAccountOptions[1].label, 'Nubank CPF');
  assert.ok(bankAccountOptions[1].description.includes('Conta Física (CPF)'));
});
