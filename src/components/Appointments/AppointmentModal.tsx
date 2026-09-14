import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Clock, User, Stethoscope, FileText, Send, CheckCircle2, ArrowRight } from 'lucide-react';
import { db } from '../../lib/db';
import { Patient, DentalProcedure, Appointment, AppointmentStatus, AppointmentOrigin, Professional } from '../../types';
import { PatientSearchSelect } from '../UI/PatientSearchSelect';
import { DatePicker, TimePicker, CustomSelect, ConfirmDialog, useToast } from '../UI';

import { formatDateBr } from '../../lib/masks';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointmentToEdit?: Appointment | null;
  rescheduleFromAppointment?: Appointment | null;
  defaultDate?: string;
  defaultStartTime?: string;
  onSaved?: (appointment: Appointment) => void;
  onNavigateToProcedures?: () => void;
}

const STATUS_OPTIONS: { value: AppointmentStatus; label: string; color: string }[] = [
  { value: 'CONFIRMADA', label: 'Confirmada', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'PENDENTE', label: 'Pendente Confirmação', color: 'bg-amber-100 text-amber-800' },
  { value: 'AGUARDANDO', label: 'Aguardando na Recepção', color: 'bg-blue-100 text-blue-800' },
  { value: 'EM_ATENDIMENTO', label: 'Em Atendimento', color: 'bg-purple-100 text-purple-800' },
  { value: 'FINALIZADA', label: 'Finalizada', color: 'bg-slate-100 text-slate-700' },
  { value: 'CANCELADA', label: 'Cancelada', color: 'bg-rose-100 text-rose-700' },
  { value: 'FALTOU', label: 'Não compareceu (Faltou)', color: 'bg-slate-200 text-slate-600' },
];

const ORIGIN_OPTIONS: { value: AppointmentOrigin; label: string }[] = [
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'TELEFONE', label: 'Telefone' },
  { value: 'RECEPCAO', label: 'Recepção / Presencial' },
  { value: 'ONLINE', label: 'Agendamento Online' },
  { value: 'RETORNO', label: 'Retorno Programado' },
];

const DURATION_OPTIONS = [
  { value: '15', label: '15 minutos (Avaliação rápida)' },
  { value: '30', label: '30 minutos (Consulta padrão / Manutenção)' },
  { value: '45', label: '45 minutos (Profilaxia / Restauração)' },
  { value: '60', label: '1 hora (Procedimento cirúrgico / Endodontia)' },
  { value: '90', label: '1h 30min (Cirurgia avançada / Implante)' },
  { value: '120', label: '2 horas (Reabilitação / Cirurgia múltipla)' },
];

function calculateEndTime(start: string, durationMinutes: number): string {
  if (!start) return '';
  const [h, m] = start.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '';
  const totalMin = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMin / 60) % 24;
  const endM = totalMin % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

