-- ==============================================================================
-- FASE 3 — MIGRATION 13: AUDITORIA IMUTÁVEL E ACESSO CONTÁBIL A CONFIRMAÇÕES
-- Arquivo: supabase/migrations/20260915_13_integration_audit_and_confirmations_security.sql
-- ==============================================================================

-- 1. ACCOUNTING_INTEGRATION_AUDIT_LOGS (APPEND-ONLY E IMUTÁVEL)
REVOKE ALL ON TABLE public.accounting_integration_audit_logs FROM anon;
ALTER TABLE public.accounting_integration_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_accounting_integration_audit_logs_all" ON public.accounting_integration_audit_logs;
DROP POLICY IF EXISTS "accounting_audit_select_policy" ON public.accounting_integration_audit_logs;
DROP POLICY IF EXISTS "accounting_audit_insert_operator_policy" ON public.accounting_integration_audit_logs;

-- Leitura: Operadores do Contábilex ou dentistas para auditoria do próprio tenant
CREATE POLICY "accounting_audit_select_policy" ON public.accounting_integration_audit_logs
    FOR SELECT TO authenticated
    USING (
        public.is_contabilex_operator()
        OR public.is_dental_tenant_member(dental_tenant_id)
    );

-- Escrita: Estritamente operadores do Contábilex
CREATE POLICY "accounting_audit_insert_operator_policy" ON public.accounting_integration_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (public.is_contabilex_operator());

-- Nenhum UPDATE ou DELETE policy = bloqueio total (trilha append-only imutável)

-- 2. DF_ACCOUNTING_CONFIRMATIONS (LEITURA MÍNIMA PARA CONTÁBILEX)
DROP POLICY IF EXISTS "df_accounting_confirmations_contabilex_select" ON public.df_accounting_confirmations;

CREATE POLICY "df_accounting_confirmations_contabilex_select" ON public.df_accounting_confirmations
    FOR SELECT TO authenticated
    USING (public.is_contabilex_operator());
