// Fase C: Estoque REAL sobre os Insumos existentes. Baixa SOMENTE quando o procedimento é
// realmente executado/finalizado (nunca em orçamento/agendamento/venda) — fonte de verdade única:
// a transição de um df_clinical_records para FINALIZED. Idempotência real garantida em banco por
// índice único (tenant, clinical_record_id, input_id, movement_type) + trigger AFTER INSERT (nunca
// BEFORE — ver comentário na migration e no relatório desta rodada sobre o bug real encontrado e
// corrigido: um BEFORE INSERT aplicava o delta mesmo quando a linha era descartada por conflito).
// Rodar com: npx tsx tests/functional/stockManagement.test.ts

import { readFileSync } from 'node:fs';
import {
  computeStockStatus,
  didCrossLowThreshold,
  planProcedureConsumption,
  resolveConsumptionForClinicalRecord,
  computeStockSummary,
} from '../../src/lib/stockMovements';

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

console.log('\n=== computeStockStatus: mínimo 0/não informado nunca alerta sozinho ===');
{
  assert(computeStockStatus(0, 0) === 'NAO_CONFIGURADO', 'insumo legado sem mínimo configurado nunca aparece como Sem Estoque/Baixo');
  assert(computeStockStatus(0, 2) === 'SEM_ESTOQUE', 'zero unidades com mínimo configurado = Sem Estoque');
  assert(computeStockStatus(2, 2) === 'BAIXO', 'exemplo do pedido: Luva atual=2, mínimo=2 -> Baixo');
  assert(computeStockStatus(4, 2) === 'NORMAL', 'acima do mínimo = Normal');
}

console.log('\n=== Exemplo do pedido: Luva 4 (mínimo 2), consome 2 -> saldo 2 -> alerta ===');
{
  assert(didCrossLowThreshold(4, 2, 2) === true, 'saldo 4 -> 2 com mínimo 2: cruzou o limiar (estava acima, ficou no limite) -> alerta');
}

console.log('\n=== Alerta é EDGE-TRIGGERED — não spam a cada render, normaliza e pode alertar de novo ===');
{
  assert(didCrossLowThreshold(2, 2, 2) === false, 'saldo já estava no mínimo antes desta movimentação -> não alerta de novo a cada checagem');
  assert(didCrossLowThreshold(2, 20, 2) === false, 'entrada que SOBE o saldo (2 -> 20) nunca dispara alerta de mínimo');
  // "Quando cair novamente a <=2: pode alertar novamente" — normalizado (20) e caindo de novo ao mínimo.
  assert(didCrossLowThreshold(20, 2, 2) === true, 'depois de normalizado (20), cair de novo até o mínimo dispara alerta outra vez');
  assert(didCrossLowThreshold(1, 0, 2) === false, 'já estava abaixo do mínimo antes -> não é uma NOVA transição, não alerta de novo');
}

console.log('\n=== Consumo usa SÓ os insumos do catálogo vinculados ao procedimento ===');
{
  const inputs = [
    { id: '1', inputId: 'inp_luva', name: 'Luva', unit: 'un', quantity: 2, unitCost: 0.3, totalCost: 0.6 },
    { id: '2', inputId: 'inp_agulha', name: 'Agulha', unit: 'un', quantity: 1, unitCost: 1.5, totalCost: 1.5 },
    { id: '3', inputId: 'inp_resina', name: 'Resina', unit: 'g', quantity: 0.3, unitCost: 10, totalCost: 3 },
    { id: '4', name: 'Item avulso sem catálogo', unit: 'un', quantity: 5, unitCost: 0, totalCost: 0 }, // sem inputId
  ];
  const planned = planProcedureConsumption(inputs as any);
  assert(planned.length === 3, 'exemplo do pedido (Restauração: 2 luvas + 1 agulha + 0,3 resina) gera exatamente 3 movimentações');
  assert(planned.every((p) => p.movementType === 'PROCEDURE_CONSUMPTION'), 'todas as linhas planejadas são do tipo PROCEDURE_CONSUMPTION');
  assert(
    planned.find((p) => p.inputId === 'inp_luva')?.quantity === 2 &&
      planned.find((p) => p.inputId === 'inp_agulha')?.quantity === 1 &&
      planned.find((p) => p.inputId === 'inp_resina')?.quantity === 0.3,
    'quantidades batem exatamente com as já ligadas ao procedimento (2 luvas, 1 agulha, 0,3 resina)'
  );
  assert(
    !planned.some((p) => p.inputId === undefined),
    'item avulso sem vínculo de catálogo (sem inputId) NUNCA gera movimentação de estoque real'
  );
}

