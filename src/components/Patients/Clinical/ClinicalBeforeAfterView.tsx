import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Patient, ClinicalBeforeAfterPair, ClinicalAttachment } from '../../../types';
import { db } from '../../../lib/db';
import { uploadClinicalAttachment, validateClinicalFile } from '../../../lib/storageService';
import { useResolvedFileUrl } from '../../../hooks/useResolvedFileUrl';
import { CustomSelect, SelectOption } from '../../UI/CustomSelect';
import { DatePicker } from '../../UI/DatePicker';
import { ClinicalDeleteBeforeAfterModal } from './ClinicalDeleteBeforeAfterModal';
import {
  Images,
  PlusCircle,
  Calendar,
  Trash2,
  Columns,
  Layers,
  Sparkles,
  X,
  UploadCloud,
  FileImage,
  AlertCircle,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
  Check,
  Move,
  Loader2,
} from 'lucide-react';

interface ClinicalBeforeAfterViewProps {
  patient: Patient;
  pairs: ClinicalBeforeAfterPair[];
  attachments: ClinicalAttachment[];
  onReload: () => void;
}

interface PairTransforms {
  beforeX: number;
  beforeY: number;
  beforeZoom: number;
  afterX: number;
  afterY: number;
  afterZoom: number;
}

export const ClinicalBeforeAfterView: React.FC<ClinicalBeforeAfterViewProps> = ({
  patient,
  pairs,
  attachments,
  onReload,
}) => {
  const [isNewPairModalOpen, setIsNewPairModalOpen] = useState(false);
  const [pairToDelete, setPairToDelete] = useState<ClinicalBeforeAfterPair | null>(null);
  const [sliderPositions, setSliderPositions] = useState<Record<string, number>>({});
  const [viewModes, setViewModes] = useState<Record<string, 'side-by-side' | 'slider'>>({});
  const [fullscreenPairId, setFullscreenPairId] = useState<string | null>(null);

  // Modo de ajuste de enquadramento: qual par e qual foto (antes ou depois) está sendo ajustada
  const [adjustTarget, setAdjustTarget] = useState<{ pairId: string; target: 'before' | 'after' } | null>(null);
  const [transforms, setTransforms] = useState<Record<string, PairTransforms>>({});
  const [isSavingTransform, setIsSavingTransform] = useState(false);

  // Controle de arrasto do divisor (Pointer Events com Pointer Capture)
  const [draggingDividerPairId, setDraggingDividerPairId] = useState<string | null>(null);

  // Controle de arrasto de pan da imagem durante o ajuste
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);

  // Formulário do novo par
  const [title, setTitle] = useState('');
  const [procedureName, setProcedureName] = useState('');
  const [observation, setObservation] = useState('');
  const [beforeDate, setBeforeDate] = useState(new Date().toISOString().split('T')[0]);
  const [afterDate, setAfterDate] = useState(new Date().toISOString().split('T')[0]);
  const [beforeAttachmentId, setBeforeAttachmentId] = useState('');
  const [afterAttachmentId, setAfterAttachmentId] = useState('');
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sincronizar posições e transformações quando a lista de pares carregar
  useEffect(() => {
    const initialPositions: Record<string, number> = {};
    const initialTransforms: Record<string, PairTransforms> = {};

    pairs.forEach((p) => {
      initialPositions[p.id] = p.dividerPosition ?? 50;
      initialTransforms[p.id] = {
        beforeX: p.beforePositionX ?? 0,
        beforeY: p.beforePositionY ?? 0,
        beforeZoom: p.beforeZoom ?? 1,
        afterX: p.afterPositionX ?? 0,
        afterY: p.afterPositionY ?? 0,
        afterZoom: p.afterZoom ?? 1,
      };
    });

    setSliderPositions((prev) => ({ ...initialPositions, ...prev }));
    setTransforms((prev) => ({ ...initialTransforms, ...prev }));
  }, [pairs]);

  // Fechar fullscreen com ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenPairId(null);
        setAdjustTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const availablePhotos = attachments.filter((a) => a.mimeType.startsWith('image/'));

  const photoOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'Fazer upload de nova foto abaixo' },
    ...availablePhotos.map((p) => ({
      value: p.id,
      label: p.originalFilename,
      description: p.caption || (p.attachmentType === 'PHOTO_BEFORE' ? 'Foto de Antes' : 'Foto de Depois'),
    })),
  ], [availablePhotos]);

  // Helper para obter transformações de um par com valores padrão seguros
  const getPairTransform = (pairId: string): PairTransforms => {
    return (
      transforms[pairId] || {
        beforeX: 0,
        beforeY: 0,
        beforeZoom: 1,
        afterX: 0,
        afterY: 0,
        afterZoom: 1,
      }
    );
  };

  // Salvar transformações do par no banco e no estado
  const handleSaveTransforms = async (pairId: string) => {
    const t = getPairTransform(pairId);
    const divPos = sliderPositions[pairId] ?? 50;

    setIsSavingTransform(true);
    try {
      await db.updateBeforeAfterPair(pairId, {
        beforePositionX: t.beforeX,
        beforePositionY: t.beforeY,
        beforeZoom: t.beforeZoom,
        afterPositionX: t.afterX,
        afterPositionY: t.afterY,
        afterZoom: t.afterZoom,
        dividerPosition: divPos,
      });
      setAdjustTarget(null);
    } catch (e) {
      console.error('Erro ao salvar transformações:', e);
    } finally {
      setIsSavingTransform(false);
    }
  };

  // Redefinir enquadramento do par (reset zoom e pan)
  const handleResetTransforms = async (pairId: string, target?: 'before' | 'after') => {
    setTransforms((prev) => {
      const current = prev[pairId] || {
        beforeX: 0,
        beforeY: 0,
        beforeZoom: 1,
        afterX: 0,
        afterY: 0,
        afterZoom: 1,
      };

      if (target === 'before') {
        return {
          ...prev,
          [pairId]: { ...current, beforeX: 0, beforeY: 0, beforeZoom: 1 },
        };
      }
      if (target === 'after') {
        return {
          ...prev,
          [pairId]: { ...current, afterX: 0, afterY: 0, afterZoom: 1 },
        };
      }
      return {
        ...prev,
        [pairId]: {
          beforeX: 0,
          beforeY: 0,
          beforeZoom: 1,
          afterX: 0,
          afterY: 0,
          afterZoom: 1,
        },
      };
    });
  };

  // Alterar zoom de uma imagem
  const handleZoomChange = (pairId: string, target: 'before' | 'after', deltaOrAbsolute: number, isAbsolute = false) => {
    setTransforms((prev) => {
      const current = prev[pairId] || {
        beforeX: 0,
        beforeY: 0,
        beforeZoom: 1,
        afterX: 0,
        afterY: 0,
        afterZoom: 1,
      };

      if (target === 'before') {
        const nextZoom = isAbsolute
          ? Math.max(1, Math.min(3, deltaOrAbsolute))
          : Math.max(1, Math.min(3, current.beforeZoom + deltaOrAbsolute));
        return {
          ...prev,
          [pairId]: { ...current, beforeZoom: Number(nextZoom.toFixed(2)) },
        };
      } else {
        const nextZoom = isAbsolute
          ? Math.max(1, Math.min(3, deltaOrAbsolute))
          : Math.max(1, Math.min(3, current.afterZoom + deltaOrAbsolute));
        return {
          ...prev,
          [pairId]: { ...current, afterZoom: Number(nextZoom.toFixed(2)) },
        };
      }
    });
  };

  // Pointer Events para o Divisor do Slider (Drag Seguro com Pointer Capture)
  const handleDividerPointerDown = (pairId: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setDraggingDividerPairId(pairId);
  };

  const handleDividerPointerMove = (pairId: string, containerEl: HTMLDivElement | null, e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingDividerPairId !== pairId || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = Math.round((x / rect.width) * 100);
    setSliderPositions((prev) => ({ ...prev, [pairId]: percent }));
  };

  const handleDividerPointerUp = async (pairId: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingDividerPairId === pairId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingDividerPairId(null);
      // Salvar posição do divisor de forma assíncrona discreta
      const finalPos = sliderPositions[pairId] ?? 50;
      await db.updateBeforeAfterPair(pairId, { dividerPosition: finalPos });
    }
  };

  // Pan (arrasto) da imagem no modo de ajuste
  const handlePanPointerDown = (pairId: string, target: 'before' | 'after', e: React.PointerEvent<HTMLDivElement>) => {
    if (!adjustTarget || adjustTarget.pairId !== pairId || adjustTarget.target !== target) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const t = getPairTransform(pairId);
    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: target === 'before' ? t.beforeX : t.afterX,
      startY: target === 'before' ? t.beforeY : t.afterY,
    };
    setIsPanning(true);
  };

  const handlePanPointerMove = (pairId: string, target: 'before' | 'after', e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;
    const deltaX = e.clientX - panStartRef.current.clientX;
    const deltaY = e.clientY - panStartRef.current.clientY;

    setTransforms((prev) => {
      const current = prev[pairId] || {
        beforeX: 0,
        beforeY: 0,
        beforeZoom: 1,
        afterX: 0,
        afterY: 0,
        afterZoom: 1,
      };

      if (target === 'before') {
        return {
          ...prev,
          [pairId]: {
            ...current,
            beforeX: Math.round(panStartRef.current!.startX + deltaX),
            beforeY: Math.round(panStartRef.current!.startY + deltaY),
          },
        };
      } else {
        return {
          ...prev,
          [pairId]: {
            ...current,
            afterX: Math.round(panStartRef.current!.startX + deltaX),
            afterY: Math.round(panStartRef.current!.startY + deltaY),
          },
        };
      }
    });
  };

  const handlePanPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setIsPanning(false);
      panStartRef.current = null;
    }
  };

  const handleDeletePair = (pair: ClinicalBeforeAfterPair) => {
    setPairToDelete(pair);
  };

  const handleCreatePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('Informe o título do comparativo.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const activeTenant = (db as any).activeTenantId || 'tenant_demo';
      const user = db.getUser();

      let finalBeforeId = beforeAttachmentId;
      let finalAfterId = afterAttachmentId;

      // Se enviou novo arquivo para o ANTES
      if (beforeFile) {
        const valBefore = validateClinicalFile(beforeFile);
        if (!valBefore.valid) {
          setErrorMessage(`Foto de Antes inválida: ${valBefore.error}`);
          setIsSubmitting(false);
          return;
        }
        const upRes = await uploadClinicalAttachment(beforeFile, activeTenant, patient.id);
        if (upRes.success && upRes.data) {
          const newAtt = await db.addClinicalAttachment({
            tenantId: activeTenant,
            patientId: patient.id,
            storagePath: upRes.data.storagePath,
            originalFilename: upRes.data.originalFilename,
            mimeType: upRes.data.mimeType,
            sizeBytes: upRes.data.sizeBytes,
            attachmentType: 'PHOTO_BEFORE',
            caption: `Antes: ${title}`,
            date: beforeDate,
            procedureName,
            createdBy: user?.id || 'usr_01',
            signedUrl: upRes.data.signedUrl,
          });
          if (newAtt.attachment) {
            finalBeforeId = newAtt.attachment.id;
          }
        }
      }

      // Se enviou novo arquivo para o DEPOIS
      if (afterFile) {
        const valAfter = validateClinicalFile(afterFile);
        if (!valAfter.valid) {
          setErrorMessage(`Foto de Depois inválida: ${valAfter.error}`);
          setIsSubmitting(false);
          return;
        }
        const upRes = await uploadClinicalAttachment(afterFile, activeTenant, patient.id);
        if (upRes.success && upRes.data) {
          const newAtt = await db.addClinicalAttachment({
            tenantId: activeTenant,
            patientId: patient.id,
            storagePath: upRes.data.storagePath,
            originalFilename: upRes.data.originalFilename,
            mimeType: upRes.data.mimeType,
            sizeBytes: upRes.data.sizeBytes,
            attachmentType: 'PHOTO_AFTER',
            caption: `Depois: ${title}`,
            date: afterDate,
            procedureName,
            createdBy: user?.id || 'usr_01',
            signedUrl: upRes.data.signedUrl,
          });
          if (newAtt.attachment) {
            finalAfterId = newAtt.attachment.id;
          }
        }
      }

      if (!finalBeforeId || !finalAfterId) {
        setErrorMessage('Selecione ou faça o upload de ambas as fotos (Antes e Depois).');
        setIsSubmitting(false);
        return;
      }

      const res = await db.addBeforeAfterPair({
        tenantId: activeTenant,
        patientId: patient.id,
        title: title.trim(),
        procedureName: procedureName.trim() || undefined,
        observation: observation.trim() || undefined,
        beforeAttachmentId: finalBeforeId,
        afterAttachmentId: finalAfterId,
        beforeDate,
        afterDate,
        createdBy: user?.id || 'usr_01',
        beforePositionX: 0,
        beforePositionY: 0,
        beforeZoom: 1,
        afterPositionX: 0,
        afterPositionY: 0,
        afterZoom: 1,
        dividerPosition: 50,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Erro ao criar comparativo.');
        setIsSubmitting(false);
        return;
      }

      setIsNewPairModalOpen(false);
      setTitle('');
      setProcedureName('');
      setObservation('');
      setBeforeAttachmentId('');
      setAfterAttachmentId('');
      setBeforeFile(null);
      setAfterFile(null);
      onReload();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro inesperado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSliderPosChange = async (pairId: string, pos: number, saveToDb = false) => {
    setSliderPositions((prev) => ({ ...prev, [pairId]: pos }));
    if (saveToDb) {
      await db.updateBeforeAfterPair(pairId, { dividerPosition: pos });
    }
  };


  return (
    <div className="space-y-6">
      {/* Barra Superior */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-600" />
            Galeria Comparativa de Antes e Depois
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Documentação visual de resultados com slider interativo em tempo real, enquadramento independente e tela cheia.
          </p>
        </div>

        <button
          onClick={() => setIsNewPairModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-xs cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          Novo Comparativo
        </button>
      </div>

      {/* Lista de Comparativos */}
      {pairs.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <Images className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-slate-700">Nenhum comparativo cadastrado</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Crie comparativos visuais lado a lado e interativos para demonstrar os resultados de clareamentos,
            facetas, ortodontia e reabilitações aos seus pacientes.
          </p>
          <button
            onClick={() => setIsNewPairModalOpen(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Criar Primeiro Comparativo
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {pairs.map((pair) => {
            const mode = viewModes[pair.id] || 'side-by-side';

            return (
              <div
                key={pair.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
              >
                {/* Cabeçalho do Card */}
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{pair.title}</h4>
                    {pair.procedureName && (
                      <span className="text-xs font-medium text-teal-700">{pair.procedureName}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Modo de Visualização */}
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                      <button
                        type="button"
                        onClick={() => setViewModes((prev) => ({ ...prev, [pair.id]: 'side-by-side' }))}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          mode === 'side-by-side'
                            ? 'bg-teal-50 text-teal-700 font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Visualização Lado a Lado"
                      >
                        <Columns className="w-3.5 h-3.5" />
                        Lado a Lado
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewModes((prev) => ({ ...prev, [pair.id]: 'slider' }))}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                          mode === 'slider'
                            ? 'bg-teal-50 text-teal-700 font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Slider Interativo"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Slider Interativo
                      </button>
                    </div>

                    {/* Botão Tela Cheia (Fullscreen) */}
                    <button
                      type="button"
                      onClick={() => setFullscreenPairId(pair.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                      title="Abrir em Tela Cheia (apresentação clínica)"
                    >
                      <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                      <span className="hidden sm:inline">Tela Cheia</span>
                    </button>

                    {/* Botão Excluir */}
                    <button
                      type="button"
                      onClick={() => handleDeletePair(pair)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir este comparativo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Área Visual do Card */}
                <div className="p-4">
                  <ComparativePairArea
                    pair={pair}
                    attachments={attachments}
                    isFullscreen={false}
                    mode={mode}
                    sliderPos={sliderPositions[pair.id] ?? 50}
                    transforms={getPairTransform(pair.id)}
                    isPanning={isPanning}
                    isAdjustingThisPair={adjustTarget?.pairId === pair.id}
                    adjustingTarget={adjustTarget?.pairId === pair.id ? adjustTarget.target : null}
                    isSavingTransform={isSavingTransform}
                    onZoomChange={handleZoomChange}
                    onResetTransforms={handleResetTransforms}
                    onSaveTransforms={handleSaveTransforms}
                    onAdjustTargetChange={setAdjustTarget}
                    onSliderPosChange={handleSliderPosChange}
                    onDividerPointerDown={handleDividerPointerDown}
                    onDividerPointerMove={handleDividerPointerMove}
                    onDividerPointerUp={handleDividerPointerUp}
                    onPanPointerDown={handlePanPointerDown}
                    onPanPointerMove={handlePanPointerMove}
                    onPanPointerUp={handlePanPointerUp}
                  />

                  {/* Observação / Conclusão */}
                  {pair.observation && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-700">
                      <span className="font-semibold text-slate-800 mr-1">Evolução do Caso:</span>
                      {pair.observation}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL DE TELA CHEIA (FULLSCREEN) IMERSIVO */}
      {/* ============================================================ */}
      {fullscreenPairId && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col overflow-hidden animate-in fade-in duration-200">
          {(() => {
            const fsPair = pairs.find((p) => p.id === fullscreenPairId);
            if (!fsPair) return null;
            const fsMode = viewModes[fsPair.id] || 'side-by-side';

            return (
              <div className="flex flex-col h-full">
                {/* Header Tela Cheia */}
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 text-white shrink-0">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-teal-400" />
                    <div>
                      <h3 className="text-base font-bold text-white">{fsPair.title}</h3>
                      <p className="text-xs text-slate-400">
                        {fsPair.procedureName || 'Comparativo Antes e Depois'} • Paciente: {patient.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Alternador Lado a Lado / Slider no Fullscreen */}
                    <div className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
                      <button
                        type="button"
                        onClick={() => setViewModes((prev) => ({ ...prev, [fsPair.id]: 'side-by-side' }))}
                        className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                          fsMode === 'side-by-side'
                            ? 'bg-teal-600 text-white font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <Columns className="w-3.5 h-3.5" />
                        Lado a Lado
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewModes((prev) => ({ ...prev, [fsPair.id]: 'slider' }))}
                        className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                          fsMode === 'slider'
                            ? 'bg-teal-600 text-white font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Slider Interativo
                      </button>
                    </div>

                    {/* Botão Fechar Fullscreen */}
                    <button
                      type="button"
                      onClick={() => {
                        setFullscreenPairId(null);
                        setAdjustTarget(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all border border-slate-700"
                      title="Sair da tela cheia (ESC)"
                    >
                      <Minimize2 className="w-4 h-4" />
                      <span>Fechar (ESC)</span>
                    </button>
                  </div>
                </div>

                {/* Área Central Expandida */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col justify-center max-w-7xl mx-auto w-full">
                  <ComparativePairArea
                    pair={fsPair}
                    attachments={attachments}
                    isFullscreen={true}
                    mode={fsMode}
                    sliderPos={sliderPositions[fsPair.id] ?? 50}
                    transforms={getPairTransform(fsPair.id)}
                    isPanning={isPanning}
                    isAdjustingThisPair={adjustTarget?.pairId === fsPair.id}
                    adjustingTarget={adjustTarget?.pairId === fsPair.id ? adjustTarget.target : null}
                    isSavingTransform={isSavingTransform}
                    onZoomChange={handleZoomChange}
                    onResetTransforms={handleResetTransforms}
                    onSaveTransforms={handleSaveTransforms}
                    onAdjustTargetChange={setAdjustTarget}
                    onSliderPosChange={handleSliderPosChange}
                    onDividerPointerDown={handleDividerPointerDown}
                    onDividerPointerMove={handleDividerPointerMove}
                    onDividerPointerUp={handleDividerPointerUp}
                    onPanPointerDown={handlePanPointerDown}
                    onPanPointerMove={handlePanPointerMove}
                    onPanPointerUp={handlePanPointerUp}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL DE NOVO COMPARATIVO */}
      {/* ============================================================ */}
      {isNewPairModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-600" />
                Novo Comparativo Antes e Depois
              </h3>
              <button
                type="button"
                onClick={() => setIsNewPairModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePair} className="p-6 sm:p-7 space-y-5">
              {errorMessage && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-medium">{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Título do Caso <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Clareamento Dental em Consultório, Facetas em Resina..."
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Procedimento Vinculado
                </label>
                <input
                  type="text"
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  placeholder="Ex: Clareamento a Laser, Ortodontia Alinhadores..."
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                />
              </div>

              {/* Seção ANTES */}
              <div className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200/60 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Foto de ANTES
                  </span>
                  <div className="w-40">
                    <DatePicker
                      value={beforeDate}
                      onChange={setBeforeDate}
                      placeholder="DD/MM/AAAA"
                    />
                  </div>
                </div>

                {availablePhotos.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Selecionar foto já cadastrada do paciente:
                    </label>
                    <CustomSelect
                      value={beforeAttachmentId}
                      onChange={(val) => {
                        setBeforeAttachmentId(val);
                        if (val) setBeforeFile(null);
                      }}
                      options={photoOptions}
                      placeholder="Selecione da galeria..."
                      searchable
                    />
                  </div>
                )}

                <div className="text-center text-[11px] font-medium text-slate-400">
                  ou enviar nova imagem de Antes:
                </div>

                <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-amber-300/80 hover:border-amber-500 rounded-xl bg-white hover:bg-amber-50/50 cursor-pointer text-xs font-semibold text-amber-800 transition-all">
                  <UploadCloud className="w-4 h-4 text-amber-600" />
                  <span>{beforeFile ? beforeFile.name : 'Selecionar arquivo de Antes (JPG, PNG)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setBeforeFile(e.target.files[0]);
                        setBeforeAttachmentId('');
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Seção DEPOIS */}
              <div className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-200/60 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    Foto de DEPOIS
                  </span>
                  <div className="w-40">
                    <DatePicker
                      value={afterDate}
                      onChange={setAfterDate}
                      placeholder="DD/MM/AAAA"
                    />
                  </div>
                </div>

                {availablePhotos.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Selecionar foto já cadastrada do paciente:
                    </label>
                    <CustomSelect
                      value={afterAttachmentId}
                      onChange={(val) => {
                        setAfterAttachmentId(val);
                        if (val) setAfterFile(null);
                      }}
                      options={photoOptions}
                      placeholder="Selecione da galeria..."
                      searchable
                    />
                  </div>
                )}

                <div className="text-center text-[11px] font-medium text-slate-400">
                  ou enviar nova imagem de Depois:
                </div>

                <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-emerald-300/80 hover:border-emerald-500 rounded-xl bg-white hover:bg-emerald-50/50 cursor-pointer text-xs font-semibold text-emerald-800 transition-all">
                  <UploadCloud className="w-4 h-4 text-emerald-600" />
                  <span>{afterFile ? afterFile.name : 'Selecionar arquivo de Depois (JPG, PNG)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setAfterFile(e.target.files[0]);
                        setAfterAttachmentId('');
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Observações da Evolução
                </label>
                <textarea
                  rows={3}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Descreva os resultados estéticos, funcionais ou técnicas aplicadas..."
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 p-3.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all font-sans leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewPairModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isSubmitting ? 'Salvando...' : 'Criar Comparativo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão de Comparativo */}
      <ClinicalDeleteBeforeAfterModal
        isOpen={Boolean(pairToDelete)}
        onClose={() => setPairToDelete(null)}
        pair={pairToDelete}
        onDeleted={() => {
          setPairToDelete(null);
          onReload();
        }}
      />
    </div>
  );
};

// ============================================================================
// COMPONENTE ISOLADO DA ÁREA COMPARATIVA POR PAR (COM HOOK REATIVO DE URL)
// ============================================================================

interface ComparativePairAreaProps {
  pair: ClinicalBeforeAfterPair;
  attachments: ClinicalAttachment[];
  isFullscreen?: boolean;
  mode: 'side-by-side' | 'slider';
  sliderPos: number;
  transforms: PairTransforms;
  isPanning: boolean;
  isAdjustingThisPair: boolean;
  adjustingTarget: 'before' | 'after' | null;
  isSavingTransform: boolean;
  onZoomChange: (pairId: string, target: 'before' | 'after', deltaOrAbsolute: number, isAbsolute?: boolean) => void;
  onResetTransforms: (pairId: string, target?: 'before' | 'after') => void;
  onSaveTransforms: (pairId: string) => void;
  onAdjustTargetChange: (target: { pairId: string; target: 'before' | 'after' } | null) => void;
  onSliderPosChange: (pairId: string, pos: number, saveToDb?: boolean) => void;
  onDividerPointerDown: (pairId: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onDividerPointerMove: (pairId: string, containerEl: HTMLDivElement | null, e: React.PointerEvent<HTMLDivElement>) => void;
  onDividerPointerUp: (pairId: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerDown: (pairId: string, target: 'before' | 'after', e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerMove: (pairId: string, target: 'before' | 'after', e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}

const ComparativePairArea: React.FC<ComparativePairAreaProps> = ({
  pair,
  attachments,
  isFullscreen = false,
  mode,
  sliderPos,
  transforms,
  isPanning,
  isAdjustingThisPair,
  adjustingTarget,
  isSavingTransform,
  onZoomChange,
  onResetTransforms,
  onSaveTransforms,
  onAdjustTargetChange,
  onSliderPosChange,
  onDividerPointerDown,
  onDividerPointerMove,
  onDividerPointerUp,
  onPanPointerDown,
  onPanPointerMove,
  onPanPointerUp,
}) => {
  const beforeAtt =
    pair.beforeAttachment ||
    attachments.find((a) => a.id === pair.beforeAttachmentId);
  const afterAtt =
    pair.afterAttachment ||
    attachments.find((a) => a.id === pair.afterAttachmentId);

  const beforeRes = useResolvedFileUrl(beforeAtt?.storagePath, beforeAtt?.signedUrl);
  const afterRes = useResolvedFileUrl(afterAtt?.storagePath, afterAtt?.signedUrl);

  const [beforeImgError, setBeforeImgError] = useState(false);
  const [afterImgError, setAfterImgError] = useState(false);

  // Estilos inline de transform para Antes e Depois
  const beforeStyle: React.CSSProperties = {
    transform: `translate(${transforms.beforeX}px, ${transforms.beforeY}px) scale(${transforms.beforeZoom})`,
    transformOrigin: 'center center',
    transition: isPanning ? 'none' : 'transform 0.1s ease-out',
  };

  const afterStyle: React.CSSProperties = {
    transform: `translate(${transforms.afterX}px, ${transforms.afterY}px) scale(${transforms.afterZoom})`,
    transformOrigin: 'center center',
    transition: isPanning ? 'none' : 'transform 0.1s ease-out',
  };

  return (
    <div className="space-y-3">
      {/* Barra de Ajuste Ativa */}
      {isAdjustingThisPair && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-teal-900 font-semibold">
            <Move className="w-4 h-4 text-teal-600" />
            <span>
              Ajustando {adjustingTarget === 'before' ? 'Foto de ANTES' : 'Foto de DEPOIS'}:
            </span>
            <span className="text-[11px] font-normal text-slate-600 hidden sm:inline">
              Arraste a foto para alinhar e use os botões ou o slider para dar zoom.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Controles de Zoom */}
            <button
              type="button"
              onClick={() => onZoomChange(pair.id, adjustingTarget!, -0.1)}
              className="p-1 rounded-md bg-white border border-teal-200 text-teal-800 hover:bg-teal-100"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={adjustingTarget === 'before' ? transforms.beforeZoom : transforms.afterZoom}
              onChange={(e) =>
                onZoomChange(pair.id, adjustingTarget!, parseFloat(e.target.value), true)
              }
              className="w-24 accent-teal-600 cursor-pointer"
            />
            <button
              type="button"
              onClick={() => onZoomChange(pair.id, adjustingTarget!, 0.1)}
              className="p-1 rounded-md bg-white border border-teal-200 text-teal-800 hover:bg-teal-100"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>

            <span className="font-mono text-slate-700 w-10 text-center">
              {(adjustingTarget === 'before' ? transforms.beforeZoom : transforms.afterZoom).toFixed(1)}x
            </span>

            {/* Botão Redefinir */}
            <button
              type="button"
              onClick={() => onResetTransforms(pair.id, adjustingTarget!)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
              title="Redefinir este enquadramento"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Resetar</span>
            </button>

            {/* Botão Concluir Ajuste */}
            <button
              type="button"
              disabled={isSavingTransform}
              onClick={() => onSaveTransforms(pair.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-600 text-white font-semibold hover:bg-teal-700 shadow-2xs"
            >
              <Check className="w-3 h-3" />
              <span>{isSavingTransform ? 'Salvando...' : 'Concluir'}</span>
            </button>
          </div>
        </div>
      )}

      {mode === 'side-by-side' ? (
        /* MODO LADO A LADO COM OBJECT-CONTAIN E FUNDO NEUTRO (SEM CORTES) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Foto ANTES */}
          <div
            onPointerDown={(e) => onPanPointerDown(pair.id, 'before', e)}
            onPointerMove={(e) => onPanPointerMove(pair.id, 'before', e)}
            onPointerUp={onPanPointerUp}
            onPointerCancel={onPanPointerUp}
            className={`relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center select-none ${
              isFullscreen ? 'h-[72vh]' : 'h-80 sm:h-96'
            } ${
              isAdjustingThisPair && adjustingTarget === 'before'
                ? 'ring-2 ring-amber-500 cursor-grab active:cursor-grabbing'
                : ''
            }`}
          >
            {beforeRes.loading ? (
              <div className="flex flex-col items-center justify-center p-6 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-teal-400 mb-2" />
                <span className="text-xs font-medium text-slate-300">Carregando foto de Antes...</span>
              </div>
            ) : beforeRes.url && !beforeImgError ? (
              <div className="w-full h-full flex items-center justify-center overflow-hidden">
                <img
                  src={beforeRes.url}
                  alt="Antes"
                  style={beforeStyle}
                  draggable={false}
                  onError={() => setBeforeImgError(true)}
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
            ) : (
              <div className="text-center text-slate-400 p-4">
                <FileImage className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <span className="text-xs block mb-2">{beforeRes.error || 'Foto de Antes não disponível'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setBeforeImgError(false);
                    beforeRes.retry();
                  }}
                  className="text-xs text-teal-400 hover:text-teal-300 underline font-medium cursor-pointer"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* Tag ANTES */}
            <div className="absolute top-3 left-3 bg-red-600/90 backdrop-blur-xs text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-md uppercase tracking-wider">
              Antes
            </div>

            {pair.beforeDate && (
              <div className="absolute bottom-3 left-3 bg-slate-900/85 backdrop-blur-xs text-white text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-700/50">
                <Calendar className="w-3 h-3 text-slate-300" />
                {pair.beforeDate.split('-').reverse().join('/')}
              </div>
            )}

            {/* Botão de Ajustar Antes */}
            {!isAdjustingThisPair && (
              <button
                type="button"
                onClick={() => onAdjustTargetChange({ pairId: pair.id, target: 'before' })}
                className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white text-xs font-medium backdrop-blur-xs border border-slate-700 shadow-sm transition-all cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3 text-amber-400" />
                <span>Ajustar Foto</span>
              </button>
            )}
          </div>

          {/* Foto DEPOIS */}
          <div
            onPointerDown={(e) => onPanPointerDown(pair.id, 'after', e)}
            onPointerMove={(e) => onPanPointerMove(pair.id, 'after', e)}
            onPointerUp={onPanPointerUp}
            onPointerCancel={onPanPointerUp}
            className={`relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center select-none ${
              isFullscreen ? 'h-[72vh]' : 'h-80 sm:h-96'
            } ${
              isAdjustingThisPair && adjustingTarget === 'after'
                ? 'ring-2 ring-emerald-500 cursor-grab active:cursor-grabbing'
                : ''
            }`}
          >
            {afterRes.loading ? (
              <div className="flex flex-col items-center justify-center p-6 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-teal-400 mb-2" />
                <span className="text-xs font-medium text-slate-300">Carregando foto de Depois...</span>
              </div>
            ) : afterRes.url && !afterImgError ? (
              <div className="w-full h-full flex items-center justify-center overflow-hidden">
                <img
                  src={afterRes.url}
                  alt="Depois"
                  style={afterStyle}
                  draggable={false}
                  onError={() => setAfterImgError(true)}
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
            ) : (
              <div className="text-center text-slate-400 p-4">
                <FileImage className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <span className="text-xs block mb-2">{afterRes.error || 'Foto de Depois não disponível'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAfterImgError(false);
                    afterRes.retry();
                  }}
                  className="text-xs text-teal-400 hover:text-teal-300 underline font-medium cursor-pointer"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* Tag DEPOIS */}
            <div className="absolute top-3 right-3 bg-emerald-600/90 backdrop-blur-xs text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-md uppercase tracking-wider">
              Depois
            </div>

            {pair.afterDate && (
              <div className="absolute bottom-3 right-3 bg-slate-900/85 backdrop-blur-xs text-white text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-slate-700/50">
                <Calendar className="w-3 h-3 text-slate-300" />
                {pair.afterDate.split('-').reverse().join('/')}
              </div>
            )}

            {/* Botão de Ajustar Depois */}
            {!isAdjustingThisPair && (
              <button
                type="button"
                onClick={() => onAdjustTargetChange({ pairId: pair.id, target: 'after' })}
                className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white text-xs font-medium backdrop-blur-xs border border-slate-700 shadow-sm transition-all cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3 text-emerald-400" />
                <span>Ajustar Foto</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* MODO SLIDER INTERATIVO */
        <div className="space-y-3">
          <SliderContainer
            pairId={pair.id}
            sliderPos={sliderPos}
            beforeUrl={beforeRes.url}
            afterUrl={afterRes.url}
            beforeLoading={beforeRes.loading}
            afterLoading={afterRes.loading}
            beforeError={beforeRes.error}
            afterError={afterRes.error}
            onRetryBefore={() => {
              setBeforeImgError(false);
              beforeRes.retry();
            }}
            onRetryAfter={() => {
              setAfterImgError(false);
              afterRes.retry();
            }}
            beforeStyle={beforeStyle}
            afterStyle={afterStyle}
            isFullscreen={isFullscreen}
            isAdjustingThisPair={isAdjustingThisPair}
            adjustingTarget={adjustingTarget}
            onDividerPointerDown={onDividerPointerDown}
            onDividerPointerMove={onDividerPointerMove}
            onDividerPointerUp={onDividerPointerUp}
            onPanPointerDown={onPanPointerDown}
            onPanPointerMove={onPanPointerMove}
            onPanPointerUp={onPanPointerUp}
            onOpenAdjust={onAdjustTargetChange}
          />

          {/* Barra de controle inferior do Slider */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Divisor do Antes/Depois:</span>
              <span className="font-mono text-teal-700 font-bold">{sliderPos}%</span>
            </div>

            {/* Slider de Range Suave */}
            <div className="flex items-center gap-3 flex-1 max-w-xs">
              <span className="text-[11px] font-bold text-red-600">Antes</span>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPos}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  onSliderPosChange(pair.id, val, false);
                }}
                onMouseUp={() => {
                  onSliderPosChange(pair.id, sliderPos, true);
                }}
                onTouchEnd={() => {
                  onSliderPosChange(pair.id, sliderPos, true);
                }}
                className="w-full accent-teal-600 cursor-pointer"
              />
              <span className="text-[11px] font-bold text-emerald-600">Depois</span>
            </div>

            {/* Botões rápidos de posição */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSliderPosChange(pair.id, 25, true)}
                className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700 cursor-pointer"
              >
                25%
              </button>
              <button
                type="button"
                onClick={() => onSliderPosChange(pair.id, 50, true)}
                className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700 cursor-pointer"
              >
                50% (Meio)
              </button>
              <button
                type="button"
                onClick={() => onSliderPosChange(pair.id, 75, true)}
                className="px-2 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700 cursor-pointer"
              >
                75%
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponente isolado para o Slider Interativo com Container Ref
interface SliderContainerProps {
  pairId: string;
  sliderPos: number;
  beforeUrl?: string | null;
  afterUrl?: string | null;
  beforeLoading?: boolean;
  afterLoading?: boolean;
  beforeError?: string | null;
  afterError?: string | null;
  onRetryBefore?: () => void;
  onRetryAfter?: () => void;
  beforeStyle: React.CSSProperties;
  afterStyle: React.CSSProperties;
  isFullscreen: boolean;
  isAdjustingThisPair: boolean;
  adjustingTarget: 'before' | 'after' | null;
  onDividerPointerDown: (pairId: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onDividerPointerMove: (pairId: string, containerEl: HTMLDivElement | null, e: React.PointerEvent<HTMLDivElement>) => void;
  onDividerPointerUp: (pairId: string, e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerDown: (pairId: string, target: 'before' | 'after', e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerMove: (pairId: string, target: 'before' | 'after', e: React.PointerEvent<HTMLDivElement>) => void;
  onPanPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onOpenAdjust: (target: { pairId: string; target: 'before' | 'after' }) => void;
}

const SliderContainer: React.FC<SliderContainerProps> = ({
  pairId,
  sliderPos,
  beforeUrl,
  afterUrl,
  beforeLoading,
  afterLoading,
  beforeError,
  afterError,
  onRetryBefore,
  onRetryAfter,
  beforeStyle,
  afterStyle,
  isFullscreen,
  isAdjustingThisPair,
  adjustingTarget,
  onDividerPointerDown,
  onDividerPointerMove,
  onDividerPointerUp,
  onPanPointerDown,
  onPanPointerMove,
  onPanPointerUp,
  onOpenAdjust,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={containerRef}
      className={`relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 select-none mx-auto w-full ${
        isFullscreen ? 'h-[72vh]' : 'h-80 sm:h-96'
      }`}
    >
      {/* Imagem DEPOIS (Base Inferior) */}
      <div
        onPointerDown={(e) => onPanPointerDown(pairId, 'after', e)}
        onPointerMove={(e) => onPanPointerMove(pairId, 'after', e)}
        onPointerUp={onPanPointerUp}
        onPointerCancel={onPanPointerUp}
        className={`absolute inset-0 flex items-center justify-center overflow-hidden ${
          isAdjustingThisPair && adjustingTarget === 'after'
            ? 'ring-2 ring-emerald-500 cursor-grab active:cursor-grabbing z-10'
            : ''
        }`}
      >
        {afterLoading ? (
          <div className="flex flex-col items-center justify-center p-6 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400 mb-2" />
            <span className="text-xs font-medium text-slate-300">Carregando foto de Depois...</span>
          </div>
        ) : afterUrl ? (
          <img
            src={afterUrl}
            alt="Depois"
            style={afterStyle}
            draggable={false}
            className="w-full h-full object-contain pointer-events-none"
          />
        ) : (
          <div className="text-center text-slate-400 p-4">
            <FileImage className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <span className="text-xs block mb-2">{afterError || 'Foto de Depois não disponível'}</span>
            {onRetryAfter && (
              <button
                type="button"
                onClick={onRetryAfter}
                className="text-xs text-teal-400 hover:text-teal-300 underline font-medium cursor-pointer"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}
      </div>

      {/* Imagem ANTES (Camada Superior com Clip-path) */}
      <div
        onPointerDown={(e) => onPanPointerDown(pairId, 'before', e)}
        onPointerMove={(e) => onPanPointerMove(pairId, 'before', e)}
        onPointerUp={onPanPointerUp}
        onPointerCancel={onPanPointerUp}
        className={`absolute inset-0 flex items-center justify-center overflow-hidden ${
          isAdjustingThisPair && adjustingTarget === 'before'
            ? 'ring-2 ring-amber-500 cursor-grab active:cursor-grabbing z-10'
            : ''
        }`}
        style={{
          clipPath: `inset(0 ${100 - sliderPos}% 0 0)`,
        }}
      >
        {beforeLoading ? (
          <div className="flex flex-col items-center justify-center p-6 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400 mb-2" />
            <span className="text-xs font-medium text-slate-300">Carregando foto de Antes...</span>
          </div>
        ) : beforeUrl ? (
          <img
            src={beforeUrl}
            alt="Antes"
            style={beforeStyle}
            draggable={false}
            className="w-full h-full object-contain pointer-events-none"
          />
        ) : (
          <div className="text-center text-slate-400 p-4">
            <FileImage className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <span className="text-xs block mb-2">{beforeError || 'Foto de Antes não disponível'}</span>
            {onRetryBefore && (
              <button
                type="button"
                onClick={onRetryBefore}
                className="text-xs text-teal-400 hover:text-teal-300 underline font-medium cursor-pointer"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}
      </div>

      {/* Linha Divisória Interativa com Pointer Capture */}
      <div
        onPointerDown={(e) => onDividerPointerDown(pairId, e)}
        onPointerMove={(e) => onDividerPointerMove(pairId, containerRef.current, e)}
        onPointerUp={(e) => onDividerPointerUp(pairId, e)}
        onPointerCancel={(e) => onDividerPointerUp(pairId, e)}
        className="absolute top-0 bottom-0 w-8 -translate-x-1/2 flex items-center justify-center cursor-ew-resize select-none z-20 touch-none group"
        style={{ left: `${sliderPos}%` }}
        title="Arraste para comparar Antes e Depois"
      >
        {/* Linha visual fina central */}
        <div className="w-0.5 h-full bg-white shadow-[0_0_8px_rgba(0,0,0,0.6)] group-hover:bg-teal-400 transition-colors" />

        {/* Manopla circular com ícone de arrasto */}
        <div className="absolute w-8 h-8 rounded-full bg-white text-slate-700 shadow-xl border-2 border-teal-600 flex items-center justify-center text-xs font-bold group-hover:scale-110 group-active:scale-95 transition-all">
          ↔
        </div>
      </div>

      {/* Tags de Identificação */}
      <div className="absolute top-3 left-3 bg-red-600/90 backdrop-blur-xs text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-md uppercase tracking-wider pointer-events-none z-10">
        Antes
      </div>
      <div className="absolute top-3 right-3 bg-emerald-600/90 backdrop-blur-xs text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-md uppercase tracking-wider pointer-events-none z-10">
        Depois
      </div>

      {/* Botões de Acesso Rápido a Ajustar Imagem no Slider */}
      {!isAdjustingThisPair && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
          <button
            type="button"
            onClick={() => onOpenAdjust({ pairId, target: 'before' })}
            className="px-2 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white text-[11px] font-medium backdrop-blur-xs border border-slate-700 shadow-sm transition-all cursor-pointer"
          >
            Ajustar Antes
          </button>
          <button
            type="button"
            onClick={() => onOpenAdjust({ pairId, target: 'after' })}
            className="px-2 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-white text-[11px] font-medium backdrop-blur-xs border border-slate-700 shadow-sm transition-all cursor-pointer"
          >
            Ajustar Depois
          </button>
        </div>
      )}
    </div>
  );
};

