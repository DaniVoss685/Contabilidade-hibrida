import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, Sparkles } from 'lucide-react';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';

interface FinalizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  tenantId: string;
  authorId?: string;
  onFinalized: () => void;
}

const COMMON_REASONS = [
  'Dúvida esclarecida',
  'Consulta agendada',
  'Orçamento enviado',
  'Exame recebido / encaminhado',
  'Paciente orientado',
  'Sem retorno do paciente',
  'Outro motivo',
];

export const FinalizeModal: React.FC<FinalizeModalProps> = ({
  isOpen,
  onClose,
  conversationId,
  tenantId,
  authorId,
  onFinalized,
}) => {
  const [reason, setReason] = useState(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = reason === 'Outro motivo' ? customReason.trim() : reason;
    if (!finalReason) {
      setError('Por favor, informe o motivo do encerramento.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await DentalWhatsAppService.finalizeConversation({
        conversationId,
        tenantId,
        authorId,
        reason: finalReason,
        notes: notes.trim() || undefined,
      });

      if (res.success) {
        onFinalized();
        onClose();
      } else {
        setError(res.error || 'Erro ao finalizar atendimento.');
      }
    } catch (err: any) {
      setError(err?.message || 'Falha ao processar finalização.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Finalizar Atendimento</h3>
              <p className="text-xs text-slate-500">A conversa será movida para o histórico</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFinalize} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Motivo do Encerramento */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Motivo do Encerramento <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {COMMON_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                    reason === r
                      ? 'bg-emerald-50 border-emerald-300 font-semibold text-emerald-900'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>{r}</span>
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                </label>
              ))}
            </div>

            {reason === 'Outro motivo' && (
              <input
                type="text"
                required
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Descreva o motivo..."
                className="w-full mt-2 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            )}
          </div>

          {/* Observações de Encerramento */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Observações / Resumo Clínico (Opcional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Paciente virá presencialmente na sexta-feira às 14h..."
              className="w-full p-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Voltar ao Chat
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Encerrando...' : 'Concluir Atendimento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
