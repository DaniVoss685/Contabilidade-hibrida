// Histórico mês a mês do excesso de Livro Caixa (detalhe clicável no Dashboard).
// Garante que o detalhe mostrado é a MESMA conta do Carnê-Leão e que o "porquê" faz sentido.
// Rodar com: npx tsx tests/functional/livroCaixaExcessHistory.test.ts

import { readFileSync } from 'node:fs';
import { calculateCpfMonthlyTax, getLivroCaixaMonthlyHistory } from '../../src/lib/taxEngine';
import { Expense, PaymentMethod, Sale, SaleInstallment } from '../../src/types';
import { normalizeIgnoredMonths, setMonthIgnored } from '../../src/lib/carneLeaoExcessSettings';
import { mapAppPreferencesToDb, mapDbPreferencesToApp } from '../../src/lib/supabaseClient';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const inst = (id: string, saleId: string, paymentDate: string, value: number): SaleInstallment =>
  ({
    id, saleId, installmentNumber: 1, totalInstallments: 1, value, dueDate: paymentDate,
    status: 'RECEBIDO', paymentDate, amountReceived: value, paymentMethod: 'PIX' as PaymentMethod,
  } as SaleInstallment);
const cpfSale = (id: string, paymentDate: string, value: number): Sale =>
  ({
    id, orgId: 'o', taxOrigin: 'CPF', patientId: 'p', patientName: 'P', patientCpf: '',
    payerIsBeneficiary: true, procedureName: 'Proc', description: '', totalValue: value,
    serviceDate: paymentDate, paymentMethod: 'PIX' as PaymentMethod, installmentsCount: 1,
    installments: [inst(`i_${id}`, id, paymentDate, value)], createdAt: paymentDate,
  } as Sale);
const cpfExpense = (id: string, paymentDate: string, value: number, dl: 'SIM' | 'CONDICIONAL' | 'NAO' = 'SIM'): Expense =>
  ({
    id, entity: 'CPF', value, status: 'PAGO', paymentDate, dueDate: paymentDate,
    dedutivelLivroCaixaPf: dl, description: 'x', supplierName: 'f',
  } as unknown as Expense);

// Cenário parecido com o da Bizone: setembro sem receita, outubro com pouca receita, novembro com muita.
const sales: Sale[] = [
  cpfSale('s_out', '2026-10-10', 3300),
  cpfSale('s_nov', '2026-11-10', 24848),
];
const expenses: Expense[] = [
  cpfExpense('e_set1', '2026-09-05', 2639.99, 'SIM'),
  cpfExpense('e_set2', '2026-09-12', 2239.94, 'CONDICIONAL'),
  cpfExpense('e_set3', '2026-09-20', 500, 'NAO'), // não dedutível: nunca entra
  cpfExpense('e_out1', '2026-10-08', 7110.53, 'SIM'),
  cpfExpense('e_out2', '2026-10-15', 2020.39, 'CONDICIONAL'),
  cpfExpense('e_nov1', '2026-11-04', 9225.22, 'SIM'),
];

console.log('\n=== 1. Histórico mês a mês ===');
{
  const history = getLivroCaixaMonthlyHistory(sales, expenses, '2026-11', 2026, undefined, 0, 0);
  assert(history.length === 11, 'devolve janeiro até o mês apurado (11 linhas até novembro)');
  const set = history[8];
  const out = history[9];
  const nov = history[10];

  assert(near(set.despesas, 4879.93) && set.despesasCount === 2, 'setembro: só despesas SIM + CONDICIONAL entram (NÃO fica de fora)');
  assert(set.rendimentos === 0 && near(set.utilizado, 0) && near(set.excessoProximoMes, 4879.93), 'setembro: sem receita, nada deduzido, tudo vira excesso');
  assert(/Não houve receita/.test(set.motivo), 'setembro: o porquê explica que não houve receita');

  assert(near(out.excessoAnterior, 4879.93) && near(out.rendimentos, 3300), 'outubro: recebe o excesso de setembro e a receita de R$ 3.300');
  assert(near(out.utilizado, 3300), 'outubro: dedução limitada à receita do mês');
  assert(near(out.excessoProximoMes, out.disponivel - 3300), 'outubro: o que sobra = disponível − receita');
  assert(/não pode passar da receita/.test(out.motivo), 'outubro: o porquê cita o limite da receita');

  assert(near(nov.excessoAnterior, out.excessoProximoMes), 'novembro recebe exatamente o excesso que sobrou de outubro');
  assert(nov.excessoProximoMes === 0 || nov.excessoProximoMes > 0, 'novembro tem resultado numérico');
}

