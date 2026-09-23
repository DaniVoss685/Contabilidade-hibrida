-- ============================================================================
-- MIGRATION: 20260923083019_placeholder_phone_no_contact_sync.sql
-- DESCRIÇÃO: A23 — número "placeholder" (formato estruturalmente válido, mas sem
-- sentido real: todos os dígitos iguais, ex. 99999999999, ou sequência estritamente
-- crescente/decrescente de dígitos) não deve criar nem atualizar df_wa_contacts a
-- partir de df_patients. O cadastro do paciente NUNCA é bloqueado — apenas a
-- sincronização automática com o contato de WhatsApp é pulada para esse número,
-- exatamente como já ocorre hoje para telefone em branco ou fora do padrão de
-- dígitos brasileiro (mesmo RETURN NEW antecipado, sem levantar erro).
-- Espelhado no frontend em src/lib/phoneUtils.ts (isPlaceholderPhoneNumber) —
-- manter as duas implementações em sincronia manualmente (a trigger roda
-- server-side e não importa código do frontend).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_is_placeholder_phone_local(p_local text)
RETURNS boolean AS $$
DECLARE
  i int;
  is_ascending boolean := true;
  is_descending boolean := true;
BEGIN
  IF p_local IS NULL OR length(p_local) < 8 THEN
    RETURN false;
  END IF;

  -- Todos os dígitos iguais (ex.: 99999999, 00000000)
  IF p_local ~ '^(\d)\1+$' THEN
    RETURN true;
  END IF;

  -- Sequência estritamente crescente ou decrescente de dígitos consecutivos
  FOR i IN 1..length(p_local) - 1 LOOP
    IF (ascii(substring(p_local from i + 1 for 1)) - ascii(substring(p_local from i for 1))) <> 1 THEN
      is_ascending := false;
    END IF;
    IF (ascii(substring(p_local from i for 1)) - ascii(substring(p_local from i + 1 for 1))) <> 1 THEN
      is_descending := false;
    END IF;
  END LOOP;

  RETURN is_ascending OR is_descending;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.fn_sync_df_patient_to_wa_contact()
RETURNS TRIGGER AS $$
DECLARE
  v_clean_phone text;
  v_normalized_phone text;
  v_ddd text;
  v_local text;
  v_contact_id text;
  v_existing_contact record;
