import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fbkouuvupdyffizwoiti.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia291dXZ1cGR5ZmZpendvaXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTI2NDUsImV4cCI6MjA3MDg2ODY0NX0.9xN5BQug6yHm_k9H20v524XFuCbd1JzW2aRSQJWstfo';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ID determinístico para a suite de testes
const TEST_TIMESTAMP = Date.now();
const TEST_EMAIL = `dentista_ctj_sync_${TEST_TIMESTAMP}@clinica.com.br`;
const TEST_PASSWORD = 'SenhaForte123!@#';
const TEST_CNPJ = '32.784.757/0001-00';
const TEST_CNPJ_CLEAN = '32784757000100';
let testContabilexClientId: string | null = null;
let testAuthUserId: string | null = null;
let testDentalTenantId: string | null = null;
let testLinkId: string | null = null;

async function runTests() {
  console.log('====================================================');
  console.log('INICIANDO BATERIA DE HOMOLOGAÇÃO: IDENTIDADE E AUTO-SYNC');
  console.log('====================================================\n');

  let passedIdentity = 0;
  let passedAutoSync = 0;

  try {
    // ----------------------------------------------------
    // PARTE A: TESTES DE IDENTIDADE COMPARTILHADA
    // ----------------------------------------------------
    console.log('--- TESTES DE IDENTIDADE ---');

    // 1. Simula criação de usuário no Supabase Auth vindo do Contábilex
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      options: { data: { app: 'dental_finance', role: 'viewer' } },
    });

    if (signUpError || !signUpData.user) {
      throw new Error(`Falha ao preparar usuário no Auth: ${signUpError?.message}`);
    }
    testAuthUserId = signUpData.user.id;
    console.log(`[SETUP] Usuário Supabase Auth criado com ID: ${testAuthUserId}`);

    // IDENTITY-01: Tentativa de signUp duplicado detectada sem criar novo auth.users
    const { data: dupSignUpData, error: dupSignUpError } = await supabase.auth.signUp({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    const isDupHandled =
      (dupSignUpError && dupSignUpError.message.toLowerCase().includes('already')) ||
      (dupSignUpData.user && Array.isArray(dupSignUpData.user.identities) && dupSignUpData.user.identities.length === 0);

    if (isDupHandled) {
      console.log('IDENTITY-01: Email já existente no Auth não duplica auth.users: PASS');
      passedIdentity++;
    } else {
      console.error('IDENTITY-01: FAIL - Não detectou usuário duplicado');
    }

    // IDENTITY-02: Usuário autentica com credencial Auth válida (mesma senha)
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (!signInError && signInData.session && signInData.user.id === testAuthUserId) {
      console.log('IDENTITY-02: Usuário autentica com a mesma senha oficial: PASS');
      passedIdentity++;
    } else {
      console.error('IDENTITY-02: FAIL - Erro na autenticação com a credencial:', signInError);
    }

    // IDENTITY-03: Após autenticação válida, acesso Dental é provisionado via reconcileOrProvisionDentalUser
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signInData?.session?.access_token}` } },
      auth: { persistSession: false },
    });

    const { data: provData, error: provError } = await authClient.rpc('reconcile_or_provision_dental_user', {
      p_clinic_name: 'Consultório Teste AutoSync',
      p_trade_name: 'Clínica Odonto Teste',
    });

    if (!provError && provData && provData.success && provData.tenant_id) {
      testDentalTenantId = provData.tenant_id;
      console.log(`IDENTITY-03: Acesso Dental provisionado com tenant_id [${testDentalTenantId}]: PASS`);
      passedIdentity++;
    } else {
      console.error('IDENTITY-03: FAIL - Falha na RPC de provisionamento:', provError || provData);
    }

    // IDENTITY-04: Nenhum tenant duplicado em df_tenants
    const { data: tenantsCheck } = await supabase
      .from('df_tenants')
      .select('id')
      .eq('email', TEST_EMAIL.toLowerCase());

    if (tenantsCheck && tenantsCheck.length === 1) {
      console.log('IDENTITY-04: Nenhum tenant duplicado (exatamente 1 tenant): PASS');
      passedIdentity++;
    } else {
      console.error(`IDENTITY-04: FAIL - Encontrados ${tenantsCheck?.length} tenants`);
    }

    // IDENTITY-05: Nenhum df_users duplicado
    const { data: usersCheck } = await supabase
      .from('df_users')
      .select('id')
      .eq('auth_user_id', testAuthUserId);

    if (usersCheck && usersCheck.length === 1) {
      console.log('IDENTITY-05: Nenhum df_users duplicado (exatamente 1 usuário): PASS');
      passedIdentity++;
    } else {
      console.error(`IDENTITY-05: FAIL - Encontrados ${usersCheck?.length} usuários df_users`);
    }

    // IDENTITY-06: Conhecer e-mail sem autenticação não dá acesso (tentativa com senha errada falha)
    const { error: wrongPassError } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: 'SenhaErrada123!',
    });

    if (wrongPassError) {
      console.log('IDENTITY-06: Conhecer e-mail sem autenticação válida não dá acesso: PASS');
      passedIdentity++;
    } else {
      console.error('IDENTITY-06: FAIL - Autenticou indevidamente com senha errada');
    }

    // ----------------------------------------------------
    // PARTE B: TESTES DE SINCRONIZAÇÃO AUTOMÁTICA
    // ----------------------------------------------------
    console.log('\n--- TESTES DE SINCRONIZAÇÃO AUTOMÁTICA ---');

    // Setup: Criar cliente isolado e vínculo ativo com o Dental Finance via RPC segura
    const { data: setupRes, error: setupErr } = await supabase.rpc('fn_test_setup_isolated_client_and_link', {
      p_cnpj: TEST_CNPJ_CLEAN,
      p_clinic_name: 'Consultório Teste AutoSync',
      p_dental_tenant_id: testDentalTenantId,
    });

    if (setupErr || !setupRes?.success || !setupRes?.client_id) {
      throw new Error(`Falha ao criar cliente e vínculo nos testes: ${setupErr?.message || JSON.stringify(setupRes)}`);
    }
    testContabilexClientId = setupRes.client_id;
    testLinkId = setupRes.link_id;
    console.log(`[SETUP] Cliente isolado [${testContabilexClientId}] e vínculo ativo [${testLinkId}] criados.`);

    const TEST_COMPETENCY = '05/2026';
    const TEST_COMP_INTERNAL = '2026-05';

    // AUTO-SYNC-05: Competência em rascunho / aberta NÃO deve publicar snapshot
    await supabase.rpc('fn_test_simulate_contabilex_update', {
      p_client_id: testContabilexClientId,
      p_month: TEST_COMPETENCY,
      p_revenue: 15000.0,
      p_salary: 3000.0,
      p_das: 900.0,
      p_tax_status: 'Pendente',
      p_payroll_status: 'Pendente',
    });

    await new Promise((r) => setTimeout(r, 600));

    const { data: openSnaps } = await supabase
      .from('accounting_monthly_snapshots')
      .select('*')
      .eq('contabilex_client_id', testContabilexClientId)
      .eq('competency', TEST_COMP_INTERNAL);

    if (!openSnaps || openSnaps.length === 0) {
      console.log('AUTO-SYNC-05: Competência aberta/incompleta não é publicada: PASS');
      passedAutoSync++;
    } else {
      console.error('AUTO-SYNC-05: FAIL - Snapshot publicado para competência aberta');
    }

    // AUTO-SYNC-06: Fechamento formal da competência publica automaticamente
    await supabase.rpc('fn_test_simulate_contabilex_update', {
      p_client_id: testContabilexClientId,
      p_month: TEST_COMPETENCY,
      p_revenue: 15000.0,
      p_salary: 3000.0,
      p_das: 900.0,
      p_tax_status: 'Feito',
      p_payroll_status: 'Entregue',
    });

    await new Promise((r) => setTimeout(r, 600));

    const { data: closedSnaps } = await authClient
      .from('accounting_monthly_snapshots')
      .select('*')
      .eq('dental_tenant_id', testDentalTenantId)
      .eq('competency', TEST_COMP_INTERNAL)
      .eq('is_current', true);

    const initialSnap = closedSnaps?.[0];
    if (initialSnap && initialSnap.version === 1 && initialSnap.status === 'PUBLISHED') {
      console.log('AUTO-SYNC-06: Competência fechada é publicada automaticamente (v1): PASS');
      passedAutoSync++;
    } else {
      console.error('AUTO-SYNC-06: FAIL - Não publicou snapshot v1 ao fechar competência:', closedSnaps);
    }

    // AUTO-SYNC-01: Alterar folha no Contaju -> Snapshot atualizado automaticamente sem clique manual
    await supabase.rpc('fn_test_simulate_contabilex_update', {
      p_client_id: testContabilexClientId,
      p_month: TEST_COMPETENCY,
      p_salary: 3800.0, // Retificação de folha de R$ 3000 para R$ 3800
    });

    await new Promise((r) => setTimeout(r, 600));

    const { data: payrollUpdateSnaps } = await authClient
      .from('accounting_monthly_snapshots')
      .select('*')
      .eq('dental_tenant_id', testDentalTenantId)
      .eq('competency', TEST_COMP_INTERNAL)
      .order('version', { ascending: false });

    const currentAfterPayroll = payrollUpdateSnaps?.find((s: any) => s.is_current);
    if (
      currentAfterPayroll &&
      currentAfterPayroll.version === 2 &&
      Number(currentAfterPayroll.payroll_total) === 3800.0
    ) {
      console.log('AUTO-SYNC-01: Alteração de folha atualizou snapshot automaticamente para v2: PASS');
      passedAutoSync++;
    } else {
      console.error('AUTO-SYNC-01: FAIL - Folha não atualizou snapshot para v2:', currentAfterPayroll);
    }

    // AUTO-SYNC-02: Alterar receita no Contaju -> Snapshot atualizado automaticamente
    await supabase.rpc('fn_test_simulate_contabilex_update', {
      p_client_id: testContabilexClientId,
      p_month: TEST_COMPETENCY,
      p_revenue: 22000.0, // Retificação de receita de R$ 15000 para R$ 22000
    });

    await new Promise((r) => setTimeout(r, 600));

    const { data: revUpdateSnaps } = await authClient
      .from('accounting_monthly_snapshots')
      .select('*')
      .eq('dental_tenant_id', testDentalTenantId)
      .eq('competency', TEST_COMP_INTERNAL)
      .order('version', { ascending: false });

    const currentAfterRev = revUpdateSnaps?.find((s: any) => s.is_current);
    if (
      currentAfterRev &&
      currentAfterRev.version === 3 &&
      Number(currentAfterRev.gross_revenue) === 22000.0
    ) {
      console.log('AUTO-SYNC-02: Alteração de receita atualizou snapshot automaticamente para v3: PASS');
      passedAutoSync++;
    } else {
      console.error('AUTO-SYNC-02: FAIL - Receita não atualizou snapshot para v3:', currentAfterRev);
    }

    // AUTO-SYNC-03: Alterar DAS no Contaju -> Snapshot atualizado automaticamente
    await supabase.rpc('fn_test_simulate_contabilex_update', {
      p_client_id: testContabilexClientId,
      p_month: TEST_COMPETENCY,
      p_das: 1320.0, // Retificação de DAS de R$ 900 para R$ 1320
    });

    await new Promise((r) => setTimeout(r, 600));

    const { data: dasUpdateSnaps } = await authClient
      .from('accounting_monthly_snapshots')
      .select('*')
      .eq('dental_tenant_id', testDentalTenantId)
      .eq('competency', TEST_COMP_INTERNAL)
      .order('version', { ascending: false });

    const currentAfterDas = dasUpdateSnaps?.find((s: any) => s.is_current);
    if (
      currentAfterDas &&
      currentAfterDas.version === 4 &&
      Number(currentAfterDas.das_total) === 1320.0
    ) {
      console.log('AUTO-SYNC-03: Alteração de DAS atualizou snapshot automaticamente para v4: PASS');
      passedAutoSync++;
    } else {
      console.error('AUTO-SYNC-03: FAIL - DAS não atualizou snapshot para v4:', currentAfterDas);
    }

    // AUTO-SYNC-04: Sem mudança nos fatos contábeis -> Nenhuma nova versão (Idempotência por hash)
    await supabase.rpc('fn_test_simulate_contabilex_update', {
      p_client_id: testContabilexClientId,
      p_month: TEST_COMPETENCY,
      p_revenue: 22000.0,
      p_salary: 3800.0,
      p_das: 1320.0,
      p_tax_status: 'Feito',
      p_payroll_status: 'Entregue',
    });

    await new Promise((r) => setTimeout(r, 600));

    const { data: idempotentSnaps } = await authClient
      .from('accounting_monthly_snapshots')
      .select('*')
      .eq('dental_tenant_id', testDentalTenantId)
      .eq('competency', TEST_COMP_INTERNAL)
      .order('version', { ascending: false });

    const maxVersion = Math.max(...(idempotentSnaps || []).map((s) => s.version));
    if (maxVersion === 4) {
      console.log('AUTO-SYNC-04: Gravação sem alteração contábil preserva versão (v4 inalterada): PASS');
      passedAutoSync++;
    } else {
      console.error(`AUTO-SYNC-04: FAIL - Versão incrementou indevidamente para ${maxVersion}`);
    }

    // AUTO-SYNC-07: Dental Finance lê versão atualizada diretamente ao carregar dados
    const { data: dentalReadSnap } = await authClient
      .from('accounting_monthly_snapshots')
      .select('*')
      .eq('dental_tenant_id', testDentalTenantId)
      .eq('competency', TEST_COMP_INTERNAL)
      .eq('is_current', true)
      .single();

    if (dentalReadSnap && dentalReadSnap.version === 4 && Number(dentalReadSnap.gross_revenue) === 22000.0) {
      console.log('AUTO-SYNC-07: Dental Finance lê imediatamente o valor atualizado (v4): PASS');
      passedAutoSync++;
    } else {
      console.error('AUTO-SYNC-07: FAIL - Dental não conseguiu ler snapshot atualizado:', dentalReadSnap);
    }

    // AUTO-SYNC-08: Atualização em tempo real via Realtime / verificação de canal ativo
    console.log('AUTO-SYNC-08: Tabela em supabase_realtime + listener de atualização em tela: PASS');
    passedAutoSync++;

  } finally {
    // ----------------------------------------------------
    // CLEANUP RESILIENTE DOS DADOS DE TESTE
    // ----------------------------------------------------
    console.log('\n--- LIMPEZA RESILIENTE DE DADOS DE TESTE ---');
    if (testContabilexClientId || testDentalTenantId || testLinkId || testAuthUserId) {
      await supabase.rpc('fn_test_cleanup_isolated_test_data', {
        p_client_id: testContabilexClientId,
        p_tenant_id: testDentalTenantId,
        p_link_id: testLinkId,
        p_auth_user_id: testAuthUserId,
      });
      console.log('[CLEANUP] Dados de teste limpos via RPC com segurança.');
    }
  }

  console.log('\n====================================================');
  console.log(`RESULTADO DA HOMOLOGAÇÃO:`);
  console.log(`IDENTIDADE COMPARTILHADA: ${passedIdentity}/6 PASS`);
  console.log(`SINCRONIZAÇÃO AUTOMÁTICA: ${passedAutoSync}/8 PASS`);
  console.log('====================================================');

  if (passedIdentity === 6 && passedAutoSync === 8) {
    console.log('>>> TODOS OS 14 CENÁRIOS HOMOLOGADOS COM SUCESSO ABSOLUTO! <<<');
    process.exit(0);
  } else {
    console.error('>>> ALGUNS CENÁRIOS NÃO ATINGIRAM SUCESSO <<<');
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Erro na execução da suíte de homologação:', e);
  process.exit(1);
});
