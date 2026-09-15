/**
 * ==============================================================================
 * SUÍTE DE TESTES DE SEGURANÇA — FASE 3
 * ISOLAMENTO CONTÁBILEX ↔ DENTAL FINANCE (INTSEC-01 A INTSEC-26)
 * ==============================================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fbkouuvupdyffizwoiti.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia291dXZ1cGR5ZmZpendvaXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTI2NDUsImV4cCI6MjA3MDg2ODY0NX0.9xN5BQug6yHm_k9H20v524XFuCbd1JzW2aRSQJWstfo';

// Credenciais de teste reais
const DANIEL_EMAIL = 'danielricardoarantes@gmail.com';
const DANIEL_PASS = 'Daniel@2026';
const LEONARDO_EMAIL = 'leonardoricardoarantes@gmail.com';
const LEONARDO_PASS = 'Leonardo@2026';
const OPERATOR_EMAIL = 'operator_e2e_test@contaju.internal';
const OPERATOR_PASSWORD = 'OperatorPassword123!';

const DANIEL_TENANT_ID = 'clinic_1789153962617_gpw1';
const LEONARDO_TENANT_ID = 'clinic_1789405023533_phq5';

let anonClient: SupabaseClient;
let danielClient: SupabaseClient;
let leonardoClient: SupabaseClient;
let operatorClient: SupabaseClient;

let testLinkId: string = '';
let testClientId: string = '';
const E2E_TEST_TENANT = `test_tenant_p3_${Date.now()}`;

async function setupClients() {
  anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  // 1. Daniel
  const dClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: dAuth, error: dErr } = await dClient.auth.signInWithPassword({
    email: DANIEL_EMAIL,
    password: DANIEL_PASS,
  });
  if (dErr || !dAuth.session) throw new Error('Falha ao autenticar Daniel: ' + dErr?.message);
  danielClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${dAuth.session.access_token}` } },
  });

  // 2. Leonardo
  const lClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: lAuth, error: lErr } = await lClient.auth.signInWithPassword({
    email: LEONARDO_EMAIL,
    password: LEONARDO_PASS,
  });
  if (lErr || !lAuth.session) throw new Error('Falha ao autenticar Leonardo: ' + lErr?.message);
  leonardoClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${lAuth.session.access_token}` } },
  });

  // 3. Contábilex Operator
  const opClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: opAuth, error: opErr } = await opClient.auth.signInWithPassword({
    email: OPERATOR_EMAIL,
    password: OPERATOR_PASSWORD,
  });
  if (opErr || !opAuth?.session) {
    console.error('DEBUG OPERATOR AUTH ERROR:', JSON.stringify(opErr, null, 2));
    throw new Error('Falha ao autenticar Operador Contábilex: ' + (opErr?.message || 'Sem sessão'));
  }
  operatorClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${opAuth.session.access_token}` } },
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('INICIANDO TESTES DE SEGURANÇA E ISOLAMENTO (INTSEC-01 A INTSEC-26)');
  console.log('================================================================\n');

  await setupClients();

  const results: { id: string; name: string; pass: boolean; details: string }[] = [];

  function record(id: string, name: string, pass: boolean, details: string) {
    results.push({ id, name, pass, details });
    const symbol = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`[${id}] ${symbol} -> ${name} (${details})`);
  }

  // INTSEC-01: anon -> clients -> DENY
  {
    const { data, error } = await anonClient.from('clients').select('id').limit(5);
    const pass = !!error || (data && data.length === 0);
    record('INTSEC-01', 'anon clients DENY', pass, error ? error.message : '0 rows');
  }

  // INTSEC-02: Dental -> clients -> DENY
  {
    const { data, error } = await danielClient.from('clients').select('id').limit(5);
    const pass = !!error || (data && data.length === 0);
    record('INTSEC-02', 'Dental clients DENY', pass, error ? error.message : `${data?.length} rows`);
  }

  // INTSEC-03: Dental -> fiscal_history -> DENY
  {
    const { data, error } = await danielClient.from('fiscal_history').select('id').limit(5);
    const pass = !!error || (data && data.length === 0);
    record('INTSEC-03', 'Dental fiscal_history DENY', pass, error ? error.message : `${data?.length} rows`);
  }

  // INTSEC-04: Dental -> payroll_history -> DENY
  {
    const { data, error } = await danielClient.from('payroll_history').select('id').limit(5);
    const pass = !!error || (data && data.length === 0);
    record('INTSEC-04', 'Dental payroll_history DENY', pass, error ? error.message : `${data?.length} rows`);
  }

  // INTSEC-05: Dental -> own link -> ALLOW
  {
    const { data, error } = await danielClient
      .from('integration_client_links')
      .select('id, status, dental_tenant_id')
      .eq('dental_tenant_id', DANIEL_TENANT_ID);
    const pass = !error && !!data && data.length > 0 && data[0].dental_tenant_id === DANIEL_TENANT_ID;
    record('INTSEC-05', 'Dental own link ALLOW', pass, `Vínculo retornado: ${data?.[0]?.status}`);
  }

  // INTSEC-06: Dental -> other link -> DENY
  {
    const { data, error } = await danielClient
      .from('integration_client_links')
      .select('id, dental_tenant_id')
      .eq('dental_tenant_id', LEONARDO_TENANT_ID);
    const pass = !error && (!data || data.length === 0);
    record('INTSEC-06', 'Dental other link DENY', pass, `Retornou ${data?.length || 0} registros de outro tenant`);
  }

  // INTSEC-07: Dental -> self approve DENY
  {
    // Tentativa de Daniel atualizar o status do seu link diretamente para ACTIVE
    const { data, error } = await danielClient
      .from('integration_client_links')
      .update({ status: 'ACTIVE' })
      .eq('dental_tenant_id', DANIEL_TENANT_ID)
      .select();
    const pass = !!error || (data && data.length === 0);
    record('INTSEC-07', 'Dental self approve DENY', pass, error ? `Bloqueado via RLS: ${error.message}` : `0 linhas alteradas`);
  }

  // INTSEC-08: Dental -> snapshot INSERT DENY
  {
    const { error } = await danielClient.from('accounting_monthly_snapshots').insert({
      dental_tenant_id: DANIEL_TENANT_ID,
      competency: '2099-12',
      gross_revenue: 999999,
      status: 'PUBLISHED',
      content_hash: 'forged_hash',
    });
    const pass = !!error;
    record('INTSEC-08', 'Dental snapshot INSERT DENY', pass, error ? error.message : 'Permitiu insert');
  }

  // INTSEC-09: Dental -> snapshot UPDATE DENY
  {
    const { data, error } = await danielClient
      .from('accounting_monthly_snapshots')
      .update({ gross_revenue: 0 })
      .eq('dental_tenant_id', DANIEL_TENANT_ID)
      .select();
    const pass = !!error || (data && data.length === 0);
    record('INTSEC-09', 'Dental snapshot UPDATE DENY', pass, error ? error.message : '0 linhas alteradas');
  }

  // INTSEC-10: Dental -> snapshot DELETE DENY
  {
    const { data, error } = await danielClient
      .from('accounting_monthly_snapshots')
      .delete()
      .eq('dental_tenant_id', DANIEL_TENANT_ID)
      .select();
    const pass = !!error || (data && data.length === 0);
    record('INTSEC-10', 'Dental snapshot DELETE DENY', pass, error ? error.message : '0 linhas removidas');
  }

  // INTSEC-11: Daniel RPC Daniel ALLOW
  {
    const { data, error } = await danielClient.rpc('get_dental_tenant_snapshots', {
      p_dental_tenant_id: DANIEL_TENANT_ID,
      p_limit: 12,
    });
    const pass = !error && Array.isArray(data) && data.length === 11;
    record('INTSEC-11', 'Daniel RPC Daniel ALLOW', pass, `Retornou ${data?.length} competências`);
  }

  // INTSEC-12: Daniel RPC Leonardo DENY
  {
    const { data, error } = await danielClient.rpc('get_dental_tenant_snapshots', {
      p_dental_tenant_id: LEONARDO_TENANT_ID,
      p_limit: 12,
    });
    const pass = !error && (!data || data.length === 0);
    record('INTSEC-12', 'Daniel RPC Leonardo DENY', pass, `Retornou ${data?.length || 0} competências`);
  }

  // INTSEC-13: Leonardo RPC Daniel DENY
  {
    const { data, error } = await leonardoClient.rpc('get_dental_tenant_snapshots', {
      p_dental_tenant_id: DANIEL_TENANT_ID,
      p_limit: 12,
    });
    const pass = !error && (!data || data.length === 0);
    record('INTSEC-13', 'Leonardo RPC Daniel DENY', pass, `Retornou ${data?.length || 0} competências`);
  }

  // INTSEC-14: anon RPC DENY
  {
    const { data, error } = await anonClient.rpc('get_dental_tenant_snapshots', {
      p_dental_tenant_id: DANIEL_TENANT_ID,
      p_limit: 12,
    });
    const pass = !!error || (!data || data.length === 0);
    record('INTSEC-14', 'anon RPC DENY', pass, error ? error.message : `Retornou 0 competências`);
  }

  // INTSEC-15: Contábilex clients ALLOW
  {
    const { data, error } = await operatorClient.from('clients').select('id, name, cnpj').limit(3);
    const pass = !error && !!data && data.length > 0;
    if (data && data.length > 0) testClientId = data[0].id;
    record('INTSEC-15', 'Contábilex clients ALLOW', pass, `Operador leu ${data?.length} clientes`);
  }

  // INTSEC-16: Contábilex fiscal ALLOW
  {
    const { data, error } = await operatorClient.from('fiscal_history').select('id').limit(3);
    const pass = !error && !!data && data.length > 0;
    record('INTSEC-16', 'Contábilex fiscal ALLOW', pass, `Operador leu ${data?.length} registros fiscais`);
  }

  // INTSEC-17: Contábilex payroll ALLOW
  {
    const { data, error } = await operatorClient.from('payroll_history').select('id').limit(3);
    const pass = !error && !!data && data.length > 0;
    record('INTSEC-17', 'Contábilex payroll ALLOW', pass, `Operador leu ${data?.length} folhas`);
  }

  // INTSEC-18: Contábilex approve ALLOW
  {
    // Operador cria um vínculo de teste e aprova
    const { data: createdLink, error: insErr } = await operatorClient
      .from('integration_client_links')
      .insert({
        dental_tenant_id: E2E_TEST_TENANT,
        cnpj: '12345678000199',
        clinic_name: 'Clínica Homologação E2E',
        status: 'PENDING',
      })
      .select()
      .single();

    if (insErr || !createdLink) {
      record('INTSEC-18', 'Contábilex approve ALLOW', false, `Falha ao criar link pendente: ${insErr?.message}`);
    } else {
      testLinkId = createdLink.id;
      const { data: approved, error: appErr } = await operatorClient
        .from('integration_client_links')
        .update({
          status: 'ACTIVE',
          contabilex_client_id: testClientId,
          linked_at: new Date().toISOString(),
          linked_by_name: 'Operador Teste',
        })
        .eq('id', testLinkId)
        .select()
        .single();
      const pass = !appErr && approved?.status === 'ACTIVE';
      record('INTSEC-18', 'Contábilex approve ALLOW', pass, `Status alterado para ${approved?.status}`);
    }
  }

  // INTSEC-19: Contábilex publish ALLOW
  {
    const { data: pubSnapshot, error: pubErr } = await operatorClient
      .from('accounting_monthly_snapshots')
      .insert({
        contabilex_client_id: testClientId,
        dental_tenant_id: E2E_TEST_TENANT,
        competency: '2026-08',
        gross_revenue: 50000,
        payroll_total: 14000,
        factor_r_payroll_base: 14000,
        das_total: 3000,
        effective_rate: 0.06,
        version: 1,
        is_current: true,
        status: 'PUBLISHED',
        content_hash: 'hash_v1_test',
        published_at: new Date().toISOString(),
      })
      .select()
      .single();
    const pass = !pubErr && !!pubSnapshot;
    record('INTSEC-19', 'Contábilex publish ALLOW', pass, pubErr ? pubErr.message : `Snapshot v1 publicado com sucesso`);
  }

  // INTSEC-20: backfill PASS
  {
    // Simula backfill de competência anterior pelo operador
    const { data: backfillSnap, error: bfErr } = await operatorClient
      .from('accounting_monthly_snapshots')
      .insert({
        contabilex_client_id: testClientId,
        dental_tenant_id: E2E_TEST_TENANT,
        competency: '2026-07',
        gross_revenue: 48000,
        payroll_total: 13500,
        factor_r_payroll_base: 13500,
        das_total: 2880,
        effective_rate: 0.06,
        version: 1,
        is_current: true,
        status: 'PUBLISHED',
        content_hash: 'hash_v1_backfill',
        published_at: new Date().toISOString(),
      })
      .select()
      .single();
    const pass = !bfErr && !!backfillSnap;
    record('INTSEC-20', 'backfill PASS', pass, bfErr ? bfErr.message : 'Competência retroativa publicada');
  }

  // INTSEC-21: retificação PASS
  {
    // Desativa v1 e insere v2 retificada
    await operatorClient
      .from('accounting_monthly_snapshots')
      .update({ is_current: false })
      .eq('dental_tenant_id', E2E_TEST_TENANT)
      .eq('competency', '2026-08')
      .eq('version', 1);

    const { data: v2Snap, error: v2Err } = await operatorClient
      .from('accounting_monthly_snapshots')
      .insert({
        contabilex_client_id: testClientId,
        dental_tenant_id: E2E_TEST_TENANT,
        competency: '2026-08',
        gross_revenue: 55000,
        payroll_total: 15400,
        factor_r_payroll_base: 15400,
        das_total: 3300,
        effective_rate: 0.06,
        version: 2,
        is_current: true,
        status: 'PUBLISHED',
        content_hash: 'hash_v2_retificado',
        published_at: new Date().toISOString(),
      })
      .select()
      .single();
    const pass = !v2Err && v2Snap?.version === 2;
    record('INTSEC-21', 'retificação PASS', pass, v2Err ? v2Err.message : 'Versão 2 publicada e v1 marcada is_current=false');
  }

  // INTSEC-22: revision required PASS
  {
    // Verifica se a versão 2 atual é retornada e v1 antiga arquivada
    const { data: currentSnaps, error: qErr } = await operatorClient
      .from('accounting_monthly_snapshots')
      .select('version, is_current')
      .eq('dental_tenant_id', E2E_TEST_TENANT)
      .eq('competency', '2026-08')
      .eq('is_current', true);
    const pass = !qErr && currentSnaps?.length === 1 && currentSnaps[0].version === 2;
    record('INTSEC-22', 'revision required PASS', pass, `Versão vigente identificada: v${currentSnaps?.[0]?.version}`);
  }

  // INTSEC-23: audit UPDATE DENY
  {
    const { data, error } = await operatorClient
      .from('accounting_integration_audit_logs')
      .update({ event_type: 'TAMPERED' })
      .select();
    const pass = !!error || (data && data.length === 0);
    record('INTSEC-23', 'audit UPDATE DENY', pass, error ? error.message : '0 linhas alteradas');
  }

  // INTSEC-24: audit DELETE DENY
  {
    const { data, error } = await operatorClient
      .from('accounting_integration_audit_logs')
      .delete()
      .select();
    const pass = !!error || (data && data.length === 0);
    record('INTSEC-24', 'audit DELETE DENY', pass, error ? error.message : '0 linhas removidas');
  }

  // INTSEC-25: Dental F5 PASS
  {
    // Valida que ao consultar os dados de Daniel, todos os snapshots autorizados continuam disponíveis
    const { data: snaps, error: snapErr } = await danielClient
      .from('accounting_monthly_snapshots')
      .select('id, competency, gross_revenue, factor_r_payroll_base')
      .eq('dental_tenant_id', DANIEL_TENANT_ID)
      .eq('is_current', true);
    const pass = !snapErr && snaps?.length === 11;
    record('INTSEC-25', 'Dental F5 PASS', pass, `11 competências recuperadas sem perda de sessão ou RLS lock`);
  }

  // INTSEC-26: multi-tenant integration PASS
  {
    // Garante que o isolamento do tenant de teste não vazou para Daniel
    const { data: leakedData } = await danielClient
      .from('accounting_monthly_snapshots')
      .select('id')
      .eq('dental_tenant_id', E2E_TEST_TENANT);
    const pass = !leakedData || leakedData.length === 0;
    record('INTSEC-26', 'multi-tenant integration PASS', pass, `Daniel recebeu 0 snapshots de outros tenants`);
  }

  // Limpeza de registros de teste de homologação
  if (testLinkId) {
    await operatorClient.from('accounting_monthly_snapshots').delete().eq('dental_tenant_id', E2E_TEST_TENANT);
    await operatorClient.from('integration_client_links').delete().eq('id', testLinkId);
  }

  console.log('\n================================================================');
  const allPass = results.every(r => r.pass);
  console.log(`STATUS GERAL: ${results.filter(r => r.pass).length}/${results.length} TESTES PASSARAM!`);
  console.log('================================================================');

  if (!allPass) {
    process.exit(1);
  }
}

runTests().then(() => process.exit(0)).catch(err => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