console.log('\n=== 2. Mesma conta do Carnê-Leão (sem divergência na tela) ===');
{
  const history = getLivroCaixaMonthlyHistory(sales, expenses, '2026-11', 2026, undefined, 0, 0);
  const real = calculateCpfMonthlyTax(sales, expenses, '2026-11', 2026, undefined, 0, 0).monthlyCalculation;
  const nov = history[history.length - 1];
  assert(near(nov.excessoAnterior, real.excessoLivroCaixaAnterior), 'excesso trazido do histórico = excesso do cálculo do Carnê-Leão');
  assert(near(nov.disponivel, real.livroCaixaDisponivel), 'disponível do histórico = disponível do Carnê-Leão');
  assert(near(nov.utilizado, real.livroCaixaUtilizado), 'utilizado do histórico = utilizado do Carnê-Leão');
  assert(near(nov.excessoProximoMes, real.excessoLivroCaixaProximoMes), 'excesso para o próximo mês bate com o Carnê-Leão');
}

console.log('\n=== 3. Dezembro encerra o excesso (não passa para o ano seguinte) ===');
{
  const decExpenses = [cpfExpense('e_dez', '2026-12-05', 5000, 'SIM')];
  const history = getLivroCaixaMonthlyHistory([], decExpenses, '2026-12', 2026, undefined, 0, 0);
  const dez = history[11];
  assert(near(dez.despesas, 5000) && near(dez.excessoProximoMes, 5000), 'dezembro sem receita: o saldo aparece como sobra');
  assert(/NÃO vai para o ano seguinte/.test(dez.motivo), 'dezembro: o porquê avisa que o saldo é encerrado');
  const jan = getLivroCaixaMonthlyHistory([], decExpenses, '2027-01', 2027, undefined, 0, 0);
  assert(jan.length === 1 && near(jan[0].excessoAnterior, 0), 'janeiro do ano seguinte começa sem excesso');
}

console.log('\n=== 4. Receita cobre tudo: nada sobra ===');
{
  const history = getLivroCaixaMonthlyHistory(
    [cpfSale('s', '2026-03-10', 10000)],
    [cpfExpense('e', '2026-03-12', 4000, 'SIM')],
    '2026-03', 2026, undefined, 0, 0
  );
  const mar = history[2];
  assert(near(mar.utilizado, 4000) && near(mar.excessoProximoMes, 0), 'março: usou todas as despesas e não sobrou nada');
  assert(/cobriu/.test(mar.motivo), 'março: o porquê diz que a receita cobriu as despesas');
}

console.log('\n=== 5. Tela: linha de excesso clicável abre o detalhe ===');
{
  const dash = readFileSync('src/components/Dashboard/DashboardView.tsx', 'utf-8');
  const modal = readFileSync('src/components/Dashboard/LivroCaixaExcessModal.tsx', 'utf-8');
  assert(dash.includes('data-testid="open-excess-details"') && dash.includes('setIsExcessModalOpen(true)'), 'a linha "Excesso trazido" é um botão que abre o detalhe');
  assert(dash.includes('<LivroCaixaExcessModal') && dash.includes('getLivroCaixaMonthlyHistory('), 'Dashboard usa o histórico do motor fiscal (não recalcula por conta própria)');
  assert(modal.includes('Por quê') && modal.includes('Receita recebida (PF)') && modal.includes('Despesas do Livro Caixa'), 'o modal mostra receita, despesas e o porquê de cada mês');
}