BEGIN
  -- =========================================================================
  -- 1. TRATAMENTO DE EXCLUSÃO (DELETE)
  -- =========================================================================
  IF (TG_OP = 'DELETE') THEN
    UPDATE public.df_wa_contacts
    SET patient_id = NULL,
        updated_at = NOW()
    WHERE patient_id = OLD.id
      AND tenant_id = OLD.tenant_id;
    RETURN OLD;
  END IF;

  -- =========================================================================
  -- 2. PACIENTE SEM TELEFONE (OU TELEFONE EM BRANCO)
  -- =========================================================================
  IF NEW.phone IS NULL OR TRIM(NEW.phone) = '' THEN
    -- Não cria contato vazio
    RETURN NEW;
  END IF;

  -- =========================================================================
  -- 3. NORMALIZAÇÃO DO NÚMERO BRASILEIRO
  -- =========================================================================
  v_clean_phone := regexp_replace(NEW.phone, '\D', '', 'g');

  IF length(v_clean_phone) = 10 OR length(v_clean_phone) = 11 THEN
    v_ddd := substring(v_clean_phone from 1 for 2);
    v_local := substring(v_clean_phone from 3);
    IF length(v_clean_phone) = 10 AND substring(v_local from 1 for 1) IN ('6','7','8','9') THEN
      v_normalized_phone := '55' || v_ddd || '9' || v_local;
    ELSE
      v_normalized_phone := '55' || v_clean_phone;
    END IF;
  ELSIF length(v_clean_phone) = 12 OR length(v_clean_phone) = 13 THEN
    IF substring(v_clean_phone from 1 for 2) = '55' THEN
      v_ddd := substring(v_clean_phone from 3 for 2);
      v_local := substring(v_clean_phone from 5);
      IF length(v_clean_phone) = 12 AND substring(v_local from 1 for 1) IN ('6','7','8','9') THEN
        v_normalized_phone := '55' || v_ddd || '9' || v_local;
      ELSE
        v_normalized_phone := v_clean_phone;
      END IF;
    ELSE
      v_normalized_phone := v_clean_phone;
    END IF;
  ELSE
    -- Formato fora do padrão numérico brasileiro mínimo (não cria contato inválido)
    RETURN NEW;
  END IF;

  -- =========================================================================
  -- 3.1. NÚMERO PLACEHOLDER (A23) — mesmo tratamento do telefone em branco/inválido:
  -- não cria nem atualiza df_wa_contacts, mas o paciente é salvo normalmente.
  -- =========================================================================
  IF public.fn_is_placeholder_phone_local(v_local) THEN
    RETURN NEW;
  END IF;

  -- =========================================================================
  -- 4. CASO A: JÁ EXISTE CONTATO VINCULADO AO PATIENT_ID NO MESMO TENANT
  -- =========================================================================
  SELECT * INTO v_existing_contact
  FROM public.df_wa_contacts
  WHERE tenant_id = NEW.tenant_id
    AND patient_id = NEW.id
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    -- Se o telefone mudou
    IF v_existing_contact.whatsapp_number <> v_normalized_phone THEN
      -- Verificar se o novo número já é utilizado por OUTRO contato no mesmo tenant (conflito)
      IF EXISTS (
        SELECT 1 FROM public.df_wa_contacts
        WHERE tenant_id = NEW.tenant_id
          AND whatsapp_number = v_normalized_phone
          AND id <> v_existing_contact.id
      ) THEN
        RAISE WARNING 'Conflito de telefone: % já pertence a outro contato no tenant %', v_normalized_phone, NEW.tenant_id;
        RETURN NEW;
      END IF;

      UPDATE public.df_wa_contacts
      SET whatsapp_number = v_normalized_phone,
          name = COALESCE(NEW.name, name),
          updated_at = NOW()
      WHERE id = v_existing_contact.id;
    ELSE
      -- Telefone idêntico, apenas sincroniza nome se tiver mudado
      IF v_existing_contact.name <> NEW.name AND NEW.name IS NOT NULL THEN
        UPDATE public.df_wa_contacts
        SET name = NEW.name,
            updated_at = NOW()
        WHERE id = v_existing_contact.id;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- =========================================================================
  -- 5. CASO B: NÃO TEM PATIENT_ID, MAS EXISTE CONTATO COM O MESMO NÚMERO
  -- =========================================================================
  SELECT * INTO v_existing_contact
  FROM public.df_wa_contacts
  WHERE tenant_id = NEW.tenant_id
    AND whatsapp_number = v_normalized_phone
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_contact.patient_id IS NULL THEN
      -- Contato avulso no mesmo tenant: associa diretamente ao paciente
      UPDATE public.df_wa_contacts
      SET patient_id = NEW.id,
          name = COALESCE(NEW.name, name),
          updated_at = NOW()
      WHERE id = v_existing_contact.id;
    ELSE
      -- Número já está vinculado a outro paciente diferente (conflito)
      RAISE WARNING 'Conflito: número % já está vinculado ao paciente % no tenant %', v_normalized_phone, v_existing_contact.patient_id, NEW.tenant_id;
    END IF;

    RETURN NEW;
  END IF;

  -- =========================================================================
  -- 6. CASO C: NÃO EXISTE CONTATO -> CRIAÇÃO AUTOMÁTICA EM df_wa_contacts
  -- =========================================================================
  v_contact_id := 'ctc_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 5);

  INSERT INTO public.df_wa_contacts (
    id,
    tenant_id,
    patient_id,
    name,
    whatsapp_number,
    custom_fields,
    profile_pic_status,
    created_at,
    updated_at
  ) VALUES (
    v_contact_id,
    NEW.tenant_id,
    NEW.id,
    NEW.name,
    v_normalized_phone,
    '{}'::jsonb,
    'pending',
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
