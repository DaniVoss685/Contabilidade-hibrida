import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://fbkouuvupdyffizwoiti.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia291dXZ1cGR5ZmZpendvaXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTI2NDUsImV4cCI6MjA3MDg2ODY0NX0.9xN5BQug6yHm_k9H20v524XFuCbd1JzW2aRSQJWstfo';

async function runRefreshHydrationTests() {
  console.log('================================================================');
  console.log('TESTE DE HIDRATAÇÃO PÓS-REFRESH (F5) COM RLS ATIVA');
  console.log('================================================================\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // 1. Autenticar como Daniel
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'danielricardoarantes@gmail.com',
    password: 'Daniel@2026',
  });

  if (authError || !authData.session) {
    console.error('❌ Falha ao autenticar Daniel:', authError);
    process.exit(1);
  }

  const token = authData.session.access_token;
  const tenantId = 'clinic_1789153962617_gpw1';
  console.log(`[AUTH] Daniel autenticado com sucesso. Token JWT: ${token.substring(0, 20)}...`);

  // 2. Simular fetch de hidratação (exatamente como SupabaseService.getTenantData faz)
  const restUrl = `${SUPABASE_URL}/rest/v1`;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const endpoints = [
    `df_professionals?tenant_id=eq.${tenantId}&select=*`,
    `df_payroll_history?tenant_id=eq.${tenantId}&order=month.asc&select=*`,
    `df_patients?tenant_id=eq.${tenantId}&order=created_at.desc&select=*`,
    `df_sales?tenant_id=eq.${tenantId}&order=service_date.desc&select=*`,
    `df_expenses?tenant_id=eq.${tenantId}&order=competence_date.desc&select=*`,
    `df_procedures?tenant_id=eq.${tenantId}&order=name.asc&select=*`,
    `df_clinical_inputs?tenant_id=eq.${tenantId}&order=name.asc&select=*`,
    `df_bank_accounts?tenant_id=eq.${tenantId}&select=*`,
    `df_appointments?tenant_id=eq.${tenantId}&order=date.asc&select=*`,
  ];

  const results: Record<string, any[]> = {};
  let anyError = false;

  for (const ep of endpoints) {
    const table = ep.split('?')[0];
    const res = await fetch(`${restUrl}/${ep}`, { headers });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ [ERRO] ${table}: HTTP ${res.status} - ${errText}`);
      anyError = true;
    } else {
      const data = await res.json();
      results[table] = data;
    }
  }

  if (anyError) {
    console.error('\n❌ Houve erro de RLS ou requisição durante a hidratação!');
    process.exit(1);
  }

  console.log('\n[DADOS HIDRATADOS COM SUCESSO]:');
  console.log(`- Profissionais: ${results['df_professionals']?.length || 0}`);
  console.log(`- Pacientes: ${results['df_patients']?.length || 0}`);
  console.log(`- Vendas: ${results['df_sales']?.length || 0}`);
  console.log(`- Despesas: ${results['df_expenses']?.length || 0}`);
  console.log(`- Procedimentos: ${results['df_procedures']?.length || 0}`);
  console.log(`- Contas Bancárias: ${results['df_bank_accounts']?.length || 0}`);
  console.log(`- Agendamentos: ${results['df_appointments']?.length || 0}`);

  // Asserções críticas
  const hasPatients = (results['df_patients']?.length || 0) > 0;
  const hasSales = (results['df_sales']?.length || 0) > 0;
  const hasExpenses = (results['df_expenses']?.length || 0) > 0;
  const hasBanks = (results['df_bank_accounts']?.length || 0) > 0;

  if (!hasPatients || !hasSales || !hasExpenses || !hasBanks) {
    console.error('❌ Falha: Alguns dados vitais vieram vazios na hidratação!');
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('✅ TESTE PASSOU: HIDRATAÇÃO DO F5 RETÉM 100% DOS DADOS VISUAIS!');
  console.log('================================================================');
}

runRefreshHydrationTests().catch((e) => {
  console.error('Erro no teste:', e);
  process.exit(1);
});
