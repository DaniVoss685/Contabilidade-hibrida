import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Columns3,
  RefreshCw,
  Plus,
  Settings,
  AlertCircle,
  Inbox,
} from 'lucide-react';
import {
  WhatsAppConversation,
  WhatsAppContact,
  WhatsAppChatStatus,
  WhatsAppMessage,
  WhatsAppContactRelations,
} from '../../types/whatsapp';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { supabase, SupabaseService } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { WhatsAppSidebar, WhatsAppTab } from './WhatsAppSidebar';
import { WhatsAppChatArea } from './WhatsAppChatArea';
import { WhatsAppContextDrawer } from './WhatsAppContextDrawer';
import { WhatsAppKanban } from './WhatsAppKanban';
import { NewContactModal } from './NewContactModal';
import { EditContactModal } from './EditContactModal';
import { InstanceConfigModal } from './InstanceConfigModal';
import { AppointmentModal } from '../Appointments/AppointmentModal';
import { AppointmentDetailsModal } from '../Appointments/AppointmentDetailsModal';
import { PatientModal } from '../Modals/PatientModal';
import { Appointment, Patient } from '../../types';
import { normalizeBrazilianNumber, isWhatsAppGroup } from '../../lib/phoneUtils';
import { withGuardianDisplayName } from '../../lib/contactsFilter';

export interface RealtimeMessageEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  message: WhatsAppMessage;
  timestamp: number;
}

interface WhatsAppMainViewProps {
  tenantId: string;
  currentUserId?: string;
  currentUserName?: string;
  currentUserRole?: string;
  onNavigateToAgenda?: (date?: string, patientId?: string) => void;
  initialPatientId?: string;
  initialConversationId?: string;
  initialContactId?: string;
  onConsumedInitialConversation?: () => void;
}

