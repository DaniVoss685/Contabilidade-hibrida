-- Profissionais CLÍNICOS (equipe de dentistas/atendentes clínicos de uma clínica), distintos de
-- df_professionals (que é a identidade FISCAL única por tenant — RBT12, regime tributário, CRO do
-- responsável para fins de imposto; usada por fiscalBase.ts/taxEngine e por
-- get_all_dental_tenants()/updateTenantClinicName, nunca deve virar "N linhas"). USUÁRIO/LOGIN
-- (df_users) e PROFISSIONAL CLÍNICO são conceitos independentes: duas dentistas podem compartilhar
-- o mesmo login da clínica, cada uma com seu próprio df_clinical_professionals.
--
-- user_id é opcional: quando uma dentista tem login próprio, vincular aqui permite que a Agenda/
-- Prontuário pré-selecionem automaticamente "ela mesma" como profissional responsável.

CREATE TABLE IF NOT EXISTS public.df_clinical_professionals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cro TEXT,
  cro_uf TEXT,
  especialidade TEXT,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  user_id TEXT REFERENCES public.df_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_df_clinical_professionals_tenant ON public.df_clinical_professionals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_clinical_professionals_user ON public.df_clinical_professionals(user_id);

ALTER TABLE public.df_clinical_professionals ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de isolamento por tenant já usado em df_patient_guardian_links/df_wa_contact_patients:
-- RLS garante só o tenant (RLS não distingue quem pode GERENCIAR a lista — isso é gate de UI via
-- permissions.ts, professionals:manage — mesma lacuna já documentada para pricing:manage/procedures
-- em CLAUDE.md; impor de verdade exigiria RPC/policy por permissão individual).
DROP POLICY IF EXISTS "df_clinical_professionals_policy" ON public.df_clinical_professionals;
CREATE POLICY "df_clinical_professionals_policy" ON public.df_clinical_professionals
  FOR ALL
  USING (is_dental_tenant_member(tenant_id))
  WITH CHECK (is_dental_tenant_member(tenant_id));
