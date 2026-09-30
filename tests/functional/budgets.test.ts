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
  summarizeBudgetItemNames,
} from '../../src/lib/budgets';
import { getBudgetDisplayCode } from '../../src/lib/budgetPdf';

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

console.log('\n=== buildSaleDraftFromBudget: pré-preenche Nova Receita com descrição 100% humana ===');
{
  const draft = buildSaleDraftFromBudget({
    id: 'budget_1790786182020_ulsr',
    total: 450,
    items: [
      { id: 'bitem_1', procedureName: 'Restauração', professionalName: 'Dra. Bruna', quantity: 1, unitPrice: 300, totalPrice: 300 },
      { id: 'bitem_2', procedureName: 'Limpeza', quantity: 1, unitPrice: 150, totalPrice: 150 },
    ],
  });
  assert(draft.totalValue === 450, 'valor pré-preenchido é o TOTAL do orçamento (já com desconto aplicado)');
  assert(draft.procedureName.includes('Restauração') && draft.procedureName.includes('Limpeza'), 'nome do procedimento resume os itens do orçamento');
  assert(draft.budgetId === 'budget_1790786182020_ulsr', 'BUDGET-CONV-02: vínculo estruturado (budgetId) é devolvido separado da descrição, não embutido em texto');
  // BUDGET-CONV-01: nenhum ID técnico nem valor cru na descrição — só texto humano.
  assert(!draft.notes.includes('budget_'), 'BUDGET-CONV-01: descrição nunca contém o ID técnico do orçamento (budget_...)');
  assert(!draft.notes.includes('bitem_'), 'BUDGET-CONV-01: descrição nunca contém ID técnico de item (bitem_...)');
  assert(!/\d+\.\d{2}(?!\d)/.test(draft.notes), 'BUDGET-CONV-01: descrição nunca contém valor cru sem formatação (ex.: 300.00) — o valor já tem campo próprio');
  assert(draft.notes.includes('Restauração') && draft.notes.includes('Limpeza'), 'descrição continua citando os procedimentos em linguagem humana');
}

console.log('\n=== buildSaleDraftFromBudget: 1 item só vira frase curta, muitos itens resumem sem ficar gigante ===');
{
  const oneItem = buildSaleDraftFromBudget({
    id: 'budget_x', total: 1200,
    items: [{ id: 'i1', procedureName: 'Implante dentário', quantity: 1, unitPrice: 1200, totalPrice: 1200 }],
  });
  assert(!oneItem.notes.includes('budget_') && !/\d+\.\d{2}/.test(oneItem.notes), 'BUDGET-CONV-01: mesmo com 1 item, nenhum ID/valor cru vaza para a descrição');

  const manyItems = buildSaleDraftFromBudget({
    id: 'budget_y', total: 5000,
    items: Array.from({ length: 8 }, (_, i) => ({
      id: `i${i}`, procedureName: `Procedimento longo número ${i + 1} com nome bem extenso`, quantity: 1, unitPrice: 600, totalPrice: 600,
    })),
  });
  assert(manyItems.notes.length < 200, 'com muitos itens de nomes longos, a descrição resume (não vira um bloco de texto gigante)');
  assert(manyItems.notes.includes('8'), 'resumo cita a quantidade de procedimentos quando não cabe listar todos');
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
  assert(
    code.includes('budget.convertedSaleId && (') && code.includes("onClick={() => onViewSale(budget)}") && code.includes('Ver venda'),
    'BUDGET-CONV-03/duplicação: orçamento já convertido mostra botão "Ver venda" (navega pra venda de verdade) em vez do botão de converter de novo'
  );
}

console.log('\n=== RBAC: budgets:view/manage existem e estão mapeados na sidebar ===');
{
  const permCode = src('src/lib/permissions.ts');
  assert(permCode.includes("| 'budgets:view'") && permCode.includes("| 'budgets:manage'"), 'permissões declaradas');
  assert(permCode.includes("budgets: ['budgets:view', 'budgets:manage']"), 'aba budgets mapeada no bundle de permissões da sidebar');
  const sidebarCode = src('src/components/Layout/Sidebar.tsx');
  assert(sidebarCode.includes("{ id: 'budgets', label: 'Orçamentos'"), 'item de menu "Orçamentos" existe na sidebar');
}

