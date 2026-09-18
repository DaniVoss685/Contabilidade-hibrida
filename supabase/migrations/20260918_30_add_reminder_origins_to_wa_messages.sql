-- Migration: 20260918_30_add_reminder_origins_to_wa_messages.sql
-- Descrição: Permite origens dedicadas de lembretes em df_wa_messages.origin:
--            appointment_reminder_24h e appointment_reminder_2h

ALTER TABLE public.df_wa_messages
  DROP CONSTRAINT IF EXISTS df_wa_messages_origin_check;

ALTER TABLE public.df_wa_messages
  ADD CONSTRAINT df_wa_messages_origin_check
  CHECK (origin = ANY (ARRAY[
    'attendant'::text,
    'appointment_confirmation'::text,
    'appointment_reminder'::text,
    'appointment_reminder_24h'::text,
    'appointment_reminder_2h'::text,
    'appointment_reschedule'::text,
    'appointment_cancellation'::text,
    'system'::text
  ]));
