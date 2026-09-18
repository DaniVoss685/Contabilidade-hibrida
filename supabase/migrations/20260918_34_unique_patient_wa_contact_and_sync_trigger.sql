-- Migration: 20260918_34_unique_patient_wa_contact_and_sync_trigger.sql
-- Description: Garante unicidade 1:1 entre paciente e contato de WhatsApp por tenant
--              e atualiza a trigger de sincronização para tratar troca de telefone e evitar colisões.

-- 1. Cria índice único parcial para garantir que 1 paciente só pode estar vinculado a 1 contato por tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_df_wa_contacts_tenant_patient
ON public.df_wa_contacts (tenant_id, patient_id)
WHERE (patient_id IS NOT NULL);

-- 2. Atualiza a função de trigger com proteção rigorosa para troca de telefone e unicidade
CREATE OR REPLACE FUNCTION public.fn_sync_df_patient_to_wa_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_clean_phone text;
  v_normalized_phone text;
  v_ddd text;
  v_local text;
  v_contact_id text;
  v_existing_contact record;
  v_target_contact record;
BEGIN
  -- 1. TRATAMENTO DE EXCLUSÃO (DELETE)
  IF (TG_OP = 'DELETE') THEN
    UPDATE public.df_wa_contacts
    SET patient_id = NULL,
        updated_at = NOW()
    WHERE patient_id = OLD.id 
      AND tenant_id = OLD.tenant_id;
    RETURN OLD;
  END IF;

  -- 2. PACIENTE SEM TELEFONE (OU TELEFONE EM BRANCO)
  IF NEW.phone IS NULL OR TRIM(NEW.phone) = '' THEN
    IF (TG_OP = 'UPDATE') THEN
      UPDATE public.df_wa_contacts
      SET patient_id = NULL,
          updated_at = NOW()
      WHERE patient_id = NEW.id
        AND tenant_id = NEW.tenant_id;
    END IF;
    RETURN NEW;
  END IF;

  -- 3. NORMALIZAÇÃO DO NÚMERO BRASILEIRO (NEW)
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
    RETURN NEW;
  END IF;

  -- 4. CASO UPDATE
  IF (TG_OP = 'UPDATE') THEN
    SELECT * INTO v_existing_contact
    FROM public.df_wa_contacts
    WHERE tenant_id = NEW.tenant_id
      AND patient_id = NEW.id
    ORDER BY created_at ASC
    LIMIT 1;

    IF FOUND THEN
      -- Se o telefone mudou
      IF v_existing_contact.whatsapp_number <> v_normalized_phone THEN
        -- Desvincula o contato antigo preservando histórico e conversas
        UPDATE public.df_wa_contacts
        SET patient_id = NULL,
            updated_at = NOW()
        WHERE id = v_existing_contact.id;

        -- Procura se já existe contato com o NOVO número (não-grupo)
        SELECT * INTO v_target_contact
        FROM public.df_wa_contacts
        WHERE tenant_id = NEW.tenant_id
          AND whatsapp_number = v_normalized_phone
          AND NOT (whatsapp_number LIKE '120363%' OR whatsapp_number LIKE '%-%')
        LIMIT 1;

        IF FOUND THEN
          IF v_target_contact.patient_id IS NULL THEN
            UPDATE public.df_wa_contacts
            SET patient_id = NEW.id,
                name = COALESCE(NEW.name, name),
                updated_at = NOW()
            WHERE id = v_target_contact.id;
          ELSE
            RAISE WARNING 'Conflito ao trocar telefone: novo número % já pertence ao paciente % no tenant %',
              v_normalized_phone, v_target_contact.patient_id, NEW.tenant_id;
          END IF;
        ELSE
          -- Cria novo contato para o novo número vinculado ao paciente
          v_contact_id := 'ctc_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 5);
          INSERT INTO public.df_wa_contacts (
            id, tenant_id, patient_id, name, whatsapp_number, custom_fields, profile_pic_status, created_at, updated_at
          ) VALUES (
            v_contact_id, NEW.tenant_id, NEW.id, NEW.name, v_normalized_phone, '{}'::jsonb, 'pending', NOW(), NOW()
          );
        END IF;

      ELSE
        -- Telefone não mudou; se o nome mudou, sincroniza nome no contato
        IF v_existing_contact.name <> NEW.name AND NEW.name IS NOT NULL THEN
          UPDATE public.df_wa_contacts
          SET name = NEW.name,
              updated_at = NOW()
          WHERE id = v_existing_contact.id;
        END IF;
      END IF;

      RETURN NEW;
    END IF;
  END IF;

  -- 5. CASO INSERT (OU UPDATE ONDE NÃO HAVIA CONTATO VINCULADO ANTES)
  SELECT * INTO v_target_contact
  FROM public.df_wa_contacts
  WHERE tenant_id = NEW.tenant_id
    AND whatsapp_number = v_normalized_phone
    AND NOT (whatsapp_number LIKE '120363%' OR whatsapp_number LIKE '%-%')
  LIMIT 1;

  IF FOUND THEN
    IF v_target_contact.patient_id IS NULL THEN
      UPDATE public.df_wa_contacts
      SET patient_id = NEW.id,
          name = COALESCE(NEW.name, name),
          updated_at = NOW()
      WHERE id = v_target_contact.id;
    ELSE
      RAISE WARNING 'Conflito: número % já está vinculado ao paciente % no tenant %',
        v_normalized_phone, v_target_contact.patient_id, NEW.tenant_id;
    END IF;
  ELSE
    -- Não existe contato: cria automaticamente em df_wa_contacts
    v_contact_id := 'ctc_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 5);
    INSERT INTO public.df_wa_contacts (
      id, tenant_id, patient_id, name, whatsapp_number, custom_fields, profile_pic_status, created_at, updated_at
    ) VALUES (
      v_contact_id, NEW.tenant_id, NEW.id, NEW.name, v_normalized_phone, '{}'::jsonb, 'pending', NOW(), NOW()
    );
  END IF;

  RETURN NEW;
END;
$function$;
