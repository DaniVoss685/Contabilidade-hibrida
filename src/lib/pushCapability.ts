/**
 * Estado canônico de capacidade de Web Push. UMA função decide o estado; nenhum componente
 * deve reimplementar essas condições. Puro (recebe o ambiente) para ser testável.
 *
 * Por que existe: antes, `permission !== 'granted'` virava sempre "Permissão não concedida no
 * navegador" — inclusive no iPhone/Safari fora do PWA instalado (onde `Notification` nem existe),
 * em iframe, em contexto inseguro e quando a permissão ainda nem tinha sido pedida.
 */
export type PushCapabilityState =
  | 'UNSUPPORTED'
  | 'INSECURE_CONTEXT'
  | 'EMBEDDED_CONTEXT'
  | 'IOS_NEEDS_INSTALL'
  | 'READY_TO_REQUEST'
  | 'DENIED'
  | 'SUBSCRIBING'
  | 'SUBSCRIBED'
  | 'SUBSCRIPTION_ERROR';

export interface PushEnvironment {
  isSecureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  isEmbedded: boolean;
  permission: NotificationPermission | 'unavailable';
  hasSubscription: boolean;
  isSubscribing?: boolean;
  lastError?: string | null;
}

export function computePushCapabilityState(env: PushEnvironment): PushCapabilityState {
  if (env.isSubscribing) return 'SUBSCRIBING';
  // iPhone/iPad no Safari comum: Web Push só existe no web app da Tela de Início.
  if (env.isIOS && !env.isStandalone) return 'IOS_NEEDS_INSTALL';
  if (env.isEmbedded) return 'EMBEDDED_CONTEXT';
  if (!env.isSecureContext) return 'INSECURE_CONTEXT';
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'UNSUPPORTED';
  if (env.permission === 'denied') return 'DENIED';
  if (env.permission === 'granted' && env.hasSubscription) return 'SUBSCRIBED';
  if (env.lastError) return 'SUBSCRIPTION_ERROR';
  return 'READY_TO_REQUEST';
}

export function readPushEnvironment(extra: Partial<PushEnvironment> = {}): PushEnvironment {
  if (typeof window === 'undefined') {
    return {
      isSecureContext: false, hasServiceWorker: false, hasPushManager: false, hasNotification: false,
      isIOS: false, isStandalone: false, isEmbedded: false, permission: 'unavailable', hasSubscription: false,
      ...extra,
    };
  }
  const ua = navigator.userAgent || '';
  // iPadOS 13+ se identifica como Mac com touch
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  const isStandalone =
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as any).standalone === true;
  let isEmbedded = false;
  try {
    isEmbedded = window.self !== window.top;
  } catch {
    isEmbedded = true; // acesso ao top bloqueado => cross-origin
  }
  return {
    isSecureContext: window.isSecureContext,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    isIOS,
    isStandalone,
    isEmbedded,
    permission: 'Notification' in window ? Notification.permission : 'unavailable',
    hasSubscription: false,
    ...extra,
  };
}

/** Texto de UI por estado (fonte única de copy). */
export const PUSH_STATE_COPY: Record<PushCapabilityState, { title: string; hint?: string }> = {
  UNSUPPORTED: { title: 'Este dispositivo/navegador não oferece suporte a notificações push.' },
  INSECURE_CONTEXT: { title: 'Notificações exigem conexão segura (HTTPS).', hint: 'Acesse o sistema pelo endereço https oficial.' },
  EMBEDDED_CONTEXT: { title: 'Abra o aplicativo em uma nova aba para ativar notificações.' },
  IOS_NEEDS_INSTALL: {
    title: 'Instale o Dental Finance para receber notificações mesmo com o aplicativo fechado.',
  },
  READY_TO_REQUEST: { title: 'Receba avisos mesmo com o aplicativo fechado.' },
  DENIED: {
    title: 'Notificações bloqueadas neste dispositivo',
    hint: 'Libere nas configurações do navegador/sistema (ícone de cadeado ou Ajustes › Notificações › Dental Finance) e volte aqui.',
  },
  SUBSCRIBING: { title: 'Ativando notificações...' },
  SUBSCRIBED: { title: 'Notificações ativadas' },
  SUBSCRIPTION_ERROR: { title: 'Não foi possível concluir a ativação. Tente novamente.' },
};

/** URL de navegação a partir do payload NÃO sensível do push (somente ids). */
export function buildNotificationTargetUrl(data: { tenantId?: string; conversationId?: string; contactId?: string }): string {
  const q = new URLSearchParams({ action: 'open_wa' });
  if (data.tenantId) q.set('tenant_id', data.tenantId);
  if (data.conversationId) q.set('conversation_id', data.conversationId);
  if (data.contactId) q.set('contact_id', data.contactId);
  return `/?${q.toString()}`;
}

/** Payload de push com privacidade por padrão. Puro/espelhado na Edge Function (manter em sincronia). */
export function buildPushPayload(input: {
  contactName?: string | null;
  preview?: string | null;
  showPreview?: boolean;
  isGroup?: boolean;
  tenantId: string;
  conversationId?: string | null;
  contactId?: string | null;
  notificationId: string;
}) {
  const showPreview = input.showPreview === true;
  return {
    title: showPreview && input.contactName ? input.contactName : 'Nova mensagem no WhatsApp',
    body: showPreview && input.preview ? input.preview : 'Você recebeu uma nova mensagem.',
    tag: `wa_${input.tenantId}_${input.conversationId || input.contactId || 'x'}`,
    data: {
      notificationId: input.notificationId,
      tenantId: input.tenantId,
      conversationId: input.conversationId || '',
      contactId: input.contactId || '',
    },
  };
}
