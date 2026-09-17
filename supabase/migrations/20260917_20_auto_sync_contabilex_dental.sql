-- Migration 20260917_20: Sincronização Automática Contaju ↔ Dental Finance
-- Trigger server-side para publicação imediata de snapshots elegíveis ao salvar/fechar folha ou fiscal

-- 1. Habilitar Realtime na tabela de snapshots contábeis
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND tablename = 'accounting_monthly_snapshots'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.accounting_monthly_snapshots;
    END IF;
END;
$$;

-- 2. Função de Publicação Automática de Snapshots
CREATE OR REPLACE FUNCTION public.fn_auto_publish_contabilex_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_client_id uuid;
    v_month text;
    v_month_num int;
    v_year_num int;
    v_comp_internal text;
    v_link record;
    v_fiscal_row record;
    v_payroll_row record;
    v_is_fiscal_done boolean := false;
    v_is_payroll_done boolean := false;
    v_is_current_month boolean := false;
    v_now_month_num int;
    v_now_year_num int;
    v_gross_revenue numeric;
    v_payroll_total numeric;
    v_fgts numeric;
    v_inss numeric;
    v_irrf numeric;
    v_factor_r_base numeric;
    v_das_total numeric;
    v_effective_rate numeric;
    v_canonical_json text;
    v_content_hash text;
    v_existing_snap record;
    v_next_version int := 1;
    v_components_breakdown jsonb;
    v_source_data_ids jsonb;
