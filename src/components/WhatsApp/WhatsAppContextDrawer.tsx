import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Calendar,
  Lock,
  Clock,
  Send,
  UserCheck,
  Edit2,
  FileText,
  Activity,
  History,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Users,
} from 'lucide-react';
import { WhatsAppConversation, WhatsAppTimelineItem } from '../../types/whatsapp';
import { Appointment, Patient } from '../../types';
import { formatPhoneDisplay, getContactDisplayName, getContactInitial, isWhatsAppGroup, normalizeBrazilianNumber } from '../../lib/phoneUtils';
import { formatDateBr } from '../../lib/masks';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { supabase } from '../../lib/supabaseClient';
import { db } from '../../lib/db';
import { useToast } from '../UI';

interface WhatsAppContextDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: WhatsAppConversation;
  timelineItems: WhatsAppTimelineItem[];
  tenantId: string;
  currentUserId?: string;
  onOpenEditContact: () => void;
  onOpenPatientModal?: () => void;
  onNoteAdded: () => void;
  onNavigateToAgenda?: (date?: string, patientId?: string) => void;
  onOpenScheduleModal?: (patientId?: string) => void;
  onOpenAppointmentDetails?: (appointment: Appointment) => void;
  onRescheduleAppointment?: (appointment: Appointment) => void;
  onTimelineRefresh?: () => void;
  // Telefone compartilhado: estado de seleção elevado a WhatsAppMainView,
  // compartilhado com WhatsAppChatArea (ver comentário em WhatsAppMainView.tsx).
  relatedPatients?: Array<{ id: string; name: string; isPrimary: boolean }>;
  selectedClinicalPatientId?: string | null;
  onSelectClinicalPatient?: (patientId: string) => void;
  effectiveClinicalPatientId?: string | null;
  /** Abre a ficha completa do paciente (aba Pacientes) — chip "Pacientes relacionados". */
  onOpenPatientRecord?: (patientId: string) => void;
}

