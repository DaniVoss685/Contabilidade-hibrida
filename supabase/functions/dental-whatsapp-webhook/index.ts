import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Buffer } from "node:buffer";

// Environment variables
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Create admin Supabase client with service_role for backend operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Decodificador de Base64 para Uint8Array de alta performance
 */
function decodeBase64ToUint8Array(b64: string): Uint8Array {
  try {
    return Buffer.from(b64, 'base64');
  } catch (_e) {
    const raw = atob(b64);
    const len = raw.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
  }
}

/**
 * Normaliza números brasileiros de telefone com o 9º dígito
 */
function normalizeBrazilianNumber(number: string): string {
  const clean = number.replace(/\D/g, '');
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    const ddd = clean.substring(2, 4);
    const local = clean.substring(4);
    if (clean.length === 12) {
      const first = local[0];
      if (['6', '7', '8', '9'].includes(first)) {
        return `55${ddd}9${local}`;
      }
    }
    return clean;
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


/**
 * Mapeia extensão com base no MIME Type
 */
function getExtensionFromMime(mimeType?: string): string {
  if (!mimeType) return 'bin';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'bin';
}

/**
 * Classificador determinístico e auditável de respostas do paciente.
 * Classificador determinístico e auditável de respostas do paciente.
 * Normaliza acentos, pontuação, trim e caixa baixa.
 * Prioridade total para negações e dúvidas antes de confirmações.
 */
function classifyPatientResponse(text: string): 'AFFIRMATIVE' | 'NEGATIVE' | 'UNKNOWN' {
  if (!text) return 'UNKNOWN';
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?!"']/g, ' ') // remove pontuações mantendo palavras separadas
    .replace(/\s+/g, ' ')
    .trim();

  if (!norm) return 'UNKNOWN';

  // =========================================================================
  // 1. DÚVIDAS, INCERTEZAS E RESPOSTAS INCONCLUSIVAS -> UNKNOWN
  // (Verificado antes de negação genérica para tratar "não sei ainda", etc.)
  // =========================================================================
  const uncertaintyRegex = /\b(talvez|provavelmente|acho que|se der|vou ver|ver se|depois te aviso|depois eu aviso|depois confirmo|vou confirmar|nao sei|ainda nao sei|quem sabe|depende)\b/;
  if (uncertaintyRegex.test(norm)) {
    return 'UNKNOWN';
  }

  // =========================================================================
  // 2. PRIORIDADE MÁXIMA: PADRÕES NEGATIVOS E CONTRADITÓRIOS
  // =========================================================================

  // Negações compostas, adversativas e contradições
  const negativeContradictionRegex = /\b(mas|porem|contudo|so que|entretanto|todavia)\s+(nao|nem)\b/;
  if (negativeContradictionRegex.test(norm)) {
    return 'NEGATIVE';
  }

  // Padrões negativos verbais diretos ("não vou", "não posso", "não consigo", etc.)
  const negativeVerbRegex = /\b(nao|nem)\s+(vou|vou conseguir|posso|consigo|estarei|estou|irei|estaria|pretendo|quero|tenho como|da para ir|vou poder)\b/;
  if (negativeVerbRegex.test(norm)) {
    return 'NEGATIVE';
  }

  // Padrões explícitos de cancelamento / remarcação / recusa
  const explicitNegativeRegex = /\b(pode cancelar|quero cancelar|favor cancelar|preciso cancelar|desejo cancelar|cancela|cancelar|cancelamento|desmarcar|desmarca|desmarque|nao precisa confirmar|infelizmente nao|nao vai dar|nao da|preciso remarcar|quero remarcar|favor remarcar|desejo remarcar|reagendar|remarcar|trocar horario|mudar horario|mudar data)\b/;
  if (explicitNegativeRegex.test(norm)) {
    return 'NEGATIVE';
  }

  // Negação estrita isolada ou início enfático de recusa ("não", "nao obrigado", etc.)
  if (/^nao(\s+.*)?$/.test(norm)) {
    return 'NEGATIVE';
  }

  if (/^(n|nop|nope|nunca|jamais)$/.test(norm)) {
    return 'NEGATIVE';
  }

  // =========================================================================
  // 3. PADRÕES AFIRMATIVOS (INTENÇÃO CLARA)
  // =========================================================================

  // Padrões compostos de confirmação explícita
  const explicitAffirmativePatterns = [
    /\b(pode confirmar|pode deixar confirmado|deixar confirmado|favor confirmar|confirma por favor|confirma ai)\b/,
    /\b(vou sim|eu vou|estarei ai|estarei la|estou confirmad[ao]|pode contar comigo|pode deixar|com certeza|sem duvidas?)\b/,
    /\b(esta confirmad[ao]|ta confirmad[ao]|tudo confirmad[ao]|ja esta confirmad[ao]|ja ta confirmad[ao])\b/,
    /\b(tudo certo|ta certo|ta bom|fechado|combinado|combinadissim[ao]|perfeito|show de bola)\b/,
    /\b(irei sim|irei com certeza|comparecerei)\b/,
    /\b(confirmo sim|confirmad[ao] sim)\b/,
  ];

  for (const pattern of explicitAffirmativePatterns) {
    if (pattern.test(norm)) {
      return 'AFFIRMATIVE';
    }
  }

  // Tokens e verbos afirmativos diretos com word boundary
  const singleTokensAffirmative = [
    /\bconfirmad[ao]\b/,
    /\bconfirmo\b/,
    /\bconfirmar\b/,
    /\bcombinado\b/,
    /\bfechado\b/,
    /\bsim\b/,
    /\bok\b/,
    /\bokay\b/,
    /\bblz\b/,
    /\bbeleza\b/,
    /\bclaro\b/,
    /\bperfeito\b/,
    /\botimo\b/,
    /\bshow\b/,
    /\bcerto\b/,
    /\birei\b/,
    /\bvou\b/,
  ];

  for (const tokenRegex of singleTokensAffirmative) {
    if (tokenRegex.test(norm)) {
      return 'AFFIRMATIVE';
    }
  }

  return 'UNKNOWN';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  let rawBody = '';
  try {
    rawBody = await req.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: 'Corpo da requisição vazio' }), { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const instanceName = payload.instance || payload.instanceName || '';
    const event = payload.event || '';

    if (!instanceName) {
      console.warn('[Dental Webhook] Requisição sem nome de instância recebida.');
      return new Response(JSON.stringify({ error: 'Instância não informada' }), { status: 400 });
    }

    // 1. RESOLVER INSTÂNCIA -> TENANT_ID (SEGURANÇA MULTI-TENANT)
    // NUNCA confiar no tenant_id enviado pelo cliente externo.
    const { data: instanceRow, error: instError } = await supabase
      .from('df_wa_instances')
      .select('id, tenant_id, api_url, instance_name')
      .eq('instance_name', instanceName)
      .maybeSingle();

    if (instError || !instanceRow || !instanceRow.tenant_id) {
      console.warn(`[Dental Webhook] Instância desconhecida: "${instanceName}". Gravando log para auditoria.`);
      await supabase.from('df_wa_webhook_logs').insert({
        instance_name: instanceName,
        event: event || 'unknown',
        payload,
        status: 'ignored',
        error_message: `Instância "${instanceName}" não encontrada no mapeamento df_wa_instances.`,
      });
      return new Response(JSON.stringify({ status: 'ignored', reason: 'Instância não cadastrada' }), {
        status: 200,
      });
    }

    // Buscar segredos administrativos exclusivamente no cofre server-side df_wa_instance_secrets
    const { data: secretRow } = await supabase
      .from('df_wa_instance_secrets')
      .select('api_key, webhook_secret')
      .eq('instance_id', instanceRow.id)
      .maybeSingle();

    // Validação estrita do Webhook Secret (SEM FALLBACK para api_key)
    // Headers suportados prioritários: x-webhook-token ou apikey
    const reqAuthToken = req.headers.get('x-webhook-token') || req.headers.get('apikey');
    const expectedSecret = secretRow?.webhook_secret;

    if (!expectedSecret) {
      console.warn(`[Dental Webhook] Instância "${instanceName}" sem webhook_secret cadastrado no cofre server-side. Bloqueando.`);
      return new Response(JSON.stringify({ error: 'Webhook secret não configurado para a instância' }), { status: 401 });
    }

    if (!reqAuthToken || reqAuthToken !== expectedSecret) {
      console.warn(`[Dental Webhook] Requisição não autorizada para instância "${instanceName}": token ausente ou inválido.`);
      return new Response(JSON.stringify({ error: 'Acesso não autorizado: token de webhook inválido' }), { status: 401 });
    }

    const tenantId = instanceRow.tenant_id;
    const evoUrl = (instanceRow.api_url || '').replace(/\/$/, '');
    const evoKey = secretRow?.api_key || '';

    // 2. AUDIT LOG DO EVENTO
    try {
      await supabase.from('df_wa_webhook_logs').insert({
        id: `wlog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tenant_id: tenantId,
        instance_name: instanceName,
        event: event || 'unknown',
        payload,
        status: 'processed',
      });
    } catch (logErr) {
      console.error('[Dental Webhook] Erro ao gravar webhook_log:', logErr);
    }

    // =========================================================================
    // EVENTOS DE MENSAGENS: messages.upsert OU send.message
    // =========================================================================
    if ((event === 'messages.upsert' || event === 'send.message') && payload.data) {
      let messages: any[] = [];
      if (event === 'send.message') {
        messages = [payload.data];
      } else {
        messages = Array.isArray(payload.data)
          ? payload.data
          : payload.data.messages || [payload.data];
      }

      for (const data of messages) {
        const isFromMe = data.key?.fromMe || false;
        const remoteJid = data.key?.remoteJid || data.remoteJid || '';
        const remoteJidAlt = data.key?.remoteJidAlt || '';
        const whatsappNumber = normalizeBrazilianNumber(remoteJid.split('@')[0].split(':')[0]);
        const isGroup = remoteJid.includes('@g.us') || isWhatsAppGroup(whatsappNumber);
        const lidFromMessage = remoteJidAlt.includes('@lid')
          ? remoteJidAlt
          : remoteJid.includes('@lid')
          ? remoteJid
          : null;

        if (!whatsappNumber) {
          console.log(`[Dental Webhook] Pulando: número não identificado no JID: ${remoteJid}`);
          continue;
        }

        // Se for GRUPO, NUNCA usar o pushName do participante como nome do grupo.
        // Se a mensagem for FROM_ME (outbound), data.pushName é o nome do próprio aparelho/remetente.
        // NUNCA usar o pushName do remetente como nome do contato de destino!
        const clientName = isGroup
          ? 'Grupo do WhatsApp'
          : (!isFromMe && data.pushName && data.pushName.trim()
              ? data.pushName.trim()
              : whatsappNumber);
        const evolutionMsgId = data.key?.id;

        if (!evolutionMsgId) {
          console.log('[Dental Webhook] Pulando: mensagem sem key.id');
          continue;
        }

        // Parse do Conteúdo e Mídia
        let content = '';
        let msgType = 'text';
        let mediaData: { mime?: string; name?: string } | null = null;
        let isReaction = false;
        let reactionText = '';
        let reactionTargetMsgId = '';

        if (data.message) {
          const msg = data.message;
          if (msg.conversation) {
            content = msg.conversation;
          } else if (msg.extendedTextMessage?.text) {
            content = msg.extendedTextMessage.text;
          } else if (msg.imageMessage) {
            content = msg.imageMessage.caption || '';
            msgType = 'image';
            mediaData = { mime: msg.imageMessage.mimetype, name: 'imagem.jpg' };
          } else if (msg.documentMessage) {
            content = msg.documentMessage.caption || '';
            msgType = 'document';
            mediaData = { mime: msg.documentMessage.mimetype, name: msg.documentMessage.fileName || msg.documentMessage.title || 'documento.pdf' };
          } else if (msg.documentWithCaptionMessage?.message?.documentMessage) {
            const docMsg = msg.documentWithCaptionMessage.message.documentMessage;
            content = docMsg.caption || '';
            msgType = 'document';
            mediaData = { mime: docMsg.mimetype, name: docMsg.fileName || docMsg.title || 'documento.pdf' };
          } else if (msg.audioMessage) {
            content = '';
            msgType = 'audio';
            mediaData = { mime: msg.audioMessage.mimetype, name: 'audio.ogg' };
          } else if (msg.videoMessage) {
            content = msg.videoMessage.caption || '';
            msgType = 'video';
            mediaData = { mime: msg.videoMessage.mimetype, name: 'video.mp4' };
          } else if (msg.stickerMessage) {
            content = '🖼️ Figurinha';
            msgType = 'sticker';
            mediaData = { mime: msg.stickerMessage.mimetype, name: 'figurinha.webp' };
          } else if (msg.contactMessage) {
            const vcard = msg.contactMessage.vcard || '';
            const displayName = msg.contactMessage.displayName || 'Contato';
            content = JSON.stringify({ displayName, vcard });
            msgType = 'contact';
          } else if (msg.contactsArrayMessage) {
            const contacts = (msg.contactsArrayMessage.contacts || []).map((c: any) => ({
              displayName: c.displayName || 'Contato',
              vcard: c.vcard || '',
            }));
            content = JSON.stringify(contacts);
            msgType = 'contact';
          } else if (msg.reactionMessage) {
            isReaction = true;
            reactionTargetMsgId = msg.reactionMessage.key?.id;
            reactionText = msg.reactionMessage.text || '';
          }
        }

        // TRATAMENTO DE REAÇÃO
        if (isReaction && reactionTargetMsgId) {
          const { data: targetMsg } = await supabase
            .from('df_wa_messages')
            .select('id, reactions')
            .eq('tenant_id', tenantId)
            .eq('evolution_msg_id', reactionTargetMsgId)
            .maybeSingle();

          if (targetMsg) {
            const currentReactions: any[] = Array.isArray(targetMsg.reactions) ? targetMsg.reactions : [];
            const updatedReactions = reactionText
              ? [...currentReactions.filter((r) => r.fromMe !== isFromMe), { text: reactionText, fromMe: isFromMe, timestamp: new Date().toISOString() }]
              : currentReactions.filter((r) => r.fromMe !== isFromMe);

            await supabase
              .from('df_wa_messages')
              .update({ reactions: updatedReactions, updated_at: new Date().toISOString() })
              .eq('id', targetMsg.id)
              .eq('tenant_id', tenantId);
          }
          continue;
        }

        if (!content && !mediaData) continue;

        // 3. RESOLVER CONTATO NO TENANT
        let contactId: string | null = null;
        const { data: existingContact } = await supabase
          .from('df_wa_contacts')
          .select('id, name, profile_pic_url, profile_pic_status, profile_pic_last_attempt_at, patient_id')
          .eq('tenant_id', tenantId)
          .eq('whatsapp_number', whatsappNumber)
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
          const updates: Record<string, any> = {};
          if (lidFromMessage) {
            updates.lid = lidFromMessage;
          }
          // Se for contato INDIVIDUAL, mensagem INBOUND e não tiver paciente vinculado,
          // e o nome atual for placeholder de telefone, atualizar com o pushName real do cliente.
          // Para GRUPOS, o pushName pertence ao participante que postou e NUNCA deve sobrescrever o nome do grupo!
          if (!isGroup && !isFromMe && data.pushName && data.pushName.trim() && !existingContact.patient_id) {
            const candidatePushName = data.pushName.trim();
            if (isPhoneLikeContactName(existingContact.name, whatsappNumber) && !isPhoneLikeContactName(candidatePushName, whatsappNumber)) {
              updates.name = candidatePushName;
            }
          }
          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();
            await supabase
              .from('df_wa_contacts')
              .update(updates)
              .eq('id', contactId);
          }
        } else {
          // Tentar vincular a paciente existente por telefone antes de criar contato (SOMENTE PARA INDIVÍDUOS, NUNCA GRUPOS)
          let matchedPatient: any = null;
          if (!isGroup) {
            const { data: pRow } = await supabase
              .from('df_patients')
              .select('id, name')
              .eq('tenant_id', tenantId)
              .or(`phone.eq.${whatsappNumber},phone.ilike.%${whatsappNumber.slice(-8)}%`)
              .maybeSingle();
            matchedPatient = pRow;
          }

          let fallbackPhoneFormatted = isGroup ? 'Grupo do WhatsApp' : whatsappNumber;
          if (!isGroup && whatsappNumber.length >= 10) {
            const digits = whatsappNumber.startsWith('55') ? whatsappNumber.substring(2) : whatsappNumber;
            if (digits.length === 11) {
              fallbackPhoneFormatted = `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
            } else if (digits.length === 10) {
              fallbackPhoneFormatted = `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
            }
          }

          const initialName = matchedPatient?.name || (clientName !== whatsappNumber ? clientName : fallbackPhoneFormatted);
          const initialPatientId = matchedPatient?.id || null;

          // Criar novo contato
          const newContactId = `ctc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const { data: createdContact, error: ctcErr } = await supabase
            .from('df_wa_contacts')
            .insert({
              id: newContactId,
              tenant_id: tenantId,
              name: initialName,
              whatsapp_number: whatsappNumber,
              patient_id: initialPatientId,
              lid: lidFromMessage,
              profile_pic_status: 'pending',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (!ctcErr && createdContact) {
            contactId = createdContact.id;
          } else {
            // Em caso de concorrência/conflito
            const { data: retryCtc } = await supabase
              .from('df_wa_contacts')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('whatsapp_number', whatsappNumber)
              .maybeSingle();
            contactId = retryCtc?.id || null;
          }
        }

        if (!contactId) continue;

        // Disparo seguro para buscar foto com cooldown de 24h se o contato não tem foto ('no_photo')
        const lastAttempt = existingContact?.profile_pic_last_attempt_at
          ? new Date(existingContact.profile_pic_last_attempt_at).getTime()
          : 0;
        const isCooldownExpired = Date.now() - lastAttempt > 24 * 60 * 60 * 1000;
        const shouldSyncPic = !existingContact?.profile_pic_url && (existingContact?.profile_pic_status !== 'no_photo' || isCooldownExpired);

        if (shouldSyncPic && contactId) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/dental-whatsapp-api`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'sync_profile_pic',
                tenant_id: tenantId,
                contact_id: contactId,
                number: whatsappNumber,
              }),
            });
          } catch (syncErr: any) {
            console.warn('[Dental Webhook] Aviso ao agendar sync de foto:', syncErr.message);
          }
        }

        // 4. RESOLVER REPLY_TO (QUOTED MESSAGE) E CONTEXTO DE CONFIRMAÇÃO DE CONSULTA
        let replyToId: string | null = null;
        let matchedAppointmentId: string | null = null;
        let isConfirmedAction = false;
        const responseClassification = !isFromMe && content ? classifyPatientResponse(content) : 'UNKNOWN';

        const contextInfo =
          data.message?.extendedTextMessage?.contextInfo ||
          data.message?.imageMessage?.contextInfo ||
          data.message?.videoMessage?.contextInfo ||
          data.message?.documentMessage?.contextInfo ||
          data.message?.documentWithCaptionMessage?.message?.documentMessage?.contextInfo ||
          data.message?.audioMessage?.contextInfo ||
          data.message?.stickerMessage?.contextInfo;

        // Prioridade 1: Reply explícito da mensagem de confirmação
        if (contextInfo?.stanzaId) {
          const { data: quotedMsg } = await supabase
            .from('df_wa_messages')
            .select('id, origin, appointment_id')
            .eq('tenant_id', tenantId)
            .eq('evolution_msg_id', contextInfo.stanzaId)
            .maybeSingle();

          if (quotedMsg) {
            replyToId = quotedMsg.id;
            if (
              (quotedMsg.origin === 'appointment_confirmation' ||
                quotedMsg.origin === 'appointment_reminder' ||
                quotedMsg.origin === 'appointment_reminder_24h' ||
                quotedMsg.origin === 'appointment_reminder_2h') &&
              quotedMsg.appointment_id
            ) {
              matchedAppointmentId = quotedMsg.appointment_id;
            }
          }
        }

        // Prioridade 2: Sem reply, mas resposta claramente afirmativa com contexto seguro (SOMENTE INDIVÍDUOS, NUNCA GRUPOS)
        if (!isGroup && !matchedAppointmentId && responseClassification === 'AFFIRMATIVE' && !isFromMe) {
          let patId = existingContact?.patient_id;
          if (!patId) {
            const { data: cRow } = await supabase
              .from('df_wa_contacts')
              .select('patient_id')
              .eq('id', contactId)
              .maybeSingle();
            patId = cRow?.patient_id;
          }

          if (patId) {
            const todayStr = new Date().toISOString().split('T')[0];
            const { data: pendingApts } = await supabase
              .from('df_appointments')
              .select('id, date, start_time, status')
              .eq('tenant_id', tenantId)
              .eq('patient_id', patId)
              .gte('date', todayStr)
              .in('status', ['PENDENTE', 'AGENDADA', 'AGUARDANDO'])
              .order('date', { ascending: true })
              .order('start_time', { ascending: true });

            // REGRA DE SEGURANÇA: Somente se houver EXATAMENTE UMA consulta pendente
            if (pendingApts && pendingApts.length === 1) {
              const candidate = pendingApts[0];

              // Checar se a última mensagem enviada pelo sistema para este contato foi confirmação ou lembrete dessa consulta
              const { data: lastSysMsg } = await supabase
                .from('df_wa_messages')
                .select('id, origin, appointment_id, created_at')
                .eq('tenant_id', tenantId)
                .eq('contact_id', contactId)
                .eq('from_me', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (
                lastSysMsg &&
                (lastSysMsg.origin === 'appointment_confirmation' ||
                  lastSysMsg.origin === 'appointment_reminder' ||
                  lastSysMsg.origin === 'appointment_reminder_24h' ||
                  lastSysMsg.origin === 'appointment_reminder_2h') &&
                lastSysMsg.appointment_id === candidate.id
              ) {
                const sentAt = new Date(lastSysMsg.created_at).getTime();
                // Janela máxima de 72 horas para confirmação contextual
                if (Date.now() - sentAt < 72 * 60 * 60 * 1000) {
                  matchedAppointmentId = candidate.id;
                }
              }
            } else if (pendingApts && pendingApts.length > 1) {
              console.log(
                `[Dental Webhook] Ambiguidade: paciente ${patId} tem ${pendingApts.length} consultas pendentes. Automação bloqueada.`
              );
            }
          }
        }

        // Executar transição de status para CONFIRMADA ou registrar alerta
        if (matchedAppointmentId) {
          if (responseClassification === 'AFFIRMATIVE') {
            await supabase
              .from('df_appointments')
              .update({
                status: 'CONFIRMADA',
                updated_at: new Date().toISOString(),
              })
              .eq('id', matchedAppointmentId)
              .eq('tenant_id', tenantId);

            await supabase
              .from('df_wa_reminders_log')
              .update({
                status: 'sent',
                error_message: 'Confirmada pelo paciente',
              })
              .eq('tenant_id', tenantId)
              .eq('appointment_id', matchedAppointmentId)
              .eq('reminder_type', 'confirmation');

            isConfirmedAction = true;
          }
        }

        // 4.5 SE MENSAGEM FOI ENVIADA PELO SISTEMA (fromMe = true)
        // Verificar se é disparo transacional (confirmação ou lembrete de consulta)
        let isTransactionalReminder = false;
        let transactionalOrigin = 'attendant';
        if (isFromMe && evolutionMsgId) {
          const { data: reminderLog } = await supabase
            .from('df_wa_reminders_log')
            .select('id, appointment_id, reminder_type')
            .eq('tenant_id', tenantId)
            .eq('evolution_msg_id', evolutionMsgId)
            .maybeSingle();

          if (reminderLog) {
            isTransactionalReminder = true;
            matchedAppointmentId = reminderLog.appointment_id;
            if (reminderLog.reminder_type === 'confirmation') {
              transactionalOrigin = 'appointment_confirmation';
            } else if (reminderLog.reminder_type === 'reminder_24h') {
              transactionalOrigin = 'appointment_reminder_24h';
            } else if (reminderLog.reminder_type === 'reminder_2h') {
              transactionalOrigin = 'appointment_reminder_2h';
            }
          }
        }

        // 5. RESOLVER CONVERSA NO TENANT
        let conversationId: string | null = null;
        const { data: activeConv } = await supabase
          .from('df_wa_conversations')
          .select('id, status, assigned_to')
          .eq('tenant_id', tenantId)
          .eq('contact_id', contactId)
          .not('status', 'in', '("finalizado","arquivado")')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeConv) {
          // Se já existe atendimento humano ativo, associa à conversa existente sem fechá-la
          conversationId = activeConv.id;
        } else if (!isTransactionalReminder && !isConfirmedAction) {
          // REGRA DEFINITIVA: Nem disparo automático nem confirmação de agendamento do paciente
          // criam df_wa_conversations quando não existe atendimento humano ativo.
          // Somente mensagens livres que demandem suporte humano criam atendimento na fila.
          const initialStatus = isFromMe ? 'em_atendimento' : 'na_fila';

          const newConvId = `cnv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const { data: createdConv, error: convErr } = await supabase
            .from('df_wa_conversations')
            .insert({
              id: newConvId,
              tenant_id: tenantId,
              contact_id: contactId,
              status: initialStatus,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (convErr) {
            console.error('[Dental Webhook] Erro ao criar conversa inicial:', convErr);
          }

          if (!convErr && createdConv) {
            conversationId = createdConv.id;
          } else {
            const { data: retryConv } = await supabase
              .from('df_wa_conversations')
              .select('id')
              .eq('tenant_id', tenantId)
              .eq('contact_id', contactId)
              .not('status', 'in', '("finalizado","arquivado")')
              .maybeSingle();
            conversationId = retryConv?.id || null;
          }
        }

        // Inserir evento de auditoria de confirmação ou necessidade de atenção
        if (matchedAppointmentId && conversationId) {
          if (responseClassification === 'AFFIRMATIVE') {
            await supabase.from('df_wa_events').insert({
              id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              tenant_id: tenantId,
              conversation_id: conversationId,
              event_type: 'appointment_confirmed_via_whatsapp',
              description: 'Consulta confirmada pelo paciente via WhatsApp.',
              metadata: {
                appointment_id: matchedAppointmentId,
                contact_id: contactId,
                method: contextInfo?.stanzaId ? 'whatsapp_reply' : 'whatsapp_unquoted_match',
                message_content: content,
                confirmed_at: new Date().toISOString(),
              },
              created_at: new Date().toISOString(),
            });
          } else if (responseClassification === 'NEGATIVE') {
            await supabase.from('df_wa_events').insert({
              id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              tenant_id: tenantId,
              conversation_id: conversationId,
              event_type: 'appointment_attention_required',
              description: 'Paciente respondeu que pode não comparecer ou precisa remarcar.',
              metadata: {
                appointment_id: matchedAppointmentId,
                contact_id: contactId,
                message_content: content,
              },
              created_at: new Date().toISOString(),
            });
          }
        }

        // 6. IDEMPOTÊNCIA & UPSERT DA MENSAGEM COM CONTACT_ID E APPOINTMENT_ID
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const originToSave = isTransactionalReminder
          ? transactionalOrigin
          : (isFromMe ? 'attendant' : 'patient');

        const { data: savedMsg, error: saveErr } = await supabase
          .from('df_wa_messages')
          .upsert(
            {
              id: messageId,
              tenant_id: tenantId,
              conversation_id: conversationId,
              contact_id: contactId,
              appointment_id: matchedAppointmentId || null,
              evolution_msg_id: evolutionMsgId,
              from_me: isFromMe,
              content,
              origin: originToSave,
              msg_type: msgType,
              media_mime_type: mediaData?.mime,
              media_file_name: mediaData?.name,
              is_read: isFromMe,
              reply_to_id: replyToId,
              remote_jid: remoteJid,
              participant_jid: data.key?.participant || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              onConflict: 'tenant_id,evolution_msg_id',
              ignoreDuplicates: true,
            }
          )
          .select('id, media_storage_path')
          .maybeSingle();

        if (saveErr) {
          console.error('[Dental Webhook] Erro ao salvar mensagem:', saveErr);
        }

        // 6.5 NOTIFICAÇÃO GLOBAL IN-APP & WEB PUSH (Para mensagens recebidas que não sejam automação da agenda)
        if (!isFromMe && !isConfirmedAction) {
          const finalMsgDbId = savedMsg?.id || messageId;
          const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const targetUserId = activeConv?.assigned_to || null;

          // Formatar preview amigável do conteúdo
          let notificationPreview = content ? content.slice(0, 120) : '';
          if (msgType === 'audio') {
            notificationPreview = '🎤 Mensagem de voz';
          } else if (msgType === 'image') {
            notificationPreview = content ? `📷 Foto: ${content.slice(0, 100)}` : '📷 Foto recebida';
          } else if (msgType === 'document') {
            notificationPreview = `📄 Documento: ${mediaData?.name || 'arquivo recebido'}`;
          } else if (msgType === 'video') {
            notificationPreview = content ? `🎥 Vídeo: ${content.slice(0, 100)}` : '🎥 Vídeo recebido';
          } else if (msgType === 'sticker') {
            notificationPreview = '🖼️ Figurinha';
          } else if (msgType === 'contact') {
            notificationPreview = '👤 Contato compartilhado';
          }
          if (!notificationPreview) {
            notificationPreview = 'Nova mensagem recebida';
          }

          // Formatar nome amigável do contato
          const contactDisplayName =
            (existingContact?.name && !isPhoneLikeContactName(existingContact.name, whatsappNumber))
              ? existingContact.name
              : (clientName && !isPhoneLikeContactName(clientName, whatsappNumber))
              ? clientName
              : (whatsappNumber.length >= 10
                  ? `(${whatsappNumber.slice(2, 4)}) ${whatsappNumber.slice(4)}`
                  : whatsappNumber);

          const notifTitle = isGroup ? `[Grupo] ${contactDisplayName}` : contactDisplayName;

          // Inserir notificação persistente em df_notifications (idempotente por message_id)
          try {
            await supabase
              .from('df_notifications')
              .upsert(
                {
                  id: notifId,
                  tenant_id: tenantId,
                  user_id: targetUserId,
                  type: 'whatsapp_message',
                  title: notifTitle,
                  body: notificationPreview,
                  entity_type: 'whatsapp_conversation',
                  entity_id: conversationId || contactId,
                  is_read: false,
                  metadata: {
                    message_id: finalMsgDbId,
                    evolution_msg_id: evolutionMsgId,
                    conversation_id: conversationId,
                    contact_id: contactId,
                    whatsapp_number: whatsappNumber,
                    sender_name: contactDisplayName,
                    avatar_url: existingContact?.profile_pic_url || null,
                    is_group: isGroup,
                    msg_type: msgType,
                  },
                  created_at: new Date().toISOString(),
                },
                {
                  onConflict: 'id',
                  ignoreDuplicates: true,
                }
              );
          } catch (notifErr: any) {
            console.warn('[Dental Webhook] Aviso ao persistir notificação:', notifErr.message);
          }

          // Disparo assíncrono de Web Push para os dispositivos registrados
          try {
            fetch(`${supabaseUrl}/functions/v1/dental-whatsapp-api`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'send_push_notification',
                tenant_id: tenantId,
                user_id: targetUserId,
                title: notifTitle,
                body: notificationPreview,
                icon: existingContact?.profile_pic_url || '/icon-192.png',
                badge: '/favicon-32x32.png',
                tag: `wa_${tenantId}_${conversationId || whatsappNumber}`,
                data: {
                  url: `/whatsapp?conversationId=${conversationId || ''}&contactId=${contactId}&tenantId=${tenantId}`,
                  conversationId: conversationId,
                  contactId: contactId,
                  tenantId: tenantId,
                  messageId: finalMsgDbId,
                },
              }),
            }).catch((pErr: any) => {
              console.warn('[Dental Webhook] Falha silenciosa no envio do push:', pErr.message);
            });
          } catch (pushEx) {
            // Não interrompe o processamento do webhook
          }
        }

        // 7. DOWNLOAD E ARMAZENAMENTO DA MÍDIA (NO BUCKET dental-private)
        if (mediaData && evoUrl && evoKey) {
          const targetDbMsgId = savedMsg?.id || messageId;
          const ext = getExtensionFromMime(mediaData.mime);
          const storagePath = `${tenantId}/whatsapp/${conversationId}/${targetDbMsgId}.${ext}`;

          try {
            const fetchMediaUrl = `${evoUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`;
            const resMedia = await fetch(fetchMediaUrl, {
              method: 'POST',
              headers: {
                apikey: evoKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ message: data }),
            });

            if (resMedia.ok) {
              const resJson = await resMedia.json();
              let b64 = typeof resJson === 'string' ? resJson : resJson?.base64 || resJson?.media || '';
              b64 = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');

              if (b64) {
                const bin = decodeBase64ToUint8Array(b64);
                b64 = ''; // Liberar memória

                const { error: upError } = await supabase.storage
                  .from('dental-private')
                  .upload(storagePath, bin, {
                    contentType: mediaData.mime || 'application/octet-stream',
                    upsert: true,
                  });

                if (!upError) {
                  await supabase
                    .from('df_wa_messages')
                    .update({
                      media_storage_path: storagePath,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('tenant_id', tenantId)
                    .eq('evolution_msg_id', evolutionMsgId);
                } else {
                  console.error('[Dental Webhook] Erro no upload para dental-private:', upError);
                }
              }
            }
          } catch (mediaErr) {
            console.error('[Dental Webhook] Exceção ao baixar mídia:', mediaErr);
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // =========================================================================
    // ATUALIZAÇÃO DE STATUS DE ENTREGA (messages.update)
    // =========================================================================
    if ((event === 'messages.update' || event === 'MESSAGES_UPDATE') && payload.data) {
      const updates = Array.isArray(payload.data) ? payload.data : [payload.data];
      for (const item of updates) {
        const msgId = item.keyId || item.key?.id;
        const rawStatus = item.status || item.update?.status || item.delivery_status;

        let statusNum = 0;
        if (typeof rawStatus === 'number') {
          statusNum = rawStatus;
        } else if (typeof rawStatus === 'string') {
          const map: Record<string, number> = {
            PENDING: 1,
            SERVER_ACK: 2,
            DELIVERY_ACK: 3,
            READ: 4,
            PLAYED: 5,
          };
          statusNum = map[rawStatus] || 0;
        }

        if (msgId && statusNum > 0) {
          await supabase
            .from('df_wa_messages')
            .update({ delivery_status: statusNum, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('evolution_msg_id', msgId);
        }
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // =========================================================================
    // EVENTO DE CHAMADA (CALL)
    // =========================================================================
    if ((event === 'CALL' || event === 'call') && payload.data) {
      const callData = payload.data;
      const callerJid = callData.from || '';
      const whatsappNumber = normalizeBrazilianNumber(callerJid.split('@')[0]);

      if (whatsappNumber) {
        // Encontrar contato
        const { data: ctc } = await supabase
          .from('df_wa_contacts')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('whatsapp_number', whatsappNumber)
          .maybeSingle();

        // Encontrar conversa ativa
        let convId: string | null = null;
        if (ctc) {
          const { data: conv } = await supabase
            .from('df_wa_conversations')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('contact_id', ctc.id)
            .not('status', 'in', '("finalizado","arquivado")')
            .maybeSingle();
          convId = conv?.id || null;
        }

        const callStatus = callData.status === 'offer' ? 'missed' : 'missed';
        await supabase.from('df_wa_calls').insert({
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          tenant_id: tenantId,
          conversation_id: convId,
          contact_id: ctc?.id || null,
          call_id: callData.id || null,
          call_type: callData.isVideo ? 'video' : 'voice',
          call_status: callStatus,
          caller_number: whatsappNumber,
          caller_name: ctc?.name || whatsappNumber,
          created_at: new Date().toISOString(),
        });

        if (convId) {
          await supabase.from('df_wa_events').insert({
            id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            tenant_id: tenantId,
            conversation_id: convId,
            event_type: 'call_missed',
            description: `Chamada de ${callData.isVideo ? 'vídeo' : 'voz'} perdida de ${ctc?.name || whatsappNumber}.`,
            metadata: callData,
            created_at: new Date().toISOString(),
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // =========================================================================
    // ATUALIZAÇÃO DE STATUS DA INSTÂNCIA (connection.update / qrcode.updated)
    // =========================================================================
    if ((event === 'connection.update' || event === 'CONNECTION_UPDATE') && payload.data) {
      const state = payload.data.state || payload.data.status;
      let newStatus: string | null = null;
      if (state === 'open') newStatus = 'connected';
      else if (state === 'close') newStatus = 'disconnected';
      else if (state === 'connecting') newStatus = 'connecting';

      const updateData: any = { updated_at: new Date().toISOString() };
      if (newStatus) updateData.status = newStatus;

      const ownerJid = payload.data.ownerJid || payload.data.owner || payload.data.instance?.ownerJid;
      if (ownerJid) {
        updateData.phone_number = normalizeBrazilianNumber(ownerJid.split('@')[0]);
      }
      const pName = payload.data.profileName || payload.data.instance?.profileName;
      if (pName) {
        updateData.profile_name = pName;
      }

      await supabase
        .from('df_wa_instances')
        .update(updateData)
        .eq('instance_name', instanceName);

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    if ((event === 'qrcode.updated' || event === 'QRCODE_UPDATED') && payload.data) {
      const qr = payload.data.qrcode?.base64 || payload.data.qrcode || payload.data.base64;
      if (qr) {
        await supabase
          .from('df_wa_instances')
          .update({
            status: 'qrcode',
            qrcode: qr,
            updated_at: new Date().toISOString(),
          })
          .eq('instance_name', instanceName);
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (err: any) {
    console.error('[Dental Webhook] Erro crítico:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
