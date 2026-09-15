-- Migration 0: Helpers de Tenant e Índices de Performance
-- Função 1: current_dental_tenant_id()
CREATE OR REPLACE FUNCTION public.current_dental_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT clinic_id
  FROM public.df_users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- Função 2: is_dental_tenant_member(p_tenant_id text)
CREATE OR REPLACE FUNCTION public.is_dental_tenant_member(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.df_users
    WHERE auth_user_id = auth.uid()
      AND clinic_id = p_tenant_id
      AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION public.current_dental_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_dental_tenant_id() TO authenticated;

REVOKE ALL ON FUNCTION public.is_dental_tenant_member(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_dental_tenant_member(text) TO authenticated;

-- Índices de Performance para RLS
CREATE INDEX IF NOT EXISTS idx_df_users_clinic_id ON public.df_users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_df_patients_tenant ON public.df_patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_appointments_tenant ON public.df_appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_procedures_tenant ON public.df_procedures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_clinical_inputs_tenant ON public.df_clinical_inputs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_sales_tenant ON public.df_sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_expenses_tenant ON public.df_expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_bank_accounts_tenant ON public.df_bank_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_audit_logs_tenant ON public.df_audit_logs(tenant_id);
