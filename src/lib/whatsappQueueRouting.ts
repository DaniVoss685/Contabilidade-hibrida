// Regra pura de roteamento de conversa/fila para mensagens WhatsApp inbound/outbound.
// A MESMA regra está implementada inline em supabase/functions/dental-whatsapp-webhook/index.ts
// (seção "5. RESOLVER CONVERSA NO TENANT" e "6.5 NOTIFICAÇÃO GLOBAL") — manter em sincronia com
// este arquivo ao alterar qualquer um dos dois (edge functions não importam src/lib).
//
// Contrato (revisado 2026-09-29): confirmar um agendamento via resposta do paciente e colocar a
// conversa em fila NÃO são mutuamente exclusivos. Uma automação pode confirmar a consulta E ao
// mesmo tempo a conversa precisa ficar visível operacionalmente quando não há atendimento ativo.
// Por isso esta função NUNCA recebe "a mensagem confirmou um agendamento?" como parâmetro — essa
// informação é irrelevante para a decisão de roteamento.

export interface ConversationRoutingInput {
  /** true = mensagem enviada pelo próprio sistema/atendente (fromMe da Evolution). */
  isFromMe: boolean;
  /** true = já existe conversa não finalizada/arquivada para este contato (reaproveita, nunca duplica). */
  hasActiveConversation: boolean;
  /**
   * true = disparo automático transacional do sistema (confirmação/lembrete de agenda) — só pode
   * ser true quando isFromMe também é true (mensagem automática é sempre outbound).
   */
  isTransactionalReminder: boolean;
}

export type ConversationRoutingReason =
  | 'REUSE_ACTIVE'
  | 'INBOUND_HUMAN'
  | 'MANUAL_OUTBOUND'
  | 'AUTOMATED_OUTBOUND_SKIPPED';

export interface ConversationRoutingResult {
  /** false somente para disparo automático outbound sem atendimento ativo — nenhuma conversa é criada. */
  shouldHaveConversation: boolean;
  /** Status inicial quando uma conversa NOVA é criada; null quando reaproveita uma existente ou quando não cria. */
  initialStatus: 'em_atendimento' | 'na_fila' | null;
  reason: ConversationRoutingReason;
}

export function resolveConversationRouting(input: ConversationRoutingInput): ConversationRoutingResult {
  if (input.hasActiveConversation) {
    return { shouldHaveConversation: true, initialStatus: null, reason: 'REUSE_ACTIVE' };
  }
  if (!input.isTransactionalReminder) {
    return {
      shouldHaveConversation: true,
      initialStatus: input.isFromMe ? 'em_atendimento' : 'na_fila',
      reason: input.isFromMe ? 'MANUAL_OUTBOUND' : 'INBOUND_HUMAN',
    };
  }
  return { shouldHaveConversation: false, initialStatus: null, reason: 'AUTOMATED_OUTBOUND_SKIPPED' };
}

/** Espelha a guarda `if (!isFromMe)` da seção 6.5 (notificação in-app + Web Push). */
export function shouldNotifyInboundMessage(isFromMe: boolean): boolean {
  return !isFromMe;
}
