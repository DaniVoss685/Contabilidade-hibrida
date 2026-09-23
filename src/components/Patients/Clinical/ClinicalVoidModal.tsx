import React, { useState } from 'react';
import { ClinicalRecord } from '../../../types';
import { db } from '../../../lib/db';
import { X, AlertOctagon, Ban } from 'lucide-react';

interface ClinicalVoidModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ClinicalRecord | null;
  onVoided: () => void;
}

export const ClinicalVoidModal: React.FC<ClinicalVoidModalProps> = ({
  isOpen,
  onClose,
  record,
  onVoided,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !record) return null;

  const sanitizeErrorMessage = (rawError?: string | null): string => {
    if (!rawError) return 'Não foi possível invalidar o registro. Tente novamente.';
    if (
      rawError.includes('PGRST') ||
      rawError.includes('schema cache') ||
      rawError.startsWith('{') ||
      rawError.includes('syntax error') ||
      rawError.includes('relation')
    ) {
      return 'Não foi possível invalidar o registro no servidor. Tente novamente ou verifique sua conexão.';
    }
    return rawError;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMessage('O motivo da invalidação é estritamente obrigatório.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await db.voidClinicalRecord(record.id, reason.trim());
      if (!res.success) {
        setErrorMessage(sanitizeErrorMessage(res.error));
        setIsSubmitting(false);
        return;
      }
      setReason('');
      onVoided();
      onClose();
    } catch (err: any) {
      setErrorMessage(sanitizeErrorMessage(err?.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Invalidar este registro clínico?
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Atendimento de {record.recordDate.split('-').reverse().join('/')}
                {record.procedureName ? ` • ${record.procedureName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-4 bg-rose-50/70 border border-rose-200/80 rounded-xl text-xs text-rose-900 leading-relaxed">
            <strong className="block mb-1 font-bold text-rose-950">Atenção sobre Invalidação:</strong>
            O registro permanecerá no histórico de auditoria, mas será marcado como inválido e não será considerado como evolução clínica ativa.
            Anexos vinculados e dados originais serão mantidos para conformidade legal.
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Motivo da Invalidação <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder=""
              className="w-full text-xs font-medium rounded-xl border border-slate-200 p-3 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none transition-all font-sans leading-relaxed"
              required
              autoFocus
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Ex: Registro lançado no paciente incorreto, atendimento duplicado por equívoco operacional, etc.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !reason.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
            >
              <Ban className="w-4 h-4" />
              <span>{isSubmitting ? 'Processando...' : 'Invalidar Registro'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
