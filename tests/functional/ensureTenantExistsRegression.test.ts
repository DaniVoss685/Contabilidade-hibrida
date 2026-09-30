// Regressão (bug real em produção): ensureTenantExists fazia upsert de df_tenants com merge-duplicates a CADA
// gravação de paciente/venda/etc., sobrescrevendo nome, CNPJ, e-mail, telefone, cidade, is_active e created_at
// da clínica com valores padrão ("Clínica sem nome"). Agora só GARANTE a existência (ignore-duplicates,
// ON CONFLICT DO NOTHING). Alterar o tenant exige um PATCH explícito de quem quer alterar.
// A camada HTTP é simulada; o teste falha se algum caminho voltar a sobrescrever o tenant.
// Rodar com: npx tsx tests/functional/ensureTenantExistsRegression.test.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SupabaseService } from '../../src/lib/supabaseClient';
import type { Patient } from '../../src/types';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

interface Req { method: string; path: string; prefer: string; body: any }
const requests: Req[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = new URL(String(input));
  let body: any = null;
  try { body = init.body ? JSON.parse(init.body) : null; } catch { /* noop */ }
  requests.push({
    method: (init.method || 'GET').toUpperCase(),
    path: url.pathname.replace('/rest/v1/', '') + url.search,
    prefer: String((init.headers || {}).Prefer || ''),
    body,
  });
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as any;

const tenantWrites = () => requests.filter((r) => r.path.startsWith('df_tenants') && r.method !== 'GET');
const reset = () => (requests.length = 0);

const patient = {
  id: 'pat_reg_1', orgId: 'org_t', name: 'Paciente Regressão', cpf: '52998224725', phone: '34998743774',
  birthDate: '1990-01-01', email: '', createdAt: '2026-01-01T00:00:00Z',
} as Patient;

async function main() {
  const TENANT = 'clinic_regression_test';

  // 1. ensureTenantExists: só garante existência
  reset();
  await SupabaseService.ensureTenantExists(TENANT);
  const w = tenantWrites();
  assert(w.length === 1 && w[0].method === 'POST', 'ensureTenantExists faz UM POST em df_tenants (garantir a linha para a FK)');
  assert(/ignore-duplicates/.test(w[0].prefer) && !/merge-duplicates/.test(w[0].prefer), 'com Prefer ignore-duplicates (ON CONFLICT DO NOTHING) — nunca merge-duplicates');
  assert(/on_conflict=id/.test(w[0].path), 'conflito resolvido pelo id do tenant');

  // 2. Nenhum caminho de gravação de paciente pode ATUALIZAR o tenant
  for (const [label, run] of [
    ['savePatient', () => SupabaseService.savePatient(patient, TENANT)],
    ['updatePatient', () => SupabaseService.updatePatient(patient, TENANT)],
    ['savePatientsBulk', () => SupabaseService.savePatientsBulk([patient], TENANT)],
  ] as const) {
    reset();
    await run();
    const tw = tenantWrites();
    assert(tw.every((r) => r.method === 'POST' && /ignore-duplicates/.test(r.prefer)), `${label}: só garante o tenant (ignore-duplicates), sem sobrescrever`);
    assert(tw.every((r) => r.method !== 'PATCH'), `${label}: nenhum PATCH em df_tenants`);
  }

  // 3. O corpo enviado ao garantir o tenant NÃO é usado para sobrescrever: com ignore-duplicates o banco
  //    ignora o payload padrão quando a linha existe (garantia estrutural, conferida pelo Prefer acima).
  reset();
  await SupabaseService.ensureTenantExists(TENANT, { name: 'Outro Nome', cnpj: '11222333000181' });
  assert(tenantWrites().every((r) => /ignore-duplicates/.test(r.prefer)), 'mesmo com dados de fallback, o upsert continua ignore-duplicates');

  // 4. Estático: todas as chamadas a ensureTenantExists são só de garantia, e nenhuma função de gravação de
  //    paciente/venda/despesa faz PATCH em df_tenants
  const src = readFileSync(fileURLToPath(new URL('../../src/lib/supabaseClient.ts', import.meta.url)), 'utf8');
  const fn = src.slice(src.indexOf('async ensureTenantExists'), src.indexOf('async updateTenantClinicName'));
  assert(!/merge-duplicates/.test(fn.replace(/\/\/.*$/gm, '')), 'o código de ensureTenantExists (fora de comentários) não usa merge-duplicates');
  const patchesOnTenants = [...src.matchAll(/`df_tenants\?id=eq\.\$\{tenantId\}`,\s*\{\s*method: 'PATCH'/g)].length;
  assert(patchesOnTenants === 2, 'só os PATCH EXPLÍCITOS de nome da clínica alteram df_tenants (updateTenantClinicName e saveProfessional)');
  const savePatientBody = src.slice(src.indexOf('async savePatient('), src.indexOf('async updatePatient('));
  assert(!/df_tenants/.test(savePatientBody), 'savePatient não toca df_tenants diretamente');
}

main()
  .then(() => {
    globalThis.fetch = realFetch;
    console.log(`\n${passed} verificações passaram.`);
    process.exit(0);
  })
  .catch((e) => {
    globalThis.fetch = realFetch;
    console.error(e);
    process.exit(1);
  });
