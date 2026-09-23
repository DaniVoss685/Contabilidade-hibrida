import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ==============================================================================
// dental-whatsapp-attach-document
// Anexa um documento/imagem recebido ou enviado pelo WhatsApp diretamente ao
// prontuário do paciente vinculado ao contato da conversa.
//
// Regras de segurança (não alterar sem revisar CLAUDE.md > PDF preview invariant
// e > WhatsApp attendance model):
// - O frontend NUNCA envia storage_path: apenas message_id + patient_id (+ tenant_id
//   operacional, ver abaixo).
// - O tenant_id enviado pelo cliente é a clínica OPERACIONAL ativa (necessário para
//   Modo Consultoria/SUPER_ADMIN, onde ela pode divergir do clinic_id "de casa" do
//   chamador) — mas NUNCA é aceito sozinho: o servidor sempre valida que o chamador
//   tem um vínculo real com esse tenant (is_primary/SUPER_ADMIN/PLATFORM_ADMIN em
//   qualquer perfil, OU um df_users.clinic_id igual ao tenant_id), buscando TODOS os
//   perfis df_users do auth_user_id — nunca um único .maybeSingle(). Mesmo padrão de
//   dental-whatsapp-api / dental-team-management e do helper de RLS is_dental_tenant_member.
// - Toda leitura de df_wa_messages / df_wa_conversations / df_wa_contacts /
//   df_patients é filtrada por esse tenant validado no servidor.
// - Grupos do WhatsApp nunca podem ser anexados a um prontuário.
// - Idempotência real: índice único (tenant_id, patient_id, source_message_id)
//   garante que cliques repetidos não dupliquem o documento.
// ==============================================================================

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET = "dental-private";

// Espelha src/lib/storageService.ts (ALLOWED_CLINICAL_MIME_TYPES) — manter em sincronia.
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"];

// Espelha src/types/index.ts (ClinicalAttachmentType) — manter em sincronia.
const ALLOWED_DOCUMENT_TYPES = [
  "PHOTO_BEFORE",
  "PHOTO_AFTER",
  "RADIOGRAPHY",
  "EXAM",
  "DOCUMENT",
  "CONSENT_FORM",
  "REPORT",
  "OTHER",
];

// Espelha src/lib/permissions.ts (ROLE_PERMISSIONS para 'patients:manage') — manter em sincronia.
const ROLES_WITHOUT_PATIENT_MANAGE = ["FINANCE"];

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

// Espelha src/lib/phoneUtils.ts (isWhatsAppGroup) — manter em sincronia.
function isWhatsAppGroup(jidOrNumber?: string | null): boolean {
  if (!jidOrNumber) return false;
  const str = String(jidOrNumber).trim();
  if (str.includes("@g.us")) return true;
  const digits = str.replace(/\D/g, "");
  if (digits.startsWith("120363") && digits.length >= 16) return true;
  if (str.includes("-") && digits.length >= 18) return true;
  if (digits.length >= 20) return true;
  return false;
}

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
    if (typeof permissions === "object") {
      if (permissions["patients:manage"] !== undefined) {
        return Boolean(permissions["patients:manage"]);
      }
    }
  }

  return !ROLES_WITHOUT_PATIENT_MANAGE.includes(upperRole);
}

function inferMimeFromFileName(fileName?: string | null): string | null {
  if (!fileName) return null;
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return null;
}

