/**
 * Serviço de Notificações Globais, Som Sintético e Web Push do Dental Finance
 * Suporta:
 * 1. Web Audio API (som harmônico suave sintetizado, sem dependência de arquivo de áudio ou falha 404)
 * 2. Notification API (alertas nativos do navegador quando em background)
 * 3. Web Push com Service Worker e criptografia VAPID
 * 4. Sincronização persistente de notificações e preferências no Supabase (df_notifications e df_user_notification_settings)
 */

import { supabase } from '../lib/supabaseClient';
import {
  computePushCapabilityState,
  readPushEnvironment,
  type PushCapabilityState,
} from '../lib/pushCapability';
import { registerServiceWorker } from '../lib/pwa';

export interface AppNotification {
  id: string;
  tenant_id: string;
  user_id?: string | null;
  type: string;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string;
  metadata?: {
    message_id?: string;
    evolution_msg_id?: string;
    conversation_id?: string;
    contact_id?: string;
    whatsapp_number?: string;
    sender_name?: string;
    avatar_url?: string | null;
    is_group?: boolean;
    msg_type?: string;
  };
  is_read: boolean;
  created_at: string;
}

export interface UserNotificationSettings {
  soundEnabled: boolean;
  browserNotificationsEnabled: boolean;
  notifyGroups: boolean;
}

const SETTINGS_KEY = 'df_notification_settings';

