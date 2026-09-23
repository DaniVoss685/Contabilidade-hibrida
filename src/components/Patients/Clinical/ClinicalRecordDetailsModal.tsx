import React from 'react';
import { ClinicalRecord, ClinicalAttachment, Patient } from '../../../types';
import {
  X,
  FileText,
  Calendar,
  Clock,
  User,
  ShieldCheck,
  History,
  AlertCircle,
  AlertOctagon,
  Paperclip,
  Printer,
  ExternalLink,
  Image as ImageIcon,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { printClinicalDossier } from '../../../lib/clinicalPdfService';
import { db } from '../../../lib/db';
import { useResolvedFileUrl } from '../../../hooks/useResolvedFileUrl';
import { isImageFile } from '../../../lib/storageService';

interface ClinicalRecordDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ClinicalRecord | null;
  patient: Patient;
  attachments?: ClinicalAttachment[];
}

export const ClinicalRecordDetailsModal: React.FC<ClinicalRecordDetailsModalProps> = ({
  isOpen,
  onClose,
  record,
  patient,
  attachments = [],
}) => {
  if (!isOpen || !record) return null;

  const recordAttachments = attachments.filter((a) => a.clinicalRecordId === record.id);

  const handlePrint = () => {
    printClinicalDossier({
      patient,
      records: [record],
      attachments: recordAttachments,
      organization: db.getOrg(),
      professional: db.getProfessional(),
      filterDescription: `Atendimento de ${record.recordDate.split('-').reverse().join('/')}`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200">
                {record.recordType.replace('_', ' ')}
              </span>
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-lg font-bold ${
                  record.status === 'VOIDED'
                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                    : record.origin === 'IMPORT' && record.legacyStatus
                    ? 'bg-slate-100 text-slate-700 border border-slate-300'
                    : record.status === 'FINALIZED'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : record.status === 'AMENDED'
                    ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
                title={
                  record.origin === 'IMPORT' && record.legacyStatus
                    ? 'Histórico importado de um sistema anterior — o status técnico interno é apenas para não entrar no fluxo de rascunhos atuais.'
                    : undefined
                }
              >
                {record.status === 'VOIDED'
                  ? 'REGISTRO INVALIDADO'
                  : record.origin === 'IMPORT' && record.legacyStatus
                  ? `${record.legacyStatus.toUpperCase()} (LEGADO)`
                  : record.status === 'FINALIZED'
                  ? 'FINALIZADO'
                  : record.status === 'AMENDED'
                  ? 'RETIFICADO'
                  : 'RASCUNHO'}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-800">
              Atendimento de {record.recordDate.split('-').reverse().join('/')}
              {record.recordTime ? ` às ${record.recordTime}` : ''}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Paciente: <strong className="text-slate-700">{patient.name}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              title="Imprimir este atendimento"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="px-6 py-6 sm:px-8 overflow-y-auto space-y-5 flex-1 text-sm">
          {/* Alerta de Invalidação */}
          {record.status === 'VOIDED' && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-rose-800">
                <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
                Registro Clínico Invalidado
              </div>
              <p className="leading-relaxed">
                Este registro foi invalidado por <strong>{record.voidedByName || 'Profissional'}</strong> em{' '}
                {record.voidedAt ? new Date(record.voidedAt).toLocaleString('pt-BR') : 'Data não informada'}.
              </p>
              {record.voidReason && (
                <p className="mt-1.5 pt-1.5 border-t border-rose-200 text-slate-800 font-medium leading-relaxed">
                  <strong className="text-rose-900">Motivo da Invalidação:</strong> {record.voidReason}
                </p>
              )}
            </div>
          )}

          {/* Continuação de Atendimento */}
          {record.continuationOfRecordId && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
              <span>
                Continuação do atendimento de{' '}
                <strong>
                  {record.continuationDate
                    ? record.continuationDate.split('-').reverse().join('/')
                    : 'atendimento anterior'}
                </strong>
              </span>
            </div>
          )}

          {record.procedureName && (
            <div className="p-3.5 bg-teal-50/50 border border-teal-100 rounded-xl text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 block mb-0.5">
                Procedimento Realizado:
              </span>
              <span className="text-sm font-bold text-teal-900">{record.procedureName}</span>
            </div>
          )}

          {record.complaint && (
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Queixa Principal / Motivo da Consulta:
              </span>
              <p className="text-xs sm:text-sm font-medium text-slate-800 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                {record.complaint}
              </p>
            </div>
          )}

          {record.assessment && (
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Avaliação Clínica / Diagnóstico:
              </span>
              <p className="text-xs sm:text-sm font-medium text-slate-800 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                {record.assessment}
              </p>
            </div>
          )}

          <div>
            <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider block mb-1.5">
              Evolução do Atendimento / Descrição Clínica:
            </span>
            <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200 text-xs sm:text-sm text-slate-900 whitespace-pre-line leading-relaxed font-sans">
              {record.evolution}
            </div>
          </div>

          {record.conduct && (
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Conduta Adotada:
              </span>
              <p className="text-xs sm:text-sm font-medium text-slate-800 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                {record.conduct}
              </p>
            </div>
          )}

          {record.conclusion && (
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Conclusão / Desfecho:
              </span>
              <p className="text-xs sm:text-sm font-medium text-slate-800 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                {record.conclusion}
              </p>
            </div>
          )}

          {record.guidance && (
            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100/80">
              <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider block mb-1">
                Orientações ao Paciente / Prescrições:
              </span>
              <p className="text-xs sm:text-sm font-medium text-blue-900 leading-relaxed font-sans">{record.guidance}</p>
            </div>
          )}

          {record.returnDate && (
            <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50/50 p-3 rounded-xl border border-teal-100">
              <Calendar className="w-4 h-4 text-teal-600" />
              <span>Retorno Recomendado: {record.returnDate}</span>
            </div>
          )}

              {/* Anexos */}
          {recordAttachments.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                Anexos Vinculados ({recordAttachments.length}):
              </span>
              <div className="flex flex-wrap gap-2.5">
                {recordAttachments.map((att) => (
                  <RecordDetailAttachmentChip key={att.id} att={att} />
                ))}
              </div>
            </div>
          )}

          {/* Retificações */}
          {record.amendments && record.amendments.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-slate-100">
              <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider block flex items-center gap-1.5">
                <History className="w-4 h-4 text-indigo-600" />
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
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 sm:px-8 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" />
            <span>
              Profissional: <strong className="text-slate-700">{record.professionalName || 'Cirurgião-Dentista'}</strong>
              {record.professionalCro ? ` • CRO-${record.professionalCro}` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

const RecordDetailAttachmentChip: React.FC<{ att: ClinicalAttachment }> = ({ att }) => {
  const { url, loading } = useResolvedFileUrl(att.storagePath, att.signedUrl);
  const isImage = isImageFile(att.mimeType, att.originalFilename);

  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!url) {
          e.preventDefault();
        }
      }}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all shadow-2xs ${
        url
          ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 cursor-pointer'
          : 'bg-slate-50/50 border-slate-100 text-slate-400 cursor-wait'
      }`}
      title={url ? 'Abrir anexo em nova aba' : loading ? 'Gerando link seguro...' : 'Anexo temporariamente indisponível'}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
      ) : isImage ? (
        <ImageIcon className="w-4 h-4 text-teal-600" />
      ) : (
        <Paperclip className="w-4 h-4 text-blue-600" />
      )}
      <span className="max-w-[200px] truncate">{att.originalFilename}</span>
      {url && <ExternalLink className="w-3.5 h-3.5 text-slate-400 ml-0.5" />}
    </a>
  );
};

