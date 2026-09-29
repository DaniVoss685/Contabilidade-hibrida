/**
 * DENTAL FINANCE — CONFIGURAÇÃO GLOBAL DA ASSINATURA DO CONTADOR
 *
 * Linha única (id='default') em df_accountant_signature, compartilhada por TODAS as
 * clínicas com integração Contábilex ativa (é sempre o mesmo escritório assinando).
 * Leitura: qualquer usuário autenticado e ativo. Escrita: só equipe do escritório
 * (is_primary/SUPER_ADMIN) — a RLS do banco já garante isso; o frontend só espelha
 * a mesma regra para não oferecer a UI de edição a quem não pode salvar.
 *
 * A imagem da assinatura é um PNG pequeno guardado como data URL (base64) na própria
 * linha — não usa o bucket dental-private porque as policies de storage.objects lá são
 * todas ancoradas em (storage.foldername(name))[1] = tenant_id, e este dado é global
 * (sem tenant). Ver migration 20260929120000_accountant_signature_config.sql.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from '../lib/supabaseClient';

const REST_URL = `${SUPABASE_URL}/rest/v1`;

export interface AccountantSignatureConfig {
  accountantName: string;
  crcRegistration: string;
  accountantCpf: string;
  signatureImageDataUrl: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

const EMPTY_CONFIG: AccountantSignatureConfig = {
  accountantName: '',
  crcRegistration: '',
  accountantCpf: '',
  signatureImageDataUrl: null,
  updatedAt: null,
  updatedByName: null,
};

async function authHeader(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    return token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`;
  } catch {
    return `Bearer ${SUPABASE_ANON_KEY}`;
  }
}

function mapRow(row: any): AccountantSignatureConfig {
  return {
    accountantName: row?.accountant_name || '',
    crcRegistration: row?.crc_registration || '',
    accountantCpf: row?.accountant_cpf || '',
    signatureImageDataUrl: row?.signature_image_data_url || null,
    updatedAt: row?.updated_at || null,
    updatedByName: row?.updated_by_name || null,
  };
}

export const AccountantSignatureService = {
  /** true quando nome, CRC, CPF e a imagem da assinatura estão todos preenchidos. */
  isComplete(config: AccountantSignatureConfig | null | undefined): boolean {
    return Boolean(
      config &&
        config.accountantName.trim() &&
        config.crcRegistration.trim() &&
        config.accountantCpf.trim() &&
        config.signatureImageDataUrl
    );
  },

  /** Leitura: qualquer usuário autenticado e ativo (RLS df_accountant_signature_select). */
  async getConfig(): Promise<{ config: AccountantSignatureConfig; error?: string }> {
    try {
      const res = await fetch(`${REST_URL}/df_accountant_signature?id=eq.default&select=*`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: await authHeader(),
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { config: EMPTY_CONFIG, error: `HTTP ${res.status}: ${text || res.statusText}` };
      }
      const rows = await res.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      return { config: row ? mapRow(row) : EMPTY_CONFIG };
    } catch (err: any) {
      return { config: EMPTY_CONFIG, error: err?.message || 'Erro de conexão ao carregar a assinatura do contador' };
    }
  },

  /**
   * Escrita: só é aceita pelo servidor (RLS df_accountant_signature_write) quando o
   * usuário autenticado é is_primary=true ou role='SUPER_ADMIN'. Qualquer outro usuário
   * recebe 403/0 linhas afetadas do PostgREST — nunca falha silenciosamente: se `error`
   * vier vazio mas nenhuma linha voltar, tratamos como bloqueado pela RLS.
   */
  async saveConfig(
    input: { accountantName: string; crcRegistration: string; accountantCpf: string; signatureImageDataUrl: string | null },
    actor: { userId?: string; userName?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${REST_URL}/df_accountant_signature?id=eq.default`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: await authHeader(),
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          accountant_name: input.accountantName.trim(),
          crc_registration: input.crcRegistration.trim(),
          accountant_cpf: input.accountantCpf.trim(),
          signature_image_data_url: input.signatureImageDataUrl,
          updated_at: new Date().toISOString(),
          updated_by: actor.userId || null,
          updated_by_name: actor.userName || null,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `HTTP ${res.status}: ${text || res.statusText}` };
      }
      const rows = await res.json().catch(() => []);
      if (!Array.isArray(rows) || rows.length === 0) {
        return { success: false, error: 'Sem permissão para alterar a assinatura do contador (só a equipe do escritório pode).' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro de conexão ao salvar a assinatura do contador' };
    }
  },
};
