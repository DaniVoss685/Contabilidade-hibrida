// Testa idempotência (rodar o mesmo arquivo duas vezes não duplica) e o
// comportamento de retry de lote via a chave única
// (tenant_id, source_system, entity_type, legacy_id) simulada em memória —
// a mesma regra que a migration 20260922180000_legacy_import_infrastructure.sql
// aplica como índice único real no banco (uq_df_legacy_import_map_key).
// Rodar com: npx tsx tests/functional/legacyImportIdempotency.test.ts

import { buildNormalizedClient, classifyPatientRows } from '../../src/lib/legacyImportMatching';
import { buildPatientCommitRow } from '../../src/lib/legacyImportService';
import { Patient } from '../../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
}

// Simula o índice único (tenant_id, source_system, entity_type, legacy_id) ->
// target_id do df_legacy_import_map, e um insert com a mesma semântica de
// "on conflict -> already_imported" que a Edge Function implementa.
class FakeLegacyImportMap {
  private map = new Map<string, string>();

  key(tenantId: string, sourceSystem: string, entityType: string, legacyId: string) {
    return `${tenantId}::${sourceSystem}::${entityType}::${legacyId}`;
  }

  insertPatient(tenantId: string, sourceSystem: string, legacyId: string, targetId: string): { created: boolean; targetId: string } {
    const k = this.key(tenantId, sourceSystem, 'patient', legacyId);
    const existing = this.map.get(k);
    if (existing) return { created: false, targetId: existing };
    this.map.set(k, targetId);
    return { created: true, targetId };
  }

  lookupPatient(tenantId: string, sourceSystem: string, legacyId: string): string | undefined {
    return this.map.get(this.key(tenantId, sourceSystem, 'patient', legacyId));
  }
}

function runTests() {
  const tenantA = 'clinic_odonto_minas';
  const tenantB = 'clinic_other_clinic';
  const sourceSystem = 'legacy_test';

  // IDEMP-01: primeira importação cria o paciente e registra o mapeamento
  {
    const store = new FakeLegacyImportMap();
    const res = store.insertPatient(tenantA, sourceSystem, 'legacy-1', 'pat_new_1');
    assert(res.created === true && res.targetId === 'pat_new_1', 'IDEMP-01: primeira importação de um legacy_id cria o paciente');
  }

  // IDEMP-02: reimportar o MESMO arquivo (mesmo legacy_id, mesmo tenant) não duplica — retorna o mesmo target_id
  {
    const store = new FakeLegacyImportMap();
    const first = store.insertPatient(tenantA, sourceSystem, 'legacy-2', 'pat_new_2');
    const second = store.insertPatient(tenantA, sourceSystem, 'legacy-2', 'pat_would_be_duplicate');
    assert(first.created === true, 'IDEMP-02a: primeira rodada cria o paciente');
    assert(second.created === false, 'IDEMP-02b: segunda rodada com o mesmo legacy_id NÃO cria um novo paciente');
    assert(second.targetId === 'pat_new_2', 'IDEMP-02c: segunda rodada retorna o mesmo target_id da primeira, sem duplicar');
  }

  // IDEMP-03: retry de lote após falha parcial — reenviar o lote inteiro não duplica as linhas que já tinham sido gravadas com sucesso
  {
    const store = new FakeLegacyImportMap();
    const batch = ['legacy-3a', 'legacy-3b', 'legacy-3c'];
    // Primeira tentativa: legacy-3a e legacy-3b gravam OK, o "lote" falha antes de processar 3c (simulando timeout de rede)
    store.insertPatient(tenantA, sourceSystem, 'legacy-3a', 'pat_3a');
    store.insertPatient(tenantA, sourceSystem, 'legacy-3b', 'pat_3b');
    // Retry: reenvia o LOTE INTEIRO (3a, 3b, 3c) — comportamento esperado do cliente após falha
    const retryResults = batch.map((legacyId, i) => store.insertPatient(tenantA, sourceSystem, legacyId, `pat_retry_${i}`));
    assert(retryResults[0].created === false && retryResults[0].targetId === 'pat_3a', 'IDEMP-03a: retry não duplica legacy-3a já importado');
    assert(retryResults[1].created === false && retryResults[1].targetId === 'pat_3b', 'IDEMP-03b: retry não duplica legacy-3b já importado');
    assert(retryResults[2].created === true && retryResults[2].targetId === 'pat_retry_2', 'IDEMP-03c: retry cria apenas o que realmente faltava (legacy-3c)');
  }

  // IDEMP-04: mesmo legacy_id em tenants DIFERENTES não colide — cada tenant tem seu próprio paciente
  {
    const store = new FakeLegacyImportMap();
    const resA = store.insertPatient(tenantA, sourceSystem, 'legacy-shared', 'pat_tenantA');
    const resB = store.insertPatient(tenantB, sourceSystem, 'legacy-shared', 'pat_tenantB');
    assert(resA.created === true && resB.created === true, 'IDEMP-04a: mesmo legacy_id é importado com sucesso em dois tenants diferentes');
    assert(resA.targetId !== resB.targetId, 'IDEMP-04b: cada tenant recebe um paciente/target_id distinto — chave inclui tenant_id');
    assert(store.lookupPatient(tenantA, sourceSystem, 'legacy-shared') === 'pat_tenantA', 'IDEMP-04c: lookup por tenant A retorna o paciente do tenant A');
    assert(store.lookupPatient(tenantB, sourceSystem, 'legacy-shared') === 'pat_tenantB', 'IDEMP-04d: lookup por tenant B retorna o paciente do tenant B (sem cross-tenant)');
  }

  // IDEMP-05: dry-run reconhece um paciente já importado (via df_legacy_import_map) como VINCULAR, não NOVO
  {
    const legacyMap = new Map<string, string>([['legacy-5', 'pat_already_imported']]);
    const c = buildNormalizedClient({ identificador: 'legacy-5', id_cliente: '1', nome_completo: 'Paciente Já Importado' }, 'legacy_test');
    const [result] = classifyPatientRows([c], [], legacyMap);
    assert(result.status === 'VINCULAR', 'IDEMP-05a: segunda rodada de dry-run reconhece o paciente pelo legacy_id, não tenta recriar');
    const commitRow = buildPatientCommitRow(result);
    assert(commitRow === null, 'IDEMP-05b: linha VINCULAR nunca gera payload de criação (buildPatientCommitRow só gera para NOVO)');
  }

  // IDEMP-06: paciente com dados existentes no banco (fora do fluxo de import) NÃO é considerado idempotente por legacy_id — só CPF/combinação forte decide
  {
    const existing: Patient[] = [
      { id: 'pat_manual_1', orgId: 'org_1', name: 'PACIENTE CADASTRADO MANUALMENTE', cpf: '', createdAt: new Date().toISOString() },
    ];
    const c = buildNormalizedClient({ identificador: 'legacy-6', id_cliente: '1', nome_completo: 'Outro Paciente Qualquer', cpf: '' }, 'legacy_test');
    const [result] = classifyPatientRows([c], existing, new Map());
    assert(result.status === 'NOVO', 'IDEMP-06: paciente sem legacy_id conhecido e sem correspondência forte é tratado como NOVO, não colide com cadastro manual não relacionado');
  }

  console.log('\n🎉 legacyImportIdempotency: todos os critérios passaram.');
}

runTests();