console.log('\n=== resolveConsumptionForClinicalRecord: sem procedimento vinculado -> nada a consumir ===');
{
  assert(resolveConsumptionForClinicalRecord(null).length === 0, 'atendimento sem procedimento vinculado não tenta debitar nada');
  assert(resolveConsumptionForClinicalRecord({ inputs: [] }).length === 0, 'procedimento sem insumos cadastrados -> zero movimentações');
}

console.log('\n=== computeStockSummary: KPIs pedidos (Total, Baixo, Sem estoque, Valor estimado) ===');
{
  const items = [
    { quantityOnHand: 4, minimumQuantity: 2, unitCost: 0.3 }, // NORMAL
    { quantityOnHand: 2, minimumQuantity: 2, unitCost: 1.5 }, // BAIXO
    { quantityOnHand: 0, minimumQuantity: 5, unitCost: 10 }, // SEM_ESTOQUE
    { quantityOnHand: 100, minimumQuantity: 0, unitCost: 0.05 }, // NAO_CONFIGURADO (não conta como baixo/sem estoque)
  ];
  const summary = computeStockSummary(items);
  assert(summary.totalItems === 4, 'total de itens conta todos os insumos ativos, independente do status');
  assert(summary.lowStockCount === 1, 'exatamente 1 item em estoque baixo');
  assert(summary.outOfStockCount === 1, 'exatamente 1 item sem estoque');
  const expectedValue = 4 * 0.3 + 2 * 1.5 + 0 * 10 + 100 * 0.05;
  assert(Math.abs(summary.estimatedValue - expectedValue) < 0.0001, 'valor estimado soma quantidade × custo de TODOS os itens, inclusive os não configurados');
}

