-- Migration 20260917_24: RPC get_consulting_portfolio_summary para Central de Supervisão de Clientes
-- Data: 2026-09-17

-- 1. Sincronizar nomes das clínicas em df_tenants a partir de df_professionals
UPDATE public.df_tenants t
SET name = COALESCE(NULLIF(p.nome_fantasia, ''), NULLIF(p.razao_social, ''), t.name),
    trade_name = COALESCE(NULLIF(p.nome_fantasia, ''), NULLIF(t.trade_name, ''), t.name)
FROM public.df_professionals p
WHERE p.tenant_id = t.id
  AND (t.name = 'Clínica sem nome' OR t.name IS NULL OR t.trade_name = 'Clínica sem nome' OR t.trade_name IS NULL);

-- 2. Criar ou atualizar a função get_consulting_portfolio_summary
CREATE OR REPLACE FUNCTION public.get_consulting_portfolio_summary(p_competency text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_primary boolean;
    v_role text;
    v_target_comp text;
    v_comp_start date;
    v_comp_end date;
    v_today date := CURRENT_DATE;
    v_result jsonb;
    v_tenants jsonb := '[]'::jsonb;
    v_alerts jsonb := '[]'::jsonb;
    
    -- Agregados
    v_total_clinics int := 0;
    v_total_revenue numeric := 0;
    v_total_expenses numeric := 0;
    v_total_open_rec numeric := 0;
    v_total_open_pay numeric := 0;
    v_total_overdue numeric := 0;
    v_healthy_count int := 0;
    v_warning_count int := 0;
    v_critical_count int := 0;
    v_annex_iii_count int := 0;
    v_annex_v_count int := 0;
    v_estimated_total_das numeric := 0;
    v_pending_closing_count int := 0;

    r_tenant record;
    r_rev numeric;
    r_exp numeric;
    r_pay numeric;
    r_rf numeric;
    r_annex text;
    r_overdue_rec numeric;
    r_overdue_pay numeric;
    r_open_rec numeric;
    r_open_pay numeric;
    r_das numeric;
    r_health text;
    r_reasons jsonb;
    r_sync_status text;
BEGIN
    -- Validar autorização: apenas usuário consultoria / super admin / platform admin
    SELECT is_primary, role INTO v_is_primary, v_role
    FROM public.df_users
    WHERE auth_user_id = auth.uid() OR id = auth.uid()::text
    LIMIT 1;

    IF v_is_primary IS NOT TRUE AND v_role NOT IN ('PLATFORM_ADMIN', 'SUPER_ADMIN') THEN
        RAISE EXCEPTION 'Acesso negado: apenas o escritório de consultoria pode acessar a Central de Supervisão.';
    END IF;

    -- Definir competência padrão (se não fornecida, usa mês anterior)
    IF p_competency IS NULL OR p_competency = '' THEN
        v_target_comp := to_char(v_today - interval '1 month', 'YYYY-MM');
    ELSE
        v_target_comp := p_competency;
    END IF;

    v_comp_start := to_date(v_target_comp || '-01', 'YYYY-MM-DD');
    v_comp_end := (v_comp_start + interval '1 month' - interval '1 day')::date;

    -- Iterar sobre os tenants reais ativos
    FOR r_tenant IN
        SELECT 
            t.id AS tenant_id,
            COALESCE(NULLIF(p.nome_fantasia, ''), NULLIF(p.razao_social, ''), NULLIF(t.trade_name, ''), NULLIF(t.name, ''), 'Clínica') AS clinic_name,
            COALESCE(NULLIF(p.nome_fantasia, ''), NULLIF(t.trade_name, ''), 'Clínica') AS trade_name,
            COALESCE(p.cnpj, p.cpf, '') AS cnpj,
            COALESCE(NULLIF(p.name, ''), u.name, 'Cirurgião-Dentista') AS owner_name,
            COALESCE(u.email, t.email, '') AS owner_email,
            COALESCE(p.phone, '') AS owner_phone,
            COALESCE(p.rbt12_inicial, 0) AS rbt12_inicial,
            COALESCE(p.folha_12m_inicial, 0) AS folha_12m_inicial,
            COALESCE(p.pro_labore_mensal, 0) AS pro_labore_mensal,
            p.contabilex_client_id
        FROM public.df_tenants t
        LEFT JOIN public.df_professionals p ON p.tenant_id = t.id
        LEFT JOIN public.df_users u ON u.clinic_id = t.id AND u.is_active = true
        WHERE t.id != 'tenant_demo'
          AND (t.is_test IS FALSE OR t.is_test IS NULL)
          AND (t.is_active IS TRUE)
        GROUP BY t.id, t.name, t.trade_name, p.nome_fantasia, p.razao_social, p.cnpj, p.cpf, p.name, u.name, u.email, t.email, p.phone, p.rbt12_inicial, p.folha_12m_inicial, p.pro_labore_mensal, p.contabilex_client_id
        ORDER BY clinic_name ASC
    LOOP
        v_total_clinics := v_total_clinics + 1;

        -- 1. Faturamento do mês na competência
        SELECT COALESCE(SUM(total_value), 0)
        INTO r_rev
        FROM public.df_sales
        WHERE tenant_id = r_tenant.tenant_id
          AND service_date >= to_char(v_comp_start, 'YYYY-MM-DD')
          AND service_date <= to_char(v_comp_end, 'YYYY-MM-DD');

        -- 2. Despesas do mês na competência
        SELECT COALESCE(SUM(value), 0)
        INTO r_exp
        FROM public.df_expenses
        WHERE tenant_id = r_tenant.tenant_id
          AND (
            (competence_date >= to_char(v_comp_start, 'YYYY-MM-DD') AND competence_date <= to_char(v_comp_end, 'YYYY-MM-DD'))
            OR (competence_date IS NULL AND due_date >= to_char(v_comp_start, 'YYYY-MM-DD') AND due_date <= to_char(v_comp_end, 'YYYY-MM-DD'))
          );

        -- 3. Folha da competência (df_payroll_history ou despesas de folha ou pró-labore cadastrado)
        SELECT COALESCE(SUM(total_payroll), 0)
        INTO r_pay
        FROM public.df_payroll_history
        WHERE tenant_id = r_tenant.tenant_id
          AND month = v_target_comp;

        IF r_pay = 0 THEN
            SELECT COALESCE(SUM(value), 0)
            INTO r_pay
            FROM public.df_expenses
            WHERE tenant_id = r_tenant.tenant_id
              AND (category_name ILIKE '%pró-labore%' OR category_name ILIKE '%pro-labore%' OR category_name ILIKE '%salário%' OR category_name ILIKE '%folha%')
              AND due_date >= to_char(v_comp_start, 'YYYY-MM-DD') AND due_date <= to_char(v_comp_end, 'YYYY-MM-DD');
        END IF;

        IF r_pay = 0 AND r_tenant.pro_labore_mensal > 0 THEN
            r_pay := r_tenant.pro_labore_mensal;
        END IF;

        -- 4. Contas a Pagar em aberto e vencidas
        SELECT 
            COALESCE(SUM(CASE WHEN status != 'PAGO' THEN value ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status != 'PAGO' AND due_date < to_char(v_today, 'YYYY-MM-DD') THEN value ELSE 0 END), 0)
        INTO r_open_pay, r_overdue_pay
        FROM public.df_expenses
        WHERE tenant_id = r_tenant.tenant_id;

        -- 5. Contas a Receber a partir de df_sales (parcelas)
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

        -- 6. Fator R
        IF (r_rev + r_tenant.rbt12_inicial) > 0 THEN
            r_rf := ROUND(((r_pay * 12 + r_tenant.folha_12m_inicial) / (r_rev * 12 + r_tenant.rbt12_inicial) * 100)::numeric, 1);
        ELSIF r_rev > 0 THEN
            r_rf := ROUND((r_pay / r_rev * 100)::numeric, 1);
        ELSE
            r_rf := 0;
        END IF;

        IF r_rf >= 28.0 THEN
            r_annex := 'III';
            r_das := ROUND((r_rev * 0.06)::numeric, 2);
            v_annex_iii_count := v_annex_iii_count + 1;
        ELSE
            r_annex := 'V';
            r_das := ROUND((r_rev * 0.155)::numeric, 2);
            v_annex_v_count := v_annex_v_count + 1;
        END IF;

        -- 7. Classificação de Saúde & Motivos
        r_reasons := '[]'::jsonb;
        IF r_rf < 20.0 AND r_rev > 0 THEN
            r_health := 'CRITICAL';
            r_reasons := r_reasons || jsonb_build_array('Fator R crítico em ' || r_rf || '% (Anexo V - tributação majorada de 15,5%)');
        ELSIF r_overdue_pay > 5000 THEN
            r_health := 'CRITICAL';
            r_reasons := r_reasons || jsonb_build_array('Despesas a pagar em atraso excedem R$ 5.000 (R$ ' || to_char(r_overdue_pay, 'FM999G999D00') || ')');
        ELSIF r_rf < 28.0 AND r_rev > 0 THEN
            r_health := 'WARNING';
            r_reasons := r_reasons || jsonb_build_array('Fator R em ' || r_rf || '% (Abaixo de 28% - requer ajuste de pró-labore)');
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

        -- 8. Status de integração Contábilex / Contaju
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
                    WHEN r_rf < 20.0 THEN 'Fator R em ' || r_rf || '% no Anexo V. Alíquota 15,5% vs 6,0% gera imposto extra.'
                    ELSE 'Contas em atraso graves totalizando R$ ' || to_char(r_overdue_pay, 'FM999G999D00')
                END,
                'action_label', 'Abrir visão supervisionada'
            ));
        ELSIF r_health = 'WARNING' AND r_rf < 28.0 AND r_rev > 0 THEN
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
            'payroll_amount', r_pay,
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
            'pending_closing_count', v_pending_closing_count
        ),
        'clients', v_tenants,
        'priority_alerts', v_alerts
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_consulting_portfolio_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_consulting_portfolio_summary(text) TO authenticated;
