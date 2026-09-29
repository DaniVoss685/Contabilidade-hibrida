-- ==============================================================================
-- MIGRATION: Configuração global da assinatura do contador (Declaração de Faturamento)
-- ==============================================================================
-- Linha ÚNICA (id = 'default'), compartilhada por TODAS as clínicas com integração
-- Contábilex ativa — é sempre o mesmo escritório/contador responsável assinando.
-- Só a equipe do escritório (is_primary = true OU role = 'SUPER_ADMIN', mesmo predicado
-- já usado em is_dental_tenant_member / get_all_dental_tenants) pode cadastrar/alterar.
-- Qualquer usuário autenticado e ativo pode LER (precisa exibir na declaração da própria
-- clínica). A imagem da assinatura fica como data URL (base64) na própria linha — evita
-- criar uma exceção nova nas policies de storage.objects do bucket dental-private, que
-- são todas ancoradas em (storage.foldername(name))[1] = tenant_id (não existe "tenant"
-- para um dado global como este).

CREATE TABLE IF NOT EXISTS public.df_accountant_signature (
  id text PRIMARY KEY DEFAULT 'default',
  accountant_name text,
  crc_registration text,
  accountant_cpf text,
  signature_image_data_url text, -- 'data:image/png;base64,...' — imagem pequena, sem Storage
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  updated_by_name text,
  CONSTRAINT df_accountant_signature_single_row CHECK (id = 'default')
);

-- Garante a linha única (idempotente — não sobrescreve se já existir).
INSERT INTO public.df_accountant_signature (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.df_accountant_signature ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_accountant_signature_select ON public.df_accountant_signature;
CREATE POLICY df_accountant_signature_select
ON public.df_accountant_signature
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.df_users
    WHERE auth_user_id = auth.uid() AND is_active = true
  )
);

DROP POLICY IF EXISTS df_accountant_signature_write ON public.df_accountant_signature;
CREATE POLICY df_accountant_signature_write
ON public.df_accountant_signature
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.df_users
    WHERE auth_user_id = auth.uid() AND is_active = true AND (is_primary = true OR role = 'SUPER_ADMIN')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.df_users
    WHERE auth_user_id = auth.uid() AND is_active = true AND (is_primary = true OR role = 'SUPER_ADMIN')
  )
);
