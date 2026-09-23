import React, { useState, useEffect } from 'react';
import { Patient, ClinicalRecord, ClinicalAttachment, ClinicalBeforeAfterPair } from '../../../types';
import { db } from '../../../lib/db';
import { useToast } from '../../UI';
import {
  AlertTriangle,
  HeartPulse,
  Pill,
  FileText,
  Clock,
  PlusCircle,
  Edit3,
  Calendar,
  CheckCircle2,
  Paperclip,
  Images,
  ArrowRight,
  ShieldCheck,
  Save,
  X,
  UserCog,
  Users,
} from 'lucide-react';

interface PatientSummaryTabProps {
  patient: Patient;
  clinicalRecords: ClinicalRecord[];
  attachments: ClinicalAttachment[];
  beforeAfterPairs: ClinicalBeforeAfterPair[];
  onOpenNewRecordModal: () => void;
  onOpenNewAttachmentModal: () => void;
  onNavigateToTab: (tabId: string) => void;
  onSelectRecordDetails?: (record: ClinicalRecord) => void;
  onSelectPatient?: (patientId: string) => void;
  // Responsável / Contato principal e "Responsável por" — recebidos como
  // props, derivados pelo pai (PatientsView.tsx) da MESMA guardianSummaries
  // usada na listagem/filtros/busca (fonte única de verdade; nenhum fetch
  // próprio aqui, para nunca ficar dessincronizado do resto da tela — ver
  // CLAUDE.md "Guardian / responsável e telefone compartilhado", bugfix de
  // hidratação após reutilizar responsável existente).
  guardianInfo?: { name: string; phone?: string; email?: string; relationshipType?: string } | null;
  dependents?: Array<{ patientId: string; name: string; relationshipType?: string }>;
}

