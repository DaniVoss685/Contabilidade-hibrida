import React, { useState } from 'react';
import {
  Search,
  Plus,
  Settings,
  MessageSquare,
  Users,
  Clock,
  CheckCheck,
  FileText,
  Mic,
  Image as ImageIcon,
  UserCheck,
  User,
  RefreshCw,
  Archive,
} from 'lucide-react';
import { WhatsAppConversation, WhatsAppContact } from '../../types/whatsapp';
import { formatPhoneDisplay, getContactDisplayName, getContactInitial, isWhatsAppGroup } from '../../lib/phoneUtils';
import { resolveAttendantDisplayName } from '../../lib/attendantIdentity';
import { getRoleLabel, hasPermission } from '../../lib/permissions';

function formatMessageTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Ontem';
  }
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

export type WhatsAppTab = 'em_atendimento' | 'em_fila' | 'historico' | 'contatos';
export type AttendanceFilterMode = 'mine' | 'all' | 'attendant';

interface WhatsAppSidebarProps {
  conversations: WhatsAppConversation[];
  history: WhatsAppConversation[];
  contacts: WhatsAppContact[];
  selectedConversationId?: string | null;
  onSelectConversation: (conv: WhatsAppConversation) => void;
  onSelectContact: (contact: WhatsAppContact) => void;
  activeTab: WhatsAppTab;
  onChangeTab: (tab: WhatsAppTab) => void;
  onOpenNewContact: () => void;
  onOpenSettings: () => void;
  currentUserId?: string;
  currentUserRole?: string;
  staffMembers?: { id: string; name: string; role?: string; whatsapp_display_name?: string | null }[];
  loading?: boolean;
}

