-- ============================================================================
-- MIGRATION: 20260918_28_patient_to_wa_contact_trigger.sql
-- DESCRIÇÃO: Sincronização automática entre df_patients e df_wa_contacts
-- REGRAS:
-- 1. Criação/Edição de paciente com WhatsApp cria/vincula contato automaticamente
-- 2. Não cria contato vazio se paciente não tiver telefone
-- 3. Atualização de telefone atualiza o contato vinculado sem duplicar
-- 4. Detecção de conflito se novo número já pertencer a outro contato no mesmo tenant
-- 5. Exclusão de paciente preserva df_wa_contacts e histórico, definindo patient_id = NULL
-- 6. Isolamento estrito por tenant_id
-- ============================================================================

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

-- Criar trigger após exclusão de versão prévia
DROP TRIGGER IF EXISTS trg_sync_df_patient_to_wa_contact ON public.df_patients;

CREATE TRIGGER trg_sync_df_patient_to_wa_contact
AFTER INSERT OR UPDATE OR DELETE ON public.df_patients
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_df_patient_to_wa_contact();
