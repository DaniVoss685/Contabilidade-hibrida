-- Vínculo N:N procedimento <-> profissional clínico habilitado a executá-lo. AUSÊNCIA de qualquer
-- linha para um procedimento = "disponível a todos os profissionais ativos" (regra de negócio; não
-- precisa de flag extra — ver resolveEligibleProfessionals em src/lib/professionalScheduling.ts).
-- Mesmo padrão estrutural de df_patient_guardian_links/df_wa_contact_patients: PK composta, FKs em
-- cascata, tenant_id denormalizado para RLS/índice direto sem join.

CREATE TABLE IF NOT EXISTS public.df_procedure_professionals (
  tenant_id TEXT NOT NULL,
  procedure_id TEXT NOT NULL REFERENCES public.df_procedures(id) ON DELETE CASCADE,
  professional_id TEXT NOT NULL REFERENCES public.df_clinical_professionals(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (procedure_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_df_procedure_professionals_tenant ON public.df_procedure_professionals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_procedure_professionals_procedure ON public.df_procedure_professionals(procedure_id);
CREATE INDEX IF NOT EXISTS idx_df_procedure_professionals_professional ON public.df_procedure_professionals(professional_id);

ALTER TABLE public.df_procedure_professionals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "df_procedure_professionals_policy" ON public.df_procedure_professionals;
CREATE POLICY "df_procedure_professionals_policy" ON public.df_procedure_professionals
  FOR ALL
  USING (is_dental_tenant_member(tenant_id))
  WITH CHECK (is_dental_tenant_member(tenant_id));