export const WhatsAppMainView: React.FC<WhatsAppMainViewProps> = ({
  tenantId,
  currentUserId,
  currentUserName,
  currentUserRole,
  onNavigateToAgenda,
  initialPatientId,
  initialConversationId,
  initialContactId,
  onConsumedInitialConversation,
}) => {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [history, setHistory] = useState<WhatsAppConversation[]>([]);
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [contactRelations, setContactRelations] = useState<Record<string, WhatsAppContactRelations>>({});
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(null);
  const selectedConversationRef = useRef<WhatsAppConversation | null>(null);
  selectedConversationRef.current = selectedConversation;

  // Ref para registrar IDs de navegação já consumidos e evitar auto-switch involuntário
  const consumedInitialConvRef = useRef<string | null>(null);

  const [activeChatRealtimeEvent, setActiveChatRealtimeEvent] = useState<RealtimeMessageEvent | null>(null);
  const [activeTab, setActiveTab] = useState<WhatsAppTab>('em_atendimento');
  const [viewMode, setViewMode] = useState<'chat' | 'kanban'>('chat');
  const [showContext, setShowContext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [staffMembers, setStaffMembers] = useState<
    { id: string; name: string; role?: string; whatsapp_display_name?: string | null }[]
  >([]);

  useEffect(() => {
    if (tenantId) {
      DentalWhatsAppService.getStaff(tenantId)
        .then((list) => setStaffMembers(list))
        .catch(() => {});
    }
  }, [tenantId]);

  // Modais
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Modais de Integração com a Agenda
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulePatientId, setSchedulePatientId] = useState<string | undefined>(undefined);
  const [scheduleRescheduleFrom, setScheduleRescheduleFrom] = useState<Appointment | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsAppointment, setDetailsAppointment] = useState<Appointment | null>(null);

  // Telefone compartilhado: quando o contato tem >1 paciente vinculado
  // (df_wa_contact_patients), NENHUMA ação clínica pode escolher o paciente
  // automaticamente. Este estado é o único ponto de verdade para "qual
  // paciente está selecionado" e é compartilhado por WhatsAppChatArea e
  // WhatsAppContextDrawer (irmãos, ambos filhos deste componente) — evita
  // duplicar a lógica de seleção em cada um. Contexto é por conversa/contato,
  // nunca persistido (Fase 11: seleção explícita por ação, sem "lembrar"
  // silenciosamente entre pacientes diferentes do mesmo telefone).
  const [relatedPatients, setRelatedPatients] = useState<Array<{ id: string; name: string; isPrimary: boolean }>>([]);
  const [selectedClinicalPatientId, setSelectedClinicalPatientId] = useState<string | null>(null);
  const contact = selectedConversation?.contact;
  const isGroupConversation = isWhatsAppGroup(contact?.whatsapp_number);
  const primaryLinkedPatientId = contact?.patient_id || contact?.patient?.id || null;
  const effectiveClinicalPatientId = relatedPatients.length > 1 ? selectedClinicalPatientId : primaryLinkedPatientId;

  useEffect(() => {
    setSelectedClinicalPatientId(null);
    if (!contact?.id || !tenantId || isGroupConversation) {
      setRelatedPatients([]);
      return;
    }
    let cancelled = false;
    SupabaseService.getPatientsForWaContact(tenantId, contact.id).then((links) => {
      if (cancelled) return;
      if (links.length <= 1) {
        setRelatedPatients([]);
        return;
      }
      const allPatients = db.getPatients();
      const resolved = links
        .map((l) => {
          const p = allPatients.find((pp) => pp.id === l.patientId);
          return p ? { id: p.id, name: p.name, isPrimary: l.isPrimary } : null;
        })
        .filter((x): x is { id: string; name: string; isPrimary: boolean } => Boolean(x));
      setRelatedPatients(resolved);
    }).catch(() => setRelatedPatients([]));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id, tenantId, isGroupConversation]);

  // Modal de Cadastro/Vínculo de Paciente
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [patientModalInitialData, setPatientModalInitialData] = useState<{
    name?: string;
    phone?: string;
  } | null>(null);

  const handleOpenCreatePatient = (initial?: { name?: string; phone?: string }) => {
    const ctc = selectedConversation?.contact;
    setPatientModalInitialData(
      initial || {
        name: ctc?.name,
        phone: ctc?.whatsapp_number,
      }
    );
    setIsPatientModalOpen(true);
  };

  const handlePatientSaved = async (savedPatient: Patient) => {
    // O trigger do banco de dados (fn_sync_df_patient_to_wa_contact) já vincula ou cria
    // atomicamente o contato correto com base no telefone oficial do paciente.
    // NUNCA forçar o vínculo do contato atualmente selecionado se ele possuir um número
    // diferente do paciente salvo, evitando duplo vínculo em contatos distintos.
    const currentCtc = selectedConversation?.contact;
    if (currentCtc && tenantId && savedPatient.phone) {
      const normCtc = normalizeBrazilianNumber(currentCtc.whatsapp_number);
      const normPat = normalizeBrazilianNumber(savedPatient.phone);
      if (normCtc && normPat && normCtc === normPat && !currentCtc.patient_id) {
        await DentalWhatsAppService.linkPatientToContact(
          currentCtc.id,
          savedPatient.id,
          tenantId
        );
      }
    }
    await loadConversations(false);
    setIsPatientModalOpen(false);
    setPatientModalInitialData(null);
  };

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Carregar conversas
  const loadConversations = async (showSpinner = true) => {
    if (!tenantId) return;
    if (showSpinner) setLoading(true);

    try {
      const [convs, hist, ctcs, relations] = await Promise.all([
        DentalWhatsAppService.getConversations(tenantId),
        DentalWhatsAppService.getHistory(tenantId),
        DentalWhatsAppService.getContacts(tenantId),
        DentalWhatsAppService.getContactRelations(tenantId),
      ]);

      // A31: anexa o nome do responsável (quando aplicável) diretamente nos
      // objetos de contato ANTES de guardar no estado — assim todo consumidor
      // de getContactDisplayName (header do chat, drawer, kanban, reply-to)
      // já resolve o nome certo, sem precisar receber `relations` separadamente.
      const enrichedConvs = convs.map((c) => ({ ...c, contact: withGuardianDisplayName(c.contact, relations) }));
      const enrichedHist = hist.map((c) => ({ ...c, contact: withGuardianDisplayName(c.contact, relations) }));
      const enrichedContacts = ctcs.map((c) => withGuardianDisplayName(c, relations)!);

      setConversations(enrichedConvs);
      setHistory(enrichedHist);
      setContacts(enrichedContacts);
      setContactRelations(relations);

      // Sincronizar conversa selecionada com dados atualizados
      if (selectedConversationRef.current) {
        const found = [...enrichedConvs, ...enrichedHist].find(
          (c) => c.id === selectedConversationRef.current?.id
        );
        if (found) {
          setSelectedConversation(found);
        }
      }
    } catch (err) {
      console.warn('[WhatsAppMainView] Erro ao carregar dados:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const triggerDebouncedLoad = (delay = 400) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      loadConversations(false);
    }, delay);
  };

  useEffect(() => {
    loadConversations(true);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [tenantId]);

  // Seleção automática ao navegar via Notificação, Agenda, Pacientes ou URL
  // Proteção: executado apenas quando há uma intenção explícita e NÃO re-executado quando chegam novas mensagens
  useEffect(() => {
    if (loading) return;

    const allConvs = [...conversations, ...history];

    // 1. Por ID de conversa explícito (intent de clique de notificação ou atalho)
    if (initialConversationId && consumedInitialConvRef.current !== initialConversationId) {
      const match = allConvs.find((c) => c.id === initialConversationId);
      if (match) {
        consumedInitialConvRef.current = initialConversationId;
        setSelectedConversation(match);
        if (match.status === 'na_fila') setActiveTab('na_fila');
        else if (match.status === 'finalizado') setActiveTab('finalizados');
        else setActiveTab('em_atendimento');
        onConsumedInitialConversation?.();
        return;
      }
    }

    // 2. Por ID de contato explícito
    if (initialContactId && consumedInitialConvRef.current !== `ctc_${initialContactId}`) {
      const match = allConvs.find((c) => c.contact_id === initialContactId);
      if (match) {
        consumedInitialConvRef.current = `ctc_${initialContactId}`;
        setSelectedConversation(match);
        if (match.status === 'na_fila') setActiveTab('na_fila');
        else if (match.status === 'finalizado') setActiveTab('finalizados');
        else setActiveTab('em_atendimento');
        onConsumedInitialConversation?.();
        return;
      }
    }

    // 3. Por ID de paciente clínico
    if (initialPatientId && consumedInitialConvRef.current !== `pat_${initialPatientId}`) {
      const targetContact = contacts.find((c) => c.patient_id === initialPatientId);
      if (targetContact) {
        const match = allConvs.find((c) => c.contact_id === targetContact.id);
        if (match) {
          consumedInitialConvRef.current = `pat_${initialPatientId}`;
          setSelectedConversation(match);
          if (match.status === 'na_fila') setActiveTab('na_fila');
          else if (match.status === 'finalizado') setActiveTab('finalizados');
          else setActiveTab('em_atendimento');
          onConsumedInitialConversation?.();
          return;
        }
      }
    }

    // 4. Fallback por URL query parameters (caso acesse direto pela URL via link externo)
    if (typeof window !== 'undefined' && !selectedConversationRef.current) {
      const params = new URLSearchParams(window.location.search);
      const urlConvId = params.get('conversationId') || params.get('conversation_id');
      const urlCtcId = params.get('contactId') || params.get('contact_id');

      if (urlConvId && consumedInitialConvRef.current !== `url_${urlConvId}`) {
        const match = allConvs.find((c) => c.id === urlConvId);
        if (match) {
          consumedInitialConvRef.current = `url_${urlConvId}`;
          setSelectedConversation(match);
          if (match.status === 'na_fila') setActiveTab('na_fila');
          else if (match.status === 'finalizado') setActiveTab('finalizados');
          else setActiveTab('em_atendimento');
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {}
          return;
        }
      }

      if (urlCtcId && consumedInitialConvRef.current !== `url_ctc_${urlCtcId}`) {
        const match = allConvs.find((c) => c.contact_id === urlCtcId);
        if (match) {
          consumedInitialConvRef.current = `url_ctc_${urlCtcId}`;
          setSelectedConversation(match);
          if (match.status === 'na_fila') setActiveTab('na_fila');
          else if (match.status === 'finalizado') setActiveTab('finalizados');
          else setActiveTab('em_atendimento');
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {}
          return;
        }
      }
    }
  }, [initialConversationId, initialContactId, initialPatientId, loading]);

  // Canal Único Realtime por Tenant (Sem duplicação de listeners e com atualização instantânea)
  useEffect(() => {
    if (!tenantId) return;

    const hubChannel = supabase
      .channel(`dental_wa_hub_${tenantId}`)
      // 1. MENSAGENS RECEBIDAS OU ENVIADAS (INSERT)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'df_wa_messages',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg || !newMsg.conversation_id) return;

          // Determinar preview amigável
          let previewText = newMsg.content;
          if (!previewText || !previewText.trim()) {
            switch (newMsg.msg_type) {
              case 'audio': previewText = '🎵 Áudio'; break;
              case 'image': previewText = '📷 Imagem'; break;
              case 'video': previewText = '🎥 Vídeo'; break;
              case 'document': previewText = '📄 Documento'; break;
              case 'call': previewText = '📞 Chamada'; break;
              case 'sticker': previewText = '🏷️ Figurinha'; break;
              default: previewText = 'Mensagem';
            }
          }

          // Atualizar conversa instantaneamente na lista e subir para o topo
          setConversations((prevConvs) => {
            const index = prevConvs.findIndex((c) => c.id === newMsg.conversation_id);
            if (index === -1) {
              // Conversa nova, recarregar lista completa
              triggerDebouncedLoad(100);
              return prevConvs;
            }

            const targetConv = prevConvs[index];
            const isCurrentlySelected = selectedConversationRef.current?.id === newMsg.conversation_id;

            const updatedConv: WhatsAppConversation = {
              ...targetConv,
              last_message_content: previewText,
              last_message_at: newMsg.created_at,
              last_message_from_me: Boolean(newMsg.from_me),
              unread_count: isCurrentlySelected || newMsg.from_me
                ? 0
                : (targetConv.unread_count || 0) + 1,
              updated_at: new Date().toISOString(),
            };

            const otherConvs = prevConvs.filter((c) => c.id !== newMsg.conversation_id);
            const newList = [updatedConv, ...otherConvs];

            // Ordenação estrita por last_message_at DESC
            newList.sort((a, b) => {
              const timeA = new Date(a.last_message_at || a.created_at).getTime();
              const timeB = new Date(b.last_message_at || b.created_at).getTime();
              return timeB - timeA;
            });

            return newList;
          });

          const currentSel = selectedConversationRef.current;
          const isCurrentSelectedTarget = Boolean(currentSel && currentSel.id === newMsg.conversation_id);

          // Atualizar selectedConversation e repassar mensagem imediatamente para o chat aberto se for a conversa/contato ativo
          if (isCurrentSelectedTarget) {
            setSelectedConversation((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                last_message_content: previewText,
                last_message_at: newMsg.created_at,
                last_message_from_me: Boolean(newMsg.from_me),
              };
            });

            // Dispara evento imediato para a Timeline do chat aberto (zero delay, sem reload)
            setActiveChatRealtimeEvent({
              eventType: 'INSERT',
              message: newMsg as WhatsAppMessage,
              timestamp: Date.now(),
            });
          }

          // Sincronização em segundo plano suave
          triggerDebouncedLoad(1200);
        }
      )
      // 1.1 MENSAGENS ATUALIZADAS (UPDATE - ex: status, reação, mídia resolvida)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'df_wa_messages',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const updatedMsg = payload.new as WhatsAppMessage;
          if (!updatedMsg) return;

          const currentSel = selectedConversationRef.current;
          const isCurrentSelectedTarget =
            currentSel?.id === updatedMsg.conversation_id ||
            (currentSel?.contact_id &&
              (updatedMsg as any).contact_id === currentSel.contact_id);

          // Se pertencer à conversa/contato aberto, repassar para o chat aberto
          if (isCurrentSelectedTarget) {
            setActiveChatRealtimeEvent({
              eventType: 'UPDATE',
              message: updatedMsg,
              timestamp: Date.now(),
            });
          }
        }
      )
      // 1.2 MENSAGENS EXCLUÍDAS (DELETE)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'df_wa_messages',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const oldId = (payload.old as any)?.id;
          if (oldId) {
            setActiveChatRealtimeEvent({
              eventType: 'DELETE',
              message: { id: oldId, conversation_id: selectedConversationRef.current?.id } as any,
              timestamp: Date.now(),
            });
          }
        }
      )
      // 2. STATUS DE CONVERSAS (UPDATE/INSERT/DELETE)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'df_wa_conversations',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updatedRow = payload.new as any;
            const isFinished = updatedRow.status === 'finalizado' || updatedRow.status === 'arquivado';

            // Movimentação automática de status entre abas em Realtime sem reload
            if (isFinished) {
              setConversations((prev) => prev.filter((c) => c.id !== updatedRow.id));
              setHistory((prev) => {
                const exists = prev.some((c) => c.id === updatedRow.id);
                if (exists) {
                  return prev.map((c) => (c.id === updatedRow.id ? { ...c, ...updatedRow } : c));
                }
                const foundInConv = conversations.find((c) => c.id === updatedRow.id);
                return foundInConv ? [{ ...foundInConv, ...updatedRow }, ...prev] : prev;
              });
            } else {
              setHistory((prev) => prev.filter((c) => c.id !== updatedRow.id));
              setConversations((prevConvs) => {
                const index = prevConvs.findIndex((c) => c.id === updatedRow.id);
                if (index >= 0) {
                  const updated = prevConvs.map((c) => (c.id === updatedRow.id ? { ...c, ...updatedRow } : c));
                  updated.sort((a, b) => {
                    const timeA = new Date(a.last_message_at || a.created_at).getTime();
                    const timeB = new Date(b.last_message_at || b.created_at).getTime();
                    return timeB - timeA;
                  });
                  return updated;
                }
                const foundInHist = history.find((c) => c.id === updatedRow.id);
                if (foundInHist) {
                  const updated = [{ ...foundInHist, ...updatedRow }, ...prevConvs];
                  updated.sort((a, b) => {
                    const timeA = new Date(a.last_message_at || a.created_at).getTime();
                    const timeB = new Date(b.last_message_at || b.created_at).getTime();
                    return timeB - timeA;
                  });
                  return updated;
                }
                return prevConvs;
              });
            }

            // Preservar a conversa selecionada aberta com status atualizado
            if (selectedConversationRef.current?.id === updatedRow.id) {
              setSelectedConversation((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  status: updatedRow.status,
                  assigned_to: updatedRow.assigned_to,
                  unread_count: updatedRow.unread_count,
                };
              });
            }
          } else {
            triggerDebouncedLoad(200);
          }
        }
      )
      // 3. CONTATOS (INSERT/UPDATE)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'df_wa_contacts',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedCtc = payload.new as WhatsAppContact;
            const newPatientId = updatedCtc.patient_id || null;

            setConversations((prev) =>
              prev.map((conv) => {
                if (conv.contact_id === updatedCtc.id && conv.contact) {
                  return {
                    ...conv,
                    contact: {
                      ...conv.contact,
                      name: updatedCtc.name,
                      profile_pic_url: updatedCtc.profile_pic_url || conv.contact.profile_pic_url,
                      patient_id: newPatientId,
                      patient: newPatientId ? conv.contact.patient : null,
                    },
                  };
                }
                return conv;
              })
            );
            setHistory((prev) =>
              prev.map((conv) => {
                if (conv.contact_id === updatedCtc.id && conv.contact) {
                  return {
                    ...conv,
                    contact: {
                      ...conv.contact,
                      name: updatedCtc.name,
                      profile_pic_url: updatedCtc.profile_pic_url || conv.contact.profile_pic_url,
                      patient_id: newPatientId,
                      patient: newPatientId ? conv.contact.patient : null,
                    },
                  };
                }
                return conv;
              })
            );
            setContacts((prev) =>
              prev.map((c) =>
                c.id === updatedCtc.id
                  ? {
                      ...c,
                      name: updatedCtc.name,
                      profile_pic_url: updatedCtc.profile_pic_url || c.profile_pic_url,
                      patient_id: newPatientId,
                      patient: newPatientId ? c.patient : null,
                    }
                  : c
              )
            );
            setSelectedConversation((prev) => {
              if (prev && prev.contact_id === updatedCtc.id && prev.contact) {
                return {
                  ...prev,
                  contact: {
                    ...prev.contact,
                    name: updatedCtc.name,
                    profile_pic_url: updatedCtc.profile_pic_url || prev.contact.profile_pic_url,
                    patient_id: newPatientId,
                    patient: newPatientId ? prev.contact.patient : null,
                  },
                };
              }
              return prev;
            });
          }
          triggerDebouncedLoad(300);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(hubChannel);
    };
  }, [tenantId]);

  // Navegação direta vinda da Agenda ou Pacientes para abrir conversa do paciente
  useEffect(() => {
    if (initialPatientId && tenantId) {
      DentalWhatsAppService.getOrCreateContactForPatient(initialPatientId, tenantId).then((ctc) => {
        if (ctc) {
          handleSelectContact(ctc);
        }
      });
    }
  }, [initialPatientId, tenantId]);

  const isProcessingContactRef = useRef(false);

  // Ao selecionar um contato na aba Contatos (Navegação Pura - Modo Consulta sem criar atendimento no banco)
  const handleSelectContact = async (rawContact: WhatsAppContact) => {
    if (!rawContact?.id || isProcessingContactRef.current) return;
    isProcessingContactRef.current = true;
    // Garante guardianDisplayName mesmo quando o contato chega de uma fonte que
    // ainda não passou pelo enriquecimento de loadConversations (ex.:
    // getOrCreateContactForPatient, navegação vinda da Agenda/Pacientes).
    const contact = withGuardianDisplayName(rawContact, contactRelations)!;

    try {
      // 1. Verificar se já existe conversa ativa nas abas ativas em memória
      let activeConv = conversations.find(
        (c) =>
          c.contact_id === contact.id &&
          c.status !== 'finalizado' &&
          c.status !== 'arquivado'
      );

      // 2. Se não estiver em memória, verificar no banco se há atendimento ativo para o contato
      if (!activeConv) {
        const dbActive = await DentalWhatsAppService.getActiveConversationByContact(
          contact.id,
          tenantId
        );
        if (dbActive) {
          activeConv = { ...dbActive, contact: withGuardianDisplayName(dbActive.contact, contactRelations) };
        }
      }

      if (activeConv) {
        // Possui atendimento em andamento: abre a conversa ativa
        setSelectedConversation(activeConv);
        setViewMode('chat');
        return;
      }

      // 3. Se não houver atendimento ativo, procurar histórico mais recente do contato
      let histConv = history.find((c) => c.contact_id === contact.id);

      if (!histConv) {
        // Buscar no banco se existe alguma conversa finalizada para obter metadados
        const { data: dbHist } = await supabase
          .from('df_wa_conversations')
          .select(`
            *,
            contact:df_wa_contacts(*, patient:df_patients!df_wa_contacts_patient_id_fkey(id, name, cpf, phone, email)),
            assigned_user:df_users!df_wa_conversations_assigned_to_fkey(id, name, email, role)
          `)
          .eq('tenant_id', tenantId)
          .eq('contact_id', contact.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dbHist) {
          const rawHistConv = dbHist as any as WhatsAppConversation;
          histConv = { ...rawHistConv, contact: withGuardianDisplayName(rawHistConv.contact, contactRelations) };
        }
      }

      if (histConv) {
        // Abre o histórico em modo somente consulta (sem criar nada no banco!)
        setSelectedConversation(histConv);
        setViewMode('chat');
        return;
      }

      // 4. Se for contato novo sem nenhum atendimento prévio, cria conversa de consulta em memória
      const consultConv: WhatsAppConversation = {
        id: `consult_${contact.id}`,
        tenant_id: tenantId,
        contact_id: contact.id,
        contact: contact,
        status: 'finalizado',
        unread_count: 0,
        priority: 'media',
        tags: [],
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setSelectedConversation(consultConv);
      setViewMode('chat');
    } catch (err: any) {
      console.error('[WhatsAppMainView] Erro ao abrir contato em modo consulta:', err.message);
    } finally {
      setTimeout(() => {
        isProcessingContactRef.current = false;
      }, 300);
    }
  };

  return (
    <div className="flex flex-col h-full flex-1 min-h-0 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Top View Bar (Alternador Chat vs Kanban) */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-white border-b border-slate-200/80 z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800">Atendimento & WhatsApp</h1>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('chat')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'chat'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
          </div>

          <button
            onClick={() => loadConversations(false)}
            className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {viewMode === 'kanban' ? (
          /* MODO KANBAN */
          <WhatsAppKanban
            conversations={conversations}
            history={history}
            tenantId={tenantId}
            currentUserId={currentUserId}
            staffMembers={staffMembers}
            onSelectConversation={(conv) => {
              consumedInitialConvRef.current = conv.id;
              setSelectedConversation(conv);
              setViewMode('chat');
            }}
            onRefresh={() => loadConversations(false)}
            onBackToChat={() => setViewMode('chat')}
          />
        ) : (
          /* MODO CHAT TRADICIONAL */
          <>
            {/* Sidebar com Lista de Conversas */}
            <div
              className={`${
                selectedConversation ? 'hidden lg:flex' : 'flex'
              } w-full lg:w-84 xl:w-96 shrink-0 h-full min-h-0 overflow-hidden`}
            >
              <WhatsAppSidebar
                conversations={conversations}
                history={history}
                contacts={contacts}
                contactRelations={contactRelations}
                selectedConversationId={selectedConversation?.id}
                onSelectConversation={(conv) => {
                  consumedInitialConvRef.current = conv.id;
                  setSelectedConversation(conv);
                }}
                onSelectContact={handleSelectContact}
                activeTab={activeTab}
                onChangeTab={setActiveTab}
                onOpenNewContact={() => setIsNewContactOpen(true)}
                onOpenSettings={() => setIsSettingsOpen(true)}
                currentUserId={currentUserId}
                currentUserRole={
                  currentUserRole || staffMembers.find((s) => s.id === currentUserId)?.role
                }
                staffMembers={staffMembers}
                loading={loading}
              />
            </div>

            {/* Área Central de Conversa ou Estado Vazio */}
            {selectedConversation ? (
              <div className="flex-1 min-h-0 flex h-full overflow-hidden">
                <WhatsAppChatArea
                  key={`${tenantId}_${selectedConversation.id}`}
                  conversation={selectedConversation}
                  tenantId={tenantId}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  onBackMobile={() => setSelectedConversation(null)}
                  onToggleContext={() => setShowContext(!showContext)}
                  showContext={showContext}
                  onConversationUpdated={() => loadConversations(false)}
                  onSelectConversation={(conv) => setSelectedConversation(conv)}
                  realtimeMessageEvent={activeChatRealtimeEvent}
                  onOpenCreatePatient={handleOpenCreatePatient}
                  relatedPatients={relatedPatients}
                  selectedClinicalPatientId={selectedClinicalPatientId}
                  onSelectClinicalPatient={setSelectedClinicalPatientId}
                  effectiveClinicalPatientId={effectiveClinicalPatientId}
                />

                {/* Gaveta de Contexto do Atendimento */}
                <WhatsAppContextDrawer
                  isOpen={showContext}
                  onClose={() => setShowContext(false)}
                  conversation={selectedConversation}
                  timelineItems={[]}
                  tenantId={tenantId}
                  currentUserId={currentUserId}
                  onOpenEditContact={() => setIsEditContactOpen(true)}
                  onOpenPatientModal={handleOpenCreatePatient}
                  onNoteAdded={() => loadConversations(false)}
                  onNavigateToAgenda={onNavigateToAgenda}
                  relatedPatients={relatedPatients}
                  selectedClinicalPatientId={selectedClinicalPatientId}
                  onSelectClinicalPatient={setSelectedClinicalPatientId}
                  effectiveClinicalPatientId={effectiveClinicalPatientId}
                  onOpenScheduleModal={(patId) => {
                    setSchedulePatientId(patId);
                    setScheduleRescheduleFrom(null);
                    setScheduleModalOpen(true);
                  }}
                  onOpenAppointmentDetails={(app) => {
                    setDetailsAppointment(app);
                    setDetailsModalOpen(true);
                  }}
                  onRescheduleAppointment={(app) => {
                    setScheduleRescheduleFrom(app);
                    setSchedulePatientId(app.patientId);
                    setScheduleModalOpen(true);
                  }}
                  onTimelineRefresh={() => loadConversations(false)}
                />
              </div>
            ) : (
              /* Estado Vazio */
              <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-8 bg-slate-50/50 text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 shadow-xs">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1">Central de Atendimento</h3>
                <p className="text-xs text-slate-500 max-w-sm mb-4">
                  Selecione uma conversa ativa na barra lateral para continuar o atendimento.
                </p>

                <div className="flex flex-col gap-2 max-w-sm w-full mb-6 text-xs text-slate-600 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs text-left">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">•</span>
                    <p>
                      <strong>Para contatos já cadastrados:</strong> Acesse a aba <strong>Contatos</strong> ao lado e clique no contato para abrir ou iniciar um atendimento.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">•</span>
                    <p>
                      <strong>Para novo contato ou vínculo com paciente:</strong> Utilize o botão abaixo.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsNewContactOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Cadastrar Novo Contato / Vincular Paciente
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAIS DA AGENDA DENTRO DO WHATSAPP */}
      {scheduleModalOpen && (
        <AppointmentModal
          isOpen={scheduleModalOpen}
          onClose={() => {
            setScheduleModalOpen(false);
            setSchedulePatientId(undefined);
            setScheduleRescheduleFrom(null);
          }}
          initialPatientId={schedulePatientId}
          rescheduleFromAppointment={scheduleRescheduleFrom}
          activeTenantId={tenantId}
          onSaved={(_saved) => {
            loadConversations(false);
          }}
        />
      )}

      {detailsModalOpen && detailsAppointment && (
        <AppointmentDetailsModal
          isOpen={detailsModalOpen}
          onClose={() => {
            setDetailsModalOpen(false);
            setDetailsAppointment(null);
          }}
          appointment={detailsAppointment}
          activeTenantId={tenantId}
          onEdit={(_app) => {
            // Em caso de edição
          }}
          onReschedule={(app) => {
            setDetailsModalOpen(false);
            setScheduleRescheduleFrom(app);
            setSchedulePatientId(app.patientId);
            setScheduleModalOpen(true);
          }}
          onStatusChanged={() => {
            loadConversations(false);
          }}
        />
      )}

      {/* MODAL NOVO CONTATO */}
      <NewContactModal
        isOpen={isNewContactOpen}
        onClose={() => setIsNewContactOpen(false)}
        tenantId={tenantId}
        onContactCreated={(contact, conversation) => {
          loadConversations(false);
          setSelectedConversation(conversation);
          setViewMode('chat');
        }}
      />

      {/* MODAL EDITAR CONTATO */}
      {selectedConversation?.contact && (
        <EditContactModal
          isOpen={isEditContactOpen}
          onClose={() => setIsEditContactOpen(false)}
          contact={selectedConversation.contact}
          tenantId={tenantId}
          onUpdated={(updatedContact) => {
            setSelectedConversation((prev) =>
              prev ? { ...prev, contact: updatedContact } : null
            );
            loadConversations(false);
          }}
        />
      )}

      {/* MODAL CADASTRAR PACIENTE */}
      {isPatientModalOpen && (
        <PatientModal
          isOpen={isPatientModalOpen}
          onClose={() => {
            setIsPatientModalOpen(false);
            setPatientModalInitialData(null);
          }}
          mode="create"
          initialData={patientModalInitialData}
          onSave={handlePatientSaved}
        />
      )}

      {/* MODAL CONFIGURAÇÃO EVOLUTION */}
      <InstanceConfigModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        tenantId={tenantId}
      />
    </div>
  );
};
