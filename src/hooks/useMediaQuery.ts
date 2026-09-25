import { useEffect, useState } from 'react';

/**
 * Breakpoints canônicos (espelham os do Tailwind): sm 640, md 768, lg 1024.
 * Abaixo de `lg` o app usa o layout mobile/tablet (sidebar em drawer).
 */
export const MEDIA_QUERIES = {
  desktop: '(min-width: 1024px)',
  tabletUp: '(min-width: 768px)',
  phone: '(max-width: 767px)',
} as const;

const getMatch = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;

/** Reativo a resize/rotação — nunca exige F5. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => getMatch(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export const useIsDesktop = () => useMediaQuery(MEDIA_QUERIES.desktop);
export const useIsPhone = () => useMediaQuery(MEDIA_QUERIES.phone);
