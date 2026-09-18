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
  RefreshCw,
  Archive,
} from 'lucide-react';
import { WhatsAppConversation, WhatsAppContact } from '../../types/whatsapp';
import { formatPhoneDisplay } from '../../lib/phoneUtils';

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
  loading,
}) => {
  const [search, setSearch] = useState('');

  // Contadores em tempo real
  const emAtendimentoCount = conversations.filter(
    (c) =>
      c.status === 'em_atendimento' ||
      (c.assigned_to === currentUserId &&
        c.status !== 'na_fila' &&
        c.status !== 'finalizado' &&
        c.status !== 'arquivado')
  ).length;

  const emFilaCount = conversations.filter(
    (c) =>
      c.status === 'na_fila' ||
      (!c.assigned_to &&
        c.status !== 'finalizado' &&
        c.status !== 'arquivado' &&
        c.status !== 'em_atendimento')
  ).length;

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  // Filtragem da lista pelas 4 abas operacionais
  let listToDisplay: WhatsAppConversation[] = [];
  if (activeTab === 'em_atendimento') {
    listToDisplay = conversations.filter(
      (c) =>
        c.status === 'em_atendimento' ||
        (c.assigned_to === currentUserId &&
          c.status !== 'na_fila' &&
          c.status !== 'finalizado' &&
          c.status !== 'arquivado')
    );
  } else if (activeTab === 'em_fila') {
    listToDisplay = conversations.filter(
      (c) =>
        c.status === 'na_fila' ||
        (!c.assigned_to &&
          c.status !== 'finalizado' &&
          c.status !== 'arquivado' &&
          c.status !== 'em_atendimento')
    );
  } else if (activeTab === 'historico') {
    listToDisplay = history;
  }

  // Filtragem por busca
  if (search.trim()) {
    const term = search.toLowerCase();
    listToDisplay = listToDisplay.filter((c) => {
      const nameMatch = c.contact?.name.toLowerCase().includes(term);
      const phoneMatch = c.contact?.whatsapp_number.includes(term);
      const msgMatch = c.last_message_content?.toLowerCase().includes(term);
      return nameMatch || phoneMatch || msgMatch;
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
    return ctc.name.toLowerCase().includes(term) || ctc.whatsapp_number.includes(term);
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'em_atendimento':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">Em Atendimento</span>;
      case 'na_fila':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">Na Fila</span>;
      case 'aguardando_cliente':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">Aguardando Paciente</span>;
      case 'aguardando_interno':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800">Aguardando Interno</span>;
      case 'transferido':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800">Transferido</span>;
      case 'finalizado':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">Finalizado</span>;
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

      {/* Tabs */}
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
          onClick={() => onChangeTab('historico')}
          className={`pb-2.5 px-2.5 text-xs font-semibold border-b-2 cursor-pointer transition-colors shrink-0 ${
            activeTab === 'historico'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Histórico
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
      </div>

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
                      <img src={ctc.profile_pic_url} alt={ctc.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{ctc.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-slate-800 truncate">{ctc.name}</p>
                      {ctc.patient && (
                        <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold shrink-0">
                          Paciente
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
              ? 'Nenhuma conversa em atendimento no momento.'
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
                      <img src={ctc.profile_pic_url} alt={ctc.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{ctc?.name?.charAt(0).toUpperCase() || 'C'}</span>
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
                    <h4 className="text-xs font-bold text-slate-800 truncate">{ctc?.name}</h4>
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

                  {/* Status & Attendant */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getStatusBadge(conv.status)}
                    {conv.assigned_user?.name && (
                      <span className="text-[10px] text-slate-400 truncate">
                        • {conv.assigned_user.name}
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
