import React, { useState, useEffect, useRef } from 'react';
import {
  Save,
  RotateCcw,
  Sparkles,
  Calendar,
  BellRing,
  CheckCheck,
  Info,
  CalendarSync,
  CalendarX2,
} from 'lucide-react';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { WhatsAppReminderSettings } from '../../types/whatsapp';
import { useToast, ConfirmDialog } from '../UI';

interface WhatsAppMessageTemplatesTabProps {
  tenantId: string;
}

const AVAILABLE_VARIABLES = [
  { tag: '{{paciente}}', label: 'Nome do Paciente', example: 'Daniel Arantes' },
  { tag: '{{data}}', label: 'Data da Consulta', example: '25/10/2026' },
  { tag: '{{hora}}', label: 'Horário', example: '14:30' },
  { tag: '{{profissional}}', label: 'Profissional', example: 'Dr. Carlos Eduardo Mendes' },
  { tag: '{{procedimento}}', label: 'Procedimento', example: 'Limpeza e Profilaxia' },
  { tag: '{{clinica}}', label: 'Nome da Clínica', example: 'Dental Finance Clinic' },
];

const DEFAULT_TEMPLATES = {
  confirmation:
    'Olá, {{paciente}}! Sua consulta está agendada para {{data}} às {{hora}} com {{profissional}}. Estamos te esperando 😊',
  reminder:
    'Olá, {{paciente}}! Lembramos da sua consulta marcada para o dia {{data}} às {{hora}} com {{profissional}}. Estamos te esperando 😊',
  reschedule:
    'Olá, {{paciente}}! Sua consulta foi remarcada para o dia {{data}} às {{hora}} com {{profissional}}. Estamos te esperando 😊',
  cancellation:
    'Olá, {{paciente}}! Informamos que sua consulta do dia {{data}} às {{hora}} foi cancelada. Se desejar reagendar para outra data, estamos à disposição!',
};

