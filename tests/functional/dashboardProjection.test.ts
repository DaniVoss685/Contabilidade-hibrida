import { calculateDashboardProjection, getMonthlyReceivablesSummary, getMonthlyExpensesSummary } from '../../src/lib/taxEngine';
import { Sale, Expense } from '../../src/types';

// Helper assertion function
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function assertClose(a: number, b: number, message: string, precision = 0.001) {
  if (Math.abs(a - b) > precision) {
    console.error(`❌ FAILED: ${message} (Expected ${b}, got ${a})`);
    throw new Error(`${message}: Expected ${b}, got ${a}`);
  }
  console.log(`✅ PASSED: ${message} (${a} === ${b})`);
}

console.log('\n======================================================');
console.log('🧪 SUÍTE DE TESTES: DASHBOARD PROJETADO (+ A VENCER)');
console.log('======================================================\n');

// ----------------------------------------------------------------------------
// FIXTURE DO ENUNCIADO DO PROMPT
// ----------------------------------------------------------------------------
const competence = '2026-09';

const salesFixture: Sale[] = [
  // Parcela 1: R$ 1.000,00 recebida em 10/09/2026 (CPF)
  {
    id: 'sale-1',
    patientId: 'pat-1',
    patientName: 'Paciente 1',
    date: '2026-09-10',
    totalAmount: 1000,
    paymentMethod: 'PIX',
    installments: 1,
    category: 'PF',
    status: 'completed',
    paymentStatus: 'received',
    receivedAt: '2026-09-10',
    paymentDetails: [
      {
        id: 'inst-1',
        installmentNumber: 1,
        dueDate: '2026-09-10',
        amount: 1000,
        status: 'received',
        paidDate: '2026-09-10',
      },
    ],
  },
  // Parcela 2: R$ 500,00 a vencer em 25/09/2026 (PJ)
  {
    id: 'sale-2',
    patientId: 'pat-2',
    patientName: 'Paciente 2',
    date: '2026-09-15',
    totalAmount: 500,
    paymentMethod: 'BOLETO',
    installments: 1,
    category: 'PJ',
    status: 'completed',
    paymentStatus: 'pending',
    paymentDetails: [
      {
        id: 'inst-2',
        installmentNumber: 1,
        dueDate: '2026-09-25',
        amount: 500,
        status: 'pending',
      },
    ],
  },
  // Parcela 3: R$ 300,00 vencida em 15/08/2026 e em atraso (CPF)
  {
    id: 'sale-3',
    patientId: 'pat-3',
    patientName: 'Paciente 3',
    date: '2026-08-15',
    totalAmount: 300,
    paymentMethod: 'BOLETO',
    installments: 1,
    category: 'PF',
    status: 'completed',
    paymentStatus: 'overdue',
    paymentDetails: [
      {
        id: 'inst-3',
        installmentNumber: 1,
        dueDate: '2026-08-15',
        amount: 300,
        status: 'overdue',
      },
    ],
  },
  // Parcela 4: R$ 2.000,00 a vencer em 10/10/2026 (PJ - Futuro além de setembro)
  {
    id: 'sale-4',
    patientId: 'pat-4',
    patientName: 'Paciente 4',
    date: '2026-09-20',
    totalAmount: 2000,
    paymentMethod: 'BOLETO',
    installments: 1,
    category: 'PJ',
    status: 'completed',
    paymentStatus: 'pending',
    paymentDetails: [
      {
        id: 'inst-4',
        installmentNumber: 1,
        dueDate: '2026-10-10',
        amount: 2000,
        status: 'pending',
      },
    ],
  },
];

