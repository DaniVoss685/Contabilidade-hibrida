import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ==============================================================================
// dental-legacy-patient-import
//
// Backend da migração de dados de um sistema odontológico anterior (pacientes +
// histórico de procedimentos) para UM tenant alvo específico, com trava de
// tenant real (não apenas RLS) e idempotência em banco.
//
// REGRAS DE SEGURANÇA (não alterar sem revisar CLAUDE.md e o plano de
// implementação em C:\Users\Guilherme\.claude\plans\warm-swimming-kay.md):
//
// 1. TRAVA DE TENANT: uma "sessão de importação" (df_legacy_import_sessions)
//    grava target_tenant_id UMA VEZ, em create_session. Toda ação seguinte
//    (save_dry_run_result, commit_patients_batch, commit_records_batch,
//    finalize_session, invalidate_session) resolve o tenant a partir da
//    SESSÃO no servidor (session.tenant_id) — NUNCA de um tenant_id enviado
//    no corpo da requisição. Mesmo um SUPER_ADMIN/Modo Consultoria autorizado
//    a escrever em qualquer tenant só pode escrever no tenant da sessão que
//    ele mesmo criou; trocar de clínica ativa no frontend não redireciona
//    nenhuma escrita, porque o valor usado é sempre o da sessão persistida.
//
// 2. REVALIDAÇÃO A CADA CHAMADA: toda ação resolve TODOS os vínculos df_users
//    do chamador (nunca um único .maybeSingle()) e exige, a cada chamada,
//    is_primary/SUPER_ADMIN/PLATFORM_ADMIN OU um vínculo direto
//    df_users.clinic_id === session.tenant_id, mais a permissão de negócio
//    'patients:manage' (espelha src/lib/permissions.ts — manter em sincronia).
//    Isso é o que bloqueia tanto troca de clínica no meio do fluxo quanto um
//    payload manipulado tentando indicar outro tenant.
//
// 3. SEM EFEITO FINANCEIRO: esta função NUNCA grava em df_sales,
//    df_receivables, df_clinical_inputs (estoque), df_appointments, tabelas
//    de WhatsApp, comissão ou imposto. Toca apenas df_patients,
//    df_clinical_records, df_legacy_import_sessions, df_legacy_import_map
//    (e lê df_users/df_tenants para autenticação/nome da clínica).
//
// 4. HISTÓRICO CLÍNICO SEMPRE FINALIZADO TECNICAMENTE: todo df_clinical_records
//    criado por esta função usa status='FINALIZED' (nunca 'DRAFT' — DRAFT é um
//    estado operacional ativo/editável/excluível no app atual, ver
//    src/components/Patients/Clinical/PatientClinicalTimeline.tsx e
//    src/lib/db.ts deleteClinicalRecord/voidClinicalRecord). O status ORIGINAL
//    do sistema legado ("Finalizado"/"Em Execução") vai em legacy_status,
//    coluna separada — a UI usa legacy_status para exibição quando
//    origin='IMPORT', sem alterar o comportamento operacional de DRAFT.
//
// 5. IDEMPOTÊNCIA REAL EM BANCO: índice único
//    (tenant_id, source_system, entity_type, legacy_id) em
//    df_legacy_import_map garante que reimportar o mesmo arquivo no mesmo
//    tenant nunca duplica paciente/procedimento.
// ==============================================================================

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

const MAX_BATCH_SIZE = 250;
const VALID_SESSION_STATUSES = [
  "DRY_RUN_PENDING",
  "DRY_RUN_COMPLETE",
  "IMPORT_IN_PROGRESS",
  "IMPORT_COMPLETE",
  "INVALIDATED",
] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Espelha src/lib/permissions.ts (ROLE_PERMISSIONS para 'patients:manage') — manter em sincronia.
const ROLES_WITHOUT_PATIENT_MANAGE = ["FINANCE"];

