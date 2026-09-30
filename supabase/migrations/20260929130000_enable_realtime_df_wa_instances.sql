-- Habilita Realtime para df_wa_instances: o modal de conexão do WhatsApp passa a refletir
-- imediatamente o que o webhook grava (connection.update / qrcode.updated) assim que a Evolution
-- avisa, em vez de depender só do polling de 4s (parte da correção da instabilidade de QR — ver
-- InstanceConfigModal.tsx). Aditiva e somente leitura para os dados existentes: não altera nenhuma
-- linha, não desconecta nenhuma instância CONNECTED, apenas habilita a emissão de eventos.

DO $$
BEGIN
  -- 1. Garantir que a tabela emita o payload completo em updates (necessário para o frontend
  -- receber phone_number/profile_name/qrcode junto do evento, sem precisar de um segundo fetch).
  ALTER TABLE public.df_wa_instances REPLICA IDENTITY FULL;

  -- 2. Adicionar df_wa_instances na publicação supabase_realtime se ainda não estiver
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'df_wa_instances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.df_wa_instances;
  END IF;
END $$;