console.log('\n=== 6. Meses desativados (receitas ainda não lançadas) ===');
{
  // Setembro e outubro sem as receitas lançadas: desativa os dois e o excesso não é inflado.
  const semAjuste = getLivroCaixaMonthlyHistory(sales, expenses, '2026-11', 2026, undefined, 0, 0);
  const comAjuste = getLivroCaixaMonthlyHistory(sales, expenses, '2026-11', 2026, undefined, 0, 0, ['2026-09', '2026-10']);
  const novSem = semAjuste[10];
  const novCom = comAjuste[10];
  assert(novSem.excessoAnterior > 10000, 'sem ajuste: novembro recebe o excesso inflado de setembro/outubro');
  assert(near(novCom.excessoAnterior, 0), 'com setembro e outubro desativados: novembro recebe R$ 0,00 de excesso');
  assert(comAjuste[8].ignorado && comAjuste[9].ignorado && !comAjuste[10].ignorado, 'as linhas desativadas ficam marcadas como ignoradas');
  assert(/Mês desativado/.test(comAjuste[8].motivo) && /Reative/.test(comAjuste[8].motivo), 'o porquê explica que o mês está desativado e como reativar');
  assert(near(comAjuste[8].despesas, 4879.93) && near(comAjuste[8].excessoProximoMes, 4879.93), 'mesmo desativado, o mês mostra o que ELE geraria (transparência)');
  assert(near(comAjuste[8].excessoRepassado, 0), 'mas o que ele repassa ao mês seguinte é zero');
  assert(semAjuste[8].semReceitaComDespesas && !semAjuste[9].semReceitaComDespesas, 'setembro é sinalizado: despesas sem nenhuma receita lançada');

  // Só setembro desativado: outubro volta a começar do zero e o excesso vem só de outubro.
  const soSetembro = getLivroCaixaMonthlyHistory(sales, expenses, '2026-11', 2026, undefined, 0, 0, ['2026-09']);
  assert(near(soSetembro[9].excessoAnterior, 0), 'com só setembro desativado, outubro não recebe o excesso de setembro');
  assert(near(soSetembro[10].excessoAnterior, soSetembro[9].excessoProximoMes), 'novembro recebe exatamente o excesso de outubro');

  // O mês apurado nunca é desativado (só os anteriores alimentam o excesso).
  const alvo = getLivroCaixaMonthlyHistory(sales, expenses, '2026-11', 2026, undefined, 0, 0, ['2026-11']);
  assert(!alvo[10].ignorado && near(alvo[10].excessoAnterior, semAjuste[10].excessoAnterior), 'desativar o próprio mês apurado não muda nada');

  // O Carnê-Leão usa a mesma regra (nenhuma divergência entre o detalhe e o imposto).
  const real = calculateCpfMonthlyTax(sales, expenses, '2026-11', 2026, undefined, 0, 0, ['2026-09', '2026-10']).monthlyCalculation;
  assert(near(real.excessoLivroCaixaAnterior, 0) && near(real.livroCaixaDisponivel, 9225.22), 'Carnê-Leão de novembro com os 2 meses desativados: disponível = só as despesas de novembro');
  const realSem = calculateCpfMonthlyTax(sales, expenses, '2026-11', 2026, undefined, 0, 0).monthlyCalculation;
  assert(realSem.livroCaixaUtilizado !== real.livroCaixaUtilizado, 'desativar muda o Livro Caixa utilizado no Carnê-Leão (efeito real no imposto)');

  // Reativar volta ao valor original.
  const reativado = getLivroCaixaMonthlyHistory(sales, expenses, '2026-11', 2026, undefined, 0, 0, setMonthIgnored(['2026-09', '2026-10'], '2026-09', false).filter((m) => m !== '2026-10'));
  assert(near(reativado[10].excessoAnterior, semAjuste[10].excessoAnterior), 'reativar os meses devolve o excesso original');
}

