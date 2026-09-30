/* Service Worker do Dental Finance.
 *
 * Responsabilidades: (1) Web Push -> notificação do sistema; (2) clique na notificação;
 * (3) shell offline mínimo; (4) ciclo de atualização previsível.
 *
 * SEGURANÇA: este SW NÃO cacheia respostas de API/Supabase/Auth/Edge Functions/pacientes/
 * WhatsApp/financeiro. Apenas assets estáticos versionados do próprio app (/assets/*) e a página
 * offline. Qualquer outra requisição vai direto à rede (comportamento padrão do navegador).
 */
const SW_VERSION = 'v2.0.0';
const STATIC_CACHE = `df-static-${SW_VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icon-192.png', '/favicon.svg'];

self.addEventListener('install', (event) => {
  // Sem skipWaiting automático: o app avisa o usuário e pede a troca (evita reload surpresa).
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('df-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, Evolution, Google etc.: rede pura

  // Navegação: rede primeiro; sem conexão mostra a página offline (nunca dados em cache)
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Assets versionados do bundle (nome com hash => imutáveis): cache-first seguro
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
  }
  // Todo o resto: sem interceptação
});

// ---------------------------------------------------------------- Web Push
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  // Nunca confiar em conteúdo sensível: título/corpo já vêm sanitizados do servidor.
  const data = payload.data || {};
  const title = payload.title || 'Nova mensagem no WhatsApp';
  const options = {
    body: payload.body || 'Você recebeu uma nova mensagem.',
    icon: '/icon-192.png',
    badge: '/favicon-32x32.png',
    tag: payload.tag || `wa_${data.tenantId || ''}_${data.conversationId || ''}`, // agrupa por conversa
    renotify: true,
    data,
  };
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Badge (quando suportado); a contagem canônica continua vindo do backend quando o app abre
      if (self.navigator && 'setAppBadge' in self.navigator) {
        try { await self.navigator.setAppBadge(); } catch (e) { /* ignore */ }
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const q = new URLSearchParams({ action: 'open_wa' });
  if (data.tenantId) q.set('tenant_id', data.tenantId);
  if (data.conversationId) q.set('conversation_id', data.conversationId);
  if (data.contactId) q.set('contact_id', data.contactId);
  const target = `/?${q.toString()}`;

  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Reaproveita a janela existente (nunca abre várias)
      const existing = list.find((c) => 'focus' in c);
      if (existing) {
        await existing.focus();
        existing.postMessage({
          type: 'NAVIGATE_TO_WHATSAPP_CONVERSATION',
          tenantId: data.tenantId,
          conversationId: data.conversationId,
          contactId: data.contactId,
        });
        return;
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});

// Endpoint rotacionado pelo provedor: o app re-inscreve ao abrir (ver pwa.ts); nada a fazer aqui.
self.addEventListener('pushsubscriptionchange', () => {});
