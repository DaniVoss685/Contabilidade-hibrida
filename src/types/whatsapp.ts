// ==============================================================================
// TYPES DO MÓDULO DE WHATSAPP / ATENDIMENTO ODONTOLÓGICO (df_wa_*)
// ==============================================================================

export type WhatsAppChatStatus =
  | 'na_fila'
  | 'em_atendimento'
  | 'aguardando_cliente'
  | 'aguardando_interno'
  | 'transferido'
  | 'finalizado'
  | 'arquivado';

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'contact'
  | 'reaction';

export type WhatsAppPriority = 'baixa' | 'media' | 'alta';

export type WhatsAppDeliveryStatus = 1 | 2 | 3 | 4 | 5; // 1: PENDING, 2: SERVER_ACK, 3: DELIVERY_ACK, 4: READ, 5: PLAYED

export interface WhatsAppReaction {
  text: string;
  fromMe: boolean;
  timestamp?: string;
}

export interface WhatsAppInstance {
  id: string;
  tenant_id: string;
  instance_name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'qrcode';
  api_url: string;
  webhook_url?: string;
  has_api_key?: boolean;
  has_webhook_secret?: boolean;
  qrcode?: string;
  phone_number?: string;
  profile_name?: string;
  profile_picture_url?: string;
  settings?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppContact {
  id: string;
  tenant_id: string;
  patient_id?: string | null;
  name: string;
  whatsapp_number: string;
  profile_pic_url?: string | null;
  profile_pic_synced_at?: string | null;
  profile_pic_storage_path?: string | null;
  profile_pic_status?: 'pending' | 'synced' | 'no_photo' | null;
  profile_pic_last_attempt_at?: string | null;
  lid?: string | null;
  custom_fields?: Record<string, any>;
  created_at: string;
  updated_at: string;

  // Joined fields
  patient?: {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
    email?: string;
  } | null;
}

export interface WhatsAppConversation {
  id: string;
  tenant_id: string;
  contact_id: string;
  assigned_to?: string | null;
  status: WhatsAppChatStatus;
  unread_count: number;
  last_message_at: string;
  last_message_content?: string | null;
  last_message_from_me?: boolean;
  claimed_at?: string | null;
  finalized_at?: string | null;
  finalization_reason?: string | null;
  finalization_notes?: string | null;
  transfer_reason?: string | null;
  priority: WhatsAppPriority;
  tags: string[];
  observation?: string | null;
  observation_assigned_to?: string | null;
  created_at: string;
  updated_at: string;

  // Joined fields
  contact?: WhatsAppContact;
  assigned_user?: {
    id: string;
    name: string;
    email?: string;
    role?: string;
    whatsapp_display_name?: string | null;
  } | null;
  observation_assigned_user?: {
    id: string;
    name: string;
  } | null;
}

export type WhatsAppMessageOrigin =
  | 'attendant'
  | 'appointment_confirmation'
  | 'appointment_reminder'
  | 'appointment_reschedule'
  | 'appointment_cancellation'
  | 'system';

export interface WhatsAppMessage {
  id: string;
  tenant_id: string;
  conversation_id?: string | null;
  contact_id?: string | null;
  appointment_id?: string | null;
  origin?: WhatsAppMessageOrigin;
  sender_id?: string | null;
  evolution_msg_id?: string | null;
  from_me: boolean;
  content: string;
  msg_type: WhatsAppMessageType;
  media_url?: string | null;
  media_storage_path?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  is_read: boolean;
  delivery_status: number;
  reply_to_id?: string | null;
  reactions: WhatsAppReaction[];
  remote_jid?: string | null;
  participant_jid?: string | null;
  is_internal: boolean;
  created_at: string;
  updated_at: string;

  // Joined fields
  reply_to_message?: WhatsAppMessage | null;
  sender_user?: {
    id: string;
    name: string;
  } | null;
}

export interface WhatsAppEvent {
  id: string;
  tenant_id: string;
  conversation_id: string;
  event_type:
    | 'claimed'
    | 'transferred'
    | 'status_changed'
    | 'finalized'
    | 'reopened'
    | 'contact_updated'
    | 'call_received'
    | 'call_missed';
  description: string;
  author_id?: string | null;
  metadata?: Record<string, any>;
  created_at: string;

  // Joined
  author?: {
    id: string;
    name: string;
  } | null;
}

export interface WhatsAppTransfer {
  id: string;
  tenant_id: string;
  conversation_id: string;
  from_user_id?: string | null;
  to_user_id: string;
  reason?: string | null;
  transferred_at: string;

  // Joined
  from_user?: { id: string; name: string; whatsapp_display_name?: string | null; role?: string } | null;
  to_user?: { id: string; name: string; whatsapp_display_name?: string | null; role?: string } | null;
}

export interface WhatsAppCall {
  id: string;
  tenant_id: string;
  conversation_id?: string | null;
  contact_id?: string | null;
  call_id?: string | null;
  call_type: 'voice' | 'video';
  call_status: 'offer' | 'ringing' | 'connected' | 'missed' | 'rejected';
  duration_seconds: number;
  caller_number: string;
  caller_name?: string | null;
  created_at: string;
}

export interface WhatsAppInternalNote {
  id: string;
  tenant_id: string;
  conversation_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;

  // Joined
  author?: {
    id: string;
    name: string;
  } | null;
}

export type TimelineItemType = 'message' | 'event' | 'transfer' | 'note' | 'call' | 'cycle_marker';

export interface WhatsAppCycleMarker {
  id: string;
  conversation_id: string;
  marker_type: 'start' | 'end';
  title: string;
  subtitle?: string;
  timestamp: string;
  status?: WhatsAppChatStatus;
  assigned_user_name?: string;
  reason?: string | null;
}

export interface WhatsAppTimelineItem {
  id: string;
  type: TimelineItemType;
  created_at: string;
  data:
    | { type: 'message'; item: WhatsAppMessage }
    | { type: 'event'; item: WhatsAppEvent }
    | { type: 'transfer'; item: WhatsAppTransfer }
    | { type: 'note'; item: WhatsAppInternalNote }
    | { type: 'call'; item: WhatsAppCall }
    | { type: 'cycle_marker'; item: WhatsAppCycleMarker };
}

export type WhatsAppReminderType =
  | 'confirmation'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'reschedule'
  | 'cancellation';

export type WhatsAppReminderStatus = 'pending' | 'sent' | 'failed' | 'cancelled' | 'skipped';

export interface WhatsAppReminderLog {
  id: string;
  tenant_id: string;
  appointment_id: string;
  contact_id?: string | null;
  reminder_type: WhatsAppReminderType;
  scheduled_for: string;
  status: WhatsAppReminderStatus;
  skip_reason?: string | null;
  reference_message_id?: string | null;
  reference_sent_at?: string | null;
  evolution_msg_id?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
}

export interface WhatsAppReminderSettings {
  tenant_id: string;
  enabled: boolean;
  send_confirmation_on_create: boolean;
  reminder_24h_enabled: boolean;
  reminder_2h_enabled: boolean;
  confirmation_template: string;
  reminder_template: string;
  cancellation_template: string;
  reschedule_template: string;
  reschedule_enabled?: boolean;
  cancellation_enabled?: boolean;
  agent_identification_policy?: 'AUTOMATICO' | 'SEMPRE' | 'NUNCA';
  updated_at: string;
}

