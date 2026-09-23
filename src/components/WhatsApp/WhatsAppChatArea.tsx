import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import {
  Send,
  Paperclip,
  Mic,
  Square,
  Trash2,
  Reply,
  Check,
  CheckCheck,
  Phone,
  Video,
  PhoneMissed,
  Info,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  X,
  FileText,
  Download,
  AlertCircle,
  ArrowRightLeft,
  CheckCircle,
  UserCheck,
  User,
  Lock,
  Smile,
  RefreshCw,
  Copy,
  Search,
  ChevronUp,
  ChevronDown,
  Play,
  Bell,
  Calendar,
  Clock,
  Plus,
  Users,
  ExternalLink,
} from 'lucide-react';
import {
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppTimelineItem,
  WhatsAppContact,
  WhatsAppEvent,
  WhatsAppInternalNote,
  WhatsAppCycleMarker,
} from '../../types/whatsapp';
import { Appointment } from '../../types';
import { formatDateBr } from '../../lib/masks';
import { supabase } from '../../lib/supabaseClient';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { formatPhoneDisplay, getContactDisplayName, getContactInitial, isWhatsAppGroup } from '../../lib/phoneUtils';
import { resolveAttendantDisplayName, stripAttendantPrefixFromContent, formatAttendantAuthorLabel } from '../../lib/attendantIdentity';
import { db } from '../../lib/db';
import { hasPermission } from '../../lib/permissions';
import { TransferModal } from './TransferModal';
import { FinalizeModal } from './FinalizeModal';
import { MediaViewerModal } from './MediaViewerModal';
import { AudioPlayer } from './AudioPlayer';

function getLocalDateKey(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTimelineDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';

  const itemKey = getLocalDateKey(dateStr);
  const todayKey = getLocalDateKey(new Date().toISOString());

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getLocalDateKey(yesterday.toISOString());

  if (itemKey === todayKey) return 'Hoje';
  if (itemKey === yesterdayKey) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface RealtimeMessageEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  message: WhatsAppMessage;
  timestamp: number;
}

interface WhatsAppChatAreaProps {
  conversation: WhatsAppConversation;
  tenantId: string;
  currentUserId?: string;
  currentUserName?: string;
  onBackMobile?: () => void;
  onToggleContext?: () => void;
  showContext?: boolean;
  onConversationUpdated?: () => void;
  onSelectConversation?: (conv: WhatsAppConversation) => void;
  realtimeMessageEvent?: RealtimeMessageEvent | null;
  onOpenCreatePatient?: () => void;
  // Telefone compartilhado (mãe + filhos etc.): estado de seleção do
  // paciente, elevado a WhatsAppMainView e compartilhado com
  // WhatsAppContextDrawer (ver comentário em WhatsAppMainView.tsx).
  relatedPatients?: Array<{ id: string; name: string; isPrimary: boolean }>;
  selectedClinicalPatientId?: string | null;
  onSelectClinicalPatient?: (patientId: string) => void;
  effectiveClinicalPatientId?: string | null;
  /** Abre a ficha completa do paciente (aba Pacientes) — chip "Pacientes relacionados". */
  onOpenPatientRecord?: (patientId: string) => void;
}

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  type: 'image' | 'video' | 'audio' | 'document';
}

