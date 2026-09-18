-- Migration: 20260918_32_add_patient_to_wa_messages_origin.sql
-- Descrição: Adiciona 'patient' ao check constraint de df_wa_messages.origin

ALTER TABLE public.df_wa_messages
  DROP CONSTRAINT IF EXISTS df_wa_messages_origin_check;

ALTER TABLE public.df_wa_messages
  ADD CONSTRAINT df_wa_messages_origin_check
  CHECK (origin = ANY (ARRAY[
    'patient'::text,
    'attendant'::text,
    'system'::text,
    'appointment_confirmation'::text,
    'appointment_reminder'::text,
    'appointment_reminder_24h'::text,
    'appointment_reminder_2h'::text,
    'appointment_reschedule'::text,
    'appointment_cancellation'::text
  ]));
