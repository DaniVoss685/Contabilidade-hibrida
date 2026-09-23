-- ==============================================================================
-- MIGRATION: RESPONSÁVEL (GUARDIAN) + TELEFONE COMPARTILHADO ENTRE PACIENTES
--
-- Caso de negócio: hoje telefone é tratado quase como identidade única do
-- paciente (bloqueio client-side em PatientModal.tsx via
-- DentalWhatsAppService.syncPatientToContact dry-run, e a trigger
-- fn_sync_df_patient_to_wa_contact só linka o PRIMEIRO paciente a um número e
-- gera RAISE WARNING silencioso para os demais). Isso impede o caso real de
-- mãe + filhos usando o mesmo WhatsApp.
--
-- Esta migration NÃO remove nenhuma constraint existente (não havia nenhuma
-- UNIQUE em df_patients.phone, e uq_df_wa_contacts_tenant_number /
-- uq_df_wa_contacts_tenant_patient continuam garantindo que um contato
-- WhatsApp é único por número e que a referência PRIMÁRIA patient_id
-- continua 1:1 — compatibilidade retroativa total com todo o código que já
-- lê df_wa_contacts.patient_id diretamente).
--
-- O que muda:
-- 1. df_patient_guardians + df_patient_guardian_links: entidade responsável,
--    reutilizável entre irmãos, com telefone/CPF/e-mail próprios.
-- 2. df_patients.phone_owner: contexto do telefone do paciente (PATIENT ou
--    RESPONSIBLE) — nunca muda a coluna phone em si.
-- 3. df_wa_contact_patients: relação many-to-many segura entre um contato
--    WhatsApp único e N pacientes (mãe + filhos no mesmo número). A trigger
--    de sync passa a inserir um vínculo SECUNDÁRIO aqui em vez de apenas
--    emitir RAISE WARNING quando o número já pertence a outro paciente.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RESPONSÁVEL / GUARDIAN
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.df_patient_guardians (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_df_patient_guardians_tenant
  ON public.df_patient_guardians (tenant_id);

CREATE INDEX IF NOT EXISTS idx_df_patient_guardians_tenant_phone
  ON public.df_patient_guardians (tenant_id, phone);

-- CPF do responsável, quando informado, não se repete no tenant (permite
-- reaproveitar o mesmo responsável entre irmãos por CPF).
CREATE UNIQUE INDEX IF NOT EXISTS uq_df_patient_guardians_tenant_cpf
  ON public.df_patient_guardians (tenant_id, cpf)
  WHERE (cpf IS NOT NULL AND cpf <> '');

ALTER TABLE public.df_patient_guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_patient_guardians_all_policy ON public.df_patient_guardians;
CREATE POLICY df_patient_guardians_all_policy ON public.df_patient_guardians
  FOR ALL TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- ------------------------------------------------------------------------------
-- 2. VÍNCULO RESPONSÁVEL -> PACIENTES (N:N; mesma responsável para vários filhos)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.df_patient_guardian_links (
  tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES public.df_patients(id) ON DELETE CASCADE,
  guardian_id TEXT NOT NULL REFERENCES public.df_patient_guardians(id) ON DELETE CASCADE,
  relationship_type TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, guardian_id)
);

CREATE INDEX IF NOT EXISTS idx_df_patient_guardian_links_guardian
  ON public.df_patient_guardian_links (guardian_id);

CREATE INDEX IF NOT EXISTS idx_df_patient_guardian_links_tenant
  ON public.df_patient_guardian_links (tenant_id);

-- Um paciente tem no máximo 1 responsável PRIMÁRIO (o que aparece no
-- formulário / é usado para o telefone). Pode ter outros não-primários no
-- futuro (ex.: pai e mãe) sem violar esta regra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_df_patient_guardian_links_primary
  ON public.df_patient_guardian_links (patient_id)
  WHERE (is_primary = true);

