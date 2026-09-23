-- ==============================================================================
-- MIGRATION 42: ALINHAMENTO DE SCHEMA CLÍNICO E TRANSFORMAÇÕES ANTES/DEPOIS
-- Adiciona colunas para invalidação segura, continuação e enquadramento de fotos
-- ==============================================================================

ALTER TABLE public.df_clinical_records
  ADD COLUMN IF NOT EXISTS voided_by text,
  ADD COLUMN IF NOT EXISTS voided_by_name text,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS continuation_of_record_id text,
  ADD COLUMN IF NOT EXISTS continuation_date text;

ALTER TABLE public.df_clinical_before_after_pairs
  ADD COLUMN IF NOT EXISTS before_position_x numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS before_position_y numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS before_zoom numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS after_position_x numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS after_position_y numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS after_zoom numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS divider_position numeric DEFAULT 50;

NOTIFY pgrst, 'reload schema';
