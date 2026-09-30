/**
 * Espelho PURO das regras do dispatcher (supabase/functions/dental-web-push-dispatch) para teste
 * automatizado — edge functions não importam src/lib. Manter em sincronia manualmente.
 */
const WA_ROLES = ['PLATFORM_ADMIN', 'OWNER', 'ADMIN', 'RECEPTION', 'ASSISTANT', 'DENTIST', 'PROFESSIONAL'];

export interface PushUser { id: string; is_active: boolean; is_primary?: boolean; role?: string; clinic_id?: string; permissions?: string[] | Record<string, boolean> | null }
export interface PushSub { id: string; tenant_id: string; user_id: string | null; is_active: boolean }
export interface PushNotif { id: string; tenant_id: string; user_id: string | null; metadata?: { is_group?: boolean } }

export function canAccessWhatsApp(u: PushUser | undefined, tenantId: string): boolean {
  if (!u || !u.is_active) return false;
  if (u.is_primary === true || u.role === 'SUPER_ADMIN') return true;
  if (u.clinic_id !== tenantId) return false;
  const p = u.permissions;
  const hasPerm = Array.isArray(p) ? p.includes('whatsapp:view') : Boolean(p && (p as any)['whatsapp:view']);
  return WA_ROLES.includes(u.role || '') || hasPerm;
}

export function selectPushRecipients(
  notif: PushNotif,
  subs: PushSub[],
  users: Map<string, PushUser>,
  opts: { readBy?: Set<string>; settings?: Map<string, { browser_notifications_enabled?: boolean; notify_groups?: boolean }> } = {}
): PushSub[] {
  return subs.filter((s) => {
    if (s.tenant_id !== notif.tenant_id || !s.is_active || !s.user_id) return false; // tenant + dono obrigatório
    const st = opts.settings?.get(s.user_id);
    return (
      canAccessWhatsApp(users.get(s.user_id), notif.tenant_id) &&
      (notif.user_id == null || notif.user_id === s.user_id) &&
      !opts.readBy?.has(s.user_id) &&
      st?.browser_notifications_enabled !== false &&
      !(notif.metadata?.is_group && st?.notify_groups === false)
    );
  });
}

/** 404/410 = inscrição expirada (desativar); 4xx permanente = não repetir; resto = retry limitado. */
export function classifyProviderStatus(status: number | null): 'expired' | 'permanent' | 'retry' {
  if (status === 404 || status === 410) return 'expired';
  if (status && status >= 400 && status < 500 && status !== 429) return 'permanent';
  return 'retry';
}

/** Idempotência: chave (notification_id, subscription_id) — primeira reivindicação vence. */
export function createDeliveryLog() {
  const seen = new Set<string>();
  return { claim: (notificationId: string, subscriptionId: string) => { const k = `${notificationId}|${subscriptionId}`; if (seen.has(k)) return false; seen.add(k); return true; } };
}
