-- Migration 20: Sincronizacao dos nomes reais de clinicas em df_tenants e atualizacao do RPC get_all_dental_tenants
-- Data: 2026-09-16

-- 1. Sincronizar df_tenants com os nomes reais das clinicas presentes em df_professionals
UPDATE public.df_tenants t
SET name = COALESCE(NULLIF(p.nome_fantasia, ''), NULLIF(p.razao_social, ''), t.name),
    trade_name = COALESCE(NULLIF(p.nome_fantasia, ''), NULLIF(p.razao_social, ''), t.trade_name)
FROM public.df_professionals p
WHERE p.tenant_id = t.id
  AND (NULLIF(p.nome_fantasia, '') IS NOT NULL OR NULLIF(p.razao_social, '') IS NOT NULL);

-- Garantir especificamente os nomes canonicos conhecidos
UPDATE public.df_tenants
SET name = 'Bizone',
    trade_name = 'Bizone'
WHERE id = 'clinic_1789405023533_phq5';

UPDATE public.df_tenants
SET name = 'Contaju',
    trade_name = 'Contaju'
WHERE id = 'clinic_1789153962617_gpw1';

-- 2. Atualizar o RPC get_all_dental_tenants para priorizar estritamente o nome real da clinica
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
    GROUP BY t.id, t.name, t.trade_name, p.nome_fantasia, p.razao_social, p.name, u.name, u.email, t.email, t.created_at
    ORDER BY clinic_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_dental_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_dental_tenants() TO authenticated;
