import { supabase } from '../lib/supabaseClient';
import { StorageService, DENTAL_STORAGE_BUCKET } from '../lib/storageService';
import { Appointment } from '../types';
import {
  WhatsAppChatStatus,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppContact,
  WhatsAppEvent,
  WhatsAppTransfer,
  WhatsAppInternalNote,
  WhatsAppCall,
  WhatsAppTimelineItem,
  WhatsAppInstance,
  WhatsAppMessageType,
  WhatsAppMessageOrigin,
  WhatsAppReminderType,
  WhatsAppReminderStatus,
  WhatsAppReminderLog,
  WhatsAppReminderSettings,
} from '../types/whatsapp';
import { normalizeBrazilianNumber, isValidBrazilianPhone, formatPhoneDisplay, isWhatsAppGroup } from '../lib/phoneUtils';
import { formatDateBr } from '../lib/masks';
import { renderAppointmentTemplate } from '../lib/appointmentDateUtils';
import { db } from '../lib/db';
async function extractEdgeFunctionError(error: any): Promise<string> {
  if (!error) return 'Erro desconhecido.';
  try {
    if (error.context && typeof error.context.json === 'function') {
      const body = await error.context.json();
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    }
  } catch (_e) {}
  return error.message || 'Falha na comunicação com o servidor.';
}

