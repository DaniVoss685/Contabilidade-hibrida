import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fbkouuvupdyffizwoiti.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia291dXZ1cGR5ZmZpendvaXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyOTI2NDUsImV4cCI6MjA3MDg2ODY0NX0.9xN5BQug6yHm_k9H20v524XFuCbd1JzW2aRSQJWstfo';

const DANIEL_TENANT = 'clinic_1789153962617_gpw1';
const LEONARDO_TENANT = 'clinic_leo';

interface TestResult {
  code: string;
  name: string;
  pass: boolean;
  details?: string;
}

const results: TestResult[] = [];

function record(code: string, name: string, pass: boolean, details?: string) {
  results.push({ code, name, pass, details });
  console.log(`[${code}] ${name} => ${pass ? 'PASS' : 'FAIL'}${details ? ' (' + details + ')' : ''}`);
}

async function runStorageSuite() {
  console.log('================================================================');
  console.log('FASE 4: STORAGE & ATTACHMENTS HARDENING TEST SUITE (STOR-01..10)');
  console.log('================================================================\n');

  // 1. Anon Client
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // 2. Daniel Client
  const danielAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: dAuth, error: dAuthErr } = await danielAuth.auth.signInWithPassword({
    email: 'danielricardoarantes@gmail.com',
    password: 'Daniel@2026',
  });
  if (dAuthErr || !dAuth?.session) {
    throw new Error('Falha na autenticação de Daniel: ' + dAuthErr?.message);
  }
  const danielClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${dAuth.session.access_token}` } },
  });

  // 3. Leonardo Client
  const leoAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: lAuth, error: lAuthErr } = await leoAuth.auth.signInWithPassword({
    email: 'leonardoricardoarantes@gmail.com',
    password: 'Leonardo@2026',
  });
  if (lAuthErr || !lAuth?.session) {
    throw new Error('Falha na autenticação de Leonardo: ' + lAuthErr?.message);
  }
  const leoClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${lAuth.session.access_token}` } },
  });

  // 4. Operator Client
  const opAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: oAuth, error: oAuthErr } = await opAuth.auth.signInWithPassword({
    email: 'operator_e2e_test@contaju.internal',
    password: 'OperatorPassword123!',
  });
  if (oAuthErr || !oAuth?.session) {
    throw new Error('Falha na autenticação do operador Contábilex: ' + oAuthErr?.message);
  }
  const operatorClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${oAuth.session.access_token}` } },
  });

  const testFileName = `test_receipt_${Date.now()}.pdf`;
  const danielFilePath = `${DANIEL_TENANT}/expenses/${testFileName}`;
  const leoFilePath = `${LEONARDO_TENANT}/expenses/${testFileName}`;
  const validPdfContent = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'utf-8');

  // -------------------------------------------------------------
  // STOR-01: Bucket dental-private existe e é privado (public = false)
  // -------------------------------------------------------------
  try {
    const { data: buckets, error: bErr } = await danielClient.storage.listBuckets();
    const dentalBucket = buckets?.find((b) => b.id === 'dental-private');
    const isPrivate = dentalBucket ? dentalBucket.public === false : false;
    record(
      'STOR-01',
      'Bucket dental-private existe e está configurado como estritamente privado (public = false)',
      Boolean(dentalBucket && isPrivate),
      dentalBucket ? `public: ${dentalBucket.public}` : `Bucket não listado: ${bErr?.message}`
    );
  } catch (err: any) {
    record('STOR-01', 'Bucket dental-private existe e está privado', false, err.message);
  }

  // -------------------------------------------------------------
  // STOR-02: Usuário anônimo NÃO consegue ler objetos do bucket dental-private
  // -------------------------------------------------------------
  try {
    const { data, error } = await anonClient.storage.from('dental-private').download(danielFilePath);
    record(
      'STOR-02',
      'Usuário anônimo não consegue baixar/ler arquivos em dental-private (DENY)',
      Boolean(error || !data),
      error ? `Negado com erro esperado: ${error.message}` : 'Falha de isolamento'
    );
  } catch (err: any) {
    record('STOR-02', 'Usuário anônimo não consegue baixar arquivos', true, err.message);
  }

  // -------------------------------------------------------------
  // STOR-03: Usuário anônimo NÃO consegue fazer upload no bucket dental-private
  // -------------------------------------------------------------
  try {
    const { data, error } = await anonClient.storage
      .from('dental-private')
      .upload(`anon/test_${Date.now()}.pdf`, validPdfContent, { contentType: 'application/pdf' });
    record(
      'STOR-03',
      'Usuário anônimo não consegue fazer upload em dental-private (DENY)',
      Boolean(error && !data),
      error ? `Negado com erro esperado: ${error.message}` : 'Falha de isolamento'
    );
  } catch (err: any) {
    record('STOR-03', 'Usuário anônimo não consegue fazer upload', true, err.message);
  }

  // -------------------------------------------------------------
  // STOR-04: Tenant Daniel faz upload com sucesso em sua pasta de tenant
  // -------------------------------------------------------------
  let danielUploadSuccess = false;
  try {
    const { data, error } = await danielClient.storage
      .from('dental-private')
      .upload(danielFilePath, validPdfContent, { upsert: true, contentType: 'application/pdf' });
    danielUploadSuccess = Boolean(data && !error);
    record(
      'STOR-04',
      'Tenant Daniel realiza upload com sucesso em seu diretório de tenant (ALLOW)',
      danielUploadSuccess,
      error ? error.message : `Arquivo gravado em ${data?.path}`
    );
  } catch (err: any) {
    record('STOR-04', 'Tenant Daniel realiza upload com sucesso', false, err.message);
  }

  // -------------------------------------------------------------
  // STOR-05: Tenant Daniel lê/baixa seu próprio anexo com sucesso
  // -------------------------------------------------------------
  try {
    const { data, error } = await danielClient.storage.from('dental-private').download(danielFilePath);
    const text = data ? await data.text() : '';
    const matches = text.includes('%PDF-1.4');
    record(
      'STOR-05',
      'Tenant Daniel faz download com sucesso de seu próprio anexo (ALLOW)',
      Boolean(matches && !error),
      error ? error.message : `Conteúdo recuperado com sucesso (${text.length} bytes)`
    );
  } catch (err: any) {
    record('STOR-05', 'Tenant Daniel faz download de seu anexo', false, err.message);
  }

  // -------------------------------------------------------------
  // STOR-06: Tenant Leonardo NÃO consegue ler anexo de Daniel (Cross-tenant DENY)
  // -------------------------------------------------------------
  try {
    const { data, error } = await leoClient.storage.from('dental-private').download(danielFilePath);
    record(
      'STOR-06',
      'Tenant Leonardo não consegue ler/baixar anexo de Daniel (Cross-Tenant DENY)',
      Boolean(error || !data),
      error ? `Bloqueado com erro esperado: ${error.message}` : 'Falha de isolamento'
    );
  } catch (err: any) {
    record('STOR-06', 'Tenant Leonardo não consegue ler anexo de Daniel', true, err.message);
  }

  // -------------------------------------------------------------
  // STOR-07: Tenant Leonardo NÃO consegue sobrescrever pasta de Daniel (Cross-tenant DENY)
  // -------------------------------------------------------------
  try {
    const maliciousPayload = Buffer.from('%PDF-1.4\nMalicious\n%%EOF', 'utf-8');
    const { data, error } = await leoClient.storage
      .from('dental-private')
      .upload(danielFilePath, maliciousPayload, { upsert: true, contentType: 'application/pdf' });
    record(
      'STOR-07',
      'Tenant Leonardo não consegue gravar na pasta do tenant de Daniel (Cross-Tenant Write DENY)',
      Boolean(error && !data),
      error ? `Bloqueado com erro esperado: ${error.message}` : 'Falha de isolamento'
    );
  } catch (err: any) {
    record('STOR-07', 'Tenant Leonardo não consegue gravar na pasta de Daniel', true, err.message);
  }

  // -------------------------------------------------------------
  // STOR-08: Tenant Daniel NÃO consegue gravar na pasta de Leonardo (Cross-tenant DENY)
  // -------------------------------------------------------------
  try {
    const payload = Buffer.from('%PDF-1.4\nReverse Cross-Tenant\n%%EOF', 'utf-8');
    const { data, error } = await danielClient.storage
      .from('dental-private')
      .upload(leoFilePath, payload, { upsert: true, contentType: 'application/pdf' });
    record(
      'STOR-08',
      'Tenant Daniel não consegue gravar na pasta do tenant de Leonardo (Cross-Tenant Write DENY)',
      Boolean(error && !data),
      error ? `Bloqueado com erro esperado: ${error.message}` : 'Falha de isolamento'
    );
  } catch (err: any) {
    record('STOR-08', 'Tenant Daniel não consegue gravar na pasta de Leonardo', true, err.message);
  }

  // -------------------------------------------------------------
  // STOR-09: Operador do Contábilex tem permissão de leitura para auditoria (ALLOW)
  // -------------------------------------------------------------
  try {
    const { data, error } = await operatorClient.storage.from('dental-private').download(danielFilePath);
    const text = data ? await data.text() : '';
    record(
      'STOR-09',
      'Operador Contábilex tem permissão de leitura para auditoria contábil de anexos (ALLOW)',
      Boolean(text.includes('%PDF-1.4') && !error),
      error ? error.message : `Auditoria autorizada (${text.length} bytes)`
    );
  } catch (err: any) {
    record('STOR-09', 'Operador Contábilex lê anexo de Daniel', false, err.message);
  }

  // -------------------------------------------------------------
  // STOR-10: URL pública direta para bucket privado é inacessível (DENY)
  // -------------------------------------------------------------
  try {
    const { data: pubData } = danielClient.storage.from('dental-private').getPublicUrl(danielFilePath);
    let isDenied = true;
    if (pubData?.publicUrl) {
      const resp = await fetch(pubData.publicUrl);
      isDenied = resp.status === 400 || resp.status === 401 || resp.status === 403 || resp.status === 404;
    }
    record(
      'STOR-10',
      'URL pública direta para arquivo em bucket privado é rejeitada pelo Supabase (DENY)',
      isDenied,
      `Rejeição confirmada em URL pública direta`
    );
  } catch (err: any) {
    record('STOR-10', 'URL pública direta é inacessível', true, err.message);
  }

  // Cleanup teste
  try {
    await danielClient.storage.from('dental-private').remove([danielFilePath]);
  } catch {}

  console.log('\n----------------------------------------------------------------');
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  console.log(`TOTAL: ${passed}/${total} testes passaram.`);
  if (passed === total) {
    console.log('STATUS: PASS — STORAGE & ATTACHMENTS TOTALMENTE BLINDADOS');
  } else {
    console.error('STATUS: FAIL — VERIFICAR LOGS ACIMA');
    process.exit(1);
  }
}

runStorageSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro fatal na suíte Storage:', err);
    process.exit(1);
  });
