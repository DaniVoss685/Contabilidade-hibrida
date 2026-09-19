/**
 * Serviço de Notificações Globais, Som Sintético e Web Push do Dental Finance
 * Suporta:
 * 1. Web Audio API (som harmônico suave sintetizado, sem dependência de arquivo de áudio ou falha 404)
 * 2. Notification API (alertas nativos do navegador quando em background)
 * 3. Web Push com Service Worker e criptografia VAPID
 * 4. Sincronização persistente de notificações e preferências no Supabase (df_notifications e df_user_notification_settings)
 */

import { supabase } from '../lib/supabaseClient';

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

  constructor() {
    // Inicialização segura do Service Worker no client-side
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      this.initServiceWorker();
    }
  }

  /**
   * Registra o Service Worker público de push notification
   */
  public async initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      this.swRegistration = registration;
      return registration;
    } catch (err) {
      console.warn('[NotificationService] Falha ao registrar Service Worker:', err);
      return null;
    }
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

  /**
   * Verifica permissão nativa de notificação
   */
  public getPermissionState(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    return Notification.permission;
  }

  /**
   * Solicita permissão de notificação nativa ao usuário
   */
  public async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch {
      return 'denied';
    }
  }

  /**
   * Obtém a chave pública VAPID do backend
   */
  public async getVapidPublicKey(): Promise<string | null> {
    try {
      const { data, error } = await supabase.functions.invoke('dental-whatsapp-api', {
        body: { action: 'get_vapid_public_key' },
      });

      if (error || !data?.publicKey) {
        console.warn('[NotificationService] Não foi possível obter VAPID public key:', error || data);
        return null;
      }
      return data.publicKey;
    } catch (err) {
      console.warn('[NotificationService] Erro ao buscar VAPID key:', err);
      return null;
    }
  }

  /**
   * Registra a subscription Web Push no navegador e envia ao backend
   */
  public async subscribeToPush(tenantId: string, userId?: string): Promise<boolean> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }

    try {
      const permission = await this.requestPermission();
      if (permission !== 'granted') return false;

      let reg = this.swRegistration;
      if (!reg) {
        reg = await this.initServiceWorker();
      }
      if (!reg) return false;

      // Aguardar o Service Worker estar pronto
      const readyRegistration = await navigator.serviceWorker.ready;

      const publicKey = await this.getVapidPublicKey();
      if (!publicKey) return false;

      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      // Obter ou criar subscription
      let subscription = await readyRegistration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      if (!subscription) return false;

      // Enviar subscription para o backend e salvar diretamente no banco de dados
      const deviceLabel = navigator.userAgent.includes('Mobile')
        ? 'Dispositivo Móvel'
        : navigator.userAgent.includes('Mac')
        ? 'Mac / Safari'
        : 'Desktop / Navegador';

      const subJson = subscription.toJSON();
      const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 1. Salvar diretamente na tabela df_push_subscriptions via Supabase Client
      const { error: dbErr } = await supabase
        .from('df_push_subscriptions')
        .upsert(
          {
            id: subId,
            tenant_id: tenantId,
            user_id: userId || null,
            endpoint: subscription.endpoint,
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
            user_agent: navigator.userAgent,
            device_label: deviceLabel,
            is_active: true,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,endpoint' }
        );

      if (dbErr) {
        console.warn('[NotificationService] Aviso ao salvar no banco local, tentando Edge Function:', dbErr.message);
      }

      // 2. Notificar Edge Function para auditoria e sync
      try {
        await supabase.functions.invoke('dental-whatsapp-api', {
          body: {
            action: 'save_push_subscription',
            tenant_id: tenantId,
            user_id: userId,
            subscription: subJson,
            user_agent: navigator.userAgent,
            device_label: deviceLabel,
          },
        });
      } catch (fnErr) {
        // Ignora se banco direto já salvou
      }

      return true;
    } catch (err) {
      console.error('[NotificationService] Exceção ao registrar push:', err);
      return false;
    }
  }

  /**
   * Desativa subscription de Web Push
   */
  public async unsubscribeFromPush(tenantId: string): Promise<boolean> {
    try {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return true;

      // Remover no backend
      await supabase.functions.invoke('dental-whatsapp-api', {
        body: {
          action: 'remove_push_subscription',
          tenant_id: tenantId,
          endpoint: subscription.endpoint,
        },
      });

      // Desinscrever localmente
      return await subscription.unsubscribe();
    } catch (err) {
      console.warn('[NotificationService] Erro ao desinscrever push:', err);
      return false;
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
