-- Migration: Limpeza das clínicas de teste/demo e melhoria do RPC get_all_dental_tenants
-- Data: 2026-09-16

-- 1. Excluir todas as clínicas e dados de teste, mantendo apenas contas com e-mails reais cadastrados
DELETE FROM public.df_sales WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_expenses WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_patients WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_appointments WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_bank_accounts WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_procedures WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_clinical_inputs WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_payroll_history WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_system_preferences WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_accounting_confirmations WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_professionals WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_audit_logs WHERE tenant_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_users WHERE clinic_id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');
DELETE FROM public.df_tenants WHERE id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1');

-- 2. Atualizar clínicas reais com nomes e identificação amigáveis
UPDATE public.df_tenants
SET name = 'Clínica Dra. Bruna',
    trade_name = 'Dra. Bruna Odontologia',
    email = 'leonardoricardoarantes@gmail.com'
WHERE id = 'clinic_1789405023533_phq5';

UPDATE public.df_tenants
SET name = 'Clínica Dr. Daniel Arantes',
    trade_name = 'Dr. Daniel Odontologia',
    email = 'danielricardoarantes@gmail.com'
WHERE id = 'clinic_1789153962617_gpw1';

-- 3. Atualizar RPC get_all_dental_tenants com campos descritivos para seleção limpa de clínicas
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
        RAISE EXCEPTION 'Acesso negado: apenas a conta primária de consultoria pode listar todos os clientes.';
    END IF;

    RETURN QUERY
    SELECT 
        t.id AS tenant_id,
        COALESCE(NULLIF(t.name, ''), 'Clínica Odontológica') AS clinic_name,
        COALESCE(NULLIF(t.trade_name, ''), t.name) AS trade_name,
        COALESCE(NULLIF(p.name, ''), u.name, 'Cirurgião-Dentista') AS owner_name,
        COALESCE(u.email, t.email, '') AS owner_email,
        COUNT(DISTINCT u.id) AS total_users,
        t.created_at
    FROM public.df_tenants t
    LEFT JOIN public.df_users u ON u.clinic_id = t.id AND u.is_active = true
    LEFT JOIN public.df_professionals p ON p.tenant_id = t.id
    WHERE t.id != 'tenant_demo'
    GROUP BY t.id, t.name, t.trade_name, p.name, u.name, u.email, t.email, t.created_at
    ORDER BY t.created_at DESC;
END;
$$;
