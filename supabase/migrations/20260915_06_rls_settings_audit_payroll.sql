-- Migration 6: Grupos 13, 16, 17 — Folha, Preferências, Confirmações e Auditoria
-- (df_payroll_history, df_system_preferences, df_accounting_confirmations, df_audit_logs)

-- 1. df_payroll_history
DROP POLICY IF EXISTS df_payroll_history_policy ON public.df_payroll_history;
DROP POLICY IF EXISTS df_payroll_history_select_policy ON public.df_payroll_history;
DROP POLICY IF EXISTS df_payroll_history_insert_policy ON public.df_payroll_history;
DROP POLICY IF EXISTS df_payroll_history_update_policy ON public.df_payroll_history;
DROP POLICY IF EXISTS df_payroll_history_delete_policy ON public.df_payroll_history;

ALTER TABLE public.df_payroll_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_payroll_history_select_policy ON public.df_payroll_history
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_payroll_history_insert_policy ON public.df_payroll_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_payroll_history_update_policy ON public.df_payroll_history
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_payroll_history_delete_policy ON public.df_payroll_history
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

-- 2. df_system_preferences
DROP POLICY IF EXISTS df_system_preferences_policy ON public.df_system_preferences;
DROP POLICY IF EXISTS df_system_preferences_select_policy ON public.df_system_preferences;
DROP POLICY IF EXISTS df_system_preferences_insert_policy ON public.df_system_preferences;
DROP POLICY IF EXISTS df_system_preferences_update_policy ON public.df_system_preferences;
DROP POLICY IF EXISTS df_system_preferences_delete_policy ON public.df_system_preferences;

ALTER TABLE public.df_system_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_system_preferences_select_policy ON public.df_system_preferences
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_system_preferences_insert_policy ON public.df_system_preferences
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_system_preferences_update_policy ON public.df_system_preferences
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_system_preferences_delete_policy ON public.df_system_preferences
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

-- 3. df_accounting_confirmations
DROP POLICY IF EXISTS "Allow all for df_accounting_confirmations" ON public.df_accounting_confirmations;
DROP POLICY IF EXISTS df_accounting_confirmations_select_policy ON public.df_accounting_confirmations;
DROP POLICY IF EXISTS df_accounting_confirmations_insert_policy ON public.df_accounting_confirmations;
DROP POLICY IF EXISTS df_accounting_confirmations_update_policy ON public.df_accounting_confirmations;
DROP POLICY IF EXISTS df_accounting_confirmations_delete_policy ON public.df_accounting_confirmations;

ALTER TABLE public.df_accounting_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_accounting_confirmations_select_policy ON public.df_accounting_confirmations
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_accounting_confirmations_insert_policy ON public.df_accounting_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_accounting_confirmations_update_policy ON public.df_accounting_confirmations
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_accounting_confirmations_delete_policy ON public.df_accounting_confirmations
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

-- 4. df_audit_logs (Imutabilidade: apenas SELECT e INSERT, UPDATE/DELETE bloqueados)
DROP POLICY IF EXISTS df_audit_logs_policy ON public.df_audit_logs;
DROP POLICY IF EXISTS df_audit_logs_select_policy ON public.df_audit_logs;
DROP POLICY IF EXISTS df_audit_logs_insert_policy ON public.df_audit_logs;

ALTER TABLE public.df_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_audit_logs_select_policy ON public.df_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_audit_logs_insert_policy ON public.df_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));
