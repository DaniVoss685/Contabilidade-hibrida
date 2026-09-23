import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, ExternalLink, Loader2, AlertCircle, RotateCw, FolderInput, CheckCircle2 } from 'lucide-react';
import { DentalWhatsAppService } from '../../services/dentalWhatsAppService';
import { AttachToRecordModal } from './AttachToRecordModal';
import { db } from '../../lib/db';

export interface MediaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl?: string | null;
  storagePath?: string | null;
  tenantId?: string;
  fileName?: string;
  mimeType?: string;
  /** Contexto para o fluxo "Anexar ao prontuário" (opcional). */
  messageId?: string | null;
  isGroup?: boolean;
  patientId?: string | null;
  patientName?: string | null;
  canAttachToRecord?: boolean;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  onClose,
  mediaUrl,
  storagePath,
  tenantId,
  fileName = 'arquivo',
  mimeType = '',
  messageId,
  isGroup = false,
  patientId,
  patientName,
  canAttachToRecord = false,
}) => {
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBlobData, setPdfBlobData] = useState<Blob | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const activeBlobUrlRef = useRef<string | null>(null);

  const isPdf = Boolean(
    (mimeType && mimeType.includes('pdf')) ||
    (fileName && fileName.toLowerCase().endsWith('.pdf')) ||
    (mediaUrl && mediaUrl.match(/\.pdf/i)) ||
    (storagePath && storagePath.toLowerCase().endsWith('.pdf'))
  );

  const isImage = Boolean(
    !isPdf && (
      (mimeType && mimeType.startsWith('image/')) ||
      (mediaUrl && mediaUrl.match(/\.(jpeg|jpg|png|webp|gif)/i)) ||
      (fileName && fileName.match(/\.(jpeg|jpg|png|webp|gif)$/i))
    )
  );

  const isVideo = Boolean(
    !isPdf && (
      (mimeType && mimeType.startsWith('video/')) ||
      (mediaUrl && mediaUrl.match(/\.(mp4|webm)/i)) ||
      (fileName && fileName.match(/\.(mp4|webm)$/i))
    )
  );

  // Anexar ao Prontuário: só é elegível para documento/imagem de contato individual (nunca grupo)
  const canOfferAttach = Boolean(messageId) && !isGroup && (isPdf || isImage);

  const [showAttachModal, setShowAttachModal] = useState(false);
  const [alreadyAttachedDoc, setAlreadyAttachedDoc] = useState<{ id: string; originalFilename: string } | null>(null);

  const refreshAttachedCheck = useCallback(() => {
    if (!canOfferAttach || !patientId || !tenantId || !messageId) {
      setAlreadyAttachedDoc(null);
      return;
    }
    DentalWhatsAppService.getAttachedClinicalDocument({ tenantId, patientId, messageId }).then(setAlreadyAttachedDoc);
  }, [canOfferAttach, patientId, tenantId, messageId]);

  // A Edge Function dental-whatsapp-attach-document insere via service_role no servidor,
  // fora do client-side `db` — sem recarregar o cache local, o documento só apareceria em
  // Pacientes > Documentos depois de um F5/login (mesma classe de bug já corrigida para os
  // Alertas de Saúde). refreshAttachedCheck cobre só o indicador "já anexado" deste viewer.
  const handleAttached = useCallback(() => {
    refreshAttachedCheck();
    db.refreshClinicalAttachments();
  }, [refreshAttachedCheck]);

  useEffect(() => {
    if (isOpen) {
      refreshAttachedCheck();
    } else {
      setAlreadyAttachedDoc(null);
      setShowAttachModal(false);
    }
  }, [isOpen, refreshAttachedCheck]);

  // Limpeza de Blob URLs para evitar memory leak
  const cleanupActiveBlob = useCallback(() => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    cleanupActiveBlob();
    setPdfBlobUrl(null);
    setPdfBlobData(null);
    setPdfError(null);
    setIsLoadingPdf(false);
    onClose();
  }, [cleanupActiveBlob, onClose]);

  // Carrega Blob seguro do PDF via Supabase Storage SDK ou fallback
  const loadPdfBlob = useCallback(async () => {
    if (!isOpen || !isPdf) return;

    setIsLoadingPdf(true);
    setPdfError(null);

    // Revoga URL anterior se houver
    cleanupActiveBlob();
    setPdfBlobUrl(null);
    setPdfBlobData(null);

    try {
      const res = await DentalWhatsAppService.resolveDocumentBlob({
        storagePath: storagePath || null,
        mediaUrl: mediaUrl || null,
        tenantId: tenantId || undefined,
        expectedMimeType: mimeType || 'application/pdf',
        fileName,
      });

      if (res.error || !res.blob) {
        console.warn('[MediaViewerModal] Falha ao resolver Blob de PDF:', res.error);
        setPdfError(res.error || 'Não foi possível carregar a visualização deste documento.');
        setIsLoadingPdf(false);
        return;
      }

      // Cria Object URL local no navegador (mesma origem -> zero ERR_BLOCKED_BY_CSP)
      const objectUrl = URL.createObjectURL(res.blob);
      activeBlobUrlRef.current = objectUrl;
      setPdfBlobData(res.blob);
      setPdfBlobUrl(objectUrl);
      setIsLoadingPdf(false);
    } catch (err: any) {
      console.error('[MediaViewerModal] Exceção ao resolver PDF:', err);
      setPdfError(err?.message || 'Erro inesperado ao processar documento.');
      setIsLoadingPdf(false);
    }
  }, [isOpen, isPdf, storagePath, mediaUrl, tenantId, mimeType, fileName, cleanupActiveBlob]);

  // Dispara carregamento ao abrir ou mudar referências de documento
  useEffect(() => {
    if (isOpen && isPdf) {
      loadPdfBlob();
    } else {
      cleanupActiveBlob();
      setPdfBlobUrl(null);
      setPdfBlobData(null);
      setPdfError(null);
      setIsLoadingPdf(false);
    }

    return () => {
      cleanupActiveBlob();
    };
  }, [isOpen, isPdf, storagePath, mediaUrl, loadPdfBlob, cleanupActiveBlob]);

  // Tecla Escape para fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen || (!mediaUrl && !storagePath)) return null;

  const handleDownload = () => {
    if (pdfBlobData) {
      const tempUrl = URL.createObjectURL(pdfBlobData);
      const a = document.createElement('a');
      a.href = tempUrl;
      a.download = fileName || 'documento.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(tempUrl), 1000);
      return;
    }

    if (mediaUrl) {
      const a = document.createElement('a');
      a.href = mediaUrl;
      a.download = fileName || 'arquivo';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleOpenInNewTab = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, '_blank');
      return;
    }

    if (mediaUrl) {
      window.open(mediaUrl, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="relative max-w-5xl w-full max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-sm font-semibold text-slate-200 truncate">{fileName}</span>
          </div>
          <div className="flex items-center gap-2">
            {canOfferAttach && patientId && canAttachToRecord && (
              alreadyAttachedDoc ? (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 text-xs font-semibold"
                  title="Este documento já está anexado ao prontuário."
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Já anexado ao prontuário</span>
                </span>
              ) : (
                <button
                  onClick={() => setShowAttachModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-700/80 hover:bg-teal-600 text-white transition-colors cursor-pointer text-xs font-semibold"
                  title="Anexar ao prontuário"
                  aria-label="Anexar ao prontuário"
                >
                  <FolderInput className="w-4 h-4" />
                  <span className="hidden sm:inline">Anexar ao prontuário</span>
                </button>
              )
            )}
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Baixar arquivo"
              aria-label="Baixar arquivo"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleOpenInNewTab}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Abrir em nova aba"
              aria-label="Abrir em nova aba"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-slate-300 hover:text-rose-400 transition-colors cursor-pointer ml-2"
              title="Fechar"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {canOfferAttach && !patientId && (
          <div className="px-6 py-2.5 bg-amber-950/30 border-b border-amber-900/40 text-amber-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Vincule este contato a um paciente para anexar o documento ao prontuário.</span>
          </div>
        )}

        {/* Media Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-slate-950/50 min-h-[360px]">
          {isImage && mediaUrl && (
            <img
              src={mediaUrl}
              alt={fileName}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-lg"
            />
          )}

          {isVideo && mediaUrl && (
            <video
              src={mediaUrl}
              controls
              autoPlay
              className="max-h-[75vh] max-w-full rounded-lg shadow-lg"
            />
          )}

          {isPdf && (
            <>
              {isLoadingPdf && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                  <p className="text-sm font-medium">Carregando documento...</p>
                </div>
              )}

              {!isLoadingPdf && pdfError && (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center max-w-md mx-auto">
                  <div className="w-12 h-12 rounded-full bg-rose-900/30 border border-rose-700/50 flex items-center justify-center text-rose-400 mb-3">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h5 className="text-base font-bold text-white mb-1">
                    Não foi possível carregar a visualização deste documento.
                  </h5>
                  <p className="text-xs text-slate-400 mb-6">
                    {pdfError || 'O arquivo está seguro no armazenamento, mas não pôde ser renderizado no navegador.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={loadPdfBlob}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Tentar novamente</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
                    >
                      <Download className="w-4 h-4" />
                      <span>Baixar arquivo</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenInNewTab}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Abrir em nova guia</span>
                    </button>
                  </div>
                </div>
              )}

              {!isLoadingPdf && !pdfError && pdfBlobUrl && (
                <iframe
                  src={pdfBlobUrl}
                  title={fileName}
                  className="w-full h-[75vh] rounded-lg border border-slate-800 bg-white"
                />
              )}
            </>
          )}

          {!isImage && !isVideo && !isPdf && (
            <div className="text-center py-16 px-4">
              <p className="text-slate-400 text-sm mb-4">Pré-visualização não disponível para este tipo de arquivo.</p>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl text-xs flex items-center gap-2 mx-auto cursor-pointer shadow-md"
              >
                <Download className="w-4 h-4" />
                Baixar {fileName}
              </button>
            </div>
          )}
        </div>
      </div>

      {showAttachModal && messageId && patientId && (
        <AttachToRecordModal
          isOpen={showAttachModal}
          onClose={() => setShowAttachModal(false)}
          messageId={messageId}
          patientId={patientId}
          patientName={patientName || 'Paciente'}
          fileName={fileName}
          isImage={isImage}
          tenantId={tenantId}
          onAttached={handleAttached}
        />
      )}
    </div>
  );
};