export const DentalWhatsAppService = {
  /**
   * Obtém a configuração da instância Evolution configurada para a clínica (tenant).
   */
  async getInstanceConfig(tenantId: string): Promise<WhatsAppInstance | null> {
    if (!tenantId) return null;
    const { data, error } = await supabase
      .from('df_wa_instances')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.warn('[DentalWhatsAppService] Erro ao carregar instância:', error.message);
      return null;
    }
    return data as WhatsAppInstance | null;
  },

  /**
   * Onboarding Automático: provisiona a instância exclusiva da clínica e retorna o QR Code.
   * Não requer URL nem API Key do usuário da clínica (usa a infraestrutura global da plataforma).
   */
  async createInstance(
    tenantId: string
  ): Promise<{
    success: boolean;
    status?: string;
    instance_name?: string;
    qrcode?: string | null;
    phone_number?: string | null;
    profile_name?: string | null;
    message?: string;
    error?: string;
  }> {
    if (!tenantId) return { success: false, error: 'tenantId ausente' };

    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'create_instance',
          tenant_id: tenantId,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return data || { success: false, error: 'Sem resposta do servidor' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao conectar instância' };
    }
  },

  /**
   * Consulta o status em tempo real da conexão na Evolution API e no banco de dados.
   */
  async getInstanceStatus(
    tenantId: string
  ): Promise<{
    exists: boolean;
    status?: 'connected' | 'disconnected' | 'connecting' | 'qrcode' | 'not_configured';
    instance_name?: string;
    phone_number?: string | null;
    profile_name?: string | null;
    qrcode?: string | null;
    error?: string;
  }> {
    if (!tenantId) return { exists: false, status: 'not_configured' };

    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'get_status',
          tenant_id: tenantId,
        },
      });

      if (error) {
        return { exists: false, status: 'not_configured', error: error.message };
      }
      return data || { exists: false, status: 'not_configured' };
    } catch (err: any) {
      return { exists: false, status: 'not_configured', error: err.message };
    }
  },

  /**
   * Desconecta o WhatsApp da clínica com segurança via backend.
   */
  async disconnectInstance(
    tenantId: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!tenantId) return { success: false, error: 'tenantId ausente' };

    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'disconnect',
          tenant_id: tenantId,
        },
      });

      if (error) {
        const safeMsg = await extractEdgeFunctionError(error);
        return { success: false, error: safeMsg };
      }
      return data || { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao desconectar' };
    }
  },

  /**
   * Sincroniza e enriquece nomes e fotos de contatos a partir da agenda do aparelho conectado na Evolution API.
   * Não altera nomes vindos de cadastro de pacientes nem nomes definidos manualmente.
   */
  async syncContactsNames(
    tenantId: string
  ): Promise<{
    success: boolean;
    updatedCount?: number;
    alreadyCorrectCount?: number;
    notFoundCount?: number;
    totalProcessed?: number;
    error?: string;
  }> {
    if (!tenantId) return { success: false, error: 'tenantId ausente' };

    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'sync_contacts_names',
          tenant_id: tenantId,
        },
      });

      if (error) {
        const safeMsg = await extractEdgeFunctionError(error);
        return { success: false, error: safeMsg };
      }
      return data || { success: true, updatedCount: 0 };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao sincronizar agenda de contatos' };
    }
  },


  /**
   * Obtém a configuração global da Evolution API (área de consultoria / admin).
   * A chave NUNCA é retornada ao frontend (has_api_key: boolean).
   */
  async getGlobalConfig(
    tenantId?: string
  ): Promise<{ api_url: string; has_api_key: boolean; updated_at?: string | null; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'get_global_config',
          tenant_id: tenantId,
        },
      });

      if (error) {
        const safeMsg = await extractEdgeFunctionError(error);
        return { api_url: '', has_api_key: false, error: safeMsg };
      }
      return data || { api_url: '', has_api_key: false };
    } catch (err: any) {
      return { api_url: '', has_api_key: false, error: err.message || 'Falha ao consultar configuração global' };
    }
  },

  /**
   * Salva a configuração global da Evolution API (apenas administradores da plataforma).
   */
  async saveGlobalConfig(
    params: { apiUrl: string; apiKey?: string; tenantId?: string }
  ): Promise<{ success: boolean; configured?: boolean; message?: string; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'save_global_config',
          tenant_id: params.tenantId,
          api_url: params.apiUrl,
          api_key: params.apiKey,
        },
      });

      if (error) {
        const safeMsg = await extractEdgeFunctionError(error);
        return { success: false, error: safeMsg };
      }
      return data || { success: true, configured: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao salvar configuração global' };
    }
  },

  /**
   * Testa a conexão server-side com a Evolution API global (apenas administradores da plataforma).
   * O backend realiza o teste e retorna status seguro, sem devolver a chave.
   */
  async testGlobalConfig(
    params?: { apiUrl?: string; apiKey?: string }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'test_global_config',
          api_url: params?.apiUrl,
          api_key: params?.apiKey,
        },
      });

      if (error) {
        const safeMsg = await extractEdgeFunctionError(error);
        return { success: false, message: safeMsg };
      }
      return data || { success: false, message: 'Sem resposta do servidor.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro ao testar conexão global com a Evolution API.' };
    }
  },

  /**
   * Salva ou atualiza a configuração da instância da clínica via Edge Function segura.
   * A api_key e webhook_secret são persistidos no cofre df_wa_instance_secrets server-side.
   */
  async saveInstanceConfig(
    tenantId: string,
    params: {
      apiUrl: string;
      instanceName: string;
      apiKey?: string;
      webhookSecret?: string;
      webhookUrl?: string;
      status?: 'connected' | 'disconnected' | 'connecting' | 'qrcode';
    }
  ): Promise<{ success: boolean; error?: string }> {
    if (!tenantId) return { success: false, error: 'tenantId ausente' };

    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'save_config',
          tenant_id: tenantId,
          api_url: params.apiUrl,
          instance_name: params.instanceName,
          api_key: params.apiKey,
          webhook_secret: params.webhookSecret,
          webhook_url: params.webhookUrl,
          status: params.status,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao salvar configuração' };
    }
  },

  /**
   * Testa a conexão com a Evolution API exclusivamente via backend server-side.
   * O browser nunca faz requisições diretas nem recebe a chave.
   */
  async testConnection(
    tenantId: string
  ): Promise<{ success: boolean; state?: string; status?: string; message: string }> {
    if (!tenantId) return { success: false, message: 'Clínica não informada.' };

    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'test_connection',
          tenant_id: tenantId,
        },
      });

      if (error) {
        return { success: false, message: error.message };
      }
      return data || { success: false, message: 'Sem resposta do servidor.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao testar conexão.' };
    }
  },

  /**
   * Lista conversas ativas da clínica.
   */
  async getConversations(
    tenantId: string,
    filter?: { status?: WhatsAppChatStatus; assignedTo?: string }
  ): Promise<WhatsAppConversation[]> {
    if (!tenantId) return [];

    let query = supabase
      .from('df_wa_conversations')
      .select(`
        *,
        contact:df_wa_contacts(*),
        assigned_user:df_users!df_wa_conversations_assigned_to_fkey(id, name, email, role),
        observation_assigned_user:df_users!df_wa_conversations_observation_assigned_to_fkey(id, name)
      `)
      .eq('tenant_id', tenantId)
      .not('status', 'in', '("finalizado","arquivado")')
      .order('last_message_at', { ascending: false });

    if (filter?.status) {
      query = query.eq('status', filter.status);
    }
    if (filter?.assignedTo) {
      query = query.eq('assigned_to', filter.assignedTo);
    }

    const { data, error } = await query;
    if (error) {
      // Fallback sem foreign keys explícitas caso o schema esteja com aliases
      console.warn('[DentalWhatsAppService] Falha na consulta com joins avançados, tentando consulta direta:', error.message);
      const { data: simpleData, error: simpleErr } = await supabase
        .from('df_wa_conversations')
        .select(`
          *,
          contact:df_wa_contacts(*)
        `)
        .eq('tenant_id', tenantId)
        .not('status', 'in', '("finalizado","arquivado")')
        .order('last_message_at', { ascending: false });

      if (simpleErr) {
        console.error('[DentalWhatsAppService] Erro ao buscar conversas:', simpleErr.message);
        return [];
      }
      return (simpleData || []) as any as WhatsAppConversation[];
    }

    return (data || []) as any as WhatsAppConversation[];
  },

  /**
   * Lista histórico de conversas finalizadas ou arquivadas.
   */
  async getHistory(tenantId: string): Promise<WhatsAppConversation[]> {
    if (!tenantId) return [];

    const { data, error } = await supabase
      .from('df_wa_conversations')
      .select(`
        *,
        contact:df_wa_contacts(*)
      `)
      .eq('tenant_id', tenantId)
      .in('status', ['finalizado', 'arquivado'])
      .order('last_message_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[DentalWhatsAppService] Erro ao buscar histórico:', error.message);
      return [];
    }
    return (data || []) as any as WhatsAppConversation[];
  },

  /**
   * Obtém detalhes de contexto de uma conversa específica.
   */
  async getConversationContext(
    conversationId: string,
    tenantId: string
  ): Promise<WhatsAppConversation | null> {
    if (!conversationId || !tenantId) return null;

    const { data, error } = await supabase
      .from('df_wa_conversations')
      .select(`
        *,
        contact:df_wa_contacts(*, patient:df_patients(id, name, cpf, phone, email))
      `)
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('[DentalWhatsAppService] Erro ao carregar contexto da conversa:', error.message);
      return null;
    }
    return data as any as WhatsAppConversation | null;
  },

  /**
   * Timeline unificada: agrega mensagens, notas internas, transferências, chamadas e eventos.
   */
  async getTimeline(
    conversationId: string,
    tenantId: string
  ): Promise<WhatsAppTimelineItem[]> {
    if (!conversationId || !tenantId) return [];

    // Executa as consultas em paralelo respeitando o tenant
    const [messagesRes, eventsRes, transfersRes, notesRes, callsRes] = await Promise.all([
      supabase
        .from('df_wa_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),

      supabase
        .from('df_wa_events')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),

      supabase
        .from('df_wa_transfers')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('tenant_id', tenantId)
        .order('transferred_at', { ascending: true }),

      supabase
        .from('df_wa_internal_notes')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),

      supabase
        .from('df_wa_calls')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true }),
    ]);

    const items: WhatsAppTimelineItem[] = [];

    // Mapear mensagens
    if (messagesRes.data) {
      const messagesMap = new Map<string, WhatsAppMessage>();
      messagesRes.data.forEach((m: any) => messagesMap.set(m.id, m));

      messagesRes.data.forEach((m: any) => {
        const fullMsg: WhatsAppMessage = {
          ...m,
          reply_to_message: m.reply_to_id ? messagesMap.get(m.reply_to_id) || null : null,
        };
        items.push({
          id: fullMsg.id,
          type: 'message',
          created_at: fullMsg.created_at,
          data: { type: 'message', item: fullMsg },
        });
      });
    }

    // Mapear eventos
    if (eventsRes.data) {
      eventsRes.data.forEach((e: any) => {
        items.push({
          id: e.id,
          type: 'event',
          created_at: e.created_at,
          data: { type: 'event', item: e as WhatsAppEvent },
        });
      });
    }

    // Mapear transferências
    if (transfersRes.data) {
      transfersRes.data.forEach((t: any) => {
        items.push({
          id: t.id,
          type: 'transfer',
          created_at: t.transferred_at,
          data: { type: 'transfer', item: t as WhatsAppTransfer },
        });
      });
    }

    // Mapear notas internas
    if (notesRes.data) {
      notesRes.data.forEach((n: any) => {
        items.push({
          id: n.id,
          type: 'note',
          created_at: n.created_at,
          data: { type: 'note', item: n as WhatsAppInternalNote },
        });
      });
    }

    // Mapear chamadas
    if (callsRes.data) {
      callsRes.data.forEach((c: any) => {
        items.push({
          id: c.id,
          type: 'call',
          created_at: c.created_at,
          data: { type: 'call', item: c as WhatsAppCall },
        });
      });
    }

    // Ordenar cronologicamente
    items.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return items;
  },

  /**
   * Obtém a política de identificação do atendente configurada para o tenant (AUTOMATICO, SEMPRE, NUNCA).
   */
  async getAgentIdentificationPolicy(tenantId: string): Promise<'AUTOMATICO' | 'SEMPRE' | 'NUNCA'> {
    if (!tenantId) return 'AUTOMATICO';
    try {
      const { data } = await supabase
        .from('df_wa_reminder_settings')
        .select('agent_identification_policy')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      return (data?.agent_identification_policy as any) || 'AUTOMATICO';
    } catch {
      return 'AUTOMATICO';
    }
  },

  /**
   * Atualiza a política de identificação do atendente para o tenant.
   */
  async updateAgentIdentificationPolicy(
    tenantId: string,
    policy: 'AUTOMATICO' | 'SEMPRE' | 'NUNCA'
  ): Promise<{ success: boolean; error?: string }> {
    if (!tenantId) return { success: false, error: 'tenantId ausente' };
    const { error } = await supabase
      .from('df_wa_reminder_settings')
      .update({ agent_identification_policy: policy, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  },

  /**
   * Aplica a assinatura externa do atendente à mensagem enviada para a Evolution API.
   * Não altera o texto interno salvo no banco (df_wa_messages.content).
   */
  async formatOutboundTextWithAgent(params: {
    tenantId: string;
    senderId?: string;
    text: string;
  }): Promise<string> {
    const { tenantId, senderId, text } = params;
    if (!text || !senderId || !tenantId) return text;

    try {
      const policy = await this.getAgentIdentificationPolicy(tenantId);
      if (policy === 'NUNCA') return text;

      // Buscar nome do atendente
      const { data: userRow } = await supabase
        .from('df_users')
        .select('name, role, is_active')
        .eq('id', senderId)
        .eq('clinic_id', tenantId)
        .maybeSingle();

      if (!userRow?.name) return text;
      const firstName = userRow.name.trim().split(' ')[0] || userRow.name.trim();

      if (policy === 'SEMPRE') {
        return `${firstName}:\n${text}`;
      }

      // Se AUTOMATICO: verificar se há 2 ou mais atendentes ativos com permissão de WhatsApp
      const staffList = await this.getStaff(tenantId);
      const activeAttendants = staffList.filter(
        (u) =>
          u.role &&
          ['OWNER', 'ADMIN', 'RECEPTION', 'ASSISTANT', 'DENTIST', 'PROFESSIONAL', 'SUPER_ADMIN'].includes(u.role)
      );

      if (activeAttendants.length >= 2) {
        return `${firstName}:\n${text}`;
      }

      return text;
    } catch (e) {
      console.warn('[DentalWhatsAppService] Aviso ao formatar nome do atendente:', e);
      return text;
    }
  },

  /**
   * Envia mensagem de texto via Evolution API e persiste localmente.
   */
  async sendMessage(params: {
    conversationId: string;
    tenantId: string;
    senderId?: string;
    content: string;
    replyToId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { conversationId, tenantId, senderId, content, replyToId } = params;
    if (!content.trim()) return { success: false, error: 'Conteúdo vazio' };

    // Buscar conversa e contato
    const { data: conv } = await supabase
      .from('df_wa_conversations')
      .select('id, contact:df_wa_contacts(whatsapp_number)')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single();

    const recipientNumber = (conv.contact as any).whatsapp_number;
    let evolutionMsgId: string | undefined;
    let quotedPayload: any = undefined;

    // Se tiver reply, buscar evolution_msg_id da mensagem original
    if (replyToId) {
      const { data: replyMsg } = await supabase
        .from('df_wa_messages')
        .select('evolution_msg_id, from_me, content')
        .eq('id', replyToId)
        .maybeSingle();

      if (replyMsg?.evolution_msg_id) {
        quotedPayload = {
          key: {
            id: replyMsg.evolution_msg_id,
            fromMe: replyMsg.from_me,
            remoteJid: `${recipientNumber}@s.whatsapp.net`,
          },
          message: { conversation: replyMsg.content },
        };
      }
    }

    // Formatar texto de saída para o WhatsApp do paciente de acordo com a política de identificação
    const outboundText = await this.formatOutboundTextWithAgent({
      tenantId,
      senderId,
      text: content.trim(),
    });

    // Envio server-side seguro via Edge Function dental-whatsapp-api (a api_key nunca chega ao frontend)
    let sendError: string | null = null;
    try {
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'send_text',
          tenant_id: tenantId,
          conversation_id: conversationId,
          recipient_number: recipientNumber,
          text: outboundText,
          quoted: quotedPayload,
        },
      });

      if (!edgeErr && edgeRes?.success) {
        evolutionMsgId = edgeRes.messageId;
      } else {
        sendError = edgeErr?.message || edgeRes?.error || 'Falha ao despachar mensagem pelo WhatsApp';
        console.error('[DentalWhatsAppService] Erro no envio Evolution server-side:', sendError);
      }
    } catch (e: any) {
      sendError = e?.message || 'Falha de conexão com a Edge Function';
      console.error('[DentalWhatsAppService] Falha ao invocar Edge Function dental-whatsapp-api:', sendError);
    }

    // Persistir mensagem no banco
    const dbMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { error: insErr } = await supabase.from('df_wa_messages').insert({
      id: dbMsgId,
      tenant_id: tenantId,
      conversation_id: conversationId,
      sender_id: senderId || null,
      evolution_msg_id: evolutionMsgId || null,
      from_me: true,
      content: content.trim(),
      msg_type: 'text',
      is_read: true,
      delivery_status: evolutionMsgId ? 2 : -1, // 2: Enviado ao servidor; -1: Falha no envio
      reply_to_id: replyToId || null,
      remote_jid: `${recipientNumber}@s.whatsapp.net`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insErr) {
      return { success: false, error: insErr.message };
    }

    if (sendError) {
      return { success: false, messageId: dbMsgId, error: sendError };
    }

    return { success: true, messageId: dbMsgId };
  },

  /**
   * Envia arquivo de mídia (imagem, documento, vídeo, etc.)
   */
  async sendMediaMessage(params: {
    conversationId: string;
    tenantId: string;
    senderId?: string;
    file: File;
    caption?: string;
    replyToId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { conversationId, tenantId, senderId, file, caption, replyToId } = params;

    const { data: conv } = await supabase
      .from('df_wa_conversations')
      .select('id, contact:df_wa_contacts(whatsapp_number)')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single();

    if (!conv || !conv.contact) {
      return { success: false, error: 'Conversa não encontrada' };
    }

    const recipientNumber = (conv.contact as any).whatsapp_number;
    const dbMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ext = file.name.split('.').pop() || 'bin';
    const storagePath = `${tenantId}/whatsapp/${conversationId}/${dbMsgId}.${ext}`;

    // Upload seguro para o bucket dental-private
    const { error: upErr } = await supabase.storage
      .from(DENTAL_STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (upErr) {
      return { success: false, error: `Falha no upload: ${upErr.message}` };
    }

    // Determinar tipo da mensagem
    let msgType: WhatsAppMessageType = 'document';
    if (file.type.startsWith('image/')) msgType = 'image';
    else if (file.type.startsWith('video/')) msgType = 'video';
    else if (file.type.startsWith('audio/')) msgType = 'audio';

    let evolutionMsgId: string | undefined;

    // Disparo server-side seguro de mídia via Edge Function dental-whatsapp-api
    let sendError: string | null = null;
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);

      let outboundCaption = caption;
      if (caption && caption.trim()) {
        outboundCaption = await this.formatOutboundTextWithAgent({
          tenantId,
          senderId,
          text: caption.trim(),
        });
      }

      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'send_media',
          tenant_id: tenantId,
          conversation_id: conversationId,
          recipient_number: recipientNumber,
          media_type: msgType,
          base64: b64,
          mime_type: file.type || 'application/octet-stream',
          file_name: file.name,
          caption: outboundCaption,
        },
      });

      if (!edgeErr && edgeRes?.success) {
        evolutionMsgId = edgeRes.messageId;
      } else {
        sendError = edgeErr?.message || edgeRes?.error || 'Falha ao despachar mídia pelo WhatsApp';
        console.error('[DentalWhatsAppService] Erro no envio de mídia Evolution server-side:', sendError);
      }
    } catch (evoErr: any) {
      sendError = evoErr?.message || 'Falha de conexão com a Edge Function';
      console.error('[DentalWhatsAppService] Falha ao enviar mídia via Edge Function:', sendError);
    }

    // Persistir mensagem
    const { error: insErr } = await supabase.from('df_wa_messages').insert({
      id: dbMsgId,
      tenant_id: tenantId,
      conversation_id: conversationId,
      sender_id: senderId || null,
      evolution_msg_id: evolutionMsgId || null,
      from_me: true,
      content: caption || '',
      msg_type: msgType,
      media_storage_path: storagePath,
      media_file_name: file.name,
      media_mime_type: file.type,
      is_read: true,
      delivery_status: evolutionMsgId ? 2 : -1, // 2: Enviado; -1: Falha
      reply_to_id: replyToId || null,
      remote_jid: `${recipientNumber}@s.whatsapp.net`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insErr) {
      return { success: false, error: insErr.message };
    }

    if (sendError) {
      return { success: false, messageId: dbMsgId, error: sendError };
    }

    return { success: true, messageId: dbMsgId };
  },

  /**
   * Envia áudio gravado (Voice Note PTT)
   */
  async sendAudioMessage(params: {
    conversationId: string;
    tenantId: string;
    senderId?: string;
    audioBlob: Blob;
    replyToId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { conversationId, tenantId, senderId, audioBlob, replyToId } = params;

    const { data: conv } = await supabase
      .from('df_wa_conversations')
      .select('id, contact:df_wa_contacts(whatsapp_number)')
      .eq('id', conversationId)
      .eq('tenant_id', tenantId)
      .single();

    if (!conv || !conv.contact) {
      return { success: false, error: 'Conversa não encontrada' };
    }

    const recipientNumber = (conv.contact as any).whatsapp_number;
    const dbMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const storagePath = `${tenantId}/whatsapp/${conversationId}/${dbMsgId}.ogg`;

    // Upload seguro para bucket privado
    const { error: upErr } = await supabase.storage
      .from(DENTAL_STORAGE_BUCKET)
      .upload(storagePath, audioBlob, {
        contentType: audioBlob.type || 'audio/ogg',
        upsert: true,
      });

    if (upErr) {
      return { success: false, error: upErr.message };
    }

    let evolutionMsgId: string | undefined;
    let sendError: string | null = null;

    // Disparo server-side seguro de áudio via Edge Function dental-whatsapp-api
    try {
      const buffer = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);

      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'send_media',
          tenant_id: tenantId,
          conversation_id: conversationId,
          recipient_number: recipientNumber,
          media_type: 'audio',
          base64: b64,
          mime_type: audioBlob.type || 'audio/ogg',
        },
      });

      if (!edgeErr && edgeRes?.success) {
        evolutionMsgId = edgeRes.messageId;
      } else {
        sendError = edgeErr?.message || edgeRes?.error || 'Falha ao despachar áudio pelo WhatsApp';
        console.error('[DentalWhatsAppService] Erro no envio de áudio Evolution server-side:', sendError);
      }
    } catch (err: any) {
      sendError = err?.message || 'Falha de conexão com a Edge Function';
      console.error('[DentalWhatsAppService] Falha no envio de áudio via Edge Function:', sendError);
    }

    // Persistir mensagem de áudio
    const { error: insErr } = await supabase.from('df_wa_messages').insert({
      id: dbMsgId,
      tenant_id: tenantId,
      conversation_id: conversationId,
      sender_id: senderId || null,
      evolution_msg_id: evolutionMsgId || null,
      from_me: true,
      content: '🎤 Mensagem de voz',
      msg_type: 'audio',
      media_storage_path: storagePath,
      media_file_name: 'audio.ogg',
      media_mime_type: audioBlob.type || 'audio/ogg',
      is_read: true,
      delivery_status: evolutionMsgId ? 2 : -1, // 2: Enviado; -1: Falha
      reply_to_id: replyToId || null,
      remote_jid: `${recipientNumber}@s.whatsapp.net`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insErr) {
      return { success: false, error: insErr.message };
    }

    if (sendError) {
      return { success: false, messageId: dbMsgId, error: sendError };
    }

    return { success: true, messageId: dbMsgId };
  },

  /**
   * Reenvia uma mensagem que falhou no envio anterior (delivery_status === -1)
   */
  async retryFailedMessage(params: {
    messageId: string;
    tenantId: string;
    conversationId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { messageId, tenantId, conversationId } = params;

    const { data: msg, error: loadErr } = await supabase
      .from('df_wa_messages')
      .select('*')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .single();

    if (loadErr || !msg) {
      return { success: false, error: 'Mensagem não encontrada.' };
    }

    if (!msg.from_me) {
      return { success: false, error: 'Apenas mensagens enviadas pela clínica podem ser reenviadas.' };
    }

    const recipientNumber = msg.remote_jid ? msg.remote_jid.replace(/@.*$/, '') : null;
    if (!recipientNumber) {
      return { success: false, error: 'Número do destinatário não encontrado.' };
    }

    let evolutionMsgId: string | undefined;

    if (msg.msg_type === 'text') {
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'send_text',
          tenant_id: tenantId,
          conversation_id: conversationId,
          recipient_number: recipientNumber,
          text: msg.content,
        },
      });

      if (edgeErr || !edgeRes?.success) {
        const errMsg = edgeErr?.message || edgeRes?.error || 'Erro ao reenviar pelo WhatsApp';
        return { success: false, error: errMsg };
      }
      evolutionMsgId = edgeRes.messageId;
    } else if (msg.media_storage_path) {
      // Baixar arquivo do storage privado e reenviar
      const { data: fileData, error: dlErr } = await supabase.storage
        .from(DENTAL_STORAGE_BUCKET)
        .download(msg.media_storage_path);

      if (dlErr || !fileData) {
        return { success: false, error: `Falha ao carregar mídia para reenvio: ${dlErr?.message}` };
      }

      const buffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);

      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'send_media',
          tenant_id: tenantId,
          conversation_id: conversationId,
          recipient_number: recipientNumber,
          media_type: msg.msg_type,
          base64: b64,
          mime_type: msg.media_mime_type || fileData.type || 'application/octet-stream',
          file_name: msg.media_file_name || 'arquivo',
          caption: msg.content || '',
        },
      });

      if (edgeErr || !edgeRes?.success) {
        const errMsg = edgeErr?.message || edgeRes?.error || 'Erro ao reenviar mídia pelo WhatsApp';
        return { success: false, error: errMsg };
      }
      evolutionMsgId = edgeRes.messageId;
    } else {
      return { success: false, error: 'Tipo de mensagem não suportado para reenvio.' };
    }

    // Atualizar registro no banco para delivery_status = 2 (Enviado) e registrar evolution_msg_id
    await supabase
      .from('df_wa_messages')
      .update({
        delivery_status: 2,
        evolution_msg_id: evolutionMsgId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('tenant_id', tenantId);

    return { success: true };
  },

  /**
   * Assume atendimento de forma 100% atômica no banco (RPC df_wa_claim_conversation).
   */
  async claimConversation(
    conversationId: string,
    tenantId: string,
    userId: string
  ): Promise<{
    success: boolean;
    alreadyClaimed?: boolean;
    error?: string;
    assignedUserName?: string;
  }> {
    try {
      const { data, error } = await supabase.rpc('df_wa_claim_conversation', {
        p_conversation_id: conversationId,
        p_tenant_id: tenantId,
        p_user_id: userId,
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha ao assumir conversa' };
    }
  },

  /**
   * Transfere atendimento para outro profissional da clínica.
   */
  async transferConversation(params: {
    conversationId: string;
    tenantId: string;
    fromUserId?: string;
    toUserId: string;
    reason?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { conversationId, tenantId, fromUserId, toUserId, reason } = params;

    // Atualizar conversa
    const { error: updErr } = await supabase
      .from('df_wa_conversations')
      .update({
        assigned_to: toUserId,
        status: 'transferido',
        transfer_reason: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    // Registrar histórico de transferência
    await supabase.from('df_wa_transfers').insert({
      id: `trf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      conversation_id: conversationId,
      from_user_id: fromUserId || null,
      to_user_id: toUserId,
      reason: reason || null,
      transferred_at: new Date().toISOString(),
    });

    // Registrar evento na timeline
    await supabase.from('df_wa_events').insert({
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      conversation_id: conversationId,
      event_type: 'transferred',
      description: `Atendimento transferido para outro profissional. ${reason ? `Motivo: ${reason}` : ''}`,
      author_id: fromUserId || null,
      metadata: { from_user_id: fromUserId, to_user_id: toUserId, reason },
      created_at: new Date().toISOString(),
    });

    return { success: true };
  },

  /**
   * Finaliza atendimento com motivo e notas.
   */
  async finalizeConversation(params: {
    conversationId: string;
    tenantId: string;
    authorId?: string;
    reason?: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { conversationId, tenantId, authorId, reason, notes } = params;

    const { error: updErr } = await supabase
      .from('df_wa_conversations')
      .update({
        status: 'finalizado',
        finalized_at: new Date().toISOString(),
        finalization_reason: reason || 'Atendimento concluído',
        finalization_notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    // Evento de finalização
    await supabase.from('df_wa_events').insert({
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      conversation_id: conversationId,
      event_type: 'finalized',
      description: `Atendimento finalizado. Motivo: ${reason || 'Concluído'}`,
      author_id: authorId || null,
      metadata: { reason, notes },
      created_at: new Date().toISOString(),
    });

    return { success: true };
  },

  /**
   * Atualiza status da conversa (Kanban ou menu operacional).
   */
  async updateStatus(
    conversationId: string,
    tenantId: string,
    status: WhatsAppChatStatus,
    authorId?: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('df_wa_conversations')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);

    if (!error) {
      await supabase.from('df_wa_events').insert({
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tenant_id: tenantId,
        conversation_id: conversationId,
        event_type: 'status_changed',
        description: `Status alterado para "${status}".`,
        author_id: authorId || null,
        metadata: { new_status: status },
        created_at: new Date().toISOString(),
      });
      return true;
    }
    return false;
  },

  /**
   * Exclusão LOCAL de mensagem (apaga do sistema odontológico e do storage se aplicável).
   */
  async deleteMessageLocally(messageId: string, tenantId: string): Promise<boolean> {
    // Buscar caminho do storage antes do delete
    const { data: msg } = await supabase
      .from('df_wa_messages')
      .select('media_storage_path')
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (msg?.media_storage_path) {
      await StorageService.deleteAttachment(msg.media_storage_path);
    }

    const { error } = await supabase
      .from('df_wa_messages')
      .delete()
      .eq('id', messageId)
      .eq('tenant_id', tenantId);

    return !error;
  },

  /**
   * Marca mensagens da conversa como lidas (zera unread via RPC).
   */
  async markAsRead(conversationId: string, tenantId: string): Promise<void> {
    try {
      await supabase.rpc('df_wa_mark_as_read', {
        p_conversation_id: conversationId,
        p_tenant_id: tenantId,
      });
    } catch (e) {
      console.warn('[DentalWhatsAppService] markAsRead fallback:', e);
      await supabase
        .from('df_wa_conversations')
        .update({ unread_count: 0 })
        .eq('id', conversationId)
        .eq('tenant_id', tenantId);
    }
  },

  /**
   * Adiciona nota interna à conversa (visível apenas para a equipe da clínica).
   */
  async addInternalNote(
    conversationId: string,
    tenantId: string,
    authorId: string,
    content: string
  ): Promise<WhatsAppInternalNote | null> {
    if (!content.trim()) return null;

    const noteId = `not_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { data, error } = await supabase
      .from('df_wa_internal_notes')
      .insert({
        id: noteId,
        tenant_id: tenantId,
        conversation_id: conversationId,
        author_id: authorId,
        content: content.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      console.error('[DentalWhatsAppService] Erro ao adicionar nota interna:', error.message);
      return null;
    }
    return data as WhatsAppInternalNote;
  },

  /**
   * Lista contatos da clínica com busca opcional por nome ou número.
   */
  async getContacts(tenantId: string, search?: string): Promise<WhatsAppContact[]> {
    if (!tenantId) return [];

    let query = supabase
      .from('df_wa_contacts')
      .select('*, patient:df_patients(id, name, cpf, phone, email)')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(`name.ilike.%${term}%,whatsapp_number.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[DentalWhatsAppService] Erro ao listar contatos:', error.message);
      return [];
    }
    return (data || []) as any as WhatsAppContact[];
  },

  /**
   * Cria novo contato para a clínica e inicia uma conversa.
   */
  async createContact(
    tenantId: string,
    name: string,
    phone: string,
    patientId?: string
  ): Promise<{ contact: WhatsAppContact; conversation: WhatsAppConversation } | null> {
    const norm = normalizeBrazilianNumber(phone);
    if (!norm) throw new Error('Número de WhatsApp inválido.');

    const contactId = `ctc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { data: contact, error: ctcErr } = await supabase
      .from('df_wa_contacts')
      .upsert(
        {
          id: contactId,
          tenant_id: tenantId,
          name: name.trim(),
          whatsapp_number: norm,
          patient_id: patientId || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,whatsapp_number' }
      )
      .select('*, patient:df_patients(id, name, cpf, phone, email)')
      .single();

    if (ctcErr || !contact) {
      throw new Error(ctcErr?.message || 'Falha ao criar contato');
    }

    // Criar ou localizar conversa ativa
    const { data: existingConv } = await supabase
      .from('df_wa_conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contact.id)
      .not('status', 'in', '("finalizado","arquivado")')
      .maybeSingle();

    if (existingConv) {
      return {
        contact: contact as any as WhatsAppContact,
        conversation: existingConv as any as WhatsAppConversation,
      };
    }

    const newConvId = `cnv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { data: newConv, error: convErr } = await supabase
      .from('df_wa_conversations')
      .insert({
        id: newConvId,
        tenant_id: tenantId,
        contact_id: contact.id,
        status: 'em_atendimento',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (convErr || !newConv) {
      throw new Error(convErr?.message || 'Falha ao iniciar conversa');
    }

    return {
      contact: contact as any as WhatsAppContact,
      conversation: newConv as any as WhatsAppConversation,
    };
  },

  /**
   * Atualiza contato (ex: nome, paciente vinculado, etc.).
   */
  async updateContact(
    contactId: string,
    tenantId: string,
    updates: Partial<WhatsAppContact>
  ): Promise<WhatsAppContact | null> {
    const { data, error } = await supabase
      .from('df_wa_contacts')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      console.error('[DentalWhatsAppService] Erro ao atualizar contato:', error.message);
      return null;
    }
    return data as WhatsAppContact;
  },

  /**
   * Pesquisa mensagens no tenant por termo.
   */
  async searchMessages(
    tenantId: string,
    term: string,
    conversationId?: string
  ): Promise<WhatsAppMessage[]> {
    if (!tenantId || !term.trim()) return [];

    let query = supabase
      .from('df_wa_messages')
      .select('*')
      .eq('tenant_id', tenantId)
      .ilike('content', `%${term.trim()}%`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[DentalWhatsAppService] Erro na busca de mensagens:', error.message);
      return [];
    }
    return (data || []) as WhatsAppMessage[];
  },

  /**
   * Obtém lista de membros da equipe da clínica (df_users) para atribuição e transferência.
   */
  async getStaff(tenantId: string): Promise<{ id: string; name: string; role?: string; email?: string }[]> {
    if (!tenantId) return [];

    const { data, error } = await supabase
      .from('df_users')
      .select('id, name, role, email')
      .eq('clinic_id', tenantId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[DentalWhatsAppService] Erro ao buscar membros da equipe:', error.message);
      return [];
    }
    return (data || []) as any;
  },

  /**
   * Obtém Signed URL temporária de arquivo armazenado no bucket privado dental-private.
   */
  async getSignedMediaUrl(storagePath: string): Promise<string | null> {
    if (!storagePath) return null;
    if (storagePath.startsWith('http')) return storagePath;

    const res = await StorageService.createSignedUrl(storagePath, 3600); // 1 hora de validade
    return res.signedUrl;
  },

  /**
   * Sincroniza foto de perfil do contato via Edge Function segura e armazena em dental-private (sem CORS).
   */
  async syncProfilePic(
    contactId: string,
    tenantId: string,
    whatsappNumber: string
  ): Promise<string | null> {
    try {
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'sync_profile_pic',
          tenant_id: tenantId,
          contact_id: contactId,
          number: whatsappNumber,
        },
      });

      if (edgeErr) {
        console.warn('[DentalWhatsAppService] Erro ao sincronizar foto via API:', edgeErr.message);
        return null;
      }

      return edgeRes?.profilePicUrl || null;
    } catch (err: any) {
      console.warn('[DentalWhatsAppService] Falha ao sincronizar foto de perfil:', err.message);
      return null;
    }
  },

  /**
   * Envia reação com emoji a uma mensagem via Evolution API e persiste em df_wa_messages.reactions.
   */
  async sendReaction(params: {
    tenantId: string;
    conversationId: string;
    recipientNumber: string;
    evolutionMsgId: string;
    messageId: string;
    emoji: string;
    targetFromMe?: boolean;
    remoteJid?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const {
      tenantId,
      recipientNumber,
      evolutionMsgId,
      messageId,
      emoji,
      targetFromMe = false,
      remoteJid,
    } = params;
    try {
      // 1. Enviar para Evolution API via Edge Function segura
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'send_reaction',
          tenant_id: tenantId,
          recipient_number: recipientNumber,
          evolution_msg_id: evolutionMsgId,
          message_id: messageId,
          emoji,
          target_from_me: targetFromMe,
          remote_jid: remoteJid,
        },
      });

      if (edgeErr || edgeRes?.error) {
        console.warn('[DentalWhatsAppService] Aviso ao enviar reação:', edgeErr?.message || edgeRes?.error);
      }

      // 2. Atualizar reações no banco local para feedback imediato (operador do sistema reagiu => fromMe: true)
      const { data: msg } = await supabase
        .from('df_wa_messages')
        .select('reactions')
        .eq('id', messageId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const currentReactions: any[] = Array.isArray(msg?.reactions) ? msg.reactions : [];
      const updatedReactions = emoji
        ? [...currentReactions.filter((r) => r.fromMe !== true), { text: emoji, fromMe: true, timestamp: new Date().toISOString() }]
        : currentReactions.filter((r) => r.fromMe !== true);

      await supabase
        .from('df_wa_messages')
        .update({ reactions: updatedReactions, updated_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('tenant_id', tenantId);

      return { success: true };
    } catch (err: any) {
      console.error('[DentalWhatsAppService] Erro ao enviar reação:', err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * Pesquisa mensagens no histórico completo de uma conversa específica (case-insensitive).
   * Não afeta atendimento, status nem mensagens.
   */
  async searchMessagesInConversation(
    conversationId: string,
    tenantId: string,
    query: string
  ): Promise<WhatsAppMessage[]> {
    if (!conversationId || !tenantId || !query.trim()) return [];
    const term = query.trim();

    try {
      const { data, error } = await supabase
        .from('df_wa_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('tenant_id', tenantId)
        .or(`content.ilike.%${term}%,media_file_name.ilike.%${term}%`)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[DentalWhatsAppService] Erro ao pesquisar mensagens na conversa:', error.message);
        return [];
      }
      return (data || []) as WhatsAppMessage[];
    } catch (err: any) {
      console.error('[DentalWhatsAppService] Exceção ao pesquisar mensagens:', err);
      return [];
    }
  },

  /**
   * Obtém conversa ativa existente para um contato ou cria um NOVO ciclo de atendimento
   * caso todas as conversas anteriores estejam finalizadas/arquivadas.
   * Totalmente idempotente e seguro contra duplo clique / concorrência.
   */
  async getOrCreateActiveConversationForContact(params: {
    tenantId: string;
    contactId: string;
    userId: string;
    userName?: string;
  }): Promise<{ conversation: WhatsAppConversation; isNew: boolean }> {
    const { tenantId, contactId, userId, userName } = params;
    if (!tenantId || !contactId) {
      throw new Error('Parâmetros tenantId e contactId são obrigatórios.');
    }

    // 1. Procurar conversa ATIVA desse contato naquele tenant (status NOT IN ('finalizado', 'arquivado'))
    const { data: existingActive } = await supabase
      .from('df_wa_conversations')
      .select(`
        *,
        contact:df_wa_contacts(*, patient:df_patients(id, name, cpf, phone, email)),
        assigned_user:df_users!df_wa_conversations_assigned_to_fkey(id, name, email, role)
      `)
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .not('status', 'in', '("finalizado","arquivado")')
      .maybeSingle();

    if (existingActive) {
      return {
        conversation: existingActive as any as WhatsAppConversation,
        isNew: false,
      };
    }

    // 2. Não existe conversa ativa: criar NOVO ciclo de atendimento
    const newConvId = `cnv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const { data: newConv, error: insErr } = await supabase
      .from('df_wa_conversations')
      .insert({
        id: newConvId,
        tenant_id: tenantId,
        contact_id: contactId,
        status: 'em_atendimento',
        assigned_to: userId,
        claimed_at: now,
        created_at: now,
        updated_at: now,
      })
      .select(`
        *,
        contact:df_wa_contacts(*, patient:df_patients(id, name, cpf, phone, email)),
        assigned_user:df_users!df_wa_conversations_assigned_to_fkey(id, name, email, role)
      `)
      .single();

    // Em caso de colisão no índice único por duplo clique concorrente:
    if (insErr || !newConv) {
      const { data: fallbackActive } = await supabase
        .from('df_wa_conversations')
        .select(`
          *,
          contact:df_wa_contacts(*, patient:df_patients(id, name, cpf, phone, email)),
          assigned_user:df_users!df_wa_conversations_assigned_to_fkey(id, name, email, role)
        `)
        .eq('tenant_id', tenantId)
        .eq('contact_id', contactId)
        .not('status', 'in', '("finalizado","arquivado")')
        .maybeSingle();

      if (fallbackActive) {
        return {
          conversation: fallbackActive as any as WhatsAppConversation,
          isNew: false,
        };
      }
      throw new Error(insErr?.message || 'Falha ao criar novo atendimento para o contato.');
    }

    // 3. Registrar evento de início de atendimento
    try {
      await supabase.from('df_wa_events').insert({
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tenant_id: tenantId,
        conversation_id: newConvId,
        event_type: 'claimed',
        description: `Atendimento iniciado pelo operador ${userName || 'da clínica'}.`,
        author_id: userId,
        created_at: now,
      });
    } catch (e) {
      console.warn('[DentalWhatsAppService] Aviso ao registrar evento de início de atendimento:', e);
    }

    return {
      conversation: newConv as any as WhatsAppConversation,
      isNew: true,
    };
  },

  /**
   * Inicia explicitamente um novo ciclo de atendimento para o contato.
   */
  async startNewAttendanceCycle(params: {
    tenantId: string;
    contactId: string;
    userId: string;
    userName?: string;
  }): Promise<{ conversation: WhatsAppConversation; isNew: boolean }> {
    return this.getOrCreateActiveConversationForContact(params);
  },

  /**
   * Obtém a conversa ativa atual de um contato (status diferente de finalizado/arquivado), se houver.
   */
  async getActiveConversationByContact(
    contactId: string,
    tenantId: string
  ): Promise<WhatsAppConversation | null> {
    if (!contactId || !tenantId) return null;

    const { data, error } = await supabase
      .from('df_wa_conversations')
      .select(`
        *,
        contact:df_wa_contacts(*, patient:df_patients(id, name, cpf, phone, email)),
        assigned_user:df_users!df_wa_conversations_assigned_to_fkey(id, name, email, role)
      `)
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .not('status', 'in', '("finalizado","arquivado")')
      .maybeSingle();

    if (error || !data) return null;
    return data as any as WhatsAppConversation;
  },

  /**
   * Timeline unificada por CONTATO: busca todas as conversas do contato,
   * reúne todas as mensagens, notas, eventos, chamadas e transferências de todos os ciclos,
   * inserindo marcadores visuais elegantes de início e fim de cada ciclo de atendimento.
   */
  async getContactTimeline(
    contactId: string,
    tenantId: string
  ): Promise<WhatsAppTimelineItem[]> {
    if (!contactId || !tenantId) return [];

    // 1. Buscar todas as conversas/ciclos desse contato ordenadas
    const { data: convs } = await supabase
      .from('df_wa_conversations')
      .select(`
        *,
        assigned_user:df_users!df_wa_conversations_assigned_to_fkey(id, name)
      `)
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });

    const safeConvs = convs || [];
    const conversationIds = safeConvs.map((c) => c.id);

    // 2. Buscar mensagens por contact_id e conversationIds
    const messagesQuery =
      conversationIds.length > 0
        ? supabase
            .from('df_wa_messages')
            .select('*')
            .eq('tenant_id', tenantId)
            .or(`contact_id.eq.${contactId},conversation_id.in.(${conversationIds.join(',')})`)
            .order('created_at', { ascending: true })
        : supabase
            .from('df_wa_messages')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('contact_id', contactId)
            .order('created_at', { ascending: true });

    // Buscar em paralelo
    const [messagesRes, eventsRes, transfersRes, notesRes, callsRes] = await Promise.all([
      messagesQuery,
      conversationIds.length > 0
        ? supabase
            .from('df_wa_events')
            .select('*')
            .in('conversation_id', conversationIds)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      conversationIds.length > 0
        ? supabase
            .from('df_wa_transfers')
            .select('*')
            .in('conversation_id', conversationIds)
            .eq('tenant_id', tenantId)
            .order('transferred_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      conversationIds.length > 0
        ? supabase
            .from('df_wa_internal_notes')
            .select('*, author:df_users(id, name, role)')
            .in('conversation_id', conversationIds)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      conversationIds.length > 0
        ? supabase
            .from('df_wa_calls')
            .select('*')
            .in('conversation_id', conversationIds)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const items: WhatsAppTimelineItem[] = [];

    const formatMarkerDate = (dStr: string) => {
      try {
        const d = new Date(dStr);
        return (
          d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
          ' às ' +
          d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        );
      } catch {
        return dStr;
      }
    };

    // 3. Inserir marcadores de ciclo para cada conversa
    convs.forEach((c) => {
      // Marcador de início do ciclo
      items.push({
        id: `marker_start_${c.id}`,
        type: 'cycle_marker',
        created_at: c.created_at,
        data: {
          type: 'cycle_marker',
          item: {
            id: `marker_start_${c.id}`,
            conversation_id: c.id,
            marker_type: 'start',
            title: `Atendimento iniciado em ${formatMarkerDate(c.created_at)}`,
            subtitle: c.assigned_user?.name ? `Responsável: ${c.assigned_user.name}` : undefined,
            timestamp: c.created_at,
            status: c.status,
            assigned_user_name: c.assigned_user?.name,
          },
        },
      });

      // Se o ciclo já foi finalizado, insere marcador de término
      if (c.status === 'finalizado' || c.status === 'arquivado' || c.finalized_at) {
        const finalizedTime = c.finalized_at || c.updated_at;
        items.push({
          id: `marker_end_${c.id}`,
          type: 'cycle_marker',
          created_at: finalizedTime,
          data: {
            type: 'cycle_marker',
            item: {
              id: `marker_end_${c.id}`,
              conversation_id: c.id,
              marker_type: 'end',
              title: `Atendimento finalizado em ${formatMarkerDate(finalizedTime)}`,
              subtitle: c.finalization_reason ? `Motivo: ${c.finalization_reason}` : undefined,
              timestamp: finalizedTime,
              status: c.status,
              reason: c.finalization_reason,
            },
          },
        });
      }
    });

    // 4. Mapear mensagens
    if (messagesRes.data) {
      const messagesMap = new Map<string, WhatsAppMessage>();
      messagesRes.data.forEach((m: any) => messagesMap.set(m.id, m));

      messagesRes.data.forEach((m: any) => {
        const fullMsg: WhatsAppMessage = {
          ...m,
          reply_to_message: m.reply_to_id ? messagesMap.get(m.reply_to_id) || null : null,
        };
        items.push({
          id: fullMsg.id,
          type: 'message',
          created_at: fullMsg.created_at,
          data: { type: 'message', item: fullMsg },
        });
      });
    }

    // 5. Mapear eventos
    if (eventsRes.data) {
      eventsRes.data.forEach((e: any) => {
        items.push({
          id: e.id,
          type: 'event',
          created_at: e.created_at,
          data: { type: 'event', item: e as WhatsAppEvent },
        });
      });
    }

    // 6. Mapear transferências
    if (transfersRes.data) {
      transfersRes.data.forEach((t: any) => {
        items.push({
          id: t.id,
          type: 'transfer',
          created_at: t.transferred_at,
          data: { type: 'transfer', item: t as WhatsAppTransfer },
        });
      });
    }

    // 7. Mapear notas internas
    if (notesRes.data) {
      notesRes.data.forEach((n: any) => {
        items.push({
          id: n.id,
          type: 'note',
          created_at: n.created_at,
          data: { type: 'note', item: n as WhatsAppInternalNote },
        });
      });
    }

    // 8. Mapear chamadas
    if (callsRes.data) {
      callsRes.data.forEach((c: any) => {
        items.push({
          id: c.id,
          type: 'call',
          created_at: c.created_at,
          data: { type: 'call', item: c as WhatsAppCall },
        });
      });
    }

    // 9. Ordenar cronologicamente por created_at
    items.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return items;
  },

  /**
   * Obtém todas as notas internas de um contato através de todos os seus atendimentos,
   * incluindo autor e dados do atendimento de origem.
   */
  async getContactNotes(contactId: string, tenantId: string): Promise<any[]> {
    if (!contactId || !tenantId) return [];

    const { data: convs } = await supabase
      .from('df_wa_conversations')
      .select('id, created_at, status, finalization_reason, finalized_at')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (!convs || convs.length === 0) return [];

    const convMap = new Map<string, any>();
    convs.forEach((c) => convMap.set(c.id, c));

    const convIds = convs.map((c) => c.id);
    const { data: notes, error } = await supabase
      .from('df_wa_internal_notes')
      .select('*, author:df_users(id, name, role)')
      .in('conversation_id', convIds)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DentalWhatsAppService] Erro ao carregar notas do contato:', error.message);
      return [];
    }

    return (notes || []).map((n: any) => ({
      ...n,
      conversation: convMap.get(n.conversation_id) || null,
    }));
  },

  /**
   * Pesquisa mensagens no histórico de TODOS os atendimentos de um contato (case-insensitive).
   */
  async searchMessagesInContact(
    contactId: string,
    tenantId: string,
    query: string
  ): Promise<WhatsAppMessage[]> {
    if (!contactId || !tenantId || !query.trim()) return [];
    const term = query.trim();

    const { data: convs } = await supabase
      .from('df_wa_conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contactId);

    if (!convs || convs.length === 0) return [];
    const convIds = convs.map((c) => c.id);

    try {
      const { data, error } = await supabase
        .from('df_wa_messages')
        .select('*')
        .in('conversation_id', convIds)
        .eq('tenant_id', tenantId)
        .or(`content.ilike.%${term}%,media_file_name.ilike.%${term}%`)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[DentalWhatsAppService] Erro ao pesquisar mensagens no contato:', error.message);
        return [];
      }
      return (data || []) as WhatsAppMessage[];
    } catch (err: any) {
      console.error('[DentalWhatsAppService] Exceção ao pesquisar mensagens no contato:', err);
      return [];
    }
  },
  /**
   * Obtém a próxima consulta futura ativa de um paciente (date >= hoje, não cancelada/faltou).
   */
  async getPatientNextAppointment(patientId: string, tenantId: string): Promise<Appointment | null> {
    if (!patientId || !tenantId) return null;
    const todayStr = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('df_appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .gte('date', todayStr)
      .not('status', 'in', '("CANCELADA","FALTOU","FINALIZADA")')
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        orgId: data.org_id || tenantId,
        patientId: data.patient_id,
        patientName: data.patient_name,
        patientPhone: data.patient_phone,
        patientCpf: data.patient_cpf,
        date: data.date,
        startTime: data.start_time,
        endTime: data.end_time,
        durationMinutes: data.duration_minutes,
        dentistName: data.dentist_name,
        professionalId: data.professional_id,
        professionalName: data.professional_name,
        procedureName: data.procedure_name,
        procedureId: data.procedure_id,
        status: data.status,
        notes: data.notes,
        sendWhatsappReminder: data.send_whatsapp_reminder,
        origin: data.origin,
        saleId: data.sale_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    const local = db.getAppointments().filter(
      (a) =>
        a.patientId === patientId &&
        a.date >= todayStr &&
        !['CANCELADA', 'FALTOU', 'FINALIZADA'].includes(a.status)
    );
    local.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    return local[0] || null;
  },

  /**
   * Obtém o histórico recente de consultas de um paciente.
   */
  async getPatientAppointmentsHistory(
    patientId: string,
    tenantId: string,
    limit: number = 5
  ): Promise<Appointment[]> {
    if (!patientId || !tenantId) return [];

    const { data, error } = await supabase
      .from('df_appointments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(limit);

    if (!error && data) {
      return data.map((d: any) => ({
        id: d.id,
        orgId: d.org_id || tenantId,
        patientId: d.patient_id,
        patientName: d.patient_name,
        patientPhone: d.patient_phone,
        patientCpf: d.patient_cpf,
        date: d.date,
        startTime: d.start_time,
        endTime: d.end_time,
        durationMinutes: d.duration_minutes,
        dentistName: d.dentist_name,
        professionalId: d.professional_id,
        professionalName: d.professional_name,
        procedureName: d.procedure_name,
        procedureId: d.procedure_id,
        status: d.status,
        notes: d.notes,
        sendWhatsappReminder: d.send_whatsapp_reminder,
        origin: d.origin,
        saleId: d.sale_id,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));
    }

    const local = db.getAppointments().filter((a) => a.patientId === patientId);
    local.sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
    return local.slice(0, limit);
  },

  /**
   * Vincula um contato do WhatsApp a um paciente clínico.
   * Garante a regra de 1 paciente ↔ 1 contato WhatsApp por tenant.
   * Bloqueia vinculação de grupos.
   * Se o paciente já estiver vinculado a outro contato e forceTransfer não for informado,
   * recusa e reporta os dados do contato conflitante.
   */
  async linkPatientToContact(
    contactId: string,
    patientId: string,
    tenantId: string,
    options?: { forceTransfer?: boolean }
  ): Promise<{
    success: boolean;
    error?: string;
    alreadyLinkedToOther?: boolean;
    existingContactName?: string;
    existingContactPhone?: string;
  }> {
    if (!contactId || !patientId || !tenantId) {
      return { success: false, error: 'Dados insuficientes para vinculação.' };
    }

    // 1. Obter contato alvo para validações
    const { data: targetContact, error: targetErr } = await supabase
      .from('df_wa_contacts')
      .select('id, name, whatsapp_number')
      .eq('id', contactId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (targetErr || !targetContact) {
      return { success: false, error: 'Contato não encontrado nesta clínica.' };
    }

    // 2. Bloquear vinculação se for grupo de WhatsApp
    if (isWhatsAppGroup(targetContact.whatsapp_number)) {
      return { success: false, error: 'Grupos do WhatsApp não podem ser vinculados a pacientes clínicos.' };
    }

    // 3. Verificar se este paciente já está vinculado a outro contato no mesmo tenant
    const { data: existingLinked, error: checkErr } = await supabase
      .from('df_wa_contacts')
      .select('id, name, whatsapp_number')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .neq('id', contactId)
      .maybeSingle();

    if (checkErr) {
      return { success: false, error: checkErr.message };
    }

    if (existingLinked) {
      if (!options?.forceTransfer) {
        return {
          success: false,
          alreadyLinkedToOther: true,
          existingContactName: existingLinked.name,
          existingContactPhone: existingLinked.whatsapp_number,
          error: `Este paciente já está vinculado ao contato "${existingLinked.name}" (${formatPhoneDisplay(existingLinked.whatsapp_number)}).`,
        };
      }

      // Se forceTransfer for true: desvincula o contato anterior atomicamente
      const { error: unlinkErr } = await supabase
        .from('df_wa_contacts')
        .update({ patient_id: null, updated_at: new Date().toISOString() })
        .eq('id', existingLinked.id)
        .eq('tenant_id', tenantId);

      if (unlinkErr) {
        return { success: false, error: `Erro ao desvincular contato anterior: ${unlinkErr.message}` };
      }
    }

    // 4. Vincula o contato alvo ao paciente
    const { error: linkErr } = await supabase
      .from('df_wa_contacts')
      .update({ patient_id: patientId, updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('tenant_id', tenantId);

    if (linkErr) {
      return { success: false, error: linkErr.message };
    }

    return { success: true };
  },

  /**
   * Desvincula um contato do WhatsApp de um paciente clínico.
   */
  async unlinkPatientFromContact(
    contactId: string,
    tenantId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!contactId || !tenantId) {
      return { success: false, error: 'Dados insuficientes para desvinculação.' };
    }

    const { error } = await supabase
      .from('df_wa_contacts')
      .update({ patient_id: null, updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('tenant_id', tenantId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  },

  /**
   * Sincroniza paciente com df_wa_contacts.
   * Regra: Se paciente possui telefone válido, vincula ou cria contato em df_wa_contacts.
   * Se houver conflito de telefone com outro paciente no mesmo tenant, detecta e retorna CONTACT_PHONE_CONFLICT.
   */
  async syncPatientToContact(
    patient: { id: string; name: string; phone?: string; tenantId?: string },
    rawTenantId: string,
    options?: { dryRun?: boolean }
  ): Promise<{
    success: boolean;
    code?: 'OK' | 'NO_PHONE' | 'PHONE_INVALID' | 'CONTACT_PHONE_CONFLICT' | 'DB_ERROR';
    action?: 'created' | 'linked' | 'updated' | 'skipped';
    contactId?: string;
    error?: string;
  }> {
    const tenantId = this.sanitizeTenantId(rawTenantId || patient.tenantId);
    if (!tenantId || !patient.id) {
      return { success: false, code: 'DB_ERROR', error: 'Tenant ou ID de paciente ausente' };
    }

    const rawPhone = (patient.phone || '').trim();
    if (!rawPhone) {
      return { success: true, code: 'NO_PHONE', action: 'skipped' };
    }

    const normalizedPhone = normalizeBrazilianNumber(rawPhone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return { success: false, code: 'PHONE_INVALID', error: 'Telefone inválido para WhatsApp' };
    }

    // 1. Caso A: Verificar se o paciente já possui contato vinculado no tenant
    const { data: contactByPatient, error: errByPatient } = await supabase
      .from('df_wa_contacts')
      .select('id, name, whatsapp_number, patient_id')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patient.id)
      .maybeSingle();

    if (errByPatient) {
      return { success: false, code: 'DB_ERROR', error: errByPatient.message };
    }

    if (contactByPatient) {
      if (contactByPatient.whatsapp_number === normalizedPhone) {
        if (!options?.dryRun && contactByPatient.name !== patient.name && patient.name) {
          await supabase
            .from('df_wa_contacts')
            .update({ name: patient.name, updated_at: new Date().toISOString() })
            .eq('id', contactByPatient.id);
        }
        return { success: true, code: 'OK', action: 'updated', contactId: contactByPatient.id };
      }

      // O telefone mudou: verificar se o novo número já é de OUTRO paciente no mesmo tenant
      const { data: conflictContact } = await supabase
        .from('df_wa_contacts')
        .select('id, name, patient_id')
        .eq('tenant_id', tenantId)
        .eq('whatsapp_number', normalizedPhone)
        .maybeSingle();

      if (conflictContact && conflictContact.patient_id && conflictContact.patient_id !== patient.id) {
        return {
          success: false,
          code: 'CONTACT_PHONE_CONFLICT',
          error: `O número ${formatPhoneDisplay(normalizedPhone)} já está vinculado a outro paciente (${conflictContact.name}) nesta clínica.`,
        };
      }

      if (options?.dryRun) {
        return { success: true, code: 'OK', action: 'updated', contactId: conflictContact?.id || contactByPatient.id };
      }

      // Desvincula o contato antigo preservando seu histórico intacto
      await supabase
        .from('df_wa_contacts')
        .update({ patient_id: null, updated_at: new Date().toISOString() })
        .eq('id', contactByPatient.id)
        .eq('tenant_id', tenantId);

      if (conflictContact) {
        // Vincula o contato existente com o novo número
        await supabase
          .from('df_wa_contacts')
          .update({
            patient_id: patient.id,
            name: patient.name || conflictContact.name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conflictContact.id);
        return { success: true, code: 'OK', action: 'linked', contactId: conflictContact.id };
      } else {
        // Cria novo contato para o novo número
        const newContactId = `ctc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await supabase
          .from('df_wa_contacts')
          .insert({
            id: newContactId,
            tenant_id: tenantId,
            patient_id: patient.id,
            name: patient.name,
            whatsapp_number: normalizedPhone,
            custom_fields: {},
            profile_pic_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        return { success: true, code: 'OK', action: 'created', contactId: newContactId };
      }
    }

    // 2. Caso B: Verificar se existe contato com o mesmo telefone no tenant
    const { data: contactByPhone, error: errByPhone } = await supabase
      .from('df_wa_contacts')
      .select('id, name, whatsapp_number, patient_id')
      .eq('tenant_id', tenantId)
      .eq('whatsapp_number', normalizedPhone)
      .maybeSingle();

    if (errByPhone) {
      return { success: false, code: 'DB_ERROR', error: errByPhone.message };
    }

    if (contactByPhone) {
      if (!contactByPhone.patient_id) {
        if (options?.dryRun) {
          return { success: true, code: 'OK', action: 'linked', contactId: contactByPhone.id };
        }
        // Contato avulso: vincula ao paciente
        await supabase
          .from('df_wa_contacts')
          .update({
            patient_id: patient.id,
            name: patient.name || contactByPhone.name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contactByPhone.id);

        return { success: true, code: 'OK', action: 'linked', contactId: contactByPhone.id };
      } else if (contactByPhone.patient_id !== patient.id) {
        // Conflito: número já vinculado a outro paciente
        return {
          success: false,
          code: 'CONTACT_PHONE_CONFLICT',
          error: `O número ${formatPhoneDisplay(normalizedPhone)} já está vinculado a outro paciente nesta clínica.`,
        };
      }
    }

    if (options?.dryRun) {
      return { success: true, code: 'OK', action: 'created' };
    }

    // 3. Caso C: Não existe contato -> cria automaticamente
    const newContactId = `ctc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { data: created, error: createErr } = await supabase
      .from('df_wa_contacts')
      .insert({
        id: newContactId,
        tenant_id: tenantId,
        patient_id: patient.id,
        name: patient.name,
        whatsapp_number: normalizedPhone,
        custom_fields: {},
        profile_pic_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (createErr) {
      return { success: false, code: 'DB_ERROR', error: createErr.message };
    }

    return { success: true, code: 'OK', action: 'created', contactId: created?.id || newContactId };
  },

  /**
   * Executa varredura de backfill vinculando pacientes existentes a contatos
   */
  async runPatientsWhatsAppBackfill(rawTenantId?: string): Promise<{
    totalWithPhone: number;
    alreadyLinked: number;
    existingByNumber: number;
    withoutContact: number;
    conflicts: number;
    processed: number;
  }> {
    const tenantId = rawTenantId ? this.sanitizeTenantId(rawTenantId) : null;
    let pQuery = supabase.from('df_patients').select('id, name, phone, tenant_id');
    if (tenantId) pQuery = pQuery.eq('tenant_id', tenantId);

    const { data: patients } = await pQuery;
    if (!patients) {
      return { totalWithPhone: 0, alreadyLinked: 0, existingByNumber: 0, withoutContact: 0, conflicts: 0, processed: 0 };
    }

    let cQuery = supabase.from('df_wa_contacts').select('id, name, whatsapp_number, patient_id, tenant_id');
    if (tenantId) cQuery = cQuery.eq('tenant_id', tenantId);
    const { data: contacts } = await cQuery;
    const contactList = contacts || [];

    let totalWithPhone = 0;
    let alreadyLinked = 0;
    let existingByNumber = 0;
    let withoutContact = 0;
    let conflicts = 0;
    let processed = 0;

    for (const p of patients) {
      const rawPhone = (p.phone || '').trim();
      if (!rawPhone) continue;
      totalWithPhone++;

      const normPhone = normalizeBrazilianNumber(rawPhone);
      const linked = contactList.find((c) => c.tenant_id === p.tenant_id && c.patient_id === p.id);

      if (linked) {
        alreadyLinked++;
        continue;
      }

      const byNumber = contactList.find((c) => c.tenant_id === p.tenant_id && c.whatsapp_number === normPhone);
      if (byNumber) {
        if (!byNumber.patient_id) {
          existingByNumber++;
          await this.syncPatientToContact(p, p.tenant_id);
          processed++;
        } else {
          conflicts++;
        }
      } else {
        withoutContact++;
        await this.syncPatientToContact(p, p.tenant_id);
        processed++;
      }
    }

    return { totalWithPhone, alreadyLinked, existingByNumber, withoutContact, conflicts, processed };
  },

  /**
   * Remove prefixo 'org_' e espaços de um tenant_id
   */
  sanitizeTenantId(rawId?: string | null): string {
    if (!rawId) return '';
    return rawId.trim().replace(/^org_/, '');
  },

  /**
   * Valida rigorosamente a consistência entre o tenant da consulta, do paciente e da clínica ativa
   * antes de qualquer operação, impedindo violações de chave estrangeira ou gravação em tenant incorreto.
   */
  async validateAndResolveClinicTenant(params: {
    appointment: Appointment;
    patientId: string;
    activeClinicId?: string;
  }): Promise<{
    valid: boolean;
    tenantId?: string;
    code?: 'TENANT_INVALID' | 'PATIENT_NOT_FOUND' | 'DB_ERROR';
    error?: string;
  }> {
    const aptRaw =
      params.appointment.tenantId ||
      (params.appointment as any).tenant_id ||
      params.appointment.orgId;
    const aptTenant = this.sanitizeTenantId(aptRaw);
    const activeTenant = this.sanitizeTenantId(params.activeClinicId || db.getActiveTenantId());

    let effectiveTenant = aptTenant || activeTenant;

    // Se ambos estiverem presentes e divergirem, há inconsistência de tenant
    if (aptTenant && activeTenant && aptTenant !== activeTenant) {
      console.warn('[DentalWhatsAppService] Divergência de clínica detectada:', {
        appointmentTenant: aptTenant,
        activeTenant,
      });
      return {
        valid: false,
        code: 'TENANT_INVALID',
        error: `Inconsistência de clínica: a consulta pertence à clínica (${aptTenant}), mas a clínica ativa selecionada é (${activeTenant}).`,
      };
    }

    if (!effectiveTenant) {
      return {
        valid: false,
        code: 'TENANT_INVALID',
        error: 'Não foi possível identificar a clínica desta consulta.',
      };
    }

    // Validar se o paciente pertence ao mesmo tenant
    if (params.patientId) {
      const { data: patRow } = await supabase
        .from('df_patients')
        .select('id, tenant_id, org_id')
        .eq('id', params.patientId)
        .maybeSingle();

      if (patRow) {
        const patTenant = this.sanitizeTenantId(patRow.tenant_id || patRow.org_id);
        if (patTenant && patTenant !== effectiveTenant) {
          return {
            valid: false,
            code: 'TENANT_INVALID',
            error: `Inconsistência de clínica: o paciente pertence à clínica (${patTenant}), diferente da consulta (${effectiveTenant}).`,
          };
        }
      }
    }

    // Confirmar que o tenant existe de fato em df_tenants
    const { data: tenantRow, error: tErr } = await supabase
      .from('df_tenants')
      .select('id, name')
      .eq('id', effectiveTenant)
      .maybeSingle();

    if (tErr || !tenantRow) {
      return {
        valid: false,
        code: 'TENANT_INVALID',
        error: `A clínica desta consulta (${effectiveTenant}) não foi encontrada no cadastro do sistema.`,
      };
    }

    return {
      valid: true,
      tenantId: effectiveTenant,
    };
  },

  /**
   * Obtém ou cria o contato em df_wa_contacts para um paciente clínico,
   * retornando código de erro tipado e mensagem precisa sem mascarar falhas.
   */
  async getOrCreateContactForPatientResult(
    patientId: string,
    rawTenantId: string
  ): Promise<{
    success: boolean;
    contact?: WhatsAppContact;
    code?: 'PHONE_INVALID' | 'TENANT_INVALID' | 'CONTACT_CONFLICT' | 'PATIENT_NOT_FOUND' | 'DB_ERROR';
    error?: string;
  }> {
    const tenantId = this.sanitizeTenantId(rawTenantId);
    if (!patientId || !tenantId) {
      return {
        success: false,
        code: 'TENANT_INVALID',
        error: 'Identificador do paciente ou da clínica não informado.',
      };
    }

    // 1. Buscar paciente no Supabase ou no banco local
    const { data: patient } = await supabase
      .from('df_patients')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', patientId)
      .maybeSingle();

    const pat = patient || db.getPatients().find((p) => p.id === patientId);
    if (!pat) {
      return {
        success: false,
        code: 'PATIENT_NOT_FOUND',
        error: 'Paciente não encontrado no cadastro da clínica.',
      };
    }

    if (!pat.phone || !pat.phone.trim()) {
      return {
        success: false,
        code: 'PHONE_INVALID',
        error: 'O paciente não possui um número de WhatsApp válido cadastrado.',
      };
    }

    const cleanNumber = normalizeBrazilianNumber(pat.phone);
    if (!cleanNumber || !isValidBrazilianPhone(cleanNumber)) {
      return {
        success: false,
        code: 'PHONE_INVALID',
        error: 'O paciente não possui um número de WhatsApp válido.',
      };
    }

    // 2. Verificar se já existe contato com esse patient_id no MESMO tenant
    const { data: existingContact, error: existingErr } = await supabase
      .from('df_wa_contacts')
      .select('*, patient:df_patients(id, name, cpf, phone, email)')
      .eq('tenant_id', tenantId)
      .eq('patient_id', patientId)
      .maybeSingle();

    if (existingErr) {
      console.error('[DentalWhatsAppService] Erro ao consultar contato existente:', existingErr);
      return {
        success: false,
        code: 'DB_ERROR',
        error: 'Erro de comunicação com o banco de dados ao buscar contato.',
      };
    }

    if (existingContact) {
      // Se o telefone do paciente foi corrigido/atualizado
      if (existingContact.whatsapp_number !== cleanNumber) {
        // Verificar se não há conflito com outro contato usando o novo número
        const { data: conflictingContact } = await supabase
          .from('df_wa_contacts')
          .select('id, name, patient_id')
          .eq('tenant_id', tenantId)
          .eq('whatsapp_number', cleanNumber)
          .maybeSingle();

        if (conflictingContact && conflictingContact.id !== existingContact.id) {
          if (conflictingContact.patient_id && conflictingContact.patient_id !== patientId) {
            return {
              success: false,
              code: 'CONTACT_CONFLICT',
              error: 'Já existe outro contato utilizando este número de WhatsApp.',
            };
          }
          // Se o outro contato não tinha paciente, vincular a este
          await supabase
            .from('df_wa_contacts')
            .update({
              patient_id: patientId,
              name: pat.name,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conflictingContact.id);
          conflictingContact.patient_id = patientId;
          return { success: true, contact: conflictingContact as WhatsAppContact };
        }

        await supabase
          .from('df_wa_contacts')
          .update({
            whatsapp_number: cleanNumber,
            name: pat.name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingContact.id);
        existingContact.whatsapp_number = cleanNumber;
        existingContact.name = pat.name;
      }
      return { success: true, contact: existingContact as WhatsAppContact };
    }

    // 3. Verificar se já existe contato com esse número no MESMO tenant
    const { data: byNumber, error: byNumErr } = await supabase
      .from('df_wa_contacts')
      .select('*, patient:df_patients(id, name, cpf, phone, email)')
      .eq('tenant_id', tenantId)
      .eq('whatsapp_number', cleanNumber)
      .maybeSingle();

    if (byNumErr) {
      console.error('[DentalWhatsAppService] Erro ao consultar contato por número:', byNumErr);
      return {
        success: false,
        code: 'DB_ERROR',
        error: 'Erro de comunicação com o banco de dados ao buscar número.',
      };
    }

    if (byNumber) {
      if (byNumber.patient_id && byNumber.patient_id !== patientId) {
        return {
          success: false,
          code: 'CONTACT_CONFLICT',
          error: 'Já existe outro contato utilizando este número de WhatsApp.',
        };
      }
      if (!byNumber.patient_id) {
        await supabase
          .from('df_wa_contacts')
          .update({
            patient_id: patientId,
            name: pat.name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', byNumber.id);
        byNumber.patient_id = patientId;
      }
      return { success: true, contact: byNumber as WhatsAppContact };
    }

    // 4. Criar novo contato com o número atualizado no tenant validado
    const newContactId = `ctc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const { data: created, error: insErr } = await supabase
      .from('df_wa_contacts')
      .insert({
        id: newContactId,
        tenant_id: tenantId,
        patient_id: patientId,
        name: pat.name,
        whatsapp_number: cleanNumber,
        profile_pic_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*, patient:df_patients(id, name, cpf, phone, email)')
      .single();

    if (insErr) {
      console.error('[DentalWhatsAppService] Erro ao criar contato para paciente:', insErr);
      if (insErr.code === '23503') {
        return {
          success: false,
          code: 'TENANT_INVALID',
          error: 'Não foi possível identificar a clínica desta consulta no sistema.',
        };
      }
      if (insErr.code === '23505') {
        const { data: retry } = await supabase
          .from('df_wa_contacts')
          .select('*, patient:df_patients(id, name, cpf, phone, email)')
          .eq('tenant_id', tenantId)
          .eq('whatsapp_number', cleanNumber)
          .maybeSingle();
        if (retry) {
          return { success: true, contact: retry as WhatsAppContact };
        }
        return {
          success: false,
          code: 'CONTACT_CONFLICT',
          error: 'Já existe outro contato utilizando este número de WhatsApp.',
        };
      }
      return {
        success: false,
        code: 'DB_ERROR',
        error: `Erro ao salvar contato no banco de dados (${insErr.message}).`,
      };
    }

    return { success: true, contact: created as WhatsAppContact };
  },

  /**
   * Obtém ou cria o contato em df_wa_contacts para um paciente clínico (wrapper compatível).
   */
  async getOrCreateContactForPatient(
    patientId: string,
    tenantId: string
  ): Promise<WhatsAppContact | null> {
    const res = await this.getOrCreateContactForPatientResult(patientId, tenantId);
    return res.contact || null;
  },

  /**
   * Sincroniza o telefone corrigido do paciente em df_appointments de consultas pendentes/futuras.
   */
  async syncPatientPhoneInAppointments(
    patientId: string,
    rawTenantId: string,
    newPhone: string
  ): Promise<void> {
    const tenantId = this.sanitizeTenantId(rawTenantId);
    if (!patientId || !tenantId || !newPhone) return;
    try {
      await supabase
        .from('df_appointments')
        .update({
          patient_phone: newPhone,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('patient_id', patientId)
        .in('status', ['PENDENTE', 'AGENDADA', 'AGUARDANDO']);
    } catch (e) {
      console.warn('[DentalWhatsAppService] Erro ao sincronizar telefone nas consultas:', e);
    }
  },

  /**
   * Obtém configurações de lembrete e templates da clínica.
   */
  async getReminderSettings(rawTenantId: string): Promise<WhatsAppReminderSettings> {
    const tenantId = this.sanitizeTenantId(rawTenantId);
    const defaultSettings: WhatsAppReminderSettings = {
      tenant_id: tenantId,
      enabled: true,
      send_confirmation_on_create: true,
      reminder_24h_enabled: true,
      reminder_2h_enabled: false,
      reschedule_enabled: true,
      cancellation_enabled: true,
      confirmation_template:
        'Olá, {{paciente}}! Sua consulta está agendada para {{quando}} às {{hora}} com {{profissional}}. Estamos te esperando 😊',
      reminder_template:
        'Olá, {{paciente}}! Lembramos que sua consulta está marcada para {{quando}} às {{hora}} com {{profissional}}. Estamos te esperando 😊',
      cancellation_template:
        'Olá, {{paciente}}! Informamos que sua consulta do dia {{data}} às {{hora}} foi cancelada. Se desejar reagendar para outra data, estamos à disposição!',
      reschedule_template:
        'Olá, {{paciente}}! Sua consulta foi remarcada para o dia {{data}} às {{hora}} com {{profissional}}. Estamos te esperando 😊',
      updated_at: new Date().toISOString(),
    };

    if (!tenantId) return defaultSettings;

    const { data, error } = await supabase
      .from('df_wa_reminder_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data) {
      return defaultSettings;
    }

    return {
      ...defaultSettings,
      ...(data as any),
      tenant_id: tenantId,
    };
  },

  /**
   * Salva configurações de lembrete e templates da clínica.
   */
  async saveReminderSettings(
    settings: Partial<WhatsAppReminderSettings> & { tenant_id: string }
  ): Promise<{ success: boolean; error?: string }> {
    const tenantId = this.sanitizeTenantId(settings.tenant_id);
    if (!tenantId) return { success: false, error: 'tenant_id obrigatório' };

    const payload = {
      ...settings,
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('df_wa_reminder_settings')
      .upsert(payload, { onConflict: 'tenant_id' });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  },

  /**
   * Obtém histórico de lembretes e confirmações enviados para uma consulta.
   */
  async getAppointmentRemindersLog(
    appointmentId: string,
    rawTenantId: string
  ): Promise<WhatsAppReminderLog[]> {
    const tenantId = this.sanitizeTenantId(rawTenantId);
    if (!appointmentId || !tenantId) return [];

    const { data, error } = await supabase
      .from('df_wa_reminders_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('appointment_id', appointmentId)
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []) as WhatsAppReminderLog[];
  },

  /**
   * Envia uma mensagem transacional da agenda (confirmação, lembrete, remarcação ou cancelamento).
   * REGRA CRUCIAL: NUNCA abre atendimento ativo, NUNCA coloca conversa em fila ou em_atendimento.
   */
  async sendAppointmentTransactionalMessage(params: {
    appointment: Appointment;
    reminderType: WhatsAppReminderType;
    tenantId?: string;
    activeClinicId?: string;
    customMessage?: string;
    forceResend?: boolean;
  }): Promise<{
    success: boolean;
    code?: 'PHONE_INVALID' | 'TENANT_INVALID' | 'CONTACT_CONFLICT' | 'EVOLUTION_ERROR' | 'DB_ERROR';
    error?: string;
    evolutionMsgId?: string;
  }> {
    const { appointment, reminderType, customMessage, forceResend } = params;
    if (!appointment) {
      return { success: false, code: 'DB_ERROR', error: 'Dados da consulta insuficientes.' };
    }

    // 1. Resolução e validação rigorosa de clínica (consulta, paciente e clínica ativa)
    const tenantValidation = await this.validateAndResolveClinicTenant({
      appointment,
      patientId: appointment.patientId,
      activeClinicId: params.activeClinicId || params.tenantId,
    });

    if (!tenantValidation.valid || !tenantValidation.tenantId) {
      return {
        success: false,
        code: tenantValidation.code || 'TENANT_INVALID',
        error: tenantValidation.error || 'Não foi possível identificar a clínica desta consulta.',
      };
    }

    const tenantId = tenantValidation.tenantId;

    // 2. Verificação de segurança & regras de negócio
    if (
      ['CANCELADA', 'FALTOU'].includes(appointment.status) &&
      ['reminder_24h', 'reminder_2h', 'confirmation'].includes(reminderType)
    ) {
      return {
        success: false,
        error: `Não é possível enviar lembrete ou confirmação para uma consulta ${appointment.status.toLowerCase()}.`,
      };
    }

    // 3. Trava estrita de Idempotência
    if (!forceResend) {
      const { data: existingLog } = await supabase
        .from('df_wa_reminders_log')
        .select('id, status, sent_at')
        .eq('tenant_id', tenantId)
        .eq('appointment_id', appointment.id)
        .eq('reminder_type', reminderType)
        .eq('scheduled_for', appointment.date)
        .maybeSingle();

      if (existingLog && existingLog.status === 'sent') {
        return {
          success: false,
          error: `Este tipo de aviso (${reminderType}) já foi enviado anteriormente para esta consulta nesta data (${appointment.date}).`,
        };
      }
    }

    // 4. Obter ou criar contato do WhatsApp do paciente com verificação sem mascaramento de erro
    const contactResult = await this.getOrCreateContactForPatientResult(appointment.patientId, tenantId);
    if (!contactResult.success || !contactResult.contact) {
      return {
        success: false,
        code: contactResult.code || 'DB_ERROR',
        error: contactResult.error || 'Erro ao resolver contato do paciente.',
      };
    }

    const contact = contactResult.contact;

    // 5. Carregar configurações e templates de mensagem
    const settings = await this.getReminderSettings(tenantId);
    const orgName = db.getActiveClinicDisplayName() || db.getOrg()?.name || 'nossa clínica';
    const patientFirstName = appointment.patientName.split(' ')[0] || appointment.patientName;
    const formattedDate = formatDateBr(appointment.date);
    const professional = appointment.dentistName || appointment.professionalName || 'Cirurgião Dentista';
    const procedure = appointment.procedureName || 'Consulta Odontológica';

    let text = customMessage?.trim();
    if (!text) {
      let template = settings.confirmation_template;
      if (reminderType === 'reminder_24h' || reminderType === 'reminder_2h') {
        template = settings.reminder_template;
      } else if (reminderType === 'cancellation') {
        template = settings.cancellation_template;
      } else if (reminderType === 'reschedule') {
        template = settings.reschedule_template;
      }

      text = renderAppointmentTemplate(
        template,
        {
          paciente: patientFirstName,
          appointmentDate: appointment.date,
          data: formattedDate,
          hora: appointment.startTime,
          profissional: professional,
          procedimento: procedure,
          clinica: orgName,
        },
        'America/Sao_Paulo',
        new Date()
      );
    }

    // 6. Mapear origin da mensagem
    const originMap: Record<WhatsAppReminderType, WhatsAppMessageOrigin> = {
      confirmation: 'appointment_confirmation',
      reminder_24h: 'appointment_reminder',
      reminder_2h: 'appointment_reminder',
      reschedule: 'appointment_reschedule',
      cancellation: 'appointment_cancellation',
    };
    const mappedOrigin = originMap[reminderType];

    // 7. Verificar se o contato tem conversa mais recente (para vincular sem alterar status)
    const { data: latestConv } = await supabase
      .from('df_wa_conversations')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let evolutionMsgId: string | undefined;

    // 8. Disparo server-side seguro via Edge Function dental-whatsapp-api
    try {
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'send_text',
          tenant_id: tenantId,
          recipient_number: contact.whatsapp_number,
          text,
        },
      });

      if (!edgeErr && edgeRes?.success) {
        evolutionMsgId = edgeRes.messageId;
      } else {
        const errMsg = edgeErr?.message || edgeRes?.error || 'Erro na Evolution API';
        console.warn('[DentalWhatsAppService] Falha no disparo transacional:', errMsg);
        await supabase.from('df_wa_reminders_log').upsert({
          id: `rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tenant_id: tenantId,
          appointment_id: appointment.id,
          contact_id: contact.id,
          reminder_type: reminderType,
          scheduled_for: appointment.date,
          status: 'failed',
          error_message: errMsg,
          created_at: new Date().toISOString(),
        }, {
          onConflict: 'tenant_id,appointment_id,reminder_type,scheduled_for',
        });
        return {
          success: false,
          code: 'EVOLUTION_ERROR',
          error: 'Não foi possível enviar a mensagem pelo WhatsApp.',
        };
      }
    } catch (e: any) {
      console.error('[DentalWhatsAppService] Exceção ao invocar dental-whatsapp-api:', e);
      return {
        success: false,
        code: 'EVOLUTION_ERROR',
        error: 'Não foi possível enviar a mensagem pelo WhatsApp.',
      };
    }

    // 9. Persistir mensagem em df_wa_messages com origin transacional
    const dbMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    await supabase.from('df_wa_messages').insert({
      id: dbMsgId,
      tenant_id: tenantId,
      conversation_id: latestConv?.id || null, // vincula sem abrir atendimento
      contact_id: contact.id,
      appointment_id: appointment.id,
      origin: mappedOrigin,
      sender_id: null,
      evolution_msg_id: evolutionMsgId || null,
      from_me: true,
      content: text,
      msg_type: 'text',
      is_read: true,
      delivery_status: evolutionMsgId ? 2 : 1,
      remote_jid: `${contact.whatsapp_number}@s.whatsapp.net`,
      is_internal: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // 10. Atualizar/Inserir log de idempotência com status 'sent'
    await supabase.from('df_wa_reminders_log').upsert({
      id: `rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_id: tenantId,
      appointment_id: appointment.id,
      contact_id: contact.id,
      reminder_type: reminderType,
      scheduled_for: appointment.date,
      status: 'sent',
      evolution_msg_id: evolutionMsgId || null,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }, {
      onConflict: 'tenant_id,appointment_id,reminder_type,scheduled_for',
    });

    return { success: true, evolutionMsgId };
  },
};

