-- ==============================================================================
-- MIGRATION: MAPA LEGADO COM SEGUNDA CHAVE + AUDITORIA DE COMMIT DA SESSÃO
--
-- 1. df_legacy_import_map.legacy_secondary_id: a futura importação de
--    prontuários precisa resolver o paciente pelas DUAS chaves do sistema
--    anterior (Prontuarios.identificador_cliente -> Clientes.identificador,
--    já em legacy_id; e Prontuarios.id_cliente -> Clientes.id_cliente, nova
--    coluna). Unicidade por tenant + source_system + entity_type, igual à
--    chave principal — o mesmo id em outro tenant nunca colide.
-- 2. df_legacy_import_map.match_kind: como o legacy_id chegou ao patient_id
--    (CREATED = paciente criado pela importação; LINKED_CPF / LINKED_STRONG =
--    vinculado a um paciente que já existia no tenant, sem alterá-lo).
-- 3. df_legacy_import_sessions.commit_summary / error_log: contagens do commit
--    e erros por lote (batch, IDs envolvidos, último ponto consistente).
--
-- Aditiva (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS). Nenhum dado
-- existente é alterado.
-- ==============================================================================

ALTER TABLE public.df_legacy_import_map
  ADD COLUMN IF NOT EXISTS legacy_secondary_id TEXT,
  ADD COLUMN IF NOT EXISTS match_kind TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_df_legacy_import_map_secondary
  ON public.df_legacy_import_map (tenant_id, source_system, entity_type, legacy_secondary_id)
  WHERE legacy_secondary_id IS NOT NULL;

ALTER TABLE public.df_legacy_import_sessions
  ADD COLUMN IF NOT EXISTS commit_summary JSONB,
  ADD COLUMN IF NOT EXISTS error_log JSONB;

NOTIFY pgrst, 'reload schema';
