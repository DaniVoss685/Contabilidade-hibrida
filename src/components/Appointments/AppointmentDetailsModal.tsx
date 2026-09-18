import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  Phone,
  MessageCircle,
  Stethoscope,
  FileText,
  DollarSign,
  Edit2,
  Trash2,
  CheckCircle2,
  Play,
  Share2,
  UserCheck,
  AlertOctagon,
  ExternalLink,
} from 'lucide-react';
import { Appointment, AppointmentStatus } from '../../types';
import { db } from '../../lib/db';
import { useToast, ConfirmDialog } from '../UI';
import { formatDateBr } from '../../lib/masks';
import { isValidBrazilianPhone, formatPhoneDisplay } from '../../lib/phoneUtils';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { WhatsAppReminderLog } from '../../types/whatsapp';

export interface AppointmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  activeTenantId?: string;
  onEdit: (appointment: Appointment) => void;
  onReschedule?: (appointment: Appointment) => void;
  onLaunchSale?: (appointment: Appointment) => void;
  onStatusChanged?: () => void;
  onOpenWhatsAppChat?: (patientId: string, phone?: string) => void;
  onEditPatient?: (patientId: string) => void;
}

const STATUS_CONFIG: Record<
  AppointmentStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  AGENDADA: {
    label: 'Agendada',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
  },
  CONFIRMADA: {
    label: 'Confirmada',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  CHEGOU: {
    label: 'Chegou (Recepção)',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    dotClass: 'bg-teal-500',
  },
  PENDENTE: {
    label: 'Pendente Confirmação',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  AGUARDANDO: {
    label: 'Na Recepção (Aguardando)',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
  },
  EM_ATENDIMENTO: {
    label: 'Em Atendimento',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    dotClass: 'bg-purple-500 animate-pulse',
  },
  FINALIZADA: {
    label: 'Finalizada',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-500',
  },
  CANCELADA: {
    label: 'Cancelada',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-500',
  },
  FALTOU: {
    label: 'Faltou (Não compareceu)',
    badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
    dotClass: 'bg-slate-600',
  },
};

export const AppointmentDetailsModal: React.FC<AppointmentDetailsModalProps> = ({
  isOpen,
  onClose,
  appointment,
  activeTenantId,
  onEdit,
  onReschedule,
  onLaunchSale,
  onStatusChanged,
  onOpenWhatsAppChat,
  onEditPatient,
}) => {
  const toast = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMissedConfirm, setShowMissedConfirm] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [remindersLog, setRemindersLog] = useState<WhatsAppReminderLog[]>([]);

  // Resolver tenantId estritamente sanitizado (nunca prefixo 'org_')
  const effectiveTenantId = React.useMemo(() => {
    const raw =
      activeTenantId ||
      appointment?.tenantId ||
      (appointment as any)?.orgId ||
      db.getOrg()?.id ||
      '';
    return DentalWhatsAppService.sanitizeTenantId(raw);
  }, [activeTenantId, appointment?.tenantId, (appointment as any)?.orgId]);

  // Resolver dados atualizados do paciente em tempo real (fonte de verdade)
  const currentPatient = React.useMemo(() => {
    if (!appointment?.patientId) return null;
    return db.getPatients().find((p) => p.id === appointment.patientId) || null;
  }, [appointment?.patientId, isOpen]);

  const effectivePhone = currentPatient?.phone || appointment?.patientPhone || '';
  const hasValidPhone = Boolean(effectivePhone && isValidBrazilianPhone(effectivePhone));

  React.useEffect(() => {
    if (isOpen && appointment?.id && effectiveTenantId) {
      DentalWhatsAppService.getAppointmentRemindersLog(appointment.id, effectiveTenantId)
        .then((logs) => setRemindersLog(logs))
        .catch(() => setRemindersLog([]));
    }
  }, [isOpen, appointment?.id, effectiveTenantId]);

  const handleSendIntegratedWhatsApp = async (
    type: 'confirmation' | 'reminder_24h',
    forceResend: boolean = false
  ) => {
    if (!appointment) return;
    setSendingWhatsApp(true);
    try {
      const appointmentWithLatestPhone: Appointment = {
        ...appointment,
        patientPhone: effectivePhone || appointment.patientPhone,
        tenantId: effectiveTenantId,
      };

      const res = await DentalWhatsAppService.sendAppointmentTransactionalMessage({
        appointment: appointmentWithLatestPhone,
        reminderType: type,
        tenantId: effectiveTenantId,
        forceResend,
      });

      if (res.success) {
        toast.success(
          type === 'confirmation'
            ? 'Confirmação enviada via WhatsApp com sucesso!'
            : 'Lembrete de consulta enviado via WhatsApp!'
        );
        const updated = await DentalWhatsAppService.getAppointmentRemindersLog(appointment.id, effectiveTenantId);
        setRemindersLog(updated);

        // Se o telefone do agendamento estava desatualizado em relação ao paciente, sincroniza no banco
        if (effectivePhone && appointment.patientPhone !== effectivePhone) {
          DentalWhatsAppService.syncPatientPhoneInAppointments(appointment.patientId, effectiveTenantId, effectivePhone);
        }
      } else {
        toast.error(res.error || 'Não foi possível enviar mensagem pelo WhatsApp.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao disparar WhatsApp.');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  if (!isOpen || !appointment) return null;

  const config = STATUS_CONFIG[appointment.status] || STATUS_CONFIG.CONFIRMADA;

  const handleQuickStatus = (newStatus: AppointmentStatus) => {
    db.updateAppointmentStatus(appointment.id, newStatus);
    toast.success(`Status da consulta alterado para ${STATUS_CONFIG[newStatus].label}.`);
    if (onStatusChanged) onStatusChanged();
  };

  const handleConfirmMissed = () => {
    db.updateAppointment(appointment.id, {
      status: 'FALTOU',
      missedAt: new Date().toISOString(),
    });
    toast.info(`Falta registrada para ${appointment.patientName}.`);
    setShowMissedConfirm(false);
    if (onStatusChanged) onStatusChanged();
  };

  const handleDelete = () => {
    db.deleteAppointment(appointment.id);
    toast.success('Consulta cancelada e removida da agenda.');
    setShowDeleteConfirm(false);
    onClose();
    if (onStatusChanged) onStatusChanged();
  };

  const handleOpenWhatsApp = () => {
    if (!appointment.patientPhone) {
      toast.warning('Este paciente não possui telefone cadastrado.');
      return;
    }
    const cleanNumber = appointment.patientPhone.replace(/\D/g, '');
    const phoneWithCountry = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`;
    const text = encodeURIComponent(
      `Olá ${appointment.patientName}, tudo bem? Aqui é da clínica ${db.getOrg().name}. Lembramos da sua consulta agendada para ${formatDateBr(appointment.date)} às ${appointment.startTime} (${appointment.procedureName}). Por favor, confirme se poderá comparecer.`
    );
    window.open(`https://wa.me/${phoneWithCountry}?text=${text}`, '_blank');
  };

  // Initials for avatar
  const initials = appointment.patientName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
          {/* Top Header Card */}
          <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                {initials || 'P'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 leading-tight">
                  {appointment.patientName}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500 font-medium">
                    {appointment.patientCpf ? `CPF: ${appointment.patientCpf}` : 'Sem CPF cadastrado'}
                  </span>
                  {appointment.origin && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      Via {appointment.origin}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Content Body */}
          <div className="p-6 space-y-5 max-h-[calc(85vh-160px)] overflow-y-auto">
            {/* Rescheduling Banners */}
            {appointment.rescheduledFromDate && (
              <div className="p-3.5 bg-teal-50 text-teal-900 rounded-xl border border-teal-200 text-xs flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
                <span>
                  Reagendamento da consulta anterior de <strong>{formatDateBr(appointment.rescheduledFromDate)}</strong>.
                </span>
              </div>
            )}
            {appointment.rescheduledToDate && (
              <div className="p-3.5 bg-emerald-50 text-emerald-900 rounded-xl border border-emerald-200 text-xs flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Reagendada para <strong>{formatDateBr(appointment.rescheduledToDate)} às {appointment.rescheduledToTime || '—'}</strong>.
                </span>
              </div>
            )}

            {/* Status Strip & Operational Status Flow */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Status Atual
                  </span>
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border mt-1 ${config.badgeClass}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${config.dotClass}`} />
                    {config.label}
                  </div>
                </div>
              </div>

              {/* Next Available Actions Strictly Based on Operational State */}
              <div className="pt-3 border-t border-slate-200/70">
                <span className="text-[11px] font-semibold text-slate-500 block mb-2">
                  Próximas ações disponíveis:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(appointment.status === 'CONFIRMADA' || appointment.status === 'PENDENTE') && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleQuickStatus('AGUARDANDO')}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                        <span>Paciente Chegou</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMissedConfirm(true)}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <AlertOctagon className="w-3.5 h-3.5 text-amber-600" />
                        <span>Marcar Falta</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Cancelar</span>
                      </button>
                    </>
                  )}

                  {appointment.status === 'AGUARDANDO' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleQuickStatus('EM_ATENDIMENTO')}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                      >
                        <Play className="w-3.5 h-3.5 text-purple-600" />
                        <span>Iniciar Atendimento</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Cancelar</span>
                      </button>
                    </>
                  )}

                  {appointment.status === 'EM_ATENDIMENTO' && (
                    <button
                      type="button"
                      onClick={() => handleQuickStatus('FINALIZADA')}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Finalizar Consulta</span>
                    </button>
                  )}

                  {appointment.status === 'FINALIZADA' && (
                    <div className="flex items-center gap-2 text-xs text-slate-600 font-medium py-0.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Consulta finalizada com sucesso.</span>
                    </div>
                  )}

                  {appointment.status === 'FALTOU' && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full py-0.5">
                      <span className="text-xs text-slate-600">
                        {appointment.rescheduledToDate
                          ? `Esta consulta já foi reagendada para ${formatDateBr(appointment.rescheduledToDate)} às ${appointment.rescheduledToTime || '—'}.`
                          : 'O paciente não compareceu no horário agendado.'}
                      </span>
                      {!appointment.rescheduledToId && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            if (onReschedule) onReschedule(appointment);
                          }}
                          className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Reagendar Consulta</span>
                        </button>
                      )}
                    </div>
                  )}

                  {appointment.status === 'CANCELADA' && (
                    <div className="text-xs text-rose-600 font-medium py-0.5">
                      Esta consulta foi cancelada e o horário está liberado na grade.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Appointment Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Data e Horário */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Data da Consulta</span>
                </div>
                <p className="text-sm font-bold text-slate-900">{formatDateBr(appointment.date)}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1 pt-0.5">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {appointment.startTime} às {appointment.endTime} ({appointment.durationMinutes} min)
                </p>
              </div>

              {/* Procedimento */}
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Procedimento Clínico</span>
                </div>
                <p className="text-sm font-bold text-slate-900">{appointment.procedureName}</p>
                <p className="text-xs text-slate-500">
                  {appointment.dentistName || 'Dr. Carlos Eduardo Mendes'}
                </p>
              </div>
            </div>

            {/* Patient Contact Strip & WhatsApp Integrado */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      {effectivePhone ? formatPhoneDisplay(effectivePhone) : 'Telefone não cadastrado'}
                    </p>
                    <p className="text-[11px] text-slate-400">Canal oficial de comunicação</p>
                  </div>
                </div>

                {/* Status de envio de lembrete / confirmação */}
                {appointment.status === 'CONFIRMADA' ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Confirmada pelo paciente</span>
                  </div>
                ) : remindersLog.some((l) => l.reminder_type === 'confirmation' && l.status === 'sent') ? (
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Confirmação enviada</span>
                  </div>
                ) : null}
              </div>

              {!hasValidPhone ? (
                <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-800 mt-1">
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Este paciente não possui um número de WhatsApp válido.</span>
                  </div>
                  {onEditPatient && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onEditPatient(appointment.patientId);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shrink-0 cursor-pointer shadow-2xs"
                    >
                      Editar Paciente
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                  {/* Se já estiver confirmada: mostra selo e não botão principal de envio */}
                  {appointment.status === 'CONFIRMADA' ? (
                    <div className="flex-1 flex items-center gap-2 py-0.5">
                      <span className="text-xs text-emerald-700 font-medium">
                        ✓ Consulta confirmada pelo paciente
                      </span>
                    </div>
                  ) : remindersLog.some((l) => l.reminder_type === 'confirmation' && l.status === 'sent') ? (
                    /* Confirmação já enviada: botão de Reenviar com proteção explícita */
                    <button
                      type="button"
                      disabled={sendingWhatsApp || ['CANCELADA', 'FALTOU'].includes(appointment.status)}
                      onClick={() => handleSendIntegratedWhatsApp('confirmation', true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors cursor-pointer"
                      title="Reenviar confirmação de agendamento por WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-slate-600" />
                      <span>{sendingWhatsApp ? 'Reenviando...' : 'Reenviar Confirmação'}</span>
                    </button>
                  ) : (
                    /* Confirmação ainda não enviada: Botão principal verde destacado */
                    <button
                      type="button"
                      disabled={sendingWhatsApp || ['CANCELADA', 'FALTOU'].includes(appointment.status)}
                      onClick={() => handleSendIntegratedWhatsApp('confirmation', false)}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer shadow-2xs"
                      title="Enviar confirmação automática pelo WhatsApp conectado da clínica"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>{sendingWhatsApp ? 'Enviando...' : 'Enviar Confirmação'}</span>
                    </button>
                  )}

                  {/* Atalho para Abrir Chat Interno */}
                  {onOpenWhatsAppChat && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenWhatsAppChat(appointment.patientId, effectivePhone || undefined);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors cursor-pointer"
                      title="Abrir o histórico de conversa com este paciente na Central de Atendimento"
                    >
                      <Share2 className="w-3.5 h-3.5 text-teal-600" />
                      <span>Abrir no Chat</span>
                    </button>
                  )}

                  {/* Fallback Externo wa.me */}
                  <button
                    type="button"
                    onClick={handleOpenWhatsApp}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Abrir link wa.me externo"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Status discreto das automações (Confirmação, Lembrete 24h, Lembrete 2h) */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-[11px]">
                <span className="text-slate-400 font-medium">WhatsApp:</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                    remindersLog.some((l) => l.reminder_type === 'confirmation' && l.status === 'sent')
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  Confirmação: {remindersLog.some((l) => l.reminder_type === 'confirmation' && l.status === 'sent') ? 'Enviada' : 'Pendente'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                    remindersLog.some((l) => l.reminder_type === 'reminder_24h' && l.status === 'sent')
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  Lembrete 24h: {remindersLog.some((l) => l.reminder_type === 'reminder_24h' && l.status === 'sent') ? 'Enviado' : 'Pendente'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
                    remindersLog.some((l) => l.reminder_type === 'reminder_2h' && l.status === 'sent')
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  Lembrete 2h: {remindersLog.some((l) => l.reminder_type === 'reminder_2h' && l.status === 'sent') ? 'Enviado' : 'Pendente'}
                </span>
              </div>
            </div>

            {/* Notes Section */}
            {appointment.notes && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Observações Clínicas</span>
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{appointment.notes}</p>
              </div>
            )}

            {/* Financial Link Card: Lançar Receita Odontológica */}
            <div className="p-4 rounded-xl border border-emerald-200/80 bg-emerald-50/40 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-950">
                    {appointment.saleId ? 'Receita Vinculada' : 'Faturamento Clínico'}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800">
                  {appointment.saleId
                    ? 'Esta consulta já possui receita lançada no financeiro.'
                    : 'Encaminhe para cobrança ou emita o recibo/nota deste atendimento.'}
                </p>
              </div>

              {!appointment.saleId && onLaunchSale && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLaunchSale(appointment);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors shrink-0 cursor-pointer"
                >
                  Lançar Receita
                </button>
              )}
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="p-4 px-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Cancelar Consulta</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(appointment);
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200/80 rounded-xl transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Editar Consulta</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Cancelar esta consulta?"
        message={`Tem certeza que deseja cancelar e remover o agendamento de ${appointment.patientName}? Esta ação liberará o horário na grade.`}
        confirmText="Sim, cancelar consulta"
        cancelText="Voltar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Missed Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showMissedConfirm}
        title="Marcar paciente como faltou?"
        message={`${appointment.patientName} não compareceu à consulta de ${formatDateBr(appointment.date)} às ${appointment.startTime}.`}
        confirmText="Confirmar falta"
        cancelText="Cancelar"
        variant="warning"
        onConfirm={handleConfirmMissed}
        onCancel={() => setShowMissedConfirm(false)}
      />
    </>
  );
};