export const WhatsAppChatArea: React.FC<WhatsAppChatAreaProps> = ({
  conversation,
  tenantId,
  currentUserId,
  currentUserName,
  onBackMobile,
  onToggleContext,
  showContext,
  onConversationUpdated,
  onSelectConversation,
  realtimeMessageEvent,
  onOpenCreatePatient,
  relatedPatients: relatedPatientsProp,
  selectedClinicalPatientId: selectedClinicalPatientIdProp,
  onSelectClinicalPatient,
  effectiveClinicalPatientId: effectiveClinicalPatientIdProp,
  onOpenPatientRecord,
}) => {
  const [timelineItems, setTimelineItems] = useState<WhatsAppTimelineItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(true);

  // Persistência segura de rascunho de texto por conversa (protege 100% contra perda de digitação)
  const draftStorageKey = `df_wa_draft_${tenantId}_${conversation.id}`;
  const [text, setText] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return sessionStorage.getItem(`df_wa_draft_${tenantId}_${conversation.id}`) || '';
    } catch {
      return '';
    }
  });

  const handleTextChange = (newVal: string) => {
    setText(newVal);
    try {
      if (newVal.trim()) {
        sessionStorage.setItem(draftStorageKey, newVal);
      } else {
        sessionStorage.removeItem(draftStorageKey);
      }
    } catch {}
  };

  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<WhatsAppMessage | null>(null);

  // Fila de Múltiplos Anexos e Drag & Drop
  const [attachmentQueue, setAttachmentQueue] = useState<PendingAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Audio Recording com Cancelamento Seguro
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const isAudioCancelledRef = useRef<boolean>(false);

  // Modais
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<WhatsAppMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Visualizador de mídia
  const [mediaViewerUrl, setMediaViewerUrl] = useState<string | null>(null);
  const [mediaViewerName, setMediaViewerName] = useState('arquivo');
  const [mediaViewerMime, setMediaViewerMime] = useState('');
  const [mediaViewerStoragePath, setMediaViewerStoragePath] = useState<string | null>(null);
  const [mediaViewerMessageId, setMediaViewerMessageId] = useState<string | null>(null);

  // Signed URLs cache para mídias privadas
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Recursos aprimorados
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [syncingPic, setSyncingPic] = useState(false);
  const [contactPhoto, setContactPhoto] = useState<string | null>(conversation.contact?.profile_pic_url || null);
  const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState<string | null>(null);
  const [headerNextAppointment, setHeaderNextAppointment] = useState<Appointment | null>(null);
  const [staffMap, setStaffMap] = useState<Record<string, { id: string; name: string; role?: string; whatsapp_display_name?: string | null }>>({});

  useEffect(() => {
    if (tenantId) {
      DentalWhatsAppService.getStaff(tenantId).then((list) => {
        const map: Record<string, { id: string; name: string; role?: string; whatsapp_display_name?: string | null }> = {};
        list.forEach((u) => {
          map[u.id] = u;
        });
        setStaffMap(map);
      });
    }
  }, [tenantId]);

  useEffect(() => {
    setContactPhoto(conversation.contact?.profile_pic_url || null);
  }, [conversation.contact?.profile_pic_url]);

  useEffect(() => {
    // Telefone compartilhado: quando há >1 paciente vinculado ao contato, só
    // mostra a "próxima consulta" do paciente explicitamente selecionado —
    // nunca a do paciente primário por padrão (evitaria mostrar a consulta
    // errada quando outro irmão está sendo atendido no mesmo número).
    const hasAmbiguity = (relatedPatientsProp || []).length > 1;
    const patientId = hasAmbiguity
      ? selectedClinicalPatientIdProp || null
      : conversation.contact?.patient_id || conversation.contact?.patient?.id;
    if (patientId && tenantId) {
      DentalWhatsAppService.getPatientNextAppointment(patientId, tenantId)
        .then((app) => setHeaderNextAppointment(app))
        .catch(() => setHeaderNextAppointment(null));
    } else {
      setHeaderNextAppointment(null);
    }
  }, [conversation.contact?.patient_id, conversation.contact?.patient?.id, tenantId, relatedPatientsProp, selectedClinicalPatientIdProp]);

  const handleScrollToMessage = (targetId?: string | null) => {
    if (!targetId) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2');
      }, 2000);
    }
  };

  const handleSyncProfilePic = async () => {
    if (!contact?.id || !contact?.whatsapp_number || syncingPic) return;
    setSyncingPic(true);
    try {
      const newPic = await DentalWhatsAppService.syncProfilePic(contact.id, tenantId, contact.whatsapp_number);
      if (newPic) {
        setContactPhoto(newPic);
        onConversationUpdated?.();
      }
    } catch (e) {
      console.warn('Falha ao sincronizar foto:', e);
    } finally {
      setSyncingPic(false);
    }
  };

  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  const handleReact = async (msg: WhatsAppMessage, emoji: string) => {
    setActiveReactionPickerMsgId(null);
    try {
      await DentalWhatsAppService.sendReaction({
        tenantId,
        conversationId: conversation.id,
        recipientNumber: contact?.whatsapp_number || '',
        evolutionMsgId: msg.evolution_msg_id || '',
        messageId: msg.id,
        emoji,
        targetFromMe: Boolean(msg.from_me),
        remoteJid: msg.remote_jid || undefined,
      });
      await loadTimeline();
    } catch (e) {
      console.warn('Erro ao reagir:', e);
    }
  };

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const isInitialLoadRef = useRef<boolean>(true);
  const [showNewMessageButton, setShowNewMessageButton] = useState(false);
  const [unreadIncomingCount, setUnreadIncomingCount] = useState(0);

  // Pesquisa na Conversa
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WhatsAppMessage[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const contact = conversation.contact;
  const isAssignedToMe = conversation.assigned_to === currentUserId;

  // Contexto para "Anexar ao prontuário": nunca disponível para grupos ou contatos sem paciente vinculado.
  const isGroupConversation = isWhatsAppGroup(contact?.whatsapp_number);
  const linkedPatientId = contact?.patient_id || contact?.patient?.id || null;
  const linkedPatientName = contact?.patient?.name || contact?.name || 'Paciente';
  const canAttachToRecord = useMemo(() => {
    const currentUser = db.getUser();
    return hasPermission(currentUser?.role, 'patients:manage', currentUser?.permissions, currentUser?.isPrimary);
  }, []);

  // Telefone compartilhado (mãe + filhos, etc.): estado de seleção elevado a
  // WhatsAppMainView (compartilhado com WhatsAppContextDrawer) — nunca
  // escolher automaticamente quando há >1 paciente vinculado (Fase 8/9 do
  // modelo de responsável, ver CLAUDE.md "Guardian / telefone compartilhado").
  const relatedPatients = relatedPatientsProp || [];
  const selectedClinicalPatientId = selectedClinicalPatientIdProp ?? null;
  const effectiveClinicalPatientId = effectiveClinicalPatientIdProp !== undefined ? effectiveClinicalPatientIdProp : linkedPatientId;
  const setSelectedClinicalPatientId = onSelectClinicalPatient || (() => {});

  const isAttendanceActive = Boolean(
    conversation &&
    conversation.id &&
    !conversation.id.startsWith('consult_') &&
    conversation.status !== 'finalizado' &&
    conversation.status !== 'arquivado'
  );

  const [startingAttendance, setStartingAttendance] = useState(false);

  const handleStartAttendance = async () => {
    if (!contact?.id || startingAttendance) return;
    setStartingAttendance(true);
    try {
      const res = await DentalWhatsAppService.startNewAttendanceCycle({
        tenantId,
        contactId: contact.id,
        userId: currentUserId || '',
        userName: currentUserName,
      });

      if (res?.conversation) {
        onSelectConversation?.(res.conversation);
      }
      onConversationUpdated?.();
      await loadTimeline();
    } catch (e: any) {
      console.error('[WhatsAppChatArea] Erro ao iniciar atendimento:', e);
      alert('Erro ao iniciar atendimento: ' + (e.message || 'Falha ao iniciar'));
    } finally {
      setStartingAttendance(false);
    }
  };

  // Scroll EXATO no final matemático da conversa (sem tolerância, 100% visível)
  const forceExactScrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (bottomSentinelRef.current) {
      bottomSentinelRef.current.scrollIntoView({ block: 'end', behavior: 'instant' as any });
    }
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    isNearBottomRef.current = true;
    setShowNewMessageButton(false);
    setUnreadIncomingCount(0);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = messagesContainerRef.current;
    if (behavior === 'auto' || behavior === 'instant') {
      forceExactScrollToBottom();
      return;
    }
    if (bottomSentinelRef.current) {
      bottomSentinelRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    isNearBottomRef.current = true;
    setShowNewMessageButton(false);
    setUnreadIncomingCount(0);
  };

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Se estiver a menos de 60px, está considerado no final
    const isNear = distanceFromBottom <= 60;
    isNearBottomRef.current = isNear;

    if (isNear) {
      setShowNewMessageButton(false);
      setUnreadIncomingCount(0);
    } else if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
    }
  };

  // Função centralizada para resolver Signed URLs com cache e reatividade imediata
  const resolveSignedUrl = async (path?: string | null) => {
    if (!path) return null;
    if (signedUrls[path]) return signedUrls[path];
    try {
      const url = await DentalWhatsAppService.getSignedMediaUrl(path);
      if (url) {
        setSignedUrls((prev) => {
          if (prev[path] === url) return prev;
          return { ...prev, [path]: url };
        });
      }
      return url;
    } catch (e) {
      console.warn('[WhatsAppChatArea] Erro ao resolver signed URL:', path, e);
      return null;
    }
  };

  // Sentinela reativo: garante que qualquer mensagem na timeline com media_storage_path tenha sua Signed URL resolvida
  useEffect(() => {
    timelineItems.forEach((it) => {
      if (it.type === 'message') {
        const m = it.data.item as WhatsAppMessage;
        if (m.media_storage_path && !signedUrls[m.media_storage_path]) {
          resolveSignedUrl(m.media_storage_path);
        }
      }
    });
  }, [timelineItems, signedUrls]);

  // Carregar timeline por CONTATO (histórico unificado de todos os ciclos) e marcar como lida
  const loadTimeline = async () => {
    try {
      let items: WhatsAppTimelineItem[] = [];
      if (contact?.id) {
        items = await DentalWhatsAppService.getContactTimeline(contact.id, tenantId);
      } else if (conversation.id && !conversation.id.startsWith('consult_')) {
        items = await DentalWhatsAppService.getTimeline(conversation.id, tenantId);
      }
      setTimelineItems(items);

      // Resolver signed URLs para mídias privadas
      const pathsToResolve: string[] = [];
      items.forEach((it) => {
        if (it.type === 'message') {
          const m = it.data.item as WhatsAppMessage;
          if (m.media_storage_path && !signedUrls[m.media_storage_path]) {
            pathsToResolve.push(m.media_storage_path);
          }
        }
      });

      if (pathsToResolve.length > 0) {
        const uniquePaths = Array.from(new Set(pathsToResolve));
        uniquePaths.forEach((p) => resolveSignedUrl(p));
      }

      if (
        conversation.id &&
        !conversation.id.startsWith('consult_') &&
        conversation.unread_count > 0
      ) {
        DentalWhatsAppService.markAsRead(conversation.id, tenantId);
      }
    } catch (err) {
      console.warn('Erro ao carregar timeline do contato:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  useEffect(() => {
    isInitialLoadRef.current = true;
    setShowNewMessageButton(false);
    setUnreadIncomingCount(0);
    setLoadingTimeline(true);
    loadTimeline();

    // Focar no composer automaticamente ao abrir conversa
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 250);
    return () => clearTimeout(timer);
  }, [conversation.id, tenantId]);

  // Scroll inicial exato e estável direto no final matemático da conversa (sem tolerância, 100% visível)
  useLayoutEffect(() => {
    if (!loadingTimeline && timelineItems.length > 0) {
      forceExactScrollToBottom();

      // Double requestAnimationFrame garante execução após layout e reflow completos do browser
      requestAnimationFrame(() => {
        forceExactScrollToBottom();
        requestAnimationFrame(() => {
          forceExactScrollToBottom();
        });
      });

      // Estabilizações rápidas pós-render para absorver mídias/áudios imediatos
      const t1 = setTimeout(() => {
        if (isNearBottomRef.current) forceExactScrollToBottom();
      }, 50);

      const t2 = setTimeout(() => {
        if (isNearBottomRef.current) {
          forceExactScrollToBottom();
          isInitialLoadRef.current = false;
        }
      }, 200);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [loadingTimeline, conversation.id]);

  // ResizeObserver no messagesContentRef: monitora quando imagens, áudios e DOM expandem a altura
  useEffect(() => {
    const contentEl = messagesContentRef.current;
    const container = messagesContainerRef.current;
    if (!contentEl || !container) return;

    let prevContentHeight = contentEl.scrollHeight;

    const ro = new ResizeObserver(() => {
      const currentHeight = contentEl.scrollHeight;
      if (currentHeight !== prevContentHeight) {
        if (isNearBottomRef.current || isInitialLoadRef.current) {
          forceExactScrollToBottom();
        }
        prevContentHeight = currentHeight;
      }
    });

    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [conversation.id]);

  // Handlers de Pesquisa na Conversa
  const handleCloseSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setCurrentMatchIndex(-1);
  };

  const handleSearchChange = async (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setCurrentMatchIndex(-1);
      return;
    }

    setIsSearching(true);
    try {
      const results = contact?.id
        ? await DentalWhatsAppService.searchMessagesInContact(contact.id, tenantId, val)
        : await DentalWhatsAppService.searchMessagesInConversation(
            conversation.id,
            tenantId,
            val
          );
      setSearchResults(results);
      if (results.length > 0) {
        goToMatch(0, results);
      } else {
        setCurrentMatchIndex(-1);
      }
    } catch (e) {
      console.warn('Erro ao pesquisar:', e);
    } finally {
      setIsSearching(false);
    }
  };

  const goToMatch = (index: number, resultsList = searchResults) => {
    if (index < 0 || index >= resultsList.length) return;
    setCurrentMatchIndex(index);
    const targetMsg = resultsList[index];
    if (!targetMsg) return;

    // Se por acaso a mensagem não estiver no array da timeline, injetá-la para exibição
    setTimelineItems((prev) => {
      if (prev.some((it) => it.id === targetMsg.id)) return prev;
      return [
        ...prev,
        {
          id: targetMsg.id,
          type: 'message',
          created_at: targetMsg.created_at,
          data: { type: 'message', item: targetMsg },
        },
      ];
    });

    requestAnimationFrame(() => {
      const el = document.getElementById(`msg-${targetMsg.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2', 'bg-amber-100/60');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2', 'bg-amber-100/60');
        }, 2500);
      }
    });
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchResults.length;
    goToMatch(nextIndex);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return;
    const prevIndex = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    goToMatch(prevIndex);
  };

  useEffect(() => {
    handleCloseSearch();
  }, [conversation.id]);

  // Realce de texto sem alterar conteúdo original
  const renderHighlightedText = (content: string, term: string) => {
    if (!term.trim() || !content) return content;
    try {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      const parts = content.split(regex);
      return parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-amber-300 text-amber-950 font-semibold px-0.5 rounded-xs">
            {part}
          </mark>
        ) : (
          part
        )
      );
    } catch {
      return content;
    }
  };

  // Sincronização direta via Hub de Realtime (zero-delay do canal de tenant)
  useEffect(() => {
    if (!realtimeMessageEvent) return;
    const { eventType, message } = realtimeMessageEvent;
    if (!message) return;

    const belongsToChat =
      (contact?.id && (message as any).contact_id === contact.id) ||
      (conversation.id && message.conversation_id === conversation.id) ||
      (contact?.whatsapp_number && (message as any).remote_jid?.includes(contact.whatsapp_number));

    if (!belongsToChat) return;

    if (eventType === 'INSERT') {
      if (message.media_storage_path) {
        resolveSignedUrl(message.media_storage_path);
      }

      setTimelineItems((prev) => {
        const alreadyExists = prev.some((it) => {
          if (it.type !== 'message') return false;
          const m = it.data.item as WhatsAppMessage;
          if (m.id === message.id) return true;
          if (message.evolution_msg_id && m.evolution_msg_id && m.evolution_msg_id === message.evolution_msg_id) return true;
          return false;
        });

        if (alreadyExists) return prev;

        return [
          ...prev,
          {
            id: message.id,
            type: 'message',
            created_at: message.created_at,
            data: { type: 'message', item: message },
          },
        ];
      });

      // Se foi enviado por mim ou se o usuário estiver no fim: auto-scroll suave
      if (message.from_me || isNearBottomRef.current) {
        scrollToBottom('smooth');
      } else {
        // Usuário está lendo mensagens antigas: preserva posição e exibe botão '↓ Nova mensagem'
        setShowNewMessageButton(true);
        setUnreadIncomingCount((prev) => prev + 1);
      }

      if (!message.from_me) {
        DentalWhatsAppService.markAsRead(conversation.id, tenantId);
      }
    } else if (eventType === 'UPDATE') {
      const updatedMsg = message;

      // RESOLUÇÃO IMEDIATA DA SIGNED URL NO UPDATE (Áudio / Figurinha / Imagem processada pelo webhook)
      if (updatedMsg.media_storage_path) {
        resolveSignedUrl(updatedMsg.media_storage_path);
      }

      setTimelineItems((prev) =>
        prev.map((it) => {
          if (it.id === updatedMsg.id && it.type === 'message') {
            const currentItem = it.data.item as WhatsAppMessage;
            const merged: WhatsAppMessage = {
              ...currentItem,
              ...updatedMsg,
              reply_to_message: updatedMsg.reply_to_message || currentItem.reply_to_message,
            };
            return {
              ...it,
              created_at: merged.created_at || it.created_at,
              data: { type: 'message', item: merged },
            };
          }
          return it;
        })
      );
    } else if (eventType === 'DELETE') {
      setTimelineItems((prev) => prev.filter((it) => it.id !== message.id));
    }
  }, [realtimeMessageEvent]);

  // Realtime subscription de redundância da conversa ativa (mensagens, eventos e notas)
  useEffect(() => {
    if (!conversation.id || !tenantId) return;

    const chatChannel = supabase
      .channel(`dental_wa_chat_${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'df_wa_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as WhatsAppMessage;

          if (newMsg.media_storage_path) {
            resolveSignedUrl(newMsg.media_storage_path);
          }

          setTimelineItems((prev) => {
            const exists = prev.some((item) => {
              if (item.id === newMsg.id) return true;
              if (item.type === 'message' && newMsg.evolution_msg_id) {
                return (item.data.item as WhatsAppMessage).evolution_msg_id === newMsg.evolution_msg_id;
              }
              return false;
            });
            if (exists) return prev;

            return [
              ...prev,
              {
                id: newMsg.id,
                type: 'message',
                created_at: newMsg.created_at,
                data: { type: 'message', item: newMsg },
              },
            ];
          });

          if (newMsg.from_me || isNearBottomRef.current) {
            scrollToBottom('smooth');
          } else {
            setShowNewMessageButton(true);
            setUnreadIncomingCount((prev) => prev + 1);
          }

          if (!newMsg.from_me) {
            DentalWhatsAppService.markAsRead(conversation.id, tenantId);
          }

          onConversationUpdated?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'df_wa_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const updatedMsg = payload.new as WhatsAppMessage;
          if (!updatedMsg) return;

          if (updatedMsg.media_storage_path) {
            resolveSignedUrl(updatedMsg.media_storage_path);
          }

          setTimelineItems((prev) =>
            prev.map((it) => {
              if (it.id === updatedMsg.id && it.type === 'message') {
                const currentItem = it.data.item as WhatsAppMessage;
                const merged: WhatsAppMessage = {
                  ...currentItem,
                  ...updatedMsg,
                  reply_to_message: updatedMsg.reply_to_message || currentItem.reply_to_message,
                };
                return {
                  ...it,
                  created_at: merged.created_at || it.created_at,
                  data: { type: 'message', item: merged },
                };
              }
              return it;
            })
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'df_wa_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const oldId = (payload.old as any)?.id;
          if (oldId) {
            setTimelineItems((prev) => prev.filter((it) => it.id !== oldId));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'df_wa_events',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newEvt = payload.new as WhatsAppEvent;
          setTimelineItems((prev) => {
            if (prev.some((item) => item.id === newEvt.id)) return prev;
            return [
              ...prev,
              {
                id: newEvt.id,
                type: 'event',
                created_at: newEvt.created_at,
                data: { type: 'event', item: newEvt },
              },
            ];
          });
          if (isNearBottomRef.current) scrollToBottom('smooth');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'df_wa_internal_notes',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newNote = payload.new as WhatsAppInternalNote;
          setTimelineItems((prev) => {
            if (prev.some((item) => item.id === newNote.id)) return prev;
            return [
              ...prev,
              {
                id: newNote.id,
                type: 'note',
                created_at: newNote.created_at,
                data: { type: 'note', item: newNote },
              },
            ];
          });
          if (isNearBottomRef.current) scrollToBottom('smooth');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
    };
  }, [conversation.id, tenantId]);

  // Materializa a conversa real (df_wa_conversations) na primeira ação de escrita
  // sobre um contato que ainda não tem nenhum atendimento (WhatsAppMainView.handleSelectContact
  // monta um placeholder em memória com id `consult_${contact.id}` só para exibição —
  // ver A19: "criar conversation quando necessário", nunca apenas para aparecer em Contatos).
  // Reaproveita conversa ativa concorrente com segurança (getOrCreateActiveConversationForContact
  // já trata a corrida via índice único + fallback). Atualiza o estado do pai para que as
  // próximas ações (finalizar, transferir, notas, realtime) já usem o id real.
  const ensureRealConversation = async (): Promise<WhatsAppConversation> => {
    if (!conversation.id.startsWith('consult_')) return conversation;
    if (!currentUserId) {
      throw new Error('Sessão inválida: não foi possível identificar o atendente para iniciar a conversa.');
    }

    const contactId = conversation.contact_id || conversation.id.slice('consult_'.length);
    const { conversation: realConv } = await DentalWhatsAppService.getOrCreateActiveConversationForContact({
      tenantId,
      contactId,
      userId: currentUserId,
      userName: currentUserName,
    });

    onSelectConversation?.(realConv);
    return realConv;
  };

  // Enviar Mensagem de Texto ou Nota Interna
  const handleSendText = async () => {
    if (!text.trim() || sending) return;

    const contentToSend = text.trim();
    setText('');
    try {
      sessionStorage.removeItem(draftStorageKey);
    } catch {}
    setSending(true);

    try {
      const activeConversation = await ensureRealConversation();

      if (isInternalNote) {
        await DentalWhatsAppService.addInternalNote(
          activeConversation.id,
          tenantId,
          currentUserId,
          contentToSend
        );
        setIsInternalNote(false);
      } else {
        const sendRes = await DentalWhatsAppService.sendMessage({
          conversationId: activeConversation.id,
          tenantId,
          senderId: currentUserId,
          content: contentToSend,
          replyToId: replyingTo?.id,
        });
        if (!sendRes.success && sendRes.error) {
          console.warn('Falha no envio WhatsApp:', sendRes.error);
        }
        setReplyingTo(null);
      }

      await loadTimeline();
      scrollToBottom('smooth');
      onConversationUpdated?.();
    } catch (err) {
      console.error('Falha ao enviar mensagem ou nota interna:', err);
    } finally {
      setSending(false);
    }
  };

  // Gerenciamento de Fila de Múltiplos Anexos
  const handleFilesAdded = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    const newItems: PendingAttachment[] = list.map((file) => {
      let type: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      return {
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file,
        previewUrl: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : '',
        name: file.name,
        size: file.size,
        type,
      };
    });

    setAttachmentQueue((prev) => [...prev, ...newItems]);
  };

  const removeAttachment = (id: string) => {
    setAttachmentQueue((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const clearAttachmentQueue = () => {
    attachmentQueue.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachmentQueue([]);
  };

  const moveAttachment = (index: number, direction: 'left' | 'right') => {
    setAttachmentQueue((prev) => {
      const targetIndex = direction === 'left' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleSendAttachments = async () => {
    if (attachmentQueue.length === 0) return;
    setSending(true);
    const captionText = text.trim();

    try {
      const activeConversation = await ensureRealConversation();

      // Envio sequencial preservando rigorosamente a ordem da fila
      for (let i = 0; i < attachmentQueue.length; i++) {
        const item = attachmentQueue[i];
        // Aplica a legenda digitada pelo usuário no primeiro anexo enviado
        const itemCaption = i === 0 ? captionText : '';
        await DentalWhatsAppService.sendMediaMessage({
          conversationId: activeConversation.id,
          tenantId,
          senderId: currentUserId,
          file: item.file,
          caption: itemCaption,
          replyToId: i === 0 ? replyingTo?.id : undefined,
        });
      }

      clearAttachmentQueue();
      setText('');
      try {
        sessionStorage.removeItem(draftStorageKey);
      } catch {}
      setReplyingTo(null);
      await loadTimeline();
      scrollToBottom('smooth');
      onConversationUpdated?.();
    } catch (err) {
      console.error('Falha ao enviar fila de anexos:', err);
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Gravação de Áudio com Cancelamento Robusto
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      isAudioCancelledRef.current = false;

      mediaRecorder.ondataavailable = (event) => {
        if (!isAudioCancelledRef.current && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (isAudioCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/ogg; codecs=opus' });
        audioChunksRef.current = [];

        if (audioBlob.size > 0) {
          setSending(true);
          try {
            const activeConversation = await ensureRealConversation();
            await DentalWhatsAppService.sendAudioMessage({
              conversationId: activeConversation.id,
              tenantId,
              senderId: currentUserId,
              audioBlob,
              replyToId: replyingTo?.id,
            });
            setReplyingTo(null);
            await loadTimeline();
            scrollToBottom('smooth');
            onConversationUpdated?.();
          } catch (err) {
            console.error('Erro ao enviar áudio:', err);
          } finally {
            setSending(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Não foi possível acessar o microfone para gravação de áudio.');
    }
  };

  const cancelRecording = () => {
    isAudioCancelledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch (_e) {}
    }
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = () => {
    isAudioCancelledRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const stopRecording = (shouldSend = true) => {
    if (shouldSend) {
      stopAndSendRecording();
    } else {
      cancelRecording();
    }
  };

  // Claim Atômico
  const handleClaim = async () => {
    if (!currentUserId) return;
    const res = await DentalWhatsAppService.claimConversation(
      conversation.id,
      tenantId,
      currentUserId
    );
    if (res.success) {
      await loadTimeline();
      onConversationUpdated?.();
    } else if (res.alreadyClaimed) {
      alert(`Este atendimento já foi assumido por: ${res.assignedUserName || 'outro atendente'}.`);
      onConversationUpdated?.();
    } else {
      alert(res.error || 'Erro ao assumir atendimento.');
    }
  };

  // Seletor e Atualização Dinâmica de Status dentro do Chat
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [showReturnToQueueModal, setShowReturnToQueueModal] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const handleUpdateStatus = async (newStatus: 'em_atendimento' | 'aguardando_cliente' | 'aguardando_interno' | 'na_fila') => {
    if (!conversation.id || changingStatus) return;
    setStatusDropdownOpen(false);

    if (newStatus === 'na_fila') {
      setShowReturnToQueueModal(true);
      return;
    }

    setChangingStatus(true);
    try {
      await DentalWhatsAppService.updateStatus(
        conversation.id,
        tenantId,
        newStatus,
        currentUserId,
        conversation.assigned_to
      );
      await loadTimeline();
      onConversationUpdated?.();
    } catch (err: any) {
      console.error('Erro ao atualizar status:', err);
      alert('Erro ao atualizar status: ' + (err.message || 'Falha na comunicação'));
    } finally {
      setChangingStatus(false);
    }
  };

  const handleConfirmReturnToQueue = async () => {
    if (!conversation.id || changingStatus) return;
    setChangingStatus(true);
    try {
      await DentalWhatsAppService.updateStatus(
        conversation.id,
        tenantId,
        'na_fila',
        currentUserId,
        null
      );
      setShowReturnToQueueModal(false);
      await loadTimeline();
      onConversationUpdated?.();
    } catch (err: any) {
      console.error('Erro ao devolver para a fila:', err);
      alert('Erro ao devolver para a fila: ' + (err.message || 'Falha na comunicação'));
    } finally {
      setChangingStatus(false);
    }
  };

  // Confirmar Exclusão Local
  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;
    setDeleting(true);
    try {
      const ok = await DentalWhatsAppService.deleteMessageLocally(messageToDelete.id, tenantId);
      if (ok) {
        setTimelineItems((prev) => prev.filter((it) => it.id !== messageToDelete.id));
        setShowDeleteModal(false);
        setMessageToDelete(null);
        onConversationUpdated?.();
      }
    } catch (err) {
      console.warn('Erro ao excluir mensagem:', err);
    } finally {
      setDeleting(false);
    }
  };

  const [retryingMsgId, setRetryingMsgId] = useState<string | null>(null);

  const handleRetryMessage = async (msg: WhatsAppMessage) => {
    if (retryingMsgId === msg.id) return;
    setRetryingMsgId(msg.id);
    try {
      const res = await DentalWhatsAppService.retryFailedMessage({
        messageId: msg.id,
        tenantId,
        conversationId: conversation.id,
      });
      if (res.success) {
        await loadTimeline();
        onConversationUpdated?.();
      } else {
        alert(`Não foi possível reenviar a mensagem: ${res.error || 'Erro desconhecido'}`);
      }
    } catch (e: any) {
      alert(`Falha ao reenviar: ${e.message || 'Erro de conexão'}`);
    } finally {
      setRetryingMsgId(null);
    }
  };

  // Renderizador de Status de Entrega
  const renderDeliveryStatus = (status: number, msg?: WhatsAppMessage) => {
    if (status === -1) {
      const isRetrying = msg && retryingMsgId === msg.id;
      return (
        <span className="flex items-center gap-1 text-rose-300 font-semibold" title="Falha no envio da mensagem">
          <AlertCircle className="w-3.5 h-3.5 text-rose-300" />
          {msg && (
            <button
              type="button"
              disabled={isRetrying}
              onClick={(e) => {
                e.stopPropagation();
                handleRetryMessage(msg);
              }}
              className="hover:underline cursor-pointer text-[9px] bg-rose-900/70 hover:bg-rose-900 text-rose-100 px-1.5 py-0.5 rounded border border-rose-400/40"
              title="Clique para tentar reenviar esta mensagem pelo WhatsApp"
            >
              {isRetrying ? 'Reenviando...' : 'Reenviar'}
            </button>
          )}
        </span>
      );
    }
    if (status === 1) return <Check className="w-3.5 h-3.5 text-slate-400" title="Pendente" />;
    if (status === 2) return <Check className="w-3.5 h-3.5 text-slate-400" title="Enviado ao servidor" />;
    if (status === 3) return <CheckCheck className="w-3.5 h-3.5 text-slate-400" title="Entregue" />;
    if (status >= 4) return <CheckCheck className="w-3.5 h-3.5 text-blue-500" title="Lido" />;
    return null;
  };

  // Ordenação estável, cronológica e deduplicada dos itens da timeline
  const sortedTimelineItems = useMemo(() => {
    const sorted = [...timelineItems].sort((a, b) => {
      const timeA = new Date(a.created_at || (a as any).timestamp || 0).getTime();
      const timeB = new Date(b.created_at || (b as any).timestamp || 0).getTime();
      return timeA - timeB;
    });

    const deduplicated: WhatsAppTimelineItem[] = [];
    const seenTransfers = new Set<string>();

    for (const item of sorted) {
      const isTransferItem =
        item.type === 'transfer' ||
        (item.type === 'event' && (item.data.item as any)?.event_type === 'transferred');

      if (isTransferItem) {
        const transferData = item.data.item as any;
        const transferId = transferData?.id || (item as any).id;
        const toId = transferData?.to_user_id || transferData?.metadata?.to_user_id || '';
        const timestampApprox = Math.floor(new Date(item.created_at || 0).getTime() / 5000);
        const signature = `${toId}_${timestampApprox}`;

        if (seenTransfers.has(signature) || (transferId && seenTransfers.has(transferId))) {
          continue;
        }
        if (transferId) seenTransfers.add(transferId);
        seenTransfers.add(signature);
      }

      deduplicated.push(item);
    }

    return deduplicated;
  }, [timelineItems]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFilesAdded(e.dataTransfer.files);
        }
      }}
      className="flex-1 flex flex-col h-full bg-slate-100/70 relative overflow-hidden"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-emerald-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 border-4 border-dashed border-emerald-400 pointer-events-none transition-all animate-in fade-in duration-150">
          <div className="p-4 bg-emerald-600 text-white rounded-full mb-3 shadow-lg animate-bounce">
            <UploadCloud className="w-10 h-10" />
          </div>
          <p className="text-white text-lg font-bold">Solte seus arquivos aqui</p>
          <p className="text-emerald-200 text-xs mt-1">Imagens, vídeos e documentos serão adicionados à fila de envio</p>
        </div>
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200/80 shadow-2xs z-10 shrink-0">
        <div className="flex items-center gap-3">
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm overflow-hidden border border-slate-200 shadow-2xs">
              {contactPhoto ? (
                <img src={contactPhoto} alt={getContactDisplayName(contact)} className="w-full h-full object-cover" />
              ) : (
                <span>{getContactInitial(contact)}</span>
              )}
            </div>
            <div
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                isAttendanceActive
                  ? conversation.status === 'em_atendimento'
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                  : 'bg-slate-400'
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 truncate max-w-[200px] sm:max-w-xs">
                {getContactDisplayName(contact)}
              </h3>
              <button
                type="button"
                onClick={handleSyncProfilePic}
                disabled={syncingPic}
                className="p-1 text-slate-400 hover:text-emerald-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                title="Sincronizar foto do perfil no WhatsApp"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingPic ? 'animate-spin text-emerald-600' : ''}`} />
              </button>
              {isWhatsAppGroup(contact?.whatsapp_number) ? (
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold flex items-center gap-1">
                  <Users className="w-3 h-3 text-purple-700" />
                  Grupo
                </span>
              ) : contact?.patient || contact?.patient_id ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  Paciente
                </span>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Não cadastrado
                  </span>
                  {onOpenCreatePatient && (
                    <button
                      type="button"
                      onClick={onOpenCreatePatient}
                      className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                      title="Cadastrar este contato como paciente"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      Cadastrar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!showContext && onToggleContext) onToggleContext();
                    }}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                    title="Vincular a um paciente existente (abre painel lateral)"
                  >
                    <UserCheck className="w-2.5 h-2.5" />
                    Vincular
                  </button>
                </div>
              )}
              {!isAttendanceActive && (
                <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-medium hidden sm:inline">
                  Sem atendimento ativo
                </span>
              )}
              {headerNextAppointment && (
                <button
                  type="button"
                  onClick={onToggleContext}
                  className="px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-100 text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer hidden md:inline-flex"
                  title="Próxima Consulta Agendada (Clique para ver detalhes no painel lateral)"
                >
                  <Calendar className="w-3 h-3 text-teal-600" />
                  <span>Consulta: {formatDateBr(headerNextAppointment.date)} às {headerNextAppointment.startTime}</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-slate-500 font-mono">
                {formatPhoneDisplay(contact?.whatsapp_number || '')}
              </p>
              {conversation.assigned_user?.name && (
                <span className="text-[11px] text-slate-400 font-sans">
                  • Atendente: <strong className="text-slate-600 font-medium">{conversation.assigned_user.name}</strong>
                </span>
              )}
            </div>
            {relatedPatients.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <span className="text-[10px] font-bold text-slate-500">Pacientes relacionados:</span>
                {relatedPatients.map((p) => (
                  <span
                    key={p.id}
                    className={`inline-flex items-center rounded-full text-[10px] font-bold border overflow-hidden ${
                      selectedClinicalPatientId === p.id
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedClinicalPatientId(p.id)}
                      title="Selecionar para ações clínicas (anexar documento, abrir prontuário)"
                      className={`px-2 py-0.5 cursor-pointer transition-colors ${
                        selectedClinicalPatientId === p.id ? '' : 'hover:bg-emerald-50'
                      }`}
                    >
                      {p.name}{p.isPrimary ? ' — Titular' : ''}
                    </button>
                    {onOpenPatientRecord && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenPatientRecord(p.id);
                        }}
                        title={`Abrir ficha completa de ${p.name}`}
                        className={`pl-1 pr-2 py-0.5 cursor-pointer border-l transition-colors ${
                          selectedClinicalPatientId === p.id
                            ? 'border-emerald-500 hover:bg-emerald-700'
                            : 'border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {!isAttendanceActive ? (
            <button
              type="button"
              onClick={handleStartAttendance}
              disabled={startingAttendance}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1.5"
              title="Iniciar um novo ciclo de atendimento para este contato"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{startingAttendance ? 'Iniciando...' : 'Iniciar Atendimento'}</span>
            </button>
          ) : (
            <>
              {!isAssignedToMe && (
                <button
                  onClick={handleClaim}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Assumir</span>
                </button>
              )}

              {/* Seletor Discreto de Status de Atendimento */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStatusDropdownOpen((prev) => !prev)}
                  disabled={changingStatus}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                    conversation.status === 'aguardando_cliente'
                      ? 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200'
                      : conversation.status === 'aguardando_interno'
                      ? 'bg-purple-50 hover:bg-purple-100 text-purple-800 border-purple-200'
                      : conversation.status === 'na_fila'
                      ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}
                  title="Alterar status deste atendimento"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      conversation.status === 'aguardando_cliente'
                        ? 'bg-blue-500'
                        : conversation.status === 'aguardando_interno'
                        ? 'bg-purple-500'
                        : conversation.status === 'na_fila'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                  <span>
                    {conversation.status === 'aguardando_cliente'
                      ? 'Aguardando Paciente'
                      : conversation.status === 'aguardando_interno'
                      ? 'Aguardando Interno'
                      : conversation.status === 'na_fila'
                      ? 'Na Fila'
                      : 'Em Atendimento'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </button>

                {statusDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setStatusDropdownOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-40 py-1.5 text-xs animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Alterar Status
                      </div>

                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('em_atendimento')}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                          conversation.status === 'em_atendimento' ? 'text-emerald-700 font-bold bg-emerald-50/50' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>Em Atendimento</span>
                        </div>
                        {conversation.status === 'em_atendimento' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('aguardando_cliente')}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                          conversation.status === 'aguardando_cliente' ? 'text-blue-700 font-bold bg-blue-50/50' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span>Aguardando Paciente</span>
                        </div>
                        {conversation.status === 'aguardando_cliente' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('aguardando_interno')}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                          conversation.status === 'aguardando_interno' ? 'text-purple-700 font-bold bg-purple-50/50' : 'text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-500" />
                          <span>Aguardando Interno</span>
                        </div>
                        {conversation.status === 'aguardando_interno' && <Check className="w-3.5 h-3.5 text-purple-600" />}
                      </button>

                      <div className="my-1 border-t border-slate-100" />

                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('na_fila')}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Devolver para Fila</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setShowTransferModal(true)}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                title="Transferir conversa"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Transferir</span>
              </button>

              <button
                onClick={() => setShowFinalizeModal(true)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                title="Finalizar atendimento"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Finalizar</span>
              </button>
            </>
          )}

          {/* Botão de Pesquisa nesta conversa */}
          <button
            type="button"
            onClick={() => {
              setIsSearchOpen((prev) => !prev);
              if (!isSearchOpen) {
                setTimeout(() => searchInputRef.current?.focus(), 60);
              }
            }}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isSearchOpen
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title="Pesquisar nesta conversa"
          >
            <Search className="w-4 h-4" />
          </button>

          {onToggleContext && (
            <button
              onClick={onToggleContext}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                showContext
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title="Informações do contato e histórico"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Barra de Pesquisa dentro da Conversa */}
      {isSearchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200/80 shrink-0 z-10 animate-in slide-in-from-top-1 duration-150">
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) handlePrevMatch();
                  else handleNextMatch();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCloseSearch();
                }
              }}
              placeholder="Pesquisar nesta conversa... (Enter para próximo, Esc para fechar)"
              className="w-full pl-9 pr-28 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
            <div className="absolute right-2.5 flex items-center text-[11px] text-slate-400 font-medium select-none">
              {isSearching ? (
                <span>Buscando...</span>
              ) : searchQuery.trim() ? (
                searchResults.length > 0 ? (
                  <span className="text-slate-700 font-semibold">
                    {currentMatchIndex + 1} de {searchResults.length}
                  </span>
                ) : (
                  <span className="text-rose-500 font-medium">Nenhum resultado</span>
                )
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevMatch}
              disabled={searchResults.length === 0}
              className="p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded-lg hover:bg-slate-200/60 cursor-pointer disabled:cursor-default"
              title="Resultado anterior (Shift+Enter)"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextMatch}
              disabled={searchResults.length === 0}
              className="p-1.5 text-slate-500 hover:text-slate-800 disabled:opacity-30 rounded-lg hover:bg-slate-200/60 cursor-pointer disabled:cursor-default"
              title="Próximo resultado (Enter)"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleCloseSearch}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 cursor-pointer ml-1"
              title="Fechar pesquisa (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Messages Timeline Container */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 sm:p-6 pb-2 relative"
      >
        <div ref={messagesContentRef} className="space-y-3 min-h-full flex flex-col justify-end">
        {loadingTimeline ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-400">
            Carregando mensagens...
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs">
            <p>Nenhuma mensagem nesta conversa ainda.</p>
            <p className="text-[11px] text-slate-400 mt-1">Envie uma mensagem abaixo para iniciar o contato.</p>
          </div>
        ) : (
          sortedTimelineItems.map((item, idx) => {
            // Separador de Data Dinâmico Estável (Dia / Mês / Ano no fuso local)
            const itemDate = item.created_at || (item as any).timestamp;
            const currentKey = getLocalDateKey(itemDate);
            const prevItem = idx > 0 ? sortedTimelineItems[idx - 1] : null;
            const prevDate = prevItem ? (prevItem.created_at || (prevItem as any).timestamp) : null;
            const prevKey = prevDate ? getLocalDateKey(prevDate) : '';
            const showDateHeader = Boolean(currentKey && currentKey !== prevKey);

            // MARCADOR DE CICLO DE ATENDIMENTO (Início ou Fim de Atendimento)
            if (item.type === 'cycle_marker') {
              const marker = item.data.item as any;
              const isStart = marker.marker_type === 'start';
              const markerDate = new Date(marker.timestamp || itemDate);
              const formattedDate = markerDate.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              });
              const formattedTime = markerDate.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <React.Fragment key={item.id}>
                  {showDateHeader && (
                    <div className="flex justify-center my-3">
                      <span className="px-3 py-1 rounded-full bg-slate-200/80 border border-slate-300/60 text-slate-600 text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                        {formatTimelineDate(itemDate)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-center my-4">
                    <div
                      className={`px-4 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-2 shadow-2xs ${
                        isStart
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-slate-100 border-slate-300/80 text-slate-700'
                      }`}
                    >
                      {isStart ? (
                        <>
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>
                            Atendimento iniciado em {formattedDate} às {formattedTime}
                            {marker.assigned_user_name ? ` • Atendente: ${marker.assigned_user_name}` : ''}
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            Atendimento finalizado em {formattedDate} às {formattedTime}
                            {marker.reason ? ` • Motivo: ${marker.reason}` : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            }

            // MENSAGEM DO WHATSAPP
            if (item.type === 'message') {
              const msg = item.data.item as WhatsAppMessage;
              const isMine = msg.from_me;
              const mediaUrl = msg.media_storage_path ? signedUrls[msg.media_storage_path] : msg.media_url;

              const isHumanAttendant = isMine && Boolean(msg.sender_id) && (!msg.origin || msg.origin === 'attendant');
              const authorData = isHumanAttendant
                ? staffMap[msg.sender_id!] || (msg.sender_id === currentUserId ? { name: currentUserName } : null)
                : null;
              const authorName = isHumanAttendant ? resolveAttendantDisplayName(authorData) : null;
              const authorLabel = isHumanAttendant
                ? formatAttendantAuthorLabel(authorData, msg.sender_id, currentUserId)
                : null;

              return (
                <React.Fragment key={msg.id}>
                  {showDateHeader && (
                    <div className="flex justify-center my-3">
                      <span className="px-3 py-1 rounded-full bg-slate-200/80 border border-slate-300/60 text-slate-600 text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                        {formatTimelineDate(itemDate)}
                      </span>
                    </div>
                  )}

                  <div
                    id={`msg-${msg.id}`}
                    className={`flex flex-col group ${isMine ? 'items-end' : 'items-start'} transition-all duration-300 rounded-2xl`}
                  >
                    <div
                      className={`relative max-w-[85%] sm:max-w-md md:max-w-lg rounded-2xl px-4 py-2.5 shadow-2xs text-xs transition-all ${
                        msg.msg_type === 'sticker'
                          ? 'bg-transparent shadow-none p-0'
                          : isMine
                          ? 'bg-emerald-600 text-white rounded-tr-xs'
                          : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-xs'
                      }`}
                    >
                      {/* Autoria Visual Interna do Atendente — SEMPRE EM NEGRITO */}
                      {isHumanAttendant && authorLabel && (
                        <div
                          className={`mb-1.5 text-[11px] font-bold flex items-center gap-1.5 ${
                            msg.msg_type === 'sticker'
                              ? 'bg-slate-900/80 text-white px-2.5 py-0.5 rounded-full shadow-2xs w-fit mb-1'
                              : 'text-emerald-100 opacity-95'
                          }`}
                        >
                          <User className="w-3 h-3 text-emerald-300 shrink-0" />
                          <span className="font-bold tracking-tight">{authorLabel}</span>
                        </div>
                      )}

                      {/* Tag de Mensagem Transacional da Agenda */}
                      {msg.origin && msg.origin !== 'attendant' && (
                        <div
                          className={`mb-2 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 w-fit ${
                            isMine
                              ? 'bg-emerald-700/80 text-emerald-100 border border-emerald-500/50'
                              : 'bg-teal-50 text-teal-800 border border-teal-200'
                          }`}
                        >
                          {msg.origin === 'appointment_confirmation' && (
                            <>
                              <Bell className="w-3 h-3 text-amber-300" />
                              <span>Confirmação de Agendamento</span>
                            </>
                          )}
                          {msg.origin === 'appointment_reminder' && (
                            <>
                              <Clock className="w-3 h-3 text-cyan-300" />
                              <span>Lembrete de Consulta</span>
                            </>
                          )}
                          {msg.origin === 'appointment_reschedule' && (
                            <>
                              <RefreshCw className="w-3 h-3 text-teal-300" />
                              <span>Reagendamento de Consulta</span>
                            </>
                          )}
                          {msg.origin === 'appointment_cancellation' && (
                            <>
                              <AlertCircle className="w-3 h-3 text-rose-300" />
                              <span>Aviso de Cancelamento</span>
                            </>
                          )}
                          {msg.origin === 'system' && (
                            <>
                              <FileText className="w-3 h-3" />
                              <span>Mensagem do Sistema</span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Reply Quoted Preview */}
                      {msg.reply_to_message && (
                        <div
                          onClick={() => handleScrollToMessage(msg.reply_to_id)}
                          className={`mb-2 p-2 rounded-lg border-l-4 text-[11px] cursor-pointer hover:opacity-90 transition-opacity ${
                            isMine
                              ? 'bg-emerald-700/60 border-emerald-300 text-emerald-100'
                              : 'bg-slate-100 border-emerald-600 text-slate-600'
                          }`}
                          title="Clique para ir até a mensagem citada"
                        >
                          <p className="font-semibold text-[10px]">
                            {msg.reply_to_message.from_me ? 'Você' : getContactDisplayName(contact)}
                          </p>
                          <p className="truncate">{msg.reply_to_message.content || 'Mídia'}</p>
                        </div>
                      )}

                      {/* Imagem */}
                      {msg.msg_type === 'image' && (
                        mediaUrl ? (
                          <div className="mb-2 overflow-hidden rounded-xl cursor-pointer">
                            <img
                              src={mediaUrl}
                              alt="Foto recebida"
                              className="max-h-60 w-full object-cover hover:scale-102 transition-transform"
                              onClick={() => {
                                setMediaViewerUrl(mediaUrl);
                                setMediaViewerName(msg.media_file_name || 'foto.jpg');
                                setMediaViewerMime('image/jpeg');
                                setMediaViewerMessageId(msg.id);
                              }}
                            />
                          </div>
                        ) : (
                          <div className="mb-2 w-56 h-40 flex flex-col items-center justify-center bg-slate-100/80 rounded-xl border border-dashed border-slate-300 text-slate-400 p-3 shadow-2xs">
                            <UploadCloud className="w-8 h-8 animate-pulse text-emerald-500 mb-1" />
                            <span className="text-[10px] font-medium text-slate-500">Carregando imagem...</span>
                          </div>
                        )
                      )}

                      {/* Figurinha (Sticker) */}
                      {msg.msg_type === 'sticker' && (
                        mediaUrl ? (
                          <div className="my-1 cursor-pointer">
                            <img
                              src={mediaUrl}
                              alt="Figurinha"
                              className="w-32 h-32 object-contain hover:scale-105 transition-transform drop-shadow-md"
                              onClick={() => {
                                setMediaViewerUrl(mediaUrl);
                                setMediaViewerName('figurinha.webp');
                                setMediaViewerMime('image/webp');
                              }}
                            />
                          </div>
                        ) : (
                          <div className="my-1 w-28 h-28 flex flex-col items-center justify-center bg-slate-100/70 rounded-2xl border border-dashed border-slate-300 text-slate-400 p-2 shadow-2xs">
                            <Smile className="w-8 h-8 animate-pulse text-emerald-500 mb-1" />
                            <span className="text-[10px] font-medium text-slate-500">Carregando figurinha...</span>
                          </div>
                        )
                      )}

                      {/* Áudio / Mensagem de Voz com Player Emerald */}
                      {msg.msg_type === 'audio' && (
                        <div className="my-1 w-72 max-w-full">
                          {mediaUrl ? (
                            <AudioPlayer key={mediaUrl || msg.id} src={mediaUrl} isFromMe={isMine} />
                          ) : (
                            <div className="flex items-center gap-2 text-slate-400 py-1">
                              <Mic className="w-4 h-4 animate-pulse text-emerald-500" />
                              <span>Carregando áudio...</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Cartão de Contato (vCard) */}
                      {msg.msg_type === 'contact' && (
                        <div
                          className={`p-3 rounded-xl border my-1 max-w-xs ${
                            isMine
                              ? 'bg-emerald-700/50 border-emerald-500/80 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 mb-2">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                isMine ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-xs truncate">
                                {(() => {
                                  try {
                                    const p = JSON.parse(msg.content);
                                    return p.displayName || p[0]?.displayName || 'Contato';
                                  } catch {
                                    return msg.content || 'Contato';
                                  }
                                })()}
                              </p>
                              <p className={`text-[10px] ${isMine ? 'text-emerald-200' : 'text-slate-500'}`}>
                                Cartão de Contato
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const p = JSON.parse(msg.content);
                                const vc = p.vcard || p[0]?.vcard || '';
                                const match = vc.match(/waid=(\d+)/i) || vc.match(/TEL.*:([\d+]+)/i);
                                if (match && match[1]) {
                                  navigator.clipboard.writeText(match[1]);
                                } else {
                                  navigator.clipboard.writeText(p.displayName || msg.content);
                                }
                              } catch {
                                navigator.clipboard.writeText(msg.content);
                              }
                            }}
                            className={`w-full py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                              isMine
                                ? 'bg-emerald-600/80 hover:bg-emerald-600 text-white border border-emerald-400/40'
                                : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700'
                            }`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Número</span>
                          </button>
                        </div>
                      )}

                      {/* Documento / PDF */}
                      {msg.msg_type === 'document' && (
                        <div
                          onClick={() => {
                            setMediaViewerUrl(mediaUrl || null);
                            setMediaViewerStoragePath(msg.media_storage_path || null);
                            setMediaViewerName(msg.media_file_name || 'documento.pdf');
                            setMediaViewerMime(msg.media_mime_type || 'application/pdf');
                            setMediaViewerMessageId(msg.id);
                          }}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border mb-2 cursor-pointer transition-colors ${
                            isMine
                              ? 'bg-emerald-700/50 border-emerald-500/80 hover:bg-emerald-700'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="p-2 rounded-lg bg-white/20 text-current">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">
                              {renderHighlightedText(msg.media_file_name || 'Documento', searchQuery)}
                            </p>
                            <p className="text-[10px] opacity-75">{msg.media_mime_type || 'PDF'}</p>
                          </div>
                          {mediaUrl && (
                            <a
                              href={mediaUrl}
                              download={msg.media_file_name || 'documento'}
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* Vídeo */}
                      {msg.msg_type === 'video' && mediaUrl && (
                        <div className="mb-2 rounded-xl overflow-hidden">
                          <video controls src={mediaUrl} className="max-h-60 w-full" />
                        </div>
                      )}

                      {/* Texto Principal / Legenda */}
                      {(() => {
                        if (!msg.content) return null;
                        if (msg.msg_type === 'audio' || msg.msg_type === 'contact') return null;

                        const contentTrimmed = msg.content.trim();
                        const fileNameTrimmed = (msg.media_file_name || '').trim();

                        // Se o texto for idêntico ao nome do arquivo, não duplicar como texto
                        if (fileNameTrimmed && contentTrimmed === fileNameTrimmed) return null;

                        // Rótulos sintéticos padrão não devem ser exibidos
                        const syntheticLabels = ['📷 Imagem', '🎥 Vídeo', '📄 Documento', '🎤 Áudio', '🖼️ Figurinha'];
                        if (syntheticLabels.includes(contentTrimmed)) return null;

                        // Se gravado anteriormente como "arquivo | Legenda", isolar a legenda real
                        let displayContent = msg.content;
                        if (fileNameTrimmed && displayContent.startsWith(`${fileNameTrimmed} | `)) {
                          displayContent = displayContent.substring(fileNameTrimmed.length + 3);
                        }

                        // Higienizar texto interno: se já contiver o prefixo "Nome:\n" do atendente, remove do corpo interno
                        // pois a autoria já está renderizada em negrito acima do balão!
                        if (isMine && authorName) {
                          displayContent = stripAttendantPrefixFromContent(displayContent, authorName);
                        }

                        if (!displayContent.trim()) return null;

                        return (
                          <p className={`whitespace-pre-wrap break-words font-normal ${isMine ? 'text-white' : 'text-slate-800'}`}>
                            {renderHighlightedText(displayContent, searchQuery)}
                          </p>
                        );
                      })()}

                      {/* Rodapé da Mensagem (Hora + Status) */}
                      {msg.msg_type !== 'sticker' && (
                        <div
                          className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                            isMine ? 'text-emerald-200' : 'text-slate-400'
                          }`}
                        >
                          <span>
                            {new Date(msg.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isMine && renderDeliveryStatus(msg.delivery_status, msg)}
                        </div>
                      )}

                      {/* Ações Rápidas (Hover) */}
                      <div className="absolute top-1 right-2 hidden group-hover:flex items-center gap-1 bg-slate-900/85 text-white rounded-lg px-1.5 py-0.5 shadow-md z-10">
                        {/* Seletor de Reação Rápida */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setActiveReactionPickerMsgId(
                                activeReactionPickerMsgId === msg.id ? null : msg.id
                              )
                            }
                            className="p-1 hover:text-amber-400 cursor-pointer"
                            title="Reagir com emoji"
                          >
                            <Smile className="w-3 h-3" />
                          </button>

                          {activeReactionPickerMsgId === msg.id && (
                            <div className="absolute bottom-full right-0 mb-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 flex items-center gap-1 z-50 animate-in fade-in">
                              {QUICK_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReact(msg, emoji)}
                                  className="w-7 h-7 rounded-xl hover:bg-slate-100 flex items-center justify-center text-sm cursor-pointer hover:scale-125 transition-transform"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => setReplyingTo(msg)}
                          className="p-1 hover:text-emerald-400 cursor-pointer"
                          title="Responder"
                        >
                          <Reply className="w-3 h-3" />
                        </button>

                        <button
                          onClick={() => {
                            setMessageToDelete(msg);
                            setShowDeleteModal(true);
                          }}
                          className="p-1 hover:text-rose-400 cursor-pointer"
                          title="Excluir mensagem (local)"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Reações Recebidas */}
                    {Array.isArray(msg.reactions) && msg.reactions.length > 0 && (
                      <div className="flex items-center gap-1 mt-0.5 -translate-y-1 z-5">
                        {msg.reactions.map((r, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 rounded-full bg-white border border-slate-200 shadow-2xs text-xs"
                          >
                            {r.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            }

            // NOTA INTERNA DA EQUIPE
            if (item.type === 'note') {
              const note = item.data.item as any;
              return (
                <React.Fragment key={note.id}>
                  {showDateHeader && (
                    <div className="flex justify-center my-3">
                      <span className="px-3 py-1 rounded-full bg-slate-200/80 border border-slate-300/60 text-slate-600 text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                        {formatTimelineDate(itemDate)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center my-2">
                    <div className="max-w-md w-full bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs shadow-2xs">
                      <div className="flex items-center justify-between font-semibold text-amber-900 mb-1 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Nota Interna • {resolveAttendantDisplayName(note.author)}</span>
                        </div>
                        <span className="text-[10px] text-amber-600">
                          {new Date(note.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-amber-950 whitespace-pre-wrap">{note.content}</p>
                    </div>
                  </div>
                </React.Fragment>
              );
            }

            // EVENTO DE TRANSFERÊNCIA INTERNO PERMANENTE
            if (
              item.type === 'transfer' ||
              (item.type === 'event' && (item.data.item as any).event_type === 'transferred')
            ) {
              const transferData = item.data.item as any;
              const fromName =
                transferData.from_user?.whatsapp_display_name ||
                transferData.from_user?.name ||
                transferData.metadata?.from_user_name ||
                staffMap[transferData.from_user_id || transferData.author_id]?.whatsapp_display_name ||
                staffMap[transferData.from_user_id || transferData.author_id]?.name ||
                'Atendente';

              const toName =
                transferData.to_user?.whatsapp_display_name ||
                transferData.to_user?.name ||
                transferData.metadata?.to_user_name ||
                staffMap[transferData.to_user_id || transferData.metadata?.to_user_id]?.whatsapp_display_name ||
                staffMap[transferData.to_user_id || transferData.metadata?.to_user_id]?.name ||
                'Colega';

              const reasonText = transferData.reason || transferData.metadata?.reason;
              const transferTime = new Date(item.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <React.Fragment key={item.id}>
                  {showDateHeader && (
                    <div className="flex justify-center my-3">
                      <span className="px-3 py-1 rounded-full bg-slate-200/80 border border-slate-300/60 text-slate-600 text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                        {formatTimelineDate(itemDate)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center my-2">
                    <div className="max-w-md w-auto px-3.5 py-1.5 rounded-xl bg-purple-50/80 border border-purple-200/80 text-purple-950 text-xs shadow-2xs text-center">
                      <div className="flex items-center justify-center gap-1.5 font-semibold">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>
                          Atendimento transferido: <strong>{fromName}</strong> → <strong>{toName}</strong>
                        </span>
                        <span className="text-[10px] text-purple-400 font-normal">
                          • {transferTime}
                        </span>
                      </div>
                      {reasonText && (
                        <p className="text-[11px] text-purple-700/90 mt-0.5 italic">
                          Motivo: {reasonText}
                        </p>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            }

            // OUTROS EVENTOS DE TIMELINE (Claim, Início, etc.)
            return (
              <React.Fragment key={item.id}>
                {showDateHeader && (
                  <div className="flex justify-center my-3">
                    <span className="px-3 py-1 rounded-full bg-slate-200/80 border border-slate-300/60 text-slate-600 text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                      {formatTimelineDate(itemDate)}
                    </span>
                  </div>
                )}
                <div className="flex justify-center my-1.5">
                  <div className="px-3 py-1 rounded-full bg-slate-200/70 border border-slate-300 text-slate-600 text-[11px] font-medium flex items-center gap-1.5 shadow-2xs">
                    <span>{(item.data.item as any).description || 'Atualização no atendimento'}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
          <div ref={bottomSentinelRef} className="h-6 sm:h-8 w-full shrink-0" aria-hidden="true" />
        </div>
      </div>

      {/* Botão Flutuante '↓ Nova mensagem' quando o usuário está lendo histórico */}
      {showNewMessageButton && (
        <div className="absolute bottom-20 right-8 z-30 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer text-xs font-semibold group"
          >
            <span className="text-sm transition-transform group-hover:translate-y-0.5">↓</span>
            <span>Nova mensagem</span>
            {unreadIncomingCount > 1 && (
              <span className="px-1.5 py-0.2 bg-white text-emerald-800 rounded-full text-[10px] font-bold">
                {unreadIncomingCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Replying Banner */}
      {isAttendanceActive && replyingTo && (
        <div className="px-4 py-2 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between text-xs text-emerald-900 animate-in fade-in shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <Reply className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="truncate">
              <span className="font-bold">Respondendo a {replyingTo.from_me ? 'você' : getContactDisplayName(contact)}: </span>
              <span className="text-slate-600 truncate">{replyingTo.content || 'Mídia'}</span>
            </div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 hover:bg-emerald-100 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4 text-emerald-700" />
          </button>
        </div>
      )}

      {/* Barra de Múltiplos Anexos Pendentes com Reordenação e Remoção */}
      {isAttendanceActive && attachmentQueue.length > 0 && (
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-col gap-2 animate-in fade-in shrink-0">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
              <Paperclip className="w-3.5 h-3.5" />
              <span>
                {attachmentQueue.length} {attachmentQueue.length === 1 ? 'arquivo selecionado' : 'arquivos na fila'}
              </span>
              <span className="text-[10px] text-slate-500 font-normal">
                (envio sequencial preservando a ordem)
              </span>
            </div>
            <button
              type="button"
              onClick={clearAttachmentQueue}
              className="text-[11px] font-medium text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Remover todos
            </button>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5">
            {attachmentQueue.map((att, idx) => (
              <div
                key={att.id}
                className="relative shrink-0 w-28 h-32 rounded-xl bg-white border border-slate-200 shadow-2xs p-1.5 flex flex-col justify-between group hover:border-emerald-500 transition-all"
              >
                {/* Botão Remover Individual [X] */}
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-700 cursor-pointer z-10"
                  title="Remover este anexo"
                >
                  <X className="w-3 h-3" />
                </button>

                {/* Badge de Posição de Envio */}
                <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-slate-900/70 text-white rounded-md text-[9px] font-bold z-10">
                  #{idx + 1}
                </span>

                {/* Miniatura / Ícone */}
                <div className="w-full h-16 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center mt-1">
                  {att.type === 'image' && att.previewUrl ? (
                    <img src={att.previewUrl} alt={att.name} className="w-full h-full object-cover" />
                  ) : att.type === 'video' && att.previewUrl ? (
                    <video src={att.previewUrl} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-8 h-8 text-emerald-600" />
                  )}
                </div>

                {/* Nome e Tamanho */}
                <div className="min-w-0 px-0.5">
                  <p className="text-[10px] font-semibold text-slate-800 truncate" title={att.name}>
                    {att.name}
                  </p>
                  <p className="text-[9px] text-slate-400">{formatFileSize(att.size)}</p>
                </div>

                {/* Botões de Reordenação */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                  <button
                    type="button"
                    onClick={() => moveAttachment(idx, 'left')}
                    disabled={idx === 0}
                    className="p-1 text-slate-500 hover:text-emerald-700 disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    title="Mover para esquerda"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[9px] text-slate-400 font-mono">Pos. {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => moveAttachment(idx, 'right')}
                    disabled={idx === attachmentQueue.length - 1}
                    className="p-1 text-slate-500 hover:text-emerald-700 disabled:opacity-20 cursor-pointer disabled:cursor-default"
                    title="Mover para direita"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Composer Bar ou Banner de Modo Somente Consulta */}
      {!isAttendanceActive ? (
        <div className="p-4 bg-slate-50 border-t border-slate-200/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left shrink-0 z-10">
          <div className="flex items-center gap-3 text-slate-600 text-xs">
            <div className="p-2 rounded-xl bg-slate-200/70 text-slate-600 shrink-0 hidden sm:flex">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Modo Somente Consulta</p>
              <p className="text-[11px] text-slate-500">
                Para enviar uma mensagem ou interagir com este contato, inicie um atendimento.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStartAttendance}
            disabled={startingAttendance}
            className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{startingAttendance ? 'Iniciando...' : 'Iniciar Atendimento'}</span>
          </button>
        </div>
      ) : (
        <div className="p-3 bg-white border-t border-slate-200 flex items-end gap-2 relative shrink-0 z-10">
          {/* Hidden File Input com multiple */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFilesAdded(e.target.files);
              }
            }}
            multiple
            className="hidden"
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
          />

          {/* Attachment Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || isRecording || isInternalNote}
            className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
            title="Anexar arquivos ou imagens (seleção múltipla)"
          >
            <Paperclip className="w-5 h-5" />
          </button>

          {/* Internal Note Toggle Button */}
          <button
            type="button"
            onClick={() => setIsInternalNote(!isInternalNote)}
            disabled={sending || isRecording || attachmentQueue.length > 0}
            className={`p-2.5 rounded-xl transition-all cursor-pointer ${
              isInternalNote
                ? 'bg-amber-500 text-white shadow-xs ring-2 ring-amber-400'
                : 'text-slate-500 hover:text-amber-700 hover:bg-amber-50'
            }`}
            title={
              isInternalNote
                ? 'Modo Nota Interna ATIVO (clique para voltar para WhatsApp)'
                : 'Criar Nota Interna (visível apenas para a equipe da clínica)'
            }
          >
            <Lock className="w-4 h-4" />
          </button>

          {/* Audio Recording State */}
          {isRecording ? (
            <div className="flex-1 flex items-center justify-between px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
                <span className="font-semibold">
                  Gravando áudio... {Math.floor(recordingSeconds / 60)}:
                  {String(recordingSeconds % 60).padStart(2, '0')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="px-2.5 py-1 text-slate-500 hover:text-rose-600 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={stopAndSendRecording}
                  className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer shadow-2xs"
                  title="Enviar áudio"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Text Input / Legenda */
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (attachmentQueue.length > 0) {
                      handleSendAttachments();
                    } else {
                      handleSendText();
                    }
                  }
                }}
                placeholder={
                  isInternalNote
                    ? 'Escreva uma nota interna (visível apenas para a equipe)...'
                    : attachmentQueue.length > 0
                    ? 'Adicione uma legenda aos arquivos anexados (opcional)...'
                    : 'Digite uma mensagem... (Enter para enviar, Shift+Enter para quebra)'
                }
                className={`w-full px-3.5 py-2.5 text-xs rounded-xl focus:outline-hidden resize-none max-h-32 transition-all ${
                  isInternalNote
                    ? 'bg-amber-50 border border-amber-300 text-amber-950 placeholder:text-amber-700/60 focus:ring-2 focus:ring-amber-500'
                    : 'bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:bg-white text-slate-800'
                }`}
              />
            </div>
          )}

          {/* Mic or Send Button */}
          {!isRecording && (
            <>
              {attachmentQueue.length > 0 ? (
                <button
                  type="button"
                  onClick={handleSendAttachments}
                  disabled={sending}
                  className="p-2.5 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50 text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 flex items-center gap-1.5"
                  title={`Enviar ${attachmentQueue.length} ${attachmentQueue.length === 1 ? 'arquivo' : 'arquivos'}`}
                >
                  <Send className="w-4 h-4" />
                  {attachmentQueue.length > 1 && (
                    <span className="text-[10px] font-bold">({attachmentQueue.length})</span>
                  )}
                </button>
              ) : text.trim() ? (
                <button
                  type="button"
                  onClick={handleSendText}
                  disabled={sending}
                  className={`p-2.5 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50 text-white ${
                    isInternalNote
                      ? 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700'
                      : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700'
                  }`}
                  title={isInternalNote ? 'Salvar Nota Interna' : 'Enviar mensagem'}
                >
                  <Send className="w-4 h-4" />
                </button>
              ) : isInternalNote ? null : (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={sending}
                  className="p-2.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                  title="Gravar áudio"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* MODAL TRANSFERÊNCIA */}
      <TransferModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        conversationId={conversation.id}
        tenantId={tenantId}
        currentUserId={currentUserId}
        onTransferred={() => {
          loadTimeline();
          onConversationUpdated?.();
        }}
      />

      {/* MODAL FINALIZAÇÃO */}
      <FinalizeModal
        isOpen={showFinalizeModal}
        onClose={() => setShowFinalizeModal(false)}
        conversationId={conversation.id}
        tenantId={tenantId}
        authorId={currentUserId}
        onFinalized={() => {
          loadTimeline();
          onConversationUpdated?.();
        }}
      />

      {/* MODAL VISUALIZADOR DE MÍDIA */}
      <MediaViewerModal
        isOpen={Boolean(mediaViewerUrl || mediaViewerStoragePath)}
        onClose={() => {
          setMediaViewerUrl(null);
          setMediaViewerStoragePath(null);
          setMediaViewerMessageId(null);
        }}
        mediaUrl={mediaViewerUrl}
        storagePath={mediaViewerStoragePath}
        tenantId={tenantId}
        fileName={mediaViewerName}
        mimeType={mediaViewerMime}
        messageId={mediaViewerMessageId}
        isGroup={isGroupConversation}
        patientId={effectiveClinicalPatientId}
        patientName={relatedPatients.find((p) => p.id === effectiveClinicalPatientId)?.name || linkedPatientName}
        canAttachToRecord={canAttachToRecord}
      />

      {/* MODAL CONFIRMAÇÃO DE EXCLUSÃO LOCAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="max-w-sm w-full bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">Excluir Mensagem?</h4>
            <p className="text-xs text-slate-500 mb-5">
              A exclusão é local e removerá esta mensagem do prontuário e histórico do sistema.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDeleteMessage}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO PARA DEVOLVER PARA A FILA */}
      {showReturnToQueueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="max-w-sm w-full bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 mb-1">Devolver para a Fila?</h4>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Este atendimento será desvinculado do seu usuário e voltará para a fila geral da clínica, ficando disponível para qualquer atendente assumir.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={changingStatus}
                onClick={() => setShowReturnToQueueModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={changingStatus}
                onClick={handleConfirmReturnToQueue}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                {changingStatus ? 'Devolvendo...' : 'Sim, Devolver para Fila'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