export const WhatsAppSidebar: React.FC<WhatsAppSidebarProps> = ({
  conversations,
  history,
  contacts,
  selectedConversationId,
  onSelectConversation,
  onSelectContact,
  activeTab,
  onChangeTab,
  onOpenNewContact,
  onOpenSettings,
  currentUserId,
  currentUserRole,
  staffMembers = [],
  loading,
}) => {
  const [search, setSearch] = useState('');

  // Perfil gestor (OWNER/ADMIN) inicia em visão geral ("all"), outros iniciam em "mine"
  const isManager =
    currentUserRole === 'OWNER' ||
    currentUserRole === 'ADMIN' ||
    currentUserRole === 'SUPER_ADMIN' ||
    currentUserRole === 'PLATFORM_ADMIN';

  const [filterMode, setFilterMode] = useState<AttendanceFilterMode>(isManager ? 'all' : 'mine');
  const [selectedAttendantId, setSelectedAttendantId] = useState<string>('');

  // Membros elegíveis para atendimento de WhatsApp
  const eligibleStaff = staffMembers.filter((s) => hasPermission(s.role, 'whatsapp:chat'));

  // 1. REGRA CANÔNICA — EM FILA: assigned_to IS NULL/vazio (compartilhada entre todos da clínica)
  const emFilaConvs = conversations.filter(
    (c) =>
      (!c.assigned_to || c.assigned_to === '') &&
      c.status !== 'finalizado' &&
      c.status !== 'arquivado'
  );
  const emFilaCount = emFilaConvs.length;

  // 2. REGRA CANÔNICA — EM ATENDIMENTO: assigned_to IS NOT NULL
  const allEmAtendimentoConvs = conversations.filter(
    (c) =>
      Boolean(c.assigned_to) &&
      c.status !== 'finalizado' &&
      c.status !== 'arquivado'
  );

  const mineConvs = allEmAtendimentoConvs.filter((c) => c.assigned_to === currentUserId);
  const attendantConvs = allEmAtendimentoConvs.filter(
    (c) => c.assigned_to === selectedAttendantId
  );

  // O badge principal da aba "Em Atendimento" reflete o total canônico de atendimentos ativos
  const emAtendimentoCount = allEmAtendimentoConvs.length;

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  // Mapa de contagem de atendimentos ativos por atendente
  const attendantCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    allEmAtendimentoConvs.forEach((c) => {
      if (c.assigned_to) {
        counts[c.assigned_to] = (counts[c.assigned_to] || 0) + 1;
      }
    });
    return counts;
  }, [allEmAtendimentoConvs]);

  const [attendantDropdownOpen, setAttendantDropdownOpen] = useState(false);
  const selectedAttendant = eligibleStaff.find((s) => s.id === selectedAttendantId);

  // Filtragem da lista pelas 4 abas operacionais
  let listToDisplay: WhatsAppConversation[] = [];
  if (activeTab === 'em_atendimento') {
    if (filterMode === 'mine') {
      listToDisplay = mineConvs;
    } else if (filterMode === 'all') {
      listToDisplay = allEmAtendimentoConvs;
    } else {
      listToDisplay = attendantConvs;
    }
  } else if (activeTab === 'em_fila') {
    listToDisplay = emFilaConvs;
  } else if (activeTab === 'historico') {
    listToDisplay = history;
  }

  // Filtragem por busca (respeitando estritamente a aba e o filtro ativo)
  if (search.trim()) {
    const term = search.toLowerCase();
    listToDisplay = listToDisplay.filter((c) => {
      const displayName = getContactDisplayName(c.contact).toLowerCase();
      const phoneMatch = c.contact?.whatsapp_number?.includes(term);
      const msgMatch = c.last_message_content?.toLowerCase().includes(term);
      const attendantName = (c.assigned_user?.name || '').toLowerCase();
      const attendantDisplayName = (c.assigned_user?.whatsapp_display_name || '').toLowerCase();
      return (
        displayName.includes(term) ||
        phoneMatch ||
        msgMatch ||
        attendantName.includes(term) ||
        attendantDisplayName.includes(term)
      );
    });
  }

  // Ordenação estrita por last_message_at DESC
  listToDisplay.sort((a, b) => {
    const timeA = new Date(a.last_message_at || a.created_at).getTime();
    const timeB = new Date(b.last_message_at || b.created_at).getTime();
    return timeB - timeA;
  });

  const filteredContacts = contacts.filter((ctc) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const displayName = getContactDisplayName(ctc).toLowerCase();
    return displayName.includes(term) || ctc.whatsapp_number.includes(term);
  });

  // Limpeza de Badges Redundantes:
  // - "Transferido": NUNCA renderizar (transferência é evento interno da timeline)
  // - "Em Atendimento": NÃO renderizar dentro da aba "Em Atendimento" (redundante)
  // - "Na Fila": NÃO renderizar dentro da aba "Em Fila" (redundante)
  const getStatusBadge = (status: string) => {
    if (status === 'transferido') return null;
    if (activeTab === 'em_atendimento' && status === 'em_atendimento') return null;
    if (activeTab === 'em_fila' && status === 'na_fila') return null;

    switch (status) {
      case 'aguardando_cliente':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
            Aguardando Paciente
          </span>
        );
      case 'aguardando_interno':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800">
            Aguardando Interno
          </span>
        );
      case 'finalizado':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
            Finalizado
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full lg:w-84 xl:w-96 bg-white border-r border-slate-200 flex flex-col h-full min-h-0 shrink-0 overflow-hidden">
      {/* Top Header */}
      <div className="p-4 border-b border-slate-200/80 bg-slate-50/50 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800">Atendimento WhatsApp</h2>
            {totalUnread > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold animate-pulse">
                {totalUnread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenNewContact}
              className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs transition-colors cursor-pointer"
              title="Nova conversa / contato"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
              title="Configurações da instância Evolution"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar conversas ou contatos..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* Tabs — ORDEM OBRIGATÓRIA: Em Atendimento > Em Fila > Contatos > Histórico */}
      <div className="flex items-center border-b border-slate-200 px-3 pt-2 bg-slate-50/30 overflow-x-auto shrink-0">
        <button
          onClick={() => onChangeTab('em_atendimento')}
          className={`pb-2.5 px-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors shrink-0 flex items-center gap-1 ${
            activeTab === 'em_atendimento'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Em Atendimento</span>
          {emAtendimentoCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
              {emAtendimentoCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onChangeTab('em_fila')}
          className={`pb-2.5 px-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors shrink-0 flex items-center gap-1 ${
            activeTab === 'em_fila'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Em Fila</span>
          {emFilaCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
              {emFilaCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onChangeTab('contatos')}
          className={`pb-2.5 px-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors shrink-0 ${
            activeTab === 'contatos'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Contatos
        </button>

        <button
          onClick={() => onChangeTab('historico')}
          className={`pb-2.5 px-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors shrink-0 ${
            activeTab === 'historico'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Histórico
        </button>
      </div>

      {/* Sub-Header: Controle de Visualização (Meus, Todos, Por Atendente) na aba Em Atendimento */}
      {activeTab === 'em_atendimento' && (
        <div className="px-3 py-2 bg-slate-50/70 border-b border-slate-200/80 flex flex-col gap-1.5 shrink-0 relative">
          <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-xl text-[11px] font-medium">
            <button
              type="button"
              onClick={() => {
                setFilterMode('mine');
                setSelectedAttendantId('');
                setAttendantDropdownOpen(false);
              }}
              className={`flex-1 py-1 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                filterMode === 'mine'
                  ? 'bg-white text-slate-800 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              title="Exibir apenas os meus atendimentos"
            >
              <span>Meus</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  filterMode === 'mine' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300/60 text-slate-600'
                }`}
              >
                {mineConvs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterMode('all');
                setSelectedAttendantId('');
                setAttendantDropdownOpen(false);
              }}
              className={`flex-1 py-1 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-white text-slate-800 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              title="Exibir todos os atendimentos da clínica (supervisão)"
            >
              <span>Todos</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  filterMode === 'all' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-300/60 text-slate-600'
                }`}
              >
                {allEmAtendimentoConvs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAttendantDropdownOpen((prev) => !prev)}
              className={`flex-1 py-1 px-2 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer truncate ${
                filterMode === 'attendant'
                  ? 'bg-white text-slate-800 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              title="Filtrar por atendente específico"
            >
              <span className="truncate">
                {filterMode === 'attendant' && selectedAttendant
                  ? selectedAttendant.whatsapp_display_name || selectedAttendant.name
                  : 'Por Atendente'}
              </span>
              {filterMode === 'attendant' && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                  {attendantConvs.length}
                </span>
              )}
            </button>
          </div>

          {/* Popover Estilizado de Seleção de Atendente */}
          {attendantDropdownOpen && (
            <>
              {/* Backdrop para fechar ao clicar fora */}
              <div
                className="fixed inset-0 z-20"
                onClick={() => setAttendantDropdownOpen(false)}
              />

              <div className="absolute top-full left-3 right-3 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 p-2 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 mb-1">
                  <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                    Filtrar por Atendente
                  </span>
                  {selectedAttendantId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAttendantId('');
                        setFilterMode('all');
                        setAttendantDropdownOpen(false);
                      }}
                      className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold cursor-pointer"
                    >
                      Limpar filtro
                    </button>
                  )}
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1">
                  {eligibleStaff.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 text-xs">
                      Nenhum atendente disponível
                    </div>
                  ) : (
                    eligibleStaff.map((s) => {
                      const count = attendantCounts[s.id] || 0;
                      const isSelected = filterMode === 'attendant' && selectedAttendantId === s.id;
                      const initial = (s.whatsapp_display_name || s.name || '?')[0].toUpperCase();

                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedAttendantId(s.id);
                            setFilterMode('attendant');
                            setAttendantDropdownOpen(false);
                          }}
                          className={`w-full p-2 rounded-xl flex items-center justify-between gap-2.5 transition-all text-left cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200">
                              {initial}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-xs truncate">
                                {s.whatsapp_display_name || s.name}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate">
                                {getRoleLabel(s.role)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                              count > 0
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* List Container */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Carregando conversas...</div>
        ) : activeTab === 'contatos' ? (
          // ABA DE CONTATOS
          filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">Nenhum contato encontrado.</div>
          ) : (
            filteredContacts.map((ctc) => (
              <div
                key={ctc.id}
                onClick={() => onSelectContact(ctc)}
                className="p-3.5 hover:bg-slate-50/90 active:bg-slate-100 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                title="Clique para abrir ou iniciar atendimento com este contato"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm overflow-hidden border border-slate-200 shrink-0">
                    {ctc.profile_pic_url ? (
                      <img src={ctc.profile_pic_url} alt={getContactDisplayName(ctc)} className="w-full h-full object-cover" />
                    ) : (
                      <span>{getContactInitial(ctc)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-slate-800 truncate">{getContactDisplayName(ctc)}</p>
                      {isWhatsAppGroup(ctc.whatsapp_number) ? (
                        <span className="px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-800 text-[9px] font-bold shrink-0">
                          Grupo
                        </span>
                      ) : ctc.patient || ctc.patient_id ? (
                        <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold shrink-0">
                          Paciente
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold shrink-0">
                          Não cadastrado
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono truncate">
                      {formatPhoneDisplay(ctc.whatsapp_number)}
                    </p>
                  </div>
                </div>

                <div className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-emerald-600 bg-emerald-50 rounded-lg shrink-0">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
              </div>
            ))
          )
        ) : // ABA DE CONVERSAS (Em Atendimento, Em Fila, Histórico)
        listToDisplay.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            {activeTab === 'em_atendimento'
              ? filterMode === 'mine'
                ? 'Você não possui conversas em atendimento no momento.'
                : filterMode === 'attendant'
                ? 'Nenhuma conversa com o atendente selecionado.'
                : 'Nenhuma conversa em atendimento no momento.'
              : activeTab === 'em_fila'
              ? 'A fila de espera está vazia.'
              : activeTab === 'historico'
              ? 'Nenhuma conversa no histórico.'
              : 'Nenhuma conversa encontrada.'}
          </div>
        ) : (
          listToDisplay.map((conv) => {
            const isSelected = conv.id === selectedConversationId;
            const ctc = conv.contact;

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                className={`p-3 sm:p-3.5 transition-colors cursor-pointer flex items-start gap-3 border-l-4 ${
                  isSelected
                    ? 'bg-emerald-50/70 border-emerald-600'
                    : 'hover:bg-slate-50/80 border-transparent'
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0 mt-0.5">
                  <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm overflow-hidden border border-slate-200 shadow-2xs">
                    {ctc?.profile_pic_url ? (
                      <img src={ctc.profile_pic_url} alt={getContactDisplayName(ctc)} className="w-full h-full object-cover" />
                    ) : (
                      <span>{getContactInitial(ctc)}</span>
                    )}
                  </div>
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                      conv.status === 'em_atendimento'
                        ? 'bg-emerald-500'
                        : conv.status === 'na_fila'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                    }`}
                  />
                </div>

                {/* Info & Snippet */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="text-xs font-bold text-slate-800 truncate">{getContactDisplayName(ctc)}</h4>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2 font-mono">
                      {formatMessageTime(conv.last_message_at || conv.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 mb-1">
                    <p className="text-[11px] text-slate-500 truncate">
                      {conv.last_message_from_me && (
                        <span className="text-slate-400 font-medium">Você: </span>
                      )}
                      {conv.last_message_content || 'Nenhuma mensagem recente'}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-bold shrink-0">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>

                  {/* Status & Atendente Responsável */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getStatusBadge(conv.status)}
                    {isWhatsAppGroup(ctc?.whatsapp_number) ? (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/60">
                        Grupo
                      </span>
                    ) : !ctc?.patient && !ctc?.patient_id ? (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                        Não cadastrado
                      </span>
                    ) : null}

                    {/* Atendente responsável exibido discretamente no modo Todos ou Por Atendente ou quando atribuído a outro */}
                    {conv.assigned_to &&
                      (filterMode === 'all' ||
                        filterMode === 'attendant' ||
                        conv.assigned_to !== currentUserId) && (
                        <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1 bg-slate-100/90 border border-slate-200/80 px-1.5 py-0.5 rounded truncate max-w-[190px]">
                          <UserCheck className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">
                            Atendente:{' '}
                            {conv.assigned_to === currentUserId
                              ? 'Você'
                              : resolveAttendantDisplayName(
                                  conv.assigned_user ||
                                    staffMembers.find((s) => s.id === conv.assigned_to)
                                )}
                          </span>
                        </span>
                      )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
