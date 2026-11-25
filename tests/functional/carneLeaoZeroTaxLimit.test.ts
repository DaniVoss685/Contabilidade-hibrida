// "Quanto posso emitir de recibo sem pagar imposto?" — limite de receita do mês com IRPF = R$ 0,00.
// Rodar com: npx tsx tests/functional/carneLeaoZeroTaxLimit.test.ts

import { readFileSync } from 'node:fs';
import { calculateCarneLeaoMensal, calculateZeroTaxIncomeLimit, type CarneLeaoMonthlyInput } from '../../src/lib/carneLeaoCalculation';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const near = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;
// A apuração arredonda o imposto em centavos: logo acima da faixa isenta (base 2.428,80) o imposto ainda arredonda
// para R$ 0,00 por alguns centavos. O limite real do motor pode ficar até R$ 0,10 acima do teórico.
const nearLimit = (a: number, b: number) => near(a, b, 0.1);

const base = (over: Partial<CarneLeaoMonthlyInput>): CarneLeaoMonthlyInput => ({
  year: 2026, month: 11,
  taxableIncome: 0, livroCaixaExpensesPaid: 0, previousLivroCaixaExcess: 0,
  deductibleInss: 0, deductibleDependents: 0,
  ...over,
});
const taxAt = (input: CarneLeaoMonthlyInput, income: number) =>
  calculateCarneLeaoMensal({ ...input, taxableIncome: income }).impostoFinal;

console.log('\n=== 1. Caso da Bizone (Nov/2026): R$ 24.848 de receita, R$ 19.517,46 de Livro Caixa disponível ===');
{
  const input = base({ taxableIncome: 24848, livroCaixaExpensesPaid: 9225.22, previousLivroCaixaExcess: 10292.24 });
  const r = calculateZeroTaxIncomeLimit(input);
  assert(nearLimit(r.limiteReceita, 19517.46 + 2428.80), `limite = Livro Caixa (19.517,46) + faixa isenta (2.428,80) = 21.946,26 (obtido ${r.limiteReceita})`);
  assert(near(r.receitaAtual, 24848), 'receita atual considerada = 24.848,00');
  assert(nearLimit(r.folga, 21946.26 - 24848), `folga negativa: já passou R$ 2.901,74 do limite (obtido ${r.folga})`);
  assert(near(r.impostoNaReceitaAtual, 557.17), 'o DARF do mês continua o mesmo do Carnê-Leão (R$ 557,17)');
  assert(taxAt(input, r.limiteReceita) === 0, 'no limite o imposto é exatamente R$ 0,00');
  assert(taxAt(input, r.limiteReceita + 0.01) > 0, 'um centavo acima do limite já gera imposto');
}

console.log('\n=== 2. Folga positiva: receita menor que o limite ===');
{
  const input = base({ taxableIncome: 12000, livroCaixaExpensesPaid: 9225.22, previousLivroCaixaExcess: 10292.24 });
  const r = calculateZeroTaxIncomeLimit(input);
  assert(nearLimit(r.folga, 21946.26 - 12000), `com R$ 12.000 recebidos ainda cabem R$ 9.946,26 (obtido ${r.folga})`);
  assert(r.impostoNaReceitaAtual === 0, 'dentro do limite não há DARF');
}

console.log('\n=== 3. Sem despesas: vale o desconto simplificado e a redução especial de 2026 ===');
{
  const input = base({});
  const r = calculateZeroTaxIncomeLimit(input);
  assert(r.limiteReceita >= 5000 && r.limiteReceita < 5400, `sem despesas o limite fica logo acima de R$ 5.000 (obtido ${r.limiteReceita})`);
  assert(taxAt(input, r.limiteReceita) === 0 && taxAt(input, r.limiteReceita + 0.01) > 0, 'fronteira exata (R$ 0,00 no limite, imposto 1 centavo depois)');
  assert(near(r.folga, r.limiteReceita), 'sem receita, a folga é o próprio limite');
}

