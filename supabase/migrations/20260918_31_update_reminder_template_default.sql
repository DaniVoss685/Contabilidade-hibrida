-- Migration: 20260918_31_update_reminder_template_default.sql
-- Descrição: Atualiza o padrão do reminder_template para usar a variável semântica {{quando}} em vez de 'amanhã' estático

ALTER TABLE public.df_wa_reminder_settings
  ALTER COLUMN reminder_template SET DEFAULT 'Olá, *{{paciente}}*! Lembramos que sua consulta está marcada para {{quando}} às *{{hora}}* com *{{profissional}}*. Aguardamos você! Caso tenha algum imprevisto, nos avise por aqui 😬';

UPDATE public.df_wa_reminder_settings
SET reminder_template = 'Olá, *{{paciente}}*! Lembramos que sua consulta está marcada para {{quando}} às *{{hora}}* com *{{profissional}}*. Aguardamos você! Caso tenha algum imprevisto, nos avise por aqui 😬'
WHERE reminder_template ILIKE '%amanhã%';
