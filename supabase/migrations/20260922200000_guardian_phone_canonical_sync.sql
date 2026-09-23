-- ==============================================================================
-- MIGRATION: TELEFONE DO RESPONSÁVEL — FONTE CANÔNICA + SINCRONIZAÇÃO
--
-- Rodada de hardening sobre 20260922190000_patient_guardians_and_shared_phone.sql.
-- Fonte canônica quando df_patients.phone_owner = 'RESPONSIBLE':
-- df_patient_guardians.phone. df_patients.phone continua existindo (é lido
-- por TODO o código legado — reminders, webhook, busca, UI — sem exigir
-- nenhuma alteração nesses pontos), mas passa a ser um CACHE que o banco
-- mantém sincronizado automaticamente via trigger, nunca ficando
-- desatualizado silenciosamente (Fase 2/3/4 do pedido de hardening).
--
-- Dois gatilhos, cada um cobrindo um caminho de escrita diferente:
-- 1. fn_sync_guardian_phone_to_patients: guardian troca de telefone (Maria
--    999 -> 888) -> propaga para TODOS os pacientes que têm essa guardian
--    como responsável PRIMÁRIO e phone_owner = 'RESPONSIBLE'. A UPDATE em
--    df_patients dispara, em cascata, a trigger já existente
--    fn_sync_df_patient_to_wa_contact (20260918_34), que relinka o contato
--    WhatsApp automaticamente para o novo número — nenhum reminder continua
--    indo para o número antigo.
-- 2. fn_sync_patient_link_phone: um vínculo passa a ser PRIMÁRIO (troca de
--    responsável: João sai de Maria/999 e entra em Carlos/777, ou
--    cadastro inicial) -> puxa o telefone da nova guardian para o paciente,
--    também disparando a trigger de WhatsApp em cascata.
--
-- Sem duplicar lógica em componentes TS: a fonte de verdade da sincronização
-- é só o banco, então qualquer caminho de escrita (UI atual, importador
-- futuro da Odonto Minas, SQL direto) fica automaticamente correto.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_guardian_phone_to_patients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.phone IS DISTINCT FROM OLD.phone) THEN
    UPDATE public.df_patients p
    SET phone = COALESCE(NEW.phone, ''), updated_at = now()
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

DROP TRIGGER IF EXISTS trg_sync_guardian_phone_to_patients ON public.df_patient_guardians;
CREATE TRIGGER trg_sync_guardian_phone_to_patients
AFTER UPDATE ON public.df_patient_guardians
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_guardian_phone_to_patients();

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
    SET phone = COALESCE(v_guardian_phone, ''), updated_at = now()
    WHERE id = NEW.patient_id
      AND tenant_id = NEW.tenant_id
      AND phone_owner = 'RESPONSIBLE'
      AND phone IS DISTINCT FROM COALESCE(v_guardian_phone, '');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_patient_link_phone ON public.df_patient_guardian_links;
CREATE TRIGGER trg_sync_patient_link_phone
AFTER INSERT OR UPDATE ON public.df_patient_guardian_links
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_patient_link_phone();

NOTIFY pgrst, 'reload schema';
