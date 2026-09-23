-- ============================================================================
-- MIGRATION: 20260923104836_add_failed_delivery_status_value.sql
-- CAUSA RAIZ do erro real observado:
--   "new row for relation df_wa_messages violates check constraint
--    df_wa_messages_delivery_status_check" (HTTP 400 no insert)
--
-- VALOR TENTADO: -1 (sentinela de "falha no envio" usado em
-- DentalWhatsAppService.sendMessage/sendMediaMessage/sendAudioMessage desde
-- sempre — não é uma regressão desta sessão, o padrão `1 = PENDING, 2 =
-- SERVER_ACK, 3 = DELIVERY_ACK, 4 = READ, 5 = PLAYED` já é comentado no
-- código-fonte, e o UI de retry (WhatsAppChatArea.renderDeliveryStatus,
-- retryFailedMessage) já espera um status distinto para "falhou").
-- VALORES PERMITIDOS pela constraint original (20260917_26): 1, 2, 3, 4, 5.
-- ORIGEM: a constraint nunca incluiu um valor para representar falha de
-- envio; o código sempre tentou gravar -1 para esse caso e a linha nunca era
-- persistida quando o envio para a Evolution API falhava (ex.: 502/erro
-- upstream do Evolution) — a mensagem "sumia" da conversa sem nenhum
-- registro, e o botão de reenvio nunca tinha o que reenviar.
--
-- Correção semântica (não apenas remover a constraint, per instrução): 0
-- passa a ser um valor válido e explícito para FAILED — meramente antes de
-- PENDING (1) na escala natural, sem colidir com nenhum status real do
-- WhatsApp (1-5, que vêm do protocolo Evolution/Baileys). TypeScript e
-- serviço atualizados no mesmo commit para persistir 0 em vez de -1.
-- ============================================================================

ALTER TABLE public.df_wa_messages
  DROP CONSTRAINT IF EXISTS df_wa_messages_delivery_status_check;

ALTER TABLE public.df_wa_messages
  ADD CONSTRAINT df_wa_messages_delivery_status_check
  CHECK (delivery_status IN (0, 1, 2, 3, 4, 5));

COMMENT ON COLUMN public.df_wa_messages.delivery_status IS
  '0: FAILED (falha no envio) | 1: PENDING | 2: SERVER_ACK | 3: DELIVERY_ACK | 4: READ | 5: PLAYED';