console.log('\n=== 4. Despesas maiores que a receita: o limite sobe junto ===');
{
  const poucas = calculateZeroTaxIncomeLimit(base({ livroCaixaExpensesPaid: 2000 }));
  const muitas = calculateZeroTaxIncomeLimit(base({ livroCaixaExpensesPaid: 10000 }));
  assert(muitas.limiteReceita > poucas.limiteReceita, 'quanto mais despesas de Livro Caixa, mais recibo cabe sem imposto');
  assert(nearLimit(muitas.limiteReceita, 10000 + 2428.80), `com R$ 10.000 de despesas o limite é 12.428,80 (obtido ${muitas.limiteReceita})`);
}

console.log('\n=== 5. INSS e dependentes também aumentam o limite ===');
{
  const sem = calculateZeroTaxIncomeLimit(base({ livroCaixaExpensesPaid: 10000 }));
  const com = calculateZeroTaxIncomeLimit(base({ livroCaixaExpensesPaid: 10000, deductibleInss: 500, deductibleDependents: 189.59 }));
  assert(near(com.limiteReceita - sem.limiteReceita, 689.59), `INSS (500) + 1 dependente (189,59) somam R$ 689,59 ao limite (obtido ${com.limiteReceita - sem.limiteReceita})`);
}

console.log('\n=== 6. O imposto nunca cai quando a receita sobe (base da busca) ===');
{
  const input = base({ livroCaixaExpensesPaid: 4000, previousLivroCaixaExcess: 1500 });
  let anterior = -1;
  let ok = true;
  for (let receita = 0; receita <= 40000; receita += 37.13) {
    const t = taxAt(input, receita);
    if (t + 0.005 < anterior) ok = false;
    anterior = t;
  }
  assert(ok, 'imposto não decrescente em toda a faixa de 0 a R$ 40.000');
}

console.log('\n=== 7. Tela: foco do card CPF é o recibo possível ===');
{
  const dash = readFileSync('src/components/Dashboard/DashboardView.tsx', 'utf-8');
  assert(dash.includes('calculateZeroTaxIncomeLimit(') && dash.includes('data-testid="cpf-zero-tax-room"'), 'Dashboard calcula e mostra o limite sem imposto');
  assert(dash.includes('Pode fazer de recibo no mês, sem imposto') && dash.includes('Receita atual do mês') && dash.includes('data-testid="cpf-zero-tax-bar"'), 'foco do card: dois campos (quanto pode fazer de recibo × receita atual) e a barra entre eles');
  assert(dash.includes('vão para nota fiscal') && dash.includes('ainda cabem') || dash.includes('Ainda cabem'), 'a barra diz quanto vai para nota fiscal (ou quanto ainda cabe em recibos)');
  assert(!dash.includes('vira DARF') && dash.includes('gera DAS'), 'o texto não diz mais que o excedente "vira DARF": ele vai para nota fiscal e gera DAS');
  assert(dash.includes('data-testid="cpf-zero-tax-more"') && dash.includes('showCpfMoreInfo') && dash.includes('data-testid="cpf-zero-tax-das-estimate"'), 'DARF, Livro Caixa e a estimativa de DAS da nota ficam em "Mais informações" (recolhido)');
  assert(!/bg-amber-600/.test(dash.slice(dash.indexOf('cpf-zero-tax-room') - 200, dash.indexOf('cpf-zero-tax-room') + 600)), 'sem o fundo laranja chamativo');
  assert(dash.includes('data-testid="cpf-irpf-value"') && dash.includes('DARF que seria pago se tudo ficasse em recibo'), 'o DARF continua visível, só que como informação secundária');
  assert(dash.includes('zeroTaxLimit ? ('), 'no resumo anual o card antigo (IRPF a recolher) continua');
}

console.log(`\n${passed} verificações passaram.`);
