// Economia do modelo híbrido: imposto do mês se tudo fosse só no Carnê-Leão, só no CNPJ, e como está (híbrido).
// Rodar com: npx tsx tests/functional/hybridSavings.test.ts
import { readFileSync } from 'node:fs';
import { calculateCarneLeaoMensal } from '../../src/lib/carneLeaoCalculation';
import { computeHybridSavings } from '../../src/lib/hybridSavings';

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

const cpfMonth = (taxableIncome: number, despesas: number, excessoAnterior = 0) =>
  calculateCarneLeaoMensal({ year: 2026, month: 11, taxableIncome, livroCaixaExpensesPaid: despesas, previousLivroCaixaExcess: excessoAnterior, deductibleInss: 0, deductibleDependents: 0 });

console.log('\n=== 1. Híbrido bem planejado: recibo até o limite, o resto em nota ===');
{
  // R$ 26.198 de receita: R$ 11.654,08 em recibo (sem imposto) + R$ 14.543,92 em nota (DAS a 6%).
  const cpf = cpfMonth(11654.08, 9225.22);
  assert(cpf.impostoFinal === 0, 'a parte em recibo não paga Carnê-Leão');
  const s = computeHybridSavings({ cpf, cnpjRevenue: 14543.92, hybridDas: 872.64, simplesEffectiveRatePct: 6 });
  assert(near(s.receitaTotal, 26198), `receita total = 26.198,00 (obtido ${s.receitaTotal})`);
  assert(near(s.hibrido.total, 872.64) && s.hibrido.carneLeao === 0 && near(s.hibrido.das, 872.64), 'híbrido = só o DAS da nota (R$ 872,64)');
  assert(near(s.tudoCpf.imposto, 3758.78), `tudo no Carnê-Leão = R$ 3.758,78 (obtido ${s.tudoCpf.imposto})`);
  assert(near(s.tudoCnpj.imposto as number, 1571.88), `tudo no CNPJ = 6% de 26.198 = R$ 1.571,88 (obtido ${s.tudoCnpj.imposto})`);
  assert(near(s.economiaVsCpf, 3758.78 - 872.64), `economia contra tudo no CPF = R$ 2.886,14 (obtido ${s.economiaVsCpf})`);
  assert(near(s.economiaVsCnpj as number, 1571.88 - 872.64), `economia contra tudo no CNPJ = R$ 699,24 (obtido ${s.economiaVsCnpj})`);
  assert(s.melhorAlternativa === 'CNPJ' && near(s.economia, 699.24), 'a economia principal é contra a MELHOR alternativa (tudo no CNPJ)');
  assert(near(s.economiaMaxima, 2886.14), 'economia máxima = contra a pior alternativa (tudo no CPF)');
  assert(near(s.economiaPercentual, 44.49, 0.05), `economia de ~44,5% contra a melhor alternativa (obtido ${s.economiaPercentual})`);
}

console.log('\n=== 2. Tudo em recibo (sem usar o limite): híbrido NÃO economiza ===');
{
  const cpf = cpfMonth(26198, 9225.22);
  const s = computeHybridSavings({ cpf, cnpjRevenue: 0, hybridDas: 0, simplesEffectiveRatePct: 6 });
  assert(near(s.hibrido.total, 3758.78) && near(s.tudoCpf.imposto, 3758.78), 'sem parte em nota, híbrido = tudo no CPF');
  assert(s.economiaVsCpf === 0, 'economia contra tudo no CPF = 0');
  assert(s.economia < 0 && near(s.economia, 1571.88 - 3758.78), 'e custa mais que tudo no CNPJ (economia negativa, sem esconder)');
}

console.log('\n=== 3. Base do Simples indisponível: compara só com o CPF ===');
{
  const cpf = cpfMonth(8000, 4000);
  const s = computeHybridSavings({ cpf, cnpjRevenue: 0, hybridDas: 0, simplesEffectiveRatePct: null });
  assert(s.tudoCnpj.imposto === null && s.economiaVsCnpj === null && !s.comparacaoCompleta, 'sem base do Simples: "tudo no CNPJ" fica indisponível (nunca zero)');
  assert(s.melhorAlternativa === 'CPF' && near(s.economia, 0), 'a melhor alternativa disponível é o CPF');
}

console.log('\n=== 4. Despesas e excesso entram igual nas duas pontas do Carnê-Leão ===');
{
  const com = computeHybridSavings({ cpf: cpfMonth(5000, 0, 8000), cnpjRevenue: 15000, hybridDas: 900, simplesEffectiveRatePct: 6 });
  const sem = computeHybridSavings({ cpf: cpfMonth(5000, 0, 0), cnpjRevenue: 15000, hybridDas: 900, simplesEffectiveRatePct: 6 });
  assert(com.tudoCpf.imposto < sem.tudoCpf.imposto, 'com excesso de Livro Caixa o imposto de "tudo no CPF" é menor (as mesmas deduções valem)');
  assert(com.hibrido.total === 900 && sem.hibrido.total === 900 + sem.hibrido.carneLeao, 'o híbrido usa o imposto real já estimado');
}

console.log('\n=== 5. Arredondamento e extremos ===');
{
  const s = computeHybridSavings({ cpf: cpfMonth(0, 0), cnpjRevenue: 0, hybridDas: 0, simplesEffectiveRatePct: 6 });
  assert(s.receitaTotal === 0 && s.economia === 0 && s.economiaPercentual === 0, 'sem receita: tudo zero, sem divisão por zero');
  const x = computeHybridSavings({ cpf: cpfMonth(1000, 0), cnpjRevenue: 333.33, hybridDas: 20, simplesEffectiveRatePct: 6.0 });
  assert(Number.isInteger(Math.round(x.tudoCnpj.imposto! * 100)) && x.tudoCnpj.imposto === Math.round(x.tudoCnpj.imposto! * 100) / 100, 'valores em centavos');
}

console.log('\n=== 6. Tela: card no Dashboard ===');
{
  const dash = readFileSync('src/components/Dashboard/DashboardView.tsx', 'utf-8');
  const card = readFileSync('src/components/Dashboard/HybridSavingsCard.tsx', 'utf-8');
  assert(dash.includes('<HybridSavingsCard') && dash.includes('computeHybridSavings('), 'Dashboard calcula e mostra o card');
  assert(dash.includes('if (cpfTax.isAnnualSummary) return null;') , 'só no mês selecionado (no resumo anual não aparece)');
  assert(card.includes('Tudo no Carnê-Leão (só PF)') && card.includes('Tudo no CNPJ (só PJ)') && card.includes('Híbrido — como você faz hoje'), 'três cenários lado a lado');
  assert(card.includes('Você economiza') && card.includes('O híbrido não gerou economia'), 'mostra a economia e, quando não há, diz isso com honestidade');
  assert(card.includes('savingOnlyVsWorst') && card.includes('a mais que'), 'se só economiza contra a alternativa mais cara, mostra isso e avisa quanto paga a mais que a mais barata');
  assert(card.includes('Como calculamos'), 'premissas visíveis em "Como calculamos"');
}

console.log(`\n${passed} verificações passaram.`);
