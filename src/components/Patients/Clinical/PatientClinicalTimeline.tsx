import React, { useState, useMemo } from 'react';
import {
  Patient,
  ClinicalRecord,
  ClinicalRecordType,
  ClinicalRecordStatus,
  ClinicalAttachment,
} from '../../../types';
import {
  Search,
  PlusCircle,
  Printer,
  Calendar,
  Clock,
  User,
  AlertCircle,
  FileText,
  Paperclip,
  CheckCircle2,
  Edit2,
  Trash2,
  History,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  ExternalLink,
  Stethoscope,
  Sparkles,
  MoreHorizontal,
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Loader2,
  Archive,
  Check,
} from 'lucide-react';
import { printClinicalDossier } from '../../../lib/clinicalPdfService';
import { db } from '../../../lib/db';
import { CustomSelect, SelectOption } from '../../UI/CustomSelect';
import { useResolvedFileUrl, isImageFile, resolvePrivateFileUrl } from '../../../lib/storageService';
import { findPossibleClinicalDuplicates } from '../../../lib/clinicalRecordDuplicates';

interface PatientClinicalTimelineProps {
  patient: Patient;
  records: ClinicalRecord[];
  attachments: ClinicalAttachment[];
  onOpenNewRecordModal: () => void;
  onEditDraftRecord: (record: ClinicalRecord) => void;
  onFinalizeRecord: (recordId: string) => void;
  onDeleteDraftRecord: (record: ClinicalRecord) => void;
  onOpenAmendmentModal: (record: ClinicalRecord) => void;
  onOpenVoidModal?: (record: ClinicalRecord, initialReason?: string) => void;
  onDuplicateReviewSaved?: () => void;
  onFollowUpRecord?: (record: ClinicalRecord) => void;
  onSelectRecordDetails?: (record: ClinicalRecord) => void;
}

const TYPE_FILTER_OPTIONS: SelectOption[] = [
  { value: 'ALL', label: 'Todos os Tipos' },
  { value: 'PROCEDIMENTO', label: 'Procedimentos' },
  { value: 'CONSULTA_INICIAL', label: 'Consultas Iniciais' },
  { value: 'AVALIACAO', label: 'Avaliações Clínicas' },
  { value: 'RETORNO', label: 'Retornos / Revisões' },
  { value: 'PLANO_TRATAMENTO', label: 'Planos de Tratamento' },
  { value: 'INTERCORRENCIA', label: 'Intercorrências' },
  { value: 'OBSERVACAO', label: 'Observações Clínicas' },
  { value: 'CONCLUSAO', label: 'Conclusões de Tratamento' },
  { value: 'OUTRO', label: 'Outros Registros' },
];