const expensesFixture: Expense[] = [
  // Despesa 1: R$ 2.000,00 paga em 05/09/2026 (CPF Dedutível)
  {
    id: 'exp-1',
    description: 'Aluguel do Consultório',
    amount: 2000,
    date: '2026-09-05',
    dueDate: '2026-09-05',
    paymentDate: '2026-09-05',
    category: 'ALUGUEL',
    entityType: 'PF',
    deductible: true,
    status: 'paid',
  },
  // Despesa 2: R$ 1.200,00 a vencer em 28/09/2026 (PJ Operacional)
  {
    id: 'exp-2',
    description: 'Laboratório de Prótese',
    amount: 1200,
    date: '2026-09-10',
    dueDate: '2026-09-28',
    category: 'LABORATORIO',
    entityType: 'PJ',
    deductible: false,
    status: 'pending',
  },
  // Despesa 3: R$ 600,00 vencida em 20/08/2026 e em atraso (PJ Operacional)
  {
    id: 'exp-3',
    description: 'Manutenção de Equipamento em Atraso',
    amount: 600,
    date: '2026-08-20',
    dueDate: '2026-08-20',
    category: 'MANUTENCAO',
    entityType: 'PJ',
    deductible: false,
    status: 'overdue',
  },
  // Despesa 4: R$ 1.500,00 com vencimento em 05/10/2026 (Futuro além de setembro)
  {
    id: 'exp-4',
    description: 'Material Cirúrgico de Outubro',
    amount: 1500,
    date: '2026-09-22',
    dueDate: '2026-10-05',
    category: 'MATERIAIS',
    entityType: 'PJ',
    deductible: false,
    status: 'pending',
  },
];

const taxesEstimated = 255.75;

// Execução da Projeção para a Fixture
const realizedProj = calculateDashboardProjection({
  sales: salesFixture,
  expenses: expensesFixture,
  competence,
  viewMode: 'REALIZADO',
  taxesEstimated,
});

const projectedProj = calculateDashboardProjection({
  sales: salesFixture,
  expenses: expensesFixture,
  competence,
  viewMode: 'PROJETADO',
  taxesEstimated,
});

// TESTES DA FIXTURE PRINCIPAL
console.log('\n--- 1. TESTES DA FIXTURE CANÔNICA (PROMPT) ---');
// Realizado
assertClose(realizedProj.activeRevenue.total, 1000.0, 'Receita Realizada = R$ 1.000,00');
assertClose(realizedProj.activeRevenue.cpf, 1000.0, 'Receita Realizada CPF = R$ 1.000,00');
assertClose(realizedProj.activeRevenue.cnpj, 0.0, 'Receita Realizada PJ = R$ 0,00');
assertClose(realizedProj.activeExpenses.total, 2000.0, 'Despesas Pagas (Realizado) = R$ 2.000,00');
assertClose(realizedProj.activeExpenses.cpfDeductible, 2000.0, 'Despesa CPF Dedutível = R$ 2.000,00');
assertClose(realizedProj.activeExpenses.cnpjOperational, 0.0, 'Despesa PJ Operacional = R$ 0,00');
assertClose(realizedProj.operatingResult, -1000.0, 'Resultado Operacional Realizado = -R$ 1.000,00');
assertClose(realizedProj.netResult, -1255.75, 'Resultado Líquido Realizado (após R$ 255,75 impostos) = -R$ 1.255,75');

// Projetado
assertClose(projectedProj.activeRevenue.total, 1800.0, 'Receita Projetada = R$ 1.800,00 (1000 + 500 + 300)');
assertClose(projectedProj.activeRevenue.cpf, 1300.0, 'Receita Projetada CPF = R$ 1.300,00 (1000 + 300)');
assertClose(projectedProj.activeRevenue.cnpj, 500.0, 'Receita Projetada PJ = R$ 500,00');
assertClose(projectedProj.activeExpenses.total, 3800.0, 'Despesas Projetadas = R$ 3.800,00 (2000 + 1200 + 600)');
assertClose(projectedProj.activeExpenses.cpfDeductible, 2000.0, 'Despesas Projetadas CPF = R$ 2.000,00');
assertClose(projectedProj.activeExpenses.cnpjOperational, 1800.0, 'Despesas Projetadas PJ = R$ 1.800,00 (1200 + 600)');
assertClose(projectedProj.operatingResult, -2000.0, 'Resultado Operacional Projetado = -R$ 2.000,00 (1800 - 3800)');
assertClose(projectedProj.netResult, -2255.75, 'Resultado Líquido Projetado (após impostos) = -R$ 2.255,75');

// ----------------------------------------------------------------------------
// TESTES DASH-PROJ-01 A DASH-PROJ-17
// ----------------------------------------------------------------------------
console.log('\n--- 2. HOMOLOGAÇÃO DOS CRITÉRIOS DASH-PROJ-01 A DASH-PROJ-17 ---');

// DASH-PROJ-01: Toggle REALIZADO considera exclusivamente pagamentos/recebimentos no período
assert(
  realizedProj.activeRevenue.total === 1000 && realizedProj.activeExpenses.total === 2000,
  'DASH-PROJ-01: Toggle REALIZADO considera exclusivamente valores liquidados na competência'
);

