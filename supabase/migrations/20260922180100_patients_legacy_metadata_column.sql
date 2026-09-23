-- ==============================================================================
-- MIGRATION: METADATA LEGADA ESTRUTURADA EM df_patients
--
-- Guarda dados capturados de migrações de sistemas anteriores que ainda não
-- têm campo próprio na UI do Dental (endereço completo, sexo, profissão, RG,
-- dados de responsável legal, ids legados, CPF original quando inválido,
-- flags de revisão). Nada aqui substitui campo operacional existente —
-- city/state continuam sendo as colunas reais (ver fix de persistência em
-- src/lib/supabaseClient.ts).
-- ==============================================================================

ALTER TABLE public.df_patients
  ADD COLUMN IF NOT EXISTS legacy_metadata JSONB;

NOTIFY pgrst, 'reload schema';
