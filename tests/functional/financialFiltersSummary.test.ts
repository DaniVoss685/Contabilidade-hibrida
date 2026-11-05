import { readFileSync } from 'node:fs';
import { AccountReceivableItem, Expense } from '../../src/types';
import { filterExpenses, filterReceivables, summarizeFilteredMoney } from '../../src/lib/financialFilters';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`❌ ${message}`);
  passed++;
  console.log(`✅ ${message}`);
}

const expense = (overrides: Partial<Expense>): Expense => ({
  id: 'expense', orgId: 'tenant-a', supplierName: 'Fornecedor', supplierCpfCnpj: '',
  description: 'Material', categoryId: 'materials', categoryCode: '01', categoryName: 'Materiais',
  value: 0, competenceDate: '2026-09-01', dueDate: '2026-10-01', entity: 'CNPJ',
  dedutivelLivroCaixaPf: 'NAO', impactaFatorRPj: false, despesaOperacionalPj: true,
  status: 'A_PAGAR', createdAt: '2026-09-01T12:00:00.000Z', ...overrides,
} as Expense);

const allExpenseRows = [
  expense({ id: 'c1', value: 120, entity: 'CNPJ', paymentMethod: 'PIX', description: 'Material clínico' }),
  expense({ id: 'c2', value: 587.84, entity: 'CNPJ', status: 'PAGO', paymentMethod: 'CARTAO_CREDITO', description: 'Seringa odontológica', expenseType: 'PARCELADA', dueDate: '2026-09-10' }),
  expense({ id: 'c3', value: 356.62, entity: 'CNPJ', paymentMethod: 'PIX', description: 'Cadeira clínica', expenseType: 'RECORRENTE', dueDate: '2026-10-10' }),
  expense({ id: 'p1', value: 100.10, entity: 'CPF', paymentMethod: 'DINHEIRO', description: 'Serviço jurídico', dueDate: '2026-09-29' }),
  expense({ id: 'p2', value: 99.99, entity: 'CPF', status: 'PAGO', paymentMethod: 'PIX', description: 'Aluguel', dueDate: '2026-09-10' }),
  expense({ id: 'prior-year', value: 999.99, entity: 'CNPJ', status: 'PAGO', description: 'Item de 2025', competenceDate: '2025-12-01', dueDate: '2025-12-10' }),
];
const year2026Expenses = allExpenseRows.filter((item) => item.competenceDate.startsWith('2026-'));
const baseExpenseFilters = {
  searchTerm: '', entityFilter: 'ALL' as const, statusFilter: 'ALL', categoryFilter: 'ALL',
  typeFilter: 'ALL' as const, paymentMethodFilter: 'ALL', viewMode: 'all' as const, todayStr: '2026-09-30',
};

console.log('\n=== DESPESAS: resumo do mesmo conjunto final filtrado ===');
{
  const all = filterExpenses(year2026Expenses, baseExpenseFilters);
  const summary = summarizeFilteredMoney(all, (item) => item.value);
  assert(summary.count === 5 && summary.total === 1264.55, 'Todos no período: conta os lançamentos e soma centavos com precisão');

  const pf = filterExpenses(year2026Expenses, { ...baseExpenseFilters, entityFilter: 'CPF' });
  const pfSummary = summarizeFilteredMoney(pf, (item) => item.value);
  assert(pfSummary.count === 2 && pfSummary.total === 200.09, 'PF: quantidade e soma somente das despesas PF');

  const cnpj = filterExpenses(year2026Expenses, { ...baseExpenseFilters, entityFilter: 'CNPJ' });
  const cnpjSummary = summarizeFilteredMoney(cnpj, (item) => item.value);
  assert(cnpjSummary.count === 3 && cnpjSummary.total === 1064.46, 'CNPJ: quantidade e soma corretas');

  const paid = filterExpenses(year2026Expenses, { ...baseExpenseFilters, statusFilter: 'PAGO' });
  const paidSummary = summarizeFilteredMoney(paid, (item) => item.value);
  assert(paidSummary.count === 2 && paidSummary.total === 687.83, 'status Pago: inclui somente itens pagos no período');

  const toPay = filterExpenses(year2026Expenses, { ...baseExpenseFilters, statusFilter: 'A_PAGAR' });
  const toPaySummary = summarizeFilteredMoney(toPay, (item) => item.value);
  assert(toPaySummary.count === 2 && toPaySummary.total === 476.62, 'status A Pagar: exclui item vencido segundo o status efetivo');

  const overdue = filterExpenses(year2026Expenses, { ...baseExpenseFilters, statusFilter: 'EM_ATRASO' });
  const overdueSummary = summarizeFilteredMoney(overdue, (item) => item.value);
  assert(overdueSummary.count === 1 && overdueSummary.total === 100.10, 'status Em Atraso: inclui somente a despesa vencida');

  const pix = filterExpenses(year2026Expenses, { ...baseExpenseFilters, paymentMethodFilter: 'PIX' });
  const pixSummary = summarizeFilteredMoney(pix, (item) => item.value);
  assert(pixSummary.count === 3 && pixSummary.total === 576.61, 'forma PIX: soma somente os lançamentos PIX');

  const combined = filterExpenses(year2026Expenses, {
    ...baseExpenseFilters, searchTerm: 'seringa', entityFilter: 'CNPJ', statusFilter: 'PAGO',
  });
  const combinedSummary = summarizeFilteredMoney(combined, (item) => item.value);
  assert(combinedSummary.count === 1 && combinedSummary.total === 587.84, 'busca + CNPJ + Pago combina os filtros sem divergência');

  const none = filterExpenses(year2026Expenses, {
    ...baseExpenseFilters, entityFilter: 'CNPJ', statusFilter: 'EM_ATRASO',
  });
  const noneSummary = summarizeFilteredMoney(none, (item) => item.value);
  assert(noneSummary.count === 0 && noneSummary.total === 0, 'zero resultados mostra contagem e soma zeradas');

  const annualSummary = summarizeFilteredMoney(filterExpenses(year2026Expenses, baseExpenseFilters), (item) => item.value);
  assert(annualSummary.count === 5 && annualSummary.total === 1264.55, 'Exibir ano inteiro soma todos os registros anuais entregues à tela');
}