const PERIOD_FILTER_OPTIONS: SelectOption[] = [
  { value: 'ALL', label: 'Todo o Histórico' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 6 meses' },
  { value: 'THIS_YEAR', label: 'Ano atual' },
];

const SORT_OPTIONS: SelectOption[] = [
  { value: 'desc', label: 'Mais Recentes' },
  { value: 'asc', label: 'Mais Antigos' },
];

const formatLegacySourceDate = (value?: string) => {
  if (!value) return '';
  return value.replace(/^(\d{2}\/\d{2}\/\d{4}) 00:00:00$/, '$1');
};

export const PatientClinicalTimeline: React.FC<PatientClinicalTimelineProps> = ({
  patient,
  records,
  attachments,
  onOpenNewRecordModal,
  onEditDraftRecord,
  onFinalizeRecord,
  onDeleteDraftRecord,
  onOpenAmendmentModal,
  onOpenVoidModal,
  onDuplicateReviewSaved,
  onFollowUpRecord,
  onSelectRecordDetails,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedRecordIds, setExpandedRecordIds] = useState<Record<string, boolean>>({});
  const [openMenuRecordId, setOpenMenuRecordId] = useState<string | null>(null);
  const [reviewingDuplicateGroupId, setReviewingDuplicateGroupId] = useState<string | null>(null);
  const [duplicateReviewError, setDuplicateReviewError] = useState<string | null>(null);
  const possibleDuplicates = useMemo(() => findPossibleClinicalDuplicates(records), [records]);
  const duplicateGroupCount = new Set([...possibleDuplicates.values()]
    .filter((duplicate) => !duplicate.reviewStatus)
    .map((duplicate) => duplicate.groupId)).size;

  const handleDuplicateReview = async (groupId: string, status: 'CONFIRMED_DUPLICATE' | 'DISTINCT_RECORDS') => {
    const groupRecordIds = records
      .filter((record) => possibleDuplicates.get(record.id)?.groupId === groupId)
      .map((record) => record.id);
    setReviewingDuplicateGroupId(groupId);
    setDuplicateReviewError(null);
    const result = await db.reviewImportedClinicalDuplicateGroup(groupRecordIds, groupId, status);
    setReviewingDuplicateGroupId(null);
    if (!result.success) {
      setDuplicateReviewError(result.error || 'Não foi possível salvar a revisão.');
      return;
    }
    onDuplicateReviewSaved?.();
  };

  const toggleExpand = (id: string) => {
    setExpandedRecordIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtragem e ordenação
  const filteredRecords = useMemo(() => {
    let list = [...records];

    // Busca textual
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.evolution?.toLowerCase().includes(term) ||
          r.complaint?.toLowerCase().includes(term) ||
          r.assessment?.toLowerCase().includes(term) ||
          r.conduct?.toLowerCase().includes(term) ||
          r.procedureName?.toLowerCase().includes(term) ||
          r.guidance?.toLowerCase().includes(term) ||
          r.conclusion?.toLowerCase().includes(term)
      );
    }

    // Filtro por tipo
    if (selectedType !== 'ALL') {
      list = list.filter((r) => r.recordType === selectedType);
    }

    // Filtro por período
    if (selectedPeriod !== 'ALL') {
      const now = new Date();
      list = list.filter((r) => {
        if (!r.recordDate) return true;
        const recDate = new Date(r.recordDate);
        const diffDays = (now.getTime() - recDate.getTime()) / (1000 * 3600 * 24);

        if (selectedPeriod === '30') return diffDays <= 30;
        if (selectedPeriod === '90') return diffDays <= 90;
        if (selectedPeriod === '180') return diffDays <= 180;
        if (selectedPeriod === 'THIS_YEAR') return recDate.getFullYear() === now.getFullYear();
        return true;
      });
    }

    // Ordenação
    list.sort((a, b) => {
      const dateA = a.recordDate + (a.recordTime || '00:00');
      const dateB = b.recordDate + (b.recordTime || '00:00');
      const dateOrder = sortOrder === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
      if (dateOrder) return dateOrder;

      const duplicateA = possibleDuplicates.get(a.id);
      const duplicateB = possibleDuplicates.get(b.id);
      const groupA = duplicateA?.groupId || `record:${a.id}`;
      const groupB = duplicateB?.groupId || `record:${b.id}`;
      const groupOrder = groupA.localeCompare(groupB);
      return groupOrder || (duplicateA?.position || 0) - (duplicateB?.position || 0);
    });

    return list;
  }, [records, searchTerm, selectedType, selectedPeriod, sortOrder, possibleDuplicates]);

  const handlePrint = () => {
    printClinicalDossier({
      patient,
      records: filteredRecords,
      attachments,
      organization: db.getOrg(),
      professional: db.getProfessional(),
      filterDescription: selectedType !== 'ALL' ? `Tipo: ${selectedType}` : undefined,
    });
  };

  const getTypeBadgeClass = (type: ClinicalRecordType) => {
    switch (type) {
      case 'AVALIACAO':
      case 'CONSULTA_INICIAL':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'PROCEDIMENTO':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'RETORNO':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'CONCLUSAO':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'INTERCORRENCIA':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Filtros e Ações Padronizada */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row gap-3.5 items-stretch lg:items-center justify-between">
          {/* Busca Textual */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar em queixa, avaliação, conduta, evolução..."
              className="w-full pl-10 pr-3.5 py-2 text-xs sm:text-sm font-medium border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
            />
          </div>

          {/* Filtros Dropdown Customizados */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filtro de Tipo */}
            <div className="w-full sm:w-48">
              <CustomSelect
                value={selectedType}
                onChange={(val) => setSelectedType(val)}
                options={TYPE_FILTER_OPTIONS}
                placeholder="Tipo"
              />
            </div>

            {/* Filtro de Período */}
            <div className="w-full sm:w-40">
              <CustomSelect
                value={selectedPeriod}
                onChange={(val) => setSelectedPeriod(val)}
                options={PERIOD_FILTER_OPTIONS}
                placeholder="Período"
              />
            </div>

            {/* Ordenação */}
            <div className="w-full sm:w-36">
              <CustomSelect
                value={sortOrder}
                onChange={(val) => setSortOrder(val as 'desc' | 'asc')}
                options={SORT_OPTIONS}
                placeholder="Ordenação"
              />
            </div>

            {/* Exportar Prontuário PDF */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-2xs hover:border-slate-300 shrink-0"
              title="Gerar Prontuário para Impressão ou PDF"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Exportar PDF</span>
            </button>

            {/* Nova Evolução */}
            <button
              type="button"
              onClick={onOpenNewRecordModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Nova Evolução</span>
            </button>
          </div>
        </div>
      </div>

      {duplicateGroupCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-amber-950" role="status" data-testid="clinical-duplicate-review-banner">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
          <div className="text-xs leading-relaxed">
            <p className="font-bold">{duplicateGroupCount} grupo(s) com possíveis procedimentos duplicados</p>
            <p className="text-amber-800">Os procedimentos com os mesmos dados estão conectados para conferência. A especialidade e os dados clínicos da planilha foram preservados; nenhum registro foi excluído ou mesclado.</p>
          </div>
        </div>
      )}

      {/* Lista da Linha do Tempo */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-2xs">
          <div className="w-14 h-14 bg-teal-50 border border-teal-100 rounded-2xl flex items-center justify-center text-teal-600 mx-auto mb-4">
            <Stethoscope className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold text-slate-800">Nenhum registro clínico encontrado</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
            {records.length === 0
              ? 'Este paciente ainda não possui nenhuma evolução clínica registrada no prontuário.'
              : 'Nenhum registro corresponde aos filtros ou ao termo de busca informado.'}
          </p>
          <button
            type="button"
            onClick={onOpenNewRecordModal}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Adicionar Nova Evolução</span>
          </button>
        </div>
      ) : (
        <div className="relative pl-7 space-y-6 before:absolute before:left-3 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
          {filteredRecords.map((record, recordIndex) => {
            const isDraft = record.status === 'DRAFT';
            const isAmended = record.status === 'AMENDED';
            const isVoided = record.status === 'VOIDED';
            const isExpanded = expandedRecordIds[record.id] ?? true;
            // Histórico legado (migração de sistema anterior): status técnico
            // interno é sempre FINALIZED (só para nunca entrar no fluxo de
            // rascunhos editáveis/excluíveis), mas isso NÃO deve ser
            // apresentado como "Finalizado" quando o legado estava em
            // andamento — a apresentação prioriza legacyStatus. Não altera
            // isDraft/isAmended/isVoided nem nenhum contador/filtro existente.
            const isLegacyImport = record.origin === 'IMPORT' && Boolean(record.legacyStatus);
            const legacyStatusLabel = isLegacyImport ? `${record.legacyStatus} (legado)` : null;

            // Anexos vinculados a este registro específico
            const recordAttachments = attachments.filter((a) => a.clinicalRecordId === record.id);
            const duplicateInfo = possibleDuplicates.get(record.id);
            const nextDuplicateInfo = filteredRecords[recordIndex + 1]
              ? possibleDuplicates.get(filteredRecords[recordIndex + 1].id)
              : undefined;
            const connectsToNextDuplicate = Boolean(
              duplicateInfo && duplicateInfo.reviewStatus !== 'DISTINCT_RECORDS' &&
              nextDuplicateInfo?.groupId === duplicateInfo.groupId && nextDuplicateInfo.reviewStatus !== 'DISTINCT_RECORDS'
            );

            return (
              <div key={record.id} className="relative group">
                {connectsToNextDuplicate && (
                  <span aria-hidden="true" className="absolute -left-[20px] top-10 bottom-[-3.375rem] z-0 border-l-2 border-dashed border-amber-400" data-testid="clinical-duplicate-connector" />
                )}
                {/* Marcador na Linha do Tempo */}
                <div
                  className={`absolute -left-[29px] top-5 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center shadow-2xs ${
                    isVoided
                      ? 'border-rose-400 text-rose-500'
                      : isDraft
                      ? 'border-amber-500 text-amber-500'
                      : isAmended
                      ? 'border-indigo-500 text-indigo-500'
                      : duplicateInfo
                      ? 'border-amber-500 text-amber-600'
                      : 'border-teal-600 text-teal-600'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    {duplicateInfo && duplicateInfo.reviewStatus !== 'DISTINCT_RECORDS' ? (
                      duplicateInfo.position === duplicateInfo.count
                        ? <ArrowUp className="w-3 h-3 text-amber-600" aria-hidden="true" />
                        : <ArrowDown className="w-3 h-3 text-amber-600" aria-hidden="true" />
                    ) : (
                      <div className={`w-2 h-2 rounded-full ${
                        isVoided ? 'bg-rose-500' : isDraft ? 'bg-amber-500' : isAmended ? 'bg-indigo-500' : 'bg-teal-600'
                      }`} />
                    )}
                  </div>
                </div>

                {/* Card de Evolução Refinado */}
                <div
                  className={`rounded-2xl border shadow-2xs transition-all overflow-hidden ${
                    isVoided
                      ? 'bg-slate-50/70 border-rose-200/80 opacity-90'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Cabeçalho do Card */}
                  <div className="px-5 py-4 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${getTypeBadgeClass(
                          record.recordType
                        )}`}
                      >
                        {record.recordType.replace('_', ' ')}
                      </span>

                      {isVoided && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                          <AlertOctagon className="w-3 h-3 text-rose-600" />
                          REGISTRO INVALIDADO
                        </span>
                      )}

                      {isDraft && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <AlertCircle className="w-3 h-3 text-amber-600" />
                          RASCUNHO
                        </span>
                      )}

                      {isAmended && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                          <History className="w-3 h-3 text-indigo-600" />
                          RETIFICADO
                        </span>
                      )}

                      {!isDraft && !isAmended && !isVoided && isLegacyImport && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300"
                          title="Histórico importado de um sistema anterior — o status técnico interno é apenas para não entrar no fluxo de rascunhos atuais."
                        >
                          <Archive className="w-3.5 h-3.5 text-slate-500" />
                          {legacyStatusLabel?.toUpperCase()}
                        </span>
                      )}

                      {!isDraft && !isAmended && !isVoided && !isLegacyImport && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          FINALIZADO
                        </span>
                      )}

                      {record.procedureName && (
                        <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-lg border border-teal-100">
                          {record.procedureName}
                        </span>
                      )}

                      {record.origin === 'IMPORT' && record.importMetadata?.specialty && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-800 text-[10px] font-semibold">
                          Especialidade: {record.importMetadata.specialty}
                        </span>
                      )}

                      {duplicateInfo && (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${duplicateInfo.reviewStatus === 'CONFIRMED_DUPLICATE' ? 'bg-rose-50 text-rose-800 border-rose-200' : duplicateInfo.reviewStatus === 'DISTINCT_RECORDS' ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}
                          title="Conectado aos demais registros deste grupo para conferência. Nenhum registro foi mesclado ou excluído."
                          data-testid="possible-clinical-duplicate"
                        >
                          {duplicateInfo.reviewStatus === 'CONFIRMED_DUPLICATE' ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {duplicateInfo.reviewStatus === 'CONFIRMED_DUPLICATE'
                            ? `Duplicidade confirmada (${duplicateInfo.position}/${duplicateInfo.count})`
                            : duplicateInfo.reviewStatus === 'DISTINCT_RECORDS'
                              ? `Revisado: registros distintos (${duplicateInfo.position}/${duplicateInfo.count})`
                              : `Possível duplicidade (${duplicateInfo.position}/${duplicateInfo.count})`}
                        </span>
                      )}

                      {record.continuationOfRecordId && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-teal-50 text-teal-800 border border-teal-200"
                          title={`Continuação de ${
                            record.continuationDate
                              ? record.continuationDate.split('-').reverse().join('/')
                              : 'atendimento anterior'
                          }`}
                        >
                          <Sparkles className="w-3 h-3 text-teal-600" />
                          Continuação
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3.5 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {record.origin === 'IMPORT' && record.importMetadata?.dateSource === 'data_emissao'
                          ? `Guia emitida ${record.recordDate.split('-').reverse().join('/')}`
                          : record.recordDate.split('-').reverse().join('/')}
                      </div>

                      {record.recordTime && (
                        <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {record.recordTime}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleExpand(record.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {duplicateInfo?.position === 1 && (
                    <div className={`px-5 py-3 border-b ${duplicateInfo.reviewStatus === 'CONFIRMED_DUPLICATE' ? 'bg-rose-50/70 border-rose-100' : duplicateInfo.reviewStatus === 'DISTINCT_RECORDS' ? 'bg-slate-50 border-slate-100' : 'bg-amber-50/60 border-amber-100'}`} data-testid="clinical-duplicate-review-actions">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-700">
                          <strong>{duplicateInfo.reviewStatus === 'CONFIRMED_DUPLICATE' ? 'Grupo confirmado como duplicado.' : duplicateInfo.reviewStatus === 'DISTINCT_RECORDS' ? 'Grupo revisado: os registros são distintos.' : 'Confira os dados antes de classificar este grupo.'}</strong>
                          <span className="ml-1">A classificação fica salva no prontuário; nada é removido automaticamente.</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={reviewingDuplicateGroupId === duplicateInfo.groupId} onClick={() => void handleDuplicateReview(duplicateInfo.groupId, 'CONFIRMED_DUPLICATE')} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                            <Check className="h-3.5 w-3.5" /> Confirmar duplicidade
                          </button>
                          <button type="button" disabled={reviewingDuplicateGroupId === duplicateInfo.groupId} onClick={() => void handleDuplicateReview(duplicateInfo.groupId, 'DISTINCT_RECORDS')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                            <CheckCircle2 className="h-3.5 w-3.5" /> São registros distintos
                          </button>
                        </div>
                      </div>
                      {duplicateReviewError && <p role="alert" className="mt-2 text-[11px] font-medium text-rose-700">{duplicateReviewError}</p>}
                    </div>
                  )}

                  {/* Corpo do Registro com Espaçamento Amplo */}
                  <div className="p-5 sm:p-6 space-y-4">
                    {/* Alerta de Registro Invalidado */}
                    {isVoided && (
                      <div className="p-3.5 bg-rose-50/80 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-rose-800">
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                          Registro Clínico Invalidado
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Invalidado por <strong>{record.voidedByName || 'Profissional'}</strong> em{' '}
                          {record.voidedAt ? new Date(record.voidedAt).toLocaleString('pt-BR') : 'Data não informada'}.
                        </p>
                        {record.voidReason && (
                          <p className="text-[11px] text-slate-700 font-medium pt-1 border-t border-rose-200/60">
                            <strong>Motivo:</strong> {record.voidReason}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Queixa Principal */}
                    {record.complaint && (
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Queixa Principal / Motivo da Consulta:
                        </span>
                        <p className="text-xs sm:text-sm text-slate-800 font-medium">{record.complaint}</p>
                      </div>
                    )}

                    {/* Avaliação Clínica */}
                    {record.assessment && (
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          Avaliação Clínica / Diagnóstico:
                        </span>
                        <p className="text-xs sm:text-sm text-slate-800 font-medium">{record.assessment}</p>
                      </div>
                    )}

                    {/* Evolução Principal */}
                    <div>
                      <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block mb-1.5">
                        Evolução Clínica / Procedimento Realizado:
                      </span>
                      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-100 text-xs sm:text-sm text-slate-900 whitespace-pre-line leading-relaxed font-sans">
                        {record.evolution}
                      </div>
                    </div>

                    {record.origin === 'IMPORT' && (
                      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-slate-100 bg-white px-4 py-3 text-[11px] text-slate-600" data-testid="legacy-record-source-details">
                        {record.importMetadata?.specialty && <span><strong className="text-slate-700">Especialidade:</strong> {record.importMetadata.specialty}</span>}
                        {record.legacyTussCode && <span><strong className="text-slate-700">TUSS:</strong> {record.legacyTussCode}</span>}
                        {record.toothNumber && <span><strong className="text-slate-700">Dente/região:</strong> {record.toothNumber}</span>}
                        {record.toothFace && <span><strong className="text-slate-700">Face:</strong> {record.toothFace}</span>}
                        {record.importMetadata?.emittedAt && <span><strong className="text-slate-700">Emissão:</strong> {formatLegacySourceDate(record.importMetadata.emittedAt)}</span>}
                        {record.importMetadata?.performedAt && <span><strong className="text-slate-700">Realização:</strong> {formatLegacySourceDate(record.importMetadata.performedAt)}</span>}
                        {record.importMetadata?.realizationLaunchedAt && <span><strong className="text-slate-700">Lançamento:</strong> {record.importMetadata.realizationLaunchedAt}</span>}
                        {record.importMetadata?.finalizedByName && <span><strong className="text-slate-700">Finalizado por:</strong> {record.importMetadata.finalizedByName}</span>}
                        {record.importMetadata?.guideDescription && record.importMetadata.guideDescription !== record.procedureName && (
                          <span><strong className="text-slate-700">Descrição da guia:</strong> {record.importMetadata.guideDescription}</span>
                        )}
                        {record.importMetadata?.proceduresText && record.importMetadata.proceduresText !== record.evolution && (
                          <span className="basis-full"><strong className="text-slate-700">Procedimentos informados:</strong> {record.importMetadata.proceduresText}</span>
                        )}
                      </div>
                    )}

                    {isExpanded && (
                      <>
                        {/* Conduta */}
                        {record.conduct && (
                          <div>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                              Conduta Adotada:
                            </span>
                            <p className="text-xs sm:text-sm text-slate-800 font-medium">{record.conduct}</p>
                          </div>
                        )}

                        {/* Conclusão */}
                        {record.conclusion && (
                          <div>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                              Conclusão / Desfecho:
                            </span>
                            <p className="text-xs sm:text-sm text-slate-800 font-medium">{record.conclusion}</p>
                          </div>
                        )}

                        {/* Orientações */}
                        {record.guidance && (
                          <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100/80">
                            <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider block mb-1">
                              Orientações ao Paciente / Prescrições:
                            </span>
                            <p className="text-xs sm:text-sm text-blue-900 leading-relaxed font-medium">{record.guidance}</p>
                          </div>
                        )}

                        {/* Retorno */}
                        {record.returnDate && (
                          <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50/50 p-2.5 rounded-xl border border-teal-100/80">
                            <Calendar className="w-4 h-4 text-teal-600" />
                            <span>Retorno Recomendado: {record.returnDate}</span>
                          </div>
                        )}

                        {/* Anexos vinculados à evolução */}
                        {recordAttachments.length > 0 && (
                          <div className="pt-3 border-t border-slate-100">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                              Anexos Vinculados ({recordAttachments.length}):
                            </span>
                            <div className="flex flex-wrap gap-2.5">
                              {recordAttachments.map((att) => (
                                <TimelineAttachmentChip key={att.id} att={att} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Adendos / Retificações (Histórico Imutável) */}
                        {record.amendments && record.amendments.length > 0 && (
                          <div className="space-y-2.5 pt-3 border-t border-slate-100">
                            <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider block flex items-center gap-1.5">
                              <History className="w-3.5 h-3.5 text-indigo-600" />
                              Histórico Oficial de Retificações / Adendos:
                            </span>
                            {record.amendments.map((amend) => (
                              <div
                                key={amend.id}
                                className="p-4 bg-indigo-50/50 border-l-4 border-indigo-500 rounded-r-xl text-xs space-y-2"
                              >
                                <div className="flex items-center justify-between text-indigo-950 font-bold">
                                  <span>Por: {amend.createdByName}</span>
                                  <span className="text-slate-500 font-normal">
                                    {new Date(amend.createdAt).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                                <div className="text-indigo-900 font-medium">
                                  <strong>Motivo:</strong> {amend.reason}
                                </div>
                                <div className="text-slate-800 whitespace-pre-line bg-white/90 p-3 rounded-lg border border-indigo-100 leading-relaxed font-sans">
                                  {amend.content}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Rodapé do Card com Ações Padronizadas */}
                  <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-500">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Profissional:{' '}
                        <strong className="text-slate-700">{record.professionalName || 'Cirurgião-Dentista'}</strong>
                        {record.professionalCro ? ` • CRO-${record.professionalCro}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isVoided ? (
                        <>
                          {onSelectRecordDetails && (
                            <button
                              type="button"
                              onClick={() => onSelectRecordDetails(record)}
                              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
                            >
                              Ver Completo
                            </button>
                          )}
                        </>
                      ) : isDraft ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditDraftRecord(record)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-medium transition-all shadow-2xs"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onFinalizeRecord(record.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-semibold transition-all shadow-2xs"
                            title="Finalizar e tornar imutável"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Finalizar</span>
                          </button>

                          {/* Menu ••• de Ações para Rascunho */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuRecordId(openMenuRecordId === record.id ? null : record.id)
                              }
                              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors border border-transparent hover:border-slate-200"
                              title="Mais opções"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {openMenuRecordId === record.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-20"
                                  onClick={() => setOpenMenuRecordId(null)}
                                />
                                <div className="absolute right-0 bottom-full mb-1.5 z-30 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 text-xs animate-in fade-in zoom-in-95 duration-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuRecordId(null);
                                      onDeleteDraftRecord(record);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 text-left font-medium transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Excluir Rascunho</span>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </>
                      ) : (
                        /* FINALIZED ou AMENDED */
                        <>
                          {onFollowUpRecord && (
                            <button
                              type="button"
                              onClick={() => onFollowUpRecord(record)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl font-semibold transition-all shadow-2xs"
                              title="Adicionar nova evolução clínica dando continuidade a este atendimento"
                            >
                              <PlusCircle className="w-3.5 h-3.5 text-teal-600" />
                              <span>Nova Evolução</span>
                            </button>
                          )}

                          {duplicateInfo?.reviewStatus === 'CONFIRMED_DUPLICATE' && onOpenVoidModal && (
                            <button type="button" onClick={() => onOpenVoidModal(record, 'Duplicado confirmado após revisão do prontuário legado.')} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100" title="Invalidar este registro preservando o motivo na auditoria">
                              <AlertOctagon className="h-3.5 w-3.5" /> Invalidar como duplicado
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenAmendmentModal(record)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl font-semibold transition-all shadow-2xs"
                            title="Adicionar retificação formal sem alterar o texto original"
                          >
                            <History className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Retificar</span>
                          </button>

                          {onSelectRecordDetails && (
                            <button
                              type="button"
                              onClick={() => onSelectRecordDetails(record)}
                              className="px-3 py-1.5 text-slate-600 hover:text-slate-800 font-semibold transition-colors"
                            >
                              Ver Completo
                            </button>
                          )}

                          {/* Menu ••• de Ações para Finalizado ou Retificado */}
                          {onOpenVoidModal && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenMenuRecordId(openMenuRecordId === record.id ? null : record.id)
                                }
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors border border-transparent hover:border-slate-200"
                                title="Mais opções"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>

                              {openMenuRecordId === record.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-20"
                                    onClick={() => setOpenMenuRecordId(null)}
                                  />
                                  <div className="absolute right-0 bottom-full mb-1.5 z-30 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 text-xs animate-in fade-in zoom-in-95 duration-100">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuRecordId(null);
                                        onOpenVoidModal(record);
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 text-left font-medium transition-colors cursor-pointer"
                                    >
                                      <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                                      <span>Invalidar Registro</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CHIP DE ANEXO DA TIMELINE COM RESOLUÇÃO REATIVA DE URL
// ============================================================================

const TimelineAttachmentChip: React.FC<{ att: ClinicalAttachment }> = ({ att }) => {
  const { url, loading } = useResolvedFileUrl(att.storagePath, att.signedUrl);
  const isImage = isImageFile(att.mimeType, att.originalFilename);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!url) {
      e.preventDefault();
      resolvePrivateFileUrl(att.storagePath).then((freshUrl) => {
        if (freshUrl) {
          window.open(freshUrl, '_blank', 'noopener,noreferrer');
        }
      });
    }
  };

  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 transition-all shadow-2xs cursor-pointer group"
      title={url ? `Abrir ${att.originalFilename}` : 'Carregando link seguro...'}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
      ) : isImage ? (
        <ImageIcon className="w-4 h-4 text-teal-600 group-hover:scale-110 transition-transform" />
      ) : (
        <Paperclip className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
      )}
      <span className="max-w-[180px] truncate">{att.originalFilename}</span>
      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition-colors ml-0.5" />
    </a>
  );
};
