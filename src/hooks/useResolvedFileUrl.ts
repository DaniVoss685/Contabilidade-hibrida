import { useState, useEffect, useCallback } from 'react';
import { StorageService } from '../lib/storageService';

export interface UseResolvedFileUrlOptions {
  forceRefresh?: boolean;
  expiresInSeconds?: number;
}

export interface UseResolvedFileUrlResult {
  url: string | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Hook do React para resolver de forma segura e reativa uma Signed URL temporária
 * para qualquer anexo clínico armazenado no bucket privado Supabase Storage (dental-private).
 * 
 * Funcionalidades:
 * - Deduplica chamadas repetidas e reaproveita cache em memória (TTL de 2 horas).
 * - Suporta URLs pré-existentes (blob:, data:, http://, https://).
 * - Fornece feedback claro de loading, url e error com método de retry.
 */
export function useResolvedFileUrl(
  storagePath?: string | null,
  initialUrl?: string | null,
  options?: UseResolvedFileUrlOptions
): UseResolvedFileUrlResult {
  // Se initialUrl for um link completo e não expirável (ex: blob: de upload recente), usa de imediato
  const hasDirectUrl = Boolean(
    initialUrl &&
    (initialUrl.startsWith('blob:') || initialUrl.startsWith('data:') || initialUrl.startsWith('http'))
  );

  const [url, setUrl] = useState<string | null>(hasDirectUrl ? initialUrl! : null);
  const [loading, setLoading] = useState<boolean>(!hasDirectUrl && Boolean(storagePath));
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const retry = useCallback(() => {
    if (storagePath) {
      StorageService.invalidateSignedUrlCache(storagePath);
    }
    setReloadKey((k) => k + 1);
  }, [storagePath]);

  useEffect(() => {
    let isMounted = true;

    // Se já temos uma URL válida (ex: blob após upload), prioriza
    if (hasDirectUrl && reloadKey === 0) {
      setUrl(initialUrl!);
      setLoading(false);
      setError(null);
      return;
    }

    if (!storagePath) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    StorageService.resolvePrivateFileUrl(storagePath, {
      forceRefresh: reloadKey > 0 || options?.forceRefresh,
      expiresInSeconds: options?.expiresInSeconds || 7200,
    })
      .then((resolvedUrl) => {
        if (!isMounted) return;
        if (resolvedUrl) {
          setUrl(resolvedUrl);
          setError(null);
        } else {
          setError('Não foi possível gerar a URL segura do arquivo.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err?.message || 'Erro ao carregar anexo.');
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [storagePath, initialUrl, hasDirectUrl, reloadKey, options?.forceRefresh, options?.expiresInSeconds]);

  return { url, loading, error, retry };
}
