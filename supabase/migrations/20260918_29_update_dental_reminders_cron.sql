-- ============================================================================
-- MIGRATION: 20260918_29_update_dental_reminders_cron.sql
-- DESCRIÇÃO: Atualiza o job do pg_cron para chamar a Edge Function oficial
-- dental-whatsapp-reminders a cada 5 minutos
-- ============================================================================

SELECT cron.unschedule('dental-appointment-reminders-cron');

SELECT cron.schedule(
  'dental-whatsapp-reminders-cron',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
      url := 'https://fbkouuvupdyffizwoiti.functions.supabase.co/dental-whatsapp-reminders',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
  );
  $$
);
