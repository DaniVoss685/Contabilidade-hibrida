// Testes do novo modelo de despesa RECORRENTE (série aberta, sem quantidade total) —
// src/lib/expenseRecurrence.ts. PARCELADA (finita) não é tocada por este arquivo/teste.
// Rodar com: npx tsx tests/functional/expenseRecurrence.test.ts
import {
  addMonthsClamped,
  computeMissingOccurrenceDueDates,
  computeGenerationHorizon,
  getRecurrenceIntervalLabel,
  isValidCustomIntervalMonths,
  buildOccurrenceDraftFromSeries,
  pickRecurrenceTemplateUpdates,
  planEndRecurrence,
  selectOccurrencesToRemoveOnEnd,
  stripLegacyOccurrenceCounterSuffix,
  classifyLegacyExpenseRecurrenceGroups,
  RECURRENCE_INTERVAL_PRESETS,
} from '../../src/lib/expenseRecurrence';

let n = 0;
function ok(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  n++;
  console.log(`✅ ${msg}`);
}

// ---- REC-11: aritmética de mês (nunca estoura via overflow do JS Date) ----
ok(addMonthsClamped('2026-01-31', 1) === '2026-02-28', '31/01 + 1 mês = 28/02 (2026 não é bissexto)');
ok(addMonthsClamped('2028-01-31', 1) === '2028-02-29', '31/01 + 1 mês = 29/02 em ano bissexto (2028)');
ok(addMonthsClamped('2026-08-31', 1) === '2026-09-30', '31/08 + 1 mês = 30/09');
ok(addMonthsClamped('2026-09-15', 6) === '2027-03-15', '15/09 + 6 meses = 15/03 do ano seguinte (semestral)');
ok(addMonthsClamped('2026-09-20', 12) === '2027-09-20', '20/09 + 12 meses = 20/09 do ano seguinte (anual)');
ok(addMonthsClamped('2026-01-15', 14) === '2027-03-15', 'soma de meses cruzando mais de um ano civil');

// ---- REC-01..04: presets de periodicidade ----
ok(RECURRENCE_INTERVAL_PRESETS.map((p) => p.months).join(',') === '1,2,3,6,12', 'presets: Mensal/Bimestral/Trimestral/Semestral/Anual, nesta ordem');
ok(getRecurrenceIntervalLabel(1) === 'Mensal', 'REC-01: label mensal');
ok(getRecurrenceIntervalLabel(3) === 'Trimestral', 'REC-02: label trimestral (a cada 3 meses)');
ok(getRecurrenceIntervalLabel(6) === 'Semestral', 'REC-03: label semestral');
ok(getRecurrenceIntervalLabel(12) === 'Anual', 'REC-04: label anual');
ok(getRecurrenceIntervalLabel(4) === 'A cada 4 meses', 'personalizado: label genérico "A cada N meses"');
ok(getRecurrenceIntervalLabel(2) === 'Bimestral', 'bimestral também é um preset nomeado');
ok(!getRecurrenceIntervalLabel(1).includes('/') && !getRecurrenceIntervalLabel(6).includes('/'), 'REC-09: nenhum label de recorrência contém "/" (nunca 1/N)');
ok(isValidCustomIntervalMonths(4) && !isValidCustomIntervalMonths(0) && !isValidCustomIntervalMonths(37) && !isValidCustomIntervalMonths(2.5), 'validação de intervalo personalizado (1..36, inteiro)');

// ---- REC-09: descrição da ocorrência nunca leva contador ----
const template = {
  id: 'exprec_1', supplierName: 'Algar', description: 'Internet Algar', categoryId: 'cat_internet',
  categoryCode: 'INT', categoryName: 'Internet', value: 250, entity: 'CPF' as const,
  bankAccountId: 'bank_1', dedutivelLivroCaixaPf: 'SIM' as const, impactaFatorRPj: false, despesaOperacionalPj: true,
  intervalMonths: 1,
};
const draft = buildOccurrenceDraftFromSeries(template, '2026-10-16');
ok(draft.description === 'Internet Algar' && !/\(\d+\/\d+\)/.test(draft.description), 'REC-09: nova ocorrência não tem "(i/j)" na descrição');
ok(draft.recurrenceId === 'exprec_1' && draft.status === 'A_PAGAR' && draft.expenseType === 'RECORRENTE', 'ocorrência aponta para a série e nasce A_PAGAR');
ok(draft.competenceDate === '2026-10-01' && draft.dueDate === '2026-10-16', 'competência e vencimento derivados corretamente da data');
ok(draft.dedutivelLivroCaixaPf === 'SIM' && draft.despesaOperacionalPj === true, 'atributos fiscais herdados do template (Livro Caixa / Operacional PJ)');

