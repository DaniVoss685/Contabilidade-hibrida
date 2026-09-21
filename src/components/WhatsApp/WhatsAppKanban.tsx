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
  X,
  AlertCircle,
  GripVertical,
} from 'lucide-react';
import { WhatsAppConversation, WhatsAppChatStatus } from '../../types/whatsapp';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { formatPhoneDisplay, getContactDisplayName, getContactInitial } from '../../lib/phoneUtils';
import { getRoleLabel } from '../../lib/permissions';

interface WhatsAppKanbanProps {
  conversations: WhatsAppConversation[];
  history: WhatsAppConversation[];
  tenantId: string;
  currentUserId?: string;
  staffMembers?: { id: string; name: string; role?: string; whatsapp_display_name?: string | null }[];
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

// 4 Colunas Canônicas Ativas (Transferência é evento histórico/timeline, finalizados ficam no histórico)
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
];

export const WhatsAppKanban: React.FC<WhatsAppKanbanProps> = ({
  conversations,
  history,
  tenantId,
  currentUserId,
  staffMembers = [],
  onSelectConversation,
  onRefresh,
  onBackToChat,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAttendant, setSelectedAttendant] = useState<string>('ALL');
  const [movingConvId, setMovingConvId] = useState<string | null>(null);

  // Estados para Drag and Drop Real (HTML5)
  const [draggedConvId, setDraggedConvId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<WhatsAppChatStatus | null>(null);
  const [convToReturnToQueue, setConvToReturnToQueue] = useState<WhatsAppConversation | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  // Combina ativas e histórico para o Kanban (apenas conversas ativas nas 4 colunas)
  const allConversations = useMemo(() => {
    const map = new Map<string, WhatsAppConversation>();
    conversations.forEach((c) => map.set(c.id, c));
    history.forEach((c) => {
      // Apenas adiciona histórico se pertencer a uma das 4 colunas operacionais
      if (KANBAN_COLUMNS.some((col) => col.id === c.status)) {
        map.set(c.id, c);
      }
    });
    return Array.from(map.values());
  }, [conversations, history]);

  // Lista de atendentes distintos com contagem de atendimentos ativos
  const attendants = useMemo(() => {
    if (staffMembers.length > 0) {
      return staffMembers.map((s) => ({
        id: s.id,
        name: s.whatsapp_display_name || s.name,
        role: s.role,
        count: allConversations.filter((c) => c.assigned_to === s.id).length,
      }));
    }

    const list: { id: string; name: string; role?: string; count: number }[] = [];
    const seen = new Set<string>();
    allConversations.forEach((c) => {
      if (c.assigned_user?.id && !seen.has(c.assigned_user.id)) {
        seen.add(c.assigned_user.id);
        const count = allConversations.filter((cv) => cv.assigned_to === c.assigned_user!.id).length;
        list.push({
          id: c.assigned_user.id,
          name: c.assigned_user.whatsapp_display_name || c.assigned_user.name,
          count,
        });
      }
    });
    return list;
  }, [allConversations, staffMembers]);

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

  // Mover status via Drop de Drag and Drop
  const handleDrop = async (e: React.DragEvent, targetStatus: WhatsAppChatStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const convId = e.dataTransfer.getData('text/plain') || draggedConvId;
    setDraggedConvId(null);
    if (!convId) return;

    const targetConv = allConversations.find((c) => c.id === convId);
    if (!targetConv || targetConv.status === targetStatus) return;

    // Regra 1: Qualquer card arrastado para 'na_fila' (devolução) requer diálogo de confirmação
    if (targetStatus === 'na_fila') {
      setConvToReturnToQueue(targetConv);
      return;
    }

    setProcessingAction(true);
    try {
      // Regra 2: Fila -> Em Atendimento: claim atômico via currentUserId
      if (targetConv.status === 'na_fila' && targetStatus === 'em_atendimento') {
        if (!currentUserId) {
          alert('Identifique-se para assumir o atendimento.');
          return;
        }
        const res = await DentalWhatsAppService.claimConversation(targetConv.id, tenantId, currentUserId);
        if (!res.success) {
          alert(res.error || 'Não foi possível assumir este atendimento.');
        }
        onRefresh();
        return;
      }

      // Regra 3: Fila -> Aguardando (cliente ou interno): assume e muda de status
      if (targetConv.status === 'na_fila') {
        if (!currentUserId) {
          alert('Identifique-se para assumir o atendimento.');
          return;
        }
        await DentalWhatsAppService.updateStatus(
          targetConv.id,
          tenantId,
          targetStatus,
          currentUserId,
          currentUserId
        );
        onRefresh();
        return;
      }

      // Regra 4: Entre estados já atribuídos (em_atendimento <-> aguardando_cliente <-> aguardando_interno)
      // Preserva o atendente atual (assigned_to)
      await DentalWhatsAppService.updateStatus(
        targetConv.id,
        tenantId,
        targetStatus,
        currentUserId,
        targetConv.assigned_to
      );
      onRefresh();
    } catch (err: any) {
      console.error('Erro ao mover status no drop:', err);
      alert('Erro ao mover atendimento: ' + (err.message || 'Falha na comunicação'));
      onRefresh();
    } finally {
      setProcessingAction(false);
    }
  };

  // Confirmar devolução para a fila
  const handleConfirmReturnToQueue = async () => {
    if (!convToReturnToQueue) return;
    setProcessingAction(true);
    try {
      await DentalWhatsAppService.updateStatus(
        convToReturnToQueue.id,
        tenantId,
        'na_fila',
        currentUserId,
        null
      );
      setConvToReturnToQueue(null);
      onRefresh();
    } catch (err: any) {
      console.error('Erro ao devolver para a fila:', err);
      alert('Erro ao devolver para a fila: ' + (err.message || 'Falha na comunicação'));
    } finally {
      setProcessingAction(false);
    }
  };

  // Mover status via Menu do Card (fallback acessível ao drag-and-drop)
  const handleMoveStatusByMenu = async (conv: WhatsAppConversation, newStatus: WhatsAppChatStatus) => {
    setMovingConvId(null);
    if (conv.status === newStatus) return;

    if (newStatus === 'na_fila') {
      setConvToReturnToQueue(conv);
      return;
    }

    setProcessingAction(true);
    try {
      if (conv.status === 'na_fila' && newStatus === 'em_atendimento') {
        if (!currentUserId) {
          alert('Identifique-se para assumir o atendimento.');
          return;
        }
        await DentalWhatsAppService.claimConversation(conv.id, tenantId, currentUserId);
      } else if (conv.status === 'na_fila') {
        await DentalWhatsAppService.updateStatus(
          conv.id,
          tenantId,
          newStatus,
          currentUserId,
          currentUserId
        );
      } else {
        await DentalWhatsAppService.updateStatus(
          conv.id,
          tenantId,
          newStatus,
          currentUserId,
          conv.assigned_to
        );
      }
      onRefresh();
    } catch (err: any) {
      console.error('Erro ao mover status:', err);
      alert('Erro ao mover status: ' + (err.message || 'Falha na comunicação'));
    } finally {
      setProcessingAction(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden relative">
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
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium text-slate-700 cursor-pointer shadow-2xs"
            >
              <option value="ALL">Todos os Atendentes ({allConversations.length})</option>
              <option value="UNASSIGNED">
                Sem Atendente / Fila ({allConversations.filter((c) => !c.assigned_to).length})
              </option>
              {currentUserId && (
                <option value={currentUserId}>
                  Meus Atendimentos ({allConversations.filter((c) => c.assigned_to === currentUserId).length})
                </option>
              )}
              {attendants
                .filter((a) => a.id !== currentUserId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.role ? `(${getRoleLabel(a.role)})` : ''} · {a.count}
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
              placeholder="Buscar card por paciente ou telefone..."
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 w-48 sm:w-64"
            />
          </div>
        </div>
      </div>

      {/* Kanban Board Container (Horizontal Scroll com Drag and Drop Real) */}
      <div className="flex-1 overflow-x-auto p-4 sm:p-6 flex gap-4 items-start custom-scrollbar">
        {KANBAN_COLUMNS.map((col) => {
          const colConversations = filtered.filter((c) => c.status === col.id);
          const isOverThisCol = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverColumn !== col.id) {
                  setDragOverColumn(col.id);
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverColumn(null);
              }}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`w-72 sm:w-80 shrink-0 rounded-2xl border flex flex-col max-h-full border-t-4 ${
                col.borderTop
              } shadow-2xs transition-all duration-150 ${
                isOverThisCol
                  ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-400/40 shadow-md'
                  : 'bg-slate-100/80 border-slate-200/80'
              }`}
            >
              {/* Column Header */}
              <div className="p-3.5 border-b border-slate-200/60 bg-white/80 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-slate-800">{col.title}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${col.badgeBg} ${col.badgeText}`}
                  >
                    {colConversations.length}
                  </span>
                </div>
              </div>

              {/* Indicador de Drop ativo */}
              {isOverThisCol && (
                <div className="mx-3 mt-3 p-2.5 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-100/60 text-emerald-800 text-center text-xs font-bold animate-pulse">
                  Solte para mover para {col.title}
                </div>
              )}

              {/* Cards Container */}
              <div className="p-3 space-y-3 overflow-y-auto flex-1 custom-scrollbar">
                {colConversations.length === 0 && !isOverThisCol ? (
                  <div className="p-6 text-center text-xs text-slate-400 border-2 border-dashed border-slate-200/80 rounded-xl">
                    Nenhum atendimento
                  </div>
                ) : (
                  colConversations.map((conv) => {
                    const ctc = conv.contact;
                    const isDragging = draggedConvId === conv.id;

                    return (
                      <div
                        key={conv.id}
                        draggable={!processingAction}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', conv.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggedConvId(conv.id);
                        }}
                        onDragEnd={() => {
                          setDraggedConvId(null);
                          setDragOverColumn(null);
                        }}
                        onClick={() => onSelectConversation(conv)}
                        className={`p-3.5 bg-white rounded-xl border transition-all cursor-grab active:cursor-grabbing space-y-2 relative group select-none shadow-2xs hover:shadow-md ${
                          isDragging
                            ? 'opacity-35 border-dashed border-emerald-500 scale-[0.98]'
                            : 'border-slate-200/80 hover:border-emerald-500/80'
                        }`}
                        title="Arraste para mudar de coluna ou clique para abrir a conversa"
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

                          <div className="flex items-center gap-1 shrink-0">
                            <GripVertical className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <span className="text-[10px] text-slate-400">
                              {new Date(conv.last_message_at || conv.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
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
                              {conv.assigned_user?.whatsapp_display_name ||
                                conv.assigned_user?.name ||
                                'Sem atendente'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {conv.unread_count > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                                {conv.unread_count}
                              </span>
                            )}

                            {/* Status Mover Dropdown (Protegido contra Clipping) */}
                            <div
                              className="relative"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setMovingConvId(movingConvId === conv.id ? null : conv.id)
                                }
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Mover para outro status"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>

                              {movingConvId === conv.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-30"
                                    onClick={() => setMovingConvId(null)}
                                  />
                                  <div className="absolute right-0 bottom-full mb-1 w-48 bg-white border border-slate-200 rounded-xl shadow-2xl z-40 py-1 divide-y divide-slate-100 text-xs animate-in fade-in zoom-in-95">
                                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                      Mover para
                                    </div>
                                    {KANBAN_COLUMNS.map((colOption) => (
                                      <button
                                        key={colOption.id}
                                        type="button"
                                        onClick={() => handleMoveStatusByMenu(conv, colOption.id)}
                                        className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer ${
                                          conv.status === colOption.id
                                            ? 'font-bold text-emerald-600 bg-emerald-50/50'
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
                                </>
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

      {/* Modal de Confirmação para Devolver Atendimento para a Fila */}
      {convToReturnToQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="max-w-sm w-full bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 text-center animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">Devolver para a Fila?</h4>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              O atendimento de{' '}
              <strong>{getContactDisplayName(convToReturnToQueue.contact)}</strong> será
              desvinculado e voltará para a fila geral de espera, ficando disponível para
              qualquer atendente da clínica.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={processingAction}
                onClick={() => setConvToReturnToQueue(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={processingAction}
                onClick={handleConfirmReturnToQueue}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {processingAction ? 'Devolvendo...' : 'Sim, Devolver para Fila'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
