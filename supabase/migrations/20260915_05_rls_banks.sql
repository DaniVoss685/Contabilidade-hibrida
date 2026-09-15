-- Migration 5: Grupo 10 — Contas Bancárias (df_bank_accounts)

DROP POLICY IF EXISTS df_bank_accounts_policy ON public.df_bank_accounts;
DROP POLICY IF EXISTS df_bank_accounts_select_policy ON public.df_bank_accounts;
DROP POLICY IF EXISTS df_bank_accounts_insert_policy ON public.df_bank_accounts;
DROP POLICY IF EXISTS df_bank_accounts_update_policy ON public.df_bank_accounts;
DROP POLICY IF EXISTS df_bank_accounts_delete_policy ON public.df_bank_accounts;

ALTER TABLE public.df_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_bank_accounts_select_policy ON public.df_bank_accounts
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_bank_accounts_insert_policy ON public.df_bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_bank_accounts_update_policy ON public.df_bank_accounts
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_bank_accounts_delete_policy ON public.df_bank_accounts
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));
