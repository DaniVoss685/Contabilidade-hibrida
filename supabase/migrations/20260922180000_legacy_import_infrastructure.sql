-- ==============================================================================
-- MIGRATION: INFRAESTRUTURA DE IMPORTAÇÃO DE SISTEMA LEGADO (MIGRAÇÃO DE CLÍNICA)
--
-- Duas tabelas novas, exclusivas do domínio Dental Finance (df_*):
--
-- df_legacy_import_sessions: uma sessão = um dry-run + import de um par de
-- arquivos (Clientes/Prontuarios) para UM tenant alvo, travado no momento da
-- criação. Só a Edge Function dental-legacy-patient-import (service_role)
-- pode criar/alterar sessões — por isso não há policy de INSERT/UPDATE para
-- authenticated, apenas SELECT (auditoria/consulta de status pelo cliente).
--
-- df_legacy_import_map: idempotência real em banco. Chave única
-- (tenant_id, source_system, entity_type, legacy_id) garante que reimportar
-- o mesmo arquivo no mesmo tenant nunca duplica paciente/procedimento, e que
-- o mesmo legacy_id em OUTRO tenant nunca colide (a deduplicação é sempre
-- escopada por tenant).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.df_legacy_import_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  target_tenant_name TEXT,
  source_system TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRY_RUN_PENDING'
    CHECK (status IN ('DRY_RUN_PENDING', 'DRY_RUN_COMPLETE', 'IMPORT_IN_PROGRESS', 'IMPORT_COMPLETE', 'INVALIDATED')),
  clients_file_name TEXT,
  clients_file_checksum TEXT,
  records_file_name TEXT,
  records_file_checksum TEXT,
  dry_run_summary JSONB,
  professional_mapping JSONB,
  procedure_mapping JSONB,
  created_by TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_df_legacy_import_sessions_tenant
  ON public.df_legacy_import_sessions (tenant_id, created_at DESC);

ALTER TABLE public.df_legacy_import_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_legacy_import_sessions_select_policy ON public.df_legacy_import_sessions;
CREATE POLICY df_legacy_import_sessions_select_policy ON public.df_legacy_import_sessions
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: escrita é exclusiva
-- da Edge Function (service_role, que ignora RLS por padrão), reforçando que
-- o tenant_id de uma sessão é imutável e nunca decidido pelo client.

CREATE TABLE IF NOT EXISTS public.df_legacy_import_map (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('patient', 'clinical_record')),
  legacy_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  import_session_id TEXT REFERENCES public.df_legacy_import_sessions(id),
  checksum TEXT,
  created_by TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_df_legacy_import_map_key
  ON public.df_legacy_import_map (tenant_id, source_system, entity_type, legacy_id);

CREATE INDEX IF NOT EXISTS idx_df_legacy_import_map_target
  ON public.df_legacy_import_map (tenant_id, entity_type, target_id);

ALTER TABLE public.df_legacy_import_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS df_legacy_import_map_select_policy ON public.df_legacy_import_map;
CREATE POLICY df_legacy_import_map_select_policy ON public.df_legacy_import_map
  FOR SELECT TO authenticated
  USING (public.is_dental_tenant_member(tenant_id));

NOTIFY pgrst, 'reload schema';
