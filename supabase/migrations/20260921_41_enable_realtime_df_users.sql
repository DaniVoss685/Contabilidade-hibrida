-- Migration 20260921_41: Habilitar Realtime e Replica Identity para df_users
-- Permite que atualizações de equipe, permissões, roles e nomes reflitam instantaneamente
-- nas sessões ativas dos colaboradores conectados via Supabase Realtime.

DO $$
BEGIN
  -- 1. Garantir que a tabela df_users emita o payload completo em updates
  ALTER TABLE public.df_users REPLICA IDENTITY FULL;

  -- 2. Adicionar df_users na publicação supabase_realtime se ainda não estiver
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'df_users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.df_users;
  END IF;
END $$;
