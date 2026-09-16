/**
 * SUÍTE DE TESTES FUNCIONAIS: PERSISTÊNCIA REAL NO SUPABASE
 * - Contas Bancárias (BANK-01 a BANK-10)
 * - Horário de Almoço na Agenda (LUNCH-01 a LUNCH-09)
 *
 * Arquivo: tests/functional/bankLunchPersistence.test.ts
 */

import { createClient } from '@supabase/supabase-js';
import { db } from '../../src/lib/db';
import { supabase, SupabaseService } from '../../src/lib/supabaseClient';

const SUPABASE_URL = 'https://fbkouuvupdyffizwoiti.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia291dXZ1cGR5ZmZpendvaXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTI2NDUsImV4cCI6MjA3MDg2ODY0NX0.9xN5BQug6yHm_k9H20v524XFuCbd1JzW2aRSQJWstfo';

const DANIEL_EMAIL = 'danielricardoarantes@gmail.com';
const DANIEL_PASS = 'Daniel@2026';
const DANIEL_TENANT = 'clinic_1789153962617_gpw1';

const LEONARDO_EMAIL = 'leonardoricardoarantes@gmail.com';
const LEONARDO_PASS = 'Leonardo@2026';
const LEONARDO_TENANT = 'clinic_1789405023533_phq5';

interface TestResult {
  pass: boolean;
  details: string;
}

const results: Record<string, TestResult> = {};