const receivable = (overrides: Partial<AccountReceivableItem>): AccountReceivableItem => ({
  installmentId: 'installment', saleId: 'sale', patientName: 'Paciente', taxOrigin: 'CPF',
  documentSummary: 'NFS-e', procedureName: 'Implante', competenceDate: '2026-09-01', dueDate: '2026-10-10',
  value: 0, amountReceived: 0, balance: 0, status: 'A_VENCER', installmentNumber: 1, totalInstallments: 1,
  paymentMethod: 'PIX', ...overrides,
} as AccountReceivableItem);

const receivables = [
  receivable({ installmentId: 'split-1', saleId: 'split-sale', patientName: 'Ana Silva', taxOrigin: 'CPF', value: 60, balance: 60, allocationNumber: 1, allocationAmount: 60 }),
  receivable({ installmentId: 'split-2', saleId: 'split-sale', patientName: 'Ana Silva', taxOrigin: 'CNPJ', value: 40, balance: 40, allocationNumber: 2, allocationAmount: 40, paymentMethod: 'DINHEIRO', cardFeeAmount: 2 }),
  receivable({ installmentId: 'sale-installment', saleId: 'separate-sale', patientName: 'Bruno Lima', taxOrigin: 'CNPJ', value: 200, amountReceived: 200, balance: 0, status: 'RECEBIDO', paymentMethod: 'PIX' }),
];
const baseReceivableFilters = {
  searchTerm: '', taxOriginFilter: 'ALL' as const, statusFilter: 'ALL', procedureFilter: 'ALL',
  paymentMethodFilter: 'ALL', todayStr: '2026-09-30',
};

console.log('\n=== CONTAS A RECEBER: valor por linha, sem gross ou taxa duplicados ===');
{
  const all = filterReceivables(receivables, baseReceivableFilters);
  const summary = summarizeFilteredMoney(all, (item) => item.value);
  assert(summary.count === 3 && summary.total === 300, 'geral soma parcelas/alocações exibidas uma vez, sem adicionar o total bruto da venda');

  const received = filterReceivables(receivables, { ...baseReceivableFilters, statusFilter: 'RECEBIDO' });
  const receivedSummary = summarizeFilteredMoney(received, (item) => item.value);
  assert(receivedSummary.count === 1 && receivedSummary.total === 200, 'status Recebido reflete só a parcela recebida');

  const pix = filterReceivables(receivables, { ...baseReceivableFilters, paymentMethodFilter: 'PIX' });
  const pixSummary = summarizeFilteredMoney(pix, (item) => item.value);
  assert(pixSummary.count === 2 && pixSummary.total === 260, 'forma PIX soma as linhas PIX sem incluir outra alocação');

  const searchAndOrigin = filterReceivables(receivables, {
    ...baseReceivableFilters, searchTerm: 'ana', taxOriginFilter: 'CNPJ', statusFilter: 'A_VENCER',
  });
  const combinedSummary = summarizeFilteredMoney(searchAndOrigin, (item) => item.value);
  assert(combinedSummary.count === 1 && combinedSummary.total === 40, 'busca + origem + status combina filtros e soma a alocação correspondente');

  const withFee = filterReceivables(receivables, { ...baseReceivableFilters, paymentMethodFilter: 'CARD_WITH_FEE' });
  const feeSummary = summarizeFilteredMoney(withFee, (item) => item.value);
  assert(feeSummary.count === 1 && feeSummary.total === 40, 'Com taxa soma o valor exibido daquela linha, sem adicionar a taxa separadamente');
}

const expenseViewSource = readFileSync('src/components/Expenses/ExpensesView.tsx', 'utf8');
const receivablesViewSource = readFileSync('src/components/Receivables/ReceivablesView.tsx', 'utf8');
const appSource = readFileSync('src/App.tsx', 'utf8');
assert(expenseViewSource.includes('summarizeFilteredMoney<Expense>(filteredExpenses'), 'Despesas usa a lista final filtrada como source of truth');
assert(receivablesViewSource.includes('summarizeFilteredMoney<AccountReceivableItem>(filteredItems'), 'Recebíveis usa a lista final filtrada como source of truth');
assert(appSource.includes('expenses={filteredExpenses}'), 'Despesas recebe do App a lista já limitada ao período/ano');

console.log(`\n${passed} verificações de filtro e resumo passaram.`);
