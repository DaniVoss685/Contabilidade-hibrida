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

// ---- REC-INF-01..10: recorrência "de verdade infinita" — série aberta sem horizonte fixo, motor
// que avança conforme o horizonte pedido avança (o mesmo padrão usado por
// db.ensureRecurringExpensesGeneratedThroughAsync ao navegar para qualquer período). ----

// REC-INF-01: Mensal atravessa troca de ano
{
  const series = { startDate: '2026-11-15', intervalMonths: 1, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-11-15' };
  const missing = computeMissingOccurrenceDueDates(series, '2027-02-28');
  ok(missing.join(',') === '2026-12-15,2027-01-15,2027-02-15', 'REC-INF-01: mensal gera Dez/2026, Jan/2027, Fev/2027 sem parar na troca de ano');
}

// REC-INF-02: Bimestral atravessa troca de ano
{
  const series = { startDate: '2026-09-01', intervalMonths: 2, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-09-01' };
  const missing = computeMissingOccurrenceDueDates(series, '2027-03-31');
  ok(missing.join(',') === '2026-11-01,2027-01-01,2027-03-01', 'REC-INF-02: bimestral Set→Nov→Jan/27→Mar/27, atravessando o ano');
}

// REC-INF-03: Trimestral atravessa troca de ano
{
  const series = { startDate: '2026-09-01', intervalMonths: 3, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-09-01' };
  const missing = computeMissingOccurrenceDueDates(series, '2027-06-30');
  ok(missing.join(',') === '2026-12-01,2027-03-01,2027-06-01', 'REC-INF-03: trimestral Set→Dez→Mar/27→Jun/27');
}

// REC-INF-04: Semestral por pelo menos 3 anos
{
  const series = { startDate: '2026-09-01', intervalMonths: 6, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-09-01' };
  const missing = computeMissingOccurrenceDueDates(series, '2029-09-01');
  ok(missing.join(',') === '2027-03-01,2027-09-01,2028-03-01,2028-09-01,2029-03-01,2029-09-01', 'REC-INF-04: semestral continua gerando por 3 anos completos, sem horizonte fixo curto');
}

// REC-INF-05: Anual por pelo menos 5 anos
{
  const series = { startDate: '2026-09-01', intervalMonths: 12, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-09-01' };
  const missing = computeMissingOccurrenceDueDates(series, '2031-09-01');
  ok(missing.join(',') === '2027-09-01,2028-09-01,2029-09-01,2030-09-01,2031-09-01', 'REC-INF-05: anual continua gerando por 5 anos completos');
}

// REC-INF-06: Personalizado a cada 4 meses
{
  const series = { startDate: '2026-09-01', intervalMonths: 4, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-09-01' };
  const missing = computeMissingOccurrenceDueDates(series, '2027-09-30');
  ok(missing.join(',') === '2027-01-01,2027-05-01,2027-09-01', 'REC-INF-06: intervalo personalizado de 4 meses respeitado, sem cair para mensal');
}

// REC-INF-07: Encerramento interrompe futuras (a partir da âncora, nunca mais gera)
{
  const activeSeries = { startDate: '2026-09-01', intervalMonths: 1, status: 'ACTIVE' as const, lastGeneratedDueDate: '2027-07-01' };
  const beforeEnd = computeMissingOccurrenceDueDates(activeSeries, '2027-12-01');
  ok(beforeEnd.length > 0, 'sanity: enquanto ACTIVE, ainda geraria Ago..Dez/2027');
  const endedSeries = { ...activeSeries, status: 'ENDED' as const };
  const afterEnd = computeMissingOccurrenceDueDates(endedSeries, '2027-12-01');
  ok(afterEnd.length === 0, 'REC-INF-07: apos encerrar (ENDED), nenhuma ocorrência de Agosto/2027 em diante é gerada');
}

// REC-INF-08: Histórico preservado ao encerrar (reafirma o teste de linha 105-109 com o cenário do pedido)
{
  const occ = [
    { id: 'set26', recurrenceId: 'rec_x', dueDate: '2026-09-29', status: 'PAGO' },
    { id: 'out26', recurrenceId: 'rec_x', dueDate: '2026-10-29', status: 'PAGO' },
    { id: 'jul27', recurrenceId: 'rec_x', dueDate: '2027-07-29', status: 'A_PAGAR' }, // âncora do encerramento
    { id: 'ago27', recurrenceId: 'rec_x', dueDate: '2027-08-29', status: 'A_PAGAR' }, // futura, deve sumir
  ];
  const toRemove = selectOccurrencesToRemoveOnEnd(occ, 'rec_x', '2027-07-29');
  ok(toRemove.map((o) => o.id).join(',') === 'ago27', 'REC-INF-08: encerrar em Julho/2027 remove só Agosto/2027 em diante');
  const remainingIds = occ.filter((o) => !toRemove.some((r) => r.id === o.id)).map((o) => o.id);
  ok(remainingIds.join(',') === 'set26,out26,jul27', 'REC-INF-08: Set/2026 a Jul/2027 continuam existindo intactos após o encerramento');
}

// REC-INF-09: Navegar repetidamente para o mesmo mês futuro (ou para trás) nunca duplica —
// mesmo padrão do watermark em db.ts: horizonte só avança, e cada nova rodada usa o
// lastGeneratedDueDate já persistido pela rodada anterior.
{
  let series = { startDate: '2026-09-10', intervalMonths: 1, status: 'ACTIVE' as const, lastGeneratedDueDate: '2026-09-10' };
  // 1ª navegação: usuário abre Dezembro/2026
  const run1 = computeMissingOccurrenceDueDates(series, '2026-12-31');
  ok(run1.join(',') === '2026-10-10,2026-11-10,2026-12-10', 'REC-INF-09: 1ª navegação (Dez/2026) gera Out, Nov, Dez');
  series = { ...series, lastGeneratedDueDate: run1[run1.length - 1] };
  // 2ª..4ª navegação: usuário volta pra Novembro, depois pra Dezembro de novo — MESMO horizonte já garantido
  for (let i = 0; i < 3; i++) {
    const repeat = computeMissingOccurrenceDueDates(series, '2026-12-31');
    ok(repeat.length === 0, `REC-INF-09: navegar de novo para um período já garantido (rodada ${i + 1}) não gera nada extra`);
  }
  // 5ª navegação: usuário avança para Julho/2027 (bem no futuro, nunca visitado) — horizonte AVANÇA
  const run2 = computeMissingOccurrenceDueDates(series, '2027-07-31');
  ok(
    run2.join(',') === '2027-01-10,2027-02-10,2027-03-10,2027-04-10,2027-05-10,2027-06-10,2027-07-10',
    'REC-INF-09: navegar para Julho/2027 (nunca visitado) gera exatamente o que faltava, sem duplicar Out..Dez/2026'
  );
}

// REC-INF-10: Parcelada continua finita — nenhuma função deste motor lida com totalInstallments/
// installmentNumber; reforça REC-08 com o vocabulário exato do pedido ("3/12", nunca "3/∞").
{
  const parceladaLike = { totalInstallments: 12, installmentNumber: 3 };
  ok(
    !('startDate' in parceladaLike) && !('intervalMonths' in parceladaLike) && !('status' in parceladaLike),
    'REC-INF-10: modelo de parcela (finito, N/M) é estruturalmente distinto do modelo de série recorrente (aberta) — não compartilham campos'
  );
  ok(!('totalInstallments' in draft), 'REC-INF-10: ocorrência recorrente (buildOccurrenceDraftFromSeries) nunca carrega totalInstallments — nunca have "3/∞"');
}

console.log(`\n🎉 TODOS OS ${n} TESTES DE DESPESA RECORRENTE PASSARAM!`);
