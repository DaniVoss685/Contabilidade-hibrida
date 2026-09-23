-- ==============================================================================
-- MIGRATION: CORRIGE TRIGGERS DE SINCRONIA DE TELEFONE DO RESPONSÁVEL
--
-- Bug encontrado ao validar com dados sintéticos em tenant de teste: as duas
-- triggers criadas em 20260922200000 tentavam gravar
-- df_patients.updated_at = now(), mas df_patients NÃO TEM coluna
-- updated_at (confirmado: só id, tenant_id, org_id, name, cpf, email, phone,
-- birth_date, notes, created_at, allergies, conditions, medications,
-- clinical_notes, legacy_metadata, phone_owner — ver "Current state" no
-- CLAUDE.md e o schema real). Toda UPDATE em df_patients feita por essas
-- triggers falhava com 42703 "column updated_at does not exist".
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_guardian_phone_to_patients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.phone IS DISTINCT FROM OLD.phone) THEN
    UPDATE public.df_patients p
    SET phone = COALESCE(NEW.phone, '')
    FROM public.df_patient_guardian_links l
    WHERE l.guardian_id = NEW.id
      AND l.is_primary = true
      AND l.tenant_id = NEW.tenant_id
      AND p.id = l.patient_id
      AND p.tenant_id = NEW.tenant_id
      AND p.phone_owner = 'RESPONSIBLE'
      AND p.phone IS DISTINCT FROM COALESCE(NEW.phone, '');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_patient_link_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_guardian_phone text;
BEGIN
  IF NEW.is_primary = true THEN
    SELECT phone INTO v_guardian_phone
    FROM public.df_patient_guardians
    WHERE id = NEW.guardian_id AND tenant_id = NEW.tenant_id;

    UPDATE public.df_patients
    SET phone = COALESCE(v_guardian_phone, '')
    WHERE id = NEW.patient_id
      AND tenant_id = NEW.tenant_id
      AND phone_owner = 'RESPONSIBLE'
      AND phone IS DISTINCT FROM COALESCE(v_guardian_phone, '');
  END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
