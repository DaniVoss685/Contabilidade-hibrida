-- ==============================================================================
-- MIGRATION: COLUNAS DE HISTÓRICO DE PROCEDIMENTOS LEGADOS EM df_clinical_records
--
-- Suporta a importação de histórico de procedimentos de sistemas anteriores
-- sem perder dado estruturado (dente, face, TUSS legado, dentista legado).
--
-- legacy_status preserva o status ORIGINAL do sistema anterior (ex.:
-- "Em Execução", "Finalizado") separado do status técnico interno
-- (ClinicalRecordStatus). Registros importados sempre usam status='FINALIZED'
-- tecnicamente (para nunca entrar no fluxo operacional de rascunhos, que é
-- editável/excluível), mas a UI usa legacy_status para a apresentação quando
-- origin='IMPORT' e legacy_status estiver preenchido, em vez de rotular como
-- "Finalizado" um procedimento que no sistema anterior estava em andamento.
-- ==============================================================================

ALTER TABLE public.df_clinical_records
  ADD COLUMN IF NOT EXISTS tooth_number TEXT,
  ADD COLUMN IF NOT EXISTS tooth_face TEXT,
  ADD COLUMN IF NOT EXISTS legacy_tuss_code TEXT,
  ADD COLUMN IF NOT EXISTS legacy_procedure_name TEXT,
  ADD COLUMN IF NOT EXISTS legacy_dentist_name TEXT,
  ADD COLUMN IF NOT EXISTS legacy_status TEXT;

NOTIFY pgrst, 'reload schema';
