-- Migration 2: Grupos 2 e 3 — Pacientes e Agenda (df_patients, df_appointments)

-- 1. df_patients
DROP POLICY IF EXISTS df_patients_policy ON public.df_patients;
DROP POLICY IF EXISTS df_patients_select_policy ON public.df_patients;
DROP POLICY IF EXISTS df_patients_insert_policy ON public.df_patients;
DROP POLICY IF EXISTS df_patients_update_policy ON public.df_patients;
DROP POLICY IF EXISTS df_patients_delete_policy ON public.df_patients;

ALTER TABLE public.df_patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_patients_select_policy ON public.df_patients
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_patients_insert_policy ON public.df_patients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_patients_update_policy ON public.df_patients
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_patients_delete_policy ON public.df_patients
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

-- 2. df_appointments
DROP POLICY IF EXISTS df_appointments_policy ON public.df_appointments;
DROP POLICY IF EXISTS df_appointments_select_policy ON public.df_appointments;
DROP POLICY IF EXISTS df_appointments_insert_policy ON public.df_appointments;
DROP POLICY IF EXISTS df_appointments_update_policy ON public.df_appointments;
DROP POLICY IF EXISTS df_appointments_delete_policy ON public.df_appointments;

ALTER TABLE public.df_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY df_appointments_select_policy ON public.df_appointments
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_appointments_insert_policy ON public.df_appointments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_appointments_update_policy ON public.df_appointments
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

CREATE POLICY df_appointments_delete_policy ON public.df_appointments
  FOR DELETE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));
