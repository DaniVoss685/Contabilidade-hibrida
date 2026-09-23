import React, { useState, useEffect, useMemo } from 'react';
import {
  Patient,
  ClinicalRecord,
  ClinicalRecordType,
  ClinicalRecordStatus,
  ClinicalAttachmentType,
} from '../../../types';
import { db } from '../../../lib/db';
import { uploadClinicalAttachment, validateClinicalFile } from '../../../lib/storageService';
import { CustomSelect, SelectOption } from '../../UI/CustomSelect';
import { DatePicker } from '../../UI/DatePicker';
import {
  X,
  FileText,
  Clock,
  User,
  ShieldCheck,
  AlertCircle,
  Paperclip,
  Save,
  UploadCloud,
  Trash2,
  Stethoscope,
  Sparkles,
  Compass,
} from 'lucide-react';

interface ClinicalRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  recordToEdit?: ClinicalRecord | null;
  continuationRecord?: ClinicalRecord | null;
  onSaved: () => void;
}

const RECORD_TYPE_OPTIONS: SelectOption[] = [
  { value: 'PROCEDIMENTO', label: 'Procedimento Clínico / Cirúrgico', description: 'Execução de procedimento odontológico' },
  { value: 'CONSULTA_INICIAL', label: 'Consulta Inicial', description: 'Primeira consulta e acolhimento do paciente' },
  { value: 'AVALIACAO', label: 'Avaliação Clínica / Diagnóstico', description: 'Exame de diagnóstico e planejamento' },
  { value: 'RETORNO', label: 'Retorno / Revisão Pós-Operatória', description: 'Consulta de acompanhamento e revisão' },
  { value: 'PLANO_TRATAMENTO', label: 'Plano de Tratamento', description: 'Definição de etapas e cronograma' },
  { value: 'INTERCORRENCIA', label: 'Intercorrência / Urgência', description: 'Situações clínicas não programadas' },
  { value: 'OBSERVACAO', label: 'Observação Clínica', description: 'Anotações complementares gerais' },
  { value: 'CONCLUSAO', label: 'Conclusão / Alta Clínica', description: 'Encerramento de tratamento ou fase' },
  { value: 'OUTRO', label: 'Outro Registro', description: 'Outras anotações pertinentes' },
];

const ATTACHMENT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'PHOTO_BEFORE', label: 'Foto de Antes' },
  { value: 'PHOTO_AFTER', label: 'Foto de Depois' },
  { value: 'RADIOGRAPHY', label: 'Radiografia' },
  { value: 'EXAM', label: 'Exame / Tomografia' },
  { value: 'CONSENT_FORM', label: 'Termo de Consentimento' },
  { value: 'DOCUMENT', label: 'Documento / Laudo' },
  { value: 'OTHER', label: 'Outro Arquivo' },
];

