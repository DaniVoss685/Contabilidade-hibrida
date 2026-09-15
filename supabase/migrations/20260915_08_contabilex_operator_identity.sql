-- ==============================================================================
-- FASE 3 — MIGRATION 08: IDENTIDADE DO OPERADOR CONTÁBILEX
-- Arquivo: supabase/migrations/20260915_08_contabilex_operator_identity.sql
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_contabilex_operator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.df_users WHERE auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'fiscal', 'payroll', 'accounting', 'gestor', 'dono', 'legal', 'financial', 'it')
        AND (organization_id = '00000000-0000-0000-0000-000000000001'::uuid OR organization_id IS NOT NULL)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_contabilex_operator() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_contabilex_operator() TO authenticated;
