import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  UserCheck,
  Clock,
  MessageSquare,
  ChevronDown,
  ArrowRight,
  MoreVertical,
  Check,
} from 'lucide-react';
import { WhatsAppConversation, WhatsAppChatStatus } from '../../types/whatsapp';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { formatPhoneDisplay, getContactDisplayName, getContactInitial } from '../../lib/phoneUtils';

interface WhatsAppKanbanProps {
  conversations: WhatsAppConversation[];
  history: WhatsAppConversation[];
  tenantId: string;
  currentUserId?: string;
  onSelectConversation: (conv: WhatsAppConversation) => void;
  onRefresh: () => void;
  onBackToChat: () => void;
}

interface ColumnDef {
  id: WhatsAppChatStatus;
  title: string;
  badgeBg: string;
  badgeText: string;
  borderTop: string;
}

const KANBAN_COLUMNS: ColumnDef[] = [
  {
    id: 'na_fila',
    title: 'Fila de Espera',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    borderTop: 'border-t-amber-500',
  },
  {
    id: 'em_atendimento',
    title: 'Em Atendimento',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    borderTop: 'border-t-emerald-500',
  },
  {
    id: 'aguardando_cliente',
    title: 'Aguardando Paciente',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    borderTop: 'border-t-blue-500',
  },
  {
    id: 'aguardando_interno',
    title: 'Aguardando Interno',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
    borderTop: 'border-t-purple-500',
  },
  {
    id: 'transferido',
    title: 'Transferido',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-800',
    borderTop: 'border-t-indigo-500',
  },
  {
    id: 'finalizado',
    title: 'Finalizado',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    borderTop: 'border-t-slate-500',
  },
  {
    id: 'arquivado',
    title: 'Arquivado',
    badgeBg: 'bg-zinc-100',
    badgeText: 'text-zinc-800',
    borderTop: 'border-t-zinc-500',
  },
];

