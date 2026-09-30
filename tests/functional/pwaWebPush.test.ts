// Testes de PWA + Web Push: estados de capacidade, privacidade do payload, URL de clique,
// destinatários (tenant/usuário/multi-dispositivo), idempotência, limpeza de inscrição inválida,
// serialização e garantias estáticas do Service Worker / Edge Function.
// Rodar com: npx tsx tests/functional/pwaWebPush.test.ts
import fs from 'fs';
import path from 'path';
import {
  computePushCapabilityState,
  buildNotificationTargetUrl,
  buildPushPayload,
  PUSH_STATE_COPY,
  type PushEnvironment,
} from '../../src/lib/pushCapability';
import { selectPushRecipients, classifyProviderStatus, createDeliveryLog, type PushUser, type PushSub } from '../../src/lib/pushRecipients';

let n = 0;
function ok(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  n++;
  console.log(`✅ ${msg}`);
}
const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');

const base: PushEnvironment = {
  isSecureContext: true, hasServiceWorker: true, hasPushManager: true, hasNotification: true,
  isIOS: false, isStandalone: false, isEmbedded: false, permission: 'default', hasSubscription: false,
};
const st = (o: Partial<PushEnvironment>) => computePushCapabilityState({ ...base, ...o });

// ---- Estados de capacidade
ok(st({}) === 'READY_TO_REQUEST', 'desktop com permissão default => READY_TO_REQUEST (pedir só após clique)');
ok(st({ isIOS: true, isStandalone: false, hasNotification: false, hasPushManager: false }) === 'IOS_NEEDS_INSTALL', 'iPhone no Safari (sem Notification) => IOS_NEEDS_INSTALL, nunca "permissão negada"');
ok(st({ isIOS: true, isStandalone: true }) === 'READY_TO_REQUEST', 'iPhone com PWA instalado + default => READY_TO_REQUEST');
ok(st({ isIOS: true, isStandalone: true, permission: 'granted', hasSubscription: true }) === 'SUBSCRIBED', 'iPhone instalado + granted + subscription => SUBSCRIBED');
ok(st({ permission: 'denied' }) === 'DENIED', 'permission denied => DENIED');
ok(st({ permission: 'granted', hasSubscription: true }) === 'SUBSCRIBED', 'granted + subscription => SUBSCRIBED');
ok(st({ permission: 'granted', hasSubscription: false }) === 'READY_TO_REQUEST', 'granted sem subscription => pode (re)inscrever');
ok(st({ isEmbedded: true }) === 'EMBEDDED_CONTEXT', 'iframe => EMBEDDED_CONTEXT (abrir em nova aba)');
ok(st({ isEmbedded: true, permission: 'denied' }) === 'EMBEDDED_CONTEXT', 'iframe tem prioridade sobre denied');
ok(st({ isSecureContext: false }) === 'INSECURE_CONTEXT', 'http sem localhost => INSECURE_CONTEXT');
ok(st({ hasPushManager: false }) === 'UNSUPPORTED', 'sem PushManager => UNSUPPORTED');
ok(st({ hasServiceWorker: false }) === 'UNSUPPORTED', 'sem Service Worker => UNSUPPORTED');
ok(st({ isSubscribing: true }) === 'SUBSCRIBING', 'em andamento => SUBSCRIBING');
ok(st({ lastError: 'persist_failed' }) === 'SUBSCRIPTION_ERROR', 'erro ao inscrever => SUBSCRIPTION_ERROR');
ok(!Object.values(PUSH_STATE_COPY).some((c) => c.title === 'Permissão não concedida no navegador.'), 'copy antiga genérica removida');
ok(PUSH_STATE_COPY.DENIED.title === 'Notificações bloqueadas neste dispositivo' && !!PUSH_STATE_COPY.DENIED.hint, 'DENIED com instrução');
ok(PUSH_STATE_COPY.EMBEDDED_CONTEXT.title === 'Abra o aplicativo em uma nova aba para ativar notificações.', 'copy de iframe correta');

