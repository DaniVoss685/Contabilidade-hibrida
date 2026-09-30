-- ==============================================================================
-- MIGRATION: REVISÃO CADASTRAL DE PACIENTES + STATUS DO MAPA LEGADO + EXCLUSÃO SEGURA
--
-- 1. df_patient_review_issues: fila de PENDÊNCIAS CADASTRAIS (qualidade de dado /
--    identidade), tenant-scoped. É uma estrutura PRÓPRIA — nunca se usa alergia/
--    condição/medicação/alerta clínico para problema cadastral.
--    - Idempotência: índice único (tenant, paciente, origem, dedupe_key); reexecutar
--      a migração/importação nunca duplica a mesma pendência.
--    - Histórico preservado: pendência resolvida/revisada NÃO é apagada (status,
--      resolved_at, resolved_by). Campos de identidade são imutáveis (trigger).
--    - Escrita de criação só pela Edge Function (service_role); usuários da clínica
--      só leem e atualizam o STATUS (RLS + trigger de guarda).
-- 2. df_legacy_import_map: entity_type ganha 'professional' (mapeamento definitivo de
--    dentista legado -> profissional atual) e o mapa ganha status (ACTIVE | DELETED |
--    IGNORED | REJECTED) + motivo/quem/quando + details jsonb. Um paciente importado
--    excluído mantém a linha do mapa com status DELETED: reexecutar a migração NÃO o
--    recria e o rastro de que aquele registro legado foi revisado é preservado.
-- 3. dental_patient_delete_check / dental_delete_patient_safe: exclusão segura.
--    Verdade no servidor: recusa quando há venda/recebível/agenda/prontuário/documento/
--    antes-depois (referências SEM foreign key, que um DELETE simples deixaria
--    pendentes); só vínculos de WhatsApp e responsável são desfeitos. Grava auditoria
--    com o registro removido, marca o mapa legado como DELETED e encerra pendências.
--
-- Aditiva (IF NOT EXISTS / CREATE OR REPLACE). Nenhum dado existente é alterado.
-- ==============================================================================

-- 1. Mapa legado: novo entity_type + status ---------------------------------------
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.df_legacy_import_map'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%entity_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.df_legacy_import_map DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.df_legacy_import_map
  ADD CONSTRAINT df_legacy_import_map_entity_type_check
  CHECK (entity_type IN ('patient', 'clinical_record', 'professional'));

ALTER TABLE public.df_legacy_import_map
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_by TEXT,
  ADD COLUMN IF NOT EXISTS details JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.df_legacy_import_map'::regclass AND conname = 'df_legacy_import_map_status_check'
  ) THEN
    ALTER TABLE public.df_legacy_import_map
      ADD CONSTRAINT df_legacy_import_map_status_check
      CHECK (status IN ('ACTIVE', 'DELETED', 'IGNORED', 'REJECTED'));
  END IF;
END $$;

