// O PostgREST corta qualquer GET em 1000 linhas, em silêncio. A Odonto Minas passou de 43 para
// ~3.700 pacientes; tudo que carrega ou lista pacientes precisa funcionar acima de 1000:
//   - carga completa do tenant (getTenantData / getPatientsForTenant) paginada;
//   - busca no servidor dos modais de contato WhatsApp (nada de "amostra de 50");
//   - seletores em memória (Nova Receita, Agenda) com lista renderizada limitada.
// A camada HTTP é simulada com o MESMO teto de 1000 linhas do PostgREST.
// Rodar com: npx tsx tests/functional/patientListsBeyond1000.test.ts

import { SupabaseService } from '../../src/lib/supabaseClient';
import { filterPickerPatients, PICKER_RESULT_LIMIT } from '../../src/lib/patientPickerSearch';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}

const TENANT = 'clinic_test_1000';
const TOTAL = 3700;
const MAX_ROWS = 1000; // teto do PostgREST

// ─── Base sintética: 3.700 pacientes; parte sem CPF/telefone (legado) ───────────
const rows = Array.from({ length: TOTAL }, (_, i) => {
  const n = i + 1;
  const legacyBlank = n % 3 === 0;
  return {
    id: `pat_${String(n).padStart(5, '0')}`,
    tenant_id: TENANT,
    name: n === 2500 ? 'Zélia Rocha Quinhentos' : `Paciente Sintetico ${String(n).padStart(5, '0')}`,
    cpf: legacyBlank ? '' : String(10000000000 + n),
    phone: legacyBlank ? '' : `3499${String(1000000 + n)}`,
    email: '',
    birth_date: legacyBlank ? '' : '1990-01-01',
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
    document_type: 'CPF',
    phone_owner: 'PATIENT',
  };
});
const idOfNamed = 'pat_02500';

