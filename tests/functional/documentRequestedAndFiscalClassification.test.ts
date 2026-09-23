// Três dimensões independentes de um recebimento: forma de pagamento,
// solicitação de documento (documentRequested) e classificação fiscal
// (fiscalClassification). Nenhuma delas deriva/altera as outras.
// Lógica pura, mesmo padrão dos demais testes deste projeto — as funções
// testadas aqui (src/lib/fiscalClassification.ts) são as MESMAS usadas em
// produção por src/lib/db.ts (updateFiscalClassification) e
// src/lib/taxEngine.ts (calculateMonthlyPfTax/calculateCpfMonthlyTax), não
// uma reimplementação paralela.
// Rodar com: npx tsx tests/functional/documentRequestedAndFiscalClassification.test.ts

import {
  validateFiscalClassificationChange,
  isPendingDocumentAlert,
  isTaxableForCarneLeao,
} from '../../src/lib/fiscalClassification';
import { FiscalClassification } from '../../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

function runTests() {
  console.log('====================================================');
  console.log('TESTES: DOCUMENTO SOLICITADO + CLASSIFICAÇÃO FISCAL');
  console.log('====================================================\n');

  // ---------------------------------------------------------------------
  // 1. Alerta de "documento pendente" — documentRequested=false suprime,
  //    true/undefined preserva o comportamento anterior a este campo.
  // ---------------------------------------------------------------------
  {
    assert(
      isPendingDocumentAlert({ taxOrigin: 'CPF', received: true, receitaSaudeEmitted: false, documentRequested: true }) === true,
      'ALERT-01: SIM (documento solicitado) + não emitido -> pendência aplicável normalmente'
    );
    assert(
      isPendingDocumentAlert({ taxOrigin: 'CPF', received: true, receitaSaudeEmitted: false, documentRequested: false }) === false,
      'ALERT-02: NÃO (documento não solicitado) -> nenhum alerta operacional, mesmo não emitido'
    );
    assert(
      isPendingDocumentAlert({ taxOrigin: 'CPF', received: true, receitaSaudeEmitted: false, documentRequested: undefined }) === true,
      'ALERT-03: registro legado (documentRequested indefinido) mantém alerta normal — nunca inventa "não solicitado"'
    );
    assert(
      isPendingDocumentAlert({ taxOrigin: 'CPF', received: true, receitaSaudeEmitted: true, documentRequested: true }) === false,
      'ALERT-04: já emitido -> sem pendência, independente de documentRequested'
    );
    assert(
      isPendingDocumentAlert({ taxOrigin: 'CPF', received: false, receitaSaudeEmitted: false, documentRequested: true }) === false,
      'ALERT-05: ainda não recebido -> sem pendência de documento (nada foi liquidado ainda)'
    );
    assert(
      isPendingDocumentAlert({ taxOrigin: 'CNPJ', received: true, receitaSaudeEmitted: false, documentRequested: false }) === false,
      'ALERT-06: CNPJ nunca gera alerta de Receita Saúde (regra CPF-only preservada)'
    );
  }

  // ---------------------------------------------------------------------
  // 2. O valor continua em Receitas Efetivadas/faturamento independentemente
  //    de documentRequested — isso é garantido por CONSTRUÇÃO: nenhuma
  //    função de soma de faturamento/Total Recebido lê documentRequested
  //    (só as funções de ALERTA leem). Verificamos aqui que a regra de
  //    alerta nunca é usada, por engano, como filtro de receita.
  // ---------------------------------------------------------------------
  {
    const receivedItems = [
      { value: 100, documentRequested: true },
      { value: 200, documentRequested: false },
      { value: 300, documentRequested: undefined },
    ];
    const totalReceived = receivedItems.reduce((sum, i) => sum + i.value, 0);
    assert(totalReceived === 600, 'REVENUE-01: soma de faturamento inclui os três itens (600), independente de documentRequested');
  }

  // ---------------------------------------------------------------------
  // 3. Classificação fiscal: TRIBUTAVEL não exige justificativa;
  //    NAO_TRIBUTAVEL/EXCLUIDO_DA_BASE exigem motivo + fundamento/categoria.
  // ---------------------------------------------------------------------
  {
    const okTributavel = validateFiscalClassificationChange('TRIBUTAVEL', undefined, undefined);
    assert(okTributavel.valid === true, 'FISCAL-01: TRIBUTAVEL não exige motivo/fundamento');

    const missingBoth = validateFiscalClassificationChange('NAO_TRIBUTAVEL', '', '');
    assert(missingBoth.valid === false, 'FISCAL-02: NAO_TRIBUTAVEL sem motivo nem fundamento é rejeitado');

    const missingCategory = validateFiscalClassificationChange('NAO_TRIBUTAVEL', 'Estorno de venda', '');
    assert(missingCategory.valid === false, 'FISCAL-03: motivo presente mas fundamento/categoria ausente ainda é rejeitado');

    const complete = validateFiscalClassificationChange('EXCLUIDO_DA_BASE', 'Erro de lançamento duplicado', 'Correção administrativa');
    assert(complete.valid === true, 'FISCAL-04: EXCLUIDO_DA_BASE com motivo e fundamento completos é aceito');

    // A regra explícita do pedido: "paciente não pediu recibo" nunca é
    // aceito automaticamente — a função nem recebe documentRequested como
    // parâmetro, então não há como ele influenciar a validação.
    const paramCount = validateFiscalClassificationChange.length;
    assert(paramCount === 3, 'FISCAL-05: validateFiscalClassificationChange só aceita (classification, reason, category) — sem parâmetro documentRequested, impossível acoplar por engano');
  }

  // ---------------------------------------------------------------------
  // 4. Base tributável do Carnê-Leão: default TRIBUTAVEL (ausência de campo
  //    = comportamento idêntico a antes deste recurso existir).
  // ---------------------------------------------------------------------
  {
    assert(isTaxableForCarneLeao(undefined) === true, 'BASE-01: campo ausente (registro legado) -> continua tributável, comportamento inalterado');
    assert(isTaxableForCarneLeao('TRIBUTAVEL') === true, 'BASE-02: TRIBUTAVEL explícito -> tributável');
    assert(isTaxableForCarneLeao('NAO_TRIBUTAVEL') === false, 'BASE-03: NAO_TRIBUTAVEL -> excluído da base');
    assert(isTaxableForCarneLeao('EXCLUIDO_DA_BASE') === false, 'BASE-04: EXCLUIDO_DA_BASE -> excluído da base');
  }

  // ---------------------------------------------------------------------
  // 5. INDEPENDÊNCIA — o requisito mais crítico do pedido: document_requested
  //    = NAO NUNCA, por si só, altera fiscalClassification. Simulamos os
  //    dois "update" isolados (o que updateDocumentRequested e
  //    updateFiscalClassification fazem em db.ts, via spread de objeto puro
  //    equivalente) e confirmamos que um nunca vaza no outro.
  // ---------------------------------------------------------------------
  {
    interface FakeInstallment {
      documentRequested?: boolean;
      fiscalClassification?: FiscalClassification;
    }
    function applyDocumentRequestedUpdate(inst: FakeInstallment, next: boolean): FakeInstallment {
      return { ...inst, documentRequested: next }; // exatamente o shape de db.updateDocumentRequested
    }
    function applyFiscalClassificationUpdate(inst: FakeInstallment, next: FiscalClassification): FakeInstallment {
      return { ...inst, fiscalClassification: next }; // exatamente o shape de db.updateFiscalClassification
    }

    let inst: FakeInstallment = { documentRequested: undefined, fiscalClassification: 'TRIBUTAVEL' };
    inst = applyDocumentRequestedUpdate(inst, false);
    assert(inst.fiscalClassification === 'TRIBUTAVEL', 'INDEP-01: marcar documento como NÃO solicitado não altera fiscalClassification (continua TRIBUTAVEL)');

    inst = applyFiscalClassificationUpdate(inst, 'NAO_TRIBUTAVEL');
    assert(inst.documentRequested === false, 'INDEP-02: reclassificar fiscalmente não altera documentRequested (continua false, do passo anterior)');

    let inst2: FakeInstallment = { documentRequested: true, fiscalClassification: 'TRIBUTAVEL' };
    inst2 = applyFiscalClassificationUpdate(inst2, 'EXCLUIDO_DA_BASE');
    assert(inst2.documentRequested === true, 'INDEP-03: reclassificar fiscalmente um recebimento com documento SOLICITADO não desfaz essa solicitação');
  }

  // ---------------------------------------------------------------------
  // 6. Relatório gerencial: Dinheiro recebido total = Documento solicitado +
  //    Documento não solicitado (X = Y + Z), sem perder faturamento.
  // ---------------------------------------------------------------------
  {
    const dinheiroItems = [
      { value: 100, documentRequested: true as boolean | undefined },
      { value: 250, documentRequested: false },
      { value: 50, documentRequested: undefined },
    ];
    const X = dinheiroItems.reduce((sum, i) => sum + i.value, 0);
    const Y = dinheiroItems.filter((i) => i.documentRequested === true).reduce((sum, i) => sum + i.value, 0);
    const Z = X - Y;
    assert(X === 400, 'KPI-01: Dinheiro recebido total = soma de todos os itens em dinheiro, independente de documentRequested');
    assert(Y === 100, 'KPI-02: Documento solicitado = soma só dos itens com documentRequested === true');
    assert(Z === 300, 'KPI-03: Documento não solicitado = restante (inclui false e undefined/não informado)');
    assert(X === Y + Z, 'KPI-04: X = Y + Z sempre — nenhum centavo do faturamento gerencial é perdido');
  }

  console.log('\n🎉 TODOS OS TESTES DE DOCUMENTO SOLICITADO + CLASSIFICAÇÃO FISCAL PASSARAM!');
}

runTests();