// Helper: Converte chave VAPID Base64URL para Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private lastSoundTime = 0;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private lastPushError: string | null = null;
  private subscribing = false;

  /** Compat: o registro real do Service Worker vive em lib/pwa.ts (chamado no boot). */
  public async initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    const reg = await registerServiceWorker();
    this.swRegistration = reg;
    return reg;
  }

  /**
   * Obtém as preferências locais e default de notificação do usuário
   */
  public getSettings(): UserNotificationSettings {
    if (typeof window === 'undefined') {
      return { soundEnabled: true, browserNotificationsEnabled: true, notifyGroups: true };
    }
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return { soundEnabled: true, browserNotificationsEnabled: true, notifyGroups: true };
  }

  /**
   * Atualiza as preferências do usuário
   */
  public saveSettings(settings: Partial<UserNotificationSettings>, tenantId?: string, userId?: string): void {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }

    // Sincronizar com banco se tiver tenant e usuário
    if (tenantId && userId) {
      supabase
        .from('df_user_notification_settings')
        .upsert(
          {
            id: `pref_${tenantId}_${userId}`,
            tenant_id: tenantId,
            user_id: userId,
            sound_enabled: updated.soundEnabled,
            browser_notifications_enabled: updated.browserNotificationsEnabled,
            notify_groups: updated.notifyGroups,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,user_id' }
        )
        .then(({ error }) => {
          if (error) console.warn('[NotificationService] Erro ao sincronizar preferências:', error.message);
        });
    }
  }

  /**
   * Toca som suave e harmônico usando a Web Audio API (sem dependência de arquivos mp3 ou 404).
   * Produz um elegante "ding-dong" de sino moderno (880Hz -> 1320Hz com envelope exponencial).
   */
  public playNotificationSound(): void {
    const settings = this.getSettings();
    if (!settings.soundEnabled) return;

    const now = Date.now();
    // Debounce de 800ms para evitar sobreposição em rajadas de mensagens
    if (now - this.lastSoundTime < 800) return;
    this.lastSoundTime = now;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const ctx = this.audioCtx;
      const startTime = ctx.currentTime;

      // Primeiro tom: 880Hz (Lá 5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, startTime);
      gain1.gain.setValueAtTime(0.12, startTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(startTime);
      osc1.stop(startTime + 0.18);

      // Segundo tom harmônico: 1320Hz (Mi 6) levemente sobreposto
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, startTime + 0.08);
      gain2.gain.setValueAtTime(0.08, startTime + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.28);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(startTime + 0.08);
      osc2.stop(startTime + 0.28);
    } catch (e) {
      console.warn('[NotificationService] Aviso no sintetizador de áudio:', e);
    }
  }

  /** Permissão nativa (NUNCA usar isoladamente para decidir UX — use getPushState). */
  public getPermissionState(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'default';
    return Notification.permission;
  }

  private async getExistingSubscription(): Promise<PushSubscription | null> {
    try {
      if (!('serviceWorker' in navigator)) return null;
      const reg = (await navigator.serviceWorker.getRegistration('/')) || this.swRegistration;
      return reg ? await reg.pushManager.getSubscription() : null;
    } catch {
      return null;
    }
  }

  /** Estado canônico do Web Push neste dispositivo (fonte única para a UI). */
  public async getPushState(): Promise<PushCapabilityState> {
    const base = readPushEnvironment();
    let hasSubscription = false;
    if (base.permission === 'granted' && base.hasPushManager) {
      hasSubscription = Boolean(await this.getExistingSubscription());
    }
    return computePushCapabilityState({
      ...base,
      hasSubscription,
      isSubscribing: this.subscribing,
      lastError: this.lastPushError,
    });
  }

  public getLastPushError(): string | null {
    return this.lastPushError;
  }

  /** Chave pública VAPID (Edge Function dedicada; fallback para a função legada). */
  public async getVapidPublicKey(): Promise<string | null> {
    for (const fn of ['dental-web-push-dispatch', 'dental-whatsapp-api']) {
      try {
        const { data, error } = await supabase.functions.invoke(fn, {
          body: { action: fn === 'dental-web-push-dispatch' ? 'public_key' : 'get_vapid_public_key' },
        });
        if (!error && data?.publicKey) return data.publicKey;
      } catch {
        // tenta o próximo
      }
    }
    return null;
  }

  private async persistSubscription(tenantId: string, userId: string | undefined, sub: PushSubscription): Promise<boolean> {
    const subJson = sub.toJSON();
    const ua = navigator.userAgent;
    const deviceLabel = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Dispositivo';
    try {
      const { data, error } = await supabase.functions.invoke('dental-web-push-dispatch', {
        body: { action: 'save_subscription', tenant_id: tenantId, subscription: subJson, user_agent: ua, device_label: deviceLabel },
      });
      if (!error && data?.success) return true;
    } catch {
      // fallback abaixo
    }
    // Fallback (função nova ainda não implantada): grava só as colunas legadas, sob RLS do próprio usuário
    if (!userId) return false;
    const { error } = await supabase.from('df_push_subscriptions').upsert(
      {
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        tenant_id: tenantId,
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
        user_agent: ua,
        device_label: deviceLabel,
        is_active: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,endpoint' }
    );
    return !error;
  }

  /**
   * Ativa o Web Push. DEVE ser chamado diretamente do toque do usuário (permissão pedida primeiro,
   * antes de qualquer await pesado, para manter o gesto do usuário no iOS/Safari).
   */
  public async enablePush(tenantId: string, userId?: string): Promise<PushCapabilityState> {
    this.lastPushError = null;
    // Síncrono de propósito: preserva o gesto do usuário (iOS/Safari) até o requestPermission
    const before = computePushCapabilityState({ ...readPushEnvironment(), hasSubscription: false, lastError: null });
    if (before !== 'READY_TO_REQUEST' && before !== 'SUBSCRIPTION_ERROR') return before;

    this.subscribing = true;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return permission === 'denied' ? 'DENIED' : 'READY_TO_REQUEST'; // 'default' = fechou o prompt: sem erro

      const reg = await registerServiceWorker();
      if (!reg) throw new Error('service_worker_unavailable');
      await navigator.serviceWorker.ready;

      const publicKey = await this.getVapidPublicKey();
      if (!publicKey) throw new Error('vapid_unavailable');
      const key = urlBase64ToUint8Array(publicKey);

      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Inscrição criada com outra chave VAPID (rotação): recria
        const current = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey as ArrayBuffer) : null;
        const same = current && current.length === key.length && current.every((b, i) => b === key[i]);
        if (!same) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

      const saved = await this.persistSubscription(tenantId, userId, sub);
      if (!saved) throw new Error('persist_failed');
      return 'SUBSCRIBED';
    } catch (err: any) {
      this.lastPushError = err?.message || 'erro';
      console.warn('[NotificationService] Falha ao ativar push:', this.lastPushError);
      return 'SUBSCRIPTION_ERROR';
    } finally {
      this.subscribing = false;
    }
  }

  /** Compat com chamadas antigas. */
  public async subscribeToPush(tenantId: string, userId?: string): Promise<boolean> {
    return (await this.enablePush(tenantId, userId)) === 'SUBSCRIBED';
  }

  /** Desativa o push NESTE dispositivo (backend + navegador). */
  public async disablePush(tenantId: string): Promise<boolean> {
    try {
      const sub = await this.getExistingSubscription();
      if (!sub) return true;
      const endpoint = sub.endpoint;
      try {
        await supabase.functions.invoke('dental-web-push-dispatch', { body: { action: 'remove_subscription', tenant_id: tenantId, endpoint } });
      } catch {
        await supabase.from('df_push_subscriptions').update({ is_active: false }).eq('tenant_id', tenantId).eq('endpoint', endpoint);
      }
      return await sub.unsubscribe();
    } catch (err) {
      console.warn('[NotificationService] Erro ao desativar push:', (err as Error)?.message);
      return false;
    }
  }

  public unsubscribeFromPush(tenantId: string): Promise<boolean> {
    return this.disablePush(tenantId);
  }

  /**
   * Logout: desassocia o dispositivo do usuário que sai (backend + navegador) para que o próximo
   * usuário do mesmo navegador não herde pushes privados. Chamar ANTES de encerrar a sessão.
   */
  public async detachPushOnLogout(tenantId?: string): Promise<void> {
    if (!tenantId) return;
    try {
      await Promise.race([this.disablePush(tenantId), new Promise((r) => setTimeout(r, 2000))]);
    } catch {
      // logout nunca deve falhar por causa do push
    }
  }

  /**
   * Ao entrar no app com permissão já concedida e inscrição existente: revalida o DONO da inscrição
   * (sem pedir permissão nenhuma). Não faz nada se não houver inscrição.
   */
  public async refreshOwnershipIfSubscribed(tenantId: string, userId?: string): Promise<void> {
    try {
      if (this.getPermissionState() !== 'granted') return;
      const sub = await this.getExistingSubscription();
      if (sub) await this.persistSubscription(tenantId, userId, sub);
    } catch {
      // silencioso
    }
  }

  /**
   * Dispara notificação nativa do navegador se a aba estiver em segundo plano
   */
  public showNativeNotification(title: string, body: string, iconUrl?: string, onClick?: () => void): void {
    const settings = this.getSettings();
    if (!settings.browserNotificationsEnabled) return;
    if (this.getPermissionState() !== 'granted') return;

    // Disparar se a aba estiver oculta ou não em foco
    try {
      const notif = new Notification(title, {
        body,
        icon: iconUrl || '/icon-192.png',
        badge: '/favicon-32x32.png',
        tag: `df_notif_${Date.now()}`,
      });

      notif.onclick = () => {
        window.focus();
        notif.close();
        if (onClick) onClick();
      };
    } catch (e) {
      console.warn('[NotificationService] Falha ao exibir notificação nativa:', e);
    }
  }

  /**
   * Busca notificações não lidas do tenant com suporte a leitura individual por atendente (RPC get_unread_notifications)
   * A identidade do usuário é obtida estritamente de auth.uid() no backend.
   */
  public async fetchUnreadNotifications(tenantId: string): Promise<AppNotification[]> {
    try {
      if (tenantId) {
        // 1. Tentar via RPC atômica segura (identidade validada via auth.uid())
        const { data, error } = await supabase.rpc('get_unread_notifications', {
          p_tenant_id: tenantId,
        });

        if (!error && Array.isArray(data)) {
          return data as AppNotification[];
        }
      }

      // 2. Fallback via query direta protegida pelas policies de RLS do Supabase
      const { data, error } = await supabase
        .from('df_notifications')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        console.warn('[NotificationService] Erro ao carregar notificações:', error.message);
        return [];
      }
      return (data as AppNotification[]) || [];
    } catch (e) {
      console.warn('[NotificationService] Exceção ao carregar notificações:', e);
      return [];
    }
  }

  /**
   * Marca uma notificação como lida para o usuário atual (individual por atendente)
   * Identidade e tenant validados no servidor via auth.uid().
   */
  public async markAsRead(notificationId: string, tenantId?: string): Promise<void> {
    try {
      if (notificationId && tenantId) {
        const { error } = await supabase.rpc('mark_notification_as_read', {
          p_notification_id: notificationId,
          p_tenant_id: tenantId,
        });
        if (!error) return;
      }

      // Fallback: se não tiver tenantId, atualiza direto se permitido por RLS
      await supabase
        .from('df_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
    } catch (e) {
      console.warn('[NotificationService] Erro ao marcar como lida:', e);
    }
  }

  /**
   * Marca todas as notificações do usuário no tenant como lidas
   */
  public async markAllAsRead(tenantId: string): Promise<void> {
    try {
      if (tenantId) {
        const { error } = await supabase.rpc('mark_all_notifications_as_read', {
          p_tenant_id: tenantId,
        });
        if (!error) return;
      }

      // Fallback
      await supabase
        .from('df_notifications')
        .update({ is_read: true })
        .eq('tenant_id', tenantId)
        .eq('is_read', false);
    } catch (e) {
      console.warn('[NotificationService] Erro ao marcar todas como lidas:', e);
    }
  }
}

export const notificationService = new NotificationService();
