import React, { useMemo, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Download,
  FileText,
  ImageIcon,
  AlertCircle,
} from 'lucide-react';
import { AttachmentMetadata } from '../../types';
import { Portal } from './Portal';

export interface ReceiptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file?: AttachmentMetadata | null;
  fallbackName?: string;
}

export const ReceiptViewerModal: React.FC<ReceiptViewerModalProps> = ({
  isOpen,
  onClose,
  file,
  fallbackName,
}) => {
  const displayName = file?.name || fallbackName || 'Comprovante';

  const isPdf = useMemo(() => {
    const ext = file?.extension?.toLowerCase();
    const name = displayName.toLowerCase();
    const type = file?.type?.toLowerCase() || '';
    return ext === 'pdf' || name.endsWith('.pdf') || type.includes('pdf');
  }, [file, displayName]);

  // Cria Blob URL temporário e seguro para arquivos PDF em base64 (dataUrl)
  const resolvedUrl = useMemo(() => {
    if (!isOpen) return null;
    if (file?.signedUrl) return file.signedUrl;
    if (file?.url) return file.url;

    if (file?.dataUrl) {
      if (isPdf) {
        try {
          const parts = file.dataUrl.split(';base64,');
          if (parts.length === 2) {
            const contentType = parts[0].split(':')[1] || 'application/pdf';
            const raw = window.atob(parts[1]);
            const rawLength = raw.length;
            const uInt8Array = new Uint8Array(rawLength);
            for (let i = 0; i < rawLength; ++i) {
              uInt8Array[i] = raw.charCodeAt(i);
            }
            const blob = new Blob([uInt8Array], { type: contentType });
            return URL.createObjectURL(blob);
          }
        } catch (e) {
          console.warn('Erro ao processar base64 do PDF:', e);
        }
      }
      return file.dataUrl;
    }

    return null;
  }, [isOpen, file, isPdf]);

  // Limpeza de Blob URLs ao desmontar/fechar para evitar vazamento de memória
  useEffect(() => {
    return () => {
      if (resolvedUrl && resolvedUrl.startsWith('blob:')) {
        URL.revokeObjectURL(resolvedUrl);
      }
    };
  }, [resolvedUrl]);

  // Fechar com tecla ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOpenInNewTab = () => {
    if (!resolvedUrl) return;
    window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = () => {
    if (!resolvedUrl) return;
    const a = document.createElement('a');
    a.href = resolvedUrl;
    a.download = displayName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100000] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho do Modal */}
          <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  isPdf
                    ? 'bg-rose-50 border-rose-200/70 text-rose-600'
                    : 'bg-emerald-50 border-emerald-200/70 text-emerald-600'
                }`}
              >
                {isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 truncate" title={displayName}>
                    {displayName}
                  </h3>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-bold">
                    {isPdf ? 'PDF' : file?.extension?.toUpperCase() || 'ANEXO'}
                  </span>
                </div>
                {file?.formattedSize && (
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{file.formattedSize}</p>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {resolvedUrl && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenInNewTab}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                    title="Abrir em nova aba"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Nova Aba</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
                    title="Baixar comprovante"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Baixar</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer ml-1"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Corpo de Visualização */}
          <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-900/5 flex items-center justify-center min-h-[350px]">
            {resolvedUrl ? (
              isPdf ? (
                <iframe
                  src={resolvedUrl}
                  title={`Visualizador de ${displayName}`}
                  className="w-full h-[70vh] rounded-xl border border-slate-200 bg-white shadow-xs"
                />
              ) : (
                <div className="flex items-center justify-center max-h-[70vh] overflow-auto">
                  <img
                    src={resolvedUrl}
                    alt={displayName}
                    className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-xs"
                  />
                </div>
              )
            ) : (
              /* Caso o anexo tenha sido registrado anteriormente sem o arquivo (apenas com o nome) */
              <div className="max-w-md w-full p-6 bg-white rounded-2xl border border-amber-200/80 shadow-xs text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900">
                  Arquivo físico não gravado nesta versão
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  O comprovante <span className="font-semibold text-slate-800 font-mono">"{displayName}"</span> foi registrado anteriormente apenas pelo nome do arquivo.
                </p>
                <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                  💡 Para visualizar o documento completo aqui, basta abrir a edição desta despesa e anexar o arquivo novamente.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};
