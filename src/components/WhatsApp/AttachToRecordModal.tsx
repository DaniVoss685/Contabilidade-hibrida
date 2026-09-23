import React, { useState } from 'react';
import { X, FolderInput, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CustomSelect } from '../UI/CustomSelect';
import { DatePicker } from '../UI/DatePicker';
import { CLINICAL_ATTACHMENT_TYPE_OPTIONS } from '../../lib/clinicalAttachmentTypes';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';

export interface AttachToRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string;
  patientId: string;
  patientName: string;
  fileName: string;
  isImage: boolean;
  tenantId?: string;
  onAttached: () => void;
}

export const AttachToRecordModal: React.FC<AttachToRecordModalProps> = ({
  isOpen,
  onClose,
  messageId,
  patientId,
  patientName,
  fileName,
  isImage,
  tenantId,
  onAttached,
}) => {
  const [documentType, setDocumentType] = useState<string>(isImage ? 'OTHER' : 'DOCUMENT');
  const [description, setDescription] = useState('');
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await DentalWhatsAppService.attachMessageToPatientRecord({
      messageId,
      patientId,
      documentType,
      description,
      documentDate,
      tenantId,
    });

    if (!res.success) {
      setErrorMessage(res.error || 'Erro ao anexar documento ao prontuário.');
      setIsSubmitting(false);
      return;
    }

    if (res.alreadyAttached) {
      setSuccessMessage('Este documento já está anexado ao prontuário.');
    } else {
      setSuccessMessage(`Documento anexado ao prontuário de ${patientName}.`);
    }
    setIsSubmitting(false);
    onAttached();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        // Este modal é empilhado sobre o MediaViewerModal (que fecha incondicionalmente
        // em qualquer clique no seu próprio backdrop). Sem interromper a propagação aqui,
        // qualquer clique dentro deste modal — incluindo em popovers via Portal (DatePicker,
        // CustomSelect) e no próprio botão de submit — vaza para o backdrop do modal pai e
        // fecha o visualizador inteiro. Ver CLAUDE.md > WhatsApp → Patient Documents.
        e.stopPropagation();
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0">
              <FolderInput className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Anexar documento ao prontuário</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Paciente: <strong className="text-slate-700">{patientName}</strong>
              </p>
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

        {successMessage ? (
          <div className="p-6 space-y-5">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 truncate" title={fileName}>
              Arquivo: <strong className="text-slate-800">{fileName}</strong>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <CustomSelect
                label="Tipo de documento"
                required
                options={CLINICAL_ATTACHMENT_TYPE_OPTIONS}
                value={documentType}
                onChange={setDocumentType}
                placeholder="Selecione o tipo..."
              />
            </div>

            <div>
              <DatePicker
                label="Data do documento"
                required
                value={documentDate}
                onChange={setDocumentDate}
                placeholder="DD/MM/AAAA"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Descrição (opcional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
              />
            </div>

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
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
              >
                <FolderInput className="w-4 h-4" />
                <span>{isSubmitting ? 'Anexando...' : 'Anexar documento'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
