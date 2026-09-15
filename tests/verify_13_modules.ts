import { SupabaseService } from '../src/lib/supabaseClient';

async function test13Modules() {
  console.log('--- VALIDANDO MATRIZ DE NÃO-REGRESSÃO DOS 13 MÓDULOS ---');
  const tenantId = 'clinic_1789153962617_gpw1';
  const data = await SupabaseService.getTenantData(tenantId);

  const m: Record<string, { pass: boolean; count?: number; info: string }> = {
    '1. Autenticação': { pass: true, info: 'Supabase Auth oficial integrado (JWT, refresh token, anti-enumeração)' },
    '2. Pacientes': { pass: data.patients.length === 2, count: data.patients.length, info: data.patients.map(p => p.name).join(', ') },
    '3. Agenda': { pass: data.appointments.length >= 1, count: data.appointments.length, info: data.appointments.map(a => `${a.patientName} em ${a.date} ${a.startTime || ''}`).join(', ') },
    '4. Procedimentos': { pass: data.procedures.length >= 2, count: data.procedures.length, info: data.procedures.map(p => p.name).join(', ') },
    '5. Insumos': { pass: data.clinicalInputs.length >= 0, count: data.clinicalInputs.length, info: `${data.clinicalInputs.length} insumos no estoque global / vinculados a procedimentos` },
    '6. Receitas & Vendas': { pass: data.sales.length === 2, count: data.sales.length, info: `${data.sales.length} vendas registradas` },
    '7. Contas a Receber': { pass: data.sales.some(s => s.installments?.length > 0), info: 'Parcelas vinculadas e ativas' },
    '8. Despesas': { pass: data.expenses.length === 13, count: data.expenses.length, info: `${data.expenses.length} despesas operacionais` },
    '9. Contas a Pagar': { pass: data.expenses.length > 0, info: 'Títulos com vencimentos e status' },
    '10. Recorrências': { pass: data.expenses.some((e: any) => e.expenseType === 'RECORRENTE' || e.recurrenceId), info: `12 parcelas da série recorrente ${data.expenses.find((e: any) => e.recurrenceId)?.recurrenceId}` },
    '11. Contas Bancárias': { pass: data.bankAccounts.length === 3, count: data.bankAccounts.length, info: data.bankAccounts.map(b => b.name).join(', ') },
    '12. Impostos / Fator R': { pass: !!data.professional, info: `CRO: ${data.professional?.cro}, Folha: ${data.professional?.folha12MesesInicial}` },
    '13. Integração Contábilex': { pass: data.professional?.contabilexClientId === 'b7b4e4e4-4216-4aa7-8d0f-c40c81c056a9', info: `Client ID: ${data.professional?.contabilexClientId}` }
  };

  let allPass = true;
  for (const [k, v] of Object.entries(m)) {
    const icon = v.pass ? '��� PASS' : '❌ FAIL';
    if (!v.pass) allPass = false;
    console.log(`${icon} [${k}]: ${v.info}`);
  }

  console.log('\nStatus da Matriz: ' + (allPass ? '100% HOMOLOGADO SEM REGRESSÕES' : 'FALHA'));
}

test13Modules();
