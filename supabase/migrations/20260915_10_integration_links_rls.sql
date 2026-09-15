-- ==============================================================================
-- FASE 3 — MIGRATION 10: RLS EM INTEGRATION_CLIENT_LINKS (ANTI-AUTOAPROVAÇÃO)
-- Arquivo: supabase/migrations/20260915_10_integration_links_rls.sql
-- ==============================================================================

-- 1. REVOGAR PRIVILÉGIOS DE ANON
REVOKE ALL ON TABLE public.integration_client_links FROM anon;

-- 2. HABILITAR RLS
ALTER TABLE public.integration_client_links ENABLE ROW LEVEL SECURITY;

-- 3. REMOVER POLICIES ABERTAS ANTERIORES
DROP POLICY IF EXISTS "allow_integration_client_links_all" ON public.integration_client_links;
DROP POLICY IF EXISTS "integration_links_select_policy" ON public.integration_client_links;
DROP POLICY IF EXISTS "integration_links_insert_dental_policy" ON public.integration_client_links;
DROP POLICY IF EXISTS "integration_links_insert_operator_policy" ON public.integration_client_links;
DROP POLICY IF EXISTS "integration_links_update_operator_policy" ON public.integration_client_links;
DROP POLICY IF EXISTS "integration_links_delete_operator_policy" ON public.integration_client_links;

-- 4. POLÍTICA DE SELECT
-- Contábilex pode ver todos os vínculos para aprovação e gestão.
-- Dental Finance pode ver SOMENTE o vínculo de seu próprio tenant ativo.
CREATE POLICY "integration_links_select_policy" ON public.integration_client_links
    FOR SELECT TO authenticated
    USING (
        public.is_contabilex_operator()
        OR public.is_dental_tenant_member(dental_tenant_id)
    );

-- 5. POLÍTICA DE INSERT DENTAL
-- Dental Finance só pode criar solicitações com status PENDING para sua própria clínica
-- Não pode definir client_id, linked_at ou linked_by (evita injeção de aprovação forjada)
CREATE POLICY "integration_links_insert_dental_policy" ON public.integration_client_links
    FOR INSERT TO authenticated
    WITH CHECK (
        status = 'PENDING'
        AND dental_tenant_id = public.current_dental_tenant_id()
        AND contabilex_client_id IS NULL
        AND linked_at IS NULL
        AND linked_by IS NULL
        AND linked_by_name IS NULL
    );

-- 6. POLÍTICA DE INSERT CONTÁBILEX OPERATOR
CREATE POLICY "integration_links_insert_operator_policy" ON public.integration_client_links
    FOR INSERT TO authenticated
    WITH CHECK (public.is_contabilex_operator());

-- 7. POLÍTICA DE UPDATE (ESTRITAMENTE OPERADOR CONTÁBILEX)
-- Dental Finance tem DENY total em UPDATE (impossível autoaprovar PENDING -> ACTIVE)
CREATE POLICY "integration_links_update_operator_policy" ON public.integration_client_links
    FOR UPDATE TO authenticated
    USING (public.is_contabilex_operator())
    WITH CHECK (public.is_contabilex_operator());

-- 8. POLÍTICA DE DELETE (ESTRITAMENTE OPERADOR CONTÁBILEX)
CREATE POLICY "integration_links_delete_operator_policy" ON public.integration_client_links
    FOR DELETE TO authenticated
    USING (public.is_contabilex_operator());
