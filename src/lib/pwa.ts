/**
 * PWA: registro do Service Worker, prompt de instalação e ciclo de atualização.
 * Nada aqui pede permissão de notificação — isso só acontece em resposta a um toque do usuário.
 */
import { readPushEnvironment } from './pushCapability';

export const SW_URL = '/sw.js';

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());
export const subscribePwa = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let registration: ServiceWorkerRegistration | null = null;
let deferredInstallPrompt: any = null;
let updateReady = false;
let registering: Promise<ServiceWorkerRegistration | null> | null = null;

export const getRegistration = () => registration;
export const isUpdateReady = () => updateReady;
export const canPromptInstall = () => Boolean(deferredInstallPrompt);
export const isInstalledStandalone = () => readPushEnvironment().isStandalone;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registering) return registering;
  registering = (async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) return null;
    try {
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' });
      registration = reg;
      const watch = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          // "installed" com um controller ativo = nova versão aguardando
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            updateReady = true;
            notify();
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        updateReady = true;
        notify();
      }
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // Verifica atualização ao voltar para o app (sem polling agressivo)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
      return reg;
    } catch (err) {
      console.warn('[PWA] Falha ao registrar Service Worker:', (err as Error)?.message);
      return null;
    }
  })();
  return registering;
}

/** Aplica a nova versão: 1 único reload, protegido contra loop. */
export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function initInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // nunca força o prompt: guardamos para uma ação contextual
    deferredInstallPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    notify();
  });
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredInstallPrompt) return 'unavailable';
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  notify();
  return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
}