export const AppointmentModal: React.FC<AppointmentModalProps> = ({
  isOpen,
  onClose,
  appointmentToEdit,
  rescheduleFromAppointment,
  defaultDate,
  defaultStartTime,
  onSaved,
  onNavigateToProcedures,
}) => {
  const toast = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [procedures, setProcedures] = useState<DentalProcedure[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [dentistName, setDentistName] = useState('Dr. Carlos Eduardo Mendes');

  // Form states
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientCpf, setPatientCpf] = useState('');

  const [date, setDate] = useState(() => defaultDate || new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState(defaultStartTime || '09:00');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [endTime, setEndTime] = useState('09:45');

  const [selectedProcedureId, setSelectedProcedureId] = useState('');
  const [procedureName, setProcedureName] = useState('');
  const [status, setStatus] = useState<AppointmentStatus>('CONFIRMADA');
  const [origin, setOrigin] = useState<AppointmentOrigin>('WHATSAPP');
  const [notes, setNotes] = useState('');
  const [sendWhatsappReminder, setSendWhatsappReminder] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Load resources
  useEffect(() => {
    if (isOpen) {
      setPatients(db.getPatients());
      setProcedures(db.getProcedures());
      const profs = db.getProfessionals();
      setProfessionals(profs);
      const defaultProf = profs[0] || db.getProfessional();
      if (defaultProf?.name) {
        setDentistName(defaultProf.name);
      }
    }
  }, [isOpen]);

  // Recalculate end time whenever startTime or duration changes
  useEffect(() => {
    setEndTime(calculateEndTime(startTime, durationMinutes));
  }, [startTime, durationMinutes]);

  // Reset or populate clean state whenever modal opens or item to edit changes
  useEffect(() => {
    if (isOpen) {
      if (appointmentToEdit) {
        setSelectedPatientId(appointmentToEdit.patientId);
        setPatientName(appointmentToEdit.patientName);
        setPatientPhone(appointmentToEdit.patientPhone || '');
        setPatientCpf(appointmentToEdit.patientCpf || '');
        setDate(appointmentToEdit.date);
        setStartTime(appointmentToEdit.startTime);
        setDurationMinutes(appointmentToEdit.durationMinutes);
        setEndTime(appointmentToEdit.endTime);
        setSelectedProcedureId(appointmentToEdit.procedureId || '');
        setProcedureName(appointmentToEdit.procedureName);
        setStatus(appointmentToEdit.status);
        setOrigin(appointmentToEdit.origin || 'WHATSAPP');
        setNotes(appointmentToEdit.notes || '');
        setSendWhatsappReminder(appointmentToEdit.sendWhatsappReminder ?? true);
        setDentistName(appointmentToEdit.dentistName);
      } else if (rescheduleFromAppointment) {
        // Reagendamento após falta: reutiliza paciente, procedimento, profissional e duração
        // NÃO reutiliza automaticamente data e horário para forçar nova escolha
        setSelectedPatientId(rescheduleFromAppointment.patientId);
        setPatientName(rescheduleFromAppointment.patientName);
        setPatientPhone(rescheduleFromAppointment.patientPhone || '');
        setPatientCpf(rescheduleFromAppointment.patientCpf || '');
        setDate(defaultDate || '');
        setStartTime(defaultStartTime || '');
        setDurationMinutes(rescheduleFromAppointment.durationMinutes || 45);
        setEndTime('');
        setSelectedProcedureId(rescheduleFromAppointment.procedureId || '');
        setProcedureName(rescheduleFromAppointment.procedureName);
        setStatus('CONFIRMADA');
        setOrigin(rescheduleFromAppointment.origin || 'WHATSAPP');
        setNotes(
          rescheduleFromAppointment.notes
            ? `${rescheduleFromAppointment.notes} — Reagendamento da consulta de ${formatDateBr(rescheduleFromAppointment.date)}`
            : `Reagendamento da consulta de ${formatDateBr(rescheduleFromAppointment.date)}`
        );
        setSendWhatsappReminder(true);
        setDentistName(rescheduleFromAppointment.dentistName);
      } else {
        // Clean initial state with intentional defaults
        setSelectedPatientId('');
        setPatientName('');
        setPatientPhone('');
        setPatientCpf('');
        setDate(defaultDate || new Date().toISOString().split('T')[0]);
        setStartTime(defaultStartTime || '09:00');
        setDurationMinutes(45);
        setSelectedProcedureId('');
        setProcedureName('');
        setStatus('CONFIRMADA');
        setOrigin('WHATSAPP');
        setNotes('');
        setSendWhatsappReminder(true);
        const profs = db.getProfessionals();
        if (profs[0]?.name) {
          setDentistName(profs[0].name);
        }
      }
      setErrors({});
      setShowDiscardConfirm(false);
    }
  }, [isOpen, appointmentToEdit, rescheduleFromAppointment, defaultDate, defaultStartTime]);

  // Check if form is modified compared to blank (unconditionally declared at top!)
  const isDirty = useMemo(() => {
    if (appointmentToEdit) {
      return (
        patientName !== appointmentToEdit.patientName ||
        date !== appointmentToEdit.date ||
        startTime !== appointmentToEdit.startTime ||
        procedureName !== appointmentToEdit.procedureName ||
        notes !== (appointmentToEdit.notes || '')
      );
    }
    if (rescheduleFromAppointment) {
      return Boolean(date || startTime);
    }
    return Boolean(
      selectedPatientId ||
      patientName.trim() ||
      selectedProcedureId ||
      procedureName.trim() ||
      notes.trim()
    );
  }, [appointmentToEdit, rescheduleFromAppointment, selectedPatientId, patientName, selectedProcedureId, procedureName, notes, date, startTime]);

  const handleRequestClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handlePatientSelect = (p: Patient) => {
    setSelectedPatientId(p.id);
    setPatientName(p.name);
    setPatientPhone(p.phone || '');
    setPatientCpf(p.cpf || '');
    if (errors.patient) {
      setErrors((prev) => ({ ...prev, patient: '' }));
    }
  };

  const handleProcedureSelect = (pId: string) => {
    setSelectedProcedureId(pId);
    const found = procedures.find((p) => p.id === pId);
    if (found) {
      setProcedureName(found.name);
      if (found.clinicalDurationMinutes) {
        setDurationMinutes(found.clinicalDurationMinutes);
      }
    } else {
      setProcedureName('');
    }
    if (errors.procedure) {
      setErrors((prev) => ({ ...prev, procedure: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!selectedPatientId && !patientName.trim()) {
      newErrors.patient = 'Selecione ou informe o paciente.';
    }
    if (!date) {
      newErrors.date = 'Informe a data da consulta.';
    }
    if (!startTime) {
      newErrors.startTime = 'Informe o horário de início.';
    }
    if (!procedureName.trim()) {
      newErrors.procedure = 'Informe ou selecione o procedimento clínico.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const calculatedEnd = calculateEndTime(startTime, durationMinutes);

      let savedAppointment: Appointment;

      if (appointmentToEdit) {
        db.updateAppointment(appointmentToEdit.id, {
          patientId: selectedPatientId || appointmentToEdit.patientId,
          patientName,
          patientPhone,
          patientCpf,
          date,
          startTime,
          durationMinutes,
          endTime: calculatedEnd,
          dentistName,
          procedureName,
          procedureId: selectedProcedureId || undefined,
          status,
          origin,
          notes,
          sendWhatsappReminder,
        });
        savedAppointment = {
          ...appointmentToEdit,
          patientId: selectedPatientId || appointmentToEdit.patientId,
          patientName,
          patientPhone,
          patientCpf,
          date,
          startTime,
          durationMinutes,
          endTime: calculatedEnd,
          dentistName,
          procedureName,
          procedureId: selectedProcedureId || undefined,
          status,
          origin,
          notes,
          sendWhatsappReminder,
          updatedAt: new Date().toISOString(),
        };
        toast.success(`Consulta de ${patientName} atualizada com sucesso!`);
      } else {
        savedAppointment = db.addAppointment({
          orgId: db.getOrg().id,
          patientId: selectedPatientId,
          patientName,
          patientPhone,
          patientCpf,
          date,
          startTime,
          durationMinutes,
          endTime: calculatedEnd,
          dentistName,
          procedureName,
          procedureId: selectedProcedureId || undefined,
          status,
          origin,
          notes,
          sendWhatsappReminder,
          rescheduledFromId: rescheduleFromAppointment?.id,
          rescheduledFromDate: rescheduleFromAppointment?.date,
        });

        // Vínculo bidirecional: atualiza a consulta de origem com os dados do reagendamento
        if (rescheduleFromAppointment) {
          db.updateAppointment(rescheduleFromAppointment.id, {
            rescheduledToId: savedAppointment.id,
            rescheduledToDate: savedAppointment.date,
            rescheduledToTime: savedAppointment.startTime,
          });
        }

        toast.success(`Consulta para ${patientName} agendada para ${formatDateBr(date)} às ${startTime}!`);
      }

      if (onSaved) {
        onSaved(savedAppointment);
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Ocorreu um erro ao salvar o agendamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Procedure options formatted for CustomSelect
  const procedureOptions = procedures.length > 0
    ? [
        { value: '', label: 'Selecione um procedimento cadastrado...' },
        ...procedures.map((proc) => ({
          value: proc.id,
          label: `${proc.name} (${proc.clinicalDurationMinutes || 30} min)`,
          description: proc.category ? `Categoria: ${proc.category}` : undefined,
        })),
      ]
    : [
        { value: '', label: 'Nenhum procedimento cadastrado' },
      ];

  // Professional options for CustomSelect (if > 1)
  const professionalOptions = professionals.map((p) => ({
    value: p.name,
    label: `${p.name} (CRO-${p.croUf} ${p.cro})`,
    description: p.especialidadePrincipal || 'Cirurgião-Dentista',
  }));

  // Render return conditionally ONLY AFTER all hooks are declared
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {appointmentToEdit
                    ? 'Editar Consulta Odontológica'
                    : rescheduleFromAppointment
                    ? 'Reagendar Consulta Odontológica'
                    : 'Nova Consulta Odontológica'}
                </h2>
                <p className="text-xs text-slate-500">
                  {rescheduleFromAppointment
                    ? `Reagendando consulta anterior de ${formatDateBr(rescheduleFromAppointment.date)} às ${rescheduleFromAppointment.startTime}`
                    : 'Agendamento de atendimento clínico com integração financeira'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRequestClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Patient Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Paciente <span className="text-rose-500">*</span>
              </label>
              <PatientSearchSelect
                patients={patients}
                value={selectedPatientId}
                onChange={handlePatientSelect}
                placeholder="Buscar paciente por nome, CPF ou celular..."
                error={errors.patient}
              />
              {patientPhone && (
                <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                  <span className="font-medium text-slate-600">WhatsApp/Telefone:</span> {patientPhone}
                </p>
              )}
            </div>

            {/* Date, Start Time & Duration Grid - Fully Premium Components */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <DatePicker
                  label="Data da Consulta"
                  required
                  value={date}
                  onChange={(d) => {
                    setDate(d);
                    if (errors.date) setErrors((prev) => ({ ...prev, date: '' }));
                  }}
                  className="w-full"
                />
                {errors.date && <p className="mt-1 text-xs text-rose-500">{errors.date}</p>}
              </div>

              <div>
                <TimePicker
                  label="Horário de Início"
                  required
                  value={startTime}
                  onChange={(t) => {
                    setStartTime(t);
                    if (errors.startTime) setErrors((prev) => ({ ...prev, startTime: '' }));
                  }}
                  className="w-full"
                />
                {errors.startTime && <p className="mt-1 text-xs text-rose-500">{errors.startTime}</p>}
              </div>

              <div>
                <CustomSelect
                  label="Duração Prevista"
                  options={DURATION_OPTIONS}
                  value={String(durationMinutes)}
                  onChange={(v) => setDurationMinutes(Number(v))}
                  className="w-full"
                />
                <p className="mt-1 text-xs text-slate-400">Término previsto às {endTime}</p>
              </div>
            </div>

            {/* Procedure Selection & Custom Detail */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <CustomSelect
                  label="Procedimento Clínico"
                  required
                  searchable
                  options={procedureOptions}
                  value={selectedProcedureId}
                  onChange={handleProcedureSelect}
                  placeholder="Selecione um procedimento..."
                  error={errors.procedure}
                  className="w-full"
                />
                {procedures.length === 0 && (
                  <div className="mt-1.5 flex items-center justify-between text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    <span>Nenhum procedimento cadastrado.</span>
                    {onNavigateToProcedures && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onNavigateToProcedures();
                        }}
                        className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <span>Ir para Procedimentos</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Detalhe / Descrição Clínica
                </label>
                <input
                  type="text"
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  placeholder="Ex: Restauração Resina Dente 16..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Status & Origin - Premium CustomSelects */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <CustomSelect
                  label="Status Inicial da Consulta"
                  options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                  value={status}
                  onChange={(v) => setStatus(v as AppointmentStatus)}
                  className="w-full"
                />
              </div>

              <div>
                <CustomSelect
                  label="Origem do Agendamento"
                  options={ORIGIN_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  value={origin}
                  onChange={(v) => setOrigin(v as AppointmentOrigin)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Professional (Controlled Selection) & WhatsApp Reminder */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                {professionals.length > 1 ? (
                  <CustomSelect
                    label="Profissional Responsável"
                    options={professionalOptions}
                    value={dentistName}
                    onChange={setDentistName}
                    className="w-full"
                  />
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Profissional Responsável
                    </label>
                    <div className="flex items-center gap-2.5 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50/80 text-slate-800 select-none">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        Dr
                      </div>
                      <span className="font-semibold">{dentistName}</span>
                      {professionals[0]?.cro && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-600 ml-auto">
                          CRO-{professionals[0].croUf} {professionals[0].cro}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 sm:pt-5">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendWhatsappReminder}
                    onChange={(e) => setSendWhatsappReminder(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    Enviar lembrete e confirmação via WhatsApp
                  </span>
                </label>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Observações Clínicas / Recomendações
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Paciente alérgico a dipirona; trazer radiografia panorâmica..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleRequestClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <span>Salvando...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{appointmentToEdit ? 'Salvar Alterações' : 'Confirmar Agendamento'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Discard Changes Confirm Dialog */}
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Descartar alterações da consulta?"
        message="As informações preenchidas nesta consulta não foram salvas e serão perdidas caso feche agora."
        confirmText="Sim, descartar"
        cancelText="Continuar editando"
        variant="warning"
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onClose();
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </>
  );
};