function hasPatientManagePermission(
  role: string | null | undefined,
  permissions: any,
  isPrimary: boolean | null | undefined
): boolean {
  const upperRole = (role || "").toUpperCase();
  if (isPrimary || ["SUPER_ADMIN", "PLATFORM_ADMIN", "OWNER"].includes(upperRole)) return true;

  if (permissions) {
    if (Array.isArray(permissions)) {
      return permissions.includes("patients:manage");
    }
    if (typeof permissions === "object" && permissions["patients:manage"] !== undefined) {
      return Boolean(permissions["patients:manage"]);
    }
  }

  return !ROLES_WITHOUT_PATIENT_MANAGE.includes(upperRole);
}

interface CallerRow {
  id: string;
  clinic_id: string | null;
  role: string | null;
  permissions: any;
  is_primary: boolean | null;
  is_active: boolean;
  name: string | null;
}

// Resolução de autorização por tenant alvo — mesma lógica pura usada (e
// testada) em src/lib/legacyImportAuthorization.ts. Manter em sincronia.
function resolveAuthorizationForTenant(
  callerRows: CallerRow[],
  targetTenantId: string
): { authorized: boolean; effectiveProfile: CallerRow | null; isPlatformAdmin: boolean } {
  const isPlatformAdmin = callerRows.some(
    (u) => u.is_primary || ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes((u.role || "").toUpperCase())
  );
  const clinicProfile = callerRows.find((u) => u.clinic_id === targetTenantId) || null;
  const isClinicMember = Boolean(clinicProfile);

  if (!isClinicMember && !isPlatformAdmin) {
    return { authorized: false, effectiveProfile: null, isPlatformAdmin };
  }

  const effectiveProfile =
    clinicProfile ||
    callerRows.find((u) => u.is_primary || ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes((u.role || "").toUpperCase())) ||
    callerRows[0];

  return { authorized: true, effectiveProfile, isPlatformAdmin };
}

async function getCallerRows(authUserId: string) {
  return adminSupabase
    .from("df_users")
    .select("id, clinic_id, role, permissions, is_primary, is_active, name")
    .eq("auth_user_id", authUserId)
    .eq("is_active", true);
}

// Resolve a sessão pelo id e REVALIDA autorização do chamador contra
// session.tenant_id (nunca contra um tenant_id do corpo da requisição).
// Chamado em TODA ação exceto create_session.
async function resolveSessionAndAuthorize(sessionId: string, callerRows: CallerRow[]) {
  if (!sessionId || typeof sessionId !== "string") {
    return { error: json({ success: false, error: "session_id é obrigatório." }, 400) };
  }

  const { data: session, error: sessionErr } = await adminSupabase
    .from("df_legacy_import_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr || !session) {
    return { error: json({ success: false, error: "Sessão de importação não encontrada." }, 404) };
  }

  if (session.status === "INVALIDATED") {
    return {
      error: json(
        { success: false, error: "Esta sessão de importação foi invalidada. Inicie uma nova validação (dry run)." },
        409
      ),
    };
  }

  const { authorized, effectiveProfile } = resolveAuthorizationForTenant(callerRows, session.tenant_id);
  if (!authorized || !effectiveProfile) {
    return {
      error: json(
        {
          success: false,
          error:
            "Você não tem (mais) acesso à clínica desta sessão de importação. Se você trocou de clínica ativa, inicie uma nova validação.",
        },
        403
      ),
    };
  }

  if (!hasPatientManagePermission(effectiveProfile.role, effectiveProfile.permissions, effectiveProfile.is_primary)) {
    return {
      error: json({ success: false, error: "Você não possui permissão para importar pacientes." }, 403),
    };
  }

  return { session, effectiveProfile };
}

