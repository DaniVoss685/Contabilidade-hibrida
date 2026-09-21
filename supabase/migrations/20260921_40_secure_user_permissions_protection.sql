-- Migração: Blindagem de Segurança para df_users contra escalada de privilégios
-- Impede que usuários comuns alterem seu próprio role, permissions, is_primary ou clinic_id via cliente/DevTools

CREATE OR REPLACE FUNCTION check_df_users_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_auth_id uuid;
  v_is_admin boolean := false;
BEGIN
  v_caller_auth_id := auth.uid();

  -- Se for service_role ou execução interna de sistema, permite
  IF v_caller_auth_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se os campos sensíveis não foram alterados, permite a atualização (ex: nome, whatsapp_display_name, etc.)
  IF (OLD.role IS NOT DISTINCT FROM NEW.role) AND
     (OLD.permissions IS NOT DISTINCT FROM NEW.permissions) AND
     (OLD.is_primary IS NOT DISTINCT FROM NEW.is_primary) AND
     (OLD.clinic_id IS NOT DISTINCT FROM NEW.clinic_id) THEN
    RETURN NEW;
  END IF;

  -- Verificar se o usuário autenticado que está chamando possui privilégios administrativos
  SELECT EXISTS (
    SELECT 1 FROM df_users u
    WHERE u.auth_user_id = v_caller_auth_id
      AND u.is_active = true
      AND (
        u.is_primary = true
        OR u.role IN ('SUPER_ADMIN', 'PLATFORM_ADMIN')
        OR (u.clinic_id = OLD.clinic_id AND u.role IN ('OWNER', 'ADMIN'))
      )
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores da clínica podem alterar permissões, funções ou vínculos de equipe.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_df_users_self_escalation ON df_users;

CREATE TRIGGER trg_check_df_users_self_escalation
  BEFORE UPDATE ON df_users
  FOR EACH ROW
  EXECUTE FUNCTION check_df_users_self_escalation();
