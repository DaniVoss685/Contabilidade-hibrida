-- Migration 20260916_19: Correção do Trigger de Whitelist do Auth e RPC de Reconciliação / Provisionamento Seguro

-- 1. Atualizar a trigger function check_registration_whitelist() para suportar Dental Finance
CREATE OR REPLACE FUNCTION public.check_registration_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Permitir e-mails do domínio @noblefinance.com do Noble Finance automaticamente
    IF NEW.email LIKE '%@noblefinance.com' THEN
        RETURN NEW;
    END IF;

    -- Permitir cadastro legítimo do Dental Finance (metadados de app ou usuário dental existente no df_users)
    IF (
        COALESCE(NEW.raw_user_meta_data->>'app', '') = 'dental_finance'
        OR COALESCE(NEW.raw_app_meta_data->>'app', '') = 'dental_finance'
        OR EXISTS (SELECT 1 FROM public.df_users WHERE lower(email) = lower(NEW.email))
    ) THEN
        RETURN NEW;
    END IF;

    -- Verificar whitelist para demais aplicações compartilhadas
    IF NOT EXISTS (SELECT 1 FROM public.allowed_emails WHERE lower(email) = lower(NEW.email)) THEN
        RAISE EXCEPTION 'O email % não está autorizado para cadastro.', NEW.email;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. Criar RPC oficial para reconciliação segura e provisionamento de clínicas Dental Finance
CREATE OR REPLACE FUNCTION public.reconcile_or_provision_dental_user(
    p_clinic_name text DEFAULT NULL,
    p_trade_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_caller_auth_id uuid;
    v_caller_email text;
    v_email_confirmed_at timestamptz;
    v_confirmed_at timestamptz;
    v_existing_user record;
    v_new_tenant_id text;
    v_new_user_id text;
    v_clinic_name text;
    v_trade_name text;
BEGIN
    -- Validar identidade estritamente a partir do JWT autenticado oficial
    v_caller_auth_id := auth.uid();
    IF v_caller_auth_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado no Supabase Auth.';
    END IF;

    -- Obter o e-mail oficial do usuário autenticado no auth.users
    SELECT email, email_confirmed_at, confirmed_at
    INTO v_caller_email, v_email_confirmed_at, v_confirmed_at
    FROM auth.users
    WHERE id = v_caller_auth_id;

    IF v_caller_email IS NULL THEN
        RAISE EXCEPTION 'Usuário não encontrado na autoridade de autenticação.';
    END IF;

    v_caller_email := lower(trim(v_caller_email));

    -- Verificar se já existe perfil legítimo em df_users para este e-mail
    SELECT u.id, u.clinic_id, u.name, u.role, u.auth_user_id, t.name as clinic_name, t.trade_name
    INTO v_existing_user
    FROM public.df_users u
    LEFT JOIN public.df_tenants t ON t.id = u.clinic_id
    WHERE lower(u.email) = v_caller_email
    LIMIT 1;

    IF v_existing_user.id IS NOT NULL THEN
        -- CASO B: Registro legado / recadastro de usuário cujo auth.users foi excluído manualmente.
        -- Reconciliar vinculando o novo auth_user_id ao df_users existente SEM criar nova clínica!
        UPDATE public.df_users
        SET auth_user_id = v_caller_auth_id,
            is_active = true
        WHERE id = v_existing_user.id;

        -- Garantir que o tenant existente está ativo
        UPDATE public.df_tenants
        SET is_active = true
        WHERE id = v_existing_user.clinic_id;

        RETURN jsonb_build_object(
            'success', true,
            'is_reconciled', true,
            'tenant_id', v_existing_user.clinic_id,
            'user_id', v_existing_user.id,
            'role', v_existing_user.role,
            'clinic_name', COALESCE(v_existing_user.clinic_name, 'Clínica Odontológica'),
            'trade_name', v_existing_user.trade_name
        );
    ELSE
        -- CASO A: Usuário 100% novo. Provisionar novo tenant e usuário de forma atômica.
        v_new_tenant_id := 'clinic_' || extract(epoch from now())::bigint || '_' || lower(substr(md5(random()::text), 1, 4));
        v_new_user_id := 'usr_' || extract(epoch from now())::bigint || '_' || lower(substr(md5(random()::text), 1, 4));
        v_clinic_name := COALESCE(NULLIF(trim(p_clinic_name), ''), 'Minha Clínica');
        v_trade_name := COALESCE(NULLIF(trim(p_trade_name), ''), v_clinic_name);

        -- Criar tenant em df_tenants
        INSERT INTO public.df_tenants (
            id, name, trade_name, email, is_active, is_demo, created_at
        ) VALUES (
            v_new_tenant_id, v_clinic_name, v_trade_name, v_caller_email, true, false, NOW()
        );

        -- Criar usuário em df_users
        INSERT INTO public.df_users (
            id, clinic_id, email, name, role, auth_user_id, is_active, is_primary, created_at
        ) VALUES (
            v_new_user_id, v_new_tenant_id, v_caller_email, split_part(v_caller_email, '@', 1), 'OWNER', v_caller_auth_id, true, false, NOW()
        );

        RETURN jsonb_build_object(
            'success', true,
            'is_reconciled', false,
            'tenant_id', v_new_tenant_id,
            'user_id', v_new_user_id,
            'role', 'OWNER',
            'clinic_name', v_clinic_name,
            'trade_name', v_trade_name
        );
    END IF;
END;
$$;
