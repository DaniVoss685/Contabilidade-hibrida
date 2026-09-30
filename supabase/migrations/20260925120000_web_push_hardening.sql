-- Web Push: hardening da tabela de subscriptions, log de entrega idempotente e preferência de prévia.
-- NÃO reexecuta nada destrutivo. Aplicar com: npx supabase db query --linked -f <este arquivo>
-- (nunca `db push` neste projeto — ver CLAUDE.md).

ALTER TABLE public.df_push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint_hash text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.df_push_subscriptions
   SET endpoint_hash = encode(sha256(convert_to(endpoint, 'UTF8')), 'hex')
 WHERE endpoint_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_df_push_subscriptions_tenant_endpoint_hash
  ON public.df_push_subscriptions (tenant_id, endpoint_hash) WHERE endpoint_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_df_push_subscriptions_user
  ON public.df_push_subscriptions (tenant_id, user_id) WHERE is_active;

-- Prévia do conteúdo no push: desligada por padrão (tela bloqueada / relógio).
ALTER TABLE public.df_user_notification_settings
  ADD COLUMN IF NOT EXISTS push_preview_enabled boolean NOT NULL DEFAULT false;

-- Log de entrega. UNIQUE (notification_id, subscription_id) = idempotência: 1 push por dispositivo por notificação.
CREATE TABLE IF NOT EXISTS public.df_push_delivery_log (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL,
  notification_id text NOT NULL,
  subscription_id text NOT NULL,
  status text NOT NULL DEFAULT 'sending',
  attempt integer NOT NULL DEFAULT 1,
  provider_status integer NULL,
  error text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_df_push_delivery UNIQUE (notification_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS idx_df_push_delivery_tenant ON public.df_push_delivery_log (tenant_id, created_at DESC);
ALTER TABLE public.df_push_delivery_log ENABLE ROW LEVEL SECURITY; -- sem policies: só service_role

-- SEGREDO VAPID: a chave privada padrão foi commitada na migration 20260918_35 e deve ser considerada
-- comprometida. Gere um novo par (npx web-push generate-vapid-keys), configure os Secrets
-- VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT nas Edge Functions e depois execute:
--   DELETE FROM public.df_vapid_secrets WHERE id = 'default';
-- (todos precisarão reativar as notificações: subscriptions ligadas à chave antiga deixam de valer).