console.log('\n=== 7. Lista de meses e persistência ===');
{
  assert(JSON.stringify(setMonthIgnored([], '2026-10', true)) === '["2026-10"]', 'desativar adiciona o mês');
  assert(JSON.stringify(setMonthIgnored(['2026-10'], '2026-09', true)) === '["2026-09","2026-10"]', 'lista fica ordenada');
  assert(JSON.stringify(setMonthIgnored(['2026-09', '2026-10'], '2026-09', false)) === '["2026-10"]', 'reativar remove o mês');
  assert(JSON.stringify(setMonthIgnored(['2026-09'], '2026-09', true)) === '["2026-09"]', 'desativar duas vezes não duplica');
  assert(JSON.stringify(normalizeIgnoredMonths(['2026-13', 'x', 5, '2026-02', '2026-02'])) === '["2026-02"]', 'valores inválidos e repetidos são descartados');
  assert(JSON.stringify(setMonthIgnored(undefined, 'lixo', true)) === '[]', 'chave de mês inválida é ignorada');

  const semAjuste = mapAppPreferencesToDb({ alertFatorR: true, alertDueDates: true, operationalReminders: true }, 'clinic_x');
  assert(!('carne_leao_settings' in semAjuste), 'sem ajuste salvo a coluna NÃO é enviada (gravação de preferências não depende da migração)');
  const comAjuste = mapAppPreferencesToDb({ alertFatorR: true, alertDueDates: true, operationalReminders: true, carneLeaoSettings: { excessIgnoredMonths: ['2026-09'] } }, 'clinic_x');
  assert(JSON.stringify(comAjuste.carne_leao_settings) === '{"excessIgnoredMonths":["2026-09"]}', 'com ajuste, a lista de meses é gravada em carne_leao_settings');
  const volta = mapDbPreferencesToApp({ carne_leao_settings: { excessIgnoredMonths: ['2026-09'] } });
  assert(volta.carneLeaoSettings?.excessIgnoredMonths?.[0] === '2026-09', 'leitura do banco devolve os meses desativados');
  assert(mapDbPreferencesToApp({}).carneLeaoSettings === undefined, 'tenant sem ajuste: nenhum mês desativado (comportamento anterior)');
}

console.log('\n=== 8. Tela: botão por mês e aviso ===');
{
  const modal = readFileSync('src/components/Dashboard/LivroCaixaExcessModal.tsx', 'utf-8');
  const dash = readFileSync('src/components/Dashboard/DashboardView.tsx', 'utf-8');
  assert(modal.includes('Considerar este mês no excesso') && modal.includes('onToggleMonth(row.monthKey'), 'cada mês anterior tem o interruptor "Considerar este mês no excesso"');
  assert(modal.includes('Nenhuma receita de pessoa física lançada neste mês'), 'mês sem receita lançada é sinalizado');
  assert(dash.includes('ignoredExcessMonths') && dash.includes('handleToggleExcessMonth') && dash.includes('excess-ignored-warning'), 'Dashboard aplica a escolha, salva nas preferências e avisa no card');
  for (const f of ['src/components/Taxes/TaxesView.tsx', 'src/components/Reports/ReportsView.tsx']) {
    assert(readFileSync(f, 'utf-8').includes('excessIgnoredMonths'), `${f.split('/').pop()} usa a mesma escolha de meses (sem número diferente entre telas)`);
  }
  assert(readFileSync('src/components/Financial/FinancialDashboard.tsx', 'utf-8').includes('excessIgnoredMonths'), 'DRE anual usa a mesma escolha de meses');
  assert(dash.includes('ignoredBeforeCount > 0') && dash.includes('data-testid="reactivate-excess-months"'), 'com meses desativados a linha do excesso continua visível (mesmo com R$ 0,00) e há o botão "Reativar meses"');
  assert(/row\.ignorado\s*\)/.test(modal) && modal.includes('Meses DESATIVADOS ficam sempre visíveis'), 'o detalhe lista sempre os meses desativados, mesmo sem movimento, para poderem ser reativados');
}

console.log(`\n${passed} verificações passaram.`);
