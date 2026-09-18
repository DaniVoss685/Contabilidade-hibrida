import {
  isValidCivilDate,
  isFutureCivilDate,
  calculateAge,
  calculateNextBirthday,
  calculateCivilDaysDiff,
  getTodayCivilDate,
} from '../src/lib/masks';
import {
  calculatePatientFinancialSummary,
  enhanceSaleHistoryItem,
} from '../src/lib/patientHistory';
import { Sale } from '../src/types';

function runTests() {
  console.log('====================================================');
  console.log('BATERIA DE TESTES DO PRONTUÁRIO CLÍNICO-FINANCEIRO');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(testId: string, description: string, condition: boolean, details = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [${testId}] ${description} -> PASS`);
    } else {
      console.error(`❌ [${testId}] ${description} -> FAIL ${details}`);
    }
  }

  // 1. Validação de Datas
  assert(
    'DATE-01',
    'Data civil válida YYYY-MM-DD reconhecida',
    isValidCivilDate('1990-04-18') && isValidCivilDate('2000-02-29')
  );

  assert(
    'DATE-02',
    'Data civil com mês inválido rejeitada',
    !isValidCivilDate('1990-13-18') && !isValidCivilDate('1990-00-10')
  );

  assert(
    'DATE-03',
    'Data civil com dia inválido no mês rejeitada',
    !isValidCivilDate('1990-02-30') && !isValidCivilDate('1990-04-31')
  );

  assert(
    'DATE-04',
    'Data futura identificada corretamente',
    isFutureCivilDate('2099-12-31') && !isFutureCivilDate('1990-04-18')
  );

  // 2. Idade dinâmica
  const age1990 = calculateAge('1990-04-18');
  assert(
    'AGE-01',
    'Idade calculada dinamicamente com precisão',
    typeof age1990 === 'number' && age1990 >= 35 && age1990 <= 37
  );

  // 3. Próximo Aniversário
  const nextBday = calculateNextBirthday('1990-04-18');
  assert(
    'BDAY-01',
    'Próximo aniversário calculado com formato DD/MM/AAAA',
    nextBday !== null && nextBday.formattedDate.startsWith('18/04/') && nextBday.daysUntil > 0
  );

  // Aniversário próximo (hoje)
  const todayParts = getTodayCivilDate().split('-');
  const todayBirth = `1995-${todayParts[1]}-${todayParts[2]}`;
  const nextBdayToday = calculateNextBirthday(todayBirth);
  assert(
    'BDAY-02',
    'Aniversário de hoje detectado com isUpcoming=true e daysUntil=0',
    nextBdayToday !== null && nextBdayToday.daysUntil === 0 && nextBdayToday.isUpcoming === true
  );

  // 4. Perfil Financeiro sem Histórico (PROFILE-05)
  const emptySummary = calculatePatientFinancialSummary([]);
  assert(
    'PROFILE-05',
    'Paciente sem histórico não exibe métricas falsas (0%)',
    emptySummary.behavior.mostUsedPaymentMethod === '—' &&
    emptySummary.behavior.onTimeRate === 'Sem histórico suficiente' &&
    emptySummary.behavior.averageDelayDays === '—' &&
    emptySummary.behavior.overdueCount === 0 &&
    emptySummary.totalBalance === 0
  );

  // 5. Histórico e Métricas Objetivas (PROFILE-01 a PROFILE-04, HISTORY-01 a HISTORY-06)
  const mockSales: Sale[] = [
    {
      id: 'sale_1',
      orgId: 'org_1',
      taxOrigin: 'CPF',
      patientId: 'pat_1',
      patientName: 'Leonardo Teste',
      patientCpf: '12345678901',
      payerIsBeneficiary: true,
      procedureName: 'Profilaxia e Limpeza',
      description: 'Limpeza semestral',
      totalValue: 300,
      serviceDate: '2026-09-01',
      paymentMethod: 'PIX',
      installmentsCount: 1,
      createdAt: '2026-09-01T10:00:00Z',
      installments: [
        {
          id: 'inst_1',
          saleId: 'sale_1',
          installmentNumber: 1,
          totalInstallments: 1,
          value: 300,
          dueDate: '2026-09-01',
          paymentDate: '2026-09-01',
          amountReceived: 300,
          status: 'RECEBIDO',
          paymentMethod: 'PIX',
        },
      ],
    },
    {
      id: 'sale_2',
      orgId: 'org_1',
      taxOrigin: 'CNPJ',
      patientId: 'pat_1',
      patientName: 'Leonardo Teste',
      patientCpf: '12345678901',
      payerIsBeneficiary: true,
      procedureName: 'Tratamento de Canal',
      description: 'Canal molar',
      totalValue: 900,
      serviceDate: '2026-09-05',
      paymentMethod: 'CARTAO_CREDITO',
      installmentsCount: 3,
      createdAt: '2026-09-05T10:00:00Z',
      installments: [
        {
          id: 'inst_2_1',
          saleId: 'sale_2',
          installmentNumber: 1,
          totalInstallments: 3,
          value: 300,
          dueDate: '2026-09-05',
          paymentDate: '2026-09-07', // 2 dias de atraso
          amountReceived: 300,
          status: 'RECEBIDO',
          paymentMethod: 'CARTAO_CREDITO',
        },
        {
          id: 'inst_2_2',
          saleId: 'sale_2',
          installmentNumber: 2,
          totalInstallments: 3,
          value: 300,
          dueDate: '2026-09-10', // Vencido em relação a 2026-09-18
          amountReceived: 0,
          status: 'PENDENTE' as any,
          paymentMethod: 'CARTAO_CREDITO',
        },
        {
          id: 'inst_2_3',
          saleId: 'sale_2',
          installmentNumber: 3,
          totalInstallments: 3,
          value: 300,
          dueDate: '2026-10-10', // Futuro
          amountReceived: 0,
          status: 'PENDENTE' as any,
          paymentMethod: 'CARTAO_CREDITO',
        },
      ],
    },
  ];

  const summary = calculatePatientFinancialSummary(mockSales, '2026-09-18');

  assert(
    'PROFILE-01',
    'Forma de pagamento mais usada identificada',
    summary.behavior.mostUsedPaymentMethod === 'PIX' || summary.behavior.mostUsedPaymentMethod === 'Cartão de Crédito'
  );

  // 2 recebíveis liquidados: inst_1 (no prazo) e inst_2_1 (atrasado) -> 1 de 2 = 50%
  assert(
    'PROFILE-02',
    'Percentual pago no prazo calculado corretamente (50%)',
    summary.behavior.onTimeRate === '50%'
  );

  // Atraso médio: inst_2_1 atrasou 2 dias -> média = 2 dias
  assert(
    'PROFILE-03',
    'Atraso médio calculado corretamente (2 dias)',
    summary.behavior.averageDelayDays === '2 dias'
  );

  // Saldo em aberto: inst_2_2 (300) + inst_2_3 (300) = 600
  assert(
    'PROFILE-04',
    'Saldo em aberto calculado corretamente (R$ 600)',
    summary.behavior.openBalance === 600 && summary.totalBalance === 600
  );

  assert(
    'PROFILE-OVERDUE',
    'Quantidade de parcelas em atraso identificada (1 parcela)',
    summary.behavior.overdueCount === 1
  );

  // Itens enriquecidos
  const enhancedItem1 = enhanceSaleHistoryItem(mockSales[0], '2026-09-18');
  assert(
    'HISTORY-01',
    'Procedimento à vista pago tem status PAGO',
    enhancedItem1.aggregatedStatus === 'PAGO'
  );
  assert(
    'HISTORY-02',
    'Procedimento pago na data tem indicador ✓ No prazo',
    enhancedItem1.timelinessLabel === '✓ No prazo'
  );

  const enhancedItem2 = enhanceSaleHistoryItem(mockSales[1], '2026-09-18');
  assert(
    'HISTORY-06',
    'Venda parcelada com parcelas quitadas e pendentes tem status PARCIAL',
    enhancedItem2.aggregatedStatus === 'PARCIAL' && enhancedItem2.installmentsCount === 3
  );

  console.log(`\n====================================================`);
  console.log(`RESULTADO DA BATERIA: ${passed}/${total} TESTES APROVADOS`);
  console.log(`====================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