// ─── Simulador do PostgREST (teto de 1000 linhas; honra order/limit/offset) ─────
const requests: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any) => {
  const url = new URL(String(input));
  requests.push(url.pathname + url.search);
  const table = url.pathname.split('/').pop() || '';
  let data: any[] = [];
  if (table === 'df_patients') {
    const tenantEq = url.searchParams.get('tenant_id');
    data = rows.filter((r) => tenantEq === `eq.${TENANT}`);
    const order = url.searchParams.get('order');
    if (order) {
      const keys = order.split(',').map((k) => k.split('.')[0]);
      const desc = order.split(',').map((k) => k.endsWith('.desc'));
      data = [...data].sort((a: any, b: any) => {
        for (let i = 0; i < keys.length; i++) {
          const av = a[keys[i]];
          const bv = b[keys[i]];
          if (av < bv) return desc[i] ? 1 : -1;
          if (av > bv) return desc[i] ? -1 : 1;
        }
        return 0;
      });
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Math.min(Number(url.searchParams.get('limit') || MAX_ROWS), MAX_ROWS);
    data = data.slice(offset, offset + limit);
  }
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as any;

async function main() {
  // ─── 1. Carga completa do tenant ───────────────────────────────────────────────
  requests.length = 0;
  const res = await SupabaseService.getPatientsForTenant(TENANT);
  assert(!res.error, 'getPatientsForTenant: sem erro');
  assert(res.data.length === TOTAL, `getPatientsForTenant: carrega os ${TOTAL} pacientes (não só ${MAX_ROWS})`);
  assert(new Set(res.data.map((p) => p.id)).size === TOTAL, 'getPatientsForTenant: sem linhas repetidas entre páginas');
  assert(res.data.some((p) => p.id === idOfNamed), 'getPatientsForTenant: paciente de índice 2500 (>1000) presente');
  const patientReqs = requests.filter((r) => r.includes('df_patients'));
  assert(patientReqs.length === 4, `getPatientsForTenant: 4 páginas (1000+1000+1000+700), houve ${patientReqs.length}`);
  assert(patientReqs.every((r) => /order=[^&]*id\.asc/.test(r) || /order=id\.asc/.test(r)), 'paginação com ordenação total terminando em id');
  assert(patientReqs.every((r) => r.includes(`tenant_id=eq.${TENANT}`)), 'toda página é escopada ao tenant');

  // controle negativo: um único GET SEM paginação perde pacientes (o bug original)
  const single = await (await fetch(`https://x.supabase.co/rest/v1/df_patients?tenant_id=eq.${TENANT}&select=*`)).json();
  assert(single.length === MAX_ROWS, `controle: um GET único devolve só ${MAX_ROWS} (o corte silencioso que motivou a paginação)`);

  // ─── 2. getTenantData (o que alimenta Pacientes, Nova Receita, Agenda...) ──────
  requests.length = 0;
  const tenantData = await SupabaseService.getTenantData(TENANT);
  assert(tenantData.patients.length === TOTAL, `getTenantData: carrega os ${TOTAL} pacientes que alimentam Pacientes/Nova Receita/Agenda/Receitas/Despesas`);
  assert(tenantData.patients.some((p) => p.id === idOfNamed), 'getTenantData: paciente 2500 disponível para os seletores');
  const blank = tenantData.patients.find((p) => p.id === 'pat_00003');
  assert(Boolean(blank) && blank!.cpf === '' && blank!.phone === '' && blank!.birthDate === '', 'paciente legado sem CPF/telefone/nascimento chega com strings vazias (nunca placeholder)');

  // ─── 3. Busca no servidor (modais de contato WhatsApp) ─────────────────────────
  requests.length = 0;
  await SupabaseService.searchPatientsForTenant(TENANT, 'zelia rocha', 20);
  const searchReq = decodeURIComponent(requests[requests.length - 1] || '');
  assert(searchReq.includes(`tenant_id=eq.${TENANT}`), 'busca: escopada ao tenant');
  assert(searchReq.includes('limit=20'), 'busca: resultado limitado (20)');
  assert(searchReq.includes('name.ilike.'), 'busca: filtra por nome no servidor');
  assert(/order=name\.asc,id\.asc/.test(searchReq), 'busca: ordenação total (nome, id)');

  requests.length = 0;
  await SupabaseService.searchPatientsForTenant(TENANT, '52998224725', 20);
  const cpfReq = decodeURIComponent(requests[requests.length - 1] || '');
  assert(cpfReq.includes('cpf.ilike.*52998224725*') && cpfReq.includes('phone.ilike.*52998224725*'), 'busca por dígitos: CPF e telefone no servidor');

  requests.length = 0;
  await SupabaseService.searchPatientsForTenant(TENANT, 'x),tenant_id.eq.outra(', 20);
  const injReq = requests[requests.length - 1] || '';
  const orPart = injReq.slice(injReq.indexOf('or=('));
  assert((orPart.match(/\(/g) || []).length === 1 && (orPart.match(/\)/g) || []).length === 1, 'busca: parênteses/vírgulas digitados não quebram nem injetam filtro');
  assert((injReq.match(/tenant_id=eq\./g) || []).length === 1, 'busca: termo malicioso não cria um segundo filtro de tenant');

  const none = await SupabaseService.searchPatientsForTenant('', 'abc', 20);
  assert(none.length === 0, 'busca: sem tenant não consulta nada');

  // ─── 4. Seletores em memória (Nova Receita / Agenda) ───────────────────────────
  const pickerPatients = tenantData.patients;
  const emptyQuery = filterPickerPatients(pickerPatients, '');
  assert(emptyQuery.items.length === PICKER_RESULT_LIMIT, `seletor: sem busca desenha só ${PICKER_RESULT_LIMIT} (não ${TOTAL} botões)`);
  assert(emptyQuery.total === TOTAL && emptyQuery.hiddenCount === TOTAL - PICKER_RESULT_LIMIT, 'seletor: informa o total e quantos ficaram de fora ("refine sua busca")');

  const byName = filterPickerPatients(pickerPatients, 'zelia rocha quinhentos');
  assert(byName.items.length === 1 && byName.items[0].id === idOfNamed, 'seletor: acha paciente de índice 2500 pelo nome, sem acento');
  const byCpf = filterPickerPatients(pickerPatients, String(10000000000 + 2999));
  assert(byCpf.items.some((p) => p.id === 'pat_02999'), 'seletor: acha paciente de índice 2999 pelo CPF');
  const byPhone = filterPickerPatients(pickerPatients, `3499${1000000 + 3601}`);
  assert(byPhone.items.some((p) => p.id === 'pat_03601'), 'seletor: acha paciente de índice 3601 pelo telefone');

  const broad = filterPickerPatients(pickerPatients, 'Sintetico');
  assert(broad.items.length === PICKER_RESULT_LIMIT && broad.total > PICKER_RESULT_LIMIT && broad.hiddenCount > 0, 'seletor: busca ampla é limitada e sinaliza o excedente');

  const selectedBeyondCap = filterPickerPatients(pickerPatients, '', PICKER_RESULT_LIMIT, idOfNamed);
  assert(selectedBeyondCap.items.some((p) => p.id === idOfNamed) && selectedBeyondCap.items.length === PICKER_RESULT_LIMIT, 'seletor: paciente já selecionado além do teto continua na lista');

  const legacyOnly = filterPickerPatients(
    pickerPatients.filter((p) => !p.cpf && !p.phone),
    '52998'
  );
  assert(legacyOnly.items.length === 0, 'seletor: busca por dígitos em pacientes sem CPF/telefone não quebra nem casa por engano');
  const noCrash = filterPickerPatients([{ id: 'a', name: 'Sem Dados' } as any], 'sem');
  assert(noCrash.items.length === 1, 'seletor: paciente sem cpf/phone definidos (undefined) não quebra o filtro');

  // ─── 5. Nenhum caminho de leitura de pacientes ficou com amostra fixa ──────────
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const read = (rel: string) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const newContact = read('../../src/components/WhatsApp/NewContactModal.tsx');
  const editContact = read('../../src/components/WhatsApp/EditContactModal.tsx');
  assert(!/\.limit\(50\)/.test(newContact) && !/\.limit\(50\)/.test(editContact), 'modais de contato: sem amostra fixa de 50 pacientes');
  assert(/searchPatientsForTenant/.test(newContact) && /searchPatientsForTenant/.test(editContact), 'modais de contato: usam busca no servidor');
  const backfill = read('../../src/services/dentalWhatsAppService.ts');
  const backfillBody = backfill.slice(backfill.indexOf('async runPatientsWhatsAppBackfill'), backfill.indexOf('sanitizeTenantId(rawId'));
  assert(/selectAllPages/.test(backfillBody), 'backfill de WhatsApp: leitura paginada');
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
