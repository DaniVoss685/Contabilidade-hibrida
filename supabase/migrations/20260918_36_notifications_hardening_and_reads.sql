-- Migration: 20260918_36_notifications_hardening_and_reads.sql
-- Description: Hardening de segurança do sistema de notificações do Dental Finance.
-- 1. Remove acesso anon e políticas genéricas (USING true).
-- 2. Restringe acesso a usuários autenticados, com isolamento estrito por tenant.
-- 3. Bloqueia leitura de notificações de WhatsApp para usuários sem permissão (ex: FINANCE).
-- 4. Cria tabela df_notification_reads para leitura individual de notificações de equipe (Luana vs Giovana).
-- 5. Hardening de RLS em df_push_subscriptions e df_user_notification_settings.
-- 6. RPCs atômicas de busca e marcação de lidas com isolamento multiusuário.

-- ==============================================================================
-- 1. FUNÇÃO DE VERIFICAÇÃO DE PERMISSÃO AO MÓDULO WHATSAPP
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.can_user_access_whatsapp(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.df_users
    WHERE auth_user_id = auth.uid()
      AND clinic_id = p_tenant_id
      AND is_active = true
      AND (
        is_primary = true
        OR role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN', 'OWNER', 'ADMIN', 'RECEPTION', 'ASSISTANT', 'DENTIST', 'PROFESSIONAL')
        OR (permissions IS NOT NULL AND permissions ? 'whatsapp:view')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_user_access_whatsapp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_access_whatsapp(text) TO authenticated;

-- ==============================================================================
-- 2. TABELA DE LEITURA INDIVIDUAL DE NOTIFICAÇÕES (df_notification_reads)
-- Permite que uma notificação transmitida para a equipe (user_id IS NULL)
-- seja marcada como lida individualmente por cada atendente.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.df_notification_reads (
  notification_id text NOT NULL REFERENCES public.df_notifications(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.df_users(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_df_notification_reads_user_tenant 
ON public.df_notification_reads (user_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_df_notification_reads_notif
ON public.df_notification_reads (notification_id);

ALTER TABLE public.df_notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_notification_reads_select_policy ON public.df_notification_reads;
CREATE POLICY df_notification_reads_select_policy ON public.df_notification_reads
  FOR SELECT TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS df_notification_reads_insert_policy ON public.df_notification_reads;
CREATE POLICY df_notification_reads_insert_policy ON public.df_notification_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_dental_tenant_member(tenant_id)
    AND user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS df_notification_reads_delete_policy ON public.df_notification_reads;
CREATE POLICY df_notification_reads_delete_policy ON public.df_notification_reads
  FOR DELETE TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
  );

-- ==============================================================================
-- 3. HARDENING RLS EM df_notifications
-- Elimina anon e USING (true). Exige membro do tenant e permissão de WhatsApp.
-- ==============================================================================
ALTER TABLE public.df_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_notifications_policy ON public.df_notifications;
DROP POLICY IF EXISTS df_notifications_select_policy ON public.df_notifications;
DROP POLICY IF EXISTS df_notifications_update_policy ON public.df_notifications;
DROP POLICY IF EXISTS df_notifications_insert_policy ON public.df_notifications;
DROP POLICY IF EXISTS df_notifications_delete_policy ON public.df_notifications;

-- SELECT: Somente membros autenticados do mesmo tenant com permissão de WhatsApp
CREATE POLICY df_notifications_select_policy ON public.df_notifications
  FOR SELECT TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND public.can_user_access_whatsapp(tenant_id)
  );

-- UPDATE: Usuário autenticado com permissão pode atualizar status
CREATE POLICY df_notifications_update_policy ON public.df_notifications
  FOR UPDATE TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND public.can_user_access_whatsapp(tenant_id)
  )
  WITH CHECK (
    public.is_dental_tenant_member(tenant_id)
    AND public.can_user_access_whatsapp(tenant_id)
  );

-- INSERT: Permite inserções autorizadas no próprio tenant
CREATE POLICY df_notifications_insert_policy ON public.df_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_dental_tenant_member(tenant_id)
    AND public.can_user_access_whatsapp(tenant_id)
  );

-- ==============================================================================
-- 4. HARDENING RLS EM df_push_subscriptions
-- Bloqueia anon. Restringe cada usuário às suas próprias subscrições.
-- ==============================================================================
ALTER TABLE public.df_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_push_subscriptions_policy ON public.df_push_subscriptions;
DROP POLICY IF EXISTS df_push_subscriptions_select_policy ON public.df_push_subscriptions;
DROP POLICY IF EXISTS df_push_subscriptions_insert_policy ON public.df_push_subscriptions;
DROP POLICY IF EXISTS df_push_subscriptions_update_policy ON public.df_push_subscriptions;
DROP POLICY IF EXISTS df_push_subscriptions_delete_policy ON public.df_push_subscriptions;

CREATE POLICY df_push_subscriptions_select_policy ON public.df_push_subscriptions
  FOR SELECT TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND (
      user_id IS NULL
      OR user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
    )
  );

CREATE POLICY df_push_subscriptions_insert_policy ON public.df_push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_dental_tenant_member(tenant_id)
    AND (
      user_id IS NULL
      OR user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
    )
  );

