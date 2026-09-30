import { useEffect } from 'react';

/**
 * Expõe a altura visível real (descontando o teclado virtual do iOS) em `--app-vh`.
 * Telas de altura fixa (ex.: chat do WhatsApp) usam `h-[var(--app-vh,100dvh)]` para que o
 * composer nunca fique escondido atrás do teclado. Sem VisualViewport, cai em 100dvh.
 */
export function useVisualViewportHeight(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--app-vh', `${Math.round(vv.height)}px`);
      // iOS empurra a página para cima ao abrir o teclado; mantém o layout ancorado no topo
      if (vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--app-vh');
    };
  }, [enabled]);
}
