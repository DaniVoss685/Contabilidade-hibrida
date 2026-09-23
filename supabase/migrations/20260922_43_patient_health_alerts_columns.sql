-- ==============================================================================
-- MIGRATION 43: PERSISTÊNCIA CANÔNICA DOS ALERTAS DE SAÚDE DO PACIENTE
-- Garante colunas em df_patients para alergias, condições, medicamentos e
-- observações clínicas usadas pelo Resumo > Alertas de Saúde e Anamnese Rápida.
-- ==============================================================================

ALTER TABLE public.df_patients
  ADD COLUMN IF NOT EXISTS allergies JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS medications JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clinical_notes TEXT;

NOTIFY pgrst, 'reload schema';
