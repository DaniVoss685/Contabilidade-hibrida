-- Migration: 20260918_35_dental_notifications_and_web_push.sql
-- Description: Criação das tabelas de notificações in-app persistentes, subscriptions Web Push,
--              preferências de notificação e armazenamento seguro de segredos VAPID.

-- 1. Tabela de Notificações Persistentes (df_notifications)
CREATE TABLE IF NOT EXISTS public.df_notifications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NULL,
  type text NOT NULL DEFAULT 'whatsapp_message',
  title text NOT NULL,
  body text NOT NULL,
  entity_type text NOT NULL DEFAULT 'whatsapp_conversation',
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_df_notifications_tenant_created 
ON public.df_notifications (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_df_notifications_tenant_read 
ON public.df_notifications (tenant_id, is_read);

-- Idempotência estrita: uma mensagem do WhatsApp nunca gera 2 notificações
CREATE UNIQUE INDEX IF NOT EXISTS uq_df_notifications_msg_tenant
ON public.df_notifications (tenant_id, (metadata->>'message_id'))
WHERE (metadata->>'message_id') IS NOT NULL;

-- 2. Tabela de Subscrições Web Push (df_push_subscriptions)
CREATE TABLE IF NOT EXISTS public.df_push_subscriptions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text NULL,
  device_label text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_df_push_subscriptions_tenant_endpoint
ON public.df_push_subscriptions (tenant_id, endpoint);

CREATE INDEX IF NOT EXISTS idx_df_push_subscriptions_active
ON public.df_push_subscriptions (tenant_id, is_active);

-- 3. Tabela de Preferências de Notificação (df_user_notification_settings)
CREATE TABLE IF NOT EXISTS public.df_user_notification_settings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  sound_enabled boolean NOT NULL DEFAULT true,
  browser_notifications_enabled boolean NOT NULL DEFAULT true,
  notify_groups boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_df_user_notif_settings UNIQUE (tenant_id, user_id)
);

-- 4. Tabela de Segredos VAPID no Servidor (df_vapid_secrets)
CREATE TABLE IF NOT EXISTS public.df_vapid_secrets (
  id text PRIMARY KEY,
  public_key text NOT NULL,
  private_key text NOT NULL,
  subject text NOT NULL DEFAULT 'mailto:suporte@dentalfinance.com.br',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Inserir as chaves VAPID geradas
INSERT INTO public.df_vapid_secrets (id, public_key, private_key, subject, updated_at)
VALUES (
  'default',
  'BOSWIpYkz0zit-90tzIeeP6_5NpceyarG1s_I1qI1pzYyVO2SMuxWloVPjg-lYTHP_Lzy6KIFKmgok8_0GnReNI',
  'PL00q-1uG1xT4O1tpwZsi0WcmBP1EpOBY3Nch-hnxko',
  'mailto:suporte@dentalfinance.com.br',
  now()
)
ON CONFLICT (id) DO UPDATE SET
  public_key = EXCLUDED.public_key,
  private_key = EXCLUDED.private_key,
  updated_at = now();

-- Habilitar RLS em df_vapid_secrets para que cliente anônimo/autenticado comum não leia private_key
ALTER TABLE public.df_vapid_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_df_vapid_secrets" ON public.df_vapid_secrets;
CREATE POLICY "service_role_all_df_vapid_secrets" ON public.df_vapid_secrets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Habilitar Realtime para df_notifications com REPLICA IDENTITY FULL (Obrigatório para CDC)
ALTER TABLE public.df_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.df_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS df_notifications_policy ON public.df_notifications;
CREATE POLICY df_notifications_policy ON public.df_notifications
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

ALTER TABLE public.df_push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS df_push_subscriptions_policy ON public.df_push_subscriptions;
CREATE POLICY df_push_subscriptions_policy ON public.df_push_subscriptions
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.df_notifications;
