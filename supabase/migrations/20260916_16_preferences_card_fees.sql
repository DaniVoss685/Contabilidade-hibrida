-- Migration: 20260916_16_preferences_card_fees.sql
-- Adiciona coluna card_fees jsonb para armazenar taxas de cartão de débito e crédito (1x a 12x)
-- Preserva RLS existente da tabela df_system_preferences

ALTER TABLE public.df_system_preferences
ADD COLUMN IF NOT EXISTS card_fees jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.df_system_preferences.card_fees IS 'Estrutura JSON com taxas de cartão por tenant: { debit: number, credit: { [installments]: number } }';