ALTER TABLE public.df_patient_guardian_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_patient_guardian_links_all_policy ON public.df_patient_guardian_links;
CREATE POLICY df_patient_guardian_links_all_policy ON public.df_patient_guardian_links
  FOR ALL TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- ------------------------------------------------------------------------------
-- 3. CONTEXTO DO TELEFONE DO PACIENTE (paciente vs. responsável)
-- ------------------------------------------------------------------------------

ALTER TABLE public.df_patients
  ADD COLUMN IF NOT EXISTS phone_owner TEXT NOT NULL DEFAULT 'PATIENT'
  CHECK (phone_owner IN ('PATIENT', 'RESPONSIBLE'));

COMMENT ON COLUMN public.df_patients.phone_owner IS
  'Contexto do telefone em df_patients.phone: PATIENT (telefone do próprio paciente) ou RESPONSIBLE (telefone pertence a um responsável, ver df_patient_guardian_links). Telefone repetido entre pacientes é esperado e válido (irmãos usando o telefone da mãe).';

-- ------------------------------------------------------------------------------
-- 4. CONTATO WHATSAPP <-> N PACIENTES (many-to-many)
--
-- df_wa_contacts.patient_id continua sendo a referência PRIMÁRIA/legada
-- (1 contato -> no máximo 1 patient_id primário, preservando 100% do código
-- existente que lê contact.patient_id diretamente: reminders, webhook,
-- attach-document, UI). Esta tabela nova é o relacionamento completo,
-- incluindo o vínculo primário espelhado (is_primary = true) e os vínculos
-- secundários (irmãos que compartilham o mesmo número).
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.df_wa_contact_patients (
  tenant_id TEXT NOT NULL REFERENCES public.df_tenants(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES public.df_wa_contacts(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES public.df_patients(id) ON DELETE CASCADE,
  relationship_type TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_df_wa_contact_patients_patient
  ON public.df_wa_contact_patients (patient_id);

CREATE INDEX IF NOT EXISTS idx_df_wa_contact_patients_tenant
  ON public.df_wa_contact_patients (tenant_id);

-- No máximo um vínculo primário por contato (espelha df_wa_contacts.patient_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_df_wa_contact_patients_primary
  ON public.df_wa_contact_patients (contact_id)
  WHERE (is_primary = true);

ALTER TABLE public.df_wa_contact_patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_wa_contact_patients_all_policy ON public.df_wa_contact_patients;
CREATE POLICY df_wa_contact_patients_all_policy ON public.df_wa_contact_patients
  FOR ALL TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- Backfill: todo vínculo patient_id já existente em df_wa_contacts vira o
-- vínculo primário em df_wa_contact_patients. Compatibilidade total com
-- pacientes/contatos já existentes (Fase 7 do pedido).
INSERT INTO public.df_wa_contact_patients (tenant_id, contact_id, patient_id, is_primary, created_at)
SELECT c.tenant_id, c.id, c.patient_id, true, c.created_at
FROM public.df_wa_contacts c
WHERE c.patient_id IS NOT NULL
ON CONFLICT (contact_id, patient_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. TRIGGER DE SYNC: em vez de RAISE WARNING e abandonar o paciente sem
--    contato quando o número já pertence a outro paciente, cria o vínculo
--    SECUNDÁRIO em df_wa_contact_patients (não mexe no patient_id primário
--    do contato, não duplica df_wa_contacts, não quebra a unique de número).
-- ------------------------------------------------------------------------------

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
    -- df_wa_contact_patients já cai em cascata via FK ON DELETE CASCADE (patient_id)
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
            -- Número já tem outro paciente primário: vincula este como SECUNDÁRIO
            -- (telefone compartilhado — irmãos usando o número da mãe).
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

  -- 5. CASO INSERT (ou UPDATE sem contato primário prévio)
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
      -- Número já pertence a outro paciente (ex.: filho cadastrado depois da
      -- mãe): vincula este paciente como SECUNDÁRIO do mesmo contato, sem
      -- duplicar df_wa_contacts e sem bloquear o cadastro.
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
