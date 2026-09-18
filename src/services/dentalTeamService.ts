import { supabase, SUPABASE_URL } from '../lib/supabaseClient';
import { UserRole } from '../types';

export interface TeamMember {
  id: string;
  clinic_id: string;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  is_primary?: boolean;
  created_at: string;
  auth_user_id?: string | null;
  permissions?: string[] | null;
}

export const DentalTeamService = {
  /**
   * Lista todos os membros da equipe da clínica no mesmo tenant.
   */
  async listMembers(tenantId: string): Promise<TeamMember[]> {
    if (!tenantId) return [];

    try {
      const { data, error } = await supabase
        .from('df_users')
        .select('id, clinic_id, email, name, role, is_active, is_primary, created_at, auth_user_id, permissions')
        .eq('clinic_id', tenantId)
        .order('name', { ascending: true });

      if (error) {
        console.warn('[DentalTeamService] Erro ao listar membros via RLS, tentando Edge Function:', error.message);
        return await this.listMembersViaEdge(tenantId);
      }

      return (data || []) as TeamMember[];
    } catch (err) {
      console.error('[DentalTeamService] Exceção ao listar membros:', err);
      return [];
    }
  },

  /**
   * Fallback via Edge Function caso o cliente direto encontre restrição.
   */
  async listMembersViaEdge(tenantId: string): Promise<TeamMember[]> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return [];

    const res = await fetch(`${SUPABASE_URL}/functions/v1/dental-team-management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: 'list_members', tenant_id: tenantId }),
    });

    const json = await res.json();
    return (json?.members || []) as TeamMember[];
  },

  /**
   * Convida um novo membro para a equipe da clínica pelo fluxo oficial do Supabase Auth.
   */
  async inviteMember(params: {
    tenantId: string;
    name: string;
    email: string;
    role: string;
    permissions?: string[];
  }): Promise<{ success: boolean; message?: string; error?: string; user_id?: string }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return { success: false, error: 'Sessão expirada. Por favor, realize login novamente.' };
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/dental-team-management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'invite_member',
        tenant_id: params.tenantId,
        name: params.name,
        email: params.email,
        role: params.role,
        permissions: params.permissions,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Falha ao convidar membro da equipe.' };
    }

    return json;
  },

  /**
   * Atualiza dados de acesso/função de um membro existente.
   */
  async updateMember(params: {
    tenantId: string;
    userId: string;
    name?: string;
    role?: string;
    permissions?: string[];
  }): Promise<{ success: boolean; message?: string; error?: string }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return { success: false, error: 'Sessão expirada. Por favor, realize login novamente.' };
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/dental-team-management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'update_member',
        tenant_id: params.tenantId,
        user_id: params.userId,
        name: params.name,
        role: params.role,
        permissions: params.permissions,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Falha ao atualizar dados do membro.' };
    }

    return json;
  },

  /**
   * Desativa membro da equipe preservando histórico e autoria.
   */
  async deactivateMember(tenantId: string, userId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return { success: false, error: 'Sessão expirada. Por favor, realize login novamente.' };
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/dental-team-management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'deactivate_member',
        tenant_id: tenantId,
        user_id: userId,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Falha ao desativar membro.' };
    }

    return json;
  },

  /**
   * Reativa um membro previamente desativado.
   */
  async reactivateMember(tenantId: string, userId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    if (!token) {
      return { success: false, error: 'Sessão expirada. Por favor, realize login novamente.' };
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/dental-team-management`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'reactivate_member',
        tenant_id: tenantId,
        user_id: userId,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json.error || 'Falha ao reativar membro.' };
    }

    return json;
  },
};
