// Contrato do SERVIDOR que os testes puros não alcançam (Edge Function Deno + migration SQL):
// verificado por asserções estáticas sobre o código-fonte. O comportamento real foi validado em
// produção com um bloco SQL de ROLLBACK garantido (guarda de pendências, exclusão segura, bloqueio
// com venda, mapa DELETED) e pelo dry run/importação dos 28 na clínica alvo.
// Rodar com: npx tsx tests/functional/legacyImportServerContract.test.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASSED: ${message}`);
}
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const edge = read('../../supabase/functions/dental-legacy-patient-import/index.ts');
const mig = read('../../supabase/migrations/20260925090000_patient_review_issues_and_legacy_map_status.sql');
const supa = read('../../src/lib/supabaseClient.ts');
const dbts = read('../../src/lib/db.ts');

// ─── Migration ──────────────────────────────────────────────────────────────────────
assert(/CREATE TABLE IF NOT EXISTS public\.df_patient_review_issues/.test(mig) && /tenant_id TEXT NOT NULL/.test(mig), 'tabela de pendências é própria e tenant-scoped (não usa campos clínicos)');
assert(/uq_df_patient_review_issues_dedupe[\s\S]*\(tenant_id, patient_id, source, dedupe_key\)/.test(mig), 'idempotência em banco: índice único (tenant, paciente, origem, dedupe_key)');
assert(!/allerg|conditions|medications|clinical_notes/i.test(mig.split('df_patient_review_issues')[1].split('3. Exclusão segura')[0]), 'a estrutura de pendência NÃO reaproveita alergias/condições/medicações/anotações clínicas');
assert(/ENABLE ROW LEVEL SECURITY/.test(mig) && /is_dental_tenant_member\(tenant_id\)/.test(mig), 'RLS por tenant');
assert(!/FOR (INSERT|DELETE) TO authenticated/.test(mig.split('df_patient_review_issues_select_policy')[1] || ''), 'usuários não criam nem apagam pendências (histórico preservado); só a Edge Function cria');
assert(/pendência já encerrada|Pendência já encerrada/i.test(mig) && /imutáveis/.test(mig), 'trigger de guarda: identidade imutável e pendência encerrada não é reaberta');
assert(/entity_type IN \('patient', 'clinical_record', 'professional'\)/.test(mig), 'mapa legado aceita o mapeamento de profissional');
assert(/CHECK \(status IN \('ACTIVE', 'DELETED', 'IGNORED', 'REJECTED'\)\)/.test(mig), 'mapa legado tem status ACTIVE/DELETED/IGNORED/REJECTED');
const del = mig.slice(mig.indexOf('CREATE OR REPLACE FUNCTION public.dental_delete_patient_safe'));
assert(del.indexOf('fn_dental_patient_refs') < del.indexOf('DELETE FROM df_patients'), 'exclusão só DEPOIS de verificar as referências');
assert(/HAS_HISTORY/.test(del) && /Este paciente possui histórico e não pode ser excluído diretamente\./.test(del), 'paciente com histórico é recusado com a mensagem clara');
for (const t of ['df_sales', 'df_appointments', 'df_clinical_records', 'df_clinical_attachments', 'df_clinical_before_after_pairs']) {
  assert(new RegExp(`FROM ${t} WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id`).test(mig), `referência que BLOQUEIA a exclusão conferida: ${t}`);
}
assert(/UPDATE df_legacy_import_map[\s\S]*status = 'DELETED'/.test(del), 'excluir paciente importado marca o mapa legado como DELETED (não some o rastro)');
assert(/INSERT INTO df_audit_logs[\s\S]*PACIENTE_EXCLUIDO/.test(del), 'auditoria da exclusão gravada antes de remover');
assert(/status = 'DISMISSED'/.test(del), 'pendências abertas do paciente excluído são encerradas, não apagadas');
assert(/GRANT EXECUTE ON FUNCTION public\.dental_delete_patient_safe/.test(mig) && /REVOKE ALL ON FUNCTION public\.dental_delete_patient_safe\(text, text\) FROM PUBLIC/.test(mig), 'RPC de exclusão só para usuários autenticados');

// ─── Edge Function ──────────────────────────────────────────────────────────────────
assert(/action === "apply_review_issues"/.test(edge) && /onConflict: "tenant_id,patient_id,source,dedupe_key", ignoreDuplicates: true/.test(edge), 'pendências: upsert idempotente (ignoreDuplicates) pela chave única');
assert(/resolvedAlready/.test(edge) && /skippedResolved/.test(edge), 'servidor reconfere o dado ATUAL antes de gravar pendência de campo (não recria o que já foi corrigido)');
assert(/IDENTITY_CODES/.test(edge) && /mirrored/.test(edge), 'possível duplicidade gera espelho no cadastro existente relacionado');
assert(/x\.row\.provisional/.test(edge) && /x\.legacyCpfRaw = x\.cpf/.test(edge) && /x\.cpf = ""/.test(edge), 'provisório com CPF conflitante: CPF não é gravado, vai para legacyCpfRaw (unicidade não enfraquecida)');
assert(/"CREATED_REVIEW"/.test(edge), 'cadastro provisório registrado no mapa como CREATED_REVIEW');
assert(!/from\("df_patients"\)\s*\.delete/.test(edge) && !/\.delete\(\)/.test(edge), 'a Edge Function NUNCA apaga paciente/mapa/pendência');
const prof = edge.slice(edge.indexOf('action === "confirm_professional_mapping"'), edge.indexOf('action === "commit_records_batch"'));
assert(/from\("df_professionals"\)[\s\S]*eq\("tenant_id", tenantId\)/.test(prof), 'mapeamento de dentista só para profissional que existe NESTA clínica');
assert(!/insert\([\s\S]{0,200}df_professionals|from\("df_users"\)\s*\.insert|createUser/.test(prof) && /USER_CONFIRMED/.test(prof), 'não cria profissional/usuário; decisão registrada como USER_CONFIRMED');
assert(/já existe um mapeamento definitivo/i.test(prof), 'mapeamento definitivo não é sobrescrito por outro profissional');
assert(/commit_records_batch/.test(edge) && /ainda não habilitada/.test(edge), 'importação de prontuários continua BLOQUEADA no servidor');
assert(!/df_sales|df_receivables|df_appointments|df_wa_messages|df_wa_conversations/.test(edge.replace(/\/\/.*$/gm, '')), 'a função continua sem tocar em financeiro/agenda/mensagens');

// ─── App ────────────────────────────────────────────────────────────────────────────
assert(!/async deletePatient\(/.test(supa) && !/df_patients\?id=eq\.\$\{patientId\}[^`]*method: 'DELETE'/.test(supa), 'não existe mais DELETE direto de paciente no client');
assert(/rpc\/dental_delete_patient_safe/.test(supa) && /rpc\/dental_patient_delete_check/.test(supa), 'exclusão passa pela RPC segura');
assert(/deletePatientSafe/.test(dbts) && !/deletePatient\(id: string\): boolean/.test(dbts), 'db.deletePatientAsync usa o caminho seguro; atalho síncrono removido');
assert(/ignore-duplicates/.test(supa.slice(supa.indexOf('async ensureTenantExists'), supa.indexOf('async updateTenantClinicName'))), 'ensureTenantExists não sobrescreve mais o tenant (ignore-duplicates)');

console.log(`\n${passed} verificações passaram.`);