export const ClinicalRecordModal: React.FC<ClinicalRecordModalProps> = ({
  isOpen,
  onClose,
  patient,
  recordToEdit,
  continuationRecord,
  onSaved,
}) => {
  const [recordType, setRecordType] = useState<ClinicalRecordType>('PROCEDIMENTO');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().split('T')[0]);
  const [recordTime, setRecordTime] = useState(
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
  const [procedureId, setProcedureId] = useState('');
  const [procedureName, setProcedureName] = useState('');
  const [complaint, setComplaint] = useState('');
  const [assessment, setAssessment] = useState('');
  const [evolution, setEvolution] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [guidance, setGuidance] = useState('');
  const [returnDate, setReturnDate] = useState('');

  // Anexos temporários
  const [pendingFiles, setPendingFiles] = useState<
    Array<{ file: File; attachmentType: ClinicalAttachmentType; caption: string }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const procedures = db.getProcedures();
  const professional = db.getProfessional();
  const user = db.getUser();

  const procedureOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'Nenhum procedimento do catálogo (digitar manualmente)' },
    ...procedures.map((p) => ({
      value: p.id,
      label: p.name,
      description: p.category ? `Categoria: ${p.category}` : undefined,
    })),
  ], [procedures]);

  useEffect(() => {
    if (recordToEdit) {
      setRecordType(recordToEdit.recordType || 'PROCEDIMENTO');
      setRecordDate(recordToEdit.recordDate || new Date().toISOString().split('T')[0]);
      setRecordTime(recordToEdit.recordTime || '');
      setProcedureId(recordToEdit.procedureId || '');
      setProcedureName(recordToEdit.procedureName || '');
      setComplaint(recordToEdit.complaint || '');
      setAssessment(recordToEdit.assessment || '');
      setEvolution(recordToEdit.evolution || '');
      setConclusion(recordToEdit.conclusion || '');
      setGuidance(recordToEdit.guidance || '');
      setReturnDate(recordToEdit.returnDate || '');
    } else if (continuationRecord) {
      setRecordType('RETORNO');
      setRecordDate(new Date().toISOString().split('T')[0]);
      setRecordTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setProcedureId(continuationRecord.procedureId || '');
      setProcedureName(continuationRecord.procedureName || '');
      setComplaint('');
      setAssessment('');
      setEvolution('');
      setConclusion('');
      setGuidance('');
      setReturnDate('');
    } else {
      setRecordType('PROCEDIMENTO');
      setRecordDate(new Date().toISOString().split('T')[0]);
      setRecordTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setProcedureId('');
      setProcedureName('');
      setComplaint('');
      setAssessment('');
      setEvolution('');
      setConclusion('');
      setGuidance('');
      setReturnDate('');
    }
    setPendingFiles([]);
    setErrorMessage(null);
  }, [recordToEdit, continuationRecord, isOpen]);

  if (!isOpen) return null;

  const handleProcedureSelect = (pId: string) => {
    setProcedureId(pId);
    const proc = procedures.find((p) => p.id === pId);
    if (proc) {
      setProcedureName(proc.name);
    } else {
      setProcedureName('');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const validation = validateClinicalFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Arquivo inválido');
      return;
    }

    let defaultType: ClinicalAttachmentType = 'DOCUMENT';
    if (file.type.startsWith('image/')) {
      defaultType = 'PHOTO_BEFORE';
    } else if (file.type === 'application/pdf') {
      defaultType = 'CONSENT_FORM';
    }

    setPendingFiles((prev) => [
      ...prev,
      { file, attachmentType: defaultType, caption: file.name.replace(/\.[^/.]+$/, '') },
    ]);
    setErrorMessage(null);
    e.target.value = '';
  };

  const handleRemovePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (targetStatus: ClinicalRecordStatus) => {
    if (!evolution.trim()) {
      setErrorMessage('O campo "Evolução Clínica" é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const activeTenant = (db as any).activeTenantId || 'tenant_demo';

      if (recordToEdit) {
        // Atualizar rascunho existente
        const updateRes = await db.updateClinicalRecord(recordToEdit.id, {
          recordType,
          procedureId: procedureId || undefined,
          procedureName: procedureName || undefined,
          recordDate,
          recordTime,
          complaint: complaint.trim() || undefined,
          assessment: assessment.trim() || undefined,
          evolution: evolution.trim(),
          conclusion: recordType === 'CONCLUSAO' ? conclusion.trim() || undefined : undefined,
          guidance: guidance.trim() || undefined,
          returnDate: returnDate.trim() || undefined,
        });

        if (!updateRes.success) {
          setErrorMessage(updateRes.error || 'Erro ao atualizar evolução.');
          setIsSubmitting(false);
          return;
        }

        if (targetStatus === 'FINALIZED') {
          const finalRes = await db.finalizeClinicalRecord(recordToEdit.id);
          if (!finalRes.success) {
            setErrorMessage(finalRes.error || 'Erro ao finalizar evolução.');
            setIsSubmitting(false);
            return;
          }
        }

        // Upload dos arquivos vinculados
        for (const item of pendingFiles) {
          const uploadRes = await uploadClinicalAttachment(
            item.file,
            activeTenant,
            patient.id,
            recordToEdit.id
          );
          if (uploadRes.success && uploadRes.data) {
            await db.addClinicalAttachment({
              tenantId: activeTenant,
              patientId: patient.id,
              clinicalRecordId: recordToEdit.id,
              storagePath: uploadRes.data.storagePath,
              originalFilename: uploadRes.data.originalFilename,
              mimeType: uploadRes.data.mimeType,
              sizeBytes: uploadRes.data.sizeBytes,
              attachmentType: item.attachmentType,
              caption: item.caption,
              date: recordDate,
              procedureId: procedureId || undefined,
              procedureName: procedureName || undefined,
              createdBy: user?.id || 'usr_01',
              signedUrl: uploadRes.data.signedUrl,
            });
          }
        }
      } else {
        // Criar novo registro
        const newRecordRes = await db.addClinicalRecord({
          tenantId: activeTenant,
          patientId: patient.id,
          professionalId: professional?.id || 'prof_01',
          professionalName: professional?.name || 'Cirurgião-Dentista',
          professionalCro: professional?.cro ? `${professional.croUf || 'SP'} ${professional.cro}` : undefined,
          recordType,
          procedureId: procedureId || undefined,
          procedureName: procedureName || undefined,
          recordDate,
          recordTime,
          complaint: complaint.trim() || undefined,
          assessment: assessment.trim() || undefined,
          evolution: evolution.trim(),
          conclusion: recordType === 'CONCLUSAO' ? conclusion.trim() || undefined : undefined,
          guidance: guidance.trim() || undefined,
          returnDate: returnDate.trim() || undefined,
          continuationOfRecordId: continuationRecord ? continuationRecord.id : undefined,
          continuationDate: continuationRecord ? continuationRecord.recordDate : undefined,
          status: targetStatus,
          createdBy: user?.id || 'usr_01',
          createdByName: user?.name || 'Cirurgião-Dentista',
        });

        if (!newRecordRes.success || !newRecordRes.record) {
          setErrorMessage(newRecordRes.error || 'Erro ao cadastrar evolução clínica.');
          setIsSubmitting(false);
          return;
        }

        const createdId = newRecordRes.record.id;

        // Upload dos arquivos vinculados
        for (const item of pendingFiles) {
          const uploadRes = await uploadClinicalAttachment(
            item.file,
            activeTenant,
            patient.id,
            createdId
          );
          if (uploadRes.success && uploadRes.data) {
            await db.addClinicalAttachment({
              tenantId: activeTenant,
              patientId: patient.id,
              clinicalRecordId: createdId,
              storagePath: uploadRes.data.storagePath,
              originalFilename: uploadRes.data.originalFilename,
              mimeType: uploadRes.data.mimeType,
              sizeBytes: uploadRes.data.sizeBytes,
              attachmentType: item.attachmentType,
              caption: item.caption,
              date: recordDate,
              procedureId: procedureId || undefined,
              procedureName: procedureName || undefined,
              createdBy: user?.id || 'usr_01',
              signedUrl: uploadRes.data.signedUrl,
            });
          }
        }
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro inesperado ao salvar evolução.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {recordToEdit ? 'Editar Rascunho de Evolução' : 'Nova Evolução Clínica Odontológica'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Paciente: <strong className="text-slate-700">{patient.name}</strong> • CPF: {patient.cpf || 'Não informado'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll Suave */}
        <div className="px-6 py-6 sm:px-8 overflow-y-auto space-y-7 flex-1">
          {continuationRecord && !recordToEdit && (
            <div className="p-3.5 bg-teal-50/80 border border-teal-200 rounded-xl text-xs text-teal-900 flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
              <div>
                <span>Continuação do atendimento de </span>
                <strong className="text-teal-950 font-bold">
                  {continuationRecord.recordDate.split('-').reverse().join('/')}
                </strong>
                {continuationRecord.procedureName ? (
                  <span> ({continuationRecord.procedureName})</span>
                ) : null}
                . O registro anterior permanecerá intacto preservando a ordem cronológica.
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          {/* BLOCO 1: DADOS DO ATENDIMENTO */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-600" />
                1. Dados do Atendimento
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Tipo de Atendimento */}
              <div className="md:col-span-6">
                <CustomSelect
                  label="Tipo de Atendimento / Registro"
                  required
                  options={RECORD_TYPE_OPTIONS}
                  value={recordType}
                  onChange={(val) => setRecordType(val as ClinicalRecordType)}
                  placeholder="Selecione o tipo..."
                />
              </div>

              {/* Data do Atendimento */}
              <div className="md:col-span-3">
                <DatePicker
                  label="Data do Atendimento"
                  required
                  value={recordDate}
                  onChange={setRecordDate}
                  placeholder="DD/MM/AAAA"
                />
              </div>

              {/* Horário */}
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Horário
                </label>
                <input
                  type="time"
                  value={recordTime}
                  onChange={(e) => setRecordTime(e.target.value)}
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Procedimento Vinculado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div>
                <CustomSelect
                  label="Procedimento do Catálogo (Opcional)"
                  options={procedureOptions}
                  value={procedureId}
                  onChange={handleProcedureSelect}
                  placeholder="Selecione um procedimento..."
                  searchable
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Vincule à tabela cadastrada da clínica para relatórios.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nome do Procedimento Realizado
                </label>
                <input
                  type="text"
                  value={procedureName}
                  onChange={(e) => {
                    setProcedureName(e.target.value);
                    if (!e.target.value) setProcedureId('');
                  }}
                  placeholder=""
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Pode ser preenchido livremente ou ajustado do catálogo.
                </p>
              </div>
            </div>
          </div>

          {/* BLOCO 2: REGISTRO CLÍNICO */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                2. Registro Clínico
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Queixa Principal
                </label>
                <input
                  type="text"
                  value={complaint}
                  onChange={(e) => setComplaint(e.target.value)}
                  placeholder=""
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Relato inicial de sintomas ou queixas expressas pelo paciente.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Avaliação Clínica / Diagnóstico
                </label>
                <input
                  type="text"
                  value={assessment}
                  onChange={(e) => setAssessment(e.target.value)}
                  placeholder=""
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Achados no exame intraoral, testes clínicos ou hipótese diagnóstica.
                </p>
              </div>
            </div>

            {/* Evolução Clínica (OBRIGATÓRIO - Concentra conduta, técnicas, materiais e desfecho) */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Evolução Clínica *
              </label>
              <textarea
                rows={5}
                value={evolution}
                onChange={(e) => setEvolution(e.target.value)}
                placeholder=""
                className="w-full text-xs font-medium rounded-xl border border-slate-200 p-3.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all font-sans leading-relaxed"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Descreva detalhadamente o atendimento: procedimento realizado, conduta adotada, técnicas empregadas, anestésicos, dentes tratados, materiais inseridos e resposta do paciente.
              </p>
            </div>

            {/* Conclusão Específica Dinâmica (SOMENTE para Tipo de Atendimento: CONCLUSAO) */}
            {recordType === 'CONCLUSAO' && (
              <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/70 space-y-2 animate-in fade-in duration-200">
                <label className="block text-xs font-bold text-amber-900">
                  Conclusão / Desfecho do Tratamento (Alta Clínica)
                </label>
                <textarea
                  rows={3}
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  placeholder=""
                  className="w-full text-xs font-medium rounded-xl border border-amber-200 p-3 bg-white text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:outline-none transition-all font-sans leading-relaxed"
                />
                <p className="text-[11px] text-amber-700">
                  Síntese de conclusão do plano de tratamento ou concessão de alta clínica odontológica.
                </p>
              </div>
            )}
          </div>

          {/* BLOCO 3: ORIENTAÇÕES E ACOMPANHAMENTO */}
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-teal-600" />
                3. Orientações e Acompanhamento
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Orientações ao Paciente / Prescrições
                </label>
                <input
                  type="text"
                  value={guidance}
                  onChange={(e) => setGuidance(e.target.value)}
                  placeholder=""
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Recomendações pós-operatórias, cuidados com higiene e medicações orientadas.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Retorno Recomendado
                </label>
                <input
                  type="text"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  placeholder=""
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Ex: Em 7 dias para revisão de pontos, ou data estimada de retorno.
                </p>
              </div>
            </div>

            {/* Anexos Vinculados dentro de Orientações e Acompanhamento */}
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-teal-600" />
                  Anexos Vinculados a este Atendimento
                </span>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-white hover:bg-teal-50 border border-teal-200 rounded-xl cursor-pointer transition-colors shadow-2xs">
                  <UploadCloud className="w-4 h-4 text-teal-600" />
                  <span>Selecionar Arquivo (JPG, PNG, PDF)</span>
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                    className="hidden"
                  />
                </label>
              </div>

              {pendingFiles.length > 0 ? (
                <div className="space-y-2.5 pt-1">
                  {pendingFiles.map((pf, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-xl bg-white border border-slate-200 text-xs shadow-2xs"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-slate-800 block truncate" title={pf.file.name}>
                          {pf.file.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {(pf.file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>

                      <div className="w-full sm:w-48">
                        <CustomSelect
                          options={ATTACHMENT_TYPE_OPTIONS}
                          value={pf.attachmentType}
                          onChange={(val) => {
                            const newType = val as ClinicalAttachmentType;
                            setPendingFiles((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, attachmentType: newType } : item))
                            );
                          }}
                          placeholder="Tipo do anexo"
                        />
                      </div>

                      <div className="flex-1">
                        <input
                          type="text"
                          value={pf.caption}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPendingFiles((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, caption: val } : item))
                            );
                          }}
                          placeholder="Legenda do arquivo..."
                          className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3 py-2 bg-white text-slate-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemovePendingFile(idx)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors self-end sm:self-center"
                        title="Remover anexo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic py-1">
                  Nenhum arquivo anexado a esta evolução. Opcionalmente adicione radiografias, fotos de antes/depois ou laudos em PDF.
                </p>
              )}
            </div>
          </div>
        </div>
        {/* Rodapé com Ações */}
        <div className="px-6 py-4 sm:px-8 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
              <User className="w-3.5 h-3.5" />
            </div>
            <span>
              Profissional: <strong className="text-slate-800">{professional?.name || 'Cirurgião-Dentista'}</strong>
              {professional?.cro ? ` • CRO-${professional.croUf || 'SP'} ${professional.cro}` : ''}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={() => handleSubmit('DRAFT')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all"
              title="Salva em rascunho permitindo futuras edições"
            >
              <Save className="w-3.5 h-3.5 text-slate-600" />
              <span>Salvar como Rascunho</span>
            </button>

            <button
              type="button"
              onClick={() => handleSubmit('FINALIZED')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-all shadow-xs"
              title="Assina e finaliza tornando a evolução estritamente imutável"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Salvando...' : 'Finalizar e Assinar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
