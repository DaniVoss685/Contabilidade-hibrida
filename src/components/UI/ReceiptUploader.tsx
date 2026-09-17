import React, { useState, useRef, useCallback } from 'react';
import {
  UploadCloud,
  FileText,
  ImageIcon,
  Trash2,
  ExternalLink,
  Eye,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import { AttachmentMetadata, AllowedReceiptExtension } from '../../types';
import { ConfirmDialog } from './ConfirmDialog';
import { Portal } from './Portal';
import { ReceiptViewerModal } from './ReceiptViewerModal';

export interface ReceiptUploaderProps {
  file?: AttachmentMetadata | null;
  onFileChange: (file: AttachmentMetadata | null) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
  maxSizeMb?: number; // padrão: 5
  allowedExtensions?: AllowedReceiptExtension[];
  className?: string;
}

const DEFAULT_ALLOWED_EXTENSIONS: AllowedReceiptExtension[] = ['pdf', 'png', 'jpg', 'jpeg'];
const DEFAULT_MAX_SIZE_MB = 5;

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ReceiptUploader: React.FC<ReceiptUploaderProps> = ({
  file,
  onFileChange,
  disabled = false,
  label = 'Comprovante / Anexo',
  hint = 'PDF, PNG, JPG ou JPEG até 5MB',
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
  allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Limpa mensagens de erro
  const clearError = () => setErrorMessage(null);

  // Validação e processamento do arquivo
  const processFile = useCallback(
    (selectedFile: File) => {
      clearError();

      // 1. Validação de extensão
      const extMatch = selectedFile.name.split('.').pop()?.toLowerCase() as AllowedReceiptExtension | undefined;
      if (!extMatch || !allowedExtensions.includes(extMatch)) {
        setErrorMessage(
          `Formato inválido (.${extMatch || 'desconhecido'}). Envie apenas arquivos ${allowedExtensions.map((e) => e.toUpperCase()).join(', ')}.`
        );
        return;
      }

      // 2. Validação de tamanho máximo
      const maxBytes = maxSizeMb * 1024 * 1024;
      if (selectedFile.size > maxBytes) {
        setErrorMessage(
          `O arquivo excede o limite máximo permitido de ${maxSizeMb}MB (tamanho atual: ${formatFileSize(selectedFile.size)}).`
        );
        return;
      }

      // 3. Leitura assíncrona do payload
      setIsReading(true);
      const reader = new FileReader();

      reader.onload = () => {
        setIsReading(false);
        const dataUrl = reader.result as string;

        const metadata: AttachmentMetadata = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: selectedFile.name,
          size: selectedFile.size,
          formattedSize: formatFileSize(selectedFile.size),
          type: selectedFile.type || (extMatch === 'pdf' ? 'application/pdf' : `image/${extMatch}`),
          extension: extMatch,
          dataUrl,
          uploadedAt: new Date().toISOString(),
        };

        onFileChange(metadata);
      };

      reader.onerror = () => {
        setIsReading(false);
        setErrorMessage('Falha ao processar o arquivo. Tente novamente.');
      };

      reader.readAsDataURL(selectedFile);
    },
    [allowedExtensions, maxSizeMb, onFileChange]
  );

  // Handlers para Drag & Drop
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || file) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || file) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleNativeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
      // Reseta o input nativo para permitir selecionar o mesmo arquivo novamente se for o caso
      e.target.value = '';
    }
  };

  // Detecção robusta se o anexo é um PDF
  const isPdf = Boolean(
    file?.extension?.toLowerCase() === 'pdf' ||
    file?.name?.toLowerCase().endsWith('.pdf') ||
    file?.type?.includes('pdf')
  );

  // Abertura segura do comprovante em nova aba
  const handleOpenExternal = () => {
    if (!file) return;

    if (file.url) {
      window.open(file.url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (file.signedUrl) {
      window.open(file.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (file.dataUrl) {
      if (isPdf) {
        try {
          const parts = file.dataUrl.split(';base64,');
          const contentType = parts[0].split(':')[1] || 'application/pdf';
          const raw = window.atob(parts[1]);
          const rawLength = raw.length;
          const uInt8Array = new Uint8Array(rawLength);

          for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
          }

          const blob = new Blob([uInt8Array], { type: contentType });
          const blobUrl = URL.createObjectURL(blob);
          window.open(blobUrl, '_blank', 'noopener,noreferrer');
          return;
        } catch {
          window.open(file.dataUrl, '_blank', 'noopener,noreferrer');
          return;
        }
      }
      window.open(file.dataUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Se não tiver dataUrl/url (registro legado), abre o modal que já dá orientação clara
    setShowViewerModal(true);
  };

  // Confirmação de remoção
  const handleConfirmDelete = () => {
    onFileChange(null);
    clearError();
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Label & Hint */}
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-700">
            {label}
          </label>
          {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
        </div>
      )}

      {/* Input nativo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        disabled={disabled || Boolean(file) || isReading}
        accept={allowedExtensions.map((e) => (e === 'pdf' ? '.pdf,application/pdf' : `.${e},image/${e}`)).join(',')}
        onChange={handleNativeInputChange}
        className="hidden"
      />

      {/* ESTADO 1: Comprovante Anexado */}
      {file ? (
        <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-between gap-3 transition-all hover:border-slate-300">
          <div className="flex items-center gap-3 min-w-0">
            {/* Ícone ou Miniatura */}
            {isPdf ? (
              <div
                className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200/70 flex items-center justify-center flex-shrink-0 text-rose-600 cursor-pointer hover:bg-rose-100 transition-colors"
                onClick={() => setShowViewerModal(true)}
                title="Clique para visualizar o comprovante PDF"
              >
                <FileText className="w-5 h-5" />
              </div>
            ) : file.dataUrl ? (
              <div
                className="w-10 h-10 rounded-xl border border-slate-200 overflow-hidden flex-shrink-0 cursor-pointer bg-slate-100 hover:opacity-90 transition-opacity"
                onClick={() => setShowViewerModal(true)}
                title="Clique para ampliar a imagem"
              >
                <img
                  src={file.dataUrl}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div
                className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/70 flex items-center justify-center flex-shrink-0 text-blue-600 cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => setShowViewerModal(true)}
                title="Clique para visualizar o comprovante"
              >
                <ImageIcon className="w-5 h-5" />
              </div>
            )}

            {/* Metadados */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-xs font-bold text-slate-800 truncate cursor-pointer hover:underline"
                  title={file.name}
                  onClick={() => setShowViewerModal(true)}
                >
                  {file.name}
                </span>
                <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-bold">
                  {isPdf ? 'PDF' : file.extension || 'ARQUIVO'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                {file.formattedSize || formatFileSize(file.size)}
              </p>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Botão Visualizar (Olhinho unificado para PDF e Imagem) */}
            <button
              type="button"
              onClick={() => setShowViewerModal(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
              title="Visualizar comprovante"
            >
              <Eye className="w-4 h-4" />
            </button>

            {/* Botão Abrir em Nova Aba */}
            <button
              type="button"
              onClick={handleOpenExternal}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
              title="Abrir comprovante em nova aba"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            {/* Botão Remover (com confirmação) */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
              title="Remover anexo"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* ESTADO 2: Dropzone de Upload */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && !isReading && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-5 sm:p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
            disabled
              ? 'opacity-60 cursor-not-allowed bg-slate-50/50 border-slate-200'
              : isDragging
              ? 'border-teal-500 bg-teal-50/30 scale-[0.99]'
              : 'border-slate-300 hover:border-teal-500/70 bg-slate-50/50 hover:bg-teal-50/10'
          }`}
        >
          {isReading ? (
            <div className="flex flex-col items-center py-2">
              <Loader2 className="w-7 h-7 text-teal-600 animate-spin mb-2" />
              <span className="text-xs font-semibold text-slate-700">
                Lendo e validando comprovante...
              </span>
            </div>
          ) : (
            <>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 transition-colors ${
                  isDragging ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <UploadCloud className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-slate-700">
                <span className="text-teal-600 font-bold hover:underline">
                  Clique para selecionar
                </span>{' '}
                ou arraste o comprovante aqui
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Formatos aceitos: {allowedExtensions.map((e) => e.toUpperCase()).join(', ')} (máx. {maxSizeMb}MB)
              </p>
            </>
          )}
        </div>
      )}

      {/* Alerta de Erro de Validação */}
      {errorMessage && (
        <div className="mt-2.5 p-2.5 rounded-xl bg-rose-50 border border-rose-200/80 flex items-start gap-2 text-rose-700 text-xs animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
          <span className="flex-1 leading-relaxed">{errorMessage}</span>
          <button
            type="button"
            onClick={clearError}
            className="text-rose-500 hover:text-rose-800 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Diálogo de Confirmação de Remoção do Anexo */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Remover Comprovante?"
        description={`Tem certeza que deseja remover o arquivo "${file?.name}"? Esta ação removerá o anexo deste lançamento.`}
        confirmLabel="Sim, remover"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />

      {/* Modal Unificado de Visualização de Comprovantes (PDF e Imagens) */}
      <ReceiptViewerModal
        isOpen={showViewerModal}
        onClose={() => setShowViewerModal(false)}
        file={file}
      />
    </div>
  );
};
