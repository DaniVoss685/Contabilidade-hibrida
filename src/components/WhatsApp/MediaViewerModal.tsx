import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';

interface MediaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string | null;
  fileName?: string;
  mimeType?: string;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  onClose,
  mediaUrl,
  fileName = 'arquivo',
  mimeType = '',
}) => {
  if (!isOpen || !mediaUrl) return null;

  const isImage = mimeType.startsWith('image/') || mediaUrl.match(/\.(jpeg|jpg|png|webp|gif)/i);
  const isPdf = mimeType.includes('pdf') || mediaUrl.match(/\.pdf/i);
  const isVideo = mimeType.startsWith('video/') || mediaUrl.match(/\.(mp4|webm)/i);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = mediaUrl;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
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
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Baixar arquivo"
            >
              <Download className="w-4 h-4" />
            </button>
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Abrir em nova aba"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-slate-300 hover:text-rose-400 transition-colors cursor-pointer ml-2"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Media Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-slate-950/50">
          {isImage && (
            <img
              src={mediaUrl}
              alt={fileName}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-lg"
            />
          )}

          {isVideo && (
            <video
              src={mediaUrl}
              controls
              autoPlay
              className="max-h-[75vh] max-w-full rounded-lg shadow-lg"
            />
          )}

          {isPdf && (
            <iframe
              src={mediaUrl}
              title={fileName}
              className="w-full h-[75vh] rounded-lg border border-slate-800 bg-white"
            />
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
    </div>
  );
};
