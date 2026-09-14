/**
 * TESTE DE INTEGRAÇÃO END-TO-END: CONTÁBILEX -> DENTAL FINANCE (FASE 26 E 27)
 * Executado diretamente contra a base de dados real do Supabase.
 */

import { ContabilexIntegrationService } from '../../src/services/contabilexIntegrationService';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../src/lib/supabaseClient';

const REST_URL = `${SUPABASE_URL}/rest/v1`;

async function supabaseFetch<T>(endpoint: string, options: any = {}): Promise<{ data: T | null; error: string | null }> {
  const { method = 'GET', body } = options;
  const res = await fetch(`${REST_URL}/${endpoint}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    return { data: null, error: `HTTP ${res.status}: ${errText}` };
  }
  if (res.status === 204) return { data: null, error: null };
  const data = await res.json().catch(() => null);
  return { data, error: null };
}

async function runE2ETests() {
  console.log('===============================================================');
  console.log('INICIANDO TESTES E2E: CONTÁBILEX -> DENTAL FINANCE (FASES 26 E 27)');
  console.log('===============================================================');

  const TEST_TENANT_A = `df_tenant_test_${Date.now()}`;
  const TEST_TENANT_B = `df_tenant_intruder_${Date.now()}`;
  const TEST_CNPJ = '49.848.394/0001-21'; // Cliente real "A econômica" do Contábilex
  const TEST_CNPJ_CLEAN = '49848394000121';

  try {
    // 1. Localizar cliente real no Contábilex
    console.log('\n[TEST 1] Verificando cliente real no Contábilex...');
    const { data: clients, error: clientErr } = await supabaseFetch<any[]>(
      `clients?cnpj=eq.${encodeURIComponent(TEST_CNPJ)}&select=id,name,cnpj`
    );
    if (clientErr || !clients || clients.length === 0) {
      throw new Error(`Cliente Contábilex não encontrado: ${clientErr || 'Nenhum registro'}`);
    }
    const contabilexClient = clients[0];
    console.log(`✓ Cliente Contábilex confirmado: "${contabilexClient.name}" (${contabilexClient.id})`);

    // 2. Solicitação de vínculo pelo Dental Finance
    console.log('\n[TEST 2] Dental Finance: Solicitando vínculo com CNPJ...');
    const linkRes = await ContabilexIntegrationService.requestLink(
      TEST_TENANT_A,
      TEST_CNPJ,
      'Clínica Odonto Teste E2E'
    );
    if (!linkRes.success || !linkRes.link) {
      throw new Error(`Falha ao solicitar vínculo: ${linkRes.error}`);
    }
    if (linkRes.link.status !== 'PENDING') {
      throw new Error(`Status inicial esperado PENDING, recebido: ${linkRes.link.status}`);
    }
    console.log(`✓ Vínculo criado com sucesso com status: ${linkRes.link.status}`);

    // 3. Consulta de status no Dental Finance
    console.log('\n[TEST 3] Dental Finance: Verificando status PENDING...');
    const statusPending = await ContabilexIntegrationService.getLinkStatus(TEST_TENANT_A);
    if (!statusPending.link || statusPending.link.status !== 'PENDING') {
      throw new Error(`Status divergente: ${statusPending.link?.status}`);
    }
    console.log('✓ Status PENDING confirmado pelo Dental Finance.');

    // 4. Aprovação pelo Operador do Contábilex
    console.log('\n[TEST 4] Contábilex: Simulando aprovação pelo operador contábil...');
    const { error: approveErr } = await supabaseFetch(
      `integration_client_links?dental_tenant_id=eq.${TEST_TENANT_A}`,
      {
        method: 'PATCH',
        body: {
          contabilex_client_id: contabilexClient.id,
          status: 'ACTIVE',
          linked_at: new Date().toISOString(),
          linked_by_name: 'Operador Contaju Teste',
          updated_at: new Date().toISOString(),
        },
      }
    );
    if (approveErr) throw new Error(`Erro ao aprovar vínculo: ${approveErr}`);
    console.log('✓ Vínculo aprovado no Contábilex para status ACTIVE.');

    // 5. Dental Finance detecta status ACTIVE
    console.log('\n[TEST 5] Dental Finance: Confirmando status ACTIVE...');
    const statusActive = await ContabilexIntegrationService.getLinkStatus(TEST_TENANT_A);
    if (!statusActive.link || statusActive.link.status !== 'ACTIVE') {
      throw new Error(`Status não ativado: ${statusActive.link?.status}`);
    }
    console.log('✓ Dental Finance reconhece vínculo ACTIVE com Contábilex.');

    // 6. Publicar snapshot contábil de teste para o tenant
    console.log('\n[TEST 6] Contábilex: Publicando snapshot contábil real...');
    const snapshotPayload = {
      contabilex_client_id: contabilexClient.id,
      dental_tenant_id: TEST_TENANT_A,
      competency: '2026-07',
      gross_revenue: 135539.8,
      payroll_total: 32547.7,
      pro_labore: null,
      fgts: 2149.86,
      inss: 3500.0,
      factor_r_payroll_base: 34697.56, // 32547.70 + 2149.86
      das_total: 12216.16,
      effective_rate: 9.01,
      version: 1,
      is_current: true,
      status: 'PUBLISHED',
      content_hash: 'hash_test_v1',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: snapErr } = await supabaseFetch('accounting_monthly_snapshots', {
      method: 'POST',
      body: snapshotPayload,
    });
    if (snapErr) throw new Error(`Erro ao inserir snapshot: ${snapErr}`);
    console.log('✓ Snapshot publicado pelo Contábilex (Competência 2026-07, v1).');

    // 7. Consumo dos Snapshots via RPC get_dental_tenant_snapshots
    console.log('\n[TEST 7] Dental Finance: Consumindo snapshots via RPC segura...');
    const { snapshots, error: fetchErr } = await ContabilexIntegrationService.getPublishedSnapshots(TEST_TENANT_A);
    if (fetchErr || snapshots.length === 0) {
      throw new Error(`Falha ao obter snapshots pela RPC: ${fetchErr || 'Vazio'}`);
    }
    const snap = snapshots[0];
    if (snap.pro_labore !== null) {
      throw new Error(`Regra violada: pro_labore deveria ser null, recebeu ${snap.pro_labore}`);
    }
    if (snap.factor_r_payroll_base !== 34697.56) {
      throw new Error(`Base Fator R divergente: ${snap.factor_r_payroll_base}`);
    }
    console.log(`✓ Snapshots recebidos com sucesso (${snapshots.length} competência):`);
    console.log(`  - Receita Bruta: R$ ${snap.gross_revenue.toFixed(2)}`);
    console.log(`  - Base Fator R: R$ ${snap.factor_r_payroll_base.toFixed(2)}`);
    console.log(`  - Pró-labore: ${snap.pro_labore} (Corretamente não discriminado)`);
    console.log(`  - Guia DAS: R$ ${snap.das_total?.toFixed(2)} (Alíquota ${snap.effective_rate}%)`);

    // 8. Cálculo do Fator R no Dental Finance
    console.log('\n[TEST 8] Dental Finance: Motor de cálculo do Fator R...');
    const calc = ContabilexIntegrationService.calculateFactorR(snapshots, '2026-08');
    console.log(`✓ RBT12: R$ ${calc.rbt12.toFixed(2)}`);
    console.log(`✓ FS12: R$ ${calc.fs12.toFixed(2)}`);
    console.log(`✓ Fator R: ${calc.factorRPercent}%`);
    console.log(`✓ Enquadramento: ${calc.annex}`);
    console.log(`✓ Mensagem de meses: "${calc.missingMonthsMessage}" (Sem preencher zeros artificiais)`);
    if (calc.factorRPercent !== 25.6) { // 34697.56 / 135539.80 = 25.60%
      throw new Error(`Fator R calculado divergente: ${calc.factorRPercent}%`);
    }
    if (calc.annex !== 'ANEXO_V') { // < 28% -> Anexo V
      throw new Error(`Enquadramento divergente: ${calc.annex}`);
    }

    // 9. Revisão e Confirmação pelo Dentista
    console.log('\n[TEST 9] Dental Finance: Revisão e confirmação de competência...');
    const revBefore = ContabilexIntegrationService.evaluateReviewStatus(snap, undefined);
    if (revBefore !== 'PENDING_REVIEW') {
      throw new Error(`Status antes da confirmação deveria ser PENDING_REVIEW, recebido ${revBefore}`);
    }
    const confRes = await ContabilexIntegrationService.confirmCompetency(
      TEST_TENANT_A,
      '2026-07',
      1,
      'Dr. Teste Odonto',
      'Extrato conferido.'
    );
    if (!confRes.success) throw new Error(`Falha ao confirmar competência: ${confRes.error}`);

    const { confirmations } = await ContabilexIntegrationService.getConfirmations(TEST_TENANT_A);
    const conf = confirmations['2026-07'];
    if (!conf || conf.status !== 'CONFIRMED' || conf.snapshot_version_confirmed !== 1) {
      throw new Error(`Confirmação não persistida adequadamente: ${JSON.stringify(conf)}`);
    }
    const revAfter = ContabilexIntegrationService.evaluateReviewStatus(snap, conf);
    if (revAfter !== 'CONFIRMED') {
      throw new Error(`Status de revisão divergente: ${revAfter}`);
    }
    console.log('✓ Competência 2026-07 v1 confirmada com sucesso e persistida no banco.');

    // 10. Publicação de Retificação Contábil (v2) -> REVISION_REQUIRED
    console.log('\n[TEST 10] Contábilex: Publicando retificação contábil (v2)...');
    const snapshotV2 = {
      ...snapshotPayload,
      gross_revenue: 140000.0,
      factor_r_payroll_base: 40000.0,
      das_total: 12800.0,
      effective_rate: 9.14,
      version: 2,
      content_hash: 'hash_test_v2',
      updated_at: new Date().toISOString(),
    };
    await supabaseFetch(`accounting_monthly_snapshots?id=eq.${snap.id}`, {
      method: 'PATCH',
      body: { is_current: false },
    });
    await supabaseFetch('accounting_monthly_snapshots', {
      method: 'POST',
      body: snapshotV2,
    });

    const { snapshots: snapsV2 } = await ContabilexIntegrationService.getPublishedSnapshots(TEST_TENANT_A);
    const snapV2 = snapsV2.find((s) => s.competency === '2026-07');
    if (!snapV2 || snapV2.version !== 2) {
      throw new Error('Nova versão v2 não retornada');
    }

    const revStatusV2 = ContabilexIntegrationService.evaluateReviewStatus(snapV2, conf);
    if (revStatusV2 !== 'REVISION_REQUIRED') {
      throw new Error(`Esperado status REVISION_REQUIRED para v2 com confirmação v1, recebido: ${revStatusV2}`);
    }
    console.log(`✓ Detectada retificação contábil! Status alterado para: ${revStatusV2}`);

    // Histórico de versões para comparação
    const history = await ContabilexIntegrationService.getSnapshotHistory(TEST_TENANT_A, '2026-07');
    if (history.length < 2) {
      throw new Error(`Histórico de versões incompleto: ${history.length}`);
    }
    console.log('✓ Histórico de versões carregado para comparação lado a lado:');
    console.log(`  - Versão Anterior (v1): R$ ${history[1].gross_revenue.toFixed(2)}`);
    console.log(`  - Nova Versão (v2): R$ ${history[0].gross_revenue.toFixed(2)}`);

    // 11. Teste de Isolamento Multitenant (Fase 27)
    console.log('\n[TEST 11] Teste de Isolamento Multitenant: Tenant B tenta acessar dados do Tenant A...');
    // Tenant B sem link ativo
    const intruderSnapshots = await ContabilexIntegrationService.getPublishedSnapshots(TEST_TENANT_B);
    if (intruderSnapshots.snapshots.length !== 0) {
      throw new Error(`Falha de segurança! Tenant não autorizado recebeu ${intruderSnapshots.snapshots.length} registros!`);
    }
    console.log('✓ Tenant B sem autorização recebeu 0 snapshots (Bloqueio estrito na RPC).');

    // Tentativa de passar tenant falso para a RPC
    const directRpcRes = await supabaseFetch<any[]>('rpc/get_dental_tenant_snapshots', {
      method: 'POST',
      body: {
        p_dental_tenant_id: 'tentativa_injecao_nao_existente',
        p_limit: 10,
      },
    });
    if (directRpcRes.data && directRpcRes.data.length > 0) {
      throw new Error('Falha de isolamento na chamada direta da RPC');
    }
    console.log('✓ Isolamento confirmado: RPC valida existência e status ACTIVE do tenant antes de retornar dados.');

    console.log('\n===============================================================');
    console.log('TODOS OS TESTES E2E E DE ISOLAMENTO PASSARAM COM SUCESSO! 100% OK');
    console.log('===============================================================');
  } finally {
    // Limpeza dos dados de teste
    console.log('\nLimpando registros temporários de teste...');
    await supabaseFetch(`df_accounting_confirmations?tenant_id=eq.${TEST_TENANT_A}`, { method: 'DELETE' });
    await supabaseFetch(`accounting_monthly_snapshots?dental_tenant_id=eq.${TEST_TENANT_A}`, { method: 'DELETE' });
    await supabaseFetch(`integration_client_links?dental_tenant_id=eq.${TEST_TENANT_A}`, { method: 'DELETE' });
    console.log('✓ Limpeza concluída.');
  }
}

runE2ETests().catch((err) => {
  console.error('\n❌ ERRO NO TESTE E2E:', err);
  process.exit(1);
});