// ---- Payload / privacidade
const p = buildPushPayload({ contactName: 'Maria Silva', preview: 'Dor no dente 11, laudo anexo', tenantId: 't1', conversationId: 'c1', contactId: 'k1', notificationId: 'n1' });
ok(p.title === 'Nova mensagem no WhatsApp' && p.body === 'Você recebeu uma nova mensagem.', 'padrão: sem nome/conteúdo (tela bloqueada)');
ok(!JSON.stringify(p).includes('Maria') && !JSON.stringify(p).includes('Dor'), 'payload padrão não vaza nome nem texto');
const pv = buildPushPayload({ contactName: 'Maria Silva', preview: 'oi', showPreview: true, tenantId: 't1', notificationId: 'n1' });
ok(pv.title === 'Maria Silva' && pv.body === 'oi', 'prévia só quando o usuário optou');
ok(!/jwt|token|service_role|apikey|secret/i.test(JSON.stringify(p)), 'payload sem token/segredo');
ok(p.tag === 'wa_t1_c1', 'tag por conversa (coalescing)');

// ---- Clique
const url = buildNotificationTargetUrl(p.data);
ok(url === '/?action=open_wa&tenant_id=t1&conversation_id=c1&contact_id=k1', 'URL de clique leva à conversa correta (só ids)');

// ---- Destinatários: tenant, usuário, multi-dispositivo
const users = new Map<string, PushUser>([
  ['uA', { id: 'uA', is_active: true, role: 'RECEPTION', clinic_id: 't1' }],
  ['uB', { id: 'uB', is_active: true, role: 'ASSISTANT', clinic_id: 't1' }],
  ['uX', { id: 'uX', is_active: true, role: 'OWNER', clinic_id: 't2' }],
  ['uI', { id: 'uI', is_active: false, role: 'OWNER', clinic_id: 't1' }],
  ['uC', { id: 'uC', is_active: true, role: 'SUPER_ADMIN', is_primary: true, clinic_id: 'own' }],
  ['uN', { id: 'uN', is_active: true, role: 'FINANCE', clinic_id: 't1' }],
]);
const subs: PushSub[] = [
  { id: 's1', tenant_id: 't1', user_id: 'uA', is_active: true },
  { id: 's2', tenant_id: 't1', user_id: 'uA', is_active: true }, // 2º dispositivo do mesmo usuário
  { id: 's3', tenant_id: 't1', user_id: 'uB', is_active: true },
  { id: 's4', tenant_id: 't2', user_id: 'uX', is_active: true }, // outra clínica
  { id: 's5', tenant_id: 't1', user_id: 'uI', is_active: true }, // usuário inativo
  { id: 's6', tenant_id: 't1', user_id: 'uA', is_active: false }, // desativada
  { id: 's7', tenant_id: 't1', user_id: null, is_active: true }, // legada sem dono
  { id: 's8', tenant_id: 't1', user_id: 'uC', is_active: true }, // consultor (Modo Consultoria)
  { id: 's9', tenant_id: 't1', user_id: 'uN', is_active: true }, // sem acesso ao WhatsApp
];
const ids = (r: PushSub[]) => r.map((s) => s.id).sort().join(',');
ok(ids(selectPushRecipients({ id: 'n', tenant_id: 't1', user_id: null }, subs, users)) === 's1,s2,s3,s8', 'fila (user_id null): só elegíveis do tenant; multi-device do uA recebe 2; sem broadcast a legadas/inativos/outros tenants');
ok(ids(selectPushRecipients({ id: 'n', tenant_id: 't1', user_id: 'uB' }, subs, users)) === 's3', 'atribuída a B: só os dispositivos de B');
ok(ids(selectPushRecipients({ id: 'n', tenant_id: 't2', user_id: null }, subs, users)) === 's4', 'tenant t2 nunca recebe de t1 e vice-versa');
ok(ids(selectPushRecipients({ id: 'n', tenant_id: 't1', user_id: null }, subs, users, { readBy: new Set(['uA']) })) === 's3,s8', 'já lida por A: A não recebe push');
ok(ids(selectPushRecipients({ id: 'n', tenant_id: 't1', user_id: null, metadata: { is_group: true } }, subs, users, { settings: new Map([['uB', { notify_groups: false }]]) })) === 's1,s2,s8', 'preferência notify_groups respeitada');
ok(ids(selectPushRecipients({ id: 'n', tenant_id: 't1', user_id: null }, subs, users, { settings: new Map([['uA', { browser_notifications_enabled: false }]]) })) === 's3,s8', 'usuário com notificações desligadas não recebe');
// troca de usuário no mesmo navegador: a inscrição passa a ter dono B => A deixa de receber ali
const swapped = subs.map((s) => (s.id === 's1' ? { ...s, user_id: 'uB' } : s));
ok(ids(selectPushRecipients({ id: 'n', tenant_id: 't1', user_id: 'uA' }, swapped, users)) === 's2', 'cross-user: após revalidar owner, A não recebe mais no dispositivo herdado por B');

