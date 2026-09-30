import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

/**
 * Web Push do Dental Finance (canal adicional de uma notificação JÁ persistida em df_notifications).
 *
 * Ações:
 *  - public_key            (JWT de usuário)  -> chave pública VAPID
 *  - save_subscription     (JWT de usuário)  -> registra/atualiza a subscription DO usuário autenticado
 *  - remove_subscription   (JWT de usuário)  -> desativa a subscription do dispositivo
 *  - dispatch              (SOMENTE service_role, chamada pelo webhook) -> envia push de notification_id
 *
 * Segredos: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (Supabase Secrets). Sem fallback em banco.
 */
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(supabaseUrl, serviceKey);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_ATTEMPTS = 2;
const DISABLE_AFTER_FAILURES = 5;
// Espelha can_user_access_whatsapp (SQL) — manter em sincronia.
const WA_ROLES = ["PLATFORM_ADMIN", "OWNER", "ADMIN", "RECEPTION", "ASSISTANT", "DENTIST", "PROFESSIONAL"];

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canAccessWhatsApp(u: any, tenantId: string): boolean {
  if (!u || !u.is_active) return false;
  if (u.is_primary === true || u.role === "SUPER_ADMIN") return true;
  if (u.clinic_id !== tenantId) return false;
  const perms = u.permissions;
  const hasPerm = Array.isArray(perms) ? perms.includes("whatsapp:view") : Boolean(perms && perms["whatsapp:view"]);
  return WA_ROLES.includes(u.role) || hasPerm;
}

async function loadVapid() {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:suporte@dentalfinance.com.br";
  if (!pub || !priv) return null; // sem fallback em banco: segredos SOMENTE via Supabase Secrets
  return { pub: pub!, priv: priv!, subject };
}

