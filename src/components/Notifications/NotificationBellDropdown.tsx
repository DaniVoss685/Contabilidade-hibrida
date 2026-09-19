import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  Volume2,
  VolumeX,
  Smartphone,
  ExternalLink,
  MessageSquare,
  Users,
  Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { notificationService, AppNotification } from '../../services/notificationService';

export interface NotificationBellDropdownProps {
  tenantId: string;
  userId?: string;
  onOpenConversation: (conversationId: string, contactId?: string, targetTenantId?: string) => void;
}

export const NotificationBellDropdown: React.FC<NotificationBellDropdownProps> = ({
  tenantId,
  userId,
  onOpenConversation,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => notificationService.getSettings().soundEnabled);
  const [permissionState, setPermissionState] = useState<NotificationPermission>(() =>
    notificationService.getPermissionState()
  );
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const onOpenConversationRef = useRef(onOpenConversation);
  onOpenConversationRef.current = onOpenConversation;

  // Carregar notificações não lidas
  const loadNotifications = async () => {
    if (!tenantId) return;
    const list = await notificationService.fetchUnreadNotifications(tenantId);
    setNotifications(list);
  };

  useEffect(() => {
    loadNotifications();

    if (!tenantId) return;

    // Escutar novas notificações em tempo real
    const channel = supabase
      .channel(`bell_notifications_${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'df_notifications',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe((status) => {
        console.log(`[WA_BELL] Canal bell_notifications_${tenantId} status:`, status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, userId]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    notificationService.saveSettings({ soundEnabled: next }, tenantId, userId);
    if (next) {
      notificationService.playNotificationSound();
    }
  };

  const handleEnablePush = async () => {
    setIsSubscribingPush(true);
    setFeedbackMsg(null);
    try {
      const success = await notificationService.subscribeToPush(tenantId, userId);
      const perm = notificationService.getPermissionState();
      setPermissionState(perm);
      if (success || perm === 'granted') {
        notificationService.playNotificationSound();
        setFeedbackMsg('Notificações ativadas neste dispositivo com sucesso!');
      } else {
        setFeedbackMsg('Permissão não concedida no navegador.');
      }
    } catch (err: any) {
      setFeedbackMsg('Erro ao ativar notificações: ' + (err.message || 'Tente novamente'));
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleNotificationClick = async (notif: AppNotification) => {
    setIsOpen(false);
    await notificationService.markAsRead(notif.id, tenantId);
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id));

    const convId = notif.metadata?.conversation_id || notif.entity_id;
    const contactId = notif.metadata?.contact_id;
    const targetTenantId = notif.tenant_id;

    if (convId) {
      onOpenConversationRef.current(convId, contactId, targetTenantId);
    }
  };

  const handleMarkAllAsRead = async () => {
    await notificationService.markAllAsRead(tenantId);
    setNotifications([]);
  };

  const unreadCount = notifications.length;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão do Sino */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100/80 transition-colors cursor-pointer"
        title="Central de Notificações do WhatsApp"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex items-center justify-center">
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-bold text-white bg-emerald-600 rounded-full shadow-2xs">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header do Dropdown */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">Notificações</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                  {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {/* Botão de Som */}
              <button
                type="button"
                onClick={handleToggleSound}
                className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                  soundEnabled
                    ? 'text-emerald-700 hover:bg-emerald-50'
                    : 'text-slate-400 hover:bg-slate-200'
                }`}
                title={soundEnabled ? 'Som ativado (clique para silenciar)' : 'Som mudo (clique para ativar)'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Botão Marcar Todas como Lidas */}
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 text-xs transition-colors cursor-pointer flex items-center gap-1"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Banner de Ativação do Web Push (Se ainda não concedido) */}
          {permissionState !== 'granted' && (
            <div className="p-3 bg-emerald-50/80 border-b border-emerald-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Smartphone className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-[11px] text-emerald-950 font-medium leading-tight">
                  Receba avisos mesmo com a aba fechada
                </span>
              </div>
              <button
                type="button"
                disabled={isSubscribingPush}
                onClick={handleEnablePush}
                className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shrink-0 shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isSubscribingPush ? 'Ativando...' : 'Ativar push'}
              </button>
            </div>
          )}

          {/* Feedback Message */}
          {feedbackMsg && (
            <div className="p-2.5 bg-emerald-100 text-emerald-900 text-xs font-semibold border-b border-emerald-200 flex items-center justify-between">
              <span>{feedbackMsg}</span>
              <button
                type="button"
                onClick={() => setFeedbackMsg(null)}
                className="text-emerald-700 hover:text-emerald-950 text-xs font-bold ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Lista de Notificações */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="py-8 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
                  <Check className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700">Tudo em dia!</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Nenhuma mensagem pendente no WhatsApp.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isGroup = Boolean(notif.metadata?.is_group);
                const avatarUrl = notif.metadata?.avatar_url;
                const timeStr = new Date(notif.created_at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className="p-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 group"
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0 mt-0.5">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={notif.title}
                          className="w-9 h-9 rounded-full object-cover border border-slate-200"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
                          {isGroup ? <Users className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                        </div>
                      )}
                    </div>

                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {timeStr}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                        {notif.body}
                      </p>
                    </div>

                    <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 shrink-0 mt-1 transition-colors" />
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