-- 2. Pendências cadastrais ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.df_patient_review_issues (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'LEGACY_IMPORT',
  issue_code TEXT NOT NULL,
  field_name TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
  message TEXT NOT NULL,
  legacy_value TEXT,
  related_patient_id TEXT,
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'REVIEWED', 'DISMISSED')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_note TEXT,
  import_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_df_patient_review_issues_dedupe
  ON public.df_patient_review_issues (tenant_id, patient_id, source, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_df_patient_review_issues_tenant_status
  ON public.df_patient_review_issues (tenant_id, status, patient_id);

CREATE INDEX IF NOT EXISTS idx_df_patient_review_issues_patient
  ON public.df_patient_review_issues (tenant_id, patient_id);

ALTER TABLE public.df_patient_review_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_patient_review_issues_select_policy ON public.df_patient_review_issues;
CREATE POLICY df_patient_review_issues_select_policy ON public.df_patient_review_issues
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

DROP POLICY IF EXISTS df_patient_review_issues_update_policy ON public.df_patient_review_issues;
CREATE POLICY df_patient_review_issues_update_policy ON public.df_patient_review_issues
  FOR UPDATE TO authenticated
  USING (public.is_dental_tenant_member(tenant_id))
  WITH CHECK (public.is_dental_tenant_member(tenant_id));

-- Sem policy de INSERT/DELETE para authenticated: criação só pela Edge Function
-- (service_role); nada é apagado — o histórico da pendência é preservado.

-- Guarda: só status/resolução mudam; identidade da pendência é imutável; uma
-- pendência resolvida/revisada não volta a OPEN (o histórico não é reescrito).
CREATE OR REPLACE FUNCTION public.fn_guard_patient_review_issue_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.issue_code IS DISTINCT FROM OLD.issue_code
     OR NEW.field_name IS DISTINCT FROM OLD.field_name
     OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
     OR NEW.severity IS DISTINCT FROM OLD.severity
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.legacy_value IS DISTINCT FROM OLD.legacy_value
     OR NEW.related_patient_id IS DISTINCT FROM OLD.related_patient_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Campos de identidade da pendência cadastral são imutáveis';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'OPEN' THEN
      RAISE EXCEPTION 'Pendência já encerrada (%): o histórico não é reaberto nem reescrito', OLD.status;
    END IF;
    NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_patient_review_issue_update ON public.df_patient_review_issues;
CREATE TRIGGER trg_guard_patient_review_issue_update
  BEFORE UPDATE ON public.df_patient_review_issues
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_patient_review_issue_update();

-- 3. Exclusão segura de paciente ---------------------------------------------------
-- Referências que IMPEDEM a exclusão (dado operacional real; várias são "soft refs" sem
-- foreign key — um DELETE simples as deixaria apontando para um paciente inexistente) e
-- vínculos que são apenas DESFEITOS (WhatsApp/responsável).
CREATE OR REPLACE FUNCTION public.fn_dental_patient_refs(p_tenant_id text, p_patient_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blocking jsonb := '{}'::jsonb;
  v_detach jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM df_sales WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;
  IF v_n > 0 THEN v_blocking := v_blocking || jsonb_build_object('sales', v_n); END IF;
  SELECT count(*) INTO v_n FROM df_appointments WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;
  IF v_n > 0 THEN v_blocking := v_blocking || jsonb_build_object('appointments', v_n); END IF;
  SELECT count(*) INTO v_n FROM df_clinical_records WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;
  IF v_n > 0 THEN v_blocking := v_blocking || jsonb_build_object('clinical_records', v_n); END IF;
  SELECT count(*) INTO v_n FROM df_clinical_attachments WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;
  IF v_n > 0 THEN v_blocking := v_blocking || jsonb_build_object('clinical_attachments', v_n); END IF;
  SELECT count(*) INTO v_n FROM df_clinical_before_after_pairs WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;
  IF v_n > 0 THEN v_blocking := v_blocking || jsonb_build_object('before_after_pairs', v_n); END IF;

  SELECT count(*) INTO v_n FROM df_patient_guardian_links WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;
  IF v_n > 0 THEN v_detach := v_detach || jsonb_build_object('guardian_links', v_n); END IF;
  SELECT count(*) INTO v_n FROM df_patient_guardians WHERE tenant_id = p_tenant_id AND linked_patient_id = p_patient_id;
  IF v_n > 0 THEN v_detach := v_detach || jsonb_build_object('guardian_is_this_patient', v_n); END IF;
  SELECT count(*) INTO v_n FROM df_wa_contact_patients WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id;
  IF v_n > 0 THEN v_detach := v_detach || jsonb_build_object('whatsapp_links', v_n); END IF;

  RETURN jsonb_build_object('blocking', v_blocking, 'detach', v_detach);
END $$;

CREATE OR REPLACE FUNCTION public.dental_patient_delete_check(p_patient_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p record; v_refs jsonb;
BEGIN
  SELECT id, tenant_id INTO v_p FROM df_patients WHERE id = p_patient_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Paciente não encontrado.');
  END IF;
  IF NOT public.is_dental_tenant_member(v_p.tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Sem acesso a esta clínica.');
  END IF;
  v_refs := public.fn_dental_patient_refs(v_p.tenant_id, v_p.id);
  RETURN jsonb_build_object(
    'ok', true,
    'canDelete', (v_refs->'blocking') = '{}'::jsonb,
    'blocking', v_refs->'blocking',
    'detach', v_refs->'detach'
  );
END $$;

CREATE OR REPLACE FUNCTION public.dental_delete_patient_safe(p_patient_id text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p record;
  v_refs jsonb;
  v_user record;
  v_uid text := auth.uid()::text;
  v_map_n int := 0;
  v_issue_n int := 0;
BEGIN
  SELECT * INTO v_p FROM df_patients WHERE id = p_patient_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Paciente não encontrado.');
  END IF;
  IF NOT public.is_dental_tenant_member(v_p.tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Sem acesso a esta clínica.');
  END IF;

  v_refs := public.fn_dental_patient_refs(v_p.tenant_id, v_p.id);
  IF (v_refs->'blocking') <> '{}'::jsonb THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'HAS_HISTORY',
      'message', 'Este paciente possui histórico e não pode ser excluído diretamente.',
      'blocking', v_refs->'blocking'
    );
  END IF;

  SELECT id, name INTO v_user FROM df_users WHERE auth_user_id::text = v_uid ORDER BY is_primary DESC NULLS LAST LIMIT 1;

  -- Auditoria ANTES de remover (guarda o registro sem o blob legacy_metadata, que fica no mapa/pendências).
  INSERT INTO df_audit_logs (id, tenant_id, timestamp, user_id, user_name, action, entity_type, entity_id, details)
  VALUES (
    'log_' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '_delpat',
    v_p.tenant_id, now(),
    coalesce(v_user.id, v_uid, 'unknown'), coalesce(v_user.name, 'Usuário'),
    'PACIENTE_EXCLUIDO', 'PATIENT', v_p.id,
    'Paciente excluído (sem histórico operacional). Motivo: ' || coalesce(nullif(trim(p_reason), ''), 'não informado') ||
    '. Vínculos desfeitos: ' || (v_refs->'detach')::text ||
    '. Registro removido: ' || (to_jsonb(v_p) - 'legacy_metadata')::text
  );

  -- Mapa legado: o rastro de que o registro foi revisado permanece (não é recriado por nova importação).
  UPDATE df_legacy_import_map
     SET status = 'DELETED', status_reason = nullif(trim(coalesce(p_reason, '')), ''),
         status_at = now(), status_by = coalesce(v_user.name, v_uid)
   WHERE tenant_id = v_p.tenant_id AND entity_type = 'patient' AND target_id = v_p.id;
  GET DIAGNOSTICS v_map_n = ROW_COUNT;

  -- Pendências abertas deste paciente são encerradas (histórico preservado).
  UPDATE df_patient_review_issues
     SET status = 'DISMISSED', resolved_at = now(), resolved_by = coalesce(v_user.name, v_uid),
         resolution_note = 'Paciente excluído'
   WHERE tenant_id = v_p.tenant_id AND patient_id = v_p.id AND status = 'OPEN';
  GET DIAGNOSTICS v_issue_n = ROW_COUNT;

  DELETE FROM df_patients WHERE id = v_p.id AND tenant_id = v_p.tenant_id;

  RETURN jsonb_build_object('ok', true, 'detached', v_refs->'detach', 'legacyMapMarked', v_map_n, 'issuesDismissed', v_issue_n);
END $$;

REVOKE ALL ON FUNCTION public.fn_dental_patient_refs(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dental_patient_delete_check(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dental_delete_patient_safe(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dental_patient_delete_check(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dental_delete_patient_safe(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
