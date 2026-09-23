-- ==============================================================================
-- MIGRATION 44: RASTREABILIDADE DE ORIGEM WHATSAPP EM ANEXOS CLÍNICOS
-- Permite anexar documentos/imagens recebidos ou enviados pelo WhatsApp
-- diretamente ao prontuário do paciente, com idempotência real em banco.
-- ==============================================================================

ALTER TABLE public.df_clinical_attachments
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_message_id TEXT,
  ADD COLUMN IF NOT EXISTS source_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS source_conversation_id TEXT;

-- Idempotência real em banco: a mesma mensagem do WhatsApp não pode gerar
-- mais de um documento no prontuário do mesmo paciente/tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_df_clinical_attachments_wa_source
  ON public.df_clinical_attachments (tenant_id, patient_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