export const WhatsAppKanban: React.FC<WhatsAppKanbanProps> = ({
  conversations,
  history,
  tenantId,
  currentUserId,
  onSelectConversation,
  onRefresh,
  onBackToChat,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAttendant, setSelectedAttendant] = useState<string>('ALL');
  const [movingConvId, setMovingConvId] = useState<string | null>(null);

  // Combina ativas e histórico para o Kanban
  const allConversations = useMemo(() => {
    const map = new Map<string, WhatsAppConversation>();
    conversations.forEach((c) => map.set(c.id, c));
    history.forEach((c) => map.set(c.id, c));
    return Array.from(map.values());
  }, [conversations, history]);

  // Lista de atendentes distintos
  const attendants = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    allConversations.forEach((c) => {
      if (c.assigned_user?.id && !seen.has(c.assigned_user.id)) {
        seen.add(c.assigned_user.id);
        list.push({ id: c.assigned_user.id, name: c.assigned_user.name });
      }
    });
    return list;
  }, [allConversations]);

  // Filtragem
  const filtered = useMemo(() => {
    return allConversations.filter((conv) => {
      if (selectedAttendant !== 'ALL') {
        if (selectedAttendant === 'UNASSIGNED') {
          if (conv.assigned_to) return false;
        } else if (conv.assigned_to !== selectedAttendant) {
          return false;
        }
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const displayName = getContactDisplayName(conv.contact).toLowerCase();
        const nameMatch = displayName.includes(term);
        const phoneMatch = conv.contact?.whatsapp_number.includes(term);
        const msgMatch = conv.last_message_content?.toLowerCase().includes(term);
        if (!nameMatch && !phoneMatch && !msgMatch) return false;
      }

      return true;
    });
  }, [allConversations, selectedAttendant, searchTerm]);

  // Mover status
  const handleMoveStatus = async (convId: string, newStatus: WhatsAppChatStatus) => {
    try {
      await DentalWhatsAppService.updateStatus(convId, tenantId, newStatus, currentUserId);
      onRefresh();
    } catch (err) {
      console.warn('Erro ao mover status:', err);
    } finally {
      setMovingConvId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Top Filter Bar */}
      <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToChat}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Voltar para Lista de Chat</span>
          </button>
          <h2 className="text-base font-bold text-slate-800 hidden sm:block">
            Kanban de Atendimento WhatsApp
          </h2>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtro por Atendente */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedAttendant}
              onChange={(e) => setSelectedAttendant(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700"
            >
              <option value="ALL">Todos os Atendentes</option>
              <option value="UNASSIGNED">Sem Atendente</option>
              {currentUserId && <option value={currentUserId}>Meus Atendimentos</option>}
              {attendants
                .filter((a) => a.id !== currentUserId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar card..."
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 w-48 sm:w-60"
            />
          </div>
        </div>
      </div>

      {/* Kanban Board Container (Horizontal Scroll) */}
      <div className="flex-1 overflow-x-auto p-4 sm:p-6 flex gap-4 items-start custom-scrollbar">
        {KANBAN_COLUMNS.map((col) => {
          const colConversations = filtered.filter((c) => c.status === col.id);

          return (
            <div
              key={col.id}
              className={`w-72 sm:w-80 shrink-0 bg-slate-100/80 rounded-2xl border border-slate-200/80 flex flex-col max-h-full border-t-4 ${col.borderTop} shadow-2xs`}
            >
              {/* Column Header */}
              <div className="p-3.5 border-b border-slate-200/60 bg-white/70 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-800">{col.title}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badgeBg} ${col.badgeText}`}
                  >
                    {colConversations.length}
                  </span>
                </div>
              </div>

              {/* Cards Container */}
              <div className="p-3 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                {colConversations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                    Vazio
                  </div>
                ) : (
                  colConversations.map((conv) => {
                    const ctc = conv.contact;

                    return (
                      <div
                        key={conv.id}
                        onClick={() => onSelectConversation(conv)}
                        className="p-3.5 bg-white rounded-xl border border-slate-200/80 hover:border-emerald-500/80 shadow-2xs hover:shadow-md transition-all cursor-pointer space-y-2 relative group"
                      >
                        {/* Card Header: Avatar, Name, Time */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden border border-slate-200">
                              {ctc?.profile_pic_url ? (
                                <img
                                  src={ctc.profile_pic_url}
                                  alt={getContactDisplayName(ctc)}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span>{getContactInitial(ctc)}</span>
                              )}
                            </div>
                            <div className="truncate">
                              <h4 className="text-xs font-bold text-slate-800 truncate">
                                {getContactDisplayName(ctc)}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-mono">
                                {formatPhoneDisplay(ctc?.whatsapp_number || '')}
                              </p>
                            </div>
                          </div>

                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(conv.last_message_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {/* Last Message Snippet */}
                        {conv.last_message_content && (
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {conv.last_message_content}
                          </p>
                        )}

                        {/* Footer: Attendant, Unread, Status Mover */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                          <div className="flex items-center gap-1.5 truncate">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-slate-600 truncate">
                              {conv.assigned_user?.name || 'Sem atendente'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {conv.unread_count > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                                {conv.unread_count}
                              </span>
                            )}

                            {/* Status Mover Dropdown */}
                            <div
                              className="relative"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() =>
                                  setMovingConvId(movingConvId === conv.id ? null : conv.id)
                                }
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Mover para outro status"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>

                              {movingConvId === conv.id && (
                                <div className="absolute right-0 bottom-full mb-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 divide-y divide-slate-100 text-xs animate-in fade-in">
                                  {KANBAN_COLUMNS.map((colOption) => (
                                    <button
                                      key={colOption.id}
                                      onClick={() => handleMoveStatus(conv.id, colOption.id)}
                                      className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors flex items-center justify-between ${
                                        conv.status === colOption.id
                                          ? 'font-bold text-emerald-600'
                                          : 'text-slate-700'
                                      }`}
                                    >
                                      <span>{colOption.title}</span>
                                      {conv.status === colOption.id && (
                                        <Check className="w-3 h-3 text-emerald-600" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