export const WhatsAppMessageTemplatesTab: React.FC<WhatsAppMessageTemplatesTabProps> = ({
  tenantId,
}) => {
  const toast = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // Form states
  const [enabled, setEnabled] = useState<boolean>(true);
  const [sendConfirmationOnCreate, setSendConfirmationOnCreate] = useState<boolean>(true);
  const [confirmationTemplate, setConfirmationTemplate] = useState<string>('');

  const [reminder24hEnabled, setReminder24hEnabled] = useState<boolean>(true);
  const [reminder2hEnabled, setReminder2hEnabled] = useState<boolean>(false);
  const [reminderTemplate, setReminderTemplate] = useState<string>('');

  const [rescheduleEnabled, setRescheduleEnabled] = useState<boolean>(true);
  const [rescheduleTemplate, setRescheduleTemplate] = useState<string>('');

  const [cancellationEnabled, setCancellationEnabled] = useState<boolean>(true);
  const [cancellationTemplate, setCancellationTemplate] = useState<string>('');

  // Refs para inserção de variáveis na posição do cursor
  const confirmationRef = useRef<HTMLTextAreaElement | null>(null);
  const reminderRef = useRef<HTMLTextAreaElement | null>(null);
  const rescheduleRef = useRef<HTMLTextAreaElement | null>(null);
  const cancellationRef = useRef<HTMLTextAreaElement | null>(null);

  const cleanTenantId = DentalWhatsAppService.sanitizeTenantId(tenantId);

  // Carregar configurações do tenant
  const loadSettings = async () => {
    if (!cleanTenantId) return;
    setLoading(true);
    try {
      const s = await DentalWhatsAppService.getReminderSettings(cleanTenantId);
      setEnabled(s.enabled ?? true);
      setSendConfirmationOnCreate(s.send_confirmation_on_create ?? true);
      setConfirmationTemplate(s.confirmation_template || DEFAULT_TEMPLATES.confirmation);

      setReminder24hEnabled(s.reminder_24h_enabled ?? true);
      setReminder2hEnabled(s.reminder_2h_enabled ?? false);
      setReminderTemplate(s.reminder_template || DEFAULT_TEMPLATES.reminder);

      setRescheduleEnabled(s.reschedule_enabled ?? true);
      setRescheduleTemplate(s.reschedule_template || DEFAULT_TEMPLATES.reschedule);

      setCancellationEnabled(s.cancellation_enabled ?? true);
      setCancellationTemplate(s.cancellation_template || DEFAULT_TEMPLATES.cancellation);
    } catch (e: any) {
      toast.error('Erro ao carregar modelos de mensagem.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [cleanTenantId]);

  // Função utilitária para inserir tags no cursor
  const insertVariable = (
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    currentValue: string,
    setValue: (val: string) => void,
    tag: string
  ) => {
    const el = textareaRef.current;
    if (!el) {
      setValue(currentValue + ' ' + tag);
      return;
    }

    const start = el.selectionStart ?? currentValue.length;
    const end = el.selectionEnd ?? currentValue.length;
    const before = currentValue.substring(0, start);
    const after = currentValue.substring(end);
    const updated = `${before}${tag}${after}`;
    setValue(updated);

    setTimeout(() => {
      el.focus();
      const newPos = start + tag.length;
      el.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // Preview com substituição de tags
  const renderPreviewText = (template: string) => {
    if (!template) return '';
    let preview = template;
    AVAILABLE_VARIABLES.forEach((v) => {
      preview = preview.replaceAll(v.tag, v.example);
    });
    return preview;
  };

  // Salvar configurações
  const handleSave = async () => {
    if (!cleanTenantId) {
      toast.error('Identificador de clínica não encontrado.');
      return;
    }
    setSaving(true);
    try {
      const payload: Partial<WhatsAppReminderSettings> & { tenant_id: string } = {
        tenant_id: cleanTenantId,
        enabled,
        send_confirmation_on_create: sendConfirmationOnCreate,
        confirmation_template: confirmationTemplate.trim(),
        reminder_24h_enabled: reminder24hEnabled,
        reminder_2h_enabled: reminder2hEnabled,
        reminder_template: reminderTemplate.trim(),
        reschedule_enabled: rescheduleEnabled,
        reschedule_template: rescheduleTemplate.trim(),
        cancellation_enabled: cancellationEnabled,
        cancellation_template: cancellationTemplate.trim(),
      };

      const res = await DentalWhatsAppService.saveReminderSettings(payload);
      if (res.success) {
        toast.success('Modelos de mensagem salvos com sucesso!');
      } else {
        toast.error(res.error || 'Erro ao salvar modelos.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro inesperado ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  // Restaurar padrões
  const handleResetDefaults = () => {
    setConfirmationTemplate(DEFAULT_TEMPLATES.confirmation);
    setReminderTemplate(DEFAULT_TEMPLATES.reminder);
    setRescheduleTemplate(DEFAULT_TEMPLATES.reschedule);
    setCancellationTemplate(DEFAULT_TEMPLATES.cancellation);
    setSendConfirmationOnCreate(true);
    setReminder24hEnabled(true);
    setReminder2hEnabled(false);
    setRescheduleEnabled(true);
    setCancellationEnabled(true);
    setShowResetConfirm(false);
    toast.info('Modelos redefinidos para os padrões humanizados. Clique em Salvar para persistir.');
  };

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-medium">Carregando configurações de mensagens...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barra de Ações do Topo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Modelos de Mensagens Automáticas
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Personalize os textos enviados aos pacientes para confirmação, lembretes e remarcações.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Padrões
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Dica de Variáveis Disponíveis */}
      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 text-xs text-emerald-900">
        <div className="flex items-center gap-1.5 font-bold mb-1.5">
          <Info className="w-4 h-4 text-emerald-700 shrink-0" />
          Tags dinâmicas suportadas
        </div>
        <p className="text-emerald-800 text-[11px] leading-relaxed">
          Clique nos botões de variáveis abaixo de cada campo para inseri-las automaticamente na posição do cursor. Ao disparar, o sistema preencherá com as informações reais da consulta.
        </p>
      </div>

      {/* CARD 1: CONFIRMAÇÃO DE AGENDAMENTO */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">1. Confirmação de Agendamento</h4>
              <p className="text-xs text-slate-500">
                Enviada logo após agendar a consulta ou pelo botão manual na Agenda.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs font-semibold text-slate-700">Disparo automático</span>
            <input
              type="checkbox"
              checked={sendConfirmationOnCreate}
              onChange={(e) => setSendConfirmationOnCreate(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Textarea + Variáveis */}
        <div className="space-y-2">
          <textarea
            ref={confirmationRef}
            rows={3}
            value={confirmationTemplate}
            onChange={(e) => setConfirmationTemplate(e.target.value)}
            className="w-full text-xs font-normal text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y"
            placeholder="Digite o texto da confirmação..."
          />

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Inserir:</span>
            {AVAILABLE_VARIABLES.map((v) => (
              <button
                key={v.tag}
                type="button"
                onClick={() =>
                  insertVariable(
                    confirmationRef,
                    confirmationTemplate,
                    setConfirmationTemplate,
                    v.tag
                  )
                }
                className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded-lg text-slate-700 transition-colors cursor-pointer"
              >
                {v.tag}
              </button>
            ))}
          </div>
        </div>

        {/* Preview Visual */}
        <div className="pt-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Pré-visualização da mensagem recebida:
          </span>
          <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200/60 flex flex-col items-start">
            <div className="bg-[#d9fdd3] text-slate-900 shadow-2xs rounded-2xl rounded-tr-none px-3.5 py-2 text-xs max-w-md leading-relaxed whitespace-pre-wrap">
              {renderPreviewText(confirmationTemplate) || '(Texto vazio)'}
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mt-1 font-sans">
                <span>14:30</span>
                <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: LEMBRETE DE CONSULTA (24H E 2H) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">2. Lembrete de Consulta</h4>
              <p className="text-xs text-slate-500">
                Aviso prévio para reduzir faltas e manter o paciente pontual.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-semibold text-slate-700">24h antes</span>
              <input
                type="checkbox"
                checked={reminder24hEnabled}
                onChange={(e) => setReminder24hEnabled(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-semibold text-slate-700">2h antes</span>
              <input
                type="checkbox"
                checked={reminder2hEnabled}
                onChange={(e) => setReminder2hEnabled(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Textarea + Variáveis */}
        <div className="space-y-2">
          <textarea
            ref={reminderRef}
            rows={3}
            value={reminderTemplate}
            onChange={(e) => setReminderTemplate(e.target.value)}
            className="w-full text-xs font-normal text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y"
            placeholder="Digite o texto do lembrete..."
          />

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Inserir:</span>
            {AVAILABLE_VARIABLES.map((v) => (
              <button
                key={v.tag}
                type="button"
                onClick={() =>
                  insertVariable(
                    reminderRef,
                    reminderTemplate,
                    setReminderTemplate,
                    v.tag
                  )
                }
                className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded-lg text-slate-700 transition-colors cursor-pointer"
              >
                {v.tag}
              </button>
            ))}
          </div>
        </div>

        {/* Preview Visual */}
        <div className="pt-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Pré-visualização do lembrete:
          </span>
          <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200/60 flex flex-col items-start">
            <div className="bg-[#d9fdd3] text-slate-900 shadow-2xs rounded-2xl rounded-tr-none px-3.5 py-2 text-xs max-w-md leading-relaxed whitespace-pre-wrap">
              {renderPreviewText(reminderTemplate) || '(Texto vazio)'}
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mt-1 font-sans">
                <span>08:00</span>
                <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 3: REAGENDAMENTO DE CONSULTA */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <CalendarSync className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">3. Reagendamento de Consulta</h4>
              <p className="text-xs text-slate-500">
                Disparada quando o horário da consulta é alterado pelo profissional ou recepção.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs font-semibold text-slate-700">Ativo</span>
            <input
              type="checkbox"
              checked={rescheduleEnabled}
              onChange={(e) => setRescheduleEnabled(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Textarea + Variáveis */}
        <div className="space-y-2">
          <textarea
            ref={rescheduleRef}
            rows={3}
            value={rescheduleTemplate}
            onChange={(e) => setRescheduleTemplate(e.target.value)}
            className="w-full text-xs font-normal text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y"
            placeholder="Digite o texto de remarcação..."
          />

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Inserir:</span>
            {AVAILABLE_VARIABLES.map((v) => (
              <button
                key={v.tag}
                type="button"
                onClick={() =>
                  insertVariable(
                    rescheduleRef,
                    rescheduleTemplate,
                    setRescheduleTemplate,
                    v.tag
                  )
                }
                className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded-lg text-slate-700 transition-colors cursor-pointer"
              >
                {v.tag}
              </button>
            ))}
          </div>
        </div>

        {/* Preview Visual */}
        <div className="pt-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Pré-visualização de remarcação:
          </span>
          <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200/60 flex flex-col items-start">
            <div className="bg-[#d9fdd3] text-slate-900 shadow-2xs rounded-2xl rounded-tr-none px-3.5 py-2 text-xs max-w-md leading-relaxed whitespace-pre-wrap">
              {renderPreviewText(rescheduleTemplate) || '(Texto vazio)'}
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mt-1 font-sans">
                <span>11:15</span>
                <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 4: CANCELAMENTO DE CONSULTA */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <CalendarX2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">4. Cancelamento de Consulta</h4>
              <p className="text-xs text-slate-500">
                Mensagem informativa e cordial avisando o cancelamento do agendamento.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs font-semibold text-slate-700">Ativo</span>
            <input
              type="checkbox"
              checked={cancellationEnabled}
              onChange={(e) => setCancellationEnabled(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Textarea + Variáveis */}
        <div className="space-y-2">
          <textarea
            ref={cancellationRef}
            rows={3}
            value={cancellationTemplate}
            onChange={(e) => setCancellationTemplate(e.target.value)}
            className="w-full text-xs font-normal text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-y"
            placeholder="Digite o texto de cancelamento..."
          />

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Inserir:</span>
            {AVAILABLE_VARIABLES.map((v) => (
              <button
                key={v.tag}
                type="button"
                onClick={() =>
                  insertVariable(
                    cancellationRef,
                    cancellationTemplate,
                    setCancellationTemplate,
                    v.tag
                  )
                }
                className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded-lg text-slate-700 transition-colors cursor-pointer"
              >
                {v.tag}
              </button>
            ))}
          </div>
        </div>

        {/* Preview Visual */}
        <div className="pt-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Pré-visualização de cancelamento:
          </span>
          <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200/60 flex flex-col items-start">
            <div className="bg-[#d9fdd3] text-slate-900 shadow-2xs rounded-2xl rounded-tr-none px-3.5 py-2 text-xs max-w-md leading-relaxed whitespace-pre-wrap">
              {renderPreviewText(cancellationTemplate) || '(Texto vazio)'}
              <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 mt-1 font-sans">
                <span>09:20</span>
                <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Botão Salvar Rodapé */}
      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando Alterações...' : 'Salvar Alterações'}
        </button>
      </div>

      {/* Modal de Confirmação para Restaurar Padrões */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="Restaurar Modelos Padrão?"
        description="Tem certeza que deseja restaurar os textos padrão humanizados de confirmação, lembrete, remarcação e cancelamento? As alterações não salvas serão substituídas."
        confirmLabel="Sim, Restaurar"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={handleResetDefaults}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