console.log('\n=== NUNCA baixa em orçamento/agendamento/venda — só em finalização de atendimento ===');
{
  const dbCode = src('src/lib/db.ts');
  assert(
    !dbCode.includes('consumeProcedureInputsForRecord') ||
      (!/addAppointment[\s\S]{0,400}consumeProcedureInputsForRecord/.test(dbCode) &&
        !/addSale[\s\S]{0,400}consumeProcedureInputsForRecord/.test(dbCode)),
    'addAppointment/addSale nunca chamam o consumo de estoque'
  );
  assert(
    /if \(newRecord\.status === 'FINALIZED'\) \{\s*\n\s*this\.consumeProcedureInputsForRecord/.test(dbCode),
    'consumo automático só dispara quando o registro clínico É CRIADO já finalizado'
  );
  assert(
    dbCode.includes('this.consumeProcedureInputsForRecord(id, existing.procedureId)'),
    'a transição DRAFT -> FINALIZED (finalizeClinicalRecord) também consome os insumos'
  );
  {
    // A chamada de consumo em finalizeClinicalRecord precisa estar DEPOIS do early-return de
    // idempotência (status já FINALIZED/AMENDED) — comparamos as posições no arquivo.
    const idempotencyGuardIdx = dbCode.indexOf(
      "if (existing.status === 'FINALIZED' || existing.status === 'AMENDED') {"
    );
    const consumeCallIdx = dbCode.indexOf('this.consumeProcedureInputsForRecord(id, existing.procedureId)');
    assert(
      idempotencyGuardIdx >= 0 && consumeCallIdx > idempotencyGuardIdx,
      'a chamada de consumo em finalizeClinicalRecord vem DEPOIS da checagem de idempotência (nunca no early-return)'
    );
  }
}

console.log('\n=== Idempotência: finalizar o mesmo atendimento 2x não consome 2x ===');
{
  const dbCode = src('src/lib/db.ts');
  assert(
    /if \(existing\.status === 'FINALIZED' \|\| existing\.status === 'AMENDED'\) \{\s*\n\s*return \{ success: true \};\s*\n\s*\}/.test(dbCode),
    'chamar finalizeClinicalRecord numa consulta já finalizada retorna cedo, sem re-executar a transição nem o consumo'
  );
  const migCode = src('supabase/migrations/20260929150000_stock_management.sql');
  assert(
    migCode.includes('UNIQUE (tenant_id, clinical_record_id, input_id, movement_type)'),
    'idempotência REAL garantida em banco (não só no app): no máximo 1 PROCEDURE_CONSUMPTION por (atendimento, insumo)'
  );
  assert(
    migCode.includes('AFTER INSERT ON public.df_stock_movements') && !migCode.includes('BEFORE INSERT ON public.df_stock_movements'),
    'trigger é AFTER INSERT — nunca dispara para linhas descartadas por ON CONFLICT DO NOTHING (bug real corrigido nesta rodada)'
  );
  const svcCode = src('src/lib/supabaseClient.ts');
  assert(
    svcCode.includes('on_conflict=tenant_id,clinical_record_id,input_id,movement_type') && svcCode.includes('resolution=ignore-duplicates'),
    'gravação de movimentações usa upsert com ignore-duplicates casando exatamente o índice único'
  );
}

console.log('\n=== "Não alterar saldo sem histórico": quantity_on_hand só muda via trigger de movimentação ===');
{
  const svcCode = src('src/lib/supabaseClient.ts');
  assert(
    !/mapAppClinicalInputToDb[\s\S]{0,700}quantity_on_hand:/.test(svcCode),
    'salvar o cadastro do insumo (nome, preço...) NUNCA inclui quantity_on_hand no payload — não pode sobrescrever o saldo auditado'
  );
  const migCode = src('supabase/migrations/20260929150000_stock_management.sql');
  assert(
    migCode.includes('UPDATE public.df_clinical_inputs') && migCode.includes('SET quantity_on_hand = new_qty'),
    'o ÚNICO lugar que grava quantity_on_hand é o trigger, a partir de uma movimentação'
  );
}

console.log('\n=== Reversão ao invalidar um atendimento finalizado (não deixa consumo fantasma) ===');
{
  const dbCode = src('src/lib/db.ts');
  assert(dbCode.includes('this.reverseProcedureConsumptionForRecord(id)'), 'invalidar (voidClinicalRecord) reverte o consumo do atendimento');
  {
    const voidFnIdx = dbCode.indexOf('public async voidClinicalRecord(');
    const draftGuardIdx = dbCode.indexOf(
      "error: 'Rascunhos devem ser excluídos diretamente em vez de invalidados.',",
      voidFnIdx
    );
    const reverseCallIdx = dbCode.indexOf('this.reverseProcedureConsumptionForRecord(id)', voidFnIdx);
    assert(
      voidFnIdx >= 0 && draftGuardIdx > voidFnIdx && reverseCallIdx > draftGuardIdx,
      'DRAFT é recusado ANTES de chegar na reversão (nunca tenta reverter um atendimento que nunca consumiu)'
    );
  }
  assert(
    dbCode.includes("movementType: 'REVERSAL' as StockMovementType"),
    'a devolução usa o tipo REVERSAL — histórico próprio, nunca reescreve a movimentação de consumo original'
  );
}

console.log('\n=== UI: KPIs e filtros pedidos existem na aba Estoque ===');
{
  const code = src('src/components/Supplies/StockManagementTab.tsx');
  assert(code.includes('Total de Itens') && code.includes('Estoque Baixo') && code.includes('Sem Estoque') && code.includes('Valor Estimado'), 'os 4 KPIs pedidos estão presentes');
  assert(
    code.includes("{ value: 'ALL', label: 'Todos' }") &&
      code.includes("{ value: 'BAIXO', label: 'Baixo' }") &&
      code.includes("{ value: 'SEM_ESTOQUE', label: 'Sem estoque' }") &&
      code.includes("{ value: 'NORMAL', label: 'Normal' }"),
    'os 4 filtros pedidos (Todos/Baixo/Sem estoque/Normal) estão presentes'
  );
  assert(
    code.includes('Insumo</th>') && code.includes('>Atual</th>') && code.includes('>Mínimo</th>') && code.includes('>Unidade</th>') && code.includes('>Status</th>') && code.includes('>Custo</th>'),
    'colunas da lista batem com o pedido: Insumo, Atual, Mínimo, Unidade, Status, Custo'
  );
}

console.log(`\n${passed} verificações passaram.`);
