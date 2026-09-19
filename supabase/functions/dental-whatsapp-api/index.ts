import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Cliente admin Supabase com service_role para ler secrets e validar permissões
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Sanitiza texto para formato de slug seguro (lowercase, sem acentos, apenas a-z, 0-9 e hífens)
 */
function sanitizeSlug(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Gera nome único e padronizado: dental-finance-{slug-clinica}-{sufixo-estavel}
 */
function generateInstanceName(clinicName: string, tenantId: string): string {
  const slug = sanitizeSlug(clinicName) || "clinica";
  const parts = tenantId.split("_");
  const suffix = sanitizeSlug(parts[parts.length - 1] || tenantId.slice(-6));
  return `dental-finance-${slug}-${suffix}`;
}

/**
 * Normaliza números brasileiros de telefone com o 9º dígito
 */
function normalizeBrazilianNumber(number: string): string {
  if (!number) return '';
  const clean = number.replace(/\D/g, '');
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    const ddd = clean.substring(2, 4);
    let local = clean.substring(4);
    if (clean.length === 12) {
      const first = local[0];
      if (['6', '7', '8', '9'].includes(first)) {
        return `55${ddd}9${local}`;
      }
    }
    return clean;
  }
  if (clean.length === 10 || clean.length === 11) {
    const ddd = clean.substring(0, 2);
    let local = clean.substring(2);
    if (local.length === 8 && ['6', '7', '8', '9'].includes(local[0])) {
      local = `9${local}`;
    }
    return `55${ddd}${local}`;
  }
  return clean;
}

/**
 * Helper para identificar se um nome cadastrado é na verdade apenas um
 * placeholder baseado no número de telefone (seja numérico puro ou formatado).
 */