export const PatientSummaryTab: React.FC<PatientSummaryTabProps> = ({
  patient,
  clinicalRecords,
  attachments,
  beforeAfterPairs,
  onOpenNewRecordModal,
  onOpenNewAttachmentModal,
  onNavigateToTab,
  onSelectRecordDetails,
  onSelectPatient,
  guardianInfo = null,
  dependents = [],
}) => {
  const toast = useToast();
  const [isEditingAlerts, setIsEditingAlerts] = useState(false);
  const [allergiesText, setAllergiesText] = useState((patient.allergies || []).join(', '));
  const [conditionsText, setConditionsText] = useState((patient.conditions || []).join(', '));
  const [medicationsText, setMedicationsText] = useState((patient.medications || []).join(', '));
  const [notesText, setNotesText] = useState(patient.clinicalNotes || '');
  const [isSavingAlerts, setIsSavingAlerts] = useState(false);

  // Evita vazamento de estado de edição ao trocar de paciente sem salvar/cancelar
  useEffect(() => {
    setIsEditingAlerts(false);
  }, [patient.id]);

  const handleSaveAlerts = async () => {
    setIsSavingAlerts(true);
    try {
      const allergies = allergiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const conditions = conditionsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const medications = medicationsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await db.updatePatientAsync(patient.id, {
        allergies,
        conditions,
        medications,
        clinicalNotes: notesText.trim() || undefined,
      });

      if (!res.success) {
        toast.error(res.error || 'Erro ao salvar alertas de saúde.');
        return;
      }

      toast.success('Alertas atualizados com sucesso.');
      setIsEditingAlerts(false);
    } catch (err: any) {
      console.error('Erro ao salvar alertas clínicos:', err);
      toast.error(err?.message || 'Erro inesperado ao salvar alertas de saúde.');
    } finally {
      setIsSavingAlerts(false);
    }
  };

  const latestRecord = clinicalRecords.length > 0 ? clinicalRecords[0] : null;

  return (
    <div className="space-y-6">
      {/* Responsável / Contato principal — só quando existir responsável
          (Fase 7: não mostrar card vazio para quem tem telefone próprio) */}
      {patient.phoneOwner === 'RESPONSIBLE' && guardianInfo && (
        <div className="bg-emerald-50/60 rounded-xl border border-emerald-200/70 shadow-xs p-5">
          <div className="flex items-center gap-2 mb-3">
            <UserCog className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-emerald-900">Responsável / Contato principal</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div>
              <span className="text-emerald-700/70 font-medium">Nome:</span>{' '}
              <span className="text-emerald-900 font-semibold">{guardianInfo.name}</span>
            </div>
            {guardianInfo.relationshipType && (
              <div>
                <span className="text-emerald-700/70 font-medium">Parentesco:</span>{' '}
                <span className="text-emerald-900 font-semibold">{guardianInfo.relationshipType}</span>
              </div>
            )}
            {patient.phone && (
              <div>
                <span className="text-emerald-700/70 font-medium">Telefone:</span>{' '}
                <span className="text-emerald-900 font-mono font-semibold">{patient.phone}</span>
              </div>
            )}
            {guardianInfo.email && (
              <div>
                <span className="text-emerald-700/70 font-medium">E-mail:</span>{' '}
                <span className="text-emerald-900 font-semibold">{guardianInfo.email}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Responsável por — quando este paciente também é responsável de
          outros (vínculo explícito por CPF, ver migration 20260923000000) */}
      {dependents.length > 0 && (
        <div className="bg-teal-50/60 rounded-xl border border-teal-200/70 shadow-xs p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-bold text-teal-900">Responsável por</h3>
          </div>
          <div className="flex flex-col gap-1.5">
            {dependents.map((dep) => (
              <button
                key={dep.patientId}
                type="button"
                disabled={!onSelectPatient}
                onClick={() => onSelectPatient?.(dep.patientId)}
                className={`text-left text-xs font-semibold text-teal-800 ${onSelectPatient ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
              >
                {dep.name}
                {dep.relationshipType ? ` — ${dep.relationshipType}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 1. Alertas Clínicos e Anamnese Rápida */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-semibold text-slate-800">Alertas de Saúde e Anamnese Rápida</h3>
          </div>
          {!isEditingAlerts ? (
            <button
              onClick={() => {
                setAllergiesText((patient.allergies || []).join(', '));
                setConditionsText((patient.conditions || []).join(', '));
                setMedicationsText((patient.medications || []).join(', '));
                setNotesText(patient.clinicalNotes || '');
                setIsEditingAlerts(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar Alertas
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditingAlerts(false)}
                className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 rounded-md"
                disabled={isSavingAlerts}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAlerts}
                disabled={isSavingAlerts}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                {isSavingAlerts ? 'Salvando...' : 'Salvar Alertas'}
              </button>
            </div>
          )}
        </div>

        {isEditingAlerts ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-rose-700 mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                Alergias (separadas por vírgula)
              </label>
              <input
                type="text"
                value={allergiesText}
                onChange={(e) => setAllergiesText(e.target.value)}
                placeholder=""
                className="w-full text-xs font-medium rounded-xl border border-rose-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 focus:outline-none transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Ex: Penicilina, Látex, Dipirona, AINEs.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5 text-amber-600" />
                Condições Médicas / Sistêmicas (separadas por vírgula)
              </label>
              <input
                type="text"
                value={conditionsText}
                onChange={(e) => setConditionsText(e.target.value)}
                placeholder=""
                className="w-full text-xs font-medium rounded-xl border border-amber-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:outline-none transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Ex: Hipertensão, Diabetes, Cardiopatia, Gestante.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5 text-blue-600" />
                Medicamentos de Uso Contínuo (separados por vírgula)
              </label>
              <input
                type="text"
                value={medicationsText}
                onChange={(e) => setMedicationsText(e.target.value)}
                placeholder=""
                className="w-full text-xs font-medium rounded-xl border border-blue-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Ex: Losartana 50mg, Metformina, Anticoagulantes.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Observações Clínicas / Cuidados Especiais
              </label>
              <input
                type="text"
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder=""
                className="w-full text-xs font-medium rounded-xl border border-slate-200 px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:outline-none transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Anotações de precauções e cuidados no atendimento.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Alergias */}
            <div className="p-3.5 rounded-xl bg-red-50/60 border border-red-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-800 uppercase mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                Alergias
              </div>
              {patient.allergies && patient.allergies.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {patient.allergies.map((a, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-800 border border-red-200"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-red-600/70 italic">Nenhuma alergia informada</p>
              )}
            </div>

            {/* Condições Médicas */}
            <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase mb-2">
                <HeartPulse className="w-4 h-4 text-amber-600" />
                Condições Médicas
              </div>
              {patient.conditions && patient.conditions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {patient.conditions.map((c, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-600/70 italic">Nenhuma condição cadastrada</p>
              )}
            </div>

            {/* Medicamentos */}
            <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800 uppercase mb-2">
                <Pill className="w-4 h-4 text-blue-600" />
                Medicamentos Contínuos
              </div>
              {patient.medications && patient.medications.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {patient.medications.map((m, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-blue-600/70 italic">Nenhum medicamento informado</p>
              )}
            </div>

            {/* Observações Clínicas */}
            {patient.clinicalNotes && (
              <div className="md:col-span-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <span className="font-semibold text-slate-800 mr-2">Observações Adicionais:</span>
                {patient.clinicalNotes}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Métricas Rápidas do Paciente */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase">Evoluções Clínicas</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{clinicalRecords.length}</div>
          <div className="text-xs text-slate-500 mt-1">Registros no prontuário</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase">Documentos & Fotos</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{attachments.length}</div>
          <div className="text-xs text-slate-500 mt-1">Anexos armazenados</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase">Antes / Depois</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{beforeAfterPairs.length}</div>
          <div className="text-xs text-slate-500 mt-1">Comparativos criados</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-medium text-slate-500 uppercase">Último Atendimento</div>
          <div className="text-lg font-bold text-slate-800 mt-1">
            {latestRecord?.recordDate
              ? latestRecord.recordDate.split('-').reverse().join('/')
              : 'Sem registros'}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {latestRecord ? latestRecord.recordType : 'Aguardando evolução'}
          </div>
        </div>
      </div>

      {/* 3. Ações Rápidas de Prontuário */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onOpenNewRecordModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm rounded-xl transition-colors shadow-xs"
        >
          <PlusCircle className="w-4 h-4" />
          Nova Evolução Clínica
        </button>

        <button
          onClick={onOpenNewAttachmentModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-sm rounded-xl transition-colors shadow-xs"
        >
          <Paperclip className="w-4 h-4 text-slate-500" />
          Novo Anexo / Documento
        </button>

        <button
          onClick={() => onNavigateToTab('clinical')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-sm rounded-xl transition-colors shadow-xs ml-auto"
        >
          Ver Linha do Tempo Completa
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 4. Última Evolução Clínica Registrada */}
      {latestRecord ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              <h4 className="text-sm font-semibold text-slate-800">Última Evolução Clínica Registrada</h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">
                {latestRecord.recordDate.split('-').reverse().join('/')}
                {latestRecord.recordTime ? ` às ${latestRecord.recordTime}` : ''}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-md font-semibold ${
                  latestRecord.status === 'FINALIZED'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : latestRecord.status === 'AMENDED'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                }`}
              >
                {latestRecord.status === 'FINALIZED'
                  ? 'FINALIZADO'
                  : latestRecord.status === 'AMENDED'
                  ? 'RETIFICADO'
                  : 'RASCUNHO'}
              </span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            {latestRecord.procedureName && (
              <div className="font-semibold text-teal-700">{latestRecord.procedureName}</div>
            )}
            {latestRecord.complaint && (
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase block">Queixa Principal:</span>
                <span className="text-slate-700">{latestRecord.complaint}</span>
              </div>
            )}
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase block">Evolução:</span>
              <p className="text-slate-800 whitespace-pre-line bg-slate-50/60 p-3 rounded-lg border border-slate-100">
                {latestRecord.evolution}
              </p>
            </div>
            {latestRecord.guidance && (
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase block">Orientações:</span>
                <span className="text-slate-700">{latestRecord.guidance}</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Profissional: {latestRecord.professionalName || 'Cirurgião-Dentista'}
              {latestRecord.professionalCro ? ` • ${latestRecord.professionalCro}` : ''}
            </span>
            {onSelectRecordDetails && (
              <button
                onClick={() => onSelectRecordDetails(latestRecord)}
                className="text-teal-600 hover:text-teal-700 font-medium"
              >
                Visualizar Detalhes
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <FileText className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">Nenhum atendimento clínico registrado</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Comece registrando a consulta inicial, avaliação ou evolução do paciente para manter o prontuário odontológico completo.
          </p>
          <button
            onClick={onOpenNewRecordModal}
            className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            Adicionar Primeira Evolução
          </button>
        </div>
      )}
    </div>
  );
};