// ---- REC-02: Internet Algar mensal a partir de 16/09/2026 (exemplo do pedido) ----
{
  const series = { startDate: '2026-09-16', intervalMonths: 1, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-09-16' };
  const missing = computeMissingOccurrenceDueDates(series, '2026-12-20');
  ok(missing.join(',') === '2026-10-16,2026-11-16,2026-12-16', 'Algar: gera 10/16, 11/16, 12/16 até o horizonte, sem pular nem duplicar mês');
}

// ---- Dedetização a cada 3 meses a partir de 10/09/2026 (exemplo do pedido) ----
{
  const series = { startDate: '2026-09-10', intervalMonths: 3, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-09-10' };
  const missing = computeMissingOccurrenceDueDates(series, '2027-07-01');
  ok(missing.join(',') === '2026-12-10,2027-03-10,2027-06-10', 'Dedetização trimestral: 10/12, 10/03, 10/06 — nunca mensal por engano');
}

// ---- REC-10: geração idempotente (não duplica se chamado de novo sem novo horizonte) ----
{
  const series1 = { startDate: '2026-09-16', intervalMonths: 1, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-09-16' };
  const horizon = computeGenerationHorizon('2026-09-20', 2);
  ok(horizon === '2026-11-20', 'horizonte padrão = hoje + 2 meses');
  const firstRun = computeMissingOccurrenceDueDates(series1, horizon);
  // Simula persistência: lastGeneratedDueDate avança para a última gerada
  const series2 = { ...series1, lastGeneratedDueDate: firstRun[firstRun.length - 1] };
  const secondRun = computeMissingOccurrenceDueDates(series2, horizon);
  ok(secondRun.length === 0, 'REC-10: rodar a geração de novo com o mesmo horizonte não produz nada a mais (idempotente)');
}

// ---- REC-05: encerramento não apaga histórico; só para geração futura ----
{
  const ended = planEndRecurrence('usr_1', 'Dra. Amanda', '2026-09-29T12:00:00.000Z');
  ok(ended.status === 'ENDED' && ended.endedBy === 'usr_1' && ended.endedByName === 'Dra. Amanda', 'planEndRecurrence grava quem encerrou e quando');
  const seriesEnded = { startDate: '2026-01-01', intervalMonths: 1, status: 'ENDED' as const, lastGeneratedDueDate: '2026-09-01' };
  ok(computeMissingOccurrenceDueDates(seriesEnded, '2027-01-01').length === 0, 'REC-05/NOVAS APÓS ENCERRAR: série ENDED nunca gera nova ocorrência');
}

// ---- Seleção do que remover ao encerrar "após esta ocorrência" ----
{
  const occ = [
    { id: 'o1', recurrenceId: 's1', dueDate: '2026-06-30', status: 'PAGO' },
    { id: 'o2', recurrenceId: 's1', dueDate: '2026-07-30', status: 'PAGO' },
    { id: 'o3', recurrenceId: 's1', dueDate: '2026-08-30', status: 'PAGO' },
    { id: 'o4', recurrenceId: 's1', dueDate: '2026-09-30', status: 'A_PAGAR' }, // âncora (mês do encerramento)
    { id: 'o5', recurrenceId: 's1', dueDate: '2026-10-30', status: 'A_PAGAR' }, // já materializada dentro do horizonte
    { id: 'o6', recurrenceId: 'outra-serie', dueDate: '2026-10-30', status: 'A_PAGAR' },
  ];
  const toRemove = selectOccurrencesToRemoveOnEnd(occ, 's1', '2026-09-30');
  ok(toRemove.map((o) => o.id).join(',') === 'o5', 'encerrar após a ocorrência de setembro remove só outubro (futura e não paga) — jan a set preservados');
  const paidFuture = [...occ, { id: 'o7', recurrenceId: 's1', dueDate: '2026-11-30', status: 'PAGO' }];
  const toRemove2 = selectOccurrencesToRemoveOnEnd(paidFuture, 's1', '2026-09-30');
  ok(!toRemove2.some((o) => o.id === 'o7'), 'HISTÓRICO: ocorrência futura já paga nunca é removida, mesmo depois da âncora');
}

// ---- REC-06/REC-07: edição propaga só os campos do template, nunca data/índice ----
{
  const updates = { value: 2200, categoryName: 'Aluguel', dueDate: '2099-01-01', recurrenceIndex: 5, installmentNumber: 3, notes: 'novo valor' };
  const picked = pickRecurrenceTemplateUpdates(updates as any);
  ok(picked.value === 2200 && picked.categoryName === 'Aluguel' && picked.notes === 'novo valor', 'edição "esta e próximas" propaga valor/categoria/observação ao template');
  ok(!('dueDate' in picked) && !('recurrenceIndex' in picked) && !('installmentNumber' in picked), 'edição de série nunca propaga dueDate/índices de parcela/ocorrência ao template');
}

// ---- REC-08: parcelada continua finita (nenhuma função deste arquivo altera esse modelo) ----
ok(!('totalInstallments' in draft) && !('installmentNumber' in draft), 'REC-08: ocorrência recorrente não carrega totalInstallments/installmentNumber — parcelada é um modelo à parte, intocado');

// ---- Migração de séries legadas (REC-12 tenant isolation incluso) ----
{
  const rows = [
    { tenantId: 't1', recurrenceId: 'rec_copasa', description: 'Copasa (1/60)', dueDate: '2026-09-01', categoryId: 'cat_agua', value: 150, entity: 'CPF' as const, dedutivelLivroCaixaPf: 'SIM' as const, impactaFatorRPj: false, despesaOperacionalPj: true, bankAccountId: 'bank_a' },
    { tenantId: 't1', recurrenceId: 'rec_copasa', description: 'Copasa (2/60)', dueDate: '2026-10-01', categoryId: 'cat_agua', value: 150, entity: 'CPF' as const, dedutivelLivroCaixaPf: 'SIM' as const, impactaFatorRPj: false, despesaOperacionalPj: true, bankAccountId: 'bank_a' },
    { tenantId: 't1', recurrenceId: 'rec_faxineira', description: 'Faxineira (1/24)', dueDate: '2026-09-30', categoryId: 'cat_faxina', value: 500, entity: 'CPF' as const, dedutivelLivroCaixaPf: 'SIM' as const, impactaFatorRPj: false, despesaOperacionalPj: true },
    // mesmo recurrence_id literal usado em OUTRO tenant — nunca pode ser misturado no mesmo grupo (REC-12)
    { tenantId: 't2', recurrenceId: 'rec_copasa', description: 'Energia (1/12)', dueDate: '2026-05-01', categoryId: 'cat_energia', value: 5800, entity: 'CPF' as const, dedutivelLivroCaixaPf: 'SIM' as const, impactaFatorRPj: false, despesaOperacionalPj: true },
  ];
  const drafts = classifyLegacyExpenseRecurrenceGroups(rows);
  ok(drafts.length === 3, 'REC-12: 3 séries distintas — mesmo recurrence_id repetido em 2 tenants NUNCA vira 1 grupo só');
  const copasaT1 = drafts.find((d) => d.tenantId === 't1' && d.id === 'rec_copasa')!;
  ok(copasaT1.description === 'Copasa' && !copasaT1.description.includes('('), 'REC-09/descrição legada limpa do contador (1/60) ao virar template');
  ok(copasaT1.startDate === '2026-09-01' && copasaT1.lastGeneratedDueDate === '2026-10-01', 'template legado usa a 1ª ocorrência como início e a última já criada como marca de geração');
  ok(copasaT1.status === 'ACTIVE' && copasaT1.intervalMonths === 1, 'série legada convertida continua ativa e mensal (nenhuma delas usava outra frequência)');
  const copasaT2 = drafts.find((d) => d.tenantId === 't2')!;
  ok(copasaT2.description === 'Energia' && copasaT2.value === 5800, 'REC-12: série do tenant 2 preserva seus próprios dados, isolada da do tenant 1');
}

// ---- Descrição: strip só do sufixo, nunca do resto do texto ----
ok(stripLegacyOccurrenceCounterSuffix('Copasa (1/60)') === 'Copasa', 'strip básico');
ok(stripLegacyOccurrenceCounterSuffix('Sala 2/3 - Aluguel (4/12)') === 'Sala 2/3 - Aluguel', 'strip só o sufixo final, preserva "2/3" no meio do texto');
ok(stripLegacyOccurrenceCounterSuffix('Copasa') === 'Copasa', 'texto sem contador não é alterado');

console.log(`\n🎉 TODOS OS ${n} TESTES DE DESPESA RECORRENTE PASSARAM!`);