// DASH-PROJ-02: Toggle PROJETADO soma realizados + abertos até o fim da competência
assert(
  projectedProj.activeRevenue.total === 1800 && projectedProj.activeExpenses.total === 3800,
  'DASH-PROJ-02: Toggle PROJETADO considera realizados + a vencer/atrasados até periodEnd'
);

// DASH-PROJ-03: Carry-over de recebíveis em atraso de competências anteriores
assert(
  projectedProj.projectedRevenue.overdue === 300,
  'DASH-PROJ-03: Recebíveis vencidos em competências anteriores entram no projetado (overdue: R$ 300)'
);

// DASH-PROJ-04: Carry-over de despesas em atraso de competências anteriores
assert(
  projectedProj.projectedExpenses.overdue === 600,
  'DASH-PROJ-04: Despesas vencidas em competências anteriores entram no projetado (overdue: R$ 600)'
);

// DASH-PROJ-05: Exclusão de recebíveis com vencimento após o fim da competência
assert(
  !projectedProj.activeRevenue.total.toString().includes('3800') &&
  projectedProj.activeRevenue.total === 1800,
  'DASH-PROJ-05: Recebíveis após 30/09/2026 (R$ 2.000 em 10/10) foram corretamente excluídos'
);

// DASH-PROJ-06: Exclusão de despesas com vencimento após o fim da competência
assert(
  !projectedProj.activeExpenses.total.toString().includes('5300') &&
  projectedProj.activeExpenses.total === 3800,
  'DASH-PROJ-06: Despesas após 30/09/2026 (R$ 1.500 em 05/10) foram corretamente excluídas'
);

// DASH-PROJ-07: Não-duplicação: lançamento pago não é somado como aberto
const duplicateCheckSales: Sale[] = [
  {
    id: 'sale-paid',
    patientId: 'pat-x',
    patientName: 'Paciente X',
    date: '2026-09-02',
    totalAmount: 1000,
    paymentMethod: 'PIX',
    installments: 1,
    category: 'PF',
    status: 'completed',
    paymentStatus: 'received',
    paymentDetails: [
      {
        id: 'inst-x',
        installmentNumber: 1,
        dueDate: '2026-09-02',
        amount: 1000,
        status: 'received',
        paidDate: '2026-09-02',
      },
    ],
  },
];
const dupProj = calculateDashboardProjection({
  sales: duplicateCheckSales,
  expenses: [],
  competence,
  viewMode: 'PROJETADO',
  taxesEstimated: 0,
});
assert(
  dupProj.activeRevenue.total === 1000 && dupProj.realizedRevenue.total === 1000 && dupProj.projectedRevenue.pending === 0,
  'DASH-PROJ-07: Nenhuma duplicação ocorre para parcela paga; soma projetada permanece R$ 1.000'
);

// DASH-PROJ-08: Transição de status sem alteração do total projetado
const pendingSale: Sale = {
  id: 'sale-trans',
  patientId: 'pat-y',
  patientName: 'Paciente Y',
  date: '2026-09-10',
  totalAmount: 500,
  paymentMethod: 'BOLETO',
  installments: 1,
  category: 'PJ',
  status: 'completed',
  paymentStatus: 'pending',
  paymentDetails: [
    {
      id: 'inst-y',
      installmentNumber: 1,
      dueDate: '2026-09-20',
      amount: 500,
      status: 'pending',
    },
  ],
};
const beforePayment = calculateDashboardProjection({
  sales: [pendingSale],
  expenses: [],
  competence,
  viewMode: 'PROJETADO',
  taxesEstimated: 0,
});
const paidSale: Sale = {
  ...pendingSale,
  paymentStatus: 'received',
  paymentDetails: [
    {
      ...pendingSale.paymentDetails[0],
      status: 'received',
      paidDate: '2026-09-20',
    },
  ],
};
const afterPayment = calculateDashboardProjection({
  sales: [paidSale],
  expenses: [],
  competence,
  viewMode: 'PROJETADO',
  taxesEstimated: 0,
});
assert(
  beforePayment.activeRevenue.total === 500 &&
  afterPayment.activeRevenue.total === 500 &&
  beforePayment.realizedRevenue.total === 0 &&
  afterPayment.realizedRevenue.total === 500,
  'DASH-PROJ-08: Transição de aberto para pago mantém total projetado inalterado e transfere valor para realizado'
);