function mapAttachmentRow(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    clinicalRecordId: row.clinical_record_id || undefined,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    attachmentType: row.attachment_type,
    caption: row.caption || undefined,
    date: row.date || undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    source: row.source || undefined,
    sourceMessageId: row.source_message_id || undefined,
    sourceContactId: row.source_contact_id || undefined,
    sourceConversationId: row.source_conversation_id || undefined,
  };
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

    // 2. PARSER DO CORPO
    const body = await req.json().catch(() => ({}));
    const { message_id, patient_id, document_type, description, document_date, tenant_id } = body;

    // 3. RESOLVER TODOS OS PERFIS df_users DO CHAMADOR (nunca apenas um .maybeSingle()).
    // Um usuário em Modo Consultoria pode ter mais de um vínculo em df_users, e a clínica
    // OPERACIONAL (tenant_id enviado pelo frontend a partir de db.getActiveTenantId() /
    // supportSession.targetTenantId) pode divergir do clinic_id "de casa" do chamador.
    // Mesmo padrão oficial de supabase/functions/dental-whatsapp-api e dental-team-management
    // (e do helper de RLS is_dental_tenant_member): validar por is_primary/SUPER_ADMIN/PLATFORM_ADMIN
    // OU por um vínculo real com o tenant solicitado — nunca assumir tenant = df_users.clinic_id.
    const { data: callerRows, error: callerErr } = await adminSupabase
      .from("df_users")
      .select("id, clinic_id, role, permissions, is_primary, is_active, name")
      .eq("auth_user_id", authData.user.id)
      .eq("is_active", true);

    if (callerErr || !callerRows || callerRows.length === 0) {
      return json({ success: false, error: "Usuário chamador não encontrado ou inativo." }, 403);
    }

    const isPlatformAdmin = callerRows.some(
      (u) => u.is_primary || ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(u.role)
    );

    const tenantId = (typeof tenant_id === "string" && tenant_id.trim()) || callerRows[0].clinic_id;
    if (!tenantId) {
      return json({ success: false, error: "tenant_id é obrigatório." }, 400);
    }

    const clinicProfile = callerRows.find((u) => u.clinic_id === tenantId) || null;
    const isClinicMember = Boolean(clinicProfile);

    if (!isClinicMember && !isPlatformAdmin) {
      return json({ success: false, error: "Você não tem acesso a esta clínica." }, 403);
    }

    // Perfil efetivo para checagem de permissão: prioriza o vínculo específico com a clínica
    // operacional (papel/permissões podem ser diferentes por clínica); cai para o perfil de
    // admin de plataforma/consultoria quando o chamador não tem vínculo direto com este tenant.
    const effectiveProfile =
      clinicProfile ||
      callerRows.find((u) => u.is_primary || ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(u.role)) ||
      callerRows[0];

    if (!hasPatientManagePermission(effectiveProfile.role, effectiveProfile.permissions, effectiveProfile.is_primary)) {
      return json(
        { success: false, error: "Você não possui permissão para gerenciar documentos de pacientes." },
        403
      );
    }

    if (!message_id || typeof message_id !== "string") {
      return json({ success: false, error: "message_id é obrigatório." }, 400);
    }
    if (!patient_id || typeof patient_id !== "string") {
      return json({ success: false, error: "patient_id é obrigatório." }, 400);
    }

    const attachmentType = ALLOWED_DOCUMENT_TYPES.includes(document_type) ? document_type : "DOCUMENT";

    // 4. IDEMPOTÊNCIA: se já existe um anexo desta mensagem para este paciente, retorna direto
    const { data: existing } = await adminSupabase
      .from("df_clinical_attachments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("patient_id", patient_id)
      .eq("source_message_id", message_id)
      .maybeSingle();

    if (existing) {
      return json({ success: true, alreadyAttached: true, attachment: mapAttachmentRow(existing) }, 200);
    }

    // 5. RESOLVER A MENSAGEM (escopada estritamente pelo tenant do chamador)
    const { data: message, error: msgErr } = await adminSupabase
      .from("df_wa_messages")
      .select("id, tenant_id, conversation_id, msg_type, media_storage_path, media_mime_type, media_file_name")
      .eq("id", message_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (msgErr || !message) {
      return json({ success: false, error: "Mensagem não encontrada ou não pertence a esta clínica." }, 404);
    }

    if (!["document", "image"].includes(message.msg_type)) {
      return json({ success: false, error: "Apenas documentos e imagens podem ser anexados ao prontuário." }, 400);
    }

    if (!message.media_storage_path) {
      return json(
        { success: false, error: "Este arquivo não possui um caminho de armazenamento seguro para anexar automaticamente." },
        400
      );
    }

    // 6. RESOLVER CONVERSA E CONTATO (mesmo tenant)
    const { data: conversation, error: convErr } = await adminSupabase
      .from("df_wa_conversations")
      .select("id, contact_id")
      .eq("id", message.conversation_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (convErr || !conversation) {
      return json({ success: false, error: "Conversa não encontrada ou não pertence a esta clínica." }, 404);
    }

    const { data: contact, error: contactErr } = await adminSupabase
      .from("df_wa_contacts")
      .select("id, patient_id, whatsapp_number, name")
      .eq("id", conversation.contact_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (contactErr || !contact) {
      return json({ success: false, error: "Contato não encontrado ou não pertence a esta clínica." }, 404);
    }

    // 7. NUNCA ANEXAR MÍDIA DE GRUPO
    if (isWhatsAppGroup(contact.whatsapp_number)) {
      return json({ success: false, error: "Mensagens de grupos do WhatsApp não podem ser anexadas a um prontuário." }, 403);
    }

    // 8. CONTATO PRECISA ESTAR VINCULADO A UM PACIENTE, E DEVE SER O PACIENTE INFORMADO
    if (!contact.patient_id) {
      return json(
        { success: false, error: "Vincule este contato a um paciente para anexar o documento ao prontuário." },
        400
      );
    }
    if (contact.patient_id !== patient_id) {
      return json({ success: false, error: "O paciente informado não corresponde ao contato desta conversa." }, 403);
    }

    // 9. VALIDAR QUE O PACIENTE PERTENCE AO MESMO TENANT (defesa em profundidade)
    const { data: patient, error: patientErr } = await adminSupabase
      .from("df_patients")
      .select("id, name")
      .eq("id", patient_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (patientErr || !patient) {
      return json({ success: false, error: "Paciente não encontrado ou não pertence a esta clínica." }, 404);
    }

    // 10. VALIDAR MIME TYPE
    const resolvedMime = ALLOWED_MIME_TYPES.includes((message.media_mime_type || "").toLowerCase())
      ? message.media_mime_type.toLowerCase()
      : inferMimeFromFileName(message.media_file_name);

    if (!resolvedMime || !ALLOWED_MIME_TYPES.includes(resolvedMime)) {
      return json({ success: false, error: "Tipo de arquivo não suportado para anexo clínico." }, 400);
    }

    // 11. COPIAR O ARQUIVO PARA UM PATH CANÔNICO E INDEPENDENTE DO PRONTUÁRIO
    // (a mensagem original do WhatsApp permanece intacta mesmo se o documento
    // for removido do prontuário depois).
    const ext = resolvedMime === "application/pdf" ? "pdf" : resolvedMime.split("/")[1] || "bin";
    const rawName = (message.media_file_name || `whatsapp_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const safeFileName = rawName.toLowerCase().endsWith(`.${ext}`) ? rawName : `${rawName}.${ext}`;
    const toPath = `${tenantId}/patients/${patient_id}/clinical-records/whatsapp/${Date.now()}_${safeFileName}`;

    const { error: copyErr } = await adminSupabase.storage.from(BUCKET).copy(message.media_storage_path, toPath);
    if (copyErr) {
      return json({ success: false, error: `Erro ao copiar arquivo para o prontuário: ${copyErr.message}` }, 500);
    }

    // Tamanho do arquivo copiado (best-effort; não bloqueia o fluxo se indisponível)
    let sizeBytes = 0;
    try {
      const folder = toPath.substring(0, toPath.lastIndexOf("/"));
      const leafName = toPath.substring(toPath.lastIndexOf("/") + 1);
      const { data: listData } = await adminSupabase.storage.from(BUCKET).list(folder, { search: leafName });
      sizeBytes = Number(listData?.[0]?.metadata?.size || 0);
    } catch (_e) {
      // Não crítico
    }

    // 12. CRIAR O DOCUMENTO NO PRONTUÁRIO (mesma estrutura usada pelo upload manual)
    const newId = `att_wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();
    const insertPayload = {
      id: newId,
      tenant_id: tenantId,
      patient_id,
      clinical_record_id: null,
      storage_path: toPath,
      original_filename: message.media_file_name || safeFileName,
      mime_type: resolvedMime,
      size_bytes: sizeBytes,
      attachment_type: attachmentType,
      caption: (description || "").trim() || null,
      date: document_date || nowIso.split("T")[0],
      created_by: effectiveProfile.id,
      created_at: nowIso,
      source: "whatsapp",
      source_message_id: message_id,
      source_contact_id: contact.id,
      source_conversation_id: conversation.id,
    };

    const { data: inserted, error: insertErr } = await adminSupabase
      .from("df_clinical_attachments")
      .insert(insertPayload)
      .select("*")
      .maybeSingle();

    if (insertErr) {
      // Corrida entre cliques duplos: o índice único pode ter sido violado entre a checagem e o insert.
      if (insertErr.code === "23505") {
        const { data: raceExisting } = await adminSupabase
          .from("df_clinical_attachments")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("patient_id", patient_id)
          .eq("source_message_id", message_id)
          .maybeSingle();
        if (raceExisting) {
          return json({ success: true, alreadyAttached: true, attachment: mapAttachmentRow(raceExisting) }, 200);
        }
      }
      return json({ success: false, error: `Erro ao criar documento no prontuário: ${insertErr.message}` }, 500);
    }

    return json({ success: true, alreadyAttached: false, attachment: mapAttachmentRow(inserted) }, 200);
  } catch (err: any) {
    console.error("[dental-whatsapp-attach-document] Erro:", err);
    return json({ success: false, error: err?.message || "Erro interno no servidor." }, 500);
  }
});