CREATE POLICY df_push_subscriptions_update_policy ON public.df_push_subscriptions
  FOR UPDATE TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND (
      user_id IS NULL
      OR user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
    )
  )
  WITH CHECK (
    public.is_dental_tenant_member(tenant_id)
    AND (
      user_id IS NULL
      OR user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
    )
  );

CREATE POLICY df_push_subscriptions_delete_policy ON public.df_push_subscriptions
  FOR DELETE TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND (
      user_id IS NULL
      OR user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
    )
  );

-- ==============================================================================
-- 5. HARDENING RLS EM df_user_notification_settings
-- Somente o próprio usuário autenticado pode gerenciar suas preferências.
-- ==============================================================================
ALTER TABLE public.df_user_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_user_notification_settings_policy ON public.df_user_notification_settings;
DROP POLICY IF EXISTS df_user_notif_settings_all_policy ON public.df_user_notification_settings;

CREATE POLICY df_user_notif_settings_all_policy ON public.df_user_notification_settings
  FOR ALL TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    public.is_dental_tenant_member(tenant_id)
    AND user_id IN (SELECT id FROM public.df_users WHERE auth_user_id = auth.uid() AND is_active = true)
  );

-- ==============================================================================
-- 6. RPCs ATÔMICAS COM SUPORTE A LEITURA INDIVIDUAL POR ATENDENTE
-- ==============================================================================

-- 6.1 Buscar notificações não lidas para o usuário atual
CREATE OR REPLACE FUNCTION public.get_unread_notifications(p_tenant_id text, p_user_id text)
RETURNS SETOF public.df_notifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT n.*
  FROM public.df_notifications n
  WHERE n.tenant_id = p_tenant_id
    AND public.can_user_access_whatsapp(p_tenant_id)
    AND (n.user_id = p_user_id OR n.user_id IS NULL)
    AND NOT EXISTS (
      SELECT 1 
      FROM public.df_notification_reads r 
      WHERE r.notification_id = n.id 
        AND r.user_id = p_user_id
    )
    AND (n.user_id IS NOT NULL OR n.is_read = false)
  ORDER BY n.created_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_unread_notifications(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unread_notifications(text, text) TO authenticated;

-- 6.2 Marcar notificação individual como lida
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(p_notification_id text, p_tenant_id text, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Validar permissão de acesso ao tenant
  IF NOT public.is_dental_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado ao tenant %', p_tenant_id;
  END IF;

  -- 1. Inserir registro de leitura individual
  INSERT INTO public.df_notification_reads (notification_id, user_id, tenant_id, read_at)
  VALUES (p_notification_id, p_user_id, p_tenant_id, now())
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  -- 2. Se a notificação for direcionada exclusivamente a este usuário, marcar is_read = true
  UPDATE public.df_notifications
  SET is_read = true
  WHERE id = p_notification_id
    AND tenant_id = p_tenant_id
    AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_as_read(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_as_read(text, text, text) TO authenticated;

-- 6.3 Marcar todas as notificações do usuário no tenant como lidas
CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read(p_tenant_id text, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Validar permissão de acesso ao tenant
  IF NOT public.is_dental_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado ao tenant %', p_tenant_id;
  END IF;

  -- Inserir leituras para todas as notificações que este usuário ainda não leu
  INSERT INTO public.df_notification_reads (notification_id, user_id, tenant_id, read_at)
  SELECT n.id, p_user_id, p_tenant_id, now()
  FROM public.df_notifications n
  WHERE n.tenant_id = p_tenant_id
    AND (n.user_id = p_user_id OR n.user_id IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.df_notification_reads r
      WHERE r.notification_id = n.id AND r.user_id = p_user_id
    )
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  -- Marcar notificações individuais como lidas
  UPDATE public.df_notifications
  SET is_read = true
  WHERE tenant_id = p_tenant_id
    AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_as_read(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read(text, text) TO authenticated;