async function touchSession(sessionId: string, updates: Record<string, unknown>) {
  await adminSupabase
    .from("df_legacy_import_sessions")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. VALIDAR JWT DO USUÁRIO CHAMADOR
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({ success: false, error: "Token de autorização ausente ou inválido." }, 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();

    const { data: authData, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return json({ success: false, error: "Sessão inválida ou expirada." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const { data: callerRowsRaw, error: callerErr } = await getCallerRows(authData.user.id);
    if (callerErr || !callerRowsRaw || callerRowsRaw.length === 0) {
      return json({ success: false, error: "Usuário chamador não encontrado ou inativo." }, 403);
    }
    const callerRows = callerRowsRaw as CallerRow[];

    // ------------------------------------------------------------------
    // create_session — único ponto onde um tenant_id vindo do corpo é
    // aceito, e mesmo assim só depois de validar vínculo real (membro
    // direto da clínica OU is_primary/SUPER_ADMIN/PLATFORM_ADMIN).
    // A partir daqui, o tenant fica travado na sessão.
    // ------------------------------------------------------------------
    if (action === "create_session") {
      const {
        target_tenant_id,
        source_system,
        clients_file_name,
        clients_file_checksum,
        records_file_name,
        records_file_checksum,
      } = body;

      if (!target_tenant_id || typeof target_tenant_id !== "string") {
        return json({ success: false, error: "target_tenant_id é obrigatório." }, 400);
      }
      if (!source_system || typeof source_system !== "string") {
        return json({ success: false, error: "source_system é obrigatório." }, 400);
      }

      const { authorized, effectiveProfile } = resolveAuthorizationForTenant(callerRows, target_tenant_id);
      if (!authorized || !effectiveProfile) {
        return json({ success: false, error: "Você não tem acesso a esta clínica." }, 403);
      }
      if (!hasPatientManagePermission(effectiveProfile.role, effectiveProfile.permissions, effectiveProfile.is_primary)) {
        return json({ success: false, error: "Você não possui permissão para importar pacientes." }, 403);
      }

      const { data: tenantRow } = await adminSupabase
        .from("df_tenants")
        .select("name")
        .eq("id", target_tenant_id)
        .maybeSingle();

      const sessionId = `legimp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const nowIso = new Date().toISOString();

      const { data: inserted, error: insertErr } = await adminSupabase
        .from("df_legacy_import_sessions")
        .insert({
          id: sessionId,
          tenant_id: target_tenant_id,
          target_tenant_name: tenantRow?.name || null,
          source_system,
          status: "DRY_RUN_PENDING",
          clients_file_name: clients_file_name || null,
          clients_file_checksum: clients_file_checksum || null,
          records_file_name: records_file_name || null,
          records_file_checksum: records_file_checksum || null,
          created_by: effectiveProfile.id,
          created_by_name: effectiveProfile.name,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("*")
        .maybeSingle();

      if (insertErr || !inserted) {
        return json({ success: false, error: insertErr?.message || "Erro ao criar sessão de importação." }, 500);
      }

      return json({ success: true, session: inserted });
    }

    // ------------------------------------------------------------------
    // Todas as ações abaixo exigem session_id e revalidam autorização
    // contra session.tenant_id (nunca contra um tenant_id do corpo).
    // ------------------------------------------------------------------
    const { session_id } = body;
    const resolved = await resolveSessionAndAuthorize(session_id, callerRows);
    if ("error" in resolved) return resolved.error;
    const { session, effectiveProfile } = resolved;
    const tenantId: string = session.tenant_id;

    if (action === "save_dry_run_result") {
      if (!VALID_SESSION_STATUSES.includes(session.status)) {
        return json({ success: false, error: "Estado de sessão inválido." }, 409);
      }
      if (session.status === "IMPORT_COMPLETE") {
        return json({ success: false, error: "Esta sessão já foi importada; inicie uma nova validação." }, 409);
      }
      const { summary, professional_mapping, procedure_mapping } = body;
      await touchSession(session_id, {
        dry_run_summary: summary ?? null,
        professional_mapping: professional_mapping ?? null,
        procedure_mapping: procedure_mapping ?? null,
        status: "DRY_RUN_COMPLETE",
      });
      return json({ success: true });
    }

    if (action === "commit_patients_batch") {
      if (!["DRY_RUN_COMPLETE", "IMPORT_IN_PROGRESS"].includes(session.status)) {
        return json({ success: false, error: "É necessário concluir a validação (dry run) antes de importar." }, 409);
      }
      const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) {
        return json({ success: false, error: "Nenhuma linha enviada." }, 400);
      }
      if (rows.length > MAX_BATCH_SIZE) {
        return json({ success: false, error: `Lote excede o máximo de ${MAX_BATCH_SIZE} registros.` }, 400);
      }

      if (session.status === "DRY_RUN_COMPLETE") {
        await touchSession(session_id, { status: "IMPORT_IN_PROGRESS" });
      }

      const results: any[] = [];
      for (const row of rows) {
        const legacyId = String(row.legacy_id || "").trim();
        if (!legacyId) {
          results.push({ legacy_id: row.legacy_id, status: "error", error: "legacy_id ausente." });
          continue;
        }

        const { data: existingMap } = await adminSupabase
          .from("df_legacy_import_map")
          .select("target_id")
          .eq("tenant_id", tenantId)
          .eq("source_system", session.source_system)
          .eq("entity_type", "patient")
          .eq("legacy_id", legacyId)
          .maybeSingle();

        if (existingMap) {
          results.push({ legacy_id: legacyId, target_id: existingMap.target_id, status: "already_imported" });
          continue;
        }

        const patientId = `pat_legacy_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        const nowIso = new Date().toISOString();
        const p = row.patient || {};

        const { error: patientErr } = await adminSupabase.from("df_patients").insert({
          id: patientId,
          tenant_id: tenantId,
          org_id: `org_${tenantId}`,
          name: p.name,
          cpf: p.cpf || "",
          email: p.email || null,
          phone: p.phone || null,
          birth_date: p.birth_date || null,
          notes: p.notes || null,
          // df_patients não tem colunas city/state (verificado contra o schema
          // remoto real) — cidade/UF ficam em legacy_metadata.address.
          legacy_metadata: p.legacy_metadata || null,
          created_at: nowIso,
        });

        if (patientErr) {
          results.push({ legacy_id: legacyId, status: "error", error: patientErr.message });
          continue;
        }

        const { error: mapErr } = await adminSupabase.from("df_legacy_import_map").insert({
          id: `limap_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`,
          tenant_id: tenantId,
          source_system: session.source_system,
          entity_type: "patient",
          legacy_id: legacyId,
          target_id: patientId,
          import_session_id: session_id,
          checksum: row.checksum || null,
          created_by: effectiveProfile!.id,
          imported_at: nowIso,
        });

        if (mapErr) {
          if (mapErr.code === "23505") {
            const { data: raceExisting } = await adminSupabase
              .from("df_legacy_import_map")
              .select("target_id")
              .eq("tenant_id", tenantId)
              .eq("source_system", session.source_system)
              .eq("entity_type", "patient")
              .eq("legacy_id", legacyId)
              .maybeSingle();
            results.push({
              legacy_id: legacyId,
              target_id: raceExisting?.target_id || patientId,
              status: "already_imported",
            });
            continue;
          }
          results.push({ legacy_id: legacyId, status: "error", error: mapErr.message });
          continue;
        }

        results.push({ legacy_id: legacyId, target_id: patientId, status: "created" });
      }

      return json({ success: true, results });
    }

    if (action === "commit_records_batch") {
      if (!["DRY_RUN_COMPLETE", "IMPORT_IN_PROGRESS"].includes(session.status)) {
        return json({ success: false, error: "É necessário concluir a validação (dry run) antes de importar." }, 409);
      }
      const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) {
        return json({ success: false, error: "Nenhuma linha enviada." }, 400);
      }
      if (rows.length > MAX_BATCH_SIZE) {
        return json({ success: false, error: `Lote excede o máximo de ${MAX_BATCH_SIZE} registros.` }, 400);
      }

      if (session.status === "DRY_RUN_COMPLETE") {
        await touchSession(session_id, { status: "IMPORT_IN_PROGRESS" });
      }

      const results: any[] = [];
      for (const row of rows) {
        const legacyId = String(row.legacy_id || "").trim();
        const patientLegacyId = String(row.patient_legacy_id || "").trim();
        if (!legacyId || !patientLegacyId) {
          results.push({ legacy_id: row.legacy_id, status: "error", error: "legacy_id/patient_legacy_id ausente." });
          continue;
        }

        const { data: existingMap } = await adminSupabase
          .from("df_legacy_import_map")
          .select("target_id")
          .eq("tenant_id", tenantId)
          .eq("source_system", session.source_system)
          .eq("entity_type", "clinical_record")
          .eq("legacy_id", legacyId)
          .maybeSingle();

        if (existingMap) {
          results.push({ legacy_id: legacyId, target_id: existingMap.target_id, status: "already_imported" });
          continue;
        }

        const { data: patientMap } = await adminSupabase
          .from("df_legacy_import_map")
          .select("target_id")
          .eq("tenant_id", tenantId)
          .eq("source_system", session.source_system)
          .eq("entity_type", "patient")
          .eq("legacy_id", patientLegacyId)
          .maybeSingle();

        if (!patientMap) {
          results.push({ legacy_id: legacyId, status: "error", error: "PATIENT_NOT_IMPORTED_YET" });
          continue;
        }

        const recordId = `crec_legacy_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        const nowIso = new Date().toISOString();
        const r = row.record || {};

        const { error: recordErr } = await adminSupabase.from("df_clinical_records").insert({
          id: recordId,
          tenant_id: tenantId,
          patient_id: patientMap.target_id,
          professional_id: r.professional_id || "legacy_unmapped",
          professional_name: r.professional_name || r.legacy_dentist_name || null,
          record_type: "PROCEDIMENTO",
          procedure_id: r.procedure_id || null,
          procedure_name: r.procedure_name || r.legacy_procedure_name || null,
          record_date: r.record_date,
          evolution: r.evolution || r.procedure_name || r.legacy_procedure_name || "Procedimento importado do sistema anterior.",
          status: "FINALIZED",
          origin: "IMPORT",
          import_metadata: r.import_metadata || null,
          tooth_number: r.tooth_number || null,
          tooth_face: r.tooth_face || null,
          legacy_tuss_code: r.legacy_tuss_code || null,
          legacy_procedure_name: r.legacy_procedure_name || null,
          legacy_dentist_name: r.legacy_dentist_name || null,
          legacy_status: r.legacy_status || null,
          created_by: effectiveProfile!.id,
          created_by_name: effectiveProfile!.name,
          created_at: nowIso,
          finalized_by: effectiveProfile!.id,
          finalized_by_name: effectiveProfile!.name,
          finalized_at: nowIso,
        });

        if (recordErr) {
          results.push({ legacy_id: legacyId, status: "error", error: recordErr.message });
          continue;
        }

        const { error: mapErr } = await adminSupabase.from("df_legacy_import_map").insert({
          id: `limap_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`,
          tenant_id: tenantId,
          source_system: session.source_system,
          entity_type: "clinical_record",
          legacy_id: legacyId,
          target_id: recordId,
          import_session_id: session_id,
          checksum: row.checksum || null,
          created_by: effectiveProfile!.id,
          imported_at: nowIso,
        });

        if (mapErr) {
          if (mapErr.code === "23505") {
            const { data: raceExisting } = await adminSupabase
              .from("df_legacy_import_map")
              .select("target_id")
              .eq("tenant_id", tenantId)
              .eq("source_system", session.source_system)
              .eq("entity_type", "clinical_record")
              .eq("legacy_id", legacyId)
              .maybeSingle();
            results.push({
              legacy_id: legacyId,
              target_id: raceExisting?.target_id || recordId,
              status: "already_imported",
            });
            continue;
          }
          results.push({ legacy_id: legacyId, status: "error", error: mapErr.message });
          continue;
        }

        results.push({ legacy_id: legacyId, target_id: recordId, status: "created" });
      }

      return json({ success: true, results });
    }

    if (action === "finalize_session") {
      const [{ count: patientsCount }, { count: recordsCount }] = await Promise.all([
        adminSupabase
          .from("df_legacy_import_map")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("import_session_id", session_id)
          .eq("entity_type", "patient"),
        adminSupabase
          .from("df_legacy_import_map")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("import_session_id", session_id)
          .eq("entity_type", "clinical_record"),
      ]);

      await touchSession(session_id, { status: "IMPORT_COMPLETE" });
      return json({
        success: true,
        summary: { patientsImported: patientsCount || 0, recordsImported: recordsCount || 0 },
      });
    }

    if (action === "invalidate_session") {
      await touchSession(session_id, { status: "INVALIDATED" });
      return json({ success: true });
    }

    return json({ success: false, error: `Ação desconhecida: ${action}` }, 400);
  } catch (err: any) {
    console.error("[dental-legacy-patient-import] Erro:", err);
    return json({ success: false, error: err?.message || "Erro interno no servidor." }, 500);
  }
});
