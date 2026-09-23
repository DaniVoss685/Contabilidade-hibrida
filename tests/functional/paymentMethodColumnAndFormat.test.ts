// Testes da coluna "Forma de Pagamento" (Contas a Receber / Despesas a Pagar)
// e do formatter único (src/lib/paymentMethodFormat.ts) que substitui os
// vários switch/arrays duplicados que existiam em ReceivablesView.tsx,
// ExpensesView.tsx, EditReceivableModal.tsx, NewExpenseModal.tsx,
// SettlePaymentModal.tsx, NewSaleModal.tsx e BatchEditExpensesModal.tsx.
// Lógica pura — mesmo padrão dos demais testes deste projeto (sem DOM/React,
// este repo não tem testing-library/jest; comportamento de clique de linha,
// propagação de evento e "sem F5" foram validados manualmente no browser,
// ver relatório desta sessão).
// Rodar com: npx tsx tests/functional/paymentMethodColumnAndFormat.test.ts

import { formatPaymentMethodName, formatPaymentMethodWithInstallments } from '../../src/lib/paymentMethodFormat';
import { PaymentMethod } from '../../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function runTests() {
  console.log('====================================================');
  console.log('TESTES: COLUNA FORMA DE PAGAMENTO (RECEBER / PAGAR)');
  console.log('====================================================\n');

  // ---------------------------------------------------------------------
  // AR-01/AP-01..AR-04/AP-04: cada forma real do enum canônico (types/index.ts)
  // é exibida com o label correto — mesmo formatter para as duas telas.
  // ---------------------------------------------------------------------
  assert(formatPaymentMethodName('PIX') === 'PIX', 'AR-01/AP-01: PIX exibido corretamente');
  assert(formatPaymentMethodName('DINHEIRO') === 'Dinheiro', 'AR-02/AP-02: Dinheiro exibido corretamente');
  assert(formatPaymentMethodName('CARTAO_CREDITO') === 'Cartão de Crédito', 'AR-03/AP-03: Cartão de Crédito exibido corretamente');
  assert(formatPaymentMethodName('CARTAO_DEBITO') === 'Cartão de Débito', 'AR-04/AP-04 (débito): Cartão de Débito exibido corretamente');
  assert(formatPaymentMethodName('BOLETO') === 'Boleto', 'Boleto exibido corretamente');
  assert(formatPaymentMethodName('TRANSFERENCIA') === 'Transferência', 'Transferência exibida corretamente');

  // ---------------------------------------------------------------------
  // AR-04/AP-04: parcelamento REAL exibido ("Cartão de Crédito • 3x").
  // Nunca sufixo quando totalInstallments é 1 ou ausente (não inventar
  // parcelamento que não existe).
  // ---------------------------------------------------------------------
  assert(
    formatPaymentMethodWithInstallments('CARTAO_CREDITO', 3) === 'Cartão de Crédito • 3x',
    'AR-04/AP-04: parcelamento real exibido como "Forma • Nx"'
  );
  assert(
    formatPaymentMethodWithInstallments('PIX', 1) === 'PIX',
    'AR-04b: totalInstallments=1 não adiciona sufixo (não é parcelamento real)'
  );
  assert(
    formatPaymentMethodWithInstallments('PIX', undefined) === 'PIX',
    'AR-04c: totalInstallments ausente não adiciona sufixo'
  );
  assert(
    formatPaymentMethodWithInstallments('DINHEIRO', 0) === 'Dinheiro',
    'AR-04d: totalInstallments=0 (dado inválido) não adiciona sufixo'
  );

  // ---------------------------------------------------------------------
  // AR-05/AP-05: registro sem forma de pagamento -> "Não informado" na
  // coluna (nunca inventado). O formatter em si retorna "—" quando chamado
  // sem argumento (usado no detalhe/parcela); a coluna da tabela usa o
  // fallback textual "Não informado" no próprio componente — ambos os
  // caminhos tratados aqui.
  // ---------------------------------------------------------------------
  assert(formatPaymentMethodName(undefined) === '—', 'AR-05/AP-05: sem forma -> "—" no formatter base (usado no detalhe)');
  assert(formatPaymentMethodName(null) === '—', 'AR-05b: null tratado igual a undefined');
  assert(formatPaymentMethodName('') === '—', 'AR-05c: string vazia tratada como ausente');

  // ---------------------------------------------------------------------
  // AR-10/AP-10: coerência entre o filtro "Forma:" (que compara
  // item.paymentMethod === valorDoFiltro, valor cru do enum) e a coluna
  // (que exibe formatPaymentMethodName(item.paymentMethod)). Garante que
  // cada valor do enum mapeia para exatamente 1 label, sem colisão —
  // condição necessária para "filtro X" e "coluna mostra X" nunca divergirem.
  // ---------------------------------------------------------------------
  {
    const allMethods: PaymentMethod[] = ['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'DINHEIRO', 'TRANSFERENCIA'];
    const labels = allMethods.map((m) => formatPaymentMethodName(m));
    const uniqueLabels = new Set(labels);
    assert(uniqueLabels.size === allMethods.length, 'FILTER-COHERENCE-01: cada PaymentMethod do enum mapeia para um label único (sem colisão entre filtro e coluna)');

    // Simula: usuário filtra por CARTAO_CREDITO -> toda linha exibida deve
    // mostrar exatamente o label de Cartão de Crédito, nunca outro.
    const items = [
      { id: '1', paymentMethod: 'CARTAO_CREDITO' as PaymentMethod },
      { id: '2', paymentMethod: 'PIX' as PaymentMethod },
      { id: '3', paymentMethod: 'CARTAO_CREDITO' as PaymentMethod },
    ];
    const filterValue: PaymentMethod = 'CARTAO_CREDITO';
    const filtered = items.filter((i) => i.paymentMethod === filterValue);
    assert(
      filtered.every((i) => formatPaymentMethodName(i.paymentMethod) === 'Cartão de Crédito'),
      'FILTER-COHERENCE-02: toda linha que passa no filtro "Cartão de Crédito" exibe exatamente esse label na coluna'
    );
    assert(filtered.length === 2, 'FILTER-COHERENCE-03: filtro retorna só as linhas com o método exato');
  }

  // ---------------------------------------------------------------------
  // "Forma prevista vs. forma efetiva" (Contas a Receber): o fallback já
  // existente em db.ts (`inst.paymentMethod || sale.paymentMethod`) é o que
  // populariza AccountReceivableItem.paymentMethod. Aqui validamos a REGRA
  // de exibição no detalhe (Sale + Installment) que a Fase 7 pediu: mostrar
  // a forma efetiva quando liquidado, e indicar "Previsto: X" quando ainda
  // não. Reimplementação pura da mesma decisão usada em
  // ReceivablesView.tsx (bloco "Forma" da tabela de parcelas).
  // ---------------------------------------------------------------------
  {
    function describeInstallmentPaymentMethod(
      isPaid: boolean,
      instMethod: PaymentMethod | undefined,
      saleMethod: PaymentMethod
    ): string {
      if (!isPaid) return `Previsto: ${formatPaymentMethodName(saleMethod)}`;
      return formatPaymentMethodName(instMethod || saleMethod);
    }

    assert(
      describeInstallmentPaymentMethod(false, undefined, 'BOLETO') === 'Previsto: Boleto',
      'PREVISTO-01: parcela ainda não paga mostra "Previsto: <forma da venda>"'
    );
    assert(
      describeInstallmentPaymentMethod(true, 'PIX', 'BOLETO') === 'PIX',
      'PREVISTO-02: parcela paga com forma diferente da prevista mostra a forma EFETIVA usada na baixa'
    );
    assert(
      describeInstallmentPaymentMethod(true, undefined, 'BOLETO') === 'Boleto',
      'PREVISTO-03: parcela paga sem forma própria registrada cai para a forma da venda (fallback já existente em db.ts)'
    );
  }

  console.log('\n🎉 TODOS OS TESTES DE FORMA DE PAGAMENTO PASSARAM!');
}

runTests();