// DASH-PROJ-09: Segregação CPF + CNPJ em Receitas soma 100%
assert(
  realizedProj.activeRevenue.cpf + realizedProj.activeRevenue.cnpj === realizedProj.activeRevenue.total &&
  projectedProj.activeRevenue.cpf + projectedProj.activeRevenue.cnpj === projectedProj.activeRevenue.total,
  'DASH-PROJ-09: Subtotais de CPF e PJ de receitas somam exatamente 100% do total em ambos os modos'
);

// DASH-PROJ-10: Segregação CPF e CNPJ de Despesas soma 100%
assert(
  realizedProj.activeExpenses.cpfDeductible + realizedProj.activeExpenses.cnpjOperational === realizedProj.activeExpenses.total &&
  projectedProj.activeExpenses.cpfDeductible + projectedProj.activeExpenses.cnpjOperational === projectedProj.activeExpenses.total,
  'DASH-PROJ-10: Subtotais de despesas (Dedutível PF + Operacional PJ) somam exatamente 100% em ambos os modos'
);

// DASH-PROJ-11: Contagem de lançamentos de despesas coerente
assert(
  realizedProj.activeExpenses.count === 1 && projectedProj.activeExpenses.count === 3,
  'DASH-PROJ-11: Contagem de lançamentos de despesas reflete exatamente os itens considerados (1 realizado, 3 projetados)'
);

// DASH-PROJ-12: Contagem de vendas considerada reflete as vendas ativas
assert(
  realizedProj.activeRevenue.salesCount === 1 && projectedProj.activeRevenue.salesCount === 3,
  'DASH-PROJ-12: Contagem de vendas reflete as vendas do período considerado (1 realizada, 3 projetadas)'
);

// DASH-PROJ-13: Dedução exata de impostos projetados no resultado operacional
assertClose(
  projectedProj.netResult,
  projectedProj.operatingResult - taxesEstimated,
  'DASH-PROJ-13: Resultado Líquido = Resultado Operacional - Provisão Tributária (-2000 - 255.75 = -2255.75)'
);

// DASH-PROJ-14: Margem líquida percentual canônica
const expectedMargin = (-2255.75 / 1800.0) * 100;
assertClose(
  projectedProj.netMarginPercent,
  expectedMargin,
  `DASH-PROJ-14: Margem Líquida Real calculada com precisão: ${projectedProj.netMarginPercent.toFixed(2)}%`
);

// DASH-PROJ-15: Retrocompatibilidade de getMonthlyReceivablesSummary
const recSummary = getMonthlyReceivablesSummary(salesFixture, competence);
assert(
  recSummary.totalReceived === 1000 &&
  recSummary.totalToReceive === 800 &&
  recSummary.totalPending === 800 &&
  recSummary.overdueAmount === 300,
  'DASH-PROJ-15: getMonthlyReceivablesSummary mantém retrocompatibilidade e inclui carry-over de atrasados'
);

// DASH-PROJ-16: Retrocompatibilidade de getMonthlyExpensesSummary
const expSummary = getMonthlyExpensesSummary(expensesFixture, competence);
assert(
  expSummary.totalPaid === 2000 &&
  expSummary.totalToPay === 1800 &&
  expSummary.overdueAmount === 600,
  'DASH-PROJ-16: getMonthlyExpensesSummary mantém retrocompatibilidade e inclui carry-over de atrasados'
);

// DASH-PROJ-17: Suporte robusto a formato de competência 'YYYY-MM-DD'
const dateStringCompetenceProj = calculateDashboardProjection({
  sales: salesFixture,
  expenses: expensesFixture,
  competence: '2026-09-15',
  viewMode: 'PROJETADO',
  taxesEstimated,
});
assert(
  dateStringCompetenceProj.activeRevenue.total === 1800 &&
  dateStringCompetenceProj.activeExpenses.total === 3800,
  'DASH-PROJ-17: Competência no formato YYYY-MM-DD calcula os mesmos limites do mês com precisão'
);

console.log('\n======================================================');
console.log('🎉 TODOS OS 17 CRITÉRIOS DASH-PROJ FORAM HOMOLOGADOS COM SUCESSO!');
console.log('======================================================\n');
