import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Cliente admin com service_role para executar o scheduler
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Normaliza números brasileiros de telefone com o 9º dígito
 */
function normalizeBrazilianNumber(number: string): string {
  const clean = number.replace(/\D/g, "");
  if (clean.startsWith("55") && (clean.length === 12 || clean.length === 13)) {
    const ddd = clean.substring(2, 4);
    const local = clean.substring(4);
    if (clean.length === 12) {
      const first = local[0];
      if (["6", "7", "8", "9"].includes(first)) {
        return `55${ddd}9${local}`;
      }
    }
    return clean;
  }
  if (!clean.startsWith("55") && (clean.length === 10 || clean.length === 11)) {
    const ddd = clean.substring(0, 2);
    const local = clean.substring(2);
    if (clean.length === 10 && ["6", "7", "8", "9"].includes(local[0])) {
      return `55${ddd}9${local}`;
    }
    return `55${clean}`;
  }
  return clean;
}

/**
 * Formata data YYYY-MM-DD para DD/MM/YYYY
 */
function formatDateBr(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Preenche variáveis no template da mensagem
 */
function renderTemplate(
  template: string,
  variables: {
    paciente: string;
    data: string;
    hora: string;
    profissional: string;
    procedimento: string;
    clinica: string;
  }
): string {
  return template
    .replace(/\{\{paciente\}\}/gi, variables.paciente || "Paciente")
    .replace(/\{\{data\}\}/gi, variables.data || "")
    .replace(/\{\{hora\}\}/gi, variables.hora || "")
    .replace(/\{\{profissional\}\}/gi, variables.profissional || "")
    .replace(/\{\{procedimento\}\}/gi, variables.procedimento || "Consulta")
    .replace(/\{\{clinica\}\}/gi, variables.clinica || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const logs: any[] = [];
  const executionTime = new Date().toISOString();

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const forceAppointmentId = body.forceAppointmentId || null;
    const forceReminderType = body.forceReminderType || null; // 'reminder_24h' | 'reminder_2h'
    const dryRun = Boolean(body.dryRun);

    console.log(`[Reminders Scheduler] Execução iniciada em ${executionTime}. forceAppt=${forceAppointmentId}, dryRun=${dryRun}`);

    // 1. Obter configurações ativas de todas as clínicas
    const { data: reminderSettings, error: setErr } = await adminSupabase
      .from("df_wa_reminder_settings")
      .select("*")
      .eq("enabled", true);

    if (setErr) {
      throw new Error(`Erro ao consultar df_wa_reminder_settings: ${setErr.message}`);
    }

    if (!reminderSettings || reminderSettings.length === 0) {
      console.log("[Reminders Scheduler] Nenhuma clínica com lembretes ativos encontrada.");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma configuração ativa", sentCount: 0, logs: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalSent = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const settings of reminderSettings) {
      const tenantId = (settings.tenant_id || "").replace(/^org_/, "").trim();
      if (!tenantId) continue;

      const reminder24hEnabled = Boolean(settings.reminder_24h_enabled);
      const reminder2hEnabled = Boolean(settings.reminder_2h_enabled);

      if (!reminder24hEnabled && !reminder2hEnabled && !forceAppointmentId) {
        continue;
      }

      // 2. Verificar instância do WhatsApp da clínica
      const { data: instanceRow, error: instErr } = await adminSupabase
        .from("df_wa_instances")
        .select("id, api_url, instance_name, status, phone_number")
        .eq("tenant_id", tenantId)
        .eq("status", "connected")
        .maybeSingle();

      if (instErr || !instanceRow) {
        logs.push({
          tenant_id: tenantId,
          result: "skipped",
          reason: "Instância de WhatsApp não conectada para esta clínica",
        });
        continue;
      }

      // Carregar segredos da instância
      const { data: secretRow } = await adminSupabase
        .from("df_wa_instance_secrets")
        .select("api_key")
        .eq("instance_id", instanceRow.id)
        .maybeSingle();

      if (!secretRow?.api_key) {
        logs.push({
          tenant_id: tenantId,
          result: "skipped",
          reason: "Chave de API do WhatsApp ausente no cofre",
        });
        continue;
      }

      const evoBaseUrl = instanceRow.api_url.replace(/\/$/, "");
      const evoApiKey = secretRow.api_key;
      const instanceName = instanceRow.instance_name;

      // Obter nome da clínica para interpolação
      const { data: tenantData } = await adminSupabase
        .from("df_tenants")
        .select("name")
        .eq("id", tenantId)
        .maybeSingle();

      const clinicName = tenantData?.name || "Clínica Odontológica";

      // 3. Buscar consultas elegíveis para a clínica
      // Regra 18: Buscar consultas ativas (PENDENTE, CONFIRMADA, AGENDADA, AGUARDANDO)
      // Excluir expressamente: CANCELADA, FALTOU, FINALIZADA
      let apptQuery = adminSupabase
        .from("df_appointments")
        .select("*")
        .eq("tenant_id", tenantId)
        .in("status", ["PENDENTE", "CONFIRMADA", "AGENDADA", "AGUARDANDO"]);

      if (forceAppointmentId) {
        apptQuery = apptQuery.eq("id", forceAppointmentId);
      } else {
        // Consultas de hoje e dos próximos 3 dias
        const nowBr = new Date(Date.now() - 3 * 3600 * 1000); // UTC-3
        const todayStr = nowBr.toISOString().split("T")[0];
        const nextDays = new Date(Date.now() - 3 * 3600 * 1000 + 3 * 24 * 3600 * 1000);
        const nextDaysStr = nextDays.toISOString().split("T")[0];

        apptQuery = apptQuery.gte("date", todayStr).lte("date", nextDaysStr);
      }

      const { data: appointments, error: apptErr } = await apptQuery;

      if (apptErr) {
        console.error(`[Reminders Scheduler] Erro ao buscar consultas do tenant ${tenantId}:`, apptErr);
        continue;
      }

      if (!appointments || appointments.length === 0) {
        continue;
      }

      const now = Date.now();

      for (const appt of appointments) {
        // Validar horário da consulta no timezone local America/Sao_Paulo (UTC-3)
        if (!appt.date || !appt.start_time) continue;

        const apptIso = `${appt.date}T${appt.start_time}:00-03:00`;
        const apptTime = new Date(apptIso).getTime();

        if (isNaN(apptTime)) {
          console.warn(`[Reminders Scheduler] Data/hora inválida para consulta ${appt.id}: ${apptIso}`);
          continue;
        }

        // Determinar quais lembretes avaliar
        const remindersToCheck: Array<"reminder_24h" | "reminder_2h"> = [];

        if (forceReminderType) {
          remindersToCheck.push(forceReminderType);
        } else {
          if (reminder24hEnabled) remindersToCheck.push("reminder_24h");
          if (reminder2hEnabled) remindersToCheck.push("reminder_2h");
        }

        for (const remType of remindersToCheck) {
          let isEligible = false;
          let targetTime = 0;

          if (remType === "reminder_24h") {
            // Alvo: 24h antes da consulta
            targetTime = apptTime - 24 * 60 * 60 * 1000;
            // Cutoff: se já faltam menos de 2h para a consulta, o lembrete de 24h perdeu o sentido
            const cutoff24h = apptTime - 2 * 60 * 60 * 1000;

            if (forceAppointmentId) {
              isEligible = true;
            } else {
              isEligible = now >= targetTime && now < cutoff24h;
            }
          } else if (remType === "reminder_2h") {
            // Alvo: 2h antes da consulta
            targetTime = apptTime - 2 * 60 * 60 * 1000;
            // Cutoff: até o horário da consulta
            const cutoff2h = apptTime;

            if (forceAppointmentId) {
              isEligible = true;
            } else {
              isEligible = now >= targetTime && now < cutoff2h;
            }
          }

          if (!isEligible) {
            continue;
          }

          // 4. VERIFICAÇÃO DE IDEMPOTÊNCIA: Não reenviar se já existe log 'sent' para esta data
          const { data: existingLog } = await adminSupabase
            .from("df_wa_reminders_log")
            .select("id, status, sent_at")
            .eq("tenant_id", tenantId)
            .eq("appointment_id", appt.id)
            .eq("reminder_type", remType)
            .eq("scheduled_for", appt.date)
            .eq("status", "sent")
            .maybeSingle();

          if (existingLog && !forceAppointmentId) {
            logs.push({
              tenant_id: tenantId,
              appointment_id: appt.id,
              reminder_type: remType,
              result: "duplicate",
              reason: "Lembrete já enviado anteriormente para esta data de consulta",
              sent_at: existingLog.sent_at,
            });
            totalSkipped++;
            continue;
          }

          // 5. Resolver Telefone do Paciente e Contato
          let rawPhone = appt.patient_phone || "";
          if (!rawPhone && appt.patient_id) {
            const { data: pData } = await adminSupabase
              .from("df_patients")
              .select("phone")
              .eq("id", appt.patient_id)
              .maybeSingle();
            rawPhone = pData?.phone || "";
          }

          const cleanPhone = normalizeBrazilianNumber(rawPhone);
          if (!cleanPhone || cleanPhone.length < 10) {
            logs.push({
              tenant_id: tenantId,
              appointment_id: appt.id,
              reminder_type: remType,
              result: "failed",
              reason: `Telefone inválido ou ausente: ${rawPhone}`,
            });
            totalErrors++;
            continue;
          }

          // Resolver ou criar contato em df_wa_contacts
          let contactId: string | null = null;
          const { data: existingContact } = await adminSupabase
            .from("df_wa_contacts")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("whatsapp_number", cleanPhone)
            .maybeSingle();

          if (existingContact) {
            contactId = existingContact.id;
          } else {
            const newContactId = `ctc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const { data: createdContact } = await adminSupabase
              .from("df_wa_contacts")
              .insert({
                id: newContactId,
                tenant_id: tenantId,
                patient_id: appt.patient_id || null,
                name: appt.patient_name || "Paciente",
                whatsapp_number: cleanPhone,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            contactId = createdContact?.id || newContactId;
          }

          // 6. Montar o texto do lembrete usando template configurado
          const defaultReminderTemplate =
            "Olá, {{paciente}}! Lembramos da sua consulta marcada para o dia {{data}} às {{hora}} com {{profissional}}. Estamos te esperando 😊";
          const templateToUse = settings.reminder_template || defaultReminderTemplate;

          const renderedMessage = renderTemplate(templateToUse, {
            paciente: appt.patient_name || "Paciente",
            data: formatDateBr(appt.date),
            hora: appt.start_time,
            profissional: appt.dentist_name || "seu dentista",
            procedimento: appt.procedure_name || "Consulta",
            clinica: clinicName,
          });

          if (dryRun) {
            logs.push({
              tenant_id: tenantId,
              appointment_id: appt.id,
              patient_name: appt.patient_name,
              reminder_type: remType,
              scheduled_for: appt.date,
              target_time: new Date(targetTime).toISOString(),
              rendered_message: renderedMessage,
              result: "dry_run",
            });
            totalSent++;
            continue;
          }

          // 7. Envio real via Evolution API
          const sendUrl = `${evoBaseUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
          const payload = {
            number: cleanPhone,
            text: renderedMessage,
            delay: 1000,
            linkPreview: false,
          };

          try {
            const evoRes = await fetch(sendUrl, {
              method: "POST",
              headers: {
                apikey: evoApiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
            });

            const evoBody = await evoRes.text();

            if (!evoRes.ok) {
              throw new Error(`HTTP ${evoRes.status}: ${evoBody.slice(0, 200)}`);
            }

            let msgId = `evo_${Date.now()}`;
            try {
              const evoData = JSON.parse(evoBody);
              msgId = evoData?.key?.id || evoData?.messageId || msgId;
            } catch (_e) {
              // json parse fallback
            }

            // 8. Gravar log em df_wa_reminders_log
            const reminderLogId = `rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await adminSupabase.from("df_wa_reminders_log").insert({
              id: reminderLogId,
              tenant_id: tenantId,
              appointment_id: appt.id,
              contact_id: contactId,
              reminder_type: remType,
              scheduled_for: appt.date,
              status: "sent",
              evolution_msg_id: msgId,
              sent_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            });

            // 9. Gravar em df_wa_messages (Regra 29: SEM CRIAR ATENDIMENTO)
            // Se houver conversa ativa em andamento, associa; se não houver, conversation_id = null
            let activeConvId: string | null = null;
            if (contactId) {
              const { data: actConv } = await adminSupabase
                .from("df_wa_conversations")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("contact_id", contactId)
                .not("status", "in", '("finalizado","arquivado")')
                .maybeSingle();
              activeConvId = actConv?.id || null;
            }

            const dbMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            await adminSupabase.from("df_wa_messages").insert({
              id: dbMsgId,
              tenant_id: tenantId,
              conversation_id: activeConvId, // NUNCA abre atendimento artificial
              contact_id: contactId,
              appointment_id: appt.id,
              evolution_msg_id: msgId,
              from_me: true,
              content: renderedMessage,
              msg_type: "text",
              is_read: true,
              origin: "appointment_reminder",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

            logs.push({
              tenant_id: tenantId,
              appointment_id: appt.id,
              patient_name: appt.patient_name,
              reminder_type: remType,
              phone: cleanPhone,
              evolution_msg_id: msgId,
              scheduled_for: appt.date,
              result: "sent",
              sent_at: new Date().toISOString(),
            });

            totalSent++;
          } catch (err: any) {
            console.error(`[Reminders Scheduler] Falha ao enviar lembrete para consulta ${appt.id}:`, err);

            // Gravar falha em df_wa_reminders_log para controle
            const reminderLogId = `rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            await adminSupabase.from("df_wa_reminders_log").insert({
              id: reminderLogId,
              tenant_id: tenantId,
              appointment_id: appt.id,
              contact_id: contactId,
              reminder_type: remType,
              scheduled_for: appt.date,
              status: "failed",
              error_message: err.message || "Erro no envio Evolution",
              created_at: new Date().toISOString(),
            });

            logs.push({
              tenant_id: tenantId,
              appointment_id: appt.id,
              reminder_type: remType,
              result: "failed",
              error: err.message,
            });

            totalErrors++;
          }

          // Delay de segurança entre envios (1.2s) para respeitar limites da Evolution API
          await new Promise((res) => setTimeout(res, 1200));
        }
      }
    }

    console.log(`[Reminders Scheduler] Concluído: ${totalSent} enviados, ${totalSkipped} duplicados/pulados, ${totalErrors} erros.`);

    return new Response(
      JSON.stringify({
        success: true,
        executionTime,
        sentCount: totalSent,
        skippedCount: totalSkipped,
        errorCount: totalErrors,
        logs,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[Reminders Scheduler] Erro fatal:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message, logs }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