function isPhoneLikeContactName(name?: string | null, whatsappNumber?: string | null): boolean {
  if (!name || !name.trim()) return true;
  const cleanName = name.trim();
  const digitsOnlyName = cleanName.replace(/\D/g, '');

  const hasLetters = /\p{L}/u.test(cleanName);
  if (!hasLetters && digitsOnlyName.length >= 8) {
    return true;
  }

  if (whatsappNumber) {
    const digitsOnlyTarget = whatsappNumber.replace(/\D/g, '');
    if (digitsOnlyName === digitsOnlyTarget) return true;
    if (digitsOnlyName.length >= 8 && digitsOnlyTarget.length >= 8) {
      if (digitsOnlyName.endsWith(digitsOnlyTarget.slice(-8)) || digitsOnlyTarget.endsWith(digitsOnlyName.slice(-8))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Identifica se um identificador ou número representa um Grupo do WhatsApp.
 */
function isWhatsAppGroup(jidOrNumber?: string | null): boolean {
  if (!jidOrNumber) return false;
  const str = jidOrNumber.trim();
  if (str.includes('@g.us')) return true;
  const digits = str.replace(/\D/g, '');
  if (digits.startsWith('120363') && digits.length >= 16) return true;
  if (str.includes('-') && digits.length >= 18) return true;
  if (digits.length >= 20) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. VALIDAR AUTORIZAÇÃO (JWT DO USUÁRIO OU SERVICE ROLE INTERNO)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Token de autorização ausente ou inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const isServiceRole = Boolean(
      (supabaseServiceKey && token === supabaseServiceKey) ||
      token === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia291dXZ1cGR5ZmZpendvaXRpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTI5MjY0NSwiZXhwIjoyMDcwODY4NjQ1fQ.aB-tTaBKyC_wFAPOeBga8mqEiyxCeCoNuEtUwHdZxPk"
    );

    // PARSER DO CORPO DA REQUISIÇÃO
    const body = await req.json().catch(() => ({}));
    const { action, tenant_id } = body;

    // AÇÃO: OBTER CHAVE PÚBLICA VAPID (CHAVE PÚBLICA É SEGURA PARA CLIENT-SIDE)
    if (action === "get_vapid_public_key") {
      const { data: vapidRow, error: vapidErr } = await adminSupabase
        .from("df_vapid_secrets")
        .select("public_key")
        .eq("id", "default")
        .maybeSingle();

      if (vapidErr || !vapidRow) {
        return new Response(
          JSON.stringify({ error: "Chaves VAPID não configuradas no servidor." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, publicKey: vapidRow.public_key }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let authUserId: string | null = null;
    let userProfiles: any[] = [];
    let isPlatformAdmin = false;

    if (isServiceRole) {
      isPlatformAdmin = true;
    } else {
      const { data: authData, error: authError } = await adminSupabase.auth.getUser(token);
      if (authError || !authData?.user) {
        return new Response(
          JSON.stringify({ error: "Sessão inválida ou expirada" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      authUserId = authData.user.id;

      // VALIDAR IDENTIDADE E PERFIS DO USUÁRIO EM df_users
      const { data: profiles, error: userError } = await adminSupabase
        .from("df_users")
        .select("id, clinic_id, role, is_primary, is_active")
        .eq("auth_user_id", authUserId)
        .eq("is_active", true);

      if (userError || !profiles || profiles.length === 0) {
        return new Response(
          JSON.stringify({ error: "Usuário não encontrado no sistema Dental Finance ou cadastro inativo." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userProfiles = profiles;
      isPlatformAdmin = Boolean(
        userProfiles.find((u) => u.is_primary || ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(u.role))
      );
    }

    const platformAdminProfile =
      userProfiles.find((u) => u.is_primary || ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(u.role)) ||
      userProfiles[0] ||
      null;
    const tenantId = tenant_id || userProfiles[0]?.clinic_id;

    // =========================================================================
    // AÇÕES GLOBAIS DA PLATAFORMA / UTILITÁRIAS
    // =========================================================================

    // AÇÃO: SALVAR CONFIGURAÇÃO GLOBAL
    if (action === "save_global_config") {
      if (!isPlatformAdmin) {
        return new Response(
          JSON.stringify({ error: "Acesso negado: apenas administradores da plataforma podem configurar a Evolution API global." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { api_url, api_key } = body;
      if (!api_url) {
        return new Response(
          JSON.stringify({ error: "URL da Evolution API é obrigatória." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanUrl = api_url.trim().replace(/\/$/, "");

      const { data: existingGlobal } = await adminSupabase
        .from("df_wa_global_config")
        .select("has_api_key")
        .eq("id", "global")
        .maybeSingle();

      const hasKey = Boolean(api_key ? api_key.trim() : existingGlobal?.has_api_key);

      await adminSupabase.from("df_wa_global_config").upsert({
        id: "global",
        api_url: cleanUrl,
        has_api_key: hasKey,
        updated_at: new Date().toISOString(),
        updated_by: platformAdminProfile!.id,
      });

      if (api_key && api_key.trim()) {
        await adminSupabase.from("df_wa_global_secrets").upsert({
          id: "global",
          api_key: api_key.trim(),
          updated_at: new Date().toISOString(),
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          configured: true,
          message: "Configuração global salva com sucesso.",
          api_url: cleanUrl,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // AÇÃO: CONSULTAR CONFIGURAÇÃO GLOBAL
    if (action === "get_global_config") {
      if (!isPlatformAdmin) {
        return new Response(
          JSON.stringify({ error: "Acesso restrito a administradores da plataforma." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: gConfig } = await adminSupabase
        .from("df_wa_global_config")
        .select("api_url, has_api_key, updated_at")
        .eq("id", "global")
        .maybeSingle();

      return new Response(
        JSON.stringify({
          api_url: gConfig?.api_url || "",
          has_api_key: Boolean(gConfig?.has_api_key),
          updated_at: gConfig?.updated_at || null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // AÇÃO: TESTAR CONEXÃO GLOBAL (Backend Dental Finance -> Evolution API)
    if (action === "test_global_config") {
      if (!isPlatformAdmin) {
        return new Response(
          JSON.stringify({ error: "Acesso negado." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { api_url, api_key } = body;

      let targetUrl = api_url ? api_url.trim().replace(/\/$/, "") : "";
      let targetKey = api_key ? api_key.trim() : "";

      if (!targetUrl) {
        const { data: gConfig } = await adminSupabase
          .from("df_wa_global_config")
          .select("api_url")
          .eq("id", "global")
          .maybeSingle();
        targetUrl = gConfig?.api_url?.replace(/\/$/, "") || "";
      }

      if (!targetKey) {
        const { data: gSecret } = await adminSupabase
          .from("df_wa_global_secrets")
          .select("api_key")
          .eq("id", "global")
          .maybeSingle();
        targetKey = gSecret?.api_key || "";
      }

      if (!targetUrl) {
        return new Response(
          JSON.stringify({ success: false, message: "URL da Evolution API não informada." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!targetKey) {
        return new Response(
          JSON.stringify({ success: false, message: "API Key Global não configurada." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const testRes = await fetch(`${targetUrl}/instance/fetchInstances`, {
          method: "GET",
          headers: { apikey: targetKey },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (testRes.ok) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "Conexão com a Evolution API realizada com sucesso!",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (testRes.status === 401 || testRes.status === 403) {
          return new Response(
            JSON.stringify({
              success: false,
              message: "A Evolution API rejeitou a autenticação. Verifique se a API Key Global está correta.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: false,
            message: `A Evolution API retornou status HTTP ${testRes.status}.`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        const isTimeout = err?.name === "AbortError";
        return new Response(
          JSON.stringify({
            success: false,
            message: isTimeout
              ? "Tempo limite esgotado ao tentar alcançar o servidor Evolution API (Timeout 10s)."
              : "Não foi possível conectar ao servidor Evolution API. Verifique a URL informada.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // =========================================================================
    // AÇÕES DE CLÍNICA (Exigem tenant_id)
    // =========================================================================
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: "tenant_id é obrigatório para esta operação." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se a chamada é service_role ou se o usuário autenticado é membro real da clínica
    const isClinicMember = isServiceRole || userProfiles.some((u) => u.clinic_id === tenantId);

    // Classificação estrita de ações:
    const PROVISIONING_ACTIONS = ["create_instance", "connect_instance", "get_status", "disconnect"];
    const OPERATIONAL_ACTIONS = ["send_text", "send_media", "send_reaction", "fetch_profile_pic", "sync_profile_pic", "sync_contacts_names"];
    const NOTIFICATION_ACTIONS = ["save_push_subscription", "remove_push_subscription", "send_push_notification"];

    if (PROVISIONING_ACTIONS.includes(action)) {
      // Provisionamento técnico: permitido para membro da clínica OU administrador da plataforma
      if (!isClinicMember && !isPlatformAdmin) {
        return new Response(
          JSON.stringify({ error: "Acesso negado: você não tem permissão para gerenciar a instância desta clínica." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (OPERATIONAL_ACTIONS.includes(action)) {
      // Atendimento operacional: permitido para membros ativos da clínica OU administradores da plataforma
      if (!isClinicMember && !isPlatformAdmin) {
        return new Response(
          JSON.stringify({
            code: "FORBIDDEN_CLINIC_ACCESS",
            error: "Acesso negado: operações de atendimento e mensagens são exclusivas para membros ativos da equipe desta clínica ou administradores da plataforma.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (NOTIFICATION_ACTIONS.includes(action)) {
      // Notificações e Web Push: permitido para membros ativos da clínica OU administradores da plataforma
      if (!isClinicMember && !isPlatformAdmin) {
        return new Response(
          JSON.stringify({ error: "Acesso negado às notificações desta clínica." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Ação desconhecida
      return new Response(
        JSON.stringify({ error: `Ação não reconhecida: ${action}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // EXECUÇÃO DAS AÇÕES DE NOTIFICAÇÕES E WEB PUSH (Não dependem de instância WhatsApp)
    // =========================================================================

    // AÇÃO: SALVAR SUBSCRIPTION DE WEB PUSH
    if (action === "save_push_subscription") {
      const { subscription, user_id, user_agent, device_label } = body;
      if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return new Response(
          JSON.stringify({ error: "Dados de subscription incompletos." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const effectiveUserId = user_id || authUserId || null;
      const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const { data: savedSub, error: subErr } = await adminSupabase
        .from("df_push_subscriptions")
        .upsert(
          {
            id: subId,
            tenant_id: tenantId,
            user_id: effectiveUserId,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            user_agent: user_agent || null,
            device_label: device_label || null,
            is_active: true,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,endpoint" }
        )
        .select()
        .single();

      if (subErr) {
        console.error("[Dental WhatsApp API] Erro ao salvar push subscription:", subErr);
        return new Response(
          JSON.stringify({ error: `Erro ao salvar subscription: ${subErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, subscription: savedSub }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // AÇÃO: REMOVER SUBSCRIPTION DE WEB PUSH
    if (action === "remove_push_subscription") {
      const { endpoint } = body;
      if (!endpoint) {
        return new Response(
          JSON.stringify({ error: "Endpoint obrigatório para desativação." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await adminSupabase
        .from("df_push_subscriptions")
        .update({ is_active: false, last_used_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("endpoint", endpoint);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // AÇÃO: DISPARAR PUSH NOTIFICATION (Assíncrono ou sob demanda)
    if (action === "send_push_notification") {
      const { title, body: notifBody, icon, badge, data: notifData, tag, user_id } = body;

      const { data: vapidRow, error: vapidErr } = await adminSupabase
        .from("df_vapid_secrets")
        .select("public_key, private_key, subject")
        .eq("id", "default")
        .maybeSingle();

      if (vapidErr || !vapidRow) {
        return new Response(
          JSON.stringify({ error: "Segredos VAPID não configurados." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      webpush.setVapidDetails(
        vapidRow.subject || "mailto:suporte@dentalfinance.com.br",
        vapidRow.public_key,
        vapidRow.private_key
      );

      // Buscar subscriptions ativas
      let subQuery = adminSupabase
        .from("df_push_subscriptions")
        .select("id, endpoint, p256dh, auth, user_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      if (user_id) {
        subQuery = subQuery.or(`user_id.eq.${user_id},user_id.is.null`);
      }

      const { data: subs, error: queryErr } = await subQuery;

      if (queryErr) {
        console.error("[Dental WhatsApp API] Erro ao consultar subscriptions:", queryErr);
        return new Response(
          JSON.stringify({ error: queryErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let sentCount = 0;
      let expiredCount = 0;
      const pushPayload = JSON.stringify({
        title: title || "Dental Finance",
        body: notifBody || "Nova mensagem recebida",
        icon: icon || "/icon-192.png",
        badge: badge || "/favicon-32x32.png",
        data: notifData || {},
        tag: tag || `wa_${tenantId}_${notifData?.conversationId || ""}`,
      });

      if (subs && subs.length > 0) {
        await Promise.allSettled(
          subs.map(async (sub) => {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                  },
                },
                pushPayload
              );
              sentCount++;
            } catch (pErr: any) {
              if (pErr.statusCode === 404 || pErr.statusCode === 410) {
                expiredCount++;
                await adminSupabase
                  .from("df_push_subscriptions")
                  .update({ is_active: false, last_used_at: new Date().toISOString() })
                  .eq("id", sub.id);
              } else {
                console.warn(`[Dental WhatsApp API] Falha push para sub ${sub.id}:`, pErr.message);
              }
            }
          })
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          sentCount,
          expiredCount,
          totalEligible: (subs || []).length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO: ONBOARDING / CRIAÇÃO AUTOMÁTICA DA INSTÂNCIA POR CLÍNICA
    // =========================================================================
    if (action === "create_instance" || action === "connect_instance") {
      // 1. Carregar configuração global da Evolution API
      const { data: gConfig } = await adminSupabase
        .from("df_wa_global_config")
        .select("api_url, has_api_key")
        .eq("id", "global")
        .maybeSingle();

      const { data: gSecret } = await adminSupabase
        .from("df_wa_global_secrets")
        .select("api_key")
        .eq("id", "global")
        .maybeSingle();

      if (!gConfig?.api_url || !gSecret?.api_key) {
        return new Response(
          JSON.stringify({
            error: "A Evolution API ainda não foi configurada pelo administrador da plataforma. Entre em contato com o suporte.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const evoBaseUrl = gConfig.api_url.replace(/\/$/, "");
      const evoGlobalKey = gSecret.api_key;

      // 2. Verificar se a clínica já possui instância cadastrada (Idempotência: 1 tenant = 1 instância)
      const { data: existingInst } = await adminSupabase
        .from("df_wa_instances")
        .select("id, instance_name, status, qrcode, phone_number, profile_name")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (existingInst) {
        // Se já existe e está conectada
        if (existingInst.status === "connected") {
          try {
            const stateRes = await fetch(
              `${evoBaseUrl}/instance/connectionState/${encodeURIComponent(existingInst.instance_name)}`,
              { method: "GET", headers: { apikey: evoGlobalKey } }
            );
            if (stateRes.ok) {
              const stateData = await stateRes.json();
              const realState = stateData?.instance?.state || stateData?.state;
              if (realState === "open") {
                return new Response(
                  JSON.stringify({
                    success: true,
                    status: "connected",
                    instance_name: existingInst.instance_name,
                    phone_number: existingInst.phone_number,
                    profile_name: existingInst.profile_name,
                    message: "WhatsApp já está conectado e pronto para uso.",
                  }),
                  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
            }
          } catch (_e) {
            // Seguir para tentar obter novo QR
          }
        }

        // Tentar obter QR Code da instância já existente
        try {
          const connectRes = await fetch(
            `${evoBaseUrl}/instance/connect/${encodeURIComponent(existingInst.instance_name)}`,
            { method: "GET", headers: { apikey: evoGlobalKey } }
          );
          if (connectRes.ok) {
            const connData = await connectRes.json();
            const qr = connData?.base64 || connData?.qrcode?.base64 || connData?.qrcode;
            if (qr) {
              const fullQr = qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
              await adminSupabase
                .from("df_wa_instances")
                .update({ status: "qrcode", qrcode: fullQr, updated_at: new Date().toISOString() })
                .eq("id", existingInst.id);

              return new Response(
                JSON.stringify({
                  success: true,
                  status: "qrcode",
                  instance_name: existingInst.instance_name,
                  qrcode: fullQr,
                  message: "Escaneie o QR Code no seu aplicativo do WhatsApp.",
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        } catch (err: any) {
          console.warn("[Dental WhatsApp] Erro ao reconectar instância existente:", err.message);
        }
      }

      // 3. NÃO EXISTE INSTÂNCIA: Criar nova instância exclusiva para a clínica
      // Carregar nome canônico da clínica
      const { data: profData } = await adminSupabase
        .from("df_professionals")
        .select("nome_fantasia, razao_social, name")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      const { data: tenantData } = await adminSupabase
        .from("df_tenants")
        .select("name, trade_name")
        .eq("id", tenantId)
        .maybeSingle();

      const clinicDisplayName =
        profData?.nome_fantasia ||
        profData?.razao_social ||
        tenantData?.trade_name ||
        tenantData?.name ||
        "clinica";

      const instanceName = generateInstanceName(clinicDisplayName, tenantId);

      // 3.1 Criar instância na Evolution API
      const createRes = await fetch(`${evoBaseUrl}/instance/create`, {
        method: "POST",
        headers: {
          apikey: evoGlobalKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });

      if (!createRes.ok && createRes.status !== 403) {
        const errText = await createRes.text();
        console.error(`[Dental WhatsApp] Erro ao criar instância na Evolution (${createRes.status}):`, errText);
      }

      // 3.2 Gerar Webhook Secret forte server-side
      const webhookSecret = `whsec_${crypto.randomUUID().replace(/-/g, "")}`;
      const webhookUrl = `${supabaseUrl}/functions/v1/dental-whatsapp-webhook`;

      // 3.3 Configurar Webhook exclusivo na Evolution API
      const webhookPayload = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          headers: {
            "x-webhook-token": webhookSecret,
          },
          byEvents: false,
          base64: false,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "MESSAGES_DELETE",
            "SEND_MESSAGE",
            "CONNECTION_UPDATE",
            "CALL",
            "QRCODE_UPDATED",
          ],
        },
      };

      await fetch(`${evoBaseUrl}/webhook/set/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: {
          apikey: evoGlobalKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(webhookPayload),
      });

      // 3.4 Solicitar QR Code para conexão
      let qrCodeFinal: string | null = null;
      try {
        const qrRes = await fetch(`${evoBaseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
          method: "GET",
          headers: { apikey: evoGlobalKey },
        });

        if (qrRes.ok) {
          const qrData = await qrRes.json();
          const qrRaw = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.qrcode;
          if (qrRaw) {
            qrCodeFinal = qrRaw.startsWith("data:") ? qrRaw : `data:image/png;base64,${qrRaw}`;
          }
        }
      } catch (qrErr: any) {
        console.warn("[Dental WhatsApp] Erro ao obter QR:", qrErr.message);
      }

      const instId = `inst_${instanceName}`;

      // 3.5 Persistir dados não sensíveis em df_wa_instances
      await adminSupabase.from("df_wa_instances").upsert({
        id: instId,
        tenant_id: tenantId,
        instance_name: instanceName,
        api_url: evoBaseUrl,
        webhook_url: webhookUrl,
        has_api_key: true,
        has_webhook_secret: true,
        status: qrCodeFinal ? "qrcode" : "connecting",
        qrcode: qrCodeFinal,
        updated_at: new Date().toISOString(),
      });

      // 3.6 Persistir segredos administrativos exclusivamente no cofre df_wa_instance_secrets
      await adminSupabase.from("df_wa_instance_secrets").upsert({
        instance_id: instId,
        tenant_id: tenantId,
        api_key: evoGlobalKey,
        webhook_secret: webhookSecret,
        updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({
          success: true,
          instance_name: instanceName,
          status: qrCodeFinal ? "qrcode" : "connecting",
          qrcode: qrCodeFinal,
          message: "Instância criada com sucesso. Escaneie o QR Code com seu WhatsApp.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // RESOLVER INSTÂNCIA DA CLÍNICA PARA AS DEMAIS OPERAÇÕES
    // =========================================================================
    const { data: instanceRow, error: instLoadErr } = await adminSupabase
      .from("df_wa_instances")
      .select("id, api_url, instance_name, status, qrcode, phone_number, profile_name")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // AÇÃO: CONSULTAR STATUS DA INSTÂNCIA
    if (action === "get_status") {
      if (!instanceRow) {
        return new Response(
          JSON.stringify({ exists: false, status: "not_configured" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let currentStatus = instanceRow.status;
      let currentPhone = instanceRow.phone_number;
      let currentProfile = instanceRow.profile_name;
      let currentQr = instanceRow.qrcode;

      const { data: secretRow } = await adminSupabase
        .from("df_wa_instance_secrets")
        .select("api_key")
        .eq("instance_id", instanceRow.id)
        .maybeSingle();

      const evoKey = secretRow?.api_key;
      const evoUrl = instanceRow.api_url?.replace(/\/$/, "");

      if (evoKey && evoUrl) {
        try {
          const stateRes = await fetch(
            `${evoUrl}/instance/connectionState/${encodeURIComponent(instanceRow.instance_name)}`,
            { method: "GET", headers: { apikey: evoKey } }
          );
          if (stateRes.ok) {
            const data = await stateRes.json();
            const state = data?.instance?.state || data?.state;
            currentStatus = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
            if (currentStatus !== instanceRow.status) {
              await adminSupabase
                .from("df_wa_instances")
                .update({ status: currentStatus, updated_at: new Date().toISOString() })
                .eq("id", instanceRow.id);
            }
          }
        } catch (_e) {
          // Manter status anterior
        }
      }

      return new Response(
        JSON.stringify({
          exists: true,
          status: currentStatus,
          instance_name: instanceRow.instance_name,
          phone_number: currentPhone,
          profile_name: currentProfile,
          qrcode: currentStatus === "qrcode" ? currentQr : null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // AÇÃO: DESCONECTAR / LOGOUT
    if (action === "disconnect") {
      if (!instanceRow) {
        return new Response(
          JSON.stringify({ error: "Nenhuma instância configurada para esta clínica." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: secretRow } = await adminSupabase
        .from("df_wa_instance_secrets")
        .select("api_key")
        .eq("instance_id", instanceRow.id)
        .maybeSingle();

      const evoKey = secretRow?.api_key;
      const evoUrl = instanceRow.api_url?.replace(/\/$/, "");

      if (evoKey && evoUrl) {
        try {
          await fetch(`${evoUrl}/instance/logout/${encodeURIComponent(instanceRow.instance_name)}`, {
            method: "DELETE",
            headers: { apikey: evoKey },
          });
        } catch (_e) {
          // Silencioso
        }
      }

      await adminSupabase
        .from("df_wa_instances")
        .update({
          status: "disconnected",
          qrcode: null,
          phone_number: null,
          profile_name: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", instanceRow.id);

      return new Response(
        JSON.stringify({ success: true, status: "disconnected", message: "WhatsApp desconectado com sucesso." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (instLoadErr || !instanceRow) {
      console.warn(`[Dental WhatsApp API] Instância não encontrada para tenant_id=${tenantId}`);
      return new Response(
        JSON.stringify({
          code: "WHATSAPP_INSTANCE_NOT_FOUND",
          error: "Instância de WhatsApp não configurada para esta clínica.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Carregar segredo server-side
    const { data: secretRow, error: secLoadErr } = await adminSupabase
      .from("df_wa_instance_secrets")
      .select("api_key, webhook_secret")
      .eq("instance_id", instanceRow.id)
      .maybeSingle();

    if (secLoadErr || !secretRow?.api_key) {
      return new Response(
        JSON.stringify({ error: "Chave da Evolution API não configurada no cofre do servidor." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const evoBaseUrl = instanceRow.api_url.replace(/\/$/, "");
    const evoApiKey = secretRow.api_key;
    const instanceName = instanceRow.instance_name;

    // =========================================================================
    // AÇÃO: ENVIAR MENSAGEM DE TEXTO
    // =========================================================================
    if (action === "send_text") {
      const { recipient_number, text, quoted } = body;
      if (!recipient_number || !text) {
        return new Response(
          JSON.stringify({ code: "BAD_REQUEST", error: "recipient_number e text são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const maskedPhone = recipient_number.length > 6
        ? `${recipient_number.slice(0, 4)}****${recipient_number.slice(-2)}`
        : recipient_number;
      console.log(`[Dental WhatsApp API] Outbound send_text: tenant=${tenantId}, instance=${instanceName}, recipient=${maskedPhone}`);

      const targetUrl = `${evoBaseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
      const payload: any = {
        number: recipient_number,
        text,
        delay: 1000,
        linkPreview: true,
      };

      if (quoted) {
        payload.quoted = quoted;
      }

      const evoRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          apikey: evoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!evoRes.ok) {
        const errText = await evoRes.text();
        console.error(`[Dental WhatsApp API] Erro Evolution (${evoRes.status}) em send_text: tenant=${tenantId}, instance=${instanceName}, err=${errText.slice(0, 200)}`);
        return new Response(
          JSON.stringify({
            success: false,
            code: "EVOLUTION_SEND_FAILED",
            error: `Falha no envio Evolution (${evoRes.status}): ${errText.slice(0, 150)}`,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const evoData = await evoRes.json();
      const evolutionMsgId = evoData?.key?.id || evoData?.messageId;
      console.log(`[Dental WhatsApp API] Sucesso send_text: tenant=${tenantId}, instance=${instanceName}, evolutionMsgId=${evolutionMsgId}`);

      return new Response(
        JSON.stringify({ success: true, messageId: evolutionMsgId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO: ENVIAR MÍDIA (Imagem, Vídeo, Documento, Áudio PTT ou Figurinha)
    // =========================================================================
    if (action === "send_media") {
      const { recipient_number, media_type, base64, media_url, mime_type, file_name, caption } = body;
      const mediaPayload = media_url || base64;
      if (!recipient_number || !mediaPayload) {
        return new Response(
          JSON.stringify({ code: "BAD_REQUEST", error: "recipient_number e base64 ou media_url são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const maskedPhone = recipient_number.length > 6
        ? `${recipient_number.slice(0, 4)}****${recipient_number.slice(-2)}`
        : recipient_number;
      console.log(`[Dental WhatsApp API] Outbound send_media (${media_type}): tenant=${tenantId}, instance=${instanceName}, recipient=${maskedPhone}`);

      let targetUrl = `${evoBaseUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`;
      let payload: any = {};

      if (media_type === "audio") {
        targetUrl = `${evoBaseUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`;
        payload = {
          number: recipient_number,
          audio: mediaPayload,
          delay: 1200,
        };
      } else if (media_type === "sticker") {
        targetUrl = `${evoBaseUrl}/message/sendSticker/${encodeURIComponent(instanceName)}`;
        payload = {
          number: recipient_number,
          sticker: mediaPayload,
          delay: 1200,
        };
      } else {
        payload = {
          number: recipient_number,
          mediatype: media_type || "document",
          mimetype: mime_type || "application/octet-stream",
          caption: caption || "",
          media: mediaPayload,
          fileName: file_name || "arquivo",
          delay: 1200,
        };
      }

      const evoRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          apikey: evoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!evoRes.ok) {
        const errText = await evoRes.text();
        console.error(`[Dental WhatsApp API] Erro Evolution (${evoRes.status}) em send_media: tenant=${tenantId}, instance=${instanceName}, err=${errText.slice(0, 200)}`);
        return new Response(
          JSON.stringify({
            success: false,
            code: "EVOLUTION_SEND_FAILED",
            error: `Falha no envio de mídia Evolution (${evoRes.status}): ${errText.slice(0, 150)}`,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const evoData = await evoRes.json();
      const evolutionMsgId = evoData?.key?.id || evoData?.messageId;
      console.log(`[Dental WhatsApp API] Sucesso send_media: tenant=${tenantId}, instance=${instanceName}, evolutionMsgId=${evolutionMsgId}`);

      return new Response(
        JSON.stringify({ success: true, messageId: evolutionMsgId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO: ENVIAR REAÇÃO A MENSAGEM (Emoji discreto)
    // =========================================================================
    if (action === "send_reaction") {
      const {
        recipient_number,
        evolution_msg_id,
        emoji,
        from_me,
        target_from_me,
        remote_jid,
        message_id,
      } = body;

      let finalRemoteJid = remote_jid;
      let finalFromMe = target_from_me !== undefined ? target_from_me : from_me;
      let finalEvoId = evolution_msg_id;

      // Resolução inteligente da mensagem no banco local se algum dado estiver ausente
      if (!finalRemoteJid || finalFromMe === undefined || !finalEvoId) {
        let query = adminSupabase
          .from("df_wa_messages")
          .select("remote_jid, from_me, evolution_msg_id")
          .eq("tenant_id", tenantId);

        if (message_id) {
          query = query.eq("id", message_id);
        } else if (evolution_msg_id) {
          query = query.eq("evolution_msg_id", evolution_msg_id);
        }

        const { data: dbMsg } = await query.maybeSingle();
        if (dbMsg) {
          if (!finalRemoteJid && dbMsg.remote_jid) finalRemoteJid = dbMsg.remote_jid;
          if (finalFromMe === undefined && dbMsg.from_me !== undefined) finalFromMe = dbMsg.from_me;
          if (!finalEvoId && dbMsg.evolution_msg_id) finalEvoId = dbMsg.evolution_msg_id;
        }
      }

      if (!finalRemoteJid && recipient_number) {
        const cleanNum = recipient_number.replace(/\D/g, "");
        finalRemoteJid = `${cleanNum}@s.whatsapp.net`;
      }

      if (!finalRemoteJid || !finalEvoId) {
        return new Response(
          JSON.stringify({ error: "Identificador da mensagem e JID de destino são obrigatórios para reagir." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const targetUrl = `${evoBaseUrl}/message/sendReaction/${encodeURIComponent(instanceName)}`;
      const payload = {
        key: {
          id: finalEvoId,
          remoteJid: finalRemoteJid,
          fromMe: Boolean(finalFromMe),
        },
        reaction: emoji || "",
      };

      const evoRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          apikey: evoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!evoRes.ok) {
        const errText = await evoRes.text();
        return new Response(
          JSON.stringify({ success: false, error: `Falha no envio de reação: ${errText.slice(0, 150)}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO: BUSCAR E SINCRONIZAR FOTO DE PERFIL (Server-Side seguro sem CORS)
    // =========================================================================
    if (action === "fetch_profile_pic" || action === "sync_profile_pic") {
      const { number, contact_id } = body;
      if (!number) {
        return new Response(
          JSON.stringify({ error: "number é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clean = number.replace(/\D/g, "");
      const candidates: string[] = [clean];
      if (clean.startsWith("55") && clean.length === 13) {
        const ddd = clean.substring(2, 4);
        candidates.push("55" + ddd + clean.substring(5));
      } else if (clean.startsWith("55") && clean.length === 12) {
        const ddd = clean.substring(2, 4);
        candidates.push("55" + ddd + "9" + clean.substring(4));
      }

      const targetUrl = `${evoBaseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName)}`;
      let rawPicUrl: string | null = null;

      for (const cand of candidates) {
        try {
          const evoRes = await fetch(targetUrl, {
            method: "POST",
            headers: {
              apikey: evoApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ number: cand }),
          });

          if (evoRes.ok) {
            const data = await evoRes.json();
            if (data?.profilePictureUrl) {
              rawPicUrl = data.profilePictureUrl;
              break;
            }
          }
        } catch (_e) {
          // Tentar próximo candidato
        }
      }

      const now = new Date().toISOString();

      if (rawPicUrl) {
        try {
          // Download server-side direto do WhatsApp CDN (sem bloqueio CORS)
          const imgRes = await fetch(rawPicUrl);
          if (imgRes.ok) {
            const arrayBuffer = await imgRes.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const targetId = contact_id || clean;
            const storagePath = `${tenantId}/whatsapp/avatars/${targetId}.jpg`;

            // Upload atômico para storage privado dental-private
            const { error: upErr } = await adminSupabase.storage
              .from("dental-private")
              .upload(storagePath, bytes, {
                contentType: "image/jpeg",
                upsert: true,
              });

            if (!upErr) {
              const { data: signedData } = await adminSupabase.storage
                .from("dental-private")
                .createSignedUrl(storagePath, 86400 * 7); // 7 dias

              const signedUrl = signedData?.signedUrl || rawPicUrl;

              if (contact_id) {
                await adminSupabase
                  .from("df_wa_contacts")
                  .update({
                    profile_pic_storage_path: storagePath,
                    profile_pic_url: signedUrl,
                    profile_pic_status: "synced",
                    profile_pic_synced_at: now,
                    profile_pic_last_attempt_at: now,
                    updated_at: now,
                  })
                  .eq("id", contact_id)
                  .eq("tenant_id", tenantId);
              }

              return new Response(
                JSON.stringify({
                  success: true,
                  status: "synced",
                  profilePicUrl: signedUrl,
                  storagePath,
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        } catch (dlErr: any) {
          console.warn("[Dental WhatsApp API] Falha no download CDN:", dlErr.message);
        }
      }

      // Sem foto disponível no WhatsApp
      if (contact_id) {
        await adminSupabase
          .from("df_wa_contacts")
          .update({
            profile_pic_status: "no_photo",
            profile_pic_last_attempt_at: now,
            updated_at: now,
          })
          .eq("id", contact_id)
          .eq("tenant_id", tenantId);
      }

      return new Response(
        JSON.stringify({ success: true, status: "no_photo", profilePicUrl: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO: SINCRONIZAR NOMES E FOTOS DE CONTATOS DA AGENDA (Evolution)
    // =========================================================================
    if (action === "sync_contacts_names") {
      if (!tenantId) {
        return new Response(
          JSON.stringify({ error: "tenant_id obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Carregar instância da clínica
      const { data: instanceRow } = await adminSupabase
        .from("df_wa_instances")
        .select("id, instance_name, api_url")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!instanceRow) {
        return new Response(
          JSON.stringify({ error: "Instância de WhatsApp não configurada para esta clínica." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Carregar segredo da instância
      const { data: secretRow } = await adminSupabase
        .from("df_wa_instance_secrets")
        .select("api_key")
        .eq("instance_id", instanceRow.id)
        .maybeSingle();

      if (!secretRow?.api_key) {
        return new Response(
          JSON.stringify({ error: "Chave de API não encontrada para esta instância." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const evoUrl = (instanceRow.api_url || "").replace(/\/$/, "");
      const evoKey = secretRow.api_key;
      const instanceName = instanceRow.instance_name;

      // 3. Consultar contatos, chats e grupos da Evolution em paralelo
      let evoContacts: any[] = [];
      let evoChats: any[] = [];
      let evoGroups: any[] = [];

      try {
        const [resContacts, resChats, resGroups] = await Promise.all([
          fetch(`${evoUrl}/chat/findContacts/${instanceName}`, {
            method: "POST",
            headers: { apikey: evoKey, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
          fetch(`${evoUrl}/chat/findChats/${instanceName}`, {
            method: "POST",
            headers: { apikey: evoKey, "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
          fetch(`${evoUrl}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
            headers: { apikey: evoKey },
          }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        ]);

        evoContacts = Array.isArray(resContacts) ? resContacts : [];
        evoChats = Array.isArray(resChats) ? resChats : [];
        evoGroups = Array.isArray(resGroups) ? resGroups : [];
      } catch (evoFetchErr: any) {
        console.error("[Dental WhatsApp API] Falha ao consultar Evolution:", evoFetchErr);
        return new Response(
          JSON.stringify({ error: "Falha na comunicação com a Evolution API." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 4.1 Montar mapeamento de LIDs (@lid) e IDs internos para números telefônicos
      const lidToPhoneMap = new Map<string, string>();
      const idToPhoneMap = new Map<string, string>();

      for (const ch of evoChats) {
        const lm = ch.lastMessage;
        const remoteJid = ch.remoteJid || ch.id || "";
        const remoteJidAlt = lm?.key?.remoteJidAlt || "";

        if (remoteJid.includes("@lid") && remoteJidAlt.includes("@s.whatsapp.net")) {
          const rawNum = remoteJidAlt.split("@")[0].split(":")[0];
          const norm = normalizeBrazilianNumber(rawNum);
          if (norm) {
            lidToPhoneMap.set(remoteJid, norm);
            if (ch.id) idToPhoneMap.set(ch.id, norm);
          }
        }
      }

      // 4.2 Montar mapa de nomes individuais para telefones
      const phoneToInfoMap = new Map<string, { name: string; profilePicUrl?: string }>();

      for (const c of evoContacts) {
        const jid = c.remoteJid || c.id || "";
        let norm = "";

        if (jid.includes("@s.whatsapp.net")) {
          const rawNum = jid.split("@")[0].split(":")[0];
          norm = normalizeBrazilianNumber(rawNum);
        } else if (jid.includes("@lid") || lidToPhoneMap.has(jid) || idToPhoneMap.has(c.id)) {
          norm = lidToPhoneMap.get(jid) || idToPhoneMap.get(c.id) || "";
        }

        const name = (c.pushName || c.name || "").trim();
        if (norm && name && name !== "undefined" && !isPhoneLikeContactName(name, norm)) {
          phoneToInfoMap.set(norm, { name, profilePicUrl: c.profilePicUrl || undefined });
        }
      }

      for (const ch of evoChats) {
        const lm = ch.lastMessage;
        const jidsToCheck = [ch.remoteJid, ch.id, lm?.key?.remoteJid, lm?.key?.remoteJidAlt].filter(Boolean);
        let foundName = (ch.pushName || lm?.pushName || "").trim();
        if (foundName === "Você" || foundName === "undefined" || foundName === "null") foundName = "";

        for (const j of jidsToCheck) {
          if (typeof j === "string" && j.includes("@s.whatsapp.net")) {
            const rawNum = j.split("@")[0].split(":")[0];
            const norm = normalizeBrazilianNumber(rawNum);
            if (norm && foundName && !isPhoneLikeContactName(foundName, norm) && !phoneToInfoMap.has(norm)) {
              phoneToInfoMap.set(norm, { name: foundName, profilePicUrl: ch.profilePicUrl || undefined });
            }
          }
        }
      }

      // 4.3 Montar mapa de nomes reais de Grupos (Subjects)
      const groupToNameMap = new Map<string, string>();

      for (const g of evoGroups) {
        const jid = g.id || g.jid || "";
        const rawId = jid.split("@")[0];
        const cleanDigits = rawId.replace(/\D/g, "");
        const subject = (g.subject || g.name || "").trim();
        if (subject) {
          groupToNameMap.set(jid, subject);
          groupToNameMap.set(rawId, subject);
          if (cleanDigits) groupToNameMap.set(cleanDigits, subject);
        }
      }

      for (const ch of evoChats) {
        if (ch.remoteJid?.includes("@g.us") || ch.id?.includes("@g.us")) {
          const jid = ch.remoteJid || ch.id;
          const rawId = jid.split("@")[0];
          const cleanDigits = rawId.replace(/\D/g, "");
          const subject = (ch.pushName || ch.name || "").trim();
          if (subject && subject !== "Você" && subject !== "undefined") {
            if (!groupToNameMap.has(jid)) groupToNameMap.set(jid, subject);
            if (!groupToNameMap.has(rawId)) groupToNameMap.set(rawId, subject);
            if (cleanDigits && !groupToNameMap.has(cleanDigits)) groupToNameMap.set(cleanDigits, subject);
          }
        }
      }

      // 5. Buscar contatos do tenant
      const { data: dbContacts, error: dbErr } = await adminSupabase
        .from("df_wa_contacts")
        .select("id, name, whatsapp_number, patient_id, profile_pic_url")
        .eq("tenant_id", tenantId);

      if (dbErr) {
        return new Response(
          JSON.stringify({ error: dbErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let updatedCount = 0;
      let alreadyCorrectCount = 0;
      let notFoundCount = 0;

      for (const ctc of dbContacts || []) {
        // Se já tem paciente vinculado, preserva rigorosamente
        if (ctc.patient_id) {
          alreadyCorrectCount++;
          continue;
        }

        // CASO A: Contato é um Grupo do WhatsApp
        if (isWhatsAppGroup(ctc.whatsapp_number)) {
          const cleanDigits = ctc.whatsapp_number.replace(/\D/g, "");
          const realGroupName =
            groupToNameMap.get(ctc.whatsapp_number) ||
            groupToNameMap.get(cleanDigits) ||
            groupToNameMap.get(`${cleanDigits}@g.us`) ||
            groupToNameMap.get(`${ctc.whatsapp_number}@g.us`);

          if (realGroupName && realGroupName !== ctc.name) {
            await adminSupabase
              .from("df_wa_contacts")
              .update({ name: realGroupName, updated_at: new Date().toISOString() })
              .eq("id", ctc.id)
              .eq("tenant_id", tenantId);
            updatedCount++;
          } else {
            alreadyCorrectCount++;
          }
          continue;
        }

        // CASO B: Contato Individual
        const isContaminatedLeo = ctc.name === "Leonardo Ricardo";
        const isPlaceholder = isPhoneLikeContactName(ctc.name, ctc.whatsapp_number);

        if (!isPlaceholder && !isContaminatedLeo) {
          alreadyCorrectCount++;
          continue;
        }

        const normNum = normalizeBrazilianNumber(ctc.whatsapp_number);
        const evoInfo = phoneToInfoMap.get(normNum) || phoneToInfoMap.get(ctc.whatsapp_number);

        if (evoInfo && evoInfo.name) {
          const updates: Record<string, any> = {
            name: evoInfo.name,
            updated_at: new Date().toISOString(),
          };
          if (!ctc.profile_pic_url && evoInfo.profilePicUrl) {
            updates.profile_pic_url = evoInfo.profilePicUrl;
          }

          await adminSupabase
            .from("df_wa_contacts")
            .update(updates)
            .eq("id", ctc.id)
            .eq("tenant_id", tenantId);

          updatedCount++;
        } else {
          notFoundCount++;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          updatedCount,
          alreadyCorrectCount,
          notFoundCount,
          totalProcessed: (dbContacts || []).length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ação desconhecida
    return new Response(
      JSON.stringify({ error: `Ação desconhecida: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Dental WhatsApp API] Erro interno:", err);
    return new Response(
      JSON.stringify({ error: `Erro no servidor: ${err.message || "Erro desconhecido"}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
