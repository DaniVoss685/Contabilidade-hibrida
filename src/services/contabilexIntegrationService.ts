/**
 * DENTAL FINANCE - SERVIÇO DE INTEGRAÇÃO CONTÁBILEX (FASE 1)
 *
 * Repositório: Dental Finance (Contabilidade-hibrida dentista)
 * Conexão segura via RPC e tabelas de integração dedicadas.
 * Blindagem total: não consome senhas ou dados fiscais confidenciais de outras tabelas.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../lib/supabaseClient';
import {
  IntegrationClientLink,
  ContabilexSnapshotPayload,
  CompetencyConfirmationRecord,
  CompetencyConfirmationStatus,
  FactorRCalculationResult,
  normalizeCnpj,
  formatCnpj,
  competencyToDisplay,
} from '../types/contabilexIntegration';

const REST_URL = `${SUPABASE_URL}/rest/v1`;

interface FetchResult<T> {
  data: T | null;
  error: string | null;
}

async function apiFetch<T>(endpoint: string, options: {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  headers?: Record<string, string>;
  body?: any;
} = {}): Promise<FetchResult<T>> {
  const { method = 'GET', headers = {}, body } = options;

  try {
    let authHeader = headers.Authorization;
    if (!authHeader) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        authHeader = token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`;
      } catch {
        authHeader = `Bearer ${SUPABASE_ANON_KEY}`;
      }
    }

    const res = await fetch(`${REST_URL}/${endpoint}`, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { data: null, error: `HTTP ${res.status}: ${errText || res.statusText}` };
    }

    if (res.status === 204) {
      return { data: null, error: null };
    }

    const text = await res.text();
    if (!text) {
      return { data: null, error: null };
    }

    try {
      const json = JSON.parse(text);
      return { data: json as T, error: null };
    } catch {
      return { data: null, error: null };
    }
  } catch (err: any) {
    return { data: null, error: err?.message || 'Erro de conexão com o banco de dados' };
  }
}

export const ContabilexIntegrationService = {
  normalizeCnpj,
  formatCnpj,

  /**
   * Solicita vínculo de integração do Dental Finance com o Contábilex via CNPJ da clínica.
   * Cria/atualiza registro com status 'PENDING' para aprovação pelo operador contábil.
   */
  async requestLink(
    dentalTenantId: string,
    rawCnpj: string,
    clinicName?: string
  ): Promise<{ success: boolean; link?: IntegrationClientLink; error?: string }> {
    const cleanCnpj = normalizeCnpj(rawCnpj);
    if (!cleanCnpj || cleanCnpj.length !== 14 || /^0+$/.test(cleanCnpj)) {
      return { success: false, error: 'CNPJ inválido para solicitação de vínculo.' };
    }

    if (!dentalTenantId || dentalTenantId === 'tenant_demo') {
      return { success: false, error: 'Vínculo oficial requer uma clínica autenticada no Dental Finance.' };
    }

    const payload = {
      dental_tenant_id: dentalTenantId,
      cnpj: cleanCnpj,
      clinic_name: clinicName || null,
      status: 'PENDING',
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const res = await apiFetch<IntegrationClientLink[]>('integration_client_links?on_conflict=dental_tenant_id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: payload,
    });

    if (res.error) {
      return { success: false, error: res.error };
    }

    const link = res.data && res.data.length > 0 ? res.data[0] : undefined;
    return { success: true, link };
  },

  /**
   * Consulta o status do vínculo atual da clínica com o Contábilex.
   */
  async getLinkStatus(dentalTenantId: string): Promise<{ link: IntegrationClientLink | null; error?: string }> {
    if (!dentalTenantId) {
      return { link: null, error: 'Tenant ID não informado' };
    }

    const res = await apiFetch<IntegrationClientLink[]>(
      `integration_client_links?dental_tenant_id=eq.${encodeURIComponent(dentalTenantId)}&limit=1`
    );

    if (res.error) {
      return { link: null, error: res.error };
    }

    const link = res.data && res.data.length > 0 ? res.data[0] : null;
    return { link, error: null };
  },

  /**
   * Consome snapshots contábeis publicados via RPC SECURITY DEFINER get_dental_tenant_snapshots.
   */
  async getPublishedSnapshots(
    dentalTenantId: string,
    limit: number = 12
  ): Promise<{ snapshots: ContabilexSnapshotPayload[]; error?: string }> {
    if (!dentalTenantId) {
      return { snapshots: [], error: 'Tenant ID não informado' };
    }

    const res = await apiFetch<ContabilexSnapshotPayload[]>('rpc/get_dental_tenant_snapshots', {
      method: 'POST',
      body: {
        p_dental_tenant_id: dentalTenantId,
        p_limit: limit,
      },
    });

    if (res.error) {
      return { snapshots: [], error: res.error };
    }

    const rawList = Array.isArray(res.data) ? res.data : [];

    // Mapeamento normalizado garantindo tipos numéricos
    const snapshots: ContabilexSnapshotPayload[] = rawList.map((item) => ({
      id: item.id,
      contabilex_client_id: item.contabilex_client_id,
      dental_tenant_id: item.dental_tenant_id,
      competency: item.competency,
      gross_revenue: Number(item.gross_revenue || 0),
      payroll_total: Number(item.payroll_total || 0),
      pro_labore: null, // Regra: pró-labore não existe isolado, sempre null
      fgts: item.fgts !== null ? Number(item.fgts) : null,
      inss: item.inss !== null ? Number(item.inss) : null,
      irrf: item.irrf !== null ? Number(item.irrf) : null,
      factor_r_payroll_base: Number(item.factor_r_payroll_base || 0),
      das_total: item.das_total !== null ? Number(item.das_total) : null,
      effective_rate: item.effective_rate !== null ? Number(item.effective_rate) : null,
      version: Number(item.version || 1),
      status: item.status,
      content_hash: item.content_hash,
      published_at: item.published_at,
      updated_at: item.updated_at,
      source: item.source || 'contabilex',
    }));

    return { snapshots, error: null };
  },

  /**
   * Dispara a sincronização real server-side das competências contábeis fechadas no Contaju.
   * Executa a RPC SECURITY DEFINER sync_dental_tenant_accounting_snapshots.
   */
  async syncTenantSnapshots(
    dentalTenantId: string
  ): Promise<{
    success: boolean;
    changed?: boolean;
    newCount?: number;
    updatedCount?: number;
    unchangedCount?: number;
    totalCompetencies?: number;
    error?: string;
  }> {
    if (!dentalTenantId) {
      return { success: false, error: 'Tenant ID não informado' };
    }

    const res = await apiFetch<{
      success: boolean;
      changed?: boolean;
      new_count?: number;
      updated_count?: number;
      unchanged_count?: number;
      total_competencies?: number;
      error?: string;
    }>('rpc/sync_dental_tenant_accounting_snapshots', {
      method: 'POST',
      body: {
        p_dental_tenant_id: dentalTenantId,
      },
    });

    if (res.error) {
      return { success: false, error: res.error };
    }

    const data = res.data;
    if (!data || data.success === false) {
      return { success: false, error: data?.error || 'Erro ao sincronizar dados com o Contaju' };
    }

    return {
      success: true,
      changed: Boolean(data.changed),
      newCount: Number(data.new_count || 0),
      updatedCount: Number(data.updated_count || 0),
      unchangedCount: Number(data.unchanged_count || 0),
      totalCompetencies: Number(data.total_competencies || 0),
    };
  },

  /**
   * Obtém as revisões/confirmações efetuadas pelo usuário na clínica.
   */
  async getConfirmations(
    dentalTenantId: string
  ): Promise<{ confirmations: Record<string, CompetencyConfirmationRecord>; error?: string }> {
    if (!dentalTenantId) {
      return { confirmations: {}, error: 'Tenant ID não informado' };
    }

    const res = await apiFetch<CompetencyConfirmationRecord[]>(
      `df_accounting_confirmations?tenant_id=eq.${encodeURIComponent(dentalTenantId)}`
    );

    if (res.error) {
      return { confirmations: {}, error: res.error };
    }

    const map: Record<string, CompetencyConfirmationRecord> = {};
    if (Array.isArray(res.data)) {
      res.data.forEach((rec) => {
        map[rec.competency] = rec;
      });
    }

    return { confirmations: map, error: null };
  },

  /**
   * Confirma e revisa formalmente uma competência recebida da contabilidade.
   */
  async confirmCompetency(
    dentalTenantId: string,
    competency: string,
    snapshotVersion: number,
    confirmedBy: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const payload = {
      tenant_id: dentalTenantId,
      competency,
      snapshot_version_confirmed: snapshotVersion,
      confirmed_by: confirmedBy,
      confirmed_at: new Date().toISOString(),
      status: 'CONFIRMED',
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    const res = await apiFetch('df_accounting_confirmations?on_conflict=tenant_id,competency', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: payload,
    });

    if (res.error) {
      return { success: false, error: res.error };
    }

    return { success: true };
  },

  /**
   * Obtém histórico de versões de uma competência para fins de comparação (antes vs depois).
   */
  async getSnapshotHistory(
    dentalTenantId: string,
    competency: string
  ): Promise<ContabilexSnapshotPayload[]> {
    const res = await apiFetch<any[]>(
      `accounting_monthly_snapshots?dental_tenant_id=eq.${encodeURIComponent(dentalTenantId)}&competency=eq.${encodeURIComponent(competency)}&order=version.desc`
    );
    if (res.error || !Array.isArray(res.data)) {
      return [];
    }
    return res.data.map((item) => ({
      id: item.id,
      contabilex_client_id: item.contabilex_client_id,
      dental_tenant_id: item.dental_tenant_id,
      competency: item.competency,
      gross_revenue: Number(item.gross_revenue || 0),
      payroll_total: Number(item.payroll_total || 0),
      pro_labore: null,
      fgts: item.fgts !== null ? Number(item.fgts) : null,
      inss: item.inss !== null ? Number(item.inss) : null,
      irrf: item.irrf !== null ? Number(item.irrf) : null,
      factor_r_payroll_base: Number(item.factor_r_payroll_base || 0),
      das_total: item.das_total !== null ? Number(item.das_total) : null,
      effective_rate: item.effective_rate !== null ? Number(item.effective_rate) : null,
      version: Number(item.version || 1),
      status: item.status,
      content_hash: item.content_hash,
      published_at: item.published_at,
      updated_at: item.updated_at,
      source: 'contabilex',
    }));
  },

  /**
   * Avalia o status de revisão de uma competência.
   * Se Contábilex publicou nova versão (ex: v2 após v1 ter sido confirmada),
   * retorna 'REVISION_REQUIRED'.
   */
  evaluateReviewStatus(
    snapshot: ContabilexSnapshotPayload,
    confirmation?: CompetencyConfirmationRecord
  ): CompetencyConfirmationStatus {
    if (!confirmation) {
      return 'PENDING_REVIEW';
    }

    if (confirmation.snapshot_version_confirmed < snapshot.version) {
      return 'REVISION_REQUIRED';
    }

    return 'CONFIRMED';
  },

  /**
   * Motor de cálculo fiscal a partir dos snapshots contábeis fornecidos pelo Contábilex:
   * - RBT12 = Soma dos revenues válidos dos 12 meses anteriores
   * - FS12 = Soma dos factor_r_payroll_base válidos dos 12 meses anteriores
   * - Fator R = FS12 / RBT12
   * - Enquadramento: >= 28% -> Anexo III, < 28% -> Anexo V
   * - Ausência de meses históricos não é completada com R$ 0,00 fictício.
   */
  calculateFactorR(
    snapshots: ContabilexSnapshotPayload[],
    targetCompetency?: string
  ): FactorRCalculationResult {
    // Ordena competências cronologicamente ('YYYY-MM')
    const sorted = [...snapshots].sort((a, b) => a.competency.localeCompare(b.competency));

    let windowSnapshots = sorted;

    if (targetCompetency) {
      // Considera os snapshots estritamente anteriores à competência alvo (até 12 meses)
      const previousMonths = sorted.filter((s) => s.competency < targetCompetency);
      windowSnapshots = previousMonths.slice(-12);
    } else {
      windowSnapshots = sorted.slice(-12);
    }

    const count = windowSnapshots.length;

    const rbt12 = windowSnapshots.reduce((acc, curr) => acc + (Number(curr.gross_revenue) || 0), 0);
    const fs12 = windowSnapshots.reduce((acc, curr) => acc + (Number(curr.factor_r_payroll_base) || 0), 0);

    const factorR = rbt12 > 0 ? fs12 / rbt12 : 0;
    const factorRPercent = Number((factorR * 100).toFixed(2));
    const isAnexoIII = factorR >= 0.28;
    const annex: 'ANEXO_III' | 'ANEXO_V' = isAnexoIII ? 'ANEXO_III' : 'ANEXO_V';

    const missingMonthsMessage =
      count === 12
        ? 'Base completa com 12 competências apuradas.'
        : `${count} competência${count !== 1 ? 's' : ''} disponível${count !== 1 ? 'is' : ''} na origem contábil.`;

    return {
      rbt12,
      fs12,
      factorR,
      factorRPercent,
      isAnexoIII,
      annex,
      competenciesCount: count,
      isPartialHistory: count < 12,
      missingMonthsMessage,
      proLaboreNote: 'Base da folha consolidada oficialmente pela contabilidade.',
    };
  },

  /**
   * Desconecta o vínculo entre a clínica e o Contábilex.
   */
  async disconnectLink(dentalTenantId: string): Promise<{ success: boolean; error?: string }> {
    if (!dentalTenantId) {
      return { success: false, error: 'Tenant ID não informado' };
    }

    const res = await apiFetch(`integration_client_links?dental_tenant_id=eq.${encodeURIComponent(dentalTenantId)}`, {
      method: 'PATCH',
      body: {
        status: 'DISCONNECTED',
        updated_at: new Date().toISOString(),
      },
    });

    if (res.error) {
      return { success: false, error: res.error };
    }

    return { success: true };
  },
};
