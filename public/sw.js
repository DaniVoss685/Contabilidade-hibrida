// Service Worker do Dental Finance - Web Push Notifications & Background Sync
const SW_VERSION = 'v1.0.0';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Manipulador de Push Notifications recebidas via Web Push / VAPID
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'Dental Finance - WhatsApp';
    const body = payload.body || 'Nova mensagem recebida';
    const data = payload.data || {};
    const icon = payload.icon || '/icon-192.png';
    const badge = payload.badge || '/favicon-32x32.png';
    const tag = payload.tag || `wa_${data.tenantId || ''}_${data.conversationId || ''}`;

    const options = {
      body,
      icon,
      badge,
      tag, // Coalescing: substitui notificações anteriores da mesma conversa em caso de rajada
      renotify: true,
      requireInteraction: false,
      data,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[Service Worker] Erro ao processar payload do push:', err);
  }
});

// Manipulador de clique na Notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. Se já existir uma aba do Dental Finance aberta, foca nela e envia evento
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NAVIGATE_TO_WHATSAPP_CONVERSATION',
            tenantId: data.tenantId,
            conversationId: data.conversationId,
            contactId: data.contactId,
            messageId: data.messageId,
          });
          return;
        }
      }

      // 2. Se não houver aba aberta, abre uma nova janela com parâmetros na URL
      if (self.clients.openWindow) {
        const targetUrl = `/?action=open_wa&tenant_id=${encodeURIComponent(data.tenantId || '')}&conversation_id=${encodeURIComponent(
          data.conversationId || ''
        )}&contact_id=${encodeURIComponent(data.contactId || '')}`;
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
