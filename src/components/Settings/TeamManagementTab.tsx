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
  MessageSquare,
  RotateCcw,
  LayoutDashboard,
  Calendar,
  TrendingUp,
  ReceiptText,
  TrendingDown,
  Wallet,
  Landmark,
  FolderTree,
  Calculator,
  SlidersHorizontal,
  FileSpreadsheet,
  Activity,
  FlaskConical,
  Settings,
} from 'lucide-react';
import { DentalTeamService, TeamMember } from '../../services/dentalTeamService';
import {
  getRoleLabel,
  getRoleDefaultPermissions,
  getDefaultTabsForRole,
  getTabsFromPermissions,
  getPermissionsFromTabs,
  AppPermission,
} from '../../lib/permissions';
import { NavTab } from '../../types';
import { validateWhatsappDisplayName } from '../../lib/attendantIdentity';
import { useToast, ConfirmDialog, CustomSelect, SelectOption } from '../UI';

const ROLE_OPTIONS: SelectOption[] = [
  {
    value: 'RECEPTION',
    label: 'Recepção / Atendente',
    description: 'Atendimento WhatsApp, pacientes e agenda',
    icon: <Users className="w-4 h-4 text-emerald-600" />,
  },
  {
    value: 'ASSISTANT',
    label: 'Assistente Clínico',
    description: 'Rotinas clínicas e apoio operacional',
    icon: <UserCheck className="w-4 h-4 text-teal-600" />,
  },
  {
    value: 'DENTIST',
    label: 'Cirurgião(ã)-Dentista',
    description: 'Agenda, pacientes e procedimentos clínicos',
    icon: <Activity className="w-4 h-4 text-sky-600" />,
  },
  {
    value: 'FINANCE',
    label: 'Financeiro',
    description: 'Rotinas financeiras, receitas, despesas e bancos',
    icon: <Wallet className="w-4 h-4 text-blue-600" />,
  },
  {
    value: 'ADMIN',
    label: 'Administrador(a)',
    description: 'Gestão ampla da clínica, equipe e relatórios',
    icon: <Shield className="w-4 h-4 text-purple-600" />,
  },
];

