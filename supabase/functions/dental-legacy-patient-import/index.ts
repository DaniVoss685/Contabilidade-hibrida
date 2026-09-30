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
//    (e lê df_users/df_tenants para autenticação/nome da clínica). Também grava as
//    PENDÊNCIAS CADASTRAIS (df_patient_review_issues — idempotentes) e o mapeamento
//    definitivo de dentista legado (df_legacy_import_map, entity_type 'professional').
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

// Códigos de pendência cadastral aceitos (espelha src/lib/patientReviewIssues.ts — manter em sincronia).
const ISSUE_CODES = new Set([
  "MISSING_CPF", "INVALID_CPF", "DUPLICATE_CPF", "MISSING_BIRTH_DATE", "INVALID_BIRTH_DATE",
  "MISSING_PHONE", "INVALID_PHONE", "PLACEHOLDER_PHONE", "POSSIBLE_DUPLICATE",
  "EXISTING_PATIENT_DIVERGENCE", "MULTIPLE_LEGACY_SAME_PATIENT", "GUARDIAN_REVIEW", "OTHER_DATA_REVIEW",
]);
const ISSUE_SEVERITY: Record<string, string> = {
  DUPLICATE_CPF: "HIGH", POSSIBLE_DUPLICATE: "HIGH", EXISTING_PATIENT_DIVERGENCE: "HIGH", MULTIPLE_LEGACY_SAME_PATIENT: "HIGH",
  INVALID_CPF: "MEDIUM", INVALID_BIRTH_DATE: "MEDIUM", INVALID_PHONE: "MEDIUM", PLACEHOLDER_PHONE: "MEDIUM",
  GUARDIAN_REVIEW: "MEDIUM", OTHER_DATA_REVIEW: "MEDIUM", MISSING_CPF: "LOW", MISSING_BIRTH_DATE: "LOW", MISSING_PHONE: "LOW",
};
// Pendência de identidade: nunca se resolve sozinha e é a única que gera espelho no paciente relacionado.
const IDENTITY_CODES = new Set(["POSSIBLE_DUPLICATE", "EXISTING_PATIENT_DIVERGENCE", "MULTIPLE_LEGACY_SAME_PATIENT"]);

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

// ------------------------------------------------------------------------------
// Sanitizadores server-side (defesa em profundidade — o cliente já classifica,
// mas o servidor nunca grava CPF/telefone que não passe nas mesmas regras).
// Edge Functions não importam src/lib: manter em sincronia manualmente com
// src/lib/masks.ts (isValidCpf), src/lib/phoneUtils.ts (classifyBrazilianPhone,
// isPlaceholderPhoneNumber) e src/lib/guardianMatching.ts (normalizeGuardianName).
// ------------------------------------------------------------------------------

function isValidCpfServer(raw: string | null | undefined): boolean {
  const clean = (raw || "").replace(/\D/g, "");
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += parseInt(clean.charAt(i), 10) * (10 - i);
  let rem1 = (sum1 * 10) % 11;
  if (rem1 === 10 || rem1 === 11) rem1 = 0;
  if (rem1 !== parseInt(clean.charAt(9), 10)) return false;
  let sum2 = 0;
  for (let i = 0; i < 10; i++) sum2 += parseInt(clean.charAt(i), 10) * (11 - i);
  let rem2 = (sum2 * 10) % 11;
  if (rem2 === 10 || rem2 === 11) rem2 = 0;
  return rem2 === parseInt(clean.charAt(10), 10);
}

const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function isPlaceholderLocal(local: string): boolean {
  if (local.length < 8) return false;
  if (/^(\d)\1+$/.test(local)) return true;
  let asc = true;
  let desc = true;
  for (let i = 0; i < local.length - 1; i++) {
    const a = local.charCodeAt(i);
    const b = local.charCodeAt(i + 1);
    if (b - a !== 1) asc = false;
    if (a - b !== 1) desc = false;
  }
  return asc || desc;
}

/** Telefone VALID normalizado (DDD + número, sem 55) ou '' — nunca grava placeholder/inválido. */
function validPhoneOrEmpty(raw: string | null | undefined): string {
  let digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  else if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);
  if (digits.length !== 10 && digits.length !== 11) return "";
  const ddd = parseInt(digits.slice(0, 2), 10);
  let local = digits.slice(2);
  if (local.length === 8 && ["6", "7", "8", "9"].includes(local[0])) local = `9${local}`;
  if (isPlaceholderLocal(local)) return "";
  if (!VALID_DDDS.has(ddd)) return "";
  if (local.length === 9 && local[0] !== "9") return "";
  if (local.length === 8 && (local[0] === "0" || local[0] === "1")) return "";
  return `${digits.slice(0, 2)}${local}`;
}

