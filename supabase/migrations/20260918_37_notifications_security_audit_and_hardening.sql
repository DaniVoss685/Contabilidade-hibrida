-- Migration: 20260918_37_notifications_security_audit_and_hardening.sql
-- Description: Auditoria e Hardening final de segurança da camada de notificações do Dental Finance.
-- 1. Remove definitivamente qualquer permissão de INSERT em df_notifications para authenticated (somente service_role).
-- 2. Restringe SELECT e UPDATE em df_notifications para impedir que um atendente acerte notificações exclusivas de outro.
-- 3. Restringe df_notification_reads para que apenas o próprio usuário derivado de auth.uid() possa registrar leituras.
-- 4. Remove p_user_id das RPCs SECURITY DEFINER: a identidade canônica é derivada estritamente de auth.uid().
-- 5. Validação robusta de RBAC e WhatsApp (can_user_access_whatsapp).

-- ==============================================================================
-- 1. REMOVER INSERT PARA AUTHENTICATED EM df_notifications
-- Notificações são criadas exclusivamente por webhook/backend (service_role).
-- Usuários autenticados comuns NUNCA podem forjar notificações.
-- ==============================================================================
DROP POLICY IF EXISTS df_notifications_insert_policy ON public.df_notifications;

-- ==============================================================================
-- 2. AJUSTE DE SELECT E UPDATE EM df_notifications (ISOLAMENTO INDIVIDUAL)
-- Se df_notifications.user_id contém outro usuário, o atendente não pode visualizar
-- nem alterar essa linha, mesmo pertencendo ao mesmo tenant.
-- ==============================================================================
DROP POLICY IF EXISTS df_notifications_select_policy ON public.df_notifications;
CREATE POLICY df_notifications_select_policy ON public.df_notifications
  FOR SELECT TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND public.can_user_access_whatsapp(tenant_id)
    AND (
      user_id IS NULL
      OR user_id IN (
        SELECT u.id 
        FROM public.df_users u 
        WHERE u.auth_user_id = auth.uid() 
          AND u.clinic_id = df_notifications.tenant_id 
          AND u.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS df_notifications_update_policy ON public.df_notifications;
CREATE POLICY df_notifications_update_policy ON public.df_notifications
  FOR UPDATE TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND public.can_user_access_whatsapp(tenant_id)
    AND (
      user_id IS NULL
      OR user_id IN (
        SELECT u.id 
        FROM public.df_users u 
        WHERE u.auth_user_id = auth.uid() 
          AND u.clinic_id = df_notifications.tenant_id 
          AND u.is_active = true
      )
    )
  )
  WITH CHECK (
    public.is_dental_tenant_member(tenant_id)
    AND public.can_user_access_whatsapp(tenant_id)
    AND (
      user_id IS NULL
      OR user_id IN (
        SELECT u.id 
        FROM public.df_users u 
        WHERE u.auth_user_id = auth.uid() 
          AND u.clinic_id = df_notifications.tenant_id 
          AND u.is_active = true
      )
    )
  );

-- ==============================================================================
-- 3. AJUSTE DE POLICIES EM df_notification_reads (SEM FORJAMENTO)
-- Usuário autenticado só pode inserir e visualizar registros de leitura com seu próprio ID
-- ==============================================================================
DROP POLICY IF EXISTS df_notification_reads_select_policy ON public.df_notification_reads;
CREATE POLICY df_notification_reads_select_policy ON public.df_notification_reads
  FOR SELECT TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND user_id IN (
      SELECT u.id 
      FROM public.df_users u 
      WHERE u.auth_user_id = auth.uid() 
        AND u.clinic_id = df_notification_reads.tenant_id 
        AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS df_notification_reads_insert_policy ON public.df_notification_reads;
CREATE POLICY df_notification_reads_insert_policy ON public.df_notification_reads
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_dental_tenant_member(tenant_id)
    AND public.can_user_access_whatsapp(tenant_id)
    AND user_id IN (
      SELECT u.id 
      FROM public.df_users u 
      WHERE u.auth_user_id = auth.uid() 
        AND u.clinic_id = df_notification_reads.tenant_id 
        AND u.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.df_notifications n
      WHERE n.id = df_notification_reads.notification_id
        AND n.tenant_id = df_notification_reads.tenant_id
        AND (n.user_id IS NULL OR n.user_id = df_notification_reads.user_id)
    )
  );

DROP POLICY IF EXISTS df_notification_reads_delete_policy ON public.df_notification_reads;
CREATE POLICY df_notification_reads_delete_policy ON public.df_notification_reads
  FOR DELETE TO authenticated
  USING (
    public.is_dental_tenant_member(tenant_id)
    AND user_id IN (
      SELECT u.id 
      FROM public.df_users u 
      WHERE u.auth_user_id = auth.uid() 
        AND u.clinic_id = df_notification_reads.tenant_id 
        AND u.is_active = true
    )
  );

-- ==============================================================================
-- 4. FUNÇÃO can_user_access_whatsapp
-- Validação estrita: auth.uid() não-nulo, usuário ativo no tenant, role compatível
-- ==============================================================================
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
-- 5. RPCs SECURITY DEFINER: REMOÇÃO DE p_user_id DAS ASSINATURAS PÚBLICAS
-- Identidade derivada 100% no servidor através de auth.uid().
-- ==============================================================================

-- 5.1 Dropar assinaturas anteriores que aceitavam p_user_id
DROP FUNCTION IF EXISTS public.get_unread_notifications(text, text);
DROP FUNCTION IF EXISTS public.mark_notification_as_read(text, text, text);
DROP FUNCTION IF EXISTS public.mark_all_notifications_as_read(text, text);

-- 5.2 get_unread_notifications(p_tenant_id text)
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
  -- 1. Validar autenticação
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- 2. Validar permissão de WhatsApp e membership no tenant
  IF NOT public.can_user_access_whatsapp(p_tenant_id) THEN
    RETURN;
  END IF;

  -- 3. Obter o id canônico do usuário autenticado para este tenant
  SELECT id INTO v_user_id
  FROM public.df_users
  WHERE auth_user_id = auth.uid()
    AND clinic_id = p_tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 4. Retornar notificações não lidas:
  --    - Do tenant fornecido
  --    - Destinadas a este usuário OU destinadas à equipe inteira (user_id IS NULL)
  --    - Que NÃO possuam leitura registrada em df_notification_reads para este usuário
  --    - Que não tenham is_read = true caso seja notificação individual
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

-- 5.3 mark_notification_as_read(p_notification_id text, p_tenant_id text)
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
  -- 1. Validar autenticação
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- 2. Validar permissão ao módulo WhatsApp no tenant
  IF NOT public.can_user_access_whatsapp(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado ao tenant % ou módulo WhatsApp', p_tenant_id;
  END IF;

  -- 3. Obter o id canônico do usuário autenticado no tenant
  SELECT id INTO v_user_id
  FROM public.df_users
  WHERE auth_user_id = auth.uid()
    AND clinic_id = p_tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário ativo não localizado para este tenant';
  END IF;

  -- 4. Inspecionar a notificação alvo
  SELECT user_id, tenant_id INTO v_notif_user_id, v_notif_tenant_id
  FROM public.df_notifications
  WHERE id = p_notification_id;

  IF v_notif_tenant_id IS NULL OR v_notif_tenant_id != p_tenant_id THEN
    RAISE EXCEPTION 'Notificação não encontrada no tenant especificado';
  END IF;

  -- 5. Se for notificação individual direcionada a OUTRO usuário, bloquear (impersonação)
  IF v_notif_user_id IS NOT NULL AND v_notif_user_id != v_user_id THEN
    RAISE EXCEPTION 'Acesso negado: a notificação pertence exclusivamente a outro usuário';
  END IF;

  -- 6. Gravar leitura individual do usuário autenticado
  INSERT INTO public.df_notification_reads (notification_id, user_id, tenant_id, read_at)
  VALUES (p_notification_id, v_user_id, p_tenant_id, now())
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  -- 7. Se a notificação for individual deste usuário, atualizar is_read = true
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

-- 5.4 mark_all_notifications_as_read(p_tenant_id text)
CREATE OR REPLACE FUNCTION public.mark_all_notifications_as_read(p_tenant_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id text;
BEGIN
  -- 1. Validar autenticação
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- 2. Validar permissão ao módulo WhatsApp no tenant
  IF NOT public.can_user_access_whatsapp(p_tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado ao tenant % ou módulo WhatsApp', p_tenant_id;
  END IF;

  -- 3. Obter o id canônico do usuário autenticado no tenant
  SELECT id INTO v_user_id
  FROM public.df_users
  WHERE auth_user_id = auth.uid()
    AND clinic_id = p_tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário ativo não localizado para este tenant';
  END IF;

  -- 4. Inserir em df_notification_reads para todas as notificações visíveis ao usuário autenticado
  --    (suas próprias notificações individuais + notificações de equipe não lidas)
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

  -- 5. Atualizar as notificações individuais dele como is_read = true
  UPDATE public.df_notifications
  SET is_read = true
  WHERE tenant_id = p_tenant_id
    AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_as_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_as_read(text) TO authenticated;
