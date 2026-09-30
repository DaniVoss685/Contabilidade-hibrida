import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Ponto ÚNICO server-side para criar notificações in-app a partir de código de CLIENTE (browser).
// df_notifications não tem policy de INSERT para usuários comuns (só SELECT/UPDATE) — de propósito,
// para que ninguém possa forjar notificações arbitrárias direto do navegador. Esta function valida
// que o chamador é membro ATIVO do tenant alvo e restringe "type" a um allowlist fechado (nunca
// aceita um type livre do body) antes de gravar com service_role.
//
// Uso atual: alerta de "Estoque mínimo atingido" (Fase C — src/lib/supabaseClient.ts,
// createLowStockNotification). Adicionar um novo tipo aqui exige decisão explícita, não é genérico.

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Allowlist fechado — nunca aceitar um "type"/"entity_type" livre vindo do corpo da requisição.
const ALLOWED_NOTIFICATIONS: Record<string, { entityType: string }> = {
  low_stock: { entityType: "clinical_input" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Token de autorização ausente ou inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "").trim();

    const { data: authData, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida ou expirada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { tenant_id, type, title, notification_body, entity_id } = body;

    if (!tenant_id || !type || !title || !notification_body || !entity_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id, type, title, notification_body e entity_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowed = ALLOWED_NOTIFICATIONS[type];
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: `Tipo de notificação "${type}" não é permitido por esta rota.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Autorização: mesmo padrão já estabelecido em outras Edge Functions deste projeto (ex.:
    // dental-whatsapp-attach-document) — resolve TODOS os vínculos df_users do auth_user_id e
    // autoriza se: (a) algum vínculo é is_primary/SUPER_ADMIN/PLATFORM_ADMIN (Modo Consultoria —
    // acesso a QUALQUER clínica), OU (b) algum vínculo é o próprio tenant_id, ativo. Nunca confia
    // isoladamente no tenant_id do body. Bug real corrigido: a primeira versão só checava (b),
    // rejeitando com 403 qualquer chamada feita em Modo Consultoria (conta primária operando uma
    // clínica que não é a sua própria em df_users.clinic_id).
    const { data: callerRows, error: callerErr } = await adminSupabase
      .from("df_users")
      .select("id, clinic_id, role, is_primary, is_active")
      .eq("auth_user_id", authData.user.id);

    if (callerErr || !callerRows || callerRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isAuthorized = callerRows.some(
      (u: any) =>
        u.is_active &&
        (u.is_primary || u.role === "SUPER_ADMIN" || u.role === "PLATFORM_ADMIN" || u.clinic_id === tenant_id)
    );

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Usuário não pertence a este tenant ou está inativo." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const notifId = `notif_${type}_${tenant_id}_${entity_id}_${Date.now()}`;
    const { error: insertErr } = await adminSupabase.from("df_notifications").insert({
      id: notifId,
      tenant_id,
      user_id: null, // broadcast — mesma regra de "fila" já usada nas notificações de WhatsApp
      type,
      title: String(title).slice(0, 200),
      body: String(notification_body).slice(0, 500),
      entity_type: allowed.entityType,
      entity_id,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    if (insertErr) {
      return new Response(
        JSON.stringify({ error: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: notifId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