interface TabItemConfig {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const TAB_CONFIGS: TabItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'patients', label: 'Pacientes', icon: Users, color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { id: 'agenda', label: 'Agenda', icon: Calendar, color: 'text-teal-600 bg-teal-50 border-teal-200' },
  { id: 'sales', label: 'Receitas / Vendas', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'receivables', label: 'Contas a Receber', icon: ReceiptText, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  { id: 'expenses', label: 'Despesas / A Pagar', icon: TrendingDown, color: 'text-rose-600 bg-rose-50 border-rose-200' },
  { id: 'financial', label: 'Gestão Financeira', icon: Wallet, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { id: 'bank_accounts', label: 'Contas Bancárias', icon: Landmark, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'chart_of_accounts', label: 'Plano de Contas', icon: FolderTree, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { id: 'taxes', label: 'Impostos & Fator R', icon: Calculator, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  { id: 'fiscal_simulator', label: 'Simulador Fiscal', icon: SlidersHorizontal, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { id: 'reports', label: 'Relatórios & DRE', icon: FileSpreadsheet, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'procedures', label: 'Procedimentos & Custos', icon: Activity, color: 'text-pink-600 bg-pink-50 border-pink-200' },
  { id: 'supplies', label: 'Insumos & Estoque', icon: FlaskConical, color: 'text-lime-600 bg-lime-50 border-lime-200' },
  { id: 'settings', label: 'Configurações', icon: Settings, color: 'text-slate-600 bg-slate-100 border-slate-300' },
];

const ALL_EDITABLE_TABS: NavTab[] = TAB_CONFIGS.map((t) => t.id);

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
  const [inviteWhatsappName, setInviteWhatsappName] = useState('');
  const [inviteRole, setInviteRole] = useState('RECEPTION');
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Form State Edição
  const [editName, setEditName] = useState('');
  const [editWhatsappName, setEditWhatsappName] = useState('');
  const [editRole, setEditRole] = useState('RECEPTION');
  const [editTabs, setEditTabs] = useState<NavTab[]>([]);
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
    setInviteWhatsappName('');
    setInviteRole('RECEPTION');
    setIsInviteModalOpen(true);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast.error('Preencha o nome e o e-mail do membro.');
      return;
    }

    if (inviteWhatsappName.trim()) {
      const val = validateWhatsappDisplayName(inviteWhatsappName);
      if (!val.valid) {
        toast.error(val.error);
        return;
      }
    }

    setSubmittingInvite(true);
    try {
      const res = await DentalTeamService.inviteMember({
        tenantId,
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
        whatsapp_display_name: inviteWhatsappName.trim() || undefined,
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
    setEditWhatsappName(member.whatsapp_display_name || '');
    setEditRole(member.role);

    // Derivar abas ativas a partir das permissões salvas ou do preset da função
    const activeTabs = getTabsFromPermissions(
      member.permissions,
      member.role,
      member.is_primary
    );
    setEditTabs(activeTabs);
    setIsEditModalOpen(true);
  };

  const handleChangeEditRole = (newRole: string) => {
    if (newRole === editRole) return;

    // Checa se o usuário atualmente possui abas personalizadas em relação ao padrão da função atual
    const defaultTabsCurrent = getDefaultTabsForRole(editRole);
    const isCustomized =
      editTabs.length !== defaultTabsCurrent.length ||
      editTabs.some((t) => !defaultTabsCurrent.includes(t)) ||
      defaultTabsCurrent.some((t) => !editTabs.includes(t));

    if (isCustomized) {
      setConfirmDialog({
        isOpen: true,
        title: 'Alterar Função Base',
        message: `Este usuário possui acessos de abas personalizados. Alterar a função para "${getRoleLabel(
          newRole
        )}" aplicará o conjunto padrão de abas deste novo perfil. Deseja continuar e aplicar o padrão?`,
        onConfirm: () => {
          setEditRole(newRole);
          setEditTabs(getDefaultTabsForRole(newRole));
        },
      });
    } else {
      setEditRole(newRole);
      setEditTabs(getDefaultTabsForRole(newRole));
    }
  };

  const handleResetToRolePreset = () => {
    const defaultTabs = getDefaultTabsForRole(editRole);
    setEditTabs(defaultTabs);
    toast.info(`Abas restauradas para o padrão de ${getRoleLabel(editRole)}.`);
  };

  const handleToggleTab = (tabId: NavTab) => {
    if (editingMember?.role === 'OWNER' || editingMember?.role === 'SUPER_ADMIN' || editingMember?.is_primary) {
      return;
    }
    setEditTabs((prev) =>
      prev.includes(tabId) ? prev.filter((t) => t !== tabId) : [...prev, tabId]
    );
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    if (editWhatsappName.trim()) {
      const val = validateWhatsappDisplayName(editWhatsappName);
      if (!val.valid) {
        toast.error(val.error);
        return;
      }
    }

    const isOwnerOrSuperAdmin =
      editingMember.role === 'OWNER' ||
      editingMember.role === 'SUPER_ADMIN' ||
      editingMember.is_primary;

    const activePerms = isOwnerOrSuperAdmin
      ? null
      : getPermissionsFromTabs(editTabs, editRole);

    setSubmittingEdit(true);
    try {
      const res = await DentalTeamService.updateMember({
        tenantId,
        userId: editingMember.id,
        name: editName.trim(),
        role: editRole,
        whatsapp_display_name: editWhatsappName.trim() || null,
        permissions: activePerms,
      });

      if (res.success) {
        toast.success('Membro da equipe e acessos atualizados com sucesso.');
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
                            {m.whatsapp_display_name ? (
                              <div className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                                <span className="text-slate-400 font-normal">WhatsApp:</span>
                                <span className="bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 text-emerald-800">
                                  {m.whatsapp_display_name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">ID: {m.id}</span>
                            )}
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
                <label className="block font-semibold text-slate-700 mb-1">
                  Nome de atendimento no WhatsApp
                  <span className="text-[10px] font-normal text-slate-400 ml-1">(opcional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={inviteWhatsappName}
                    onChange={(e) => setInviteWhatsappName(e.target.value)}
                    placeholder="Ex: Luana ou Dra. Luana"
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Este é o nome exibido nas conversas e, quando habilitado, enviado ao paciente para identificar quem está atendendo.
                </p>
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
                <CustomSelect
                  label="Função / Perfil de Acesso *"
                  options={ROLE_OPTIONS}
                  value={inviteRole}
                  onChange={setInviteRole}
                  searchable={false}
                />
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

      {/* MODAL: EDITAR ACESSO & PERMISSÕES */}
      {isEditModalOpen && editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="max-w-2xl w-full max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">Editar Membro & Permissões</h4>
                  <p className="text-[11px] text-slate-500">{editingMember.email}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <CustomSelect
                    label="Função Base"
                    options={ROLE_OPTIONS}
                    value={editRole}
                    onChange={handleChangeEditRole}
                    disabled={
                      editingMember?.role === 'OWNER' ||
                      editingMember?.role === 'SUPER_ADMIN' ||
                      editingMember?.is_primary
                    }
                    searchable={false}
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nome de atendimento no WhatsApp
                  <span className="text-[10px] font-normal text-slate-400 ml-1">(opcional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={editWhatsappName}
                    onChange={(e) => setEditWhatsappName(e.target.value)}
                    placeholder="Ex: Leonardo Ricardo (ou deixe vazio para usar o primeiro nome)"
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Nome exibido nas mensagens internas e, quando habilitado, apresentado ao paciente no WhatsApp.
                </p>
              </div>

              {/* SEÇÃO: ABAS DISPONÍVEIS PARA ESTE USUÁRIO */}
              <div className="pt-4 border-t border-slate-200">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 mb-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900 text-xs flex items-center gap-2 flex-wrap">
                      <span>ABAS DISPONÍVEIS PARA ESTE USUÁRIO</span>
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                        Perfil base: {getRoleLabel(editRole)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-500 font-medium">Acessos:</span>
                      {editingMember?.role === 'OWNER' || editingMember?.role === 'SUPER_ADMIN' || editingMember?.is_primary ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Acesso Total (Irrestrito)
                        </span>
                      ) : (() => {
                          const defaultTabs = getDefaultTabsForRole(editRole);
                          const isCustom =
                            editTabs.length !== defaultTabs.length ||
                            editTabs.some((t) => !defaultTabs.includes(t)) ||
                            defaultTabs.some((t) => !editTabs.includes(t));
                          return isCustom ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Personalizados
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Padrão da função
                            </span>
                          );
                        })()}
                    </div>
                  </div>

                  {!(editingMember?.role === 'OWNER' || editingMember?.role === 'SUPER_ADMIN' || editingMember?.is_primary) && (
                    <button
                      type="button"
                      onClick={handleResetToRolePreset}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 transition-colors self-start sm:self-auto cursor-pointer shadow-2xs"
                      title="Restaurar as abas recomendadas para a função selecionada"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                      <span>Restaurar padrão da função</span>
                    </button>
                  )}
                </div>

                {editingMember?.role === 'OWNER' || editingMember?.role === 'SUPER_ADMIN' || editingMember?.is_primary ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Como <strong>{getRoleLabel(editRole)}</strong>, este usuário possui acesso completo e permanente a todas as abas do sistema.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2.5 px-1">
                      <span className="text-[11px] text-slate-500 font-medium">
                        Selecione as abas que este usuário poderá acessar na Sidebar:
                      </span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setEditTabs(ALL_EDITABLE_TABS)}
                          className="text-emerald-600 hover:text-emerald-800 font-semibold cursor-pointer"
                        >
                          Marcar todas
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setEditTabs(['dashboard'])}
                          className="text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                        >
                          Desmarcar todas
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {TAB_CONFIGS.map((tab) => {
                        const Icon = tab.icon;
                        const isSelected = editTabs.includes(tab.id);

                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => handleToggleTab(tab.id)}
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-50/70 border-emerald-300 shadow-2xs'
                                : 'bg-slate-50/40 border-slate-200 hover:bg-slate-100/60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 pointer-events-none"
                            />
                            <div
                              className={`w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 ${tab.color}`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className={`text-xs leading-tight ${isSelected ? 'text-slate-900 font-semibold' : 'text-slate-600 font-medium'}`}>
                              {tab.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={submittingEdit}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
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
