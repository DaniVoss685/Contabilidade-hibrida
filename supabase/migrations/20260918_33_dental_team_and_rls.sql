-- ============================================================================
-- Migration: 20260918_33_dental_team_and_rls.sql
-- Descrição: Suporte a múltiplos usuários por clínica, ajuste de RLS em df_users,
--            política de identificação de atendentes no WhatsApp e vínculo com profissionais.
-- ============================================================================

-- 1. Adicionar coluna de política de identificação do atendente em df_wa_reminder_settings
ALTER TABLE public.df_wa_reminder_settings 
ADD COLUMN IF NOT EXISTS agent_identification_policy text NOT NULL DEFAULT 'AUTOMATICO'
CHECK (agent_identification_policy IN ('AUTOMATICO', 'SEMPRE', 'NUNCA'));

-- 2. Adicionar coluna opcional de permissões granulares em df_users (jsonb)
ALTER TABLE public.df_users 
ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT NULL;

-- 3. Adicionar vínculo opcional de profissional com usuário da plataforma em df_professionals
ALTER TABLE public.df_professionals 
ADD COLUMN IF NOT EXISTS user_id text REFERENCES public.df_users(id) ON DELETE SET NULL;

-- 4. Ajuste das políticas RLS em df_users para permitir colaboração da equipe no mesmo tenant
DROP POLICY IF EXISTS "df_users_select_own" ON public.df_users;
DROP POLICY IF EXISTS "df_users_update_own" ON public.df_users;
DROP POLICY IF EXISTS "df_users_insert_own" ON public.df_users;
DROP POLICY IF EXISTS "df_users_delete_policy" ON public.df_users;
DROP POLICY IF EXISTS "df_users_select_policy" ON public.df_users;
DROP POLICY IF EXISTS "df_users_insert_policy" ON public.df_users;
DROP POLICY IF EXISTS "df_users_update_policy" ON public.df_users;

-- 4.1 SELECT: Usuário pode ver seu próprio perfil OU perfis de membros da mesma clínica
CREATE POLICY "df_users_select_policy" ON public.df_users
FOR SELECT TO authenticated
USING (
  auth_user_id = auth.uid()
  OR is_dental_tenant_member(clinic_id)
);

-- 4.2 INSERT: Administradores da clínica ou o próprio usuário podem inserir
CREATE POLICY "df_users_insert_policy" ON public.df_users
FOR INSERT TO authenticated
WITH CHECK (
  auth_user_id = auth.uid()
  OR (
    is_dental_tenant_member(clinic_id)
    AND EXISTS (
      SELECT 1 FROM public.df_users u
      WHERE u.auth_user_id = auth.uid()
        AND (u.clinic_id = df_users.clinic_id OR u.is_primary = true OR u.role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN'))
        AND u.role IN ('OWNER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN')
        AND u.is_active = true
    )
  )
);

-- 4.3 UPDATE: Usuário pode atualizar seu próprio perfil, OU administradores da clínica podem gerenciar membros
CREATE POLICY "df_users_update_policy" ON public.df_users
FOR UPDATE TO authenticated
USING (
  auth_user_id = auth.uid()
  OR (
    is_dental_tenant_member(clinic_id)
    AND EXISTS (
      SELECT 1 FROM public.df_users u
      WHERE u.auth_user_id = auth.uid()
        AND (u.clinic_id = df_users.clinic_id OR u.is_primary = true OR u.role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN'))
        AND u.role IN ('OWNER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN')
        AND u.is_active = true
    )
  )
)
WITH CHECK (
  auth_user_id = auth.uid()
  OR (
    is_dental_tenant_member(clinic_id)
    AND EXISTS (
      SELECT 1 FROM public.df_users u
      WHERE u.auth_user_id = auth.uid()
        AND (u.clinic_id = df_users.clinic_id OR u.is_primary = true OR u.role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN'))
        AND u.role IN ('OWNER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN')
        AND u.is_active = true
    )
  )
);

-- 5. Função RPC para verificação atômica de administradores da clínica
CREATE OR REPLACE FUNCTION public.is_clinic_admin(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.df_users
    WHERE auth_user_id = auth.uid()
      AND (clinic_id = p_tenant_id OR is_primary = true OR role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN'))
      AND role IN ('OWNER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN')
      AND is_active = true
  );
$$;
