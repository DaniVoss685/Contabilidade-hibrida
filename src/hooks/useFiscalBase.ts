import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { PayrollHistoryEntry, Professional, Sale, TaxRulesSimples } from '../types';
import { db } from '../lib/db';
import { getTodayCivilDate } from '../lib/statusHelper';
import { CanonicalFiscalBase, resolveFiscalBase, resolveFiscalMode } from '../lib/fiscalBase';
import {
  getFiscalContabilexState,
  getFiscalStoreVersion,
  loadFiscalContabilex,
  retainFiscalRealtime,
  subscribeFiscalStore,
} from '../services/fiscalBaseStore';

interface UseFiscalBaseArgs {
  professional: Professional;
  sales: Sale[];
  payrollHistory: PayrollHistoryEntry[];
  taxRulesSimples?: TaxRulesSimples;
  year?: number;
  /** Competência escolhida explicitamente (Motores). Sem isso, usa a última competência fiscal fechada. */
  referenceCompetencyOverride?: string | null;
}

/**
 * Base fiscal canônica (RBT12 / FS12 / Fator R / Anexo / alíquota) da clínica ATIVA.
 * Rehidrata sozinha ao trocar de clínica, ao publicar nova competência (Realtime) e ao virar o mês —
 * sem F5. Enquanto a base oficial não chegou o estado é LOADING (nunca zeros classificados como Anexo V).
 */
export function useFiscalBase(args: UseFiscalBaseArgs): CanonicalFiscalBase {
  const { professional, sales, payrollHistory, taxRulesSimples, year, referenceCompetencyOverride } = args;

  const [tenantId, setTenantId] = useState<string>(() => db.getActiveTenantId());
  useEffect(() => {
    const sync = () => setTenantId(db.getActiveTenantId());
    sync();
    return db.subscribe(sync);
  }, []);

  const storeVersion = useSyncExternalStore(subscribeFiscalStore, getFiscalStoreVersion, getFiscalStoreVersion);

  const needsOfficialBase = resolveFiscalMode(professional) === 'CONTABILEX';
  useEffect(() => {
    if (!needsOfficialBase || !tenantId) return;
    void loadFiscalContabilex(tenantId);
    return retainFiscalRealtime(tenantId);
  }, [tenantId, needsOfficialBase]);

  const todayStr = getTodayCivilDate();

  return useMemo(() => {
    const state = getFiscalContabilexState(tenantId);
    return resolveFiscalBase({
      todayStr,
      professional,
      contabilex: {
        loaded: state ? state.status !== 'LOADING' : false,
        loadError: state?.status === 'ERROR',
        linkStatus: state?.link?.status ?? null,
        snapshots: state?.snapshots ?? [],
      },
      sales,
      payrollHistory,
      taxRules: taxRulesSimples,
      year,
      referenceCompetencyOverride,
    });
    // storeVersion invalida o memo quando o store muda; tenantId garante que nunca se lê a clínica anterior.
  }, [tenantId, storeVersion, todayStr, professional, sales, payrollHistory, taxRulesSimples, year, referenceCompetencyOverride]);
}
