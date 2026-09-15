-- ==============================================================================
-- FASE 3 — MIGRATION 12: HARDENING DA RPC GET_DENTAL_TENANT_SNAPSHOTS
-- Arquivo: supabase/migrations/20260915_12_snapshot_rpc_security.sql
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_dental_tenant_snapshots(
    p_dental_tenant_id TEXT,
    p_limit INTEGER DEFAULT 12
)
RETURNS TABLE (
    id UUID,
    contabilex_client_id UUID,
    dental_tenant_id TEXT,
    competency TEXT,
    gross_revenue NUMERIC(15, 2),
    payroll_total NUMERIC(15, 2),
    pro_labore NUMERIC(15, 2),
    fgts NUMERIC(15, 2),
    inss NUMERIC(15, 2),
    irrf NUMERIC(15, 2),
    factor_r_payroll_base NUMERIC(15, 2),
    das_total NUMERIC(15, 2),
    effective_rate NUMERIC(8, 4),
    version INTEGER,
    status TEXT,
    content_hash TEXT,
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- 1. Exige sessão autenticada
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;

    -- 2. Valida autorização:
    -- O chamador DEVE ser operador do Contábilex OU membro comprovado do tenant solicitado
    IF NOT (public.is_contabilex_operator() OR public.is_dental_tenant_member(p_dental_tenant_id)) THEN
        RETURN;
    END IF;

    -- 3. Verifica se o tenant possui vínculo ativo
    IF NOT EXISTS (
        SELECT 1 FROM public.integration_client_links
        WHERE integration_client_links.dental_tenant_id = p_dental_tenant_id
          AND integration_client_links.status = 'ACTIVE'
    ) THEN
        RETURN;
    END IF;

    -- 4. Retorna apenas snapshots publicados e vigentes
    RETURN QUERY
    SELECT 
        s.id,
        s.contabilex_client_id,
        s.dental_tenant_id,
        s.competency,
        s.gross_revenue,
        s.payroll_total,
        s.pro_labore,
        s.fgts,
        s.inss,
        s.irrf,
        s.factor_r_payroll_base,
        s.das_total,
        s.effective_rate,
        s.version,
        s.status,
        s.content_hash,
        s.published_at,
        s.updated_at,
        'contabilex'::TEXT AS source
    FROM public.accounting_monthly_snapshots s
    WHERE s.dental_tenant_id = p_dental_tenant_id
      AND s.status = 'PUBLISHED'
      AND s.is_current = true
    ORDER BY s.competency DESC
    LIMIT p_limit;
END;
$$;

-- Revoga acesso para anônimos e público geral; concede estritamente para autenticados
REVOKE EXECUTE ON FUNCTION public.get_dental_tenant_snapshots(TEXT, INTEGER) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_dental_tenant_snapshots(TEXT, INTEGER) TO authenticated;
