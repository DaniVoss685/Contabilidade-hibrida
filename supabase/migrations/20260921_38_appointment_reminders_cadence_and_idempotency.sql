-- ============================================================================
-- Migration: 20260921_38_appointment_reminders_cadence_and_idempotency.sql
-- Descrição: Hardening de Idempotência e Cadência Inteligente (48h) de Lembretes
-- 1. Atualiza constraint uq_df_wa_reminders_idempotency para incluir scheduled_for
-- 2. Adiciona colunas para registrar motivo e mensagem de referência da supressão (skip)
-- 3. Adiciona índices para consulta de histórico transacional de confirmação/reagendamento
-- ============================================================================

-- 1. Atualizar chave de idempotência de df_wa_reminders_log
ALTER TABLE public.df_wa_reminders_log
  DROP CONSTRAINT IF EXISTS uq_df_wa_reminders_idempotency;

ALTER TABLE public.df_wa_reminders_log
  ADD CONSTRAINT uq_df_wa_reminders_idempotency 
  UNIQUE (tenant_id, appointment_id, reminder_type, scheduled_for);

-- 2. Adicionar colunas para log detalhado de supressão / auditoria
ALTER TABLE public.df_wa_reminders_log
  ADD COLUMN IF NOT EXISTS skip_reason TEXT,
  ADD COLUMN IF NOT EXISTS reference_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reference_sent_at TIMESTAMPTZ;

-- 3. Índices otimizados para busca rápida de comunicações transacionais prévias da mesma consulta
CREATE INDEX IF NOT EXISTS idx_df_wa_reminders_cadence_lookup
  ON public.df_wa_reminders_log (tenant_id, appointment_id, reminder_type, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_df_wa_messages_cadence_lookup
  ON public.df_wa_messages (tenant_id, appointment_id, origin, from_me, created_at DESC);
