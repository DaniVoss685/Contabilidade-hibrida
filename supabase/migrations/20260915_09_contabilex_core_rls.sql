-- ==============================================================================
-- FASE 3 — MIGRATION 09: RLS NAS TABELAS INTERNAS DO CONTÁBILEX
-- Arquivo: supabase/migrations/20260915_09_contabilex_core_rls.sql
-- ==============================================================================

-- 1. REVOGAR PRIVILÉGIOS DE ANON NAS TABELAS INTERNAS DO CONTÁBILEX
REVOKE ALL ON TABLE public.clients FROM anon;
REVOKE ALL ON TABLE public.fiscal_history FROM anon;
REVOKE ALL ON TABLE public.payroll_history FROM anon;

-- 2. PUBLIC.CLIENTS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access" ON public.clients;
DROP POLICY IF EXISTS "clients_contabilex_operator_all" ON public.clients;

CREATE POLICY "clients_contabilex_operator_all" ON public.clients
    FOR ALL TO authenticated
    USING (public.is_contabilex_operator())
    WITH CHECK (public.is_contabilex_operator());

-- 3. PUBLIC.FISCAL_HISTORY
ALTER TABLE public.fiscal_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable delete access for all users" ON public.fiscal_history;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.fiscal_history;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.fiscal_history;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.fiscal_history;
DROP POLICY IF EXISTS "fiscal_history_contabilex_operator_all" ON public.fiscal_history;

CREATE POLICY "fiscal_history_contabilex_operator_all" ON public.fiscal_history
    FOR ALL TO authenticated
    USING (public.is_contabilex_operator())
    WITH CHECK (public.is_contabilex_operator());

-- 4. PUBLIC.PAYROLL_HISTORY
ALTER TABLE public.payroll_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for public" ON public.payroll_history;
DROP POLICY IF EXISTS "payroll_history_contabilex_operator_all" ON public.payroll_history;

CREATE POLICY "payroll_history_contabilex_operator_all" ON public.payroll_history
    FOR ALL TO authenticated
    USING (public.is_contabilex_operator())
    WITH CHECK (public.is_contabilex_operator());
