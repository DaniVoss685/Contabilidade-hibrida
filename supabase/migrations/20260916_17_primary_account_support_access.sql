-- Migration 17: Conta Primária de Consultoria e Acesso a Múltiplos Tenants para Suporte

-- 1. Adicionar coluna is_primary em df_users se não existir
ALTER TABLE public.df_users ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;

-- 2. Definir leonardoricardoarantes@gmail.com como Conta Primária e SUPER_ADMIN
UPDATE public.df_users 
SET is_primary = true, role = 'SUPER_ADMIN' 
WHERE email = 'leonardoricardoarantes@gmail.com';

-- 3. Atualizar a função RLS is_dental_tenant_member para permitir acesso da Conta Primária a qualquer tenant
CREATE OR REPLACE FUNCTION public.is_dental_tenant_member(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS 
  SELECT EXISTS (
    SELECT 1
    FROM public.df_users
    WHERE auth_user_id = auth.uid()
      AND (clinic_id = p_tenant_id OR is_primary = true OR role = 'SUPER_ADMIN')
      AND is_active = true
  );
;

-- 4. Função RPC segura para listar todas as clínicas do sistema apenas para a Conta Primária
CREATE OR REPLACE FUNCTION public.get_all_dental_tenants()
RETURNS TABLE (
  tenant_id text,
  clinic_name text,
  professional_name text,
  email text,
  cro text,
  cro_uf text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.df_users
    WHERE auth_user_id = auth.uid()
      AND (is_primary = true OR role = 'SUPER_ADMIN')
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas a conta primária de consultoria pode listar todos os clientes.';
  END IF;

  RETURN QUERY
  SELECT 
    p.tenant_id,
    COALESCE(NULLIF(p.nome_fantasia, ''), NULLIF(p.razao_social, ''), p.name, 'Clínica Sem Nome') as clinic_name,
    p.name as professional_name,
    COALESCE(u.email, p.email, '') as email,
    COALESCE(p.cro, '') as cro,
    COALESCE(p.cro_uf, '') as cro_uf
  FROM public.df_professionals p
  LEFT JOIN public.df_users u ON u.clinic_id = p.tenant_id
  ORDER BY clinic_name ASC;
END;
;

REVOKE ALL ON FUNCTION public.get_all_dental_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_dental_tenants() TO authenticated;
