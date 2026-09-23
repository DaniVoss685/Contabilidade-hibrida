-- ==============================================================================
-- MIGRATION: VÍNCULO EXPLÍCITO GUARDIAN <-> PATIENT (quando o responsável
-- também é paciente cadastrado na clínica)
--
-- Caso de negócio: Maria é paciente da clínica E é responsável de João e
-- Ana. Hoje df_patient_guardians é uma entidade totalmente separada de
-- df_patients (auditado: nenhum vínculo canônico existia antes desta
-- migration — nem por FK, nem por convenção de id).
--
-- Regra de matching (NUNCA fraco): só vincula automaticamente por CPF válido
-- e ÚNICO dentro do tenant (mesmo CPF, mesmo tenant, exatamente 1 paciente
-- correspondente). Nome ou telefone iguais NUNCA bastam sozinhos — números
-- são compartilhados de propósito neste modelo (telefone da mãe usado pelos
-- filhos) e nomes podem colidir; usar qualquer um dos dois como critério de
-- vínculo geraria falso positivo. Sem CPF batendo com exatamente 1 paciente,
-- o guardian fica com linked_patient_id = NULL (não vinculado), nunca um
-- palpite.
-- ==============================================================================

ALTER TABLE public.df_patient_guardians
  ADD COLUMN IF NOT EXISTS linked_patient_id TEXT REFERENCES public.df_patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_df_patient_guardians_linked_patient
  ON public.df_patient_guardians (linked_patient_id)
  WHERE linked_patient_id IS NOT NULL;

COMMENT ON COLUMN public.df_patient_guardians.linked_patient_id IS
  'Preenchido automaticamente só quando guardian.cpf bate com exatamente 1 df_patients.cpf no mesmo tenant (ver fn_sync_guardian_linked_patient_by_cpf). NULL sempre que não houver certeza — nunca inferido por nome ou telefone.';

CREATE OR REPLACE FUNCTION public.fn_resolve_guardian_linked_patient(p_tenant_id text, p_cpf text)
RETURNS text
LANGUAGE sql STABLE
AS $function$
  SELECT CASE WHEN count(*) = 1 THEN min(id) ELSE NULL END
  FROM public.df_patients
  WHERE tenant_id = p_tenant_id
    AND cpf IS NOT NULL AND cpf <> ''
    AND cpf = p_cpf;
$function$;

-- Trigger 1: guardian criado/atualizado com CPF -> resolve o vínculo.
CREATE OR REPLACE FUNCTION public.fn_sync_guardian_linked_patient_on_guardian_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.cpf IS NOT NULL AND NEW.cpf <> '' THEN
    NEW.linked_patient_id := public.fn_resolve_guardian_linked_patient(NEW.tenant_id, NEW.cpf);
  ELSE
    NEW.linked_patient_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_guardian_linked_patient_on_guardian_write ON public.df_patient_guardians;
CREATE TRIGGER trg_sync_guardian_linked_patient_on_guardian_write
BEFORE INSERT OR UPDATE OF cpf ON public.df_patient_guardians
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_guardian_linked_patient_on_guardian_write();

-- Trigger 2: paciente cadastrado/editado com CPF DEPOIS do guardian já
-- existir -> resolve o vínculo do lado do guardian também (evita ficar
-- órfão só porque a ordem de cadastro foi paciente depois do responsável).
CREATE OR REPLACE FUNCTION public.fn_sync_guardian_linked_patient_on_patient_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.cpf IS DISTINCT FROM OLD.cpf))
     AND NEW.cpf IS NOT NULL AND NEW.cpf <> '' THEN
    UPDATE public.df_patient_guardians
    SET linked_patient_id = public.fn_resolve_guardian_linked_patient(tenant_id, cpf)
    WHERE tenant_id = NEW.tenant_id
      AND cpf = NEW.cpf;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_guardian_linked_patient_on_patient_write ON public.df_patients;
CREATE TRIGGER trg_sync_guardian_linked_patient_on_patient_write
AFTER INSERT OR UPDATE OF cpf ON public.df_patients
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_guardian_linked_patient_on_patient_write();

NOTIFY pgrst, 'reload schema';
