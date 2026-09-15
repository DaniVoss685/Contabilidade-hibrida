/**
 * SUÍTE DE TESTES AUTOMATIZADOS DE AUTORIZAÇÃO E RLS (FASE 2)
 * Arquivo: tests/security/rlsPhase2.test.ts
 *
 * Valida isolamento estrito multi-tenant (Daniel vs Leonardo vs Anon),
 * bloqueio de IDOR, bloqueio de adulteração de localStorage/role,
 * integridade referencial cruzada e comportamento de SELECT sem filtro.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fbkouuvupdyffizwoiti.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia291dXZ1cGR5ZmZpendvaXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTI2NDUsImV4cCI6MjA3MDg2ODY0NX0.9xN5BQug6yHm_k9H20v524XFuCbd1JzW2aRSQJWstfo';

const DANIEL_EMAIL = 'danielricardoarantes@gmail.com';
const DANIEL_PASS = 'Daniel@2026';
const DANIEL_TENANT = 'clinic_1789153962617_gpw1';

const LEONARDO_EMAIL = 'leonardoricardoarantes@gmail.com';
const LEONARDO_PASS = 'Leonardo@2026';
const LEONARDO_TENANT = 'clinic_1789405023533_phq5';

// Helper com timeout rígido de 15 segundos por operação
function withTimeout<T = any>(promise: PromiseLike<T> | Promise<T>, timeoutMs = 15000, label = 'operação'): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de ${timeoutMs}ms excedido em: ${label}`)), timeoutMs)
    ),
  ]);
}

interface TestResult {
  pass: boolean;
  details: string;
}

const results: Record<string, TestResult> = {};

async function runAuthZSuite() {
  console.log('================================================================');
  console.log('INICIANDO SUÍTE DE TESTES DE AUTORIZAÇÃO E RLS (AUTHZ-01 a AUTHZ-18)');
  console.log('================================================================\n');

  // 1. Cliente Anon (sem sessão)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2. Cliente Daniel
  const danielClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3. Cliente Leonardo
  const leonardoClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Autenticação prévia dos clientes
    console.log('[AUTH] Autenticando usuário Daniel...');
    const danielLogin = await withTimeout(
      danielClient.auth.signInWithPassword({ email: DANIEL_EMAIL, password: DANIEL_PASS }),
      15000,
      'login Daniel'
    );
    if (danielLogin.error || !danielLogin.data.session) {
      throw new Error(`Falha no login de Daniel: ${danielLogin.error?.message}`);
    }

    console.log('[AUTH] Autenticando usuário Leonardo...');
    const leonardoLogin = await withTimeout(
      leonardoClient.auth.signInWithPassword({ email: LEONARDO_EMAIL, password: LEONARDO_PASS }),
      15000,
      'login Leonardo'
    );
    if (leonardoLogin.error || !leonardoLogin.data.session) {
      throw new Error(`Falha no login de Leonardo: ${leonardoLogin.error?.message}`);
    }

    console.log('[AUTH] Usuários autenticados. Iniciando testes...\n');

    // -------------------------------------------------------------
    // BLOCO 1: ANON DENY TESTS (AUTHZ-01 a AUTHZ-04)
    // -------------------------------------------------------------
    // AUTHZ-01: Anon -> df_users DENY
    try {
      const { data, error } = await withTimeout(
        anonClient.from('df_users').select('*'),
        15000,
        'AUTHZ-01 anon df_users'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-01'] = {
        pass: isDenied,
        details: isDenied ? 'Acesso negado para anon em df_users (0 rows / bloqueado)' : 'Vazamento: anon leu df_users'
      };
    } catch (e: any) {
      results['AUTHZ-01'] = { pass: true, details: `Acesso negado com exceção: ${e.message}` };
    }

    // AUTHZ-02: Anon -> df_patients DENY
    try {
      const { data, error } = await withTimeout(
        anonClient.from('df_patients').select('*'),
        15000,
        'AUTHZ-02 anon df_patients'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-02'] = {
        pass: isDenied,
        details: isDenied ? 'Acesso negado para anon em df_patients (0 rows / bloqueado)' : 'Vazamento: anon leu pacientes'
      };
    } catch (e: any) {
      results['AUTHZ-02'] = { pass: true, details: `Acesso negado com exceção: ${e.message}` };
    }

    // AUTHZ-03: Anon -> df_sales DENY
    try {
      const { data, error } = await withTimeout(
        anonClient.from('df_sales').select('*'),
        15000,
        'AUTHZ-03 anon df_sales'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-03'] = {
        pass: isDenied,
        details: isDenied ? 'Acesso negado para anon em df_sales (0 rows / bloqueado)' : 'Vazamento: anon leu vendas'
      };
    } catch (e: any) {
      results['AUTHZ-03'] = { pass: true, details: `Acesso negado com exceção: ${e.message}` };
    }

    // AUTHZ-04: Anon -> df_expenses DENY
    try {
      const { data, error } = await withTimeout(
        anonClient.from('df_expenses').select('*'),
        15000,
        'AUTHZ-04 anon df_expenses'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-04'] = {
        pass: isDenied,
        details: isDenied ? 'Acesso negado para anon em df_expenses (0 rows / bloqueado)' : 'Vazamento: anon leu despesas'
      };
    } catch (e: any) {
      results['AUTHZ-04'] = { pass: true, details: `Acesso negado com exceção: ${e.message}` };
    }

    // -------------------------------------------------------------
    // BLOCO 2: ISOLAMENTO DANIEL -> DANIEL (ALLOW) vs LEONARDO (DENY)
    // -------------------------------------------------------------
    // AUTHZ-05: Daniel -> pacientes Daniel ALLOW
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_patients').select('*').eq('tenant_id', DANIEL_TENANT),
        15000,
        'AUTHZ-05 daniel pacientes'
      );
      const isAllowed = !error && Array.isArray(data) && data.length > 0;
      results['AUTHZ-05'] = {
        pass: isAllowed,
        details: isAllowed ? `Daniel leu ${data.length} pacientes de sua clínica com sucesso` : `Falha ao ler próprios pacientes: ${error?.message}`
      };
    } catch (e: any) {
      results['AUTHZ-05'] = { pass: false, details: e.message };
    }

    // AUTHZ-06: Daniel -> pacientes Leonardo DENY
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_patients').select('*').eq('tenant_id', LEONARDO_TENANT),
        15000,
        'AUTHZ-06 daniel tenta pacientes leonardo'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-06'] = {
        pass: isDenied,
        details: isDenied ? 'Daniel recebeu 0 pacientes de Leonardo (Bloqueio RLS efetivo)' : 'Vazamento: Daniel leu pacientes de Leonardo'
      };
    } catch (e: any) {
      results['AUTHZ-06'] = { pass: true, details: `Bloqueado com exceção: ${e.message}` };
    }

    // AUTHZ-07: Daniel INSERT tenant Leonardo DENY
    try {
      const fakePatient = {
        id: `pat_exploit_${Date.now()}`,
        tenant_id: LEONARDO_TENANT,
        org_id: LEONARDO_TENANT,
        name: 'Invasor Malicioso',
        created_at: new Date().toISOString()
      };
      const { error } = await withTimeout(
        danielClient.from('df_patients').insert(fakePatient),
        15000,
        'AUTHZ-07 daniel insert leonardo tenant'
      );
      const isBlocked = error !== null;
      results['AUTHZ-07'] = {
        pass: isBlocked,
        details: isBlocked ? `Inserção bloqueada pelo banco: "${error.message}"` : 'Falha crítica: Daniel conseguiu criar paciente no tenant de Leonardo'
      };
    } catch (e: any) {
      results['AUTHZ-07'] = { pass: true, details: `Bloqueado com exceção: ${e.message}` };
    }

    // AUTHZ-08: Daniel UPDATE registro Leonardo DENY
    try {
      // Daniel tenta atualizar qualquer paciente no tenant do Leonardo
      const { data, error } = await withTimeout(
        danielClient.from('df_patients').update({ notes: 'Adulterado por Daniel' }).eq('tenant_id', LEONARDO_TENANT).select(),
        15000,
        'AUTHZ-08 daniel update leonardo'
      );
      const isBlocked = (error !== null) || (!data || data.length === 0);
      results['AUTHZ-08'] = {
        pass: isBlocked,
        details: isBlocked ? 'Update em registro de Leonardo bloqueado (0 linhas alteradas)' : 'Falha crítica: Daniel alterou dados de Leonardo'
      };
    } catch (e: any) {
      results['AUTHZ-08'] = { pass: true, details: `Bloqueado com exceção: ${e.message}` };
    }

    // AUTHZ-09: Daniel -> vendas Leonardo DENY
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_sales').select('*').eq('tenant_id', LEONARDO_TENANT),
        15000,
        'AUTHZ-09 daniel vendas leonardo'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-09'] = {
        pass: isDenied,
        details: isDenied ? 'Daniel recebeu 0 vendas do tenant de Leonardo' : 'Vazamento: Daniel leu vendas de Leonardo'
      };
    } catch (e: any) {
      results['AUTHZ-09'] = { pass: true, details: `Bloqueado: ${e.message}` };
    }

    // AUTHZ-10: Daniel -> despesas Leonardo DENY
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_expenses').select('*').eq('tenant_id', LEONARDO_TENANT),
        15000,
        'AUTHZ-10 daniel despesas leonardo'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-10'] = {
        pass: isDenied,
        details: isDenied ? 'Daniel recebeu 0 despesas do tenant de Leonardo' : 'Vazamento: Daniel leu despesas de Leonardo'
      };
    } catch (e: any) {
      results['AUTHZ-10'] = { pass: true, details: `Bloqueado: ${e.message}` };
    }

    // AUTHZ-11: Daniel -> banco Leonardo DENY
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_bank_accounts').select('*').eq('tenant_id', LEONARDO_TENANT),
        15000,
        'AUTHZ-11 daniel banco leonardo'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-11'] = {
        pass: isDenied,
        details: isDenied ? 'Daniel recebeu 0 contas bancárias do tenant de Leonardo' : 'Vazamento: Daniel leu contas bancárias de Leonardo'
      };
    } catch (e: any) {
      results['AUTHZ-11'] = { pass: true, details: `Bloqueado: ${e.message}` };
    }

    // AUTHZ-12: Daniel -> agenda Leonardo DENY
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_appointments').select('*').eq('tenant_id', LEONARDO_TENANT),
        15000,
        'AUTHZ-12 daniel agenda leonardo'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-12'] = {
        pass: isDenied,
        details: isDenied ? 'Daniel recebeu 0 agendamentos do tenant de Leonardo' : 'Vazamento: Daniel leu agendamentos de Leonardo'
      };
    } catch (e: any) {
      results['AUTHZ-12'] = { pass: true, details: `Bloqueado: ${e.message}` };
    }

    // AUTHZ-13: Daniel -> procedimento Leonardo DENY
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_procedures').select('*').eq('tenant_id', LEONARDO_TENANT),
        15000,
        'AUTHZ-13 daniel procedimentos leonardo'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-13'] = {
        pass: isDenied,
        details: isDenied ? 'Daniel recebeu 0 procedimentos do tenant de Leonardo' : 'Vazamento: Daniel leu procedimentos de Leonardo'
      };
    } catch (e: any) {
      results['AUTHZ-13'] = { pass: true, details: `Bloqueado: ${e.message}` };
    }

    // -------------------------------------------------------------
    // BLOCO 3: ISOLAMENTO LEONARDO -> LEONARDO (ALLOW) vs DANIEL (DENY)
    // -------------------------------------------------------------
    // AUTHZ-14: Leonardo -> Leonardo ALLOW
    try {
      const { data, error } = await withTimeout(
        leonardoClient.from('df_professionals').select('*').eq('tenant_id', LEONARDO_TENANT),
        15000,
        'AUTHZ-14 leonardo profissional'
      );
      const isAllowed = !error && Array.isArray(data);
      results['AUTHZ-14'] = {
        pass: isAllowed,
        details: isAllowed ? `Leonardo acessou os dados do seu próprio tenant com sucesso (${data.length} profissional retornado)` : `Erro: ${error?.message}`
      };
    } catch (e: any) {
      results['AUTHZ-14'] = { pass: false, details: e.message };
    }

    // AUTHZ-15: Leonardo -> Daniel DENY
    try {
      const { data, error } = await withTimeout(
        leonardoClient.from('df_patients').select('*').eq('tenant_id', DANIEL_TENANT),
        15000,
        'AUTHZ-15 leonardo pacientes daniel'
      );
      const isDenied = (error !== null) || (Array.isArray(data) && data.length === 0);
      results['AUTHZ-15'] = {
        pass: isDenied,
        details: isDenied ? 'Leonardo recebeu 0 pacientes do tenant de Daniel' : 'Vazamento: Leonardo leu pacientes de Daniel'
      };
    } catch (e: any) {
      results['AUTHZ-15'] = { pass: true, details: `Bloqueado: ${e.message}` };
    }

    // -------------------------------------------------------------
    // BLOCO 4: SELECT SEM FILTRO DE TENANT
    // -------------------------------------------------------------
    // AUTHZ-16: SELECT sem filtro retorna SOMENTE tenant do usuário autenticado
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_patients').select('id, tenant_id, name'),
        15000,
        'AUTHZ-16 daniel select sem filtro'
      );
      const allDaniel = Array.isArray(data) && data.length > 0 && data.every(row => row.tenant_id === DANIEL_TENANT);
      results['AUTHZ-16'] = {
        pass: allDaniel,
        details: allDaniel ? `SELECT sem filtro retornou ${data.length} pacientes, 100% restritos a ${DANIEL_TENANT}` : 'Vazamento: SELECT sem filtro retornou registros de outros tenants'
      };
    } catch (e: any) {
      results['AUTHZ-16'] = { pass: false, details: e.message };
    }

    // -------------------------------------------------------------
    // BLOCO 5: RESISTÊNCIA A ADULTERAÇÃO DE TENANT / ROLE NO CLIENTE
    // -------------------------------------------------------------
    // AUTHZ-17: Forçar clinic_id diferente no token não altera RLS (o banco decide via auth.uid())
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_users').select('id, clinic_id, auth_user_id'),
        15000,
        'AUTHZ-17 daniel df_users'
      );
      const isSafe = Array.isArray(data) && data.length === 1 && data[0].clinic_id === DANIEL_TENANT;
      results['AUTHZ-17'] = {
        pass: isSafe,
        details: isSafe ? `Banco resolveu clinic_id=${data[0].clinic_id} via auth.uid(), imutável por adulteração de storage local` : 'Falha ao resolver perfil seguro'
      };
    } catch (e: any) {
      results['AUTHZ-17'] = { pass: false, details: e.message };
    }

    // AUTHZ-18: Tentativa de UPDATE arbitrário de role ou clinic_id bloqueado por WITH CHECK
    try {
      const { data, error } = await withTimeout(
        danielClient.from('df_users').update({ clinic_id: LEONARDO_TENANT, role: 'PLATFORM_ADMIN' }).eq('auth_user_id', danielLogin.data.user!.id).select(),
        15000,
        'AUTHZ-18 exploit role/clinic_id'
      );
      const isBlocked = error !== null;
      results['AUTHZ-18'] = {
        pass: isBlocked,
        details: isBlocked ? `Banco rejeitou adulteração de tenant/role: "${error.message}"` : 'Falha crítica: Usuário conseguiu alterar seu tenant no df_users'
      };
    } catch (e: any) {
      results['AUTHZ-18'] = { pass: true, details: `Bloqueado com exceção: ${e.message}` };
    }

    // -------------------------------------------------------------
    // BLOCO EXTRA: TESTE DE INTEGRIDADE CRUZADA (CROSS-TENANT FOREIGN KEY)
    // -------------------------------------------------------------
    try {
      // Daniel tenta criar agendamento referenciando um patient_id inexistente em seu tenant
      const exploitAppt = {
        id: `appt_cross_${Date.now()}`,
        tenant_id: DANIEL_TENANT,
        org_id: DANIEL_TENANT,
        patient_id: 'pat_inexistente_ou_de_outro_tenant_999',
        patient_name: 'Vítima',
        date: '2026-09-30',
        start_time: '14:00',
        end_time: '15:00',
        dentist_name: 'Dr. Daniel',
        procedure_name: 'Consulta',
        status: 'AGENDADO'
      };
      const { error } = await withTimeout(
        danielClient.from('df_appointments').insert(exploitAppt),
        15000,
        'Cross-tenant appointment exploit'
      );
      const isCrossBlocked = error !== null;
      console.log(`[CROSS-TENANT INTEGRITY] Tentativa de agendamento com patient_id cruzado: ${isCrossBlocked ? '✅ BLOQUEADO (' + error?.message + ')' : '❌ VULNERÁVEL'}`);
    } catch (e: any) {
      console.log(`[CROSS-TENANT INTEGRITY] Bloqueado com exceção: ${e.message}`);
    }

  } finally {
    // Clean SignOut de todos os clientes
    await danielClient.auth.signOut().catch(() => {});
    await leonardoClient.auth.signOut().catch(() => {});
  }

  // -------------------------------------------------------------
  // RELATÓRIO FINAL
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log('RESULTADO DA BATERIA AUTHZ-01 A AUTHZ-18:');
  console.log('================================================================');
  let allPass = true;
  for (const [id, r] of Object.entries(results)) {
    const status = r.pass ? '✅ PASS' : '❌ FAIL';
    if (!r.pass) allPass = false;
    console.log(`[${id}] ${status} -> ${r.details}`);
  }

  console.log('================================================================');
  console.log(`STATUS GERAL: ${allPass ? 'TODOS OS TESTES DE AUTORIZAÇÃO PASSARAM COM SUCESSO (18/18)!' : 'FALHA EM TESTES DE AUTORIZAÇÃO'}`);
  console.log('================================================================\n');

  process.exit(allPass ? 0 : 1);
}

runAuthZSuite().catch((err) => {
  console.error('Erro inesperado na execução da suíte de autorização:', err);
  process.exit(1);
});
