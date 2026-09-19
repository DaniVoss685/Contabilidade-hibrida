import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Users, X, ExternalLink, Bell } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { notificationService, AppNotification } from '../../services/notificationService';

export interface GlobalNotificationHubProps {
  tenantId: string;
  userId?: string;
  onOpenConversation: (conversationId: string, contactId?: string, targetTenantId?: string) => void;
}

interface ActiveToast {
  id: string;
  notification: AppNotification;
  timerId: NodeJS.Timeout;
}

export const GlobalNotificationHub: React.FC<GlobalNotificationHubProps> = ({
  tenantId,
  userId,
  onOpenConversation,
}) => {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const toastsRef = useRef<ActiveToast[]>([]);
  toastsRef.current = toasts;

  const onOpenConversationRef = useRef(onOpenConversation);
  onOpenConversationRef.current = onOpenConversation;

  const removeToast = (id: string) => {
    setToasts((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target?.timerId) clearTimeout(target.timerId);
      return prev.filter((t) => t.id !== id);
    });
  };

  const handleToastClick = (notif: AppNotification) => {
    removeToast(notif.id);
    notificationService.markAsRead(notif.id, notif.tenant_id);

    const convId = notif.metadata?.conversation_id || notif.entity_id;
    const contactId = notif.metadata?.contact_id;
    const targetTenantId = notif.tenant_id;

    if (convId) {
      onOpenConversationRef.current(convId, contactId, targetTenantId);
    }
  };

  // Canal Realtime estável para receber novas notificações de df_notifications
  useEffect(() => {
    if (!tenantId) return;

    console.log('[WA_NOTIFY_HUB] Inicializando canal realtime para tenant:', tenantId, 'user:', userId);

    const channel = supabase
      .channel(`global_notifications_${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'df_notifications',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const notif = payload.new as AppNotification;
          if (!notif) return;

          console.log('[WA_NOTIFY_HUB] Evento INSERT recebido no Realtime:', notif.title, notif.body);

          // Se a notificação for direcionada a outro atendente específico, não exibe
          if (notif.user_id && userId && notif.user_id !== userId) {
            console.log('[WA_NOTIFY_HUB] Notificação filtrada: destinada ao usuário', notif.user_id, 'atual:', userId);
            return;
          }

          // 1. Tocar som suave de notificação via Web Audio API
          try {
            notificationService.playNotificationSound();
          } catch (audioErr) {
            console.warn('[WA_NOTIFY_HUB] Falha silenciosa no som:', audioErr);
          }

          // 2. Disparar notificação nativa do sistema se o app estiver em background/outra aba
          if (typeof document !== 'undefined' && document.hidden) {
            notificationService.showNativeNotification(
              notif.title,
              notif.body,
              notif.metadata?.avatar_url || undefined,
              () => {
                const convId = notif.metadata?.conversation_id || notif.entity_id;
                onOpenConversationRef.current(convId, notif.metadata?.contact_id, notif.tenant_id);
              }
            );

            // Alerta visual no título da aba
            const originalTitle = document.title;
            document.title = `🔔 Nova mensagem - ${notif.title}`;
            const handleFocus = () => {
              document.title = originalTitle;
              window.removeEventListener('focus', handleFocus);
            };
            window.addEventListener('focus', handleFocus);
          }

          // 3. Exibir toast in-app flutuante
          const timerId = setTimeout(() => {
            removeToast(notif.id);
          }, 7000);

          setToasts((prev) => {
            // Limitar a no máximo 3 toasts simultâneos
            const filtered = prev.slice(-2);
            return [...filtered, { id: notif.id, notification: notif, timerId }];
          });
        }
      )
      .subscribe((status, err) => {
        console.log(`[WA_NOTIFY_HUB] Canal global_notifications_${tenantId} status:`, status, err || '');
      });

    return () => {
      console.log('[WA_NOTIFY_HUB] Desmontando canal realtime para tenant:', tenantId);
      supabase.removeChannel(channel);
      toastsRef.current.forEach((t) => {
        if (t.timerId) clearTimeout(t.timerId);
      });
    };
  }, [tenantId, userId]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none transition-all duration-200"
    >
      {toasts.map(({ id, notification: notif }) => {
        const isGroup = Boolean(notif.metadata?.is_group);
        const avatarUrl = notif.metadata?.avatar_url;

        return (
          <div
            key={id}
            onClick={() => handleToastClick(notif)}
            className="pointer-events-auto flex items-start gap-3 p-3.5 bg-white/95 backdrop-blur-md rounded-2xl border border-emerald-200 shadow-xl shadow-emerald-950/10 hover:shadow-2xl hover:border-emerald-300 transition-all cursor-pointer group transform translate-y-0 animate-in fade-in slide-in-from-top-3 duration-200"
          >
            {/* Avatar / Ícone */}
            <div className="relative shrink-0 mt-0.5">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={notif.title}
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-2xs"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
                  {isGroup ? <Users className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 rounded-full bg-emerald-600 text-white items-center justify-center text-[9px] shadow-xs">
                <MessageSquare className="w-2.5 h-2.5" />
              </span>
            </div>

            {/* Conteúdo textual */}
            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center justify-between gap-1.5 mb-0.5">
                <span className="text-xs font-bold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
                  {notif.title}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0 font-medium">agora</span>
              </div>
              <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed break-words">
                {notif.body}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 group-hover:text-emerald-800">
                <span>Clique para responder</span>
                <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            {/* Botão Fechar Toast */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeToast(id);
              }}
              className="shrink-0 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              title="Fechar notificação"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
