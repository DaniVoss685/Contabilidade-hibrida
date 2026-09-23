import React, { useState, useMemo } from 'react';
import { Patient, ClinicalAttachment, ClinicalAttachmentType } from '../../../types';
import { db } from '../../../lib/db';
import {
  uploadClinicalAttachment,
  validateClinicalFile,
  isImageFile,
  isPdfFile,
  useResolvedFileUrl,
} from '../../../lib/storageService';
import { CustomSelect, SelectOption } from '../../UI/CustomSelect';
import { DatePicker } from '../../UI/DatePicker';
import { ClinicalDeleteAttachmentModal } from './ClinicalDeleteAttachmentModal';
import { CLINICAL_ATTACHMENT_TYPE_OPTIONS, getClinicalAttachmentTypeLabel } from '../../../lib/clinicalAttachmentTypes';
import {
  UploadCloud,
  Search,
  Paperclip,
  Trash2,
  ExternalLink,
  Eye,
  FileText,
  FileImage,
  AlertCircle,
  X,
  Plus,
  Calendar,
  Loader2,
  Download,
} from 'lucide-react';

interface ClinicalDocumentsViewProps {
  patient: Patient;
  attachments: ClinicalAttachment[];
  onReload: () => void;
}

const DOCUMENT_TYPE_FILTER_OPTIONS: SelectOption[] = [
  { value: 'ALL', label: 'Todos os Documentos' },
  { value: 'RADIOGRAPHY', label: 'Radiografias' },
  { value: 'PHOTO_BEFORE', label: 'Fotos de Antes' },
  { value: 'PHOTO_AFTER', label: 'Fotos de Depois' },
  { value: 'CONSENT_FORM', label: 'Termos de Consentimento' },
  { value: 'EXAM', label: 'Exames / Tomografias' },
  { value: 'DOCUMENT', label: 'Documentos / Laudos' },
  { value: 'OTHER', label: 'Outros Arquivos' },
];

const UPLOAD_ATTACHMENT_TYPE_OPTIONS: SelectOption[] = CLINICAL_ATTACHMENT_TYPE_OPTIONS;

