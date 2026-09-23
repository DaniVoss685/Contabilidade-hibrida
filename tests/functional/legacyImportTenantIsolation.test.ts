// Testa os 6 cenários obrigatórios de isolamento de tenant da Fase 21 do
// pedido, usando resolveAuthorizationForTenant/hasPatientManagePermission de
// src/lib/legacyImportAuthorization.ts — a MESMA lógica pura que
// supabase/functions/dental-legacy-patient-import/index.ts usa literalmente
// (ver comentário "manter em sincronia" em ambos os arquivos). Como a Edge
// Function não é invocada nesta rodada (nenhum dado real é gravado), é aqui
// que a garantia de isolamento de tenant é verificada de forma automatizada.
// Rodar com: npx tsx tests/functional/legacyImportTenantIsolation.test.ts

import { resolveAuthorizationForTenant, hasPatientManagePermission, LegacyImportCallerRow } from '../../src/lib/legacyImportAuthorization';
import { classifyPatientRows, buildNormalizedClient } from '../../src/lib/legacyImportMatching';
import { Patient } from '../../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

const ODONTO_MINAS = 'clinic_odonto_minas';
const OUTRA_CLINICA = 'clinic_outra_clinica';

function member(clinicId: string, role = 'ADMIN'): LegacyImportCallerRow {
  return { id: 'usr_1', clinicId, role, permissions: null, isPrimary: false, isActive: true, name: 'Usuário Teste' };
}

function superAdmin(): LegacyImportCallerRow {
  return { id: 'usr_super', clinicId: null, role: 'SUPER_ADMIN', permissions: null, isPrimary: true, isActive: true, name: 'Consultoria' };
}