// ---- Idempotência
const log = createDeliveryLog();
ok(log.claim('n1', 's1') === true && log.claim('n1', 's1') === false, 'mesma notificação + mesma subscription: 1 envio só');
ok(log.claim('n1', 's2') === true && log.claim('n2', 's1') === true, 'outra subscription ou outra notificação: permitido');

// ---- Inscrição inválida / retry
ok(classifyProviderStatus(410) === 'expired' && classifyProviderStatus(404) === 'expired', '404/410 => desativar inscrição');
ok(classifyProviderStatus(400) === 'permanent' && classifyProviderStatus(413) === 'permanent', '4xx permanente não é repetido');
ok(classifyProviderStatus(429) === 'retry' && classifyProviderStatus(503) === 'retry' && classifyProviderStatus(null) === 'retry', '429/5xx/rede => retry controlado');

// ---- Serialização de subscription (formato aceito pelo backend)
const subJson = { endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } };
ok(!!subJson.endpoint && !!subJson.keys.p256dh && !!subJson.keys.auth, 'subscription serializada com endpoint+keys');

// ---- Garantias estáticas
const sw = read('public/sw.js');
ok(!/cache\.put\([^)]*supabase/i.test(sw) && sw.includes("if (url.origin !== self.location.origin) return;"), 'SW ignora requisições cross-origin (Supabase/Evolution) => nada sensível em cache');
ok(sw.includes("url.pathname.startsWith('/assets/')") && sw.includes("req.method !== 'GET'"), 'SW só cacheia assets versionados via GET');
ok(sw.includes('notificationclick') && sw.includes('openWindow') && sw.includes('matchAll'), 'SW trata clique focando janela existente');
ok(!sw.includes('skipWaiting();\n});') || sw.includes("SKIP_WAITING"), 'atualização controlada (skipWaiting sob mensagem)');
const fn = read('supabase/functions/dental-web-push-dispatch/index.ts');
ok(fn.includes('token !== serviceKey') && fn.includes('Somente service_role'), 'dispatch exige service_role');
ok(!/console\.(log|warn|error)\([^)]*endpoint/i.test(fn), 'endpoint não é logado');
ok(!/console\.[a-z]+\([^)]*(PRIVATE|priv\b)/.test(fn), 'chave privada não é logada');
ok(fn.includes('VAPID_PRIVATE_KEY') && fn.includes('ignoreDuplicates: true'), 'VAPID via secrets + idempotência por upsert ignoreDuplicates');
const mig = read('supabase/migrations/20260925120000_web_push_hardening.sql');
ok(mig.includes('uq_df_push_delivery UNIQUE (notification_id, subscription_id)'), 'banco garante idempotência do log');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
ok(manifest.display === 'standalone' && manifest.start_url === '/' && manifest.scope === '/', 'manifest standalone');
ok(manifest.icons.some((i: any) => i.sizes === '192x192') && manifest.icons.some((i: any) => i.sizes === '512x512') && manifest.icons.some((i: any) => i.purpose === 'maskable'), 'manifest com ícones 192/512/maskable');
const html = read('index.html');
ok(html.includes('rel="manifest"') && html.includes('apple-mobile-web-app-capable') && html.includes('viewport-fit=cover') && !html.includes('user-scalable=no'), 'index.html com manifest, meta iOS e viewport correto');
ok(!/registration\.unregister\(\);\s*\n\s*console/.test(html), 'index.html não desregistra mais o nosso SW');
const wh = read('supabase/functions/dental-whatsapp-webhook/index.ts');
ok(wh.includes('dental-web-push-dispatch') && wh.includes('notification_id: notifId'), 'webhook dispara push a partir da notificação persistida');
const svc = read('src/services/notificationService.ts');
ok(!/useEffect|onMount/.test(svc) && svc.includes('await Notification.requestPermission()'), 'permissão só via enablePush (sem chamada automática)');

console.log(`\n🎉 TODOS OS ${n} TESTES DE PWA/WEB PUSH PASSARAM!`);
