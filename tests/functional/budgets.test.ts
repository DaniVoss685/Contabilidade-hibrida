// Fase D: Orçamentos. Criar/editar um orçamento NUNCA gera financeiro/recebível/imposto/movimento
// bancário/taxa/baixa de estoque — só a conversão explícita em venda (ação separada do usuário,
// via Nova Receita pré-preenchida) passa a gerar efeito real. Um orçamento convertido nunca gera
// venda 2x. Rodar com: npx tsx tests/functional/budgets.test.ts

import { readFileSync } from 'node:fs';
import {
  computeBudgetTotals,
  computeItemTotal,
  canConvertToSale,
  isPastValidity,
  buildSaleDraftFromBudget,
} from '../../src/lib/budgets';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const src = (p: string) => readFileSync(p, 'utf-8');

console.log('\n=== computeBudgetTotals: soma itens - desconto (% ou fixo), nunca negativo ===');
{
  const items = [{ totalPrice: 300 }, { totalPrice: 200 }];
  const noDiscount = computeBudgetTotals(items, null, 0);
  assert(noDiscount.subtotal === 500 && noDiscount.total === 500, 'sem desconto: total = subtotal');

  const percent = computeBudgetTotals(items, 'PERCENT', 10);
  assert(Math.abs(percent.discountAmount - 50) < 0.001 && Math.abs(percent.total - 450) < 0.001, '10% de desconto sobre 500 = 450');

  const fixed = computeBudgetTotals(items, 'FIXED', 100);
  assert(fixed.total === 400, 'desconto fixo de R$100 sobre 500 = 400');

  const overDiscount = computeBudgetTotals(items, 'FIXED', 9999);
  assert(overDiscount.total === 0, 'desconto maior que o subtotal nunca deixa o total negativo');

  const overPercent = computeBudgetTotals(items, 'PERCENT', 150);
  assert(overPercent.total === 0, 'desconto percentual > 100% é limitado a 100% (total = 0, nunca negativo)');
}

console.log('\n=== computeItemTotal: quantidade x valor unitário, nunca negativo ===');
{
  assert(computeItemTotal(2, 150) === 300, '2x R$150 = R$300');
  assert(computeItemTotal(-1, 100) === 0, 'quantidade negativa nunca gera total negativo');
  assert(computeItemTotal(1, -50) === 0, 'valor unitário negativo nunca gera total negativo');
}

console.log('\n=== canConvertToSale: orçamento convertido NUNCA gera venda 2x ===');
{
  assert(canConvertToSale('RASCUNHO', null) === true, 'rascunho pode converter (fechamento direto na hora)');
  assert(canConvertToSale('APRESENTADO', null) === true, 'apresentado pode converter');
  assert(canConvertToSale('APROVADO', null) === true, 'aprovado pode converter');
  assert(canConvertToSale('RECUSADO', null) === false, 'recusado não pode converter');
  assert(canConvertToSale('EXPIRADO', null) === false, 'expirado não pode converter');
  assert(canConvertToSale('CONVERTIDO', 'sale_123') === false, 'já convertido nunca pode converter de novo');
  assert(canConvertToSale('APROVADO', 'sale_123') === false, 'convertedSaleId já preenchido bloqueia SEMPRE, independente do status exibido');
}

console.log('\n=== isPastValidity: só para exibição (badge "Vencido"), nunca muda status sozinho ===');
{
  assert(isPastValidity('2026-09-01', '2026-09-29') === true, 'data de validade no passado é reconhecida');
  assert(isPastValidity('2026-10-15', '2026-09-29') === false, 'data futura não é vencida');
  assert(isPastValidity(null, '2026-09-29') === false, 'sem validade definida nunca é considerado vencido');
}

console.log('\n=== buildSaleDraftFromBudget: pré-preenche Nova Receita sem perder a itemização ===');
{
  const draft = buildSaleDraftFromBudget({
    id: 'budget_abc123',
    total: 450,
    items: [
      { id: '1', procedureName: 'Restauração', professionalName: 'Dra. Bruna', quantity: 1, unitPrice: 300, totalPrice: 300 },
      { id: '2', procedureName: 'Limpeza', quantity: 1, unitPrice: 150, totalPrice: 150 },
    ],
  });
  assert(draft.totalValue === 450, 'valor pré-preenchido é o TOTAL do orçamento (já com desconto aplicado)');
  assert(draft.procedureName.includes('Restauração') && draft.procedureName.includes('Limpeza'), 'nome do procedimento resume os itens do orçamento');
  assert(draft.notes.includes('Dra. Bruna') && draft.notes.includes('Restauração') && draft.notes.includes('Limpeza'), 'observações preservam a itemização completa (procedimento + profissional) mesmo Sale sendo de 1 linha só');
}

