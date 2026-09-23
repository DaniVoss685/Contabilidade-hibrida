import React, { useState } from 'react';
import { ClinicalRecord } from '../../../types';
import { db } from '../../../lib/db';
import { X, History, AlertTriangle, ShieldCheck, FileText } from 'lucide-react';

interface ClinicalAmendmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ClinicalRecord | null;
  onSaved: () => void;
}

export const ClinicalAmendmentModal: React.FC<ClinicalAmendmentModalProps> = ({
  isOpen,
  onClose,
  record,
  onSaved,
}) => {
  const [reason, setReason] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !record) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMessage('Informe a justificativa / motivo da retificação.');
      return;
    }
    if (!content.trim()) {
      setErrorMessage('Informe o texto do adendo ou retificação.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await db.addClinicalRecordAmendment(record.id, content.trim(), reason.trim());
      if (!res.success) {
        setErrorMessage(res.error || 'Erro ao registrar retificação.');
        setIsSubmitting(false);
        return;
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro inesperado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Retificar Registro Clínico
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

        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Imutabilidade Odontológica (CFO):</strong> O registro original não pode ser alterado ou sobrescrito. A retificação será registrada cronologicamente com identificação do autor, data, hora e justificativa.
            </div>
          </div>

          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
              {errorMessage}
            </div>
          )}

          {/* Texto Original Somente Leitura */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Registro original (somente leitura):
            </label>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 max-h-36 overflow-y-auto whitespace-pre-line font-sans leading-relaxed">
              {record.evolution}
            </div>
          </div>

          {/* Motivo da Correção */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Motivo da Correção <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder=""
              className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:outline-none transition-all"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Esclareça o motivo (ex: correção de erro de digitação, acréscimo de conduta, etc.).
            </p>
          </div>

          {/* Informação Corrigida / Complementação */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Informação Corrigida / Complementação <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder=""
              className="w-full text-xs font-medium rounded-xl border border-slate-200 p-3.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:outline-none transition-all font-sans leading-relaxed"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Redija as informações corretivas ou acréscimos clínicos pertinentes.
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
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-all shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Registrando...' : 'Registrar Retificação'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
