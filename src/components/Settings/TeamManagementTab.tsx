import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Mail,
  CheckCircle2,
  XCircle,
  Edit2,
  UserX,
  UserCheck,
  RefreshCw,
  AlertTriangle,
  Lock,
  User,
  Info,
} from 'lucide-react';
import { DentalTeamService, TeamMember } from '../../services/dentalTeamService';
import { getRoleLabel } from '../../lib/permissions';
import { useToast, ConfirmDialog } from '../UI';

interface TeamManagementTabProps {
  tenantId: string;
  currentUserId?: string;
  canManageTeam: boolean;
}

export const TeamManagementTab: React.FC<TeamManagementTabProps> = ({
  tenantId,
  currentUserId,
  canManageTeam,
}) => {
  const toast = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Modais
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Form State Convite
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('RECEPTION');
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Form State Edição
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('RECEPTION');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Diálogo de confirmação
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const loadTeam = async () => {
    setLoading(true);
    try {
      const data = await DentalTeamService.listMembers(tenantId);
      setMembers(data);
    } catch (err: any) {
      toast.error('Não foi possível carregar a equipe.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadTeam();
    }
  }, [tenantId]);

  const handleOpenInvite = () => {
    setInviteName('');
    setInviteEmail('');
    setInviteRole('RECEPTION');
    setIsInviteModalOpen(true);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast.error('Preencha o nome e o e-mail do membro.');
      return;
    }

    setSubmittingInvite(true);
    try {
      const res = await DentalTeamService.inviteMember({
        tenantId,
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      if (res.success) {
        toast.success(res.message || 'Convite enviado com sucesso!');
        setIsInviteModalOpen(false);
        loadTeam();
      } else {
        toast.error(res.error || 'Erro ao enviar convite.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha na comunicação com o servidor.');
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleOpenEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditRole(member.role);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    setSubmittingEdit(true);
    try {
      const res = await DentalTeamService.updateMember({
        tenantId,
        userId: editingMember.id,
        name: editName.trim(),
        role: editRole,
      });

      if (res.success) {
        toast.success('Membro da equipe atualizado com sucesso.');
        setIsEditModalOpen(false);
        loadTeam();
      } else {
        toast.error(res.error || 'Erro ao atualizar membro.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha ao processar atualização.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleToggleActive = (member: TeamMember) => {
    if (member.is_active) {
      setConfirmDialog({
        isOpen: true,
        title: 'Desativar Membro da Equipe',
        message: `Deseja realmente desativar o acesso de ${member.name}? O histórico de conversas e atendimentos será totalmente preservado, mas este usuário não poderá mais acessar a plataforma.`,
        onConfirm: async () => {
          try {
            const res = await DentalTeamService.deactivateMember(tenantId, member.id);
            if (res.success) {
              toast.info(res.message || 'Membro desativado.');
              loadTeam();
            } else {
              toast.error(res.error || 'Erro ao desativar membro.');
            }
          } catch (e: any) {
            toast.error(e.message || 'Falha na operação.');
          }
        },
      });
    } else {
      setConfirmDialog({
        isOpen: true,
        title: 'Reativar Membro da Equipe',
        message: `Deseja reativar o acesso de ${member.name} à clínica?`,
        onConfirm: async () => {
          try {
            const res = await DentalTeamService.reactivateMember(tenantId, member.id);
            if (res.success) {
              toast.success(res.message || 'Membro reativado com sucesso.');
              loadTeam();
            } else {
              toast.error(res.error || 'Erro ao reativar membro.');
            }
          } catch (e: any) {
            toast.error(e.message || 'Falha na operação.');
          }
        },
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Topo da Aba */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Equipe & Acessos da Clínica</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Gerencie os membros da clínica, funções operacionais, atendentes do WhatsApp e permissões
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={loadTeam}
            disabled={loading}
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {canManageTeam && (
            <button
              type="button"
              onClick={handleOpenInvite}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Convidar Membro</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabela de Membros */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Membros Cadastrados ({members.length})
          </span>
          <span className="text-[11px] text-slate-400">
            Cada membro opera com credenciais individuais no mesmo WhatsApp e Agenda
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <span>Carregando membros da equipe...</span>
          </div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Nenhum membro encontrado para esta clínica.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3.5">Membro</th>
                  <th className="px-5 py-3.5">E-mail</th>
                  <th className="px-5 py-3.5">Função</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => {
                  const isCurrent = m.id === currentUserId;
                  const isPrimary = m.is_primary;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Nome e Avatar */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs border border-emerald-200">
                            {m.name ? m.name.substring(0, 2).toUpperCase() : 'US'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{m.name}</span>
                              {isCurrent && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                  Você
                                </span>
                              )}
                              {isPrimary && (
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                  Conta Primária
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">ID: {m.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* E-mail */}
                      <td className="px-5 py-3.5 text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{m.email}</span>
                        </div>
                      </td>

                      {/* Função */}
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[11px] ${
                            ['OWNER', 'ADMIN', 'SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(m.role)
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : ['RECEPTION', 'ASSISTANT'].includes(m.role)
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : ['DENTIST', 'PROFESSIONAL'].includes(m.role)
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          {getRoleLabel(m.role)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        {m.is_active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-500 font-semibold">
                            <XCircle className="w-3.5 h-3.5" />
                            Inativo
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-5 py-3.5 text-right">
                        {canManageTeam && !isPrimary && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(m)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                              title="Editar Função"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleActive(m)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                m.is_active
                                  ? 'text-rose-500 hover:text-rose-700 hover:bg-rose-50'
                                  : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                              }`}
                              title={m.is_active ? 'Desativar acesso' : 'Reativar acesso'}
                            >
                              {m.is_active ? (
                                <UserX className="w-3.5 h-3.5" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: CONVIDAR MEMBRO */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Convidar Membro da Equipe</h4>
                  <p className="text-[11px] text-slate-500">
                    O convite oficial será enviado para o e-mail do profissional
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSendInvite} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Completo *</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Ex: Luana Oliveira"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">E-mail Profissional *</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="luana@clinica.com.br"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  O usuário definirá sua própria senha ao aceitar o convite oficial. Zero senhas em texto puro.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Função / Perfil de Acesso *</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="RECEPTION">Recepção / Atendente (WhatsApp, Agenda e Pacientes)</option>
                  <option value="ASSISTANT">Assistente Clínico / Atendente</option>
                  <option value="DENTIST">Cirurgião(ã)-Dentista (Agenda, Pacientes e Atendimento)</option>
                  <option value="FINANCE">Financeiro (Gestão Financeira, DRE e Lançamentos)</option>
                  <option value="ADMIN">Administrador(a) da Clínica (Acesso Total)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  disabled={submittingInvite}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingInvite}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs flex items-center gap-1.5"
                >
                  {submittingInvite && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Enviar Convite</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR ACESSO */}
      {isEditModalOpen && editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Editar Membro da Equipe</h4>
                  <p className="text-[11px] text-slate-500">{editingMember.email}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Função</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="RECEPTION">Recepção / Atendente</option>
                  <option value="ASSISTANT">Assistente Clínico / Atendente</option>
                  <option value="DENTIST">Cirurgião(ã)-Dentista</option>
                  <option value="FINANCE">Financeiro</option>
                  <option value="ADMIN">Administrador(a) da Clínica</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={submittingEdit}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs flex items-center gap-1.5"
                >
                  {submittingEdit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
