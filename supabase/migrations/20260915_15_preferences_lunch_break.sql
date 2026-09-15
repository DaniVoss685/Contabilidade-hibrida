-- Migration: 20260915_15_preferences_lunch_break.sql
-- Adiciona colunas para persistência do horário de almoço por tenant em df_system_preferences
-- Preserva todas as políticas RLS existentes da tabela

ALTER TABLE public.df_system_preferences
ADD COLUMN IF NOT EXISTS lunch_break_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS lunch_break_start text,
ADD COLUMN IF NOT EXISTS lunch_break_end text;

COMMENT ON COLUMN public.df_system_preferences.lunch_break_enabled IS 'Indica se o intervalo de almoço na agenda está ativo (padrão false para novos tenants)';
COMMENT ON COLUMN public.df_system_preferences.lunch_break_start IS 'Horário de início do intervalo de almoço (ex: 11:00 ou 12:00)';
COMMENT ON COLUMN public.df_system_preferences.lunch_break_end IS 'Horário de término do intervalo de almoço (ex: 13:00)';