export const WhatsAppContextDrawer: React.FC<WhatsAppContextDrawerProps> = ({
  isOpen,
  onClose,
  conversation,
  timelineItems,
  tenantId,
  currentUserId,
  onOpenEditContact,
  onOpenPatientModal,
  onNoteAdded,
  onNavigateToAgenda,
  onOpenScheduleModal,
  onOpenAppointmentDetails,
  onRescheduleAppointment,
  onTimelineRefresh,
  relatedPatients = [],
  selectedClinicalPatientId = null,
  onSelectClinicalPatient,
  effectiveClinicalPatientId,
  onOpenPatientRecord,
}) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'info' | 'notes' | 'history'>('info');
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [contactNotes, setContactNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [contactCycles, setContactCycles] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Estados da Agenda Odontológica
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);
  const [recentAppointments, setRecentAppointments] = useState<Appointment[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Estados de busca rápida de paciente para vínculo
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const contact = conversation.contact;
  const patient = contact?.patient;

  // Telefone compartilhado: quando há >1 paciente vinculado ao contato,
  // nenhuma ação clínica (agenda, prontuário, dados exibidos) pode escolher
  // o paciente primário silenciosamente — exige seleção explícita, elevada a
  // WhatsAppMainView e compartilhada com WhatsAppChatArea.
  const hasPatientAmbiguity = relatedPatients.length > 1;
  const resolvedPatientId =
    effectiveClinicalPatientId !== undefined
      ? effectiveClinicalPatientId
      : hasPatientAmbiguity
      ? selectedClinicalPatientId
      : contact?.patient_id || (patient as any)?.id || null;
  const selectedPatientInfo = hasPatientAmbiguity
    ? relatedPatients.find((p) => p.id === resolvedPatientId) || null
    : null;

  // Carregar dados da agenda para o paciente vinculado
  const loadAgenda = async () => {
    const targetPatientId = resolvedPatientId;
    if (!targetPatientId || !tenantId) {
      setNextAppointment(null);
      setRecentAppointments([]);
      return;
    }

    setLoadingAgenda(true);
    try {
      const [nextApp, history] = await Promise.all([
        DentalWhatsAppService.getPatientNextAppointment(targetPatientId, tenantId),
        DentalWhatsAppService.getPatientAppointmentsHistory(targetPatientId, tenantId, 5),
      ]);
      setNextAppointment(nextApp);
      setRecentAppointments(history);
    } catch (err) {
      console.warn('[WhatsAppContextDrawer] Erro ao carregar dados da agenda:', err);
    } finally {
      setLoadingAgenda(false);
    }
  };

  // Disparo de confirmação ou lembrete transacional pelo WhatsApp
  const handleSendReminder = async (type: 'confirmation' | 'reminder_24h') => {
    if (!nextAppointment) return;
    setSendingReminder(true);
    try {
      const res = await DentalWhatsAppService.sendAppointmentTransactionalMessage({
        appointment: nextAppointment,
        reminderType: type,
        tenantId,
      });
      if (res.success) {
        toast.success(
          type === 'confirmation'
            ? 'Confirmação de agendamento enviada pelo WhatsApp!'
            : 'Lembrete de consulta enviado pelo WhatsApp!'
        );
        if (onTimelineRefresh) onTimelineRefresh();
        loadAgenda();
      } else {
        toast.error(res.error || 'Não foi possível enviar a mensagem de WhatsApp.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao disparar mensagem.');
    } finally {
      setSendingReminder(false);
    }
  };

  // Vínculo rápido de paciente com verificação estrita de divergência de telefone e proteção 1:1
  const handleLinkPatient = async (targetPatient: Patient) => {
    if (!contact?.id || !targetPatient?.id || !tenantId) return;

    // Verificar se o telefone do paciente diverge do WhatsApp (normalização canônica)
    const normContact = normalizeBrazilianNumber(contact.whatsapp_number);
    const normPatient = normalizeBrazilianNumber(targetPatient.phone || '');

    if (normPatient && normContact && normPatient !== normContact) {
      const confirmChange = window.confirm(
        `Atenção: O paciente "${targetPatient.name}" tem o telefone cadastrado "${targetPatient.phone}", diferente deste WhatsApp (${formatPhoneDisplay(
          contact.whatsapp_number
        )}).\n\nDeseja vincular este número de WhatsApp ao paciente mesmo assim?`
      );
      if (!confirmChange) return;
    }

    setIsLinking(true);
    try {
      let res = await DentalWhatsAppService.linkPatientToContact(contact.id, targetPatient.id, tenantId);

      // Se o paciente já está vinculado a outro contato do mesmo tenant, solicitar transferência explícita
      if (!res.success && res.alreadyLinkedToOther) {
        const confirmTransfer = window.confirm(
          `Atenção: O paciente "${targetPatient.name}" já está vinculado ao contato "${res.existingContactName}" (${formatPhoneDisplay(
            res.existingContactPhone || ''
          )}).\n\nDeseja transferir o vínculo clínico para este contato (${formatPhoneDisplay(contact.whatsapp_number)})?`
        );
        if (!confirmTransfer) {
          setIsLinking(false);
          return;
        }

        // Executar transferência atômica
        res = await DentalWhatsAppService.linkPatientToContact(contact.id, targetPatient.id, tenantId, {
          forceTransfer: true,
        });
      }

      if (res.success) {
        toast.success('Contato vinculado ao paciente com sucesso!');
        setShowLinkSearch(false);
        setPatientSearchTerm('');
        if (contact) {
          contact.patient_id = targetPatient.id;
          contact.patient = {
            id: targetPatient.id,
            name: targetPatient.name,
            cpf: targetPatient.cpf,
            phone: targetPatient.phone,
            email: targetPatient.email,
          };
        }
        await loadAgenda();
        if (onTimelineRefresh) onTimelineRefresh();
      } else {
        toast.error(res.error || 'Erro ao vincular paciente.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao vincular paciente.');
    } finally {
      setIsLinking(false);
    }
  };

  // Desvincular paciente
  const handleUnlinkPatient = async () => {
    if (!contact?.id || !tenantId) return;
    try {
      const res = await DentalWhatsAppService.unlinkPatientFromContact(contact.id, tenantId);
      if (res.success) {
        toast.info('Vínculo com o paciente removido.');
        if (contact) {
          contact.patient_id = null;
        }
        setNextAppointment(null);
        setRecentAppointments([]);
        if (onTimelineRefresh) onTimelineRefresh();
      }
    } catch (err: any) {
      toast.error('Erro ao desvincular paciente.');
    }
  };

  // Carregar notas de TODOS os ciclos daquele contato diretamente da fonte de verdade (df_wa_internal_notes)
  const loadNotes = async () => {
    if (!contact?.id || !tenantId) return;
    setLoadingNotes(true);
    try {
      const notes = await DentalWhatsAppService.getContactNotes(contact.id, tenantId);
      setContactNotes(notes);
    } catch (e) {
      console.warn('Erro ao carregar notas do contato:', e);
    } finally {
      setLoadingNotes(false);
    }
  };

  // Carregar ciclos de atendimento do contato
  const loadHistory = async () => {
    if (!contact?.id || !tenantId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('df_wa_conversations')
        .select(`
          id,
          created_at,
          status,
          finalization_reason,
          finalized_at,
          assigned_user:df_users!df_wa_conversations_assigned_to_fkey(id, name)
        `)
        .eq('tenant_id', tenantId)
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setContactCycles(data);
      }
    } catch (e) {
      console.warn('Erro ao carregar histórico de ciclos:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen && contact?.id) {
      loadNotes();
      loadAgenda();
      if (activeTab === 'history') {
        loadHistory();
      }
    }
  }, [isOpen, contact?.id, activeTab, tenantId, contact?.patient_id, resolvedPatientId]);

  // Escuta em tempo real atualizações na agenda e eventos para o drawer
  useEffect(() => {
    if (!isOpen || !tenantId) return;

    const channel = supabase
      .channel(`drawer_agenda_${tenantId}_${contact?.id || 'any'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'df_appointments',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          loadAgenda();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'df_wa_events',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: any) => {
          if (!contact?.id || payload.new?.contact_id === contact.id) {
            loadAgenda();
            if (onTimelineRefresh) onTimelineRefresh();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, tenantId, contact?.id, contact?.patient_id, resolvedPatientId]);

  const historyEvents = timelineItems.filter(
    (t) => t.type === 'event' || t.type === 'transfer' || t.type === 'call'
  );

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !currentUserId || !conversation.id) return;

    setSubmittingNote(true);
    try {
      await DentalWhatsAppService.addInternalNote(
        conversation.id,
        tenantId,
        currentUserId,
        newNote.trim()
      );
      setNewNote('');
      await loadNotes();
      onNoteAdded();
    } catch (err) {
      console.warn('Erro ao adicionar nota:', err);
    } finally {
      setSubmittingNote(false);
    }
  };

  if (!isOpen) return null;

  const isAttendanceActive = Boolean(
    conversation.id &&
    !conversation.id.startsWith('consult_') &&
    conversation.status !== 'finalizado' &&
    conversation.status !== 'arquivado'
  );

  return (
    <div className="w-80 sm:w-96 border-l border-slate-200 bg-white flex flex-col h-full shrink-0 z-20 shadow-lg animate-in slide-in-from-right-5 duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/50">
        <h3 className="text-sm font-bold text-slate-800">
          {isAttendanceActive ? 'Dados do Atendimento' : 'Dados do Contato'}
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-slate-200 px-4 pt-2 bg-slate-50/30">
        <button
          onClick={() => setActiveTab('info')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${
            activeTab === 'info'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Contato
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
            activeTab === 'notes'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Lock className="w-3 h-3 text-amber-500" />
          <span>Notas ({contactNotes.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 cursor-pointer transition-colors ${
            activeTab === 'history'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Histórico
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* TAB 1: CONTATO & PACIENTE */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            {/* Perfil */}
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-2xl border-2 border-emerald-200 overflow-hidden shadow-xs mb-3">
                {contact?.profile_pic_url ? (
                  <img
                    src={contact.profile_pic_url}
                    alt={getContactDisplayName(contact)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{getContactInitial(contact)}</span>
                )}
              </div>
              <h4 className="text-base font-bold text-slate-900">{getContactDisplayName(contact)}</h4>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {formatPhoneDisplay(contact?.whatsapp_number || '')}
              </p>
              <button
                onClick={onOpenEditContact}
                className="mt-3 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Editar Cadastro
              </button>
            </div>

            {/* Seção Paciente Clínico / Informações de Grupo */}
            {isWhatsAppGroup(contact?.whatsapp_number) ? (
              <div className="p-4 rounded-xl bg-purple-50/80 border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    Grupo do WhatsApp
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                    Coletivo
                  </span>
                </div>
                <p className="text-xs text-purple-900 leading-relaxed font-medium">
                  Esta conversa é um grupo coletivo de WhatsApp. Grupos não são associados a cadastros de pacientes individuais nem a agendamentos odontológicos.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Paciente Clínico
                  </span>
                  {patient || contact?.patient_id ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      ✓ Vinculado
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                      Não vinculado
                    </span>
                  )}
                </div>

                {hasPatientAmbiguity && (
                  <div className="mb-3 p-2.5 bg-white border border-emerald-200 rounded-lg">
                    <p className="text-[10px] font-bold text-emerald-800 mb-1.5">
                      Este telefone é compartilhado — selecione o paciente:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {relatedPatients.map((p) => (
                        <span
                          key={p.id}
                          className={`inline-flex items-center rounded-full text-[10px] font-bold border overflow-hidden ${
                            resolvedPatientId === p.id
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onSelectClinicalPatient?.(p.id)}
                            className={`px-2 py-1 cursor-pointer transition-colors ${
                              resolvedPatientId === p.id ? '' : 'hover:bg-emerald-50'
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
                              className={`pl-1 pr-2 py-1 cursor-pointer border-l transition-colors ${
                                resolvedPatientId === p.id
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
                  </div>
                )}

                {hasPatientAmbiguity && !selectedPatientInfo ? (
                  <div className="text-xs text-slate-500 py-2">
                    Selecione um paciente acima para ver prontuário, agenda e ações clínicas.
                  </div>
                ) : patient || contact?.patient_id ? (
                  <div className="space-y-2 text-xs text-slate-700">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {hasPatientAmbiguity ? selectedPatientInfo?.name : patient?.name || 'Paciente cadastrado'}
                      </p>
                      {!hasPatientAmbiguity && patient?.cpf && <p className="text-slate-500">CPF: {patient.cpf}</p>}
                      {!hasPatientAmbiguity && patient?.phone && <p className="text-slate-500">Tel: {patient.phone}</p>}
                      {!hasPatientAmbiguity && patient?.email && <p className="text-slate-500">Email: {patient.email}</p>}
                    </div>
                    {!hasPatientAmbiguity && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowLinkSearch(true)}
                          className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                        >
                          Alterar vínculo
                        </button>
                        <span className="text-slate-300">•</span>
                        <button
                          type="button"
                          onClick={handleUnlinkPatient}
                          className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 underline cursor-pointer"
                        >
                          Desvincular
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-slate-500 mb-2.5">
                      Nenhum paciente do sistema vinculado a este número.
                    </p>
                    {!showLinkSearch ? (
                      <div className="flex flex-col gap-2">
                        {onOpenPatientModal && (
                          <button
                            type="button"
                            onClick={onOpenPatientModal}
                            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Cadastrar como Paciente</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowLinkSearch(true)}
                          className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Vincular a Paciente Existente</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-700">Buscar paciente:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setShowLinkSearch(false);
                              setPatientSearchTerm('');
                            }}
                            className="text-[10px] text-slate-400 hover:text-slate-600"
                          >
                            Cancelar
                          </button>
                        </div>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Nome, CPF ou telefone..."
                            value={patientSearchTerm}
                            onChange={(e) => setPatientSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-1 pt-1">
                          {db
                            .getPatients()
                            .filter(
                              (p) =>
                                !patientSearchTerm ||
                                p.name.toLowerCase().includes(patientSearchTerm.toLowerCase()) ||
                                (p.cpf && p.cpf.includes(patientSearchTerm)) ||
                                (p.phone && p.phone.includes(patientSearchTerm))
                            )
                            .slice(0, 5)
                            .map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                disabled={isLinking}
                                onClick={() => handleLinkPatient(p)}
                                className="w-full text-left p-2 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 text-xs transition-colors cursor-pointer flex items-center justify-between"
                              >
                                <div>
                                  <p className="font-semibold text-slate-800">{p.name}</p>
                                  <p className="text-[10px] text-slate-400">
                                    {p.phone || 'Sem tel'} {p.cpf ? `• ${p.cpf}` : ''}
                                  </p>
                                </div>
                                <span className="text-[10px] text-emerald-600 font-bold">Vincular</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 📅 CONTEXTO DA AGENDA ODONTOLÓGICA */}
            {(patient || contact?.patient_id) && (!hasPatientAmbiguity || selectedPatientInfo) ? (
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/50 to-teal-50/40 border border-emerald-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    <span>Próxima Consulta</span>
                  </div>
                  {loadingAgenda && (
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                  )}
                </div>

                {nextAppointment ? (
                  <div className="space-y-2.5">
                    {/* Dados da Consulta */}
                    <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          {formatDateBr(nextAppointment.date)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            nextAppointment.status === 'CONFIRMADA'
                              ? 'bg-emerald-100 text-emerald-800'
                              : nextAppointment.status === 'PENDENTE'
                              ? 'bg-amber-100 text-amber-800'
                              : nextAppointment.status === 'CANCELADA'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {nextAppointment.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 pt-0.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {nextAppointment.startTime} às {nextAppointment.endTime} (
                          {nextAppointment.durationMinutes} min)
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 font-medium">
                        {nextAppointment.procedureName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Dr(a).{' '}
                        {nextAppointment.dentistName ||
                          nextAppointment.professionalName ||
                          'Cirurgião Dentista'}
                      </p>
                    </div>

                    {/* Ações Diretas */}
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      {onNavigateToAgenda && (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToAgenda(
                              nextAppointment.date,
                              nextAppointment.patientId
                            )
                          }
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer"
                          title="Abrir a grade da Agenda nesta data"
                        >
                          <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Ver Agenda</span>
                        </button>
                      )}

                      {onOpenAppointmentDetails && (
                        <button
                          type="button"
                          onClick={() => onOpenAppointmentDetails(nextAppointment)}
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer"
                          title="Ver detalhes completos da consulta"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-500" />
                          <span>Detalhes</span>
                        </button>
                      )}

                      {onRescheduleAppointment && (
                        <button
                          type="button"
                          onClick={() => onRescheduleAppointment(nextAppointment)}
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer"
                          title="Remarcar esta consulta"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-teal-600" />
                          <span>Remarcar</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={sendingReminder}
                        onClick={() => handleSendReminder('confirmation')}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="Disparar confirmação por WhatsApp agora"
                      >
                        {sendingReminder ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Confirmar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 py-1">
                    <p className="text-xs text-slate-500">
                      Nenhuma consulta futura agendada para este paciente.
                    </p>
                    {onOpenScheduleModal && (
                      <button
                        type="button"
                        onClick={() => onOpenScheduleModal(resolvedPatientId || undefined)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Agendar Consulta</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Histórico Recente de Consultas */}
                {recentAppointments.length > 0 && (
                  <div className="pt-2 border-t border-emerald-200/60">
                    <button
                      type="button"
                      onClick={() => setShowAllHistory(!showAllHistory)}
                      className="w-full flex items-center justify-between text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 py-0.5 cursor-pointer"
                    >
                      <span>Histórico de Consultas ({recentAppointments.length})</span>
                      {showAllHistory ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {showAllHistory && (
                      <div className="mt-2 space-y-1.5">
                        {recentAppointments.map((app) => (
                          <div
                            key={app.id}
                            onClick={() =>
                              onOpenAppointmentDetails && onOpenAppointmentDetails(app)
                            }
                            className="p-2 bg-white/90 rounded-md border border-slate-200 text-xs flex items-center justify-between cursor-pointer hover:bg-white transition-colors"
                          >
                            <div>
                              <span className="font-semibold text-slate-800">
                                {formatDateBr(app.date)}
                              </span>
                              <span className="text-slate-400 text-[11px] ml-1.5">
                                às {app.startTime}
                              </span>
                              <p className="text-[11px] text-slate-500 truncate max-w-[170px]">
                                {app.procedureName}
                              </p>
                            </div>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                app.status === 'CONFIRMADA' || app.status === 'FINALIZADA'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : app.status === 'CANCELADA' || app.status === 'FALTOU'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {app.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                  <Calendar className="w-4 h-4" />
                </div>
                <h5 className="text-xs font-bold text-slate-800">Agendamento de Consultas</h5>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Para agendar consultas e visualizar o histórico clínico deste contato, cadastre-o ou vincule-o a um paciente.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  {onOpenPatientModal && (
                    <button
                      type="button"
                      onClick={onOpenPatientModal}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Cadastrar Paciente
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowLinkSearch(true)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                    Vincular
                  </button>
                </div>
              </div>
            )}

            {/* Metadados do Atendimento ou Contato */}
            <div className="space-y-2 text-xs border-t border-slate-100 pt-4">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Status Operacional:</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded-md text-[11px] ${
                    isAttendanceActive
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {isAttendanceActive ? conversation.status.replace('_', ' ').toUpperCase() : 'SEM ATENDIMENTO ATIVO'}
                </span>
              </div>
              {isAttendanceActive && (
                <>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Atendente Atual:</span>
                    <span className="font-medium text-slate-800">
                      {conversation.assigned_user?.name || 'Não atribuído'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Iniciado em:</span>
                    <span className="text-slate-600">
                      {new Date(conversation.created_at).toLocaleString()}
                    </span>
                  </div>
                  {conversation.claimed_at && (
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Assumido em:</span>
                      <span className="text-slate-600">
                        {new Date(conversation.claimed_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: NOTAS INTERNAS DO CONTATO */}
        {activeTab === 'notes' && (
          <div className="flex flex-col h-full">
            {/* Form de Nova Nota ou Aviso de Modo Somente Consulta */}
            {isAttendanceActive ? (
              <form onSubmit={handleAddNote} className="mb-4">
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Nova Nota Interna (Visível apenas para a equipe)</span>
                  </div>
                  <textarea
                    rows={2}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Anotação clínica ou recado de equipe para este contato..."
                    className="w-full text-xs p-2 bg-white border border-amber-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-amber-500 resize-none"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      type="submit"
                      disabled={submittingNote || !newNote.trim() || !conversation.id}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      Salvar Nota
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="mb-4 p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-950">Sem atendimento ativo</p>
                  <p className="text-[11px] text-amber-800/80 mt-0.5">
                    Para registrar uma nova anotação interna, inicie um atendimento com este contato.
                  </p>
                </div>
              </div>
            )}

            {/* Lista de Notas de todos os ciclos do contato */}
            <div className="space-y-3">
              {loadingNotes ? (
                <p className="text-xs text-slate-400 text-center py-6">Carregando notas do contato...</p>
              ) : contactNotes.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  Nenhuma anotação interna registrada para este contato.
                </p>
              ) : (
                contactNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between text-[11px] text-amber-950 font-semibold">
                      <span className="flex items-center gap-1">
                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                        {note.author?.name || 'Profissional'}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(note.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}{' '}
                        às{' '}
                        {new Date(note.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Identificador do Ciclo / Atendimento de Origem */}
                    {note.conversation && (
                      <div className="text-[10px] text-amber-800/80 font-medium">
                        {note.conversation.status === 'finalizado' || note.conversation.status === 'arquivado' ? (
                          <span className="bg-amber-100/80 px-1.5 py-0.5 rounded-md border border-amber-200">
                            Ciclo finalizado em{' '}
                            {new Date(note.conversation.finalized_at || note.conversation.created_at).toLocaleDateString('pt-BR')}
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md border border-emerald-200 font-semibold">
                            Ciclo atual em andamento
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-slate-800 whitespace-pre-wrap pt-0.5">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: HISTÓRICO DE CICLOS E ATENDIMENTOS */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Ciclos de Atendimento ({contactCycles.length})
            </h5>
            {loadingHistory ? (
              <p className="text-xs text-slate-400 text-center py-6">Carregando histórico...</p>
            ) : contactCycles.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                Nenhum ciclo de atendimento registrado ainda para este contato.
              </p>
            ) : (
              <div className="space-y-2.5">
                {contactCycles.map((cycle) => {
                  const isClosed = cycle.status === 'finalizado' || cycle.status === 'arquivado';
                  const startDate = new Date(cycle.created_at);
                  const endDate = cycle.finalized_at ? new Date(cycle.finalized_at) : null;

                  return (
                    <div
                      key={cycle.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isClosed
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isClosed ? 'Finalizado' : 'Em Andamento'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {startDate.toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-700 space-y-0.5">
                        <p>
                          <strong>Iniciado:</strong> {startDate.toLocaleDateString('pt-BR')} às{' '}
                          {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {cycle.assigned_user?.name && (
                          <p>
                            <strong>Responsável:</strong> {cycle.assigned_user.name}
                          </p>
                        )}
                        {isClosed && endDate && (
                          <p>
                            <strong>Finalizado:</strong> {endDate.toLocaleDateString('pt-BR')} às{' '}
                            {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {cycle.finalization_reason && (
                          <p className="text-slate-600 italic">
                            Motivo: "{cycle.finalization_reason}"
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