console.log('\n=== BUDGET-LIST-01/02: resumo dos procedimentos na listagem (summarizeBudgetItemNames) ===');
{
  const one = summarizeBudgetItemNames([{ procedureName: 'Implante dentário' }]);
  assert(one === 'Implante dentário', 'BUDGET-LIST-01: 1 procedimento — listagem mostra o nome dele puro');

  const two = summarizeBudgetItemNames([{ procedureName: 'Implante dentário' }, { procedureName: 'Restauração' }]);
  assert(two === 'Implante dentário + Restauração', '2 procedimentos — resume com "+"');

  const three = summarizeBudgetItemNames([
    { procedureName: 'Implante dentário' }, { procedureName: 'Restauração' }, { procedureName: 'Profilaxia' },
  ]);
  assert(three === 'Implante dentário + Restauração + Profilaxia', 'BUDGET-LIST-02: 3 procedimentos — ainda lista todos, sem estourar linha');

  const many = summarizeBudgetItemNames(
    Array.from({ length: 6 }, (_, i) => ({ procedureName: `Procedimento ${i + 1}` }))
  );
  assert(many === 'Procedimento 1 + Procedimento 2 + 4 outro(s)', 'com muitos itens, resume em "+N outro(s)" em vez de listar tudo');
}

console.log('\n=== Código amigável do orçamento (getBudgetDisplayCode) — nunca expõe o ID técnico ===');
{
  const code1 = getBudgetDisplayCode({ id: 'budget_1790786182020_ulsr', createdAt: '2026-09-29T12:00:00.000Z' });
  assert(/^ORÇ-2026-[A-Z0-9]{6}$/.test(code1), `código amigável no formato ORÇ-AAAA-XXXXXX (recebido: ${code1})`);
  assert(!code1.includes('budget_') && !code1.includes('1790786182020'), 'nunca expõe o ID técnico completo nem o timestamp cru');

  const code2 = getBudgetDisplayCode({ id: 'budget_1790786182020_ulsr', createdAt: '2026-09-29T12:00:00.000Z' });
  assert(code1 === code2, 'determinístico: o mesmo orçamento sempre gera o mesmo código (não é aleatório a cada render)');
}

console.log('\n=== BUDGET-AGENDA: "Agendar tratamento" — botão, pré-preenchimento e financeiro isolado ===');
{
  const viewCode = src('src/components/Budgets/BudgetsView.tsx');
  assert(
    viewCode.includes("(budget.status === 'APROVADO' || budget.status === 'CONVERTIDO') &&") && viewCode.includes('onAgendarTratamento(budget)'),
    'BUDGET-AGENDA-01: botão "Agendar tratamento" só aparece para orçamento aprovado (ou já convertido)'
  );
  assert(!viewCode.includes("budget.status === 'RASCUNHO'") || !viewCode.match(/RASCUNHO[\s\S]{0,40}Agendar/), 'rascunho não oferece "Agendar tratamento" (ainda não foi nem apresentado)');

  const modalCode = src('src/components/Appointments/AppointmentModal.tsx');
  assert(modalCode.includes('initialBudget?: Budget | null'), 'AppointmentModal aceita um orçamento para pré-preenchimento');
  assert(
    modalCode.includes('db.getPatients().find((p) => p.id === initialBudget.patientId)'),
    'BUDGET-AGENDA-02: paciente é pré-preenchido a partir do orçamento'
  );
  assert(
    modalCode.includes('budgetProfessionalIds.length === 1 ? profs.find((p) => p.id === budgetProfessionalIds[0]) : undefined'),
    'BUDGET-AGENDA-03: profissional só é pré-selecionado quando TODOS os itens do orçamento concordam (nunca chuta com 2+ divergentes)'
  );
  assert(
    modalCode.includes('budgetId: initialBudget?.id') && modalCode.includes('autoCreateSale: initialBudget ? false : undefined'),
    'BUDGET-AGENDA-04: consulta criada a partir do orçamento grava o vínculo (budgetId) e NUNCA cria uma 2ª venda por trás (o financeiro é só via "Converter", ação explícita)'
  );

  const detailCode = src('src/components/Budgets/BudgetDetailModal.tsx');
  assert(
    detailCode.includes('db.getAppointments().filter((a) => a.budgetId === budget.id)'),
    'BUDGET-AGENDA-04/05: orçamento mostra TODAS as consultas vinculadas (N por orçamento, não só a última — nunca sobrescreve)'
  );
}

console.log('\n=== Conversão NÃO cria agendamento automaticamente (separação de responsabilidade) ===');
{
  const appCode = src('src/App.tsx');
  const onSaleCreatedIdx = appCode.indexOf('onSaleCreated={(sale) => {');
  const onSaleCreatedEnd = appCode.indexOf('}}', onSaleCreatedIdx);
  const onSaleCreatedBody = appCode.slice(onSaleCreatedIdx, onSaleCreatedEnd);
  assert(
    !onSaleCreatedBody.includes('addAppointment') && !onSaleCreatedBody.includes('setAgendaFromBudget'),
    'converter orçamento em venda nunca dispara agendamento sozinho — "Agendar" continua uma ação separada e explícita do usuário'
  );
}

console.log(`\n${passed} verificações passaram.`);
