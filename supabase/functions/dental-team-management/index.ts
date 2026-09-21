import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Cliente administrativo com service_role para convites e checagens seguras
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. VALIDAR AUTORIZAÇÃO VIA TOKEN BEARER JWT DO USUÁRIO
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Token de autorização ausente ou inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const isServiceRole = Boolean(supabaseServiceKey && token === supabaseServiceKey);

    let callerAuthId: string | null = null;
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
      callerAuthId = authData.user.id;
    }

    // 2. PARSER DO CORPO
    const body = await req.json().catch(() => ({}));
    const { action, tenant_id, user_id, name, email, role, permissions, whatsapp_display_name } = body;

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. VALIDAR SE O USUÁRIO CHAMADOR É ADMINISTRADOR DO TENANT
    if (!isPlatformAdmin && callerAuthId) {
      const { data: callerRows, error: callerErr } = await adminSupabase
        .from("df_users")
        .select("id, clinic_id, role, is_primary, is_active")
        .eq("auth_user_id", callerAuthId)
        .eq("is_active", true);

      if (callerErr || !callerRows || callerRows.length === 0) {
        return new Response(
          JSON.stringify({ error: "Usuário chamador não encontrado ou inativo" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const hasAdminRights = callerRows.some(
        (u) =>
          u.is_primary ||
          ["SUPER_ADMIN", "PLATFORM_ADMIN"].includes(u.role) ||
          (u.clinic_id === tenant_id && ["OWNER", "ADMIN"].includes(u.role))
      );

      if (!hasAdminRights) {
        return new Response(
          JSON.stringify({ error: "Apenas administradores da clínica podem gerenciar membros da equipe" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // =========================================================================
    // AÇÃO: LISTAR MEMBROS DA EQUIPE
    // =========================================================================
    if (action === "list_members") {
      const { data: members, error: listErr } = await adminSupabase
        .from("df_users")
        .select("id, clinic_id, email, name, whatsapp_display_name, role, is_active, is_primary, created_at, auth_user_id, permissions")
        .eq("clinic_id", tenant_id)
        .order("name", { ascending: true });

      if (listErr) {
        return new Response(
          JSON.stringify({ success: false, error: listErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, members: members || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO: CONVIDAR NOVO MEMBRO
    // =========================================================================
    if (action === "invite_member") {
      const cleanEmail = (email || "").trim().toLowerCase();
      const cleanName = (name || "").trim();
      const assignedRole = (role || "RECEPTION").toUpperCase();

      if (!cleanEmail || !cleanEmail.includes("@")) {
        return new Response(
          JSON.stringify({ success: false, error: "E-mail inválido para convite" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!cleanName) {
        return new Response(
          JSON.stringify({ success: false, error: "Nome do membro é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const validRoles = ["OWNER", "ADMIN", "RECEPTION", "ASSISTANT", "DENTIST", "PROFESSIONAL", "FINANCE"];
      if (!validRoles.includes(assignedRole)) {
        return new Response(
          JSON.stringify({ success: false, error: `Função inválida. Opções válidas: ${validRoles.join(", ")}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 1. Checar se já existe em df_users
      const { data: existingUser, error: checkErr } = await adminSupabase
        .from("df_users")
        .select("id, clinic_id, email, name, role, is_active, auth_user_id")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (existingUser) {
        if (existingUser.clinic_id === tenant_id) {
          if (!existingUser.is_active) {
            // Reativar usuário com os novos dados
            await adminSupabase
              .from("df_users")
              .update({
                name: cleanName,
                role: assignedRole,
                permissions: permissions || null,
                is_active: true,
              })
              .eq("id", existingUser.id);

            return new Response(
              JSON.stringify({
                success: true,
                message: `O membro ${cleanName} estava inativo e foi reativado com sucesso na equipe.`,
                user_id: existingUser.id,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } else {
            return new Response(
              JSON.stringify({ success: false, error: "Este usuário já é membro ativo da equipe desta clínica." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          // Segurança multi-tenant: usuário já pertence a outra clínica
          return new Response(
            JSON.stringify({
              success: false,
              error: "Este e-mail já está vinculado a outra clínica no sistema. Por segurança e conformidade, utilize um e-mail individual próprio para este membro na clínica.",
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // 2. Convidar oficialmente via Supabase Auth
      let authUserId: string | null = null;
      try {
        const { data: inviteRes, error: inviteErr } = await adminSupabase.auth.admin.inviteUserByEmail(
          cleanEmail,
          {
            data: {
              name: cleanName,
              clinic_id: tenant_id,
              role: assignedRole,
            },
          }
        );

        if (inviteErr) {
          // Se já existir no auth.users sem clínica em df_users (ex: criado anteriormente):
          if (inviteErr.message?.toLowerCase().includes("already registered") || inviteErr.status === 422) {
            // Buscar usuário existente no auth
            const { data: authList } = await adminSupabase.auth.admin.listUsers();
            const matchedAuth = authList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
            if (matchedAuth) {
              authUserId = matchedAuth.id;
            }
          } else {
            console.warn("[Dental Team] Aviso no inviteUserByEmail:", inviteErr.message);
          }
        } else if (inviteRes?.user) {
          authUserId = inviteRes.user.id;
        }
      } catch (authCallErr: any) {
        console.warn("[Dental Team] Exceção no inviteUserByEmail:", authCallErr.message);
      }

      // 3. Criar registro oficial em df_users
      const cleanWhatsappName = (whatsapp_display_name || "").trim() || null;
      const newUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const { error: insertErr } = await adminSupabase.from("df_users").insert({
        id: newUserId,
        clinic_id: tenant_id,
        email: cleanEmail,
        name: cleanName,
        whatsapp_display_name: cleanWhatsappName,
        role: assignedRole,
        is_active: true,
        is_primary: false,
        auth_user_id: authUserId,
        permissions: permissions || null,
        created_at: new Date().toISOString(),
      });

      if (insertErr) {
        return new Response(
          JSON.stringify({ success: false, error: `Erro ao criar membro na base de dados: ${insertErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Convite enviado com sucesso para ${cleanEmail}. O usuário receberá as instruções para definir sua senha e acessar a clínica.`,
          user_id: newUserId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO: EDITAR ACESSO / PAPEL
    // =========================================================================
    if (action === "update_member") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: targetUser, error: findErr } = await adminSupabase
        .from("df_users")
        .select("id, clinic_id, role, is_primary")
        .eq("id", user_id)
        .eq("clinic_id", tenant_id)
        .maybeSingle();

      if (findErr || !targetUser) {
        return new Response(
          JSON.stringify({ success: false, error: "Membro da equipe não encontrado nesta clínica." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updateData: any = {};
      if (name) updateData.name = name.trim();
      if (role) updateData.role = role.toUpperCase();
      if (whatsapp_display_name !== undefined) {
        const trimmedDisplay = (whatsapp_display_name || "").trim();
        updateData.whatsapp_display_name = trimmedDisplay.length > 0 ? trimmedDisplay : null;
      }
      if (permissions !== undefined) updateData.permissions = permissions;

      const { error: updErr } = await adminSupabase
        .from("df_users")
        .update(updateData)
        .eq("id", user_id)
        .eq("clinic_id", tenant_id);

      if (updErr) {
        return new Response(
          JSON.stringify({ success: false, error: updErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Dados do membro atualizados com sucesso." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO: DESATIVAR MEMBRO
    // =========================================================================
    if (action === "deactivate_member") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: targetUser } = await adminSupabase
        .from("df_users")
        .select("id, clinic_id, role, is_primary, is_active")
        .eq("id", user_id)
        .eq("clinic_id", tenant_id)
        .maybeSingle();

      if (!targetUser) {
        return new Response(
          JSON.stringify({ success: false, error: "Membro da equipe não encontrado." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (targetUser.is_primary) {
        return new Response(
          JSON.stringify({ success: false, error: "A conta primária da clínica/consultoria não pode ser desativada." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Desativar mantendo integridade histórica
      const { error: deactErr } = await adminSupabase
        .from("df_users")
        .update({ is_active: false })
        .eq("id", user_id)
        .eq("clinic_id", tenant_id);

      if (deactErr) {
        return new Response(
          JSON.stringify({ success: false, error: deactErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Membro desativado com sucesso. O histórico de mensagens e ações foi preservado." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // AÇÃO: REATIVAR MEMBRO
    // =========================================================================
    if (action === "reactivate_member") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ success: false, error: "user_id é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: reactErr } = await adminSupabase
        .from("df_users")
        .update({ is_active: true })
        .eq("id", user_id)
        .eq("clinic_id", tenant_id);

      if (reactErr) {
        return new Response(
          JSON.stringify({ success: false, error: reactErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Membro reativado com sucesso." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Ação "${action}" desconhecida.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Dental Team Management Error]", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno no servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