export const ClinicalDocumentsView: React.FC<ClinicalDocumentsViewProps> = ({
  patient,
  attachments,
  onReload,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Modal de Upload
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [attachmentType, setAttachmentType] = useState<ClinicalAttachmentType>('DOCUMENT');
  const [caption, setCaption] = useState('');
  const [procedureName, setProcedureName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal de Preview
  const [previewAttachment, setPreviewAttachment] = useState<ClinicalAttachment | null>(null);

  // Modal de Exclusão
  const [attachmentToDelete, setAttachmentToDelete] = useState<ClinicalAttachment | null>(null);

  const filteredAttachments = useMemo(() => {
    return attachments.filter((att) => {
      if (selectedType !== 'ALL' && att.attachmentType !== selectedType) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesName = att.originalFilename?.toLowerCase().includes(term);
        const matchesCaption = att.caption?.toLowerCase().includes(term);
        const matchesProc = att.procedureName?.toLowerCase().includes(term);
        if (!matchesName && !matchesCaption && !matchesProc) return false;
      }
      return true;
    });
  }, [attachments, selectedType, searchTerm]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const validation = validateClinicalFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Arquivo inválido.');
      return;
    }

    setUploadFile(file);
    setErrorMessage(null);

    // Sugere tipo baseado na extensão
    if (file.type.startsWith('image/')) {
      if (!attachmentType || attachmentType === 'DOCUMENT') {
        setAttachmentType('PHOTO_BEFORE');
      }
    } else if (file.type === 'application/pdf') {
      if (!attachmentType || attachmentType === 'PHOTO_BEFORE') {
        setAttachmentType('CONSENT_FORM');
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setErrorMessage('Por favor, selecione um arquivo para enviar.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const activeTenant = (db as any).activeTenantId || 'tenant_demo';
      const user = db.getUser();

      const upRes = await uploadClinicalAttachment(uploadFile, activeTenant, patient.id);
      if (!upRes.success || !upRes.data) {
        setErrorMessage(upRes.error || 'Erro ao enviar arquivo para o armazenamento privado.');
        setIsSubmitting(false);
        return;
      }

      await db.addClinicalAttachment({
        tenantId: activeTenant,
        patientId: patient.id,
        storagePath: upRes.data.storagePath,
        originalFilename: upRes.data.originalFilename,
        mimeType: upRes.data.mimeType,
        sizeBytes: upRes.data.sizeBytes,
        attachmentType,
        caption: caption.trim() || undefined,
        date,
        procedureName: procedureName.trim() || undefined,
        createdBy: user?.id || 'usr_01',
        signedUrl: upRes.data.signedUrl,
      });

      setIsUploadModalOpen(false);
      setUploadFile(null);
      setCaption('');
      setProcedureName('');
      onReload();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro inesperado ao salvar anexo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAttachment = (attachment: ClinicalAttachment) => {
    setAttachmentToDelete(attachment);
  };

  const getTypeLabel = getClinicalAttachmentTypeLabel;

  return (
    <div className="space-y-6">
      {/* Barra de Filtros e Upload Padronizada */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar documentos por nome, legenda ou procedimento..."
            className="w-full pl-10 pr-3.5 py-2 text-xs sm:text-sm font-medium border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-full sm:w-56">
            <CustomSelect
              value={selectedType}
              onChange={(val) => setSelectedType(val)}
              options={DOCUMENT_TYPE_FILTER_OPTIONS}
              placeholder="Tipo de Documento"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setUploadFile(null);
              setCaption('');
              setProcedureName('');
              setDate(new Date().toISOString().split('T')[0]);
              setErrorMessage(null);
              setIsUploadModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs shrink-0"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Adicionar Documento</span>
          </button>
        </div>
      </div>

      {/* Grid de Anexos */}
      {filteredAttachments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-2xs">
          <div className="w-14 h-14 bg-teal-50 border border-teal-100 rounded-2xl flex items-center justify-center text-teal-600 mx-auto mb-4">
            <Paperclip className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold text-slate-800">Nenhum documento encontrado</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
            Armazene com segurança radiografias, tomografias, fotos de casos clínicos e laudos em PDF sob criptografia privada.
          </p>
          <button
            type="button"
            onClick={() => {
              setUploadFile(null);
              setCaption('');
              setProcedureName('');
              setDate(new Date().toISOString().split('T')[0]);
              setErrorMessage(null);
              setIsUploadModalOpen(true);
            }}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Enviar Primeiro Documento</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {filteredAttachments.map((att) => (
            <DocumentCardItem
              key={att.id}
              att={att}
              onPreview={(target) => setPreviewAttachment(target)}
              onDelete={handleDeleteAttachment}
              getTypeLabel={getTypeLabel}
            />
          ))}
        </div>
      )}

      {/* Modal de Upload Refinado */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    Adicionar Anexo Clínico
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Paciente: <strong className="text-slate-700">{patient.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 sm:p-7 space-y-5">
              {errorMessage && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-medium">{errorMessage}</span>
                </div>
              )}

              {/* Seletor de Arquivo */}
              <label className="flex flex-col items-center justify-center p-7 border-2 border-dashed border-slate-200 hover:border-teal-500 rounded-2xl bg-slate-50/60 hover:bg-teal-50/20 cursor-pointer transition-all text-center">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 mb-2.5">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold text-slate-800">
                  {uploadFile ? uploadFile.name : 'Clique para selecionar o arquivo'}
                </span>
                <span className="text-[11px] text-slate-400 mt-1">
                  Formatos aceitos: JPG, PNG, WEBP (até 10 MB) ou PDF (até 20 MB)
                </span>
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                  className="hidden"
                />
              </label>

              {/* Tipo e Data com Componentes do Sistema */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <CustomSelect
                    label="Tipo do Anexo"
                    required
                    options={UPLOAD_ATTACHMENT_TYPE_OPTIONS}
                    value={attachmentType}
                    onChange={(val) => setAttachmentType(val as ClinicalAttachmentType)}
                    placeholder="Selecione o tipo..."
                  />
                </div>

                <div>
                  <DatePicker
                    label="Data do Arquivo / Exame"
                    required
                    value={date}
                    onChange={setDate}
                    placeholder="DD/MM/AAAA"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Procedimento Vinculado (Opcional)
                </label>
                <input
                  type="text"
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  placeholder=""
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Legenda / Descrição do Anexo
                </label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder=""
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !uploadFile}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>{isSubmitting ? 'Enviando...' : 'Salvar Anexo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Pré-visualização Ampliada */}
      {previewAttachment && (
        <DocumentPreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
          getTypeLabel={getTypeLabel}
        />
      )}

      {/* Modal de Exclusão de Documento */}
      <ClinicalDeleteAttachmentModal
        isOpen={Boolean(attachmentToDelete)}
        onClose={() => setAttachmentToDelete(null)}
        attachment={attachmentToDelete}
        onDeleted={() => {
          setAttachmentToDelete(null);
          onReload();
        }}
      />
    </div>
  );
};

// ============================================================================
// SUBCOMPONENTE DE CARD INDIVIDUAL DE DOCUMENTO (COM RESOLUÇÃO ASSÍNCRONA)
// ============================================================================

interface DocumentCardItemProps {
  att: ClinicalAttachment;
  onPreview: (att: ClinicalAttachment) => void;
  onDelete: (att: ClinicalAttachment) => void;
  getTypeLabel: (type: ClinicalAttachmentType) => string;
}

const DocumentCardItem: React.FC<DocumentCardItemProps> = ({
  att,
  onPreview,
  onDelete,
  getTypeLabel,
}) => {
  const { url, loading } = useResolvedFileUrl(att.storagePath, att.signedUrl);
  const isImage = isImageFile(att.mimeType, att.originalFilename);
  const isPdf = isPdfFile(att.mimeType, att.originalFilename);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs hover:border-slate-300 hover:shadow-sm transition-all overflow-hidden flex flex-col group">
      {/* Área de Preview */}
      <div
        onClick={() => onPreview(att)}
        className="h-40 bg-slate-50 border-b border-slate-100 relative cursor-pointer overflow-hidden flex items-center justify-center"
      >
        {isImage ? (
          loading ? (
            <div className="flex flex-col items-center justify-center p-4 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-teal-500 mb-1" />
              <span className="text-[10px] text-slate-400 font-medium">Carregando...</span>
            </div>
          ) : url && !imgError ? (
            <img
              src={url}
              alt={att.originalFilename}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="text-center p-2 text-slate-400">
              <FileImage className="w-10 h-10 mx-auto mb-1 opacity-50" />
              <span className="text-[10px] block font-medium">Imagem</span>
            </div>
          )
        ) : isPdf ? (
          <div className="text-center p-4">
            <FileText className="w-12 h-12 text-rose-500 mx-auto mb-1.5" />
            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
              Documento PDF
            </span>
          </div>
        ) : (
          <div className="text-center p-4">
            <Paperclip className="w-10 h-10 text-slate-400 mx-auto mb-1.5" />
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              {att.originalFilename.split('.').pop() || 'Arquivo'}
            </span>
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider">
          {getTypeLabel(att.attachmentType)}
        </div>

        <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="bg-white/95 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-teal-600" />
            Visualizar
          </span>
        </div>
      </div>

      {/* Conteúdo do Card */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h5
            className="text-xs font-bold text-slate-800 truncate mb-1"
            title={att.originalFilename}
          >
            {att.originalFilename}
          </h5>

          {att.caption && (
            <p className="text-[11px] text-slate-600 line-clamp-2 mb-2 leading-relaxed">
              {att.caption}
            </p>
          )}

          {att.procedureName && (
            <span className="inline-block text-[10px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100 mb-2">
              {att.procedureName}
            </span>
          )}
        </div>

        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {att.date
              ? att.date.split('-').reverse().join('/')
              : att.createdAt.split('T')[0].split('-').reverse().join('/')}
          </span>

          <div className="flex items-center gap-1">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                title="Abrir em nova aba"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={() => onDelete(att)}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Excluir anexo"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SUBCOMPONENTE DE PREVIEW AMPLIADO (COM RESOLUÇÃO ASSÍNCRONA SEGURA)
// ============================================================================

interface DocumentPreviewModalProps {
  attachment: ClinicalAttachment;
  onClose: () => void;
  getTypeLabel: (type: ClinicalAttachmentType) => string;
}

const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  attachment,
  onClose,
  getTypeLabel,
}) => {
  const { url, loading, error, retry } = useResolvedFileUrl(
    attachment.storagePath,
    attachment.signedUrl
  );
  const isImage = isImageFile(attachment.mimeType, attachment.originalFilename);
  const isPdf = isPdfFile(attachment.mimeType, attachment.originalFilename);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/80 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="min-w-0 pr-4">
            <h4 className="text-sm font-bold text-slate-800 truncate">
              {attachment.originalFilename}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {getTypeLabel(attachment.attachmentType)} •{' '}
              {attachment.date
                ? attachment.date.split('-').reverse().join('/')
                : attachment.createdAt.split('T')[0].split('-').reverse().join('/')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-colors cursor-pointer"
                title="Abrir em nova aba"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 bg-slate-900 flex items-center justify-center min-h-[360px] max-h-[75vh] overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-300">
              <Loader2 className="w-10 h-10 animate-spin text-teal-400 mb-3" />
              <p className="text-sm font-medium">Carregando visualização segura...</p>
            </div>
          ) : error && !url ? (
            <div className="text-center p-8 text-white space-y-3">
              <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
              <p className="text-sm font-medium text-slate-200">
                {error || 'Não foi possível carregar o arquivo com segurança.'}
              </p>
              <button
                type="button"
                onClick={retry}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          ) : isImage && url && !imgError ? (
            <img
              src={url}
              alt={attachment.originalFilename}
              onError={() => setImgError(true)}
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl"
            />
          ) : isPdf && url ? (
            <div className="w-full flex flex-col items-center gap-3">
              <iframe
                src={url}
                title={attachment.originalFilename}
                className="w-full h-[65vh] border-0 rounded-lg bg-white shadow-2xl"
              />
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir em Nova Aba</span>
                </a>
                <a
                  href={url}
                  download={attachment.originalFilename}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar PDF</span>
                </a>
              </div>
            </div>
          ) : url ? (
            <div className="text-center p-8 text-white space-y-3">
              <FileText className="w-16 h-16 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold">{attachment.originalFilename}</p>
              <p className="text-xs text-slate-400">
                Pré-visualização direta não disponível no navegador para este formato.
              </p>
              <a
                href={url}
                download={attachment.originalFilename}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold transition-all shadow-md mt-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Arquivo Original</span>
              </a>
            </div>
          ) : (
            <div className="text-center p-8 text-white space-y-3">
              <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium">Arquivo não encontrado ou inacessível no momento.</p>
              <button
                type="button"
                onClick={retry}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>

        {attachment.caption && (
          <div className="p-4 bg-white border-t border-slate-100 text-xs text-slate-700">
            <span className="font-bold text-slate-900 block mb-0.5">Legenda:</span>
            <p>{attachment.caption}</p>
          </div>
        )}
      </div>
    </div>
  );
};

