-- Migration 3: Grupos 4 e 5 — Procedimentos e Insumos / Estoque (df_procedures, df_clinical_inputs)

-- 1. df_procedures
DROP POLICY IF EXISTS df_procedures_policy ON public.df_procedures;
DROP POLICY IF EXISTS df_procedures_select_policy ON public.df_procedures;
DROP POLICY IF EXISTS df_procedures_insert_policy ON public.df_procedures;
DROP POLICY IF EXISTS df_procedures_update_policy ON public.df_procedures;
DROP POLICY IF EXISTS df_procedures_delete_policy ON public.df_procedures;

ALTER TABLE public.df_procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_procedures_select_policy ON public.df_procedures
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_procedures_insert_policy ON public.df_procedures
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_procedures_update_policy ON public.df_procedures
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_procedures_delete_policy ON public.df_procedures
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

-- 2. df_clinical_inputs
DROP POLICY IF EXISTS df_clinical_inputs_policy ON public.df_clinical_inputs;
DROP POLICY IF EXISTS df_clinical_inputs_select_policy ON public.df_clinical_inputs;
DROP POLICY IF EXISTS df_clinical_inputs_insert_policy ON public.df_clinical_inputs;
DROP POLICY IF EXISTS df_clinical_inputs_update_policy ON public.df_clinical_inputs;
DROP POLICY IF EXISTS df_clinical_inputs_delete_policy ON public.df_clinical_inputs;

ALTER TABLE public.df_clinical_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_clinical_inputs_select_policy ON public.df_clinical_inputs
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_clinical_inputs_insert_policy ON public.df_clinical_inputs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_clinical_inputs_update_policy ON public.df_clinical_inputs
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_clinical_inputs_delete_policy ON public.df_clinical_inputs
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));
