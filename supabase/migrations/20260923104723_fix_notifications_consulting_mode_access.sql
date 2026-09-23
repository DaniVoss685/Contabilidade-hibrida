-- ============================================================================
-- MIGRATION: 20260923104723_fix_notifications_consulting_mode_access.sql
-- CAUSA RAIZ REAL do bug "notificações do WhatsApp pararam de funcionar":
--
-- can_user_access_whatsapp(p_tenant_id) e as RPCs get_unread_notifications,
-- mark_notification_as_read, mark_all_notifications_as_read (criadas em
-- 20260918_36/37) exigem categoricamente que exista uma linha em df_users com
-- auth_user_id = auth.uid() AND clinic_id = p_tenant_id. Isso NUNCA teve o
-- bypass de is_primary/SUPER_ADMIN que is_dental_tenant_member() (usado em
-- TODAS as outras tabelas df_wa_*) já tem desde 20260915_00_rls_helpers.sql.
--
-- Resultado: qualquer acesso via "Modo Consultoria" (usuário is_primary/
-- SUPER_ADMIN cujo df_users.clinic_id é a PRÓPRIA clínica, operando em um
-- tenant de cliente) nunca teve uma linha df_users com clinic_id = tenant do
-- cliente, então:
--   - can_user_access_whatsapp() sempre retornava false para esse tenant;
--   - a policy SELECT de df_notifications bloqueava tanto queries diretas
--     quanto a entrega via Realtime (postgres_changes respeita RLS);
--   - get_unread_notifications()/mark_*_as_read() sempre retornavam vazio
--     ou lançavam exceção.
-- Mensagens/conversas continuaram funcionando normalmente porque
-- df_wa_messages/df_wa_conversations usam só is_dental_tenant_member (que já
-- tinha o bypass) — daí "mensagens chegam, mas notificação não aparece".
--
-- Não é uma regressão desta sessão (o modelo de responsável/contatos N:N não
-- toca nenhuma dessas 4 funções) — é um gap pré-existente desde a migration
-- de hardening de 18/09, só não percebido até agora porque exige testar
-- especificamente em Modo Consultoria.
--
-- Correção: mesma semântica de is_dental_tenant_member em todos os 4 pontos —
-- is_primary=true OU role='SUPER_ADMIN' dá acesso cross-tenant; usuários
-- comuns continuam exigindo clinic_id = p_tenant_id + role/permissão de
-- WhatsApp, exatamente como antes.
-- ============================================================================

-- 1. can_user_access_whatsapp: bypass cross-tenant para is_primary/SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.can_user_access_whatsapp(p_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (auth.uid() IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.df_users
    WHERE auth_user_id = auth.uid()
      AND is_active = true
      AND (
        is_primary = true
        OR role = 'SUPER_ADMIN'
        OR (
          clinic_id = p_tenant_id
          AND (
            role IN ('PLATFORM_ADMIN', 'OWNER', 'ADMIN', 'RECEPTION', 'ASSISTANT', 'DENTIST', 'PROFESSIONAL')
            OR (permissions IS NOT NULL AND permissions ? 'whatsapp:view')
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_user_access_whatsapp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_access_whatsapp(text) TO authenticated;

-- ============================================================================
-- Helper: resolve o df_users.id "canônico" do usuário autenticado para um
-- tenant, com fallback cross-tenant para is_primary/SUPER_ADMIN (Modo
-- Consultoria) quando não existe linha própria naquele clinic_id.
-- Usado só internamente pelas 3 RPCs abaixo — mantém a MESMA identidade
-- (o df_users.id da CLÍNICA PRÓPRIA do consultor) que já é usada em outros
-- pontos do sistema quando um consultor age sobre um tenant de cliente
-- (ex.: df_wa_conversations.assigned_to não exige clinic_id = tenant_id).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_notification_actor_id(p_tenant_id text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id text;
BEGIN
  SELECT id INTO v_user_id
  FROM public.df_users
  WHERE auth_user_id = auth.uid()
    AND clinic_id = p_tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM public.df_users
    WHERE auth_user_id = auth.uid()
      AND is_active = true
      AND (is_primary = true OR role = 'SUPER_ADMIN')
    LIMIT 1;
  END IF;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_notification_actor_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_notification_actor_id(text) TO authenticated;

-- 2. get_unread_notifications
CREATE OR REPLACE FUNCTION public.get_unread_notifications(p_tenant_id text)
RETURNS SETOF public.df_notifications
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.can_user_access_whatsapp(p_tenant_id) THEN
    RETURN;
  END IF;

  v_user_id := public.resolve_notification_actor_id(p_tenant_id);

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT n.*
  FROM public.df_notifications n
  WHERE n.tenant_id = p_tenant_id
    AND (n.user_id = v_user_id OR n.user_id IS NULL)
    AND NOT EXISTS (
      SELECT 1
      FROM public.df_notification_reads r
      WHERE r.notification_id = n.id
        AND r.user_id = v_user_id
    )
    AND (n.user_id IS NOT NULL OR n.is_read = false)
    AND (n.user_id IS NULL OR n.is_read = false)
  ORDER BY n.created_at DESC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.get_unread_notifications(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unread_notifications(text) TO authenticated;

-- 3. mark_notification_as_read
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(p_notification_id text, p_tenant_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id text;
  v_notif_user_id text;
  v_notif_tenant_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.can_user_access_whatsapp(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado ao tenant % ou módulo WhatsApp', p_tenant_id;
  END IF;

  v_user_id := public.resolve_notification_actor_id(p_tenant_id);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário ativo não localizado para este tenant';
  END IF;

  SELECT user_id, tenant_id INTO v_notif_user_id, v_notif_tenant_id
  FROM public.df_notifications
  WHERE id = p_notification_id;

  IF v_notif_tenant_id IS NULL OR v_notif_tenant_id != p_tenant_id THEN
    RAISE EXCEPTION 'Notificação não encontrada no tenant especificado';
  END IF;

  IF v_notif_user_id IS NOT NULL AND v_notif_user_id != v_user_id THEN
    RAISE EXCEPTION 'Acesso negado: a notificação pertence exclusivamente a outro usuário';
  END IF;

  INSERT INTO public.df_notification_reads (notification_id, user_id, tenant_id, read_at)
  VALUES (p_notification_id, v_user_id, p_tenant_id, now())
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  IF v_notif_user_id = v_user_id THEN
    UPDATE public.df_notifications
    SET is_read = true
    WHERE id = p_notification_id
      AND tenant_id = p_tenant_id
      AND user_id = v_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_as_read(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_as_read(text, text) TO authenticated;

-- 4. mark_all_notifications_as_read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read(p_tenant_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT public.can_user_access_whatsapp(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado ao tenant % ou módulo WhatsApp', p_tenant_id;
  END IF;

  v_user_id := public.resolve_notification_actor_id(p_tenant_id);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário ativo não localizado para este tenant';
  END IF;

  INSERT INTO public.df_notification_reads (notification_id, user_id, tenant_id, read_at)
  SELECT n.id, v_user_id, p_tenant_id, now()
  FROM public.df_notifications n
  WHERE n.tenant_id = p_tenant_id
    AND (n.user_id = v_user_id OR n.user_id IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.df_notification_reads r
      WHERE r.notification_id = n.id AND r.user_id = v_user_id
    )
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  UPDATE public.df_notifications
  SET is_read = true
  WHERE tenant_id = p_tenant_id
    AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_as_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read(text) TO authenticated;