BEGIN
    -- Obter client_id e month do registro modificado
    v_client_id := NEW.client_id;
    v_month := NEW.month;

    IF v_client_id IS NULL OR v_month IS NULL OR v_month !~ '^\d{2}/\d{4}$' THEN
        RETURN NEW;
    END IF;

    -- Converte MM/YYYY para YYYY-MM
    v_month_num := split_part(v_month, '/', 1)::int;
    v_year_num := split_part(v_month, '/', 2)::int;
    v_comp_internal := to_char(v_year_num, 'FM0000') || '-' || to_char(v_month_num, 'FM00');

    -- 1. Verifica se existe vínculo ativo com o Dental Finance
    SELECT id, dental_tenant_id, status
    INTO v_link
    FROM public.integration_client_links
    WHERE contabilex_client_id = v_client_id
      AND status = 'ACTIVE'
    LIMIT 1;

    IF v_link.id IS NULL OR v_link.dental_tenant_id IS NULL THEN
        RETURN NEW; -- Sem vínculo ativo com o Dental Finance, nada a publicar
    END IF;

    -- 2. Busca dados de fiscal_history e payroll_history para esta competência
    SELECT * INTO v_fiscal_row
    FROM public.fiscal_history
    WHERE client_id = v_client_id AND month = v_month
    LIMIT 1;

    SELECT * INTO v_payroll_row
    FROM public.payroll_history
    WHERE client_id = v_client_id AND month = v_month
    LIMIT 1;

    -- 3. Avalia se a competência está fechada/pronta
    -- Fiscal: tax_status IN ('Feito', 'Passa zerado', 'Não tem')
    IF v_fiscal_row.id IS NOT NULL THEN
        v_is_fiscal_done := v_fiscal_row.tax_status IN ('Feito', 'Passa zerado', 'Não tem');
    END IF;

    -- Folha: status = 'Entregue' ou obrigações com status Feito/Passa zerado/Não tem
    IF v_payroll_row.id IS NOT NULL THEN
        v_is_payroll_done := (
            v_payroll_row.status = 'Entregue'
            OR v_payroll_row.status_fgts IN ('Feito', 'Passa zerado', 'Não tem')
            OR v_payroll_row.status_inss IN ('Feito', 'Passa zerado', 'Não tem')
        );
    END IF;

    -- Regra Central de Proteção: Mês operacional corrente em aberto NUNCA pode ser publicado como rascunho
    v_now_month_num := EXTRACT(MONTH FROM CURRENT_DATE)::int;
    v_now_year_num := EXTRACT(YEAR FROM CURRENT_DATE)::int;
    v_is_current_month := (v_month_num = v_now_month_num AND v_year_num = v_now_year_num);

    IF v_is_current_month AND (NOT v_is_fiscal_done OR NOT v_is_payroll_done) THEN
        -- Mês corrente ainda não concluído formalmente: NÃO publicar snapshot
        RETURN NEW;
    END IF;

    -- Se não estiver fechado no fiscal (ou se nem fiscal nem folha estiverem prontos): NÃO publicar rascunho
    IF NOT v_is_fiscal_done AND NOT v_is_payroll_done THEN
        RETURN NEW;
    END IF;

    -- 4. Monta os valores contábeis canônicos oficiais
    v_gross_revenue := COALESCE(v_fiscal_row.revenue, 0);
    v_payroll_total := COALESCE(v_payroll_row.gross_salary, 0);
    v_fgts := v_payroll_row.fgts;
    v_inss := v_payroll_row.inss_employee;
    v_irrf := v_payroll_row.irrf;
    v_factor_r_base := v_payroll_total + COALESCE(v_fgts, 0);

    v_das_total := COALESCE(v_fiscal_row.simples_nacional_value, v_fiscal_row.total_tax);
    v_effective_rate := v_fiscal_row.effective_rate;

    -- 5. Monta o JSON canônico determinístico e calcula o SHA-256 (content_hash)
    v_canonical_json := json_build_object(
        'contabilexClientId', v_client_id::text,
        'competency', v_comp_internal,
        'grossRevenue', to_char(v_gross_revenue, 'FM999999990.00'),
        'payrollTotal', to_char(v_payroll_total, 'FM999999990.00'),
        'proLabore', null,
        'fgts', CASE WHEN v_fgts IS NOT NULL THEN to_char(v_fgts, 'FM999999990.00') ELSE null END,
        'inss', CASE WHEN v_inss IS NOT NULL THEN to_char(v_inss, 'FM999999990.00') ELSE null END,
        'irrf', CASE WHEN v_irrf IS NOT NULL THEN to_char(v_irrf, 'FM999999990.00') ELSE null END,
        'factorRPayrollBase', to_char(v_factor_r_base, 'FM999999990.00'),
        'dasTotal', CASE WHEN v_das_total IS NOT NULL THEN to_char(v_das_total, 'FM999999990.00') ELSE null END,
        'effectiveRate', CASE WHEN v_effective_rate IS NOT NULL THEN to_char(v_effective_rate, 'FM0.0000') ELSE null END
    )::text;

    v_content_hash := encode(sha256(v_canonical_json::bytea), 'hex');

    -- 6. Itera sobre os vínculos ativos deste cliente Contábilex
    FOR v_link IN
        SELECT id, dental_tenant_id, status
        FROM public.integration_client_links
        WHERE contabilex_client_id = v_client_id
          AND status = 'ACTIVE'
    LOOP
        -- Busca snapshot ativo existente para esta competência e cliente
        SELECT id, version, content_hash, dental_tenant_id, status
        INTO v_existing_snap
        FROM public.accounting_monthly_snapshots
        WHERE contabilex_client_id = v_client_id
          AND competency = v_comp_internal
          AND is_current = true
        LIMIT 1;

        -- IDEMPOTÊNCIA: Se os dados contábeis forem idênticos ao snapshot existente, não gera nova versão
        IF v_existing_snap.id IS NOT NULL AND v_existing_snap.content_hash = v_content_hash THEN
            IF v_existing_snap.status != 'PUBLISHED' OR v_existing_snap.dental_tenant_id IS DISTINCT FROM v_link.dental_tenant_id THEN
                UPDATE public.accounting_monthly_snapshots
                SET dental_tenant_id = v_link.dental_tenant_id,
                    status = 'PUBLISHED',
                    published_at = COALESCE(published_at, NOW()),
                    updated_at = NOW()
                WHERE id = v_existing_snap.id;
            END IF;
            CONTINUE;
        END IF;

        -- VERSIONAMENTO INCREMENTAL: Se mudou ou é novo, incrementa versão
        IF v_existing_snap.id IS NOT NULL THEN
            v_next_version := v_existing_snap.version + 1;
            -- Marca a versão anterior como não corrente (arquivo imutável)
            UPDATE public.accounting_monthly_snapshots
            SET is_current = false,
                updated_at = NOW()
            WHERE contabilex_client_id = v_client_id
              AND competency = v_comp_internal;
        ELSE
            SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
            FROM public.accounting_monthly_snapshots
            WHERE contabilex_client_id = v_client_id
              AND competency = v_comp_internal;
            IF v_next_version IS NULL OR v_next_version < 1 THEN
                v_next_version := 1;
            END IF;
        END IF;

        v_components_breakdown := jsonb_build_object(
            'fiscal', jsonb_build_object(
                'id', v_fiscal_row.id,
                'revenue', v_gross_revenue,
                'regime', v_fiscal_row.regime,
                'tax_status', v_fiscal_row.tax_status
            ),
            'payroll', jsonb_build_object(
                'id', v_payroll_row.id,
                'gross_salary', v_payroll_total,
                'fgts', v_fgts,
                'inss_employee', v_inss,
                'irrf', v_irrf,
                'status', v_payroll_row.status
            )
        );

        v_source_data_ids := jsonb_build_object(
            'fiscal_history_id', v_fiscal_row.id,
            'payroll_history_id', v_payroll_row.id
        );

        -- Insere o novo snapshot publicado
        INSERT INTO public.accounting_monthly_snapshots (
            id,
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
            components_breakdown,
            source_data_ids,
            published_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_client_id,
            v_link.dental_tenant_id,
            v_comp_internal,
            v_gross_revenue,
            v_payroll_total,
            null,
            v_fgts,
            v_inss,
            v_irrf,
            v_factor_r_base,
            v_das_total,
            v_effective_rate,
            v_next_version,
            true,
            'PUBLISHED',
            v_content_hash,
            v_components_breakdown,
            v_source_data_ids,
            NOW(),
            NOW(),
            NOW()
        );

        -- Registra na tabela de auditoria
        INSERT INTO public.accounting_integration_audit_logs (
            id,
            contabilex_client_id,
            dental_tenant_id,
            event_type,
            actor_name,
            details,
            created_at
        ) VALUES (
            gen_random_uuid(),
            v_client_id,
            v_link.dental_tenant_id,
            'SNAPSHOT_PUBLISHED',
            'Contaju Auto-Sync Trigger',
            jsonb_build_object(
                'competency', v_comp_internal,
                'version', v_next_version,
                'trigger_source', TG_TABLE_NAME,
                'content_hash', v_content_hash
            ),
            NOW()
        );
    END LOOP;

    RETURN NEW;
END;
$$;

-- 3. Criar os Triggers em fiscal_history e payroll_history
DROP TRIGGER IF EXISTS trg_auto_publish_fiscal_snapshot ON public.fiscal_history;
CREATE TRIGGER trg_auto_publish_fiscal_snapshot
AFTER INSERT OR UPDATE ON public.fiscal_history
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_publish_contabilex_snapshot();

DROP TRIGGER IF EXISTS trg_auto_publish_payroll_snapshot ON public.payroll_history;
CREATE TRIGGER trg_auto_publish_payroll_snapshot
AFTER INSERT OR UPDATE ON public.payroll_history
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_publish_contabilex_snapshot();
