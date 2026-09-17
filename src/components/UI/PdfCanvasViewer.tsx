import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  ExternalLink,
  Download,
  AlertTriangle,
  Maximize2,
  Minimize2,
  FileCheck,
} from 'lucide-react';
import { AttachmentMetadata } from '../../types';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configuração do Worker local via Vite URL
try {
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  }
} catch (e) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

interface PdfCanvasViewerProps {
  file?: AttachmentMetadata | null;
  resolvedUrl?: string | null;
  displayName: string;
  onOpenInNewTab?: () => void;
  onDownload?: () => void;
}

export const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  file,
  resolvedUrl,
  displayName,
  onOpenInNewTab,
  onDownload,
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(0.9);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Calcula a escala para caber a guia inteira na tela (Fit to Page)
  const fitToPage = useCallback(async (docInstance?: any, customRotation?: number) => {
    const activeDoc = docInstance || pdfDoc;
    if (!activeDoc || !scrollAreaRef.current) return;

    try {
      const page = await activeDoc.getPage(pageNumber);
      const rot = customRotation !== undefined ? customRotation : rotation;
      const unscaledViewport = page.getViewport({ scale: 1.0, rotation: rot });

      const container = scrollAreaRef.current;
      const availWidth = Math.max(250, container.clientWidth - 40); // 20px padding cada lado
      const availHeight = Math.max(250, container.clientHeight - 40);

      const scaleW = availWidth / unscaledViewport.width;
      const scaleH = availHeight / unscaledViewport.height;

      // Para ver a guia inteira sem cortes na altura ou largura:
      const fitScale = Math.min(scaleW, scaleH);
      const targetScale = Number(Math.max(0.35, Math.min(1.8, fitScale)).toFixed(2));
      setScale(targetScale);
    } catch (e) {
      console.warn('[PdfCanvasViewer] Erro ao calcular Fit to Page:', e);
    }
  }, [pdfDoc, pageNumber, rotation]);

  // Ajusta à largura disponível (Fit Width)
  const fitToWidth = useCallback(async () => {
    if (!pdfDoc || !scrollAreaRef.current) return;
    try {
      const page = await pdfDoc.getPage(pageNumber);
      const unscaledViewport = page.getViewport({ scale: 1.0, rotation });
      const availWidth = Math.max(250, scrollAreaRef.current.clientWidth - 48);
      const scaleW = availWidth / unscaledViewport.width;
      const targetScale = Number(Math.max(0.4, Math.min(2.2, scaleW)).toFixed(2));
      setScale(targetScale);
    } catch (e) {
      console.warn('[PdfCanvasViewer] Erro ao calcular Fit to Width:', e);
    }
  }, [pdfDoc, pageNumber, rotation]);

  // Carrega o documento PDF a partir de base64 ou URL
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    setPdfDoc(null);
    setPageNumber(1);

    const loadDocument = async () => {
      try {
        let loadingTask: any = null;
        const source = file?.dataUrl || resolvedUrl;

        if (!source) {
          throw new Error('Nenhuma fonte de dados válida para o PDF.');
        }

        // 1. Se possuir base64 (dataUrl)
        if (typeof source === 'string' && source.startsWith('data:')) {
          try {
            const base64Data = source.split('base64,')[1] || '';
            const cleanBase64 = base64Data.replace(/[\r\n\s]/g, '');
            const binaryString = window.atob(cleanBase64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            loadingTask = pdfjsLib.getDocument({ data: bytes });
          } catch (b64Err) {
            console.warn('[PdfCanvasViewer] Falha no atob, tentando via fetch nativo:', b64Err);
            const resp = await fetch(source);
            const arrayBuffer = await resp.arrayBuffer();
            loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          }
        } else if (typeof source === 'string' && source.startsWith('blob:')) {
          // 2. Blob URL
          try {
            const resp = await fetch(source);
            const arrayBuffer = await resp.arrayBuffer();
            loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          } catch {
            loadingTask = pdfjsLib.getDocument({ url: source });
          }
        } else {
          // 3. URL externa HTTP/HTTPS
          try {
            const resp = await fetch(source);
            if (resp.ok) {
              const arrayBuffer = await resp.arrayBuffer();
              loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
            } else {
              loadingTask = pdfjsLib.getDocument({ url: source });
            }
          } catch {
            loadingTask = pdfjsLib.getDocument({ url: source });
          }
        }

        if (!loadingTask) {
          throw new Error('Nenhuma fonte de dados válida para o PDF.');
        }

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setIsLoading(false);

        // Auto-ajuste imediato para ver a guia inteira logo na abertura
        setTimeout(() => {
          fitToPage(doc, 0);
        }, 50);
      } catch (err: any) {
        if (isCancelled) return;
        console.error('[PdfCanvasViewer] Erro ao carregar PDF:', err);
        setErrorMessage(
          err?.message ||
            'Não foi possível renderizar este PDF no visualizador embutido devido a restrições do navegador.'
        );
        setIsLoading(false);
      }
    };

    loadDocument();

    return () => {
      isCancelled = true;
    };
  }, [file?.dataUrl, resolvedUrl]);

  // Renderiza a página atual no canvas
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      // Cancela renderização anterior em andamento
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }

      const page = await pdfDoc.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const viewport = page.getViewport({ scale, rotation });
      const context = canvas.getContext('2d');
      if (!context) return;

      // Resolução nítida para telas Retina / High DPI
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

      const renderContext = {
        canvasContext: context,
        viewport,
        transform,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('[PdfCanvasViewer] Aviso ao renderizar página:', err);
      }
    }
  }, [pdfDoc, pageNumber, scale, rotation]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Controles de Navegação e Zoom
  const handlePrevPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setPageNumber((prev) => Math.min(numPages, prev + 1));
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(2.8, Number((prev + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.35, Number((prev - 0.15).toFixed(2))));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Se houver erro no carregamento do PDF
  if (errorMessage) {
    return (
      <div className="flex-1 w-full flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full p-6 bg-white rounded-2xl border border-rose-200/80 shadow-xs text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Visualização Restrita pelo Navegador
            </h4>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              O navegador aplicou políticas de segurança ao arquivo. Você pode abri-lo diretamente ou fazer o download seguro:
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
            {onOpenInNewTab && (
              <button
                type="button"
                onClick={onOpenInNewTab}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir em Nova Aba</span>
              </button>
            )}

            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Arquivo</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col h-full overflow-hidden select-none bg-slate-100/90">
      {/* Barra de Ferramentas Superior Integrada (Fixa, sem cobrir o documento) */}
      <div className="w-full px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 shrink-0 z-10">
        {/* Esquerda: Paginação */}
        <div className="flex items-center gap-2">
          {numPages > 1 && (
            <div className="flex items-center gap-1 pr-3 border-r border-slate-200">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={pageNumber <= 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-semibold text-xs text-slate-600 min-w-[55px] text-center">
                {pageNumber} de {numPages}
              </span>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={pageNumber >= numPages}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                title="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
            <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="truncate max-w-[220px]" title={displayName}>
              Visualização Direta
            </span>
          </div>
        </div>

        {/* Centro: Controles de Escala & Zoom */}
        <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 0.35}
            className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 disabled:opacity-30 cursor-pointer transition-colors"
            title="Diminuir zoom (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-xs font-bold text-slate-700 min-w-[46px] text-center">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 2.8}
            className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 disabled:opacity-30 cursor-pointer transition-colors"
            title="Aumentar zoom (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-slate-200 mx-0.5" />

          {/* Botão para Ver a Guia Inteira (Fit to Page) */}
          <button
            type="button"
            onClick={() => fitToPage()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white text-slate-700 hover:text-emerald-700 font-medium text-[11px] cursor-pointer transition-colors"
            title="Ajustar para ver a guia completa na tela"
          >
            <Minimize2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden md:inline">Ver Guia Inteira</span>
          </button>

          {/* Botão Ajustar à Largura */}
          <button
            type="button"
            onClick={fitToWidth}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white text-slate-700 hover:text-slate-900 font-medium text-[11px] cursor-pointer transition-colors"
            title="Ajustar documento à largura disponível"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Largura</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-200 mx-0.5" />

          {/* Botão Girar 90 graus */}
          <button
            type="button"
            onClick={handleRotate}
            className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 cursor-pointer transition-colors"
            title="Girar documento 90°"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Área de Visualização com Scroll (topo sempre visível, sem sobreposição) */}
      <div
        ref={scrollAreaRef}
        className="flex-1 w-full overflow-auto p-4 sm:p-6 flex flex-col items-center justify-start min-h-0 relative"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 text-slate-500 gap-3 m-auto">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            <span className="text-xs font-semibold">Renderizando guia em alta definição...</span>
          </div>
        ) : (
          <div className="my-auto sm:my-2 shadow-2xl rounded-lg overflow-hidden border border-slate-300 bg-white transition-all shrink-0">
            <canvas ref={canvasRef} className="block" />
          </div>
        )}
      </div>
    </div>
  );
};