console.log('\n=== CRIAÇÃO: orçamento NUNCA gera efeito financeiro/fiscal/estoque ===');
{
  const dbCode = src('src/lib/db.ts');
  const startIdx = dbCode.indexOf('public async saveBudget(input:');
  const endIdx = dbCode.indexOf('public async deleteBudget(', startIdx);
  assert(startIdx >= 0 && endIdx > startIdx, 'método saveBudget encontrado por completo');
  const body = dbCode.slice(startIdx, endIdx);
  assert(
    !body.includes('addSale') && !body.includes('recordStockMovements') && !body.includes('consumeProcedureInputsForRecord') && !body.includes('reconcileBankBalances'),
    'saveBudget nunca chama addSale/recordStockMovements/consumeProcedureInputsForRecord/reconcileBankBalances — criar orçamento é 100% isolado'
  );
}

console.log('\n=== ESTOQUE ANTES DE EXECUTAR: orçamento não tem nenhum vínculo com df_stock_movements ===');
{
  const migCode = src('supabase/migrations/20260929160000_budgets.sql');
  assert(!migCode.includes('df_stock_movements') && !migCode.includes('quantity_on_hand'), 'a migration de orçamentos não referencia estoque em nenhum ponto');
}

console.log('\n=== FINANCEIRO ANTES DE CONVERTER: só markBudgetConverted grava converted_sale_id, e só depois da Sale existir ===');
{
  const dbCode = src('src/lib/db.ts');
  assert(
    dbCode.includes('public async markBudgetConverted(budgetId: string, saleId: string)'),
    'existe um método dedicado e único para marcar conversão, recebendo o id de uma venda JÁ criada'
  );
  const appCode = src('src/App.tsx');
  const onSaleCreatedIdx = appCode.indexOf('onSaleCreated={(sale) => {');
  const markConvertedIdx = appCode.indexOf('db.markBudgetConverted(convertingBudget.id, sale.id)');
  assert(
    onSaleCreatedIdx >= 0 && markConvertedIdx > onSaleCreatedIdx && markConvertedIdx - onSaleCreatedIdx < 300,
    'markBudgetConverted só é chamado DEPOIS que NewSaleModal efetivamente criou a Sale (dentro de onSaleCreated, nunca antes)'
  );
}

console.log('\n=== IDEMPOTÊNCIA: markBudgetConverted recusa converter o mesmo orçamento 2x ===');
{
  const dbCode = src('src/lib/db.ts');
  const startIdx = dbCode.indexOf('public async markBudgetConverted(');
  assert(startIdx >= 0, 'markBudgetConverted encontrado');
  const fnBody = dbCode.slice(startIdx, startIdx + 900);
  assert(
    fnBody.includes('if (existing.convertedSaleId) {') && fnBody.includes('return { success: false'),
    'chamar markBudgetConverted num orçamento que já tem convertedSaleId é recusado explicitamente (nunca sobrescreve, nunca gera 2ª venda)'
  );
  const migCode = src('supabase/migrations/20260929160000_budgets.sql');
  assert(
    migCode.includes('converted_sale_id TEXT') && migCode.includes('-- Idempotência de conversão'),
    'converted_sale_id é o campo estrutural que sustenta a idempotência (documentado na migration)'
  );
}

console.log('\n=== UI: botão "Converter" só aparece quando canConvertToSale permite ===');
{
  const code = src('src/components/Budgets/BudgetsView.tsx');
  assert(
    code.includes('canConvertToSale(budget.status, budget.convertedSaleId)') && code.includes('onConvertToSale(budget)'),
    'a UI usa a mesma regra pura para decidir quando exibir o botão de conversão'
  );
  assert(code.includes("budget.convertedSaleId") && code.includes('Venda gerada'), 'orçamento já convertido mostra "Venda gerada" em vez do botão de converter de novo');
}

console.log('\n=== RBAC: budgets:view/manage existem e estão mapeados na sidebar ===');
{
  const permCode = src('src/lib/permissions.ts');
  assert(permCode.includes("| 'budgets:view'") && permCode.includes("| 'budgets:manage'"), 'permissões declaradas');
  assert(permCode.includes("budgets: ['budgets:view', 'budgets:manage']"), 'aba budgets mapeada no bundle de permissões da sidebar');
  const sidebarCode = src('src/components/Layout/Sidebar.tsx');
  assert(sidebarCode.includes("{ id: 'budgets', label: 'Orçamentos'"), 'item de menu "Orçamentos" existe na sidebar');
}

console.log(`\n${passed} verificações passaram.`);