function normalizeGuardianNameServer(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// IDs determinísticos por (tenant, sistema de origem, chave legada): reexecutar
// um lote que caiu no meio nunca cria um segundo paciente/responsável/mapa —
// o INSERT colide no mesmo id e é ignorado. Incluem o tenant, então o mesmo
// legacy_id em outro tenant gera outro id.
async function deterministicId(prefix: string, ...parts: string[]): Promise<string> {
  return `${prefix}${(await sha256Hex(parts.join("|"))).slice(0, 24)}`;
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
        .select("name, trade_name")
        .eq("id", target_tenant_id)
        .maybeSingle();
      if (!tenantRow) return json({ success: false, error: "Clínica alvo não encontrada." }, 404);
      const { data: profRow } = await adminSupabase
        .from("df_professionals")
        .select("name, nome_fantasia, razao_social")
        .eq("tenant_id", target_tenant_id)
        .limit(1)
        .maybeSingle();
      // Mesma precedência de resolveClinicDisplayName (src/lib/supabaseClient.ts) — manter em sincronia.
      const generic = new Set(["Clínica Odontológica", "Clínica sem nome"]);
      const pick = (v?: string | null) => (v && v.trim() && !generic.has(v.trim()) ? v.trim() : "");
      const targetTenantName =
        pick(tenantRow.name) || pick(tenantRow.trade_name) || pick(profRow?.nome_fantasia) ||
        pick(profRow?.razao_social) || pick(profRow?.name) || tenantRow.name || null;

      const sessionId = `legimp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const nowIso = new Date().toISOString();

      const { data: inserted, error: insertErr } = await adminSupabase
        .from("df_legacy_import_sessions")
        .insert({
          id: sessionId,
          tenant_id: target_tenant_id,
          target_tenant_name: targetTenantName,
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
      // ------------------------------------------------------------------
      // Commit de PACIENTES (e responsáveis/vínculos) de um lote.
      // Ordem das escritas pensada para reexecução segura: paciente ->
      // responsável -> vínculo -> MAPA LEGADO por último. Se o lote cair no
      // meio, o mapa ainda não existe para aquela linha e a reexecução
      // refaz os passos — os INSERTs colidem nos ids determinísticos e são
      // ignorados (nunca duplica). Paciente já existente NUNCA é alterado:
      // LINK_EXISTING só grava o mapa.
      // WhatsApp: df_wa_contacts/df_wa_contact_patients são mantidos pela
      // trigger canônica fn_sync_df_patient_to_wa_contact (só telefone
      // válido, nunca placeholder; não cria conversa nem mensagem).
      // ------------------------------------------------------------------
      if (!["DRY_RUN_COMPLETE", "IMPORT_IN_PROGRESS"].includes(session.status)) {
        return json({ success: false, error: "É necessário concluir a validação (dry run) antes de importar." }, 409);
      }
      const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) return json({ success: false, error: "Nenhuma linha enviada." }, 400);
      if (rows.length > MAX_BATCH_SIZE) {
        return json({ success: false, error: `Lote excede o máximo de ${MAX_BATCH_SIZE} registros.` }, 400);
      }
      if (session.status === "DRY_RUN_COMPLETE") await touchSession(session_id, { status: "IMPORT_IN_PROGRESS" });

      const source = session.source_system as string;
      const nowIso = new Date().toISOString();
      const results = new Map<string, any>();
      const fail = (legacyId: string, error: string) => results.set(legacyId, { legacy_id: legacyId, status: "error", error });
      const counters = { guardiansCreated: 0, guardiansReused: 0, linksCreated: 0 };

      // 1. Idempotência: linhas já presentes no mapa deste tenant são puladas.
      const legacyIds = rows.map((r) => String(r.legacy_id || "").trim()).filter(Boolean);
      const { data: mappedRows, error: mapReadErr } = await adminSupabase
        .from("df_legacy_import_map")
        .select("legacy_id, target_id")
        .eq("tenant_id", tenantId)
        .eq("source_system", source)
        .eq("entity_type", "patient")
        .in("legacy_id", legacyIds);
      if (mapReadErr) return json({ success: false, error: `Falha ao ler mapa legado: ${mapReadErr.message}` }, 500);
      const alreadyMapped = new Map((mappedRows || []).map((m: any) => [m.legacy_id, m.target_id]));

      const creates: any[] = [];
      const links: any[] = [];
      for (const row of rows) {
        const legacyId = String(row.legacy_id || "").trim();
        if (!legacyId) continue;
        if (alreadyMapped.has(legacyId)) {
          results.set(legacyId, { legacy_id: legacyId, target_id: alreadyMapped.get(legacyId), status: "already_imported" });
          continue;
        }
        if (row.action === "LINK_EXISTING") links.push(row);
        else if (row.action === "CREATE") creates.push(row);
        else fail(legacyId, "Ação de linha desconhecida.");
      }

      // 2. LINK_EXISTING: o paciente precisa existir NESTE tenant e, quando o
      // vínculo é por CPF, ter exatamente o CPF informado.
      const mapInserts: any[] = [];
      if (links.length > 0) {
        const ids = [...new Set(links.map((l) => String(l.existing_patient_id || "")))].filter(Boolean);
        const { data: existing } = await adminSupabase
          .from("df_patients")
          .select("id, cpf")
          .eq("tenant_id", tenantId)
          .in("id", ids);
        const byId = new Map((existing || []).map((p: any) => [p.id, p]));
        for (const l of links) {
          const legacyId = String(l.legacy_id).trim();
          const target = byId.get(String(l.existing_patient_id || ""));
          if (!target) {
            fail(legacyId, "Paciente existente não encontrado neste tenant.");
            continue;
          }
          const rowCpf = String(l.patient?.cpf || "").replace(/\D/g, "");
          if (l.match_kind === "LINKED_CPF" && (!rowCpf || String(target.cpf || "").replace(/\D/g, "") !== rowCpf)) {
            fail(legacyId, "CPF do paciente existente não confere com o cliente legado.");
            continue;
          }
          mapInserts.push({ row: l, targetId: target.id, matchKind: l.match_kind === "LINKED_STRONG" ? "LINKED_STRONG" : "LINKED_CPF" });
        }
      }

      // 3. CREATE: sanitização server-side + ids determinísticos.
      const prepared: any[] = [];
      for (const c of creates) {
        const legacyId = String(c.legacy_id).trim();
        const p = c.patient || {};
        const name = String(p.name || "").trim().replace(/\s+/g, " ");
        if (name.length < 2) {
          fail(legacyId, "Nome ausente.");
          continue;
        }
        const cpfDigits = String(p.cpf || "").replace(/\D/g, "");
        prepared.push({
          row: c,
          legacyId,
          id: await deterministicId("pat_lgc_", tenantId, source, legacyId),
          name,
          cpf: isValidCpfServer(cpfDigits) ? cpfDigits : "",
          ownPhone: validPhoneOrEmpty(p.own_phone),
          birthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(p.birth_date || "")) ? p.birth_date : "",
        });
      }

      // 3a. Nunca criar um segundo paciente com CPF que já existe no tenant
      // (a clínica está em uso: alguém pode ter cadastrado entre o dry run e o commit).
      // Cadastro PROVISÓRIO (revisão) nunca falha por CPF conflitante: entra SEM o CPF canônico, o valor
      // fica em legacy_metadata.legacyCpfRaw e a pendência DUPLICATE_CPF é registrada (a recepção decide).
      // A restrição de unicidade de CPF NÃO é enfraquecida: o CPF conflitante simplesmente não é gravado.
      const cpfs = [...new Set(prepared.map((x) => x.cpf).filter(Boolean))];
      const cpfCountInBatch = new Map<string, number>();
      prepared.forEach((x) => x.cpf && cpfCountInBatch.set(x.cpf, (cpfCountInBatch.get(x.cpf) || 0) + 1));
      if (cpfs.length > 0) {
        const { data: sameCpf } = await adminSupabase
          .from("df_patients")
          .select("id, cpf")
          .eq("tenant_id", tenantId)
          .in("cpf", cpfs);
        const takenBy = new Map<string, string[]>();
        (sameCpf || []).forEach((p: any) => takenBy.set(p.cpf, [...(takenBy.get(p.cpf) || []), p.id]));
        for (const x of prepared) {
          const holders = (takenBy.get(x.cpf) || []).filter((id) => id !== x.id);
          const conflict = x.cpf && (holders.length > 0 || (x.row.provisional && (cpfCountInBatch.get(x.cpf) || 0) > 1));
          if (!conflict) continue;
          if (x.row.provisional) {
            x.legacyCpfRaw = x.cpf;
            x.cpf = "";
            x.serverIssues = [{ issue_code: "DUPLICATE_CPF", field_name: "cpf", legacy_value: x.legacyCpfRaw }];
          } else {
            fail(x.legacyId, "CPF já pertence a outro paciente deste tenant (cadastrado depois do dry run) — revisar.");
            x.skip = true;
          }
        }
      }

      // 4. Responsáveis: reaproveita por CPF, depois nome+telefone (mesma
      // prioridade de guardianMatching.resolveGuardianMatch); senão cria com id
      // determinístico por cluster. Nunca por nome ou telefone sozinhos.
      const { data: tenantGuardians, error: gReadErr } = await adminSupabase
        .from("df_patient_guardians")
        .select("id, name, cpf, phone")
        .eq("tenant_id", tenantId);
      if (gReadErr) return json({ success: false, error: `Falha ao ler responsáveis: ${gReadErr.message}` }, 500);
      const guardianPool: any[] = [...(tenantGuardians || [])];
      const resolvedGuardian = new Map<string, { id: string; phone: string } | { error: string }>();

      for (const x of prepared) {
        if (x.skip) continue;
        const g = x.row.guardian;
        if (!g || !g.cluster_key) continue;
        if (resolvedGuardian.has(g.cluster_key)) continue;
        const gName = String(g.name || "").trim().replace(/\s+/g, " ");
        if (!gName) {
          resolvedGuardian.set(g.cluster_key, { error: "Responsável sem nome." });
          continue;
        }
        const gCpf = isValidCpfServer(g.cpf) ? String(g.cpf).replace(/\D/g, "") : "";
        const gPhone = validPhoneOrEmpty(g.phone);
        const byCpf = gCpf ? guardianPool.filter((e) => String(e.cpf || "").replace(/\D/g, "") === gCpf) : [];
        const byNamePhone = gPhone
          ? guardianPool.filter(
              (e) =>
                String(e.phone || "").replace(/\D/g, "") === gPhone &&
                normalizeGuardianNameServer(e.name) === normalizeGuardianNameServer(gName)
            )
          : [];
        const candidates = byCpf.length > 0 ? byCpf : byNamePhone;
        if (candidates.length > 1) {
          resolvedGuardian.set(g.cluster_key, { error: "Mais de um responsável existente corresponde — revisar." });
          continue;
        }
        if (candidates.length === 1) {
          const e = candidates[0];
          resolvedGuardian.set(g.cluster_key, { id: e.id, phone: String(e.phone || "").replace(/\D/g, "") });
          if (!String(e.id).startsWith("grd_lgc_")) counters.guardiansReused++;
          continue;
        }
        const gid = await deterministicId("grd_lgc_", tenantId, source, g.cluster_key);
        const { error: gInsErr } = await adminSupabase.from("df_patient_guardians").upsert(
          { id: gid, tenant_id: tenantId, name: gName, cpf: gCpf || null, phone: gPhone || null, email: g.email ? String(g.email).trim() : null, created_at: nowIso, updated_at: nowIso },
          { onConflict: "id", ignoreDuplicates: true }
        );
        if (gInsErr) {
          resolvedGuardian.set(g.cluster_key, { error: `Falha ao criar responsável: ${gInsErr.message}` });
          continue;
        }
        guardianPool.push({ id: gid, name: gName, cpf: gCpf, phone: gPhone });
        resolvedGuardian.set(g.cluster_key, { id: gid, phone: gPhone });
        counters.guardiansCreated++;
      }

      // 5. phone_owner final (servidor decide com o telefone REAL do
      // responsável resolvido — a trigger fn_sync_patient_link_phone copia
      // esse telefone para todo paciente RESPONSIBLE vinculado como primário).
      for (const x of prepared) {
        if (x.skip) continue;
        const g = x.row.guardian;
        const rg = g?.cluster_key ? resolvedGuardian.get(g.cluster_key) : undefined;
        if (rg && "error" in rg) {
          fail(x.legacyId, rg.error);
          x.skip = true;
          continue;
        }
        x.guardianId = rg ? rg.id : undefined;
        x.relationshipType = g?.relationship_type ? String(g.relationship_type).trim() : null;
        const gPhone = rg ? rg.phone : "";
        const wantsResponsible = x.row.patient?.phone_owner === "RESPONSIBLE";
        if (wantsResponsible && x.guardianId && gPhone && (!x.ownPhone || x.ownPhone === gPhone)) {
          x.phoneOwner = "RESPONSIBLE";
          x.phone = gPhone;
        } else {
          x.phoneOwner = "PATIENT";
          x.phone = x.ownPhone;
        }
      }

      // 6. Pacientes (ON CONFLICT id DO NOTHING).
      const toInsert = prepared.filter((x) => !x.skip);
      const patientPayload = (x: any) => ({
        id: x.id,
        tenant_id: tenantId,
        org_id: `org_${tenantId}`,
        name: x.name,
        document_type: "CPF",
        cpf: x.cpf,
        email: x.row.patient?.email ? String(x.row.patient.email).trim() : "",
        phone: x.phone,
        phone_owner: x.phoneOwner,
        birth_date: x.birthDate,
        notes: x.row.patient?.notes ? String(x.row.patient.notes) : "",
        clinical_notes: x.row.patient?.clinical_notes ? String(x.row.patient.clinical_notes) : null,
        legacy_metadata: x.legacyCpfRaw
          ? { ...(x.row.patient?.legacy_metadata || {}), legacyCpfRaw: x.legacyCpfRaw }
          : x.row.patient?.legacy_metadata || null,
        created_at: nowIso,
      });
      if (toInsert.length > 0) {
        const { error: bulkErr } = await adminSupabase
          .from("df_patients")
          .upsert(toInsert.map(patientPayload), { onConflict: "id", ignoreDuplicates: true });
        if (bulkErr) {
          // Isola a(s) linha(s) problemática(s) sem perder o resto do lote.
          for (const x of toInsert) {
            const { error: oneErr } = await adminSupabase
              .from("df_patients")
              .upsert(patientPayload(x), { onConflict: "id", ignoreDuplicates: true });
            if (oneErr) {
              fail(x.legacyId, `Falha ao gravar paciente: ${oneErr.message}`);
              x.skip = true;
            }
          }
        }
      }
      const insertedIds = toInsert.filter((x) => !x.skip).map((x) => x.id);
      if (insertedIds.length > 0) {
        const { data: present } = await adminSupabase
          .from("df_patients")
          .select("id")
          .eq("tenant_id", tenantId)
          .in("id", insertedIds);
        const presentSet = new Set((present || []).map((p: any) => p.id));
        for (const x of toInsert) {
          if (!x.skip && !presentSet.has(x.id)) {
            fail(x.legacyId, "Paciente não confirmado após gravação.");
            x.skip = true;
          }
        }
      }

      // 7. Vínculos responsável -> paciente (primário).
      for (const x of toInsert) {
        if (x.skip || !x.guardianId) continue;
        const { error: linkErr } = await adminSupabase.from("df_patient_guardian_links").upsert(
          { tenant_id: tenantId, patient_id: x.id, guardian_id: x.guardianId, relationship_type: x.relationshipType, is_primary: true },
          { onConflict: "patient_id,guardian_id", ignoreDuplicates: true }
        );
        if (linkErr) {
          fail(x.legacyId, `Falha ao vincular responsável: ${linkErr.message}`);
          x.skip = true;
          continue;
        }
        counters.linksCreated++;
      }

      // 8. Mapa legado (por último — marca a linha como concluída).
      for (const x of toInsert) {
        if (!x.skip) mapInserts.push({ row: x.row, targetId: x.id, matchKind: x.row.provisional ? "CREATED_REVIEW" : "CREATED" });
      }
      const mapPayload = [];
      for (const m of mapInserts) {
        const legacyId = String(m.row.legacy_id).trim();
        mapPayload.push({
          id: await deterministicId("limap_", tenantId, source, "patient", legacyId),
          tenant_id: tenantId,
          source_system: source,
          entity_type: "patient",
          legacy_id: legacyId,
          legacy_secondary_id: m.row.legacy_secondary_id ? String(m.row.legacy_secondary_id).trim() : null,
          target_id: m.targetId,
          match_kind: m.matchKind,
          import_session_id: session_id,
          checksum: m.row.checksum || null,
          created_by: effectiveProfile!.id,
          imported_at: nowIso,
        });
      }
      if (mapPayload.length > 0) {
        const { error: mapErr } = await adminSupabase
          .from("df_legacy_import_map")
          .upsert(mapPayload, { onConflict: "tenant_id,source_system,entity_type,legacy_id", ignoreDuplicates: true });
        if (mapErr) {
          for (const mp of mapPayload) fail(mp.legacy_id, `Falha ao gravar mapa legado: ${mapErr.message}`);
          return json({ success: false, error: `Falha ao gravar mapa legado: ${mapErr.message}`, results: [...results.values()] }, 500);
        }
        const { data: confirmed } = await adminSupabase
          .from("df_legacy_import_map")
          .select("legacy_id, target_id")
          .eq("tenant_id", tenantId)
          .eq("source_system", source)
          .eq("entity_type", "patient")
          .in("legacy_id", mapPayload.map((m) => m.legacy_id));
        const confirmedMap = new Map((confirmed || []).map((m: any) => [m.legacy_id, m.target_id]));
        for (const m of mapInserts) {
          const legacyId = String(m.row.legacy_id).trim();
          const target = confirmedMap.get(legacyId);
          if (!target) fail(legacyId, "Mapa legado não confirmado após gravação.");
          else results.set(legacyId, { legacy_id: legacyId, target_id: target, status: m.matchKind === "CREATED" || m.matchKind === "CREATED_REVIEW" ? "created" : "linked" });
        }
      }

      // Rede de segurança: CPF que virou conflito DEPOIS do dry run (alguém cadastrou no intervalo) foi
      // removido do paciente provisório; registra a pendência DUPLICATE_CPF (idempotente).
      const serverIssueRows: any[] = [];
      for (const x of toInsert) {
        if (x.skip || !x.serverIssues) continue;
        for (const si of x.serverIssues) {
          const dedupeKey = [si.issue_code, si.field_name, ""].join("|");
          serverIssueRows.push({
            id: await deterministicId("rvi_", tenantId, x.id, "LEGACY_IMPORT", dedupeKey),
            tenant_id: tenantId, patient_id: x.id, source: "LEGACY_IMPORT", issue_code: si.issue_code,
            field_name: si.field_name, severity: ISSUE_SEVERITY[si.issue_code] || "MEDIUM",
            message: "CPF repetido em outro cadastro — não gravado neste paciente.",
            legacy_value: si.legacy_value || null, related_patient_id: null, dedupe_key: dedupeKey,
            status: "OPEN", import_session_id: session_id, created_at: nowIso, updated_at: nowIso,
          });
        }
      }
      if (serverIssueRows.length > 0) {
        await adminSupabase.from("df_patient_review_issues").upsert(serverIssueRows, { onConflict: "tenant_id,patient_id,source,dedupe_key", ignoreDuplicates: true });
      }

      return json({ success: true, results: [...results.values()], counters });
    }


    if (action === "apply_review_issues") {
      // ------------------------------------------------------------------
      // Pendências cadastrais (df_patient_review_issues). Idempotente: índice único
      // (tenant, paciente, origem, dedupe_key) — reexecutar nunca duplica, e uma pendência já
      // revisada/resolvida NÃO é recriada. O servidor RECONFERE o dado atual do paciente antes de
      // gravar pendência de campo (CPF/nascimento/telefone): se a recepção já preencheu, não grava.
      // Pendência de identidade (possível duplicidade etc.) nunca se resolve sozinha e gera um
      // ESPELHO no paciente relacionado (o cadastro que já existia), para a recepção ver os dois lados.
      // ------------------------------------------------------------------
      if (!["DRY_RUN_COMPLETE", "IMPORT_IN_PROGRESS"].includes(session.status)) {
        return json({ success: false, error: "É necessário concluir a validação (dry run) antes de gravar pendências." }, 409);
      }
      const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) return json({ success: false, error: "Nenhuma linha enviada." }, 400);
      if (rows.length > MAX_BATCH_SIZE) return json({ success: false, error: `Lote excede o máximo de ${MAX_BATCH_SIZE} registros.` }, 400);

      const source = session.source_system as string;
      const nowIso = new Date().toISOString();
      const counters = { created: 0, alreadyExisting: 0, skippedResolved: 0, mirrored: 0, rejected: 0 };

      // Resolve legacy_id -> paciente (só mapa ATIVO deste tenant) e os legacy ids relacionados.
      const legacyIds = new Set<string>();
      rows.forEach((r) => {
        legacyIds.add(String(r.legacy_id || "").trim());
        (Array.isArray(r.review_issues) ? r.review_issues : []).forEach((i: any) => i?.related_legacy_id && legacyIds.add(String(i.related_legacy_id).trim()));
        (Array.isArray(r.review_issues) ? r.review_issues : []).forEach((i: any) => i?.relatedLegacyId && legacyIds.add(String(i.relatedLegacyId).trim()));
      });
      legacyIds.delete("");
      const { data: mapRows, error: mapErr } = await adminSupabase
        .from("df_legacy_import_map")
        .select("legacy_id, target_id, status")
        .eq("tenant_id", tenantId)
        .eq("source_system", source)
        .eq("entity_type", "patient")
        .in("legacy_id", [...legacyIds]);
      if (mapErr) return json({ success: false, error: `Falha ao ler mapa legado: ${mapErr.message}` }, 500);
      const targetByLegacy = new Map<string, string>();
      (mapRows || []).forEach((m: any) => m.status === "ACTIVE" && targetByLegacy.set(m.legacy_id, m.target_id));

      const patientIds = new Set<string>();
      targetByLegacy.forEach((id) => patientIds.add(id));
      rows.forEach((r) =>
        (Array.isArray(r.review_issues) ? r.review_issues : []).forEach((i: any) => {
          const rp = String(i?.related_patient_id || i?.relatedPatientId || "").trim();
          if (rp) patientIds.add(rp);
        })
      );
      const { data: patientRows, error: pErr } = await adminSupabase
        .from("df_patients")
        .select("id, cpf, phone, birth_date, document_type")
        .eq("tenant_id", tenantId)
        .in("id", [...patientIds]);
      if (pErr) return json({ success: false, error: `Falha ao ler pacientes: ${pErr.message}` }, 500);
      const patientById = new Map((patientRows || []).map((p: any) => [p.id, p]));

      const toInsert = new Map<string, any>();
      const addIssue = async (patientId: string, d: any, relatedPatientId: string | null) => {
        const code = String(d.issue_code || d.issueCode || "");
        if (!ISSUE_CODES.has(code)) {
          counters.rejected++;
          return;
        }
        const patient = patientById.get(patientId);
        if (!patient) {
          counters.rejected++;
          return;
        }
        // Reconferência objetiva do dado ATUAL (a recepção pode já ter corrigido).
        const hasCpf = String(patient.cpf || "").replace(/\D/g, "").length > 0;
        const hasBirth = String(patient.birth_date || "").trim().length > 0;
        const hasPhone = String(patient.phone || "").replace(/\D/g, "").length > 0;
        const resolvedAlready =
          (["MISSING_CPF", "INVALID_CPF", "DUPLICATE_CPF"].includes(code) && hasCpf) ||
          (["MISSING_BIRTH_DATE", "INVALID_BIRTH_DATE"].includes(code) && (hasBirth || patient.document_type === "CNPJ")) ||
          (["MISSING_PHONE", "INVALID_PHONE", "PLACEHOLDER_PHONE"].includes(code) && hasPhone);
        if (resolvedAlready) {
          counters.skippedResolved++;
          return;
        }
        const fieldName = String(d.field_name ?? d.fieldName ?? "").slice(0, 40);
        const dedupeKey = [code, fieldName, relatedPatientId || String(d.related_legacy_id || d.relatedLegacyId || "")].join("|").slice(0, 200);
        const key = `${patientId}|${dedupeKey}`;
        if (toInsert.has(key)) return;
        toInsert.set(key, {
          id: await deterministicId("rvi_", tenantId, patientId, "LEGACY_IMPORT", dedupeKey),
          tenant_id: tenantId,
          patient_id: patientId,
          source: "LEGACY_IMPORT",
          issue_code: code,
          field_name: fieldName,
          severity: ISSUE_SEVERITY[code] || "MEDIUM",
          message: String(d.message || code).slice(0, 500),
          legacy_value: d.legacy_value || d.legacyValue ? String(d.legacy_value || d.legacyValue).slice(0, 120) : null,
          related_patient_id: relatedPatientId,
          dedupe_key: dedupeKey,
          status: "OPEN",
          import_session_id: session_id,
          created_at: nowIso,
          updated_at: nowIso,
        });
      };

      for (const row of rows) {
        const legacyId = String(row.legacy_id || "").trim();
        const patientId = targetByLegacy.get(legacyId);
        if (!patientId) {
          counters.rejected += Array.isArray(row.review_issues) ? row.review_issues.length : 0;
          continue;
        }
        const drafts: any[] = Array.isArray(row.review_issues) ? row.review_issues : [];
        for (const d of drafts) {
          const relLegacy = String(d.related_legacy_id || d.relatedLegacyId || "").trim();
          let related: string | null = null;
          const rp = String(d.related_patient_id || d.relatedPatientId || "").trim();
          if (rp && patientById.has(rp)) related = rp;
          else if (relLegacy && targetByLegacy.has(relLegacy)) related = targetByLegacy.get(relLegacy)!;
          await addIssue(patientId, d, related);
          // Espelho: identidade ambígua com um cadastro relacionado que já existe -> o outro lado também vê.
          if (IDENTITY_CODES.has(String(d.issue_code || d.issueCode || "")) && related && related !== patientId) {
            await addIssue(
              related,
              {
                issue_code: "POSSIBLE_DUPLICATE",
                field_name: "identity",
                message: "Existe um cadastro vindo da migração com dados semelhantes — compare antes de consolidar.",
              },
              patientId
            );
            counters.mirrored++;
          }
        }
      }

      // Pendências geradas pelo servidor durante o commit (ex.: CPF conflitante) chegam como parte do
      // próprio row.review_issues do cliente; nada extra a fazer aqui.

      const inserts = [...toInsert.values()];
      if (inserts.length > 0) {
        const { data: existing } = await adminSupabase
          .from("df_patient_review_issues")
          .select("patient_id, dedupe_key")
          .eq("tenant_id", tenantId)
          .eq("source", "LEGACY_IMPORT")
          .in("patient_id", [...new Set(inserts.map((i) => i.patient_id))]);
        const existingKeys = new Set((existing || []).map((e: any) => `${e.patient_id}|${e.dedupe_key}`));
        const fresh = inserts.filter((i) => !existingKeys.has(`${i.patient_id}|${i.dedupe_key}`));
        counters.alreadyExisting += inserts.length - fresh.length;
        if (fresh.length > 0) {
          const { error: insErr } = await adminSupabase
            .from("df_patient_review_issues")
            .upsert(fresh, { onConflict: "tenant_id,patient_id,source,dedupe_key", ignoreDuplicates: true });
          if (insErr) return json({ success: false, error: `Falha ao gravar pendências: ${insErr.message}` }, 500);
          counters.created += fresh.length;
        }
      }
      return json({ success: true, counters });
    }

    if (action === "confirm_professional_mapping") {
      // ------------------------------------------------------------------
      // Mapeamento DEFINITIVO dentista legado -> profissional atual, decidido pelo usuário
      // (USER_CONFIRMED). Não cria usuário nem profissional: o alvo precisa existir NESTE tenant.
      // O nome legado é preservado (legacy_id + details) para auditoria histórica.
      // ------------------------------------------------------------------
      const entries: any[] = Array.isArray(body.entries) ? body.entries : [];
      if (entries.length === 0 || entries.length > 50) return json({ success: false, error: "Entradas inválidas." }, 400);
      const source = session.source_system as string;
      const nowIso = new Date().toISOString();
      let saved = 0;
      for (const e of entries) {
        const legacyName = String(e.legacy_name || "").trim().replace(/\s+/g, " ");
        const professionalId = String(e.professional_id || "").trim();
        if (!legacyName || !professionalId) return json({ success: false, error: "Nome legado e profissional são obrigatórios." }, 400);
        const { data: prof } = await adminSupabase
          .from("df_professionals")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .eq("id", professionalId)
          .maybeSingle();
        if (!prof) return json({ success: false, error: "Profissional não encontrado nesta clínica." }, 404);

        const { data: current } = await adminSupabase
          .from("df_legacy_import_map")
          .select("id, target_id, status")
          .eq("tenant_id", tenantId)
          .eq("source_system", source)
          .eq("entity_type", "professional")
          .eq("legacy_id", legacyName)
          .maybeSingle();
        if (current) {
          if (current.target_id === professionalId && current.status === "ACTIVE") {
            saved++;
            continue;
          }
          return json({ success: false, error: `Já existe um mapeamento definitivo para "${legacyName}" com outro profissional.` }, 409);
        }
        const aliases = (Array.isArray(e.aliases) ? e.aliases : []).map((a: any) => String(a).trim()).filter(Boolean).slice(0, 10);
        const { error: insErr } = await adminSupabase.from("df_legacy_import_map").insert({
          id: await deterministicId("limap_", tenantId, source, "professional", legacyName),
          tenant_id: tenantId,
          source_system: source,
          entity_type: "professional",
          legacy_id: legacyName,
          legacy_secondary_id: null,
          target_id: professionalId,
          match_kind: "USER_CONFIRMED",
          status: "ACTIVE",
          import_session_id: session_id,
          created_by: effectiveProfile!.id,
          imported_at: nowIso,
          details: {
            decision: "USER_CONFIRMED",
            legacy_professional_name: legacyName,
            aliases,
            professional_name: prof.name,
            confirmed_at: nowIso,
            confirmed_by_name: effectiveProfile!.name,
          },
        });
        if (insErr) return json({ success: false, error: `Falha ao gravar o mapeamento: ${insErr.message}` }, 500);
        saved++;
      }
      return json({ success: true, saved });
    }

    if (action === "commit_records_batch") {
      // Importação de prontuários ainda NÃO homologada: esta fase grava só
      // pacientes/responsáveis/mapa. A etapa clínica será liberada numa tarefa
      // separada, depois da análise do gate de resolução prontuário->paciente.
      return json(
        { success: false, error: "Importação de prontuários ainda não habilitada nesta fase da migração." },
        409
      );
    }

    if (action === "record_batch_error") {
      const entry = {
        at: new Date().toISOString(),
        batch: body.batch ?? null,
        legacy_ids: Array.isArray(body.legacy_ids) ? body.legacy_ids.slice(0, MAX_BATCH_SIZE) : [],
        error: String(body.error || "").slice(0, 2000),
        last_consistent_batch: body.last_consistent_batch ?? null,
      };
      const current = Array.isArray(session.error_log) ? session.error_log : [];
      await touchSession(session_id, { error_log: [...current, entry].slice(-200) });
      return json({ success: true });
    }

    if (action === "finalize_session") {
      const countBy = (matchKind: string) =>
        adminSupabase
          .from("df_legacy_import_map")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("import_session_id", session_id)
          .eq("entity_type", "patient")
          .eq("match_kind", matchKind);
      const [created, createdReview, linkedCpf, linkedStrong] = await Promise.all([
        countBy("CREATED"),
        countBy("CREATED_REVIEW"),
        countBy("LINKED_CPF"),
        countBy("LINKED_STRONG"),
      ]);
      const commitSummary = {
        finalized_at: new Date().toISOString(),
        patients_created: (created.count || 0) + (createdReview.count || 0),
        patients_created_review: createdReview.count || 0,
        patients_linked: (linkedCpf.count || 0) + (linkedStrong.count || 0),
        patients_linked_cpf: linkedCpf.count || 0,
        patients_linked_strong: linkedStrong.count || 0,
        client_report: body.client_summary ?? null,
      };
      await touchSession(session_id, { status: "IMPORT_COMPLETE", commit_summary: commitSummary });
      return json({ success: true, summary: commitSummary });
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
