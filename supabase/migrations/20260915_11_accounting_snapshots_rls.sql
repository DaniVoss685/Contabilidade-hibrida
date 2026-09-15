-- ==============================================================================
-- FASE 3 — MIGRATION 11: RLS EM ACCOUNTING_MONTHLY_SNAPSHOTS (DENTAL READ-ONLY)
-- Arquivo: supabase/migrations/20260915_11_accounting_snapshots_rls.sql
-- ==============================================================================

-- 1. REVOGAR PRIVILÉGIOS DE ANON
REVOKE ALL ON TABLE public.accounting_monthly_snapshots FROM anon;

-- 2. HABILITAR RLS
ALTER TABLE public.accounting_monthly_snapshots ENABLE ROW LEVEL SECURITY;

-- 3. REMOVER POLICIES ABERTAS ANTERIORES
DROP POLICY IF EXISTS "allow_accounting_monthly_snapshots_all" ON public.accounting_monthly_snapshots;
DROP POLICY IF EXISTS "accounting_snapshots_select_policy" ON public.accounting_monthly_snapshots;
DROP POLICY IF EXISTS "accounting_snapshots_insert_operator_policy" ON public.accounting_monthly_snapshots;
DROP POLICY IF EXISTS "accounting_snapshots_update_operator_policy" ON public.accounting_monthly_snapshots;
DROP POLICY IF EXISTS "accounting_snapshots_delete_operator_policy" ON public.accounting_monthly_snapshots;

-- 4. POLÍTICA DE SELECT
-- Contábilex pode ler todos os snapshots (rascunhos e publicados).
-- Dental Finance pode ler APENAS snapshots publicados (PUBLISHED) do seu próprio tenant.
CREATE POLICY "accounting_snapshots_select_policy" ON public.accounting_monthly_snapshots
    FOR SELECT TO authenticated
    USING (
        public.is_contabilex_operator()
        OR (
            public.is_dental_tenant_member(dental_tenant_id)
            AND status = 'PUBLISHED'
        )
    );

-- 5. POLÍTICA DE INSERT (ESTRITAMENTE OPERADOR CONTÁBILEX)
CREATE POLICY "accounting_snapshots_insert_operator_policy" ON public.accounting_monthly_snapshots
    FOR INSERT TO authenticated
    WITH CHECK (public.is_contabilex_operator());

-- 6. POLÍTICA DE UPDATE (ESTRITAMENTE OPERADOR CONTÁBILEX)
CREATE POLICY "accounting_snapshots_update_operator_policy" ON public.accounting_monthly_snapshots
    FOR UPDATE TO authenticated
    USING (public.is_contabilex_operator())
    WITH CHECK (public.is_contabilex_operator());

-- 7. POLÍTICA DE DELETE (ESTRITAMENTE OPERADOR CONTÁBILEX)
CREATE POLICY "accounting_snapshots_delete_operator_policy" ON public.accounting_monthly_snapshots
    FOR DELETE TO authenticated
    USING (public.is_contabilex_operator());