async function authUser(token: string) {
  const c = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await c.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/** df_users canônico do usuário para o tenant (mesma regra de resolve_notification_actor_id). */
async function resolveActor(authUserId: string, tenantId: string) {
  const { data: rows } = await admin.from("df_users").select("*").eq("auth_user_id", authUserId).eq("is_active", true);
  const list = rows || [];
  const own = list.find((u: any) => u.clinic_id === tenantId);
  const cross = list.find((u: any) => u.is_primary === true || u.role === "SUPER_ADMIN");
  const actor = own || cross || null;
  return actor && canAccessWhatsApp(actor, tenantId) ? actor : null;
}

function detectPlatform(ua: string) {
  const u = ua || "";
  const platform = /iPhone|iPad|iPod/.test(u) ? "ios" : /Android/.test(u) ? "android" : /Mac/.test(u) ? "macos" : /Windows/.test(u) ? "windows" : "other";
  const browser = /Edg\//.test(u) ? "edge" : /Firefox\//.test(u) ? "firefox" : /Chrome\//.test(u) ? "chrome" : /Safari\//.test(u) ? "safari" : "other";
  return { platform, browser };
}

// Privacidade por padrão (espelha src/lib/pushCapability.ts#buildPushPayload). Sem tokens/segredos.
function buildPayload(o: { contactName?: string; preview?: string; showPreview: boolean; tenantId: string; conversationId?: string; contactId?: string; notificationId: string }) {
  return JSON.stringify({
    title: o.showPreview && o.contactName ? o.contactName : "Nova mensagem no WhatsApp",
    body: o.showPreview && o.preview ? o.preview : "Você recebeu uma nova mensagem.",
    tag: `wa_${o.tenantId}_${o.conversationId || o.contactId || "x"}`,
    data: { notificationId: o.notificationId, tenantId: o.tenantId, conversationId: o.conversationId || "", contactId: o.contactId || "" },
  });
}

async function dispatch(notificationId: string) {
  const { data: notif } = await admin.from("df_notifications").select("*").eq("id", notificationId).maybeSingle();
  if (!notif) return { sent: 0, skipped: "notification_not_found" };
  const vapid = await loadVapid();
  if (!vapid) return { sent: 0, skipped: "vapid_not_configured" };
  webpush.setVapidDetails(vapid.subject, vapid.pub, vapid.priv);

  const tenantId = notif.tenant_id as string;
  const meta = notif.metadata || {};
  // Somente assinaturas com dono identificado (assinaturas legadas sem user_id NÃO recebem broadcast)
  const { data: subs } = await admin
    .from("df_push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id, failure_count")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .not("user_id", "is", null);
  if (!subs?.length) return { sent: 0, skipped: "no_subscriptions" };

  const userIds = [...new Set(subs.map((s: any) => s.user_id))];
  const { data: users } = await admin.from("df_users").select("*").in("id", userIds);
  const userMap = new Map((users || []).map((u: any) => [u.id, u]));
  const { data: settings } = await admin.from("df_user_notification_settings").select("*").eq("tenant_id", tenantId).in("user_id", userIds);
  const settingsMap = new Map((settings || []).map((s: any) => [s.user_id, s]));
  const { data: reads } = await admin.from("df_notification_reads").select("user_id").eq("notification_id", notificationId);
  const readSet = new Set((reads || []).map((r: any) => r.user_id));

  let sent = 0, expired = 0, failed = 0, dup = 0, filtered = 0;
  for (const sub of subs) {
    const u = userMap.get(sub.user_id);
    const st = settingsMap.get(sub.user_id);
    const eligible =
      canAccessWhatsApp(u, tenantId) &&
      (notif.user_id == null || notif.user_id === sub.user_id) && // mesma regra do sino: atribuído a mim ou fila
      !readSet.has(sub.user_id) &&
      st?.browser_notifications_enabled !== false &&
      !(meta.is_group && st?.notify_groups === false);
    if (!eligible) {
      filtered++;
      continue;
    }

    // Idempotência: 1 linha por (notification_id, subscription_id); sem inserir => já tratado
    const { data: claimed } = await admin
      .from("df_push_delivery_log")
      .upsert(
        { tenant_id: tenantId, notification_id: notificationId, subscription_id: sub.id, status: "sending", attempt: 1 },
        { onConflict: "notification_id,subscription_id", ignoreDuplicates: true },
      )
      .select("id");
    if (!claimed || claimed.length === 0) {
      dup++;
      continue;
    }

    const payload = buildPayload({
      contactName: meta.sender_name,
      preview: notif.body,
      showPreview: st?.push_preview_enabled === true,
      tenantId,
      conversationId: meta.conversation_id,
      contactId: meta.contact_id,
      notificationId,
    });
    let attempt = 0;
    let status: "sent" | "expired" | "failed" = "failed";
    let providerStatus: number | null = null;
    let err: string | null = null;
    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        const res = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 3600, urgency: "high" },
        );
        providerStatus = res.statusCode;
        status = "sent";
        err = null;
        break;
      } catch (e: any) {
        providerStatus = e?.statusCode ?? null;
        err = String(e?.body || e?.message || "erro").slice(0, 200); // nunca inclui o endpoint
        if (providerStatus === 404 || providerStatus === 410) {
          status = "expired";
          break;
        }
        if (providerStatus && providerStatus >= 400 && providerStatus < 500 && providerStatus !== 429) break; // erro permanente
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    await admin
      .from("df_push_delivery_log")
      .update({ status, attempt, provider_status: providerStatus, error: err, sent_at: status === "sent" ? new Date().toISOString() : null })
      .eq("notification_id", notificationId)
      .eq("subscription_id", sub.id);
    if (status === "sent") {
      sent++;
      await admin.from("df_push_subscriptions").update({ failure_count: 0, last_seen_at: new Date().toISOString() }).eq("id", sub.id);
    } else if (status === "expired") {
      expired++;
      await admin.from("df_push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
    } else {
      failed++;
      const fc = (sub.failure_count || 0) + 1;
      await admin.from("df_push_subscriptions").update({ failure_count: fc, is_active: fc < DISABLE_AFTER_FAILURES }).eq("id", sub.id);
    }
  }
  return { sent, expired, failed, duplicates: dup, filtered };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Não autorizado" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "dispatch") {
      if (!serviceKey || token !== serviceKey) return json({ error: "Somente service_role" }, 403);
      if (!body.notification_id) return json({ error: "notification_id obrigatório" }, 400);
      return json({ success: true, ...(await dispatch(String(body.notification_id))) });
    }

    const user = await authUser(token);
    if (!user) return json({ error: "Sessão inválida" }, 401);

    if (action === "public_key") {
      const v = await loadVapid();
      return v ? json({ publicKey: v.pub }) : json({ error: "VAPID não configurado" }, 500);
    }

    const tenantId = String(body.tenant_id || "");
    if (!tenantId) return json({ error: "tenant_id obrigatório" }, 400);
    const actor = await resolveActor(user.id, tenantId);
    if (!actor) return json({ error: "Sem acesso ao WhatsApp desta clínica" }, 403);

    if (action === "save_subscription") {
      const s = body.subscription;
      if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return json({ error: "Subscription incompleta" }, 400);
      const hash = await sha256Hex(s.endpoint);
      const ua = String(body.user_agent || "").slice(0, 300);
      const { platform, browser } = detectPlatform(ua);
      // Mesmo endpoint no mesmo tenant => atualiza o DONO (revalida owner); outros dispositivos ficam intactos
      const { data: existing } = await admin.from("df_push_subscriptions").select("id").eq("tenant_id", tenantId).eq("endpoint_hash", hash).maybeSingle();
      const row = {
        tenant_id: tenantId,
        user_id: actor.id,
        endpoint: s.endpoint,
        endpoint_hash: hash,
        p256dh: s.keys.p256dh,
        auth: s.keys.auth,
        user_agent: ua,
        device_label: String(body.device_label || "").slice(0, 80) || null,
        platform,
        browser,
        is_active: true,
        failure_count: 0,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const q = existing
        ? admin.from("df_push_subscriptions").update(row).eq("id", existing.id).select("id").single()
        : admin.from("df_push_subscriptions").insert({ id: `sub_${crypto.randomUUID()}`, ...row }).select("id").single();
      const { data, error } = await q;
      if (error) return json({ error: "Falha ao salvar subscription" }, 500);
      return json({ success: true, id: data.id });
    }

    if (action === "remove_subscription") {
      const endpoint = String(body.endpoint || "");
      if (!endpoint) return json({ error: "endpoint obrigatório" }, 400);
      const hash = await sha256Hex(endpoint);
      // Só desativa a subscription do PRÓPRIO usuário
      await admin
        .from("df_push_subscriptions")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("endpoint_hash", hash)
        .eq("user_id", actor.id);
      return json({ success: true });
    }
    return json({ error: "Ação desconhecida" }, 400);
  } catch (e: any) {
    console.error("[web-push] erro:", String(e?.message || e).slice(0, 200));
    return json({ error: "Erro interno" }, 500);
  }
});
