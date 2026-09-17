-- ==============================================================================
-- FASE 4 — MIGRATION 23: RPC SEGURA SERVER-SIDE DE SINCRONIZAÇÃO DENTAL ↔ CONTAJU
-- Arquivo: supabase/migrations/20260916_23_sync_dental_tenant_accounting_snapshots.sql
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_dental_tenant_accounting_snapshots(
    p_dental_tenant_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_link RECORD;
    v_client RECORD;
    v_month RECORD;
    v_fiscal RECORD;
    v_payroll RECORD;
    v_canonical_text TEXT;
    v_content_hash TEXT;
    v_existing_snap RECORD;
    v_gross_revenue NUMERIC(15, 2);
    v_payroll_total NUMERIC(15, 2);
    v_fgts NUMERIC(15, 2);
    v_inss NUMERIC(15, 2);
    v_irrf NUMERIC(15, 2);
    v_factor_r_base NUMERIC(15, 2);
    v_das_total NUMERIC(15, 2);
    v_effective_rate NUMERIC(8, 4);
    v_is_fiscal_done BOOLEAN;
    v_is_payroll_done BOOLEAN;
    v_has_employees BOOLEAN;
    v_new_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_unchanged_count INTEGER := 0;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Exige autenticação
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Acesso não autenticado.';
    END IF;

    -- 2. Permissão de membro do tenant ou operador Contaju
    IF NOT (public.is_contabilex_operator() OR public.is_dental_tenant_member(p_dental_tenant_id)) THEN
        RAISE EXCEPTION 'Acesso não autorizado para o tenant solicitado.';
    END IF;

    -- 3. Localiza vínculo ACTIVE
    SELECT * INTO v_link
    FROM public.integration_client_links
    WHERE dental_tenant_id = p_dental_tenant_id
      AND status = 'ACTIVE'
    LIMIT 1;

    IF v_link.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Nenhum vínculo ativo encontrado para esta clínica.',
            'changed', false,
            'updated_count', 0,
            'new_count', 0,
            'unchanged_count', 0
        );
    END IF;

    -- 4. Localiza cliente Contaju correspondente
    SELECT * INTO v_client
    FROM public.clients
    WHERE id = v_link.contabilex_client_id;

    IF v_client.id IS NULL THEN
        -- Tenta localizar por CNPJ normalizado se não estiver preenchido diretamente
        SELECT * INTO v_client
        FROM public.clients
        WHERE regexp_replace(cnpj, '\D', '', 'g') = v_link.cnpj
        LIMIT 1;
    END IF;

    IF v_client.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente Contaju não localizado para o CNPJ do vínculo.',
            'changed', false,
            'updated_count', 0,
            'new_count', 0,
            'unchanged_count', 0
        );
    END IF;

    v_has_employees := COALESCE(v_client.employees, 0) > 0;

    -- 5. Itera estritamente sobre os últimos 12 meses retroativos da janela móvel dinâmica (do mês anterior ao corrente até 12 meses atrás)
    FOR v_month IN
        SELECT 
            TO_CHAR(d, 'MM/YYYY') AS comp_display,
            TO_CHAR(d, 'YYYY-MM') AS comp_internal
        FROM generate_series(
            date_trunc('month', v_now) - INTERVAL '12 months',
            date_trunc('month', v_now) - INTERVAL '1 month',
            INTERVAL '1 month'
        ) d
        ORDER BY d DESC
    LOOP
        -- Busca registro fiscal
        SELECT * INTO v_fiscal
        FROM public.fiscal_history
        WHERE client_id = v_client.id
          AND month = v_month.comp_display
        LIMIT 1;

        -- Busca registro de folha
        SELECT * INTO v_payroll
        FROM public.payroll_history
        WHERE client_id = v_client.id
          AND month = v_month.comp_display
        LIMIT 1;

        -- Avalia presença de dados fiscais ou de folha para a competência
        IF (v_fiscal.id IS NOT NULL OR v_payroll.id IS NOT NULL) THEN
            v_gross_revenue := COALESCE(v_fiscal.revenue, 0);
            v_payroll_total := COALESCE(v_payroll.gross_salary, 0);
            v_fgts := v_payroll.fgts;
            v_inss := v_payroll.inss_employee;
            v_irrf := v_payroll.irrf;
            v_factor_r_base := v_payroll_total + COALESCE(v_fgts, 0);
            v_das_total := COALESCE(v_fiscal.simples_nacional_value, v_fiscal.total_tax);
            v_effective_rate := v_fiscal.effective_rate;

            -- Gera string canônica determinística para SHA-256
            v_canonical_text := format(
                '{"competency":"%s","contabilexClientId":"%s","dasTotal":%s,"effectiveRate":%s,"factorRPayrollBase":%s,"fgts":%s,"grossRevenue":%s,"inss":%s,"irrf":%s,"payrollTotal":%s,"proLabore":null}',
                v_month.comp_internal,
                v_client.id::text,
                COALESCE(v_das_total::text, 'null'),
                COALESCE(v_effective_rate::text, 'null'),
                v_factor_r_base::text,
                COALESCE(v_fgts::text, 'null'),
                v_gross_revenue::text,
                COALESCE(v_inss::text, 'null'),
                COALESCE(v_irrf::text, 'null'),
                v_payroll_total::text
            );

            v_content_hash := encode(extensions.digest(v_canonical_text::bytea, 'sha256'), 'hex');

            -- Busca snapshot vigente atual para a competência
            SELECT * INTO v_existing_snap
            FROM public.accounting_monthly_snapshots
            WHERE contabilex_client_id = v_client.id
              AND competency = v_month.comp_internal
              AND is_current = true
            LIMIT 1;

            IF v_existing_snap.id IS NULL THEN
                -- Snapshot novo: versão 1
                INSERT INTO public.accounting_monthly_snapshots (
                    contabilex_client_id,
                    dental_tenant_id,
                    competency,
                    gross_revenue,
                    payroll_total,
                    pro_labore,
                    fgts,
                    inss,
                    irrf,
                    factor_r_payroll_base,
                    das_total,
                    effective_rate,
                    version,
                    is_current,
                    status,
                    content_hash,
                    published_at,
                    created_at,
                    updated_at
                ) VALUES (
                    v_client.id,
                    p_dental_tenant_id,
                    v_month.comp_internal,
                    v_gross_revenue,
                    v_payroll_total,
                    NULL,
                    v_fgts,
                    v_inss,
                    v_irrf,
                    v_factor_r_base,
                    v_das_total,
                    v_effective_rate,
                    1,
                    true,
                    'PUBLISHED',
                    v_content_hash,
                    v_now,
                    v_now,
                    v_now
                );
                v_new_count := v_new_count + 1;

            ELSIF v_existing_snap.content_hash <> v_content_hash THEN
                -- Dados contábeis mudaram (retificação): arquiva versão antiga e cria nova
                UPDATE public.accounting_monthly_snapshots
                SET is_current = false,
                    updated_at = v_now
                WHERE id = v_existing_snap.id;

                INSERT INTO public.accounting_monthly_snapshots (
                    contabilex_client_id,
                    dental_tenant_id,
                    competency,
                    gross_revenue,
                    payroll_total,
                    pro_labore,
                    fgts,
                    inss,
                    irrf,
                    factor_r_payroll_base,
                    das_total,
                    effective_rate,
                    version,
                    is_current,
                    status,
                    content_hash,
                    published_at,
                    created_at,
                    updated_at
                ) VALUES (
                    v_client.id,
                    p_dental_tenant_id,
                    v_month.comp_internal,
                    v_gross_revenue,
                    v_payroll_total,
                    NULL,
                    v_fgts,
                    v_inss,
                    v_irrf,
                    v_factor_r_base,
                    v_das_total,
                    v_effective_rate,
                    v_existing_snap.version + 1,
                    true,
                    'PUBLISHED',
                    v_content_hash,
                    v_now,
                    v_now,
                    v_now
                );
                v_updated_count := v_updated_count + 1;

            ELSE
                -- Dados idênticos: idempotente
                IF v_existing_snap.dental_tenant_id IS DISTINCT FROM p_dental_tenant_id THEN
                    UPDATE public.accounting_monthly_snapshots
                    SET dental_tenant_id = p_dental_tenant_id,
                        updated_at = v_now
                    WHERE id = v_existing_snap.id;
                END IF;
                v_unchanged_count := v_unchanged_count + 1;
            END IF;
        END IF;
    END LOOP;

    -- Garante que apenas os últimos 12 meses da janela móvel dinâmica fiquem vigentes (is_current = true) para o tenant
    UPDATE public.accounting_monthly_snapshots
    SET is_current = false,
        updated_at = v_now
    WHERE dental_tenant_id = p_dental_tenant_id
      AND competency < TO_CHAR(date_trunc('month', v_now) - INTERVAL '12 months', 'YYYY-MM')
      AND is_current = true;

    -- Atualiza last_sync_at no vínculo
    UPDATE public.integration_client_links
    SET last_sync_at = v_now,
        updated_at = v_now
    WHERE id = v_link.id;

    -- Auditoria
    INSERT INTO public.accounting_integration_audit_logs (
        contabilex_client_id,
        dental_tenant_id,
        event_type,
        actor_name,
        details,
        created_at
    ) VALUES (
        v_client.id,
        p_dental_tenant_id,
        'TENANT_SYNC_EXECUTED',
        'Sincronização Dental Finance',
        jsonb_build_object(
            'new_count', v_new_count,
            'updated_count', v_updated_count,
            'unchanged_count', v_unchanged_count,
            'changed', (v_new_count > 0 OR v_updated_count > 0)
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'changed', (v_new_count > 0 OR v_updated_count > 0),
        'new_count', v_new_count,
        'updated_count', v_updated_count,
        'unchanged_count', v_unchanged_count,
        'total_competencies', (v_new_count + v_updated_count + v_unchanged_count)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_dental_tenant_accounting_snapshots(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_dental_tenant_accounting_snapshots(TEXT) TO authenticated;
