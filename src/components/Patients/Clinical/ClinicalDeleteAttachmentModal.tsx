import React, { useState } from 'react';
import { ClinicalAttachment } from '../../../types';
import { db } from '../../../lib/db';
import { X, Trash2, AlertCircle } from 'lucide-react';

interface ClinicalDeleteAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: ClinicalAttachment | null;
  onDeleted: () => void;
}

export const ClinicalDeleteAttachmentModal: React.FC<ClinicalDeleteAttachmentModalProps> = ({
  isOpen,
  onClose,
  attachment,
  onDeleted,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !attachment) return null;

  const handleDelete = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await db.deleteClinicalAttachment(attachment.id);
      if (!res.success) {
        setErrorMessage(res.error || 'Erro ao excluir documento.');
        setIsSubmitting(false);
        return;
      }
      onDeleted();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro inesperado ao excluir documento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Excluir documento?</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            O arquivo &ldquo;{attachment.originalFilename}&rdquo; será removido do prontuário deste paciente. Esta ação não poderá ser desfeita.
          </p>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Excluindo...' : 'Excluir Documento'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
