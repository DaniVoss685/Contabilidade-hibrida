-- ==============================================================================
-- MIGRATION: 20260918_27_fix_consulting_clinics_1to1_dedup.sql
-- DESCRIÇÃO: Elimina duplicidade de clínicas no Modo Consultoria e no seletor de suporte
--            substituindo o JOIN 1:N com df_users por subquery agregada 1:1 por clinic_id.
--            Garante que cada tenant apareça uma única vez e que KPIs reflitam tenants únicos.
-- ==============================================================================

-- 1. Atualizar RPC get_all_dental_tenants com agregação 1:1 de usuários
DROP FUNCTION IF EXISTS public.get_all_dental_tenants();

CREATE OR REPLACE FUNCTION public.get_all_dental_tenants()
RETURNS TABLE (
    tenant_id text,
    clinic_name text,
    trade_name text,
    owner_name text,
    owner_email text,
    total_users bigint,
    created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_primary boolean;
    v_role text;
BEGIN
    SELECT is_primary, role INTO v_is_primary, v_role
    FROM public.df_users
    WHERE auth_user_id = auth.uid() OR id = auth.uid()::text
    LIMIT 1;

    IF v_is_primary IS NOT TRUE AND v_role NOT IN ('PLATFORM_ADMIN', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Acesso negado: apenas a conta primaria de consultoria pode listar todos os clientes.';
    END IF;

    RETURN QUERY
    SELECT 
        t.id AS tenant_id,
        COALESCE(
            NULLIF(p.nome_fantasia, ''),
            NULLIF(p.razao_social, ''),
            NULLIF(t.trade_name, ''),
            NULLIF(t.name, ''),
            'Clinica sem nome'
        ) AS clinic_name,
        COALESCE(
            NULLIF(p.nome_fantasia, ''),
            NULLIF(t.trade_name, ''),
            NULLIF(t.name, ''),
            'Clinica sem nome'
        ) AS trade_name,
        COALESCE(NULLIF(p.name, ''), u.owner_name, 'Cirurgiao-Dentista') AS owner_name,
        COALESCE(u.owner_email, t.email, '') AS owner_email,
        COALESCE(u.total_users, 0) AS total_users,
        t.created_at AS created_at
    FROM public.df_tenants t
    LEFT JOIN public.df_professionals p ON p.tenant_id = t.id
    LEFT JOIN (
        SELECT 
            u_sub.clinic_id,
            COUNT(*) AS total_users,
            (ARRAY_AGG(u_sub.name ORDER BY CASE WHEN u_sub.is_primary = true THEN 1 WHEN u_sub.role = 'OWNER' THEN 2 ELSE 3 END, u_sub.created_at ASC))[1] AS owner_name,
            (ARRAY_AGG(u_sub.email ORDER BY CASE WHEN u_sub.is_primary = true THEN 1 WHEN u_sub.role = 'OWNER' THEN 2 ELSE 3 END, u_sub.created_at ASC))[1] AS owner_email
        FROM public.df_users u_sub
        WHERE u_sub.is_active = true
        GROUP BY u_sub.clinic_id
    ) u ON u.clinic_id = t.id
    WHERE t.id != 'tenant_demo'
      AND (t.is_test IS FALSE OR t.is_test IS NULL)
      AND (t.is_active IS TRUE)
    ORDER BY clinic_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_dental_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_dental_tenants() TO authenticated;


-- 2. Atualizar RPC get_consulting_portfolio_summary com agregação 1:1 de usuários
CREATE OR REPLACE FUNCTION public.get_consulting_portfolio_summary(p_competency text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today date := CURRENT_DATE;
    v_target_comp text;
    v_comp_start date;
    v_comp_end date;

    -- Acumuladores globais do portfólio
    v_total_clinics integer := 0;
    v_total_revenue numeric(14, 2) := 0;
    v_total_expenses numeric(14, 2) := 0;
    v_total_open_rec numeric(14, 2) := 0;
    v_total_open_pay numeric(14, 2) := 0;
    v_total_overdue numeric(14, 2) := 0;
    v_estimated_total_das numeric(14, 2) := 0;

    v_healthy_count integer := 0;
    v_warning_count integer := 0;
    v_critical_count integer := 0;
    v_annex_iii_count integer := 0;
    v_annex_v_count integer := 0;

    -- Estruturas JSON
    v_tenants jsonb := '[]'::jsonb;
    v_alerts jsonb := '[]'::jsonb;
    v_result jsonb;

    -- Variáveis de iteração
    r_tenant RECORD;
    r_rev numeric(14, 2);
    r_rev_snap numeric(14, 2);
    r_das_snap numeric(14, 2);
    r_eff_snap numeric(8, 4);
    r_exp numeric(14, 2);
    r_rbt12 numeric(14, 2);
    r_fs12 numeric(14, 2);
    v_snap_count integer;
    r_open_pay numeric(14, 2);
    r_overdue_pay numeric(14, 2);
    r_open_rec numeric(14, 2);
    r_overdue_rec numeric(14, 2);
    r_rf numeric(6, 2);
    r_effective_rate numeric(6, 2);
    r_das numeric(14, 2);
    r_annex text;
    r_health text;
    r_reasons jsonb;
    r_sync_status text;
BEGIN
    -- 1. Determinar competência alvo (Padrão: mês anterior ao mês civil atual)
    IF p_competency IS NOT NULL AND p_competency ~ '^\d{4}-\d{2}$' THEN
        v_target_comp := p_competency;
    ELSE
        v_target_comp := to_char(v_today - INTERVAL '1 month', 'YYYY-MM');
    END IF;

    v_comp_start := (v_target_comp || '-01')::date;
    v_comp_end := (date_trunc('month', v_comp_start) + INTERVAL '1 month' - INTERVAL '1 day')::date;

    -- 2. Iterar sobre os tenants reais ativos garantindo estritamente 1 linha por tenant_id
    FOR r_tenant IN
        SELECT 
            t.id AS tenant_id,
            COALESCE(
                NULLIF(p.nome_fantasia, 'Clínica sem nome'),
                NULLIF(p.razao_social, 'Clínica sem nome'),
                NULLIF(t.trade_name, 'Clínica sem nome'),
                NULLIF(t.name, 'Clínica sem nome'),
                NULLIF(p.nome_fantasia, ''),
                NULLIF(p.razao_social, ''),
                NULLIF(t.trade_name, ''),
                NULLIF(t.name, ''),
                'Clínica'
            ) AS clinic_name,
            COALESCE(
                NULLIF(p.nome_fantasia, 'Clínica sem nome'),
                NULLIF(t.trade_name, 'Clínica sem nome'),
                NULLIF(p.nome_fantasia, ''),
                NULLIF(t.trade_name, ''),
                'Clínica'
            ) AS trade_name,
            COALESCE(p.cnpj, p.cpf, '') AS cnpj,
            COALESCE(NULLIF(p.name, ''), u.owner_name, 'Cirurgião-Dentista') AS owner_name,
            COALESCE(u.owner_email, t.email, '') AS owner_email,
            COALESCE(p.phone, '') AS owner_phone,
            COALESCE(p.rbt12_inicial, 0) AS rbt12_inicial,
            COALESCE(p.folha_12m_inicial, 0) AS folha_12m_inicial,
            COALESCE(p.pro_labore_mensal, 0) AS pro_labore_mensal,
            p.contabilex_client_id
        FROM public.df_tenants t
        LEFT JOIN public.df_professionals p ON p.tenant_id = t.id
        LEFT JOIN (
            SELECT 
                clinic_id,
                COUNT(*) AS total_users,
                (ARRAY_AGG(name ORDER BY CASE WHEN is_primary = true THEN 1 WHEN role = 'OWNER' THEN 2 ELSE 3 END, created_at ASC))[1] AS owner_name,
                (ARRAY_AGG(email ORDER BY CASE WHEN is_primary = true THEN 1 WHEN role = 'OWNER' THEN 2 ELSE 3 END, created_at ASC))[1] AS owner_email
            FROM public.df_users
            WHERE is_active = true
            GROUP BY clinic_id
        ) u ON u.clinic_id = t.id
        WHERE t.id != 'tenant_demo'
          AND (t.is_test IS FALSE OR t.is_test IS NULL)
          AND (t.is_active IS TRUE)
        ORDER BY clinic_name ASC
    LOOP
        v_total_clinics := v_total_clinics + 1;

        -- 3. Faturamento do mês da competência (Prioriza snapshot contábil oficial; fallback para df_sales)
        r_rev_snap := NULL;
        r_das_snap := NULL;
        r_eff_snap := NULL;

        SELECT 
            COALESCE(gross_revenue, 0),
            COALESCE(das_total, 0),
            effective_rate
        INTO r_rev_snap, r_das_snap, r_eff_snap
        FROM public.accounting_monthly_snapshots
        WHERE dental_tenant_id = r_tenant.tenant_id
          AND competency = v_target_comp
        ORDER BY version DESC
        LIMIT 1;

        IF r_rev_snap IS NOT NULL AND r_rev_snap > 0 THEN
            r_rev := r_rev_snap;
        ELSE
            SELECT COALESCE(SUM(total_value), 0)
            INTO r_rev
            FROM public.df_sales
            WHERE tenant_id = r_tenant.tenant_id
              AND service_date >= to_char(v_comp_start, 'YYYY-MM-DD')
              AND service_date <= to_char(v_comp_end, 'YYYY-MM-DD');

            IF r_rev = 0 AND r_rev_snap IS NOT NULL THEN
                r_rev := r_rev_snap;
            END IF;
        END IF;

        -- 4. Despesas operacionais do mês da competência
        SELECT COALESCE(SUM(value), 0)
        INTO r_exp
        FROM public.df_expenses
        WHERE tenant_id = r_tenant.tenant_id
          AND (
            (competence_date >= to_char(v_comp_start, 'YYYY-MM-DD') AND competence_date <= to_char(v_comp_end, 'YYYY-MM-DD'))
            OR (competence_date IS NULL AND due_date >= to_char(v_comp_start, 'YYYY-MM-DD') AND due_date <= to_char(v_comp_end, 'YYYY-MM-DD'))
          );

        -- 5. RBT12 e FS12 (Janela dos 12 meses anteriores à competência alvo: competency < v_target_comp)
        r_rbt12 := 0;
        r_fs12 := 0;
        v_snap_count := 0;

        WITH latest_snaps AS (
            SELECT DISTINCT ON (competency)
                competency,
                COALESCE(gross_revenue, 0) AS snap_gross,
                COALESCE(factor_r_payroll_base, 0) AS snap_folha
            FROM public.accounting_monthly_snapshots
            WHERE dental_tenant_id = r_tenant.tenant_id
              AND competency < v_target_comp
            ORDER BY competency DESC, version DESC
            LIMIT 12
        )
        SELECT 
            COUNT(*),
            COALESCE(SUM(snap_gross), 0),
            COALESCE(SUM(snap_folha), 0)
        INTO v_snap_count, r_rbt12, r_fs12
        FROM latest_snaps;

        -- Fallback: Se não houver snapshots contábeis nos 12 meses anteriores, utiliza os parâmetros cadastrados
        IF r_rbt12 = 0 AND r_tenant.rbt12_inicial > 0 THEN
            r_rbt12 := r_tenant.rbt12_inicial;
        END IF;

        IF r_fs12 = 0 AND r_tenant.folha_12m_inicial > 0 THEN
            r_fs12 := r_tenant.folha_12m_inicial;
        END IF;

        -- Fallback 2: Vendas e folha registradas no sistema nos 12 meses anteriores
        IF r_rbt12 = 0 THEN
            SELECT COALESCE(SUM(total_value), 0)
            INTO r_rbt12
            FROM public.df_sales
            WHERE tenant_id = r_tenant.tenant_id
              AND service_date < to_char(v_comp_start, 'YYYY-MM-DD')
              AND service_date >= to_char(v_comp_start - INTERVAL '12 months', 'YYYY-MM-DD');
        END IF;

        IF r_fs12 = 0 THEN
            SELECT COALESCE(SUM(total_payroll), 0)
            INTO r_fs12
            FROM public.df_payroll_history
            WHERE tenant_id = r_tenant.tenant_id
              AND month < v_target_comp
              AND month >= to_char(v_comp_start - INTERVAL '12 months', 'YYYY-MM');
        END IF;

        -- 6. Contas a Pagar em aberto e vencidas
        SELECT 
            COALESCE(SUM(CASE WHEN status != 'PAGO' THEN value ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status != 'PAGO' AND due_date < to_char(v_today, 'YYYY-MM-DD') THEN value ELSE 0 END), 0)
        INTO r_open_pay, r_overdue_pay
        FROM public.df_expenses
        WHERE tenant_id = r_tenant.tenant_id;

        -- 7. Contas a Receber a partir de df_sales (parcelas)
        SELECT 
            COALESCE(SUM(
                CASE 
                    WHEN (inst->>'status') NOT IN ('RECEBIDO', 'PAGO', 'CANCELADO') 
                    THEN (inst->>'value')::numeric 
                    ELSE 0 
                END
            ), 0),
            COALESCE(SUM(
                CASE 
                    WHEN (inst->>'status') NOT IN ('RECEBIDO', 'PAGO', 'CANCELADO') 
                     AND (inst->>'dueDate') < to_char(v_today, 'YYYY-MM-DD')
                    THEN (inst->>'value')::numeric 
                    ELSE 0 
                END
            ), 0)
        INTO r_open_rec, r_overdue_rec
        FROM public.df_sales s,
             LATERAL jsonb_array_elements(COALESCE(s.installments, '[]'::jsonb)) inst
        WHERE s.tenant_id = r_tenant.tenant_id;

        -- 8. Fator R Oficial = FS12 / RBT12
        IF r_rbt12 > 0 THEN
            r_rf := ROUND((r_fs12 / r_rbt12 * 100)::numeric, 1);
        ELSE
            r_rf := 0;
        END IF;

        -- 9. Enquadramento e Alíquota Efetiva (LC 123/2006)
        IF r_rf >= 28.0 THEN
            r_annex := 'III';
            v_annex_iii_count := v_annex_iii_count + 1;

            -- Faixas do Anexo III
            IF r_rbt12 <= 180000.00 THEN
                r_effective_rate := 6.00;
            ELSIF r_rbt12 <= 360000.00 THEN
                r_effective_rate := ROUND(((r_rbt12 * 0.1120 - 9360.00) / r_rbt12 * 100)::numeric, 2);
            ELSIF r_rbt12 <= 720000.00 THEN
                r_effective_rate := ROUND(((r_rbt12 * 0.1350 - 17640.00) / r_rbt12 * 100)::numeric, 2);
            ELSIF r_rbt12 <= 1800000.00 THEN
                r_effective_rate := ROUND(((r_rbt12 * 0.1600 - 35640.00) / r_rbt12 * 100)::numeric, 2);
            ELSIF r_rbt12 <= 3600000.00 THEN
                r_effective_rate := ROUND(((r_rbt12 * 0.2100 - 125640.00) / r_rbt12 * 100)::numeric, 2);
            ELSE
                r_effective_rate := ROUND(((r_rbt12 * 0.3300 - 648000.00) / r_rbt12 * 100)::numeric, 2);
            END IF;
        ELSE
            r_annex := 'V';
            v_annex_v_count := v_annex_v_count + 1;

            -- Faixas do Anexo V
            IF r_rbt12 <= 180000.00 THEN
                r_effective_rate := 15.50;
            ELSIF r_rbt12 <= 360000.00 THEN
                r_effective_rate := ROUND(((r_rbt12 * 0.1800 - 4500.00) / r_rbt12 * 100)::numeric, 2);
            ELSIF r_rbt12 <= 720000.00 THEN
                r_effective_rate := ROUND(((r_rbt12 * 0.1950 - 9900.00) / r_rbt12 * 100)::numeric, 2);
            ELSIF r_rbt12 <= 1800000.00 THEN
                r_effective_rate := ROUND(((r_rbt12 * 0.2050 - 17100.00) / r_rbt12 * 100)::numeric, 2);
            ELSIF r_rbt12 <= 3600000.00 THEN
                r_effective_rate := ROUND(((r_rbt12 * 0.2300 - 62100.00) / r_rbt12 * 100)::numeric, 2);
            ELSE
                r_effective_rate := ROUND(((r_rbt12 * 0.3050 - 540000.00) / r_rbt12 * 100)::numeric, 2);
            END IF;
        END IF;

        r_effective_rate := GREATEST(r_effective_rate, 4.00);

        -- 10. DAS Estimado
        IF r_das_snap IS NOT NULL AND r_das_snap > 0 THEN
            r_das := r_das_snap;
        ELSE
            r_das := ROUND((r_rev * (r_effective_rate / 100.0))::numeric, 2);
        END IF;

        -- 11. Classificação de Saúde & Motivos
        r_reasons := '[]'::jsonb;
        IF r_rf < 20.0 AND r_rbt12 > 0 THEN
            r_health := 'CRITICAL';
            r_reasons := r_reasons || jsonb_build_array('Fator R crítico em ' || r_rf || '% (Anexo V - tributação majorada de ' || r_effective_rate || '%)');
        ELSIF r_overdue_pay > 5000 THEN
            r_health := 'CRITICAL';
            r_reasons := r_reasons || jsonb_build_array('Despesas a pagar em atraso excedem R$ 5.000 (R$ ' || to_char(r_overdue_pay, 'FM999G999D00') || ')');
        ELSIF r_rf < 28.0 AND r_rbt12 > 0 THEN
            r_health := 'WARNING';
            r_reasons := r_reasons || jsonb_build_array('Fator R em ' || r_rf || '% (Abaixo de 28% - requer ajuste de folha/pró-labore)');
        ELSIF r_overdue_pay > 0 OR r_overdue_rec > 0 THEN
            r_health := 'WARNING';
            IF r_overdue_pay > 0 THEN
                r_reasons := r_reasons || jsonb_build_array('Contas a pagar em atraso: R$ ' || to_char(r_overdue_pay, 'FM999G999D00'));
            END IF;
            IF r_overdue_rec > 0 THEN
                r_reasons := r_reasons || jsonb_build_array('Recebimentos em atraso: R$ ' || to_char(r_overdue_rec, 'FM999G999D00'));
            END IF;
        ELSE
            r_health := 'HEALTHY';
            r_reasons := r_reasons || jsonb_build_array('Fator R enquadrado no Anexo III (' || r_rf || '%) e sem atrasos');
        END IF;

        IF r_health = 'HEALTHY' THEN
            v_healthy_count := v_healthy_count + 1;
        ELSIF r_health = 'WARNING' THEN
            v_warning_count := v_warning_count + 1;
        ELSE
            v_critical_count := v_critical_count + 1;
        END IF;

        -- Status de integração Contaju
        IF r_tenant.contabilex_client_id IS NOT NULL AND r_tenant.contabilex_client_id != '' THEN
            r_sync_status := 'SYNCED';
        ELSE
            r_sync_status := 'PENDING';
        END IF;

        -- Alertas prioritários
        IF r_health = 'CRITICAL' THEN
            v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
                'tenant_id', r_tenant.tenant_id,
                'clinic_name', r_tenant.clinic_name,
                'severity', 'CRITICAL',
                'type', CASE WHEN r_rf < 20.0 THEN 'FATOR_R' ELSE 'OVERDUE' END,
                'message', CASE 
                    WHEN r_rf < 20.0 THEN 'Fator R em ' || r_rf || '% no Anexo V. Alíquota ' || r_effective_rate || '% vs 6,0% gera imposto extra.'
                    ELSE 'Contas em atraso graves totalizando R$ ' || to_char(r_overdue_pay, 'FM999G999D00')
                END,
                'action_label', 'Abrir visão supervisionada'
            ));
        ELSIF r_health = 'WARNING' AND r_rf < 28.0 AND r_rbt12 > 0 THEN
            v_alerts := v_alerts || jsonb_build_array(jsonb_build_object(
                'tenant_id', r_tenant.tenant_id,
                'clinic_name', r_tenant.clinic_name,
                'severity', 'WARNING',
                'type', 'FATOR_R',
                'message', 'Fator R em ' || r_rf || '%. Faltam ' || ROUND((28.0 - r_rf)::numeric, 1) || '% para atingir os 28% do Anexo III.',
                'action_label', 'Simular pró-labore'
            ));
        END IF;

        -- Acumular totais da carteira
        v_total_revenue := v_total_revenue + r_rev;
        v_total_expenses := v_total_expenses + r_exp;
        v_total_open_rec := v_total_open_rec + r_open_rec;
        v_total_open_pay := v_total_open_pay + r_open_pay;
        v_total_overdue := v_total_overdue + (r_overdue_rec + r_overdue_pay);
        v_estimated_total_das := v_estimated_total_das + r_das;

        -- Adicionar cliente à lista
        v_tenants := v_tenants || jsonb_build_array(jsonb_build_object(
            'tenant_id', r_tenant.tenant_id,
            'clinic_name', r_tenant.clinic_name,
            'trade_name', r_tenant.trade_name,
            'cnpj', r_tenant.cnpj,
            'owner_name', r_tenant.owner_name,
            'owner_email', r_tenant.owner_email,
            'owner_phone', r_tenant.owner_phone,
            'monthly_revenue', r_rev,
            'monthly_expenses', r_exp,
            'payroll_amount', r_fs12,
            'rbt12', r_rbt12,
            'fs12', r_fs12,
            'effective_rate', r_effective_rate,
            'estimated_das', r_das,
            'r_factor', r_rf,
            'annex', r_annex,
            'overdue_receivables', r_overdue_rec,
            'overdue_payables', r_overdue_pay,
            'open_receivables', r_open_rec,
            'open_payables', r_open_pay,
            'contaju_sync_status', r_sync_status,
            'health_status', r_health,
            'health_reasons', r_reasons
        ));
    END LOOP;

    -- Montar JSON consolidado final
    v_result := jsonb_build_object(
        'portfolio_summary', jsonb_build_object(
            'competency', v_target_comp,
            'total_active_clinics', v_total_clinics,
            'total_portfolio_revenue', v_total_revenue,
            'total_portfolio_expenses', v_total_expenses,
            'total_portfolio_open_receivables', v_total_open_rec,
            'total_portfolio_open_payables', v_total_open_pay,
            'total_portfolio_overdue', v_total_overdue,
            'healthy_count', v_healthy_count,
            'warning_count', v_warning_count,
            'critical_count', v_critical_count,
            'annex_iii_count', v_annex_iii_count,
            'annex_v_count', v_annex_v_count,
            'estimated_total_das', v_estimated_total_das,
            'pending_closing_count', 0
        ),
        'clients', v_tenants,
        'priority_alerts', v_alerts
    );

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_consulting_portfolio_summary(text) TO authenticated, service_role, anon;