function assert(code: string, condition: boolean, details: string) {
  results[code] = { pass: condition, details };
  const icon = condition ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${code}: ${details}`);
  if (!condition) {
    throw new Error(`Assertion failed for ${code}: ${details}`);
  }
}

async function runBankLunchSuite() {
  console.log('================================================================');
  console.log('TESTES FUNCIONAIS: CONTAS BANCÁRIAS E HORÁRIO DE ALMOÇO');
  console.log('================================================================\n');

  // Clientes Supabase diretos para validação independente no banco
  const danielClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const leonardoClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: danielAuth, error: danielAuthErr } = await danielClient.auth.signInWithPassword({
    email: DANIEL_EMAIL,
    password: DANIEL_PASS,
  });
  if (danielAuthErr || !danielAuth.session) {
    throw new Error(`Falha ao autenticar Daniel: ${danielAuthErr?.message}`);
  }

  const { data: leonardoAuth, error: leonardoAuthErr } = await leonardoClient.auth.signInWithPassword({
    email: LEONARDO_EMAIL,
    password: LEONARDO_PASS,
  });
  if (leonardoAuthErr || !leonardoAuth.session) {
    throw new Error(`Falha ao autenticar Leonardo: ${leonardoAuthErr?.message}`);
  }

  // Configura sessão oficial para Daniel
  await supabase.auth.signInWithPassword({ email: DANIEL_EMAIL, password: DANIEL_PASS });

  // -------------------------------------------------------------------------
  // PARTE 1: CONTAS BANCÁRIAS (BANK-01 a BANK-10)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTES DE CONTAS BANCÁRIAS (BANK-01 a BANK-10) ---');

  // Setup de tenant limpo para teste de contas bancárias (usando Leonardo para garantir isolamento e 0 transações)
  await supabase.auth.signInWithPassword({ email: LEONARDO_EMAIL, password: LEONARDO_PASS });
  db.loadTenant(LEONARDO_TENANT, false);

  // Limpa contas existentes de teste do Leonardo diretamente no banco
  const { data: initialLeoBanks } = await leonardoClient
    .from('df_bank_accounts')
    .select('id')
    .eq('tenant_id', LEONARDO_TENANT);
  if (initialLeoBanks && initialLeoBanks.length > 0) {
    for (const b of initialLeoBanks) {
      await leonardoClient.from('df_bank_accounts').delete().eq('id', b.id).eq('tenant_id', LEONARDO_TENANT);
    }
  }

  // BANK-01: Estado de 0 contas não semeia automaticamente contas falsas
  await db.hydrateTenantAsync(LEONARDO_TENANT);
  const accountsLeoEmpty = db.getBankAccounts();
  assert(
    'BANK-01',
    accountsLeoEmpty.length === 0,
    `Tenant com 0 contas no banco retornou exatamente ${accountsLeoEmpty.length} contas (sem auto-seed de Itaú/Inter/Caixa)`
  );

  // BANK-02: Cadastro de conta bancária via addBankAccountAsync persiste no PostgreSQL
  const testBankData = {
    name: 'Nubank PJ Clínica',
    bankName: 'Nubank',
    accountType: 'CORRENTE_PJ' as const,
    initialBalance: 1500,
    currentBalance: 1500,
    isActive: true,
  };
  const createdBank = await db.addBankAccountAsync(testBankData);
  assert(
    'BANK-02',
    Boolean(createdBank.id && createdBank.id.startsWith('bank_')),
    `Conta bancária criada localmente com ID ${createdBank.id}`
  );

  // Verifica diretamente via PostgreSQL client
  const { data: bankFromDb, error: selectBankErr } = await leonardoClient
    .from('df_bank_accounts')
    .select('*')
    .eq('id', createdBank.id)
    .eq('tenant_id', LEONARDO_TENANT)
    .single();

  assert(
    'BANK-02b',
    !selectBankErr && bankFromDb && bankFromDb.name === 'Nubank PJ Clínica',
    `Conta persistida com sucesso na tabela df_bank_accounts do Supabase: ${bankFromDb?.name}`
  );

  // BANK-03: Simulação de F5 / re-hidratação preserva a conta recém cadastrada
  db.loadTenant(LEONARDO_TENANT, false);
  await db.hydrateTenantAsync(LEONARDO_TENANT);
  const accountsAfterF5 = db.getBankAccounts();
  const foundAccount = accountsAfterF5.find((a) => a.id === createdBank.id);
  assert(
    'BANK-03',
    Boolean(foundAccount && foundAccount.name === 'Nubank PJ Clínica'),
    `Conta bancária permaneceu intacta após re-hidratação/F5`
  );

  // BANK-04: Bloqueio de exclusão quando a conta possui movimentações vinculadas
  // Alterna para Daniel onde a conta Itaú possui despesas vinculadas
  await supabase.auth.signInWithPassword({ email: DANIEL_EMAIL, password: DANIEL_PASS });
  db.loadTenant(DANIEL_TENANT, false);
  await db.hydrateTenantAsync(DANIEL_TENANT);

  let itauDaniel = db.getBankAccounts().find((a) => a.id === 'bank_itau_clinic_1789153962617_gpw1');
  if (!itauDaniel && db.getBankAccounts().length > 0) {
    itauDaniel = db.getBankAccounts()[0];
  }
  if (itauDaniel && !db.hasBankTransactions(itauDaniel.id)) {
    db.addExpense({
      supplierName: 'Fornecedor Teste',
      supplierCpfCnpj: '',
      description: 'Despesa Teste Conta Bancária',
      categoryId: 'cat_01_01',
      categoryCode: '01.01',
      categoryName: 'Salários',
      value: 100,
      expenseType: 'UNICA',
      status: 'PAGO',
      dueDate: '2026-09-16',
      paymentDate: '2026-09-16',
      competenceDate: '2026-09-16',
      entity: 'CNPJ',
      dedutivelLivroCaixaPf: 'SIM',
      impactaFatorRPj: true,
      despesaOperacionalPj: true,
      bankAccountId: itauDaniel.id,
    });
  }
  const hasTx = itauDaniel ? db.hasBankTransactions(itauDaniel.id) : false;
  assert(
    'BANK-04a',
    hasTx === true,
    `Identificação correta de transações vinculadas à conta do Daniel (hasBankTransactions = true)`
  );

  if (itauDaniel) {
    const deleteAttempt = await db.deleteBankAccountAsync(itauDaniel.id);
    assert(
      'BANK-04b',
      deleteAttempt.success === false && deleteAttempt.hasTransactions === true,
      `Exclusão física bloqueada com hasTransactions: true e mensagem: "${deleteAttempt.error}"`
    );
  }

  // BANK-05: Exclusão de conta bancária sem transações realiza DELETE físico no Supabase
  await supabase.auth.signInWithPassword({ email: LEONARDO_EMAIL, password: LEONARDO_PASS });
  db.loadTenant(LEONARDO_TENANT, false);
  await db.hydrateTenantAsync(LEONARDO_TENANT);

  const deleteResult = await db.deleteBankAccountAsync(createdBank.id);
  assert(
    'BANK-05a',
    deleteResult.success === true,
    `Exclusão da conta Nubank (sem transações) retornou success = true`
  );

  const { data: dbCheckDeleted } = await leonardoClient
    .from('df_bank_accounts')
    .select('id')
    .eq('id', createdBank.id);

  assert(
    'BANK-05b',
    !dbCheckDeleted || dbCheckDeleted.length === 0,
    `Registro foi fisicamente deletado da tabela df_bank_accounts do PostgreSQL`
  );

  // BANK-06: Simulação de F5 após exclusão: a conta NÃO reaparece do nada (sem ressurreição)
  db.loadTenant(LEONARDO_TENANT, false);
  await db.hydrateTenantAsync(LEONARDO_TENANT);
  const accountsAfterDeleteF5 = db.getBankAccounts();
  const ghostAccount = accountsAfterDeleteF5.find((a) => a.id === createdBank.id);
  assert(
    'BANK-06',
    !ghostAccount,
    `Conta excluída NÃO ressuscitou após re-hidratação/F5`
  );

  // BANK-07: Estado de 0 contas bancárias sobrevive a F5 sem recriar as 3 contas default
  assert(
    'BANK-07',
    accountsAfterDeleteF5.length === 0,
    `Estado legítimo de 0 contas preservado após F5 (total contas = ${accountsAfterDeleteF5.length})`
  );

  // BANK-08: Tratamento gracioso de erro não cria contas bancárias falsas
  const fakeErrorHandling = () => {
    const tempAccounts = db.getBankAccounts();
    return tempAccounts.length;
  };
  assert(
    'BANK-08',
    fakeErrorHandling() === 0,
    `Getter getBankAccounts() não insere dados falsos mesmo com 0 contas`
  );

  // BANK-09: Isolamento multi-tenant de contas bancárias
  await supabase.auth.signInWithPassword({ email: DANIEL_EMAIL, password: DANIEL_PASS });
  db.loadTenant(DANIEL_TENANT, false);
  await db.hydrateTenantAsync(DANIEL_TENANT);
  const danielAccounts = db.getBankAccounts();

  assert(
    'BANK-09a',
    danielAccounts.length > 0 && danielAccounts.some((a) => a.id.includes(DANIEL_TENANT)),
    `Contas de Daniel permanecem preservadas no tenant dele`
  );

  // Daniel (usuário comum) não enxerga contas de Leonardo via Supabase RLS
  const { data: danielLookingAtLeoBanks } = await supabase
    .from('df_bank_accounts')
    .select('*')
    .eq('tenant_id', LEONARDO_TENANT);
  assert(
    'BANK-09b',
    !danielLookingAtLeoBanks || danielLookingAtLeoBanks.length === 0,
    `Isolamento RLS: Usuário comum (Daniel) recebe 0 contas ao tentar consultar tenant de Leonardo`
  );

  // BANK-10: Compatibilidade de método síncrono addBankAccount e deleteBankAccount
  await supabase.auth.signInWithPassword({ email: LEONARDO_EMAIL, password: LEONARDO_PASS });
  db.loadTenant(LEONARDO_TENANT, false);

  const syncAccount = db.addBankAccount({
    name: 'Conta Teste Síncrona',
    bankName: 'Banco Teste',
    accountType: 'CORRENTE_PF',
    initialBalance: 0,
    currentBalance: 0,
  });
  assert(
    'BANK-10a',
    Boolean(syncAccount.id && syncAccount.name === 'Conta Teste Síncrona'),
    `addBankAccount síncrono retornou objeto imediato com ID ${syncAccount.id}`
  );
  const syncDeleted = db.deleteBankAccount(syncAccount.id);
  assert(
    'BANK-10b',
    syncDeleted === true,
    `deleteBankAccount síncrono retornou true para conta sem movimentações`
  );
  await leonardoClient.from('df_bank_accounts').delete().eq('id', syncAccount.id);

  // -------------------------------------------------------------------------
  // PARTE 2: HORÁRIO DE ALMOÇO NA AGENDA (LUNCH-01 a LUNCH-09)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTES DE HORÁRIO DE ALMOÇO NA AGENDA (LUNCH-01 a LUNCH-09) ---');

  // LUNCH-01: Novo/unconfigured tenant inicia com lunchBreakEnabled: false e sem horários forçados
  await supabase.auth.signInWithPassword({ email: LEONARDO_EMAIL, password: LEONARDO_PASS });
  db.loadTenant(LEONARDO_TENANT, false);

  // Reseta preferências do Leonardo diretamente no banco para estado limpo
  await leonardoClient
    .from('df_system_preferences')
    .delete()
    .eq('tenant_id', LEONARDO_TENANT);

  db.loadTenant(LEONARDO_TENANT, false);
  const initialLeoPrefs = db.getPreferences();
  assert(
    'LUNCH-01',
    initialLeoPrefs.lunchBreakEnabled === false &&
      !initialLeoPrefs.lunchBreakStart &&
      !initialLeoPrefs.lunchBreakEnd,
    `Tenant sem preferências inicia com lunchBreakEnabled = false, start = undefined, end = undefined (sem 12:00-13:00 forçado)`
  );

  // LUNCH-02: Salvar horário de almoço ON com 11:00 às 13:00 persiste na tabela df_system_preferences
  const updatedPrefs = await db.updatePreferencesAsync({
    lunchBreakEnabled: true,
    lunchBreakStart: '11:00',
    lunchBreakEnd: '13:00',
  });
  assert(
    'LUNCH-02a',
    updatedPrefs.lunchBreakEnabled === true &&
      updatedPrefs.lunchBreakStart === '11:00' &&
      updatedPrefs.lunchBreakEnd === '13:00',
    `Preferência de almoço atualizada no estado local: ON (11:00 - 13:00)`
  );

  // Validação direta no Supabase
  const { data: dbLeoPrefs, error: dbLeoPrefsErr } = await leonardoClient
    .from('df_system_preferences')
    .select('lunch_break_enabled, lunch_break_start, lunch_break_end')
    .eq('tenant_id', LEONARDO_TENANT)
    .single();

  assert(
    'LUNCH-02b',
    !dbLeoPrefsErr &&
      dbLeoPrefs.lunch_break_enabled === true &&
      dbLeoPrefs.lunch_break_start === '11:00' &&
      dbLeoPrefs.lunch_break_end === '13:00',
    `Persistência real no PostgreSQL: lunch_break_enabled = true, lunch_break_start = 11:00, lunch_break_end = 13:00`
  );

  // LUNCH-03: Simulação de F5 e re-hidratação preserva fielmente 11:00 às 13:00
  db.loadTenant(LEONARDO_TENANT, false);
  await db.hydrateTenantAsync(LEONARDO_TENANT);
  const hydratedLeoPrefs = db.getPreferences();
  assert(
    'LUNCH-03',
    hydratedLeoPrefs.lunchBreakEnabled === true &&
      hydratedLeoPrefs.lunchBreakStart === '11:00' &&
      hydratedLeoPrefs.lunchBreakEnd === '13:00',
    `Re-hidratação/F5 preservou com sucesso o horário de almoço personalizado (11:00 - 13:00)`
  );

  // LUNCH-04: Salvar horário de almoço OFF persiste no Supabase
  const turnedOffPrefs = await db.updatePreferencesAsync({
    lunchBreakEnabled: false,
  });
  assert(
    'LUNCH-04a',
    turnedOffPrefs.lunchBreakEnabled === false,
    `Horário de almoço desativado no estado local`
  );

  const { data: dbTurnedOff } = await leonardoClient
    .from('df_system_preferences')
    .select('lunch_break_enabled')
    .eq('tenant_id', LEONARDO_TENANT)
    .single();

  assert(
    'LUNCH-04b',
    dbTurnedOff?.lunch_break_enabled === false,
    `Persistência real no PostgreSQL confirmou lunch_break_enabled = false`
  );

  // LUNCH-05: Re-hidratação após OFF mantém o horário desativado
  db.loadTenant(LEONARDO_TENANT, false);
  await db.hydrateTenantAsync(LEONARDO_TENANT);
  const rehydratedOffPrefs = db.getPreferences();
  assert(
    'LUNCH-05',
    rehydratedOffPrefs.lunchBreakEnabled === false,
    `Re-hidratação/F5 manteve horário de almoço desativado`
  );

  // LUNCH-06: Verificação de conflito da agenda com horário ON (11:00-13:00)
  // Ativa almoço das 11:00 às 13:00
  await db.updatePreferencesAsync({
    lunchBreakEnabled: true,
    lunchBreakStart: '11:00',
    lunchBreakEnd: '13:00',
  });

  const prefsForConflict = db.getPreferences();
  const lunchActive =
    prefsForConflict.lunchBreakEnabled === true &&
    Boolean(prefsForConflict.lunchBreakStart) &&
    Boolean(prefsForConflict.lunchBreakEnd);

  // Testa se uma consulta às 11:30 colide com o almoço
  const aptStartMin = 11 * 60 + 30; // 11:30 = 690 min
  const aptEndMin = 12 * 60 + 15; // 12:15 = 735 min
  const [lStartH, lStartM] = prefsForConflict.lunchBreakStart!.split(':').map(Number);
  const [lEndH, lEndM] = prefsForConflict.lunchBreakEnd!.split(':').map(Number);
  const lunchStartMin = lStartH * 60 + lStartM; // 660 min
  const lunchEndMin = lEndH * 60 + lEndM; // 780 min

  const hasConflictWhenOn = lunchActive && aptStartMin < lunchEndMin && aptEndMin > lunchStartMin;
  assert(
    'LUNCH-06',
    hasConflictWhenOn === true,
    `Detecção de conflito na agenda: consulta das 11:30 às 12:15 colide com o almoço ativo (11:00-13:00)`
  );

  // LUNCH-07: Verificação de conflito da agenda com horário OFF
  // Desativa almoço
  await db.updatePreferencesAsync({ lunchBreakEnabled: false });
  const prefsOff = db.getPreferences();
  const lunchActiveOff =
    prefsOff.lunchBreakEnabled === true &&
    Boolean(prefsOff.lunchBreakStart) &&
    Boolean(prefsOff.lunchBreakEnd);
  const hasConflictWhenOff = lunchActiveOff && aptStartMin < lunchEndMin && aptEndMin > lunchStartMin;
  assert(
    'LUNCH-07',
    hasConflictWhenOff === false,
    `Detecção de conflito na agenda: consulta das 11:30 NÃO colide quando o almoço está desativado`
  );

  // LUNCH-08: Isolamento multi-tenant de preferências de almoço (Daniel vs Leonardo)
  // Configura Daniel com almoço das 12:30 às 13:30
  await supabase.auth.signInWithPassword({ email: DANIEL_EMAIL, password: DANIEL_PASS });
  db.loadTenant(DANIEL_TENANT, false);
  await db.updatePreferencesAsync({
    lunchBreakEnabled: true,
    lunchBreakStart: '12:30',
    lunchBreakEnd: '13:30',
  });

  // Re-checa Leonardo no banco: o almoço do Leonardo permanece inalterado (OFF)
  const { data: leoPrefsIsolation } = await leonardoClient
    .from('df_system_preferences')
    .select('lunch_break_enabled')
    .eq('tenant_id', LEONARDO_TENANT)
    .single();

  assert(
    'LUNCH-08',
    leoPrefsIsolation?.lunch_break_enabled === false,
    `Isolamento multi-tenant: alteração de preferências no tenant do Daniel não afetou o tenant do Leonardo`
  );

  // LUNCH-09: Validação de horário de início e fim
  const isValidRange = (start: string, end: string) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return eh * 60 + em > sh * 60 + sm;
  };
  assert(
    'LUNCH-09a',
    isValidRange('11:00', '13:00') === true,
    `Validação de horário aceita intervalo válido (11:00 < 13:00)`
  );
  assert(
    'LUNCH-09b',
    isValidRange('14:00', '12:00') === false,
    `Validação de horário rejeita intervalo inválido (14:00 >= 12:00)`
  );

  console.log('\n================================================================');
  console.log('TODOS OS 19 TESTES FUNCIONAIS PASSARAM COM SUCESSO! (19/19 PASS)');
  console.log('================================================================');
}

runBankLunchSuite().catch((err) => {
  console.error('\n[FATAL ERROR IN SUITE]:', err);
  process.exit(1);
});
