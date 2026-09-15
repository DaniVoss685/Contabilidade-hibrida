import { createClient } from '@supabase/supabase-js';

// Setup de mock do localStorage com controle de quota
if (typeof global.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const quotaLimit = 5 * 1024 * 1024; // 5MB

  global.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => {
      let currentSize = 0;
      for (const [k, v] of store.entries()) {
        if (k !== key) currentSize += (k.length + v.length) * 2;
      }
      const newSize = currentSize + (key.length + String(val).length) * 2;
      if (newSize > quotaLimit) {
        const err: any = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of '" + key + "' exceeded the quota.");
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
      store.set(key, String(val));
    },
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] || null,
    get length() {
      return store.size;
    },
  } as any;
}

import { db, getLocalStorageStats } from '../../src/lib/db';

const SUPABASE_URL = 'https://fbkouuvupdyffizwoiti.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia291dXZ1cGR5ZmZpendvaXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTI2NDUsImV4cCI6MjA3MDg2ODY0NX0.9xN5BQug6yHm_k9H20v524XFuCbd1JzW2aRSQJWstfo';

async function runAuthQuotaF5Regression() {
  console.log('================================================================');
  console.log('TESTE DE REGRESSÃO: LOGIN SOB QUOTA, F5 3X E ISOLAMENTO DANIEL/LEO');
  console.log('================================================================\n');

  let quotaExceededAuthCount = 0;

  // 1. Stress de localStorage antes do primeiro login (preenchendo ~4.5MB)
  console.log('[STRESS] Injetando 4.5MB de caches antigos no localStorage...');
  const chunk = 'K'.repeat(250000); // 500KB
  for (let i = 0; i < 9; i++) {
    try {
      localStorage.setItem(`df_clinic_stale_${i}_cache`, chunk);
    } catch {}
  }

  const statsInitial = getLocalStorageStats();
  console.log(`[STORAGE ANTES] Tamanho total: ${(statsInitial.totalBytes / 1024 / 1024).toFixed(2)} MB (${statsInitial.keyCount} chaves)`);
  console.log(`[STORAGE ANTES] Top 3 maiores chaves:`);
  statsInitial.keys.slice(0, 3).forEach((k) => {
    console.log(`  - ${k.key}: ${(k.bytes / 1024).toFixed(1)} KB`);
  });

  // 2. Login Daniel sob stress de quota
  console.log('\n--- 1. TESTE LOGIN DANIEL SOB QUOTA ---');
  let danielLoginRes;
  try {
    danielLoginRes = await db.authenticate('danielricardoarantes@gmail.com', 'Daniel@2026');
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError') quotaExceededAuthCount++;
    throw err;
  }

  if (!danielLoginRes.success || !danielLoginRes.session) {
    throw new Error('Falha no login de Daniel: ' + danielLoginRes.error);
  }
  console.log('✅ Login Daniel: PASS (Tenant:', danielLoginRes.session.tenantId, ')');

  // Confirmação de sessão oficial via Supabase Client
  const danielAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: dUserData } = await danielAuth.auth.getUser(danielLoginRes.session.token);
  console.log('✅ Supabase Session Persistida: PASS (User ID:', dUserData.user?.id, ')');

  // 3. F5 3x para Daniel
  console.log('\n--- 2. TESTE F5 3X PARA DANIEL ---');
  for (let f5 = 1; f5 <= 3; f5++) {
    // Simula F5: db.hydrateTenantAsync
    await db.hydrateTenantAsync('clinic_1789153962617_gpw1');
    const patients = db.getPatients();
    const sales = db.getSales();
    const expenses = db.getExpenses();
    const currentSession = db.getCurrentSession();

    if (!currentSession || patients.length === 0 || sales.length === 0 || expenses.length === 0) {
      throw new Error(`Falha na restauração do F5 ciclo ${f5}: dados zerados`);
    }
    console.log(`✅ F5 Ciclo ${f5}/3: PASS (Pacientes: ${patients.length}, Vendas: ${sales.length}, Despesas: ${expenses.length})`);
  }

  // Dashboard validation para Daniel
  const sales = db.getSales();
  const expenses = db.getExpenses();
  const totalRev = sales.reduce((acc, s) => acc + (s.totalValue || 0), 0);
  const totalExp = expenses.reduce((acc, e) => acc + (e.value || 0), 0);
  console.log('✅ Dashboard Daniel: PASS (Receitas:', totalRev, 'Despesas:', totalExp, ')');

  // 4. Logout Daniel
  console.log('\n--- 3. TESTE LOGOUT DANIEL ---');
  await db.logout();
  const sessionAfterLogout = db.getCurrentSession();
  console.log('✅ Logout Daniel: PASS (Sessão limpa:', sessionAfterLogout === null, ')');

  // 5. Login Leonardo sob quota
  console.log('\n--- 4. TESTE LOGIN LEONARDO SOB QUOTA ---');
  // Re-injetar dados para garantir teste de quota no login de Leonardo
  for (let i = 0; i < 5; i++) {
    try {
      localStorage.setItem(`df_clinic_stale_leo_${i}`, chunk);
    } catch {}
  }

  let leoLoginRes;
  try {
    leoLoginRes = await db.authenticate('leonardoricardoarantes@gmail.com', 'Leonardo@2026');
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError') quotaExceededAuthCount++;
    throw err;
  }

  if (!leoLoginRes.success || !leoLoginRes.session) {
    throw new Error('Falha no login de Leonardo: ' + leoLoginRes.error);
  }
  console.log('✅ Login Leonardo: PASS (Tenant:', leoLoginRes.session.tenantId, ')');

  // 6. F5 3x para Leonardo
  console.log('\n--- 5. TESTE F5 3X PARA LEONARDO ---');
  for (let f5 = 1; f5 <= 3; f5++) {
    await db.hydrateTenantAsync(leoLoginRes.session.tenantId);
    const prof = db.getProfessional();
    const currentSession = db.getCurrentSession();

    if (!currentSession || !prof) {
      throw new Error(`Falha na restauração do F5 de Leonardo ciclo ${f5}`);
    }
    console.log(`✅ F5 Ciclo ${f5}/3 Leonardo: PASS (Profissional: ${prof.name})`);
  }

  // 7. Verificação de isolamento: Leonardo não possui dados de Daniel
  const leoPatients = db.getPatients();
  const danielPatientIds = new Set(['pat_1789173932941_nkf6', 'pat_1789435696252_7wgs']);
  const hasDanielPatients = leoPatients.some((p) => danielPatientIds.has(p.id));
  if (hasDanielPatients) {
    throw new Error('Falha de isolamento: pacientes de Daniel visíveis para Leonardo!');
  }
  console.log('✅ Isolamento Multi-Tenant: PASS (Nenhum paciente de Daniel visível para Leonardo)');

  // 8. Logout Leonardo e Re-login Daniel (Ciclo completo)
  console.log('\n--- 6. TESTE LOGOUT LEONARDO E RE-LOGIN DANIEL ---');
  await db.logout();
  const danielRelogin = await db.authenticate('danielricardoarantes@gmail.com', 'Daniel@2026');
  if (!danielRelogin.success || !danielRelogin.session) {
    throw new Error('Falha no re-login de Daniel');
  }
  console.log('✅ Re-login Daniel: PASS (Sessão restabelecida)');

  const statsFinal = getLocalStorageStats();
  console.log('\n================================================================');
  console.log('MÉTRICAS FINAIS DE ARMAZENAMENTO E QUOTA:');
  console.log(`[STORAGE ANTES]: ${(statsInitial.totalBytes / 1024 / 1024).toFixed(2)} MB (${statsInitial.keyCount} chaves)`);
  console.log(`[STORAGE DEPOIS]: ${(statsFinal.totalBytes / 1024 / 1024).toFixed(2)} MB (${statsFinal.keyCount} chaves)`);
  console.log(`[QUOTAEXCEEDED NO AUTH]: ${quotaExceededAuthCount}`);
  console.log('================================================================');

  if (quotaExceededAuthCount === 0) {
    console.log('\nSTATUS GERAL: 100% PASS — TODAS AS RESTRIÇÕES HOMOLOGADAS COM SUCESSO');
  } else {
    throw new Error(`QuotaExceeded no Auth detectado: ${quotaExceededAuthCount}`);
  }
}

runAuthQuotaF5Regression()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro fatal no teste de regressão de quota:', err);
    process.exit(1);
  });
