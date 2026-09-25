/**
 * Cache compartilhado (por tenant) da base fiscal oficial do Contaju — vínculo + snapshots publicados.
 *
 * Dashboard, Simulador, Relatórios, DRE e Motores leem a MESMA base via `useFiscalBase`. O estado é sempre
 * indexado pelo `tenantId`: ao trocar de clínica nunca se reaproveita o dado do tenant anterior
 * (o novo tenant fica em LOADING até a leitura terminar). Respostas atrasadas de uma clínica não
 * sobrescrevem outra porque cada resposta grava só na chave do próprio tenant.
 */

import { ContabilexIntegrationService } from './contabilexIntegrationService';
import { supabase } from '../lib/supabaseClient';
import type { ContabilexSnapshotPayload, IntegrationClientLink } from '../types/contabilexIntegration';

export interface FiscalContabilexState {
  tenantId: string;
  status: 'LOADING' | 'READY' | 'ERROR';
  link: IntegrationClientLink | null;
  snapshots: ContabilexSnapshotPayload[];
  fetchedAt: number;
}

const states = new Map<string, FiscalContabilexState>();
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();
const channels = new Map<string, { channel: any; refs: number }>();
let version = 0;
const STALE_AFTER_MS = 60_000;

function emit() {
  version++;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ouvinte com erro não pode derrubar os demais */
    }
  });
}

export function isLoadableFiscalTenant(tenantId: string | null | undefined): tenantId is string {
  return Boolean(tenantId) && tenantId !== 'tenant_demo';
}

export function subscribeFiscalStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFiscalStoreVersion(): number {
  return version;
}

export function getFiscalContabilexState(tenantId: string | null | undefined): FiscalContabilexState | null {
  if (!tenantId) return null;
  return states.get(tenantId) || null;
}

/** Publica no store um resultado já lido por outra tela (ex.: Motores), mantendo todos em sincronia. */
export function publishFiscalContabilex(
  tenantId: string,
  link: IntegrationClientLink | null,
  snapshots: ContabilexSnapshotPayload[]
): void {
  if (!tenantId) return;
  states.set(tenantId, { tenantId, status: 'READY', link, snapshots, fetchedAt: Date.now() });
  emit();
}

export function loadFiscalContabilex(tenantId: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!isLoadableFiscalTenant(tenantId)) {
    // Demo / tenant ainda não resolvido: não há base oficial para ler.
    if (tenantId && !states.has(tenantId)) {
      states.set(tenantId, { tenantId, status: 'READY', link: null, snapshots: [], fetchedAt: Date.now() });
      emit();
    }
    return Promise.resolve();
  }

  const existing = states.get(tenantId);
  // Dado READY recente é reaproveitado; envelhecido (> STALE_AFTER_MS) é relido em segundo plano, mantendo o
  // último valor na tela enquanto isso (o vínculo com o Contaju não tem Realtime — muda de PENDING para ACTIVE).
  const isFresh = existing && existing.status === 'READY' && Date.now() - existing.fetchedAt < STALE_AFTER_MS;
  if (isFresh && !opts.force) return Promise.resolve();

  const pending = inflight.get(tenantId);
  if (pending) return pending;

  if (!existing) {
    states.set(tenantId, { tenantId, status: 'LOADING', link: null, snapshots: [], fetchedAt: 0 });
    emit();
  }

  const run = (async () => {
    try {
      const linkRes = await ContabilexIntegrationService.getLinkStatus(tenantId);
      if (linkRes.error) throw new Error(linkRes.error);
      const link = linkRes.link;
      let snapshots: ContabilexSnapshotPayload[] = [];
      if (link && link.status === 'ACTIVE') {
        const snapRes = await ContabilexIntegrationService.getPublishedSnapshots(tenantId, 12);
        if (snapRes.error) throw new Error(snapRes.error);
        snapshots = snapRes.snapshots;
      }
      states.set(tenantId, { tenantId, status: 'READY', link, snapshots, fetchedAt: Date.now() });
    } catch {
      const prev = states.get(tenantId);
      // Mantém o último dado bom (se houver) e sinaliza o erro; nunca vira "zero" silencioso.
      states.set(tenantId, {
        tenantId,
        status: 'ERROR',
        link: prev?.link ?? null,
        snapshots: prev?.snapshots ?? [],
        fetchedAt: Date.now(),
      });
    } finally {
      inflight.delete(tenantId);
      emit();
    }
  })();

  inflight.set(tenantId, run);
  return run;
}

/**
 * Mantém a base atualizada: Realtime das competências publicadas + releitura ao voltar o foco da aba.
 * Uso ref-counted: várias telas montadas compartilham UM canal por tenant.
 */
export function retainFiscalRealtime(tenantId: string): () => void {
  if (!isLoadableFiscalTenant(tenantId)) return () => {};

  let entry = channels.get(tenantId);
  if (!entry) {
    let channel: any = null;
    try {
      channel = supabase
        .channel(`fiscal_base_${tenantId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'accounting_monthly_snapshots',
            filter: `dental_tenant_id=eq.${tenantId}`,
          },
          () => {
            void loadFiscalContabilex(tenantId, { force: true });
          }
        )
        .subscribe();
    } catch {
      channel = null;
    }
    entry = { channel, refs: 0 };
    channels.set(tenantId, entry);
  }
  entry.refs++;

  let lastFocusRefresh = 0;
  const refreshOnFocus = () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastFocusRefresh < 30_000) return;
    lastFocusRefresh = now;
    void loadFiscalContabilex(tenantId, { force: true });
  };
  if (typeof window !== 'undefined') window.addEventListener('focus', refreshOnFocus);

  return () => {
    if (typeof window !== 'undefined') window.removeEventListener('focus', refreshOnFocus);
    const current = channels.get(tenantId);
    if (!current) return;
    current.refs--;
    if (current.refs <= 0) {
      try {
        if (current.channel) supabase.removeChannel(current.channel);
      } catch {
        /* noop */
      }
      channels.delete(tenantId);
    }
  };
}

/** Limpa o cache (logout / testes). */
export function resetFiscalStore(): void {
  states.clear();
  inflight.clear();
  emit();
}
