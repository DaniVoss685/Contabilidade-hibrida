-- Migration 22: Isolamento de Tenants de Teste, Coluna is_test e Atualizacao Segura do RPC get_all_dental_tenants
-- Data: 2026-09-16

-- 1. Adicionar coluna is_test em df_tenants se nao existir
ALTER TABLE public.df_tenants 
ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

-- 2. Atualizar as clinicas reais para garantir consistencia
UPDATE public.df_tenants
SET name = 'Bizone',
    trade_name = 'Bizone',
    is_test = false,
    is_active = true
WHERE id = 'clinic_1789405023533_phq5';

UPDATE public.df_tenants
SET name = 'Contaju',
    trade_name = 'Contaju',
    is_test = false,
    is_active = true
WHERE id = 'clinic_1789153962617_gpw1';

-- 3. Identificar e marcar tenants criados por testes de suites automatizadas
UPDATE public.df_tenants
SET is_test = true,
    is_active = false
WHERE id NOT IN ('clinic_1789405023533_phq5', 'clinic_1789153962617_gpw1', 'tenant_demo')
  AND (
    id LIKE 'clinic_178959667%'
    OR id = 'clinic_1789596680_9acc'
    OR email LIKE '%@teste.com'
    OR email LIKE 'dentista_%@clinica.com.br'
    OR email LIKE 'novo_consultorio_%@odonto.com.br'
    OR email LIKE 'clean_r%@clinica.com.br'
    OR email LIKE 'dr_persist_%@clinicaodonto.com.br'
  );

-- Limpar registros orfaos das fixtures de teste
DELETE FROM public.df_payroll_history WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_expenses WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_sales WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_patients WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_procedures WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_clinical_inputs WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_bank_accounts WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_appointments WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_system_preferences WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_audit_logs WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_professionals WHERE tenant_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_users WHERE clinic_id IN (SELECT id FROM public.df_tenants WHERE is_test = true);
DELETE FROM public.df_tenants WHERE is_test = true;

-- 4. Atualizar o RPC get_all_dental_tenants com filtro rigido contra tenants de teste e inativos
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
        COALESCE(NULLIF(p.name, ''), u.name, 'Cirurgiao-Dentista') AS owner_name,
        COALESCE(u.email, t.email, '') AS owner_email,
        COUNT(DISTINCT u.id) AS total_users,
        t.created_at
    FROM public.df_tenants t
    LEFT JOIN public.df_professionals p ON p.tenant_id = t.id
    LEFT JOIN public.df_users u ON u.clinic_id = t.id AND u.is_active = true
    WHERE t.id != 'tenant_demo'
      AND (t.is_test IS FALSE OR t.is_test IS NULL)
      AND (t.is_active IS TRUE)
    GROUP BY t.id, t.name, t.trade_name, p.nome_fantasia, p.razao_social, p.name, u.name, u.email, t.email, t.created_at
    ORDER BY clinic_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_dental_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_dental_tenants() TO authenticated;
