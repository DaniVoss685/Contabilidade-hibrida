-- ==============================================================================
-- MIGRATION: CORRIGE VÍNCULO SECUNDÁRIO ÓRFÃO AO TROCAR TELEFONE
--
-- Bug encontrado durante o hardening (rodada de "responsável + telefone
-- compartilhado"): quando o telefone de um paciente muda (ex.: guardian troca
-- de número e a trigger de sincronização de telefone propaga o novo número
-- para os pacientes dependentes), a trigger fn_sync_df_patient_to_wa_contact
-- só removia o vínculo do contato ANTIGO quando o paciente era o PRIMÁRIO
-- daquele contato (via df_wa_contacts.patient_id). Um paciente que era
-- apenas SECUNDÁRIO no contato antigo (df_wa_contact_patients, is_primary =
-- false — ex.: o segundo filho de uma mãe) ficava com um vínculo órfão
-- apontando para o número antigo, além de ganhar o vínculo correto no número
-- novo — duplicando a relação em vez de migrá-la.
--
-- Correção: no início do fluxo de INSERT/UPDATE com telefone válido, remove
-- QUALQUER vínculo do paciente em df_wa_contact_patients que aponte para um
-- contato com número DIFERENTE do novo número normalizado — cobre tanto o
-- caso primário (já tratado adiante) quanto o secundário (o gap).
-- ==============================================================================

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
      DELETE FROM public.df_wa_contact_patients
      WHERE patient_id = NEW.id AND tenant_id = NEW.tenant_id;
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

  -- 3b. CORREÇÃO: remove qualquer vínculo (primário OU secundário) deste
  -- paciente em df_wa_contact_patients que aponte para um contato com número
  -- DIFERENTE do novo número normalizado. Sem isso, um paciente que era só
  -- SECUNDÁRIO no contato antigo (ex.: segundo filho) ficava com vínculo
  -- órfão lá, além de ganhar o vínculo certo no número novo.
  IF (TG_OP = 'UPDATE') THEN
    DELETE FROM public.df_wa_contact_patients wcp
    USING public.df_wa_contacts c
    WHERE wcp.contact_id = c.id
      AND wcp.patient_id = NEW.id
      AND wcp.tenant_id = NEW.tenant_id
      AND c.whatsapp_number <> v_normalized_phone;
  END IF;

  -- 4. CASO UPDATE (paciente já tinha contato primário vinculado)
  IF (TG_OP = 'UPDATE') THEN
    SELECT * INTO v_existing_contact
    FROM public.df_wa_contacts
    WHERE tenant_id = NEW.tenant_id
      AND patient_id = NEW.id
    ORDER BY created_at ASC
    LIMIT 1;

    IF FOUND THEN
      IF v_existing_contact.whatsapp_number <> v_normalized_phone THEN
        -- Telefone mudou: desvincula o contato antigo (primário e secundário)
        UPDATE public.df_wa_contacts
        SET patient_id = NULL, updated_at = NOW()
        WHERE id = v_existing_contact.id;

        DELETE FROM public.df_wa_contact_patients
        WHERE contact_id = v_existing_contact.id AND patient_id = NEW.id;

        SELECT * INTO v_target_contact
        FROM public.df_wa_contacts
        WHERE tenant_id = NEW.tenant_id
          AND whatsapp_number = v_normalized_phone
          AND NOT (whatsapp_number LIKE '120363%' OR whatsapp_number LIKE '%-%')
        LIMIT 1;

        IF FOUND THEN
          IF v_target_contact.patient_id IS NULL THEN
            UPDATE public.df_wa_contacts
            SET patient_id = NEW.id, name = COALESCE(NEW.name, name), updated_at = NOW()
            WHERE id = v_target_contact.id;
            INSERT INTO public.df_wa_contact_patients (tenant_id, contact_id, patient_id, is_primary)
            VALUES (NEW.tenant_id, v_target_contact.id, NEW.id, true)
            ON CONFLICT (contact_id, patient_id) DO UPDATE SET is_primary = true;
          ELSE
            INSERT INTO public.df_wa_contact_patients (tenant_id, contact_id, patient_id, is_primary)
            VALUES (NEW.tenant_id, v_target_contact.id, NEW.id, false)
            ON CONFLICT (contact_id, patient_id) DO NOTHING;
          END IF;
        ELSE
          v_contact_id := 'ctc_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 5);
          INSERT INTO public.df_wa_contacts (
            id, tenant_id, patient_id, name, whatsapp_number, custom_fields, profile_pic_status, created_at, updated_at
          ) VALUES (
            v_contact_id, NEW.tenant_id, NEW.id, NEW.name, v_normalized_phone, '{}'::jsonb, 'pending', NOW(), NOW()
          );
          INSERT INTO public.df_wa_contact_patients (tenant_id, contact_id, patient_id, is_primary)
          VALUES (NEW.tenant_id, v_contact_id, NEW.id, true);
        END IF;
      ELSE
        IF v_existing_contact.name <> NEW.name AND NEW.name IS NOT NULL THEN
          UPDATE public.df_wa_contacts
          SET name = NEW.name, updated_at = NOW()
          WHERE id = v_existing_contact.id;
        END IF;
      END IF;

      RETURN NEW;
    END IF;
  END IF;

  -- 5. CASO INSERT (ou UPDATE sem contato primário prévio — inclui paciente
  -- que só tinha vínculo SECUNDÁRIO e cujo telefone mudou, já limpo no passo 3b)
  SELECT * INTO v_target_contact
  FROM public.df_wa_contacts
  WHERE tenant_id = NEW.tenant_id
    AND whatsapp_number = v_normalized_phone
    AND NOT (whatsapp_number LIKE '120363%' OR whatsapp_number LIKE '%-%')
  LIMIT 1;

  IF FOUND THEN
    IF v_target_contact.patient_id IS NULL THEN
      UPDATE public.df_wa_contacts
      SET patient_id = NEW.id, name = COALESCE(NEW.name, name), updated_at = NOW()
      WHERE id = v_target_contact.id;
      INSERT INTO public.df_wa_contact_patients (tenant_id, contact_id, patient_id, is_primary)
      VALUES (NEW.tenant_id, v_target_contact.id, NEW.id, true)
      ON CONFLICT (contact_id, patient_id) DO UPDATE SET is_primary = true;
    ELSE
      INSERT INTO public.df_wa_contact_patients (tenant_id, contact_id, patient_id, is_primary)
      VALUES (NEW.tenant_id, v_target_contact.id, NEW.id, false)
      ON CONFLICT (contact_id, patient_id) DO NOTHING;
    END IF;
  ELSE
    v_contact_id := 'ctc_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 5);
    INSERT INTO public.df_wa_contacts (
      id, tenant_id, patient_id, name, whatsapp_number, custom_fields, profile_pic_status, created_at, updated_at
    ) VALUES (
      v_contact_id, NEW.tenant_id, NEW.id, NEW.name, v_normalized_phone, '{}'::jsonb, 'pending', NOW(), NOW()
    );
    INSERT INTO public.df_wa_contact_patients (tenant_id, contact_id, patient_id, is_primary)
    VALUES (NEW.tenant_id, v_contact_id, NEW.id, true);
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
