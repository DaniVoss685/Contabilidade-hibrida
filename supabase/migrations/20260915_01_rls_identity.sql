-- Migration 1: Grupo 1 — Identidade, Tenant e Profissional (df_users, df_tenants, df_professionals)

-- 1. df_users
DROP POLICY IF EXISTS df_users_policy ON public.df_users;
DROP POLICY IF EXISTS df_users_select_own ON public.df_users;
DROP POLICY IF EXISTS df_users_update_own ON public.df_users;
DROP POLICY IF EXISTS df_users_insert_own ON public.df_users;

ALTER TABLE public.df_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_users_select_own ON public.df_users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY df_users_update_own ON public.df_users
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid() AND clinic_id = public.current_dental_tenant_id());

CREATE POLICY df_users_insert_own ON public.df_users
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- 2. df_tenants
DROP POLICY IF EXISTS df_tenants_policy ON public.df_tenants;
DROP POLICY IF EXISTS df_tenants_select_own ON public.df_tenants;
DROP POLICY IF EXISTS df_tenants_update_own ON public.df_tenants;
DROP POLICY IF EXISTS df_tenants_insert_own ON public.df_tenants;

ALTER TABLE public.df_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_tenants_select_own ON public.df_tenants
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(id));

CREATE POLICY df_tenants_update_own ON public.df_tenants
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(id))
  WITH CHECK (public.is_dental_tenant_member(id));

CREATE POLICY df_tenants_insert_own ON public.df_tenants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(id));

-- 3. df_professionals
DROP POLICY IF EXISTS df_professionals_policy ON public.df_professionals;
DROP POLICY IF EXISTS df_professionals_select_policy ON public.df_professionals;
DROP POLICY IF EXISTS df_professionals_insert_policy ON public.df_professionals;
DROP POLICY IF EXISTS df_professionals_update_policy ON public.df_professionals;
DROP POLICY IF EXISTS df_professionals_delete_policy ON public.df_professionals;

ALTER TABLE public.df_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_professionals_select_policy ON public.df_professionals
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_professionals_insert_policy ON public.df_professionals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_professionals_update_policy ON public.df_professionals
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_professionals_delete_policy ON public.df_professionals
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));