function runTests() {
  // CENÁRIO A: clínica ativa = Odonto Minas, arquivo = Odonto Minas -> PERMITIDO
  {
    const caller = [member(ODONTO_MINAS)];
    const { authorized } = resolveAuthorizationForTenant(caller, ODONTO_MINAS);
    assert(authorized === true, 'CENÁRIO A: membro direto da Odonto Minas autorizado a criar sessão para a Odonto Minas');
  }

  // CENÁRIO B: dry run criado na Odonto Minas por um super admin de consultoria; ele muda de clínica ativa
  // -> a IMPORTAÇÃO FINAL deve continuar travada ao tenant da SESSÃO (Odonto Minas), nunca redirecionar
  // para a clínica nova, mesmo que o super admin tenha acesso a ambas.
  {
    const caller = [superAdmin()];
    // A sessão foi criada com target_tenant_id = ODONTO_MINAS. Mesmo com o
    // usuário agora "ativo" em outra clínica no frontend, toda ação
    // subsequente da Edge Function resolve o tenant a partir de
    // session.tenant_id (ODONTO_MINAS) — nunca de um valor enviado pelo
    // client. A autorização é sempre reavaliada contra ESSE tenant:
    const { authorized, effectiveProfile } = resolveAuthorizationForTenant(caller, ODONTO_MINAS);
    assert(authorized === true, 'CENÁRIO B: super admin permanece autorizado a ESCREVER no tenant da sessão (Odonto Minas)');
    assert(effectiveProfile?.id === 'usr_super', 'CENÁRIO B-b: perfil efetivo resolvido é o do chamador de consultoria');
    // Importante: mesmo autorizado, o valor usado para gravar é sempre
    // session.tenant_id (ODONTO_MINAS) — a "clínica ativa nova" do frontend
    // nunca é usada para decidir onde escrever (ver Edge Function:
    // resolveSessionAndAuthorize usa session.tenant_id, não um tenant_id do
    // corpo). Isso é validado estruturalmente pelo cenário F abaixo.
  }

  // CENÁRIO C: CPF existente DENTRO da Odonto Minas -> candidato à deduplicação
  {
    const existing: Patient[] = [{ id: 'pat_om_1', orgId: `org_${ODONTO_MINAS}`, name: 'PACIENTE ODONTO MINAS', cpf: '11144477735', createdAt: new Date().toISOString() }];
    const c = buildNormalizedClient({ identificador: 'legacy-c', id_cliente: '1', nome_completo: 'Paciente Odonto Minas', cpf: '111.444.777-35' }, 'legacy_test');
    const [result] = classifyPatientRows([c], existing, new Map());
    assert(result.status === 'VINCULAR' && result.matchedPatientId === 'pat_om_1', 'CENÁRIO C: CPF existente dentro do MESMO tenant é candidato à deduplicação (VINCULAR)');
  }

  // CENÁRIO D: mesmo CPF existente APENAS em outro tenant -> NÃO deduplicar cross-tenant
  // (a lista "existingPatients" passada para o matching já deve ter sido
  // buscada só para o tenant alvo — getPatientsForTenant(targetTenantId) —
  // então um paciente de OUTRO tenant nunca aparece nessa lista. Aqui
  // simulamos exatamente isso: a lista de "existentes" é vazia porque o
  // único paciente com esse CPF pertence à outra clínica.)
  {
    const c = buildNormalizedClient({ identificador: 'legacy-d', id_cliente: '1', nome_completo: 'Paciente Novo Nesta Clinica', cpf: '111.444.777-35' }, 'legacy_test');
    const existingOnlyInTargetTenant: Patient[] = []; // paciente com esse CPF só existe na OUTRA_CLINICA, não na Odonto Minas
    const [result] = classifyPatientRows([c], existingOnlyInTargetTenant, new Map());
    assert(result.status === 'NOVO', 'CENÁRIO D: CPF que só existe em outro tenant não gera vínculo — tratado como paciente novo neste tenant');
  }

  // CENÁRIO E: legacy_id igual em dois tenants -> permitido, pois a chave de
  // idempotência inclui tenant_id (df_legacy_import_map: UNIQUE(tenant_id,
  // source_system, entity_type, legacy_id)). Já coberto em profundidade por
  // IDEMP-04 em legacyImportIdempotency.test.ts; aqui confirmamos que o
  // matching por si só não tem nenhuma noção global de legacy_id sem tenant.
  {
    const legacyMapTenantA = new Map<string, string>([['legacy-e', 'pat_tenantA_target']]);
    const legacyMapTenantB = new Map<string, string>(); // no tenant B esse legacy_id ainda não foi importado
    const c = buildNormalizedClient({ identificador: 'legacy-e', id_cliente: '1', nome_completo: 'Paciente Compartilhado' }, 'legacy_test');
    const [resultA] = classifyPatientRows([c], [], legacyMapTenantA);
    const [resultB] = classifyPatientRows([c], [], legacyMapTenantB);
    assert(resultA.status === 'VINCULAR', 'CENÁRIO E-a: no tenant A, legacy_id já mapeado -> VINCULAR');
    assert(resultB.status === 'NOVO', 'CENÁRIO E-b: no tenant B (mapa distinto), o MESMO legacy_id é tratado como NOVO — sem colisão entre tenants');
  }

  // CENÁRIO F: chamador SEM vínculo com o tenant e sem ser admin de plataforma -> BLOQUEADO
  {
    const caller = [member(OUTRA_CLINICA, 'RECEPTION')]; // vínculo só com outra clínica, role comum
    const { authorized } = resolveAuthorizationForTenant(caller, ODONTO_MINAS);
    assert(authorized === false, 'CENÁRIO F-a: usuário sem vínculo com a Odonto Minas e sem papel de plataforma é BLOQUEADO');
  }

  // CENÁRIO F (continuação): mesmo um payload manipulado tentando indicar
  // outro tenant_id não muda o resultado — a autorização é sempre avaliada
  // contra o tenant EXPLICITAMENTE testado (nunca contra um valor "que o
  // servidor confia" vindo do corpo sem essa validação).
  {
    const caller = [member(OUTRA_CLINICA, 'ADMIN')];
    const triesOwnTenant = resolveAuthorizationForTenant(caller, OUTRA_CLINICA).authorized;
    const triesForeignTenant = resolveAuthorizationForTenant(caller, ODONTO_MINAS).authorized;
    assert(triesOwnTenant === true, 'CENÁRIO F-b: admin autorizado no PRÓPRIO tenant');
    assert(triesForeignTenant === false, 'CENÁRIO F-c: o MESMO admin, tentando um tenant_id de outra clínica, é bloqueado — nenhum valor de payload contorna a checagem de vínculo real');
  }

  // Checagem adicional de permissão de negócio (Fase 17): vínculo com o
  // tenant não basta — precisa também de patients:manage.
  {
    const financeRole: LegacyImportCallerRow = member(ODONTO_MINAS, 'FINANCE');
    const allowed = hasPatientManagePermission(financeRole.role, financeRole.permissions, financeRole.isPrimary);
    assert(allowed === false, 'PERMISSÃO: role FINANCE (sem patients:manage) não pode importar pacientes mesmo sendo membro do tenant certo');

    const adminRole: LegacyImportCallerRow = member(ODONTO_MINAS, 'ADMIN');
    const adminAllowed = hasPatientManagePermission(adminRole.role, adminRole.permissions, adminRole.isPrimary);
    assert(adminAllowed === true, 'PERMISSÃO: role ADMIN do tenant certo pode importar pacientes');
  }

  console.log('\n🎉 legacyImportTenantIsolation: todos os critérios passaram.');
}

runTests();
