import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  Receipt,
  Building,
  User,
  PlusCircle,
  FileText,
  X,
  CreditCard,
  CheckCircle2,
  Pencil,
  MessageSquare,
  Cake,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Layers,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Paperclip,
  UploadCloud,
  Download,
} from 'lucide-react';
import { Patient, Sale, ClinicalRecord, ClinicalAttachment, ClinicalBeforeAfterPair } from '../../types';
import {
  formatCpf,
  formatCpfOrCnpj,
  formatPhone,
  formatCurrency,
  formatDateBr,
  calculateAge,
  calculateNextBirthday,
} from '../../lib/masks';
import {
  calculatePatientFinancialSummary,
  enhanceSaleHistoryItem,
  EnhancedSaleHistoryItem,
} from '../../lib/patientHistory';
import { db } from '../../lib/db';
import { SupabaseService } from '../../lib/supabaseClient';
import { filterPatientsByGuardian, searchPatientsWithGuardian, GuardianFilter } from '../../lib/patientGuardianDisplay';
import { useToast, SortableHeader } from '../UI';
import { useSortableData } from '../../hooks/useSortableData';
import { PatientModal } from '../Modals/PatientModal';
import { PatientProcedureModal } from './PatientProcedureModal';
import { PatientSummaryTab } from './Clinical/PatientSummaryTab';
import { PatientClinicalTimeline } from './Clinical/PatientClinicalTimeline';
import { ClinicalRecordModal } from './Clinical/ClinicalRecordModal';
import { ClinicalRecordDetailsModal } from './Clinical/ClinicalRecordDetailsModal';
import { ClinicalAmendmentModal } from './Clinical/ClinicalAmendmentModal';
import { ClinicalVoidModal } from './Clinical/ClinicalVoidModal';
import { ClinicalDeleteDraftModal } from './Clinical/ClinicalDeleteDraftModal';
import { ClinicalBeforeAfterView } from './Clinical/ClinicalBeforeAfterView';
import { ClinicalDocumentsView } from './Clinical/ClinicalDocumentsView';
import { PatientImportModal } from './Import/PatientImportModal';
import { PatientExportModal } from './Export/PatientExportModal';

interface PatientsViewProps {
  patients: Patient[];
  sales: Sale[];
  maskCpf: boolean;
  onOpenNewSaleForPatient?: (patientId: string) => void;
  onNavigateToWhatsApp?: (patientId: string) => void;
  initialOpenNewModal?: boolean;
  onClearAction?: () => void;
  initialSelectedPatientId?: string;
}

export const PatientsView: React.FC<PatientsViewProps> = ({
  patients,
  sales,
  maskCpf,
  onOpenNewSaleForPatient,
  onNavigateToWhatsApp,
  initialOpenNewModal = false,
  onClearAction,
  initialSelectedPatientId,
}) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    initialSelectedPatientId || patients[0]?.id || ''
  );
  const [refreshKey, setRefreshKey] = useState(0);

  // Aba ativa na Ficha do Paciente
  type PatientTab = 'RESUMO' | 'CLINICAL' | 'FINANCIAL' | 'DOCUMENTS' | 'BEFORE_AFTER';
  const [patientTab, setPatientTab] = useState<PatientTab>('RESUMO');

  // Modais Clínicos
  const [isClinicalRecordModalOpen, setIsClinicalRecordModalOpen] = useState(false);
  const [editingClinicalRecord, setEditingClinicalRecord] = useState<ClinicalRecord | null>(null);
  const [continuationClinicalRecord, setContinuationClinicalRecord] = useState<ClinicalRecord | null>(null);
  const [selectedRecordForDetails, setSelectedRecordForDetails] = useState<ClinicalRecord | null>(null);
  const [recordForAmendment, setRecordForAmendment] = useState<ClinicalRecord | null>(null);
  const [recordForVoid, setRecordForVoid] = useState<ClinicalRecord | null>(null);
  const [recordForDeleteDraft, setRecordForDeleteDraft] = useState<ClinicalRecord | null>(null);

  // Modais de Importação e Exportação
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Sync with external selection (e.g. from Ctrl+K global search)
  React.useEffect(() => {
    if (initialSelectedPatientId) {
      setSelectedPatientId(initialSelectedPatientId);
    }
  }, [initialSelectedPatientId]);

  // Modal state (create or edit)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(initialOpenNewModal);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  // Modal Central de Detalhes do Atendimento
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<EnhancedSaleHistoryItem | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  React.useEffect(() => {
    if (initialOpenNewModal) {
      setEditingPatient(null);
      setIsModalOpen(true);
      if (onClearAction) onClearAction();
    }
  }, [initialOpenNewModal, onClearAction]);

  const [, setWaPhotosTick] = useState(0);
  React.useEffect(() => {
    db.loadPatientWhatsAppPhotos().then(() => {
      setWaPhotosTick((t) => t + 1);
    });
  }, [refreshKey]);

  // Resumo de responsável (guardian) para todos os pacientes — 1 query,
  // alimenta badge na listagem, ficha, filtros e busca por nome do
  // responsável. Recarrega ao trocar de tenant/refresh (ex.: após salvar
  // paciente com novo responsável).
  const [guardianSummaries, setGuardianSummaries] = useState<{
    byPatientId: Record<string, { guardianId: string; guardianName: string; guardianPhone?: string; relationshipType?: string }>;
    guardianOfPatientId: Record<string, { dependents: Array<{ patientId: string; relationshipType?: string }> }>;
  }>({ byPatientId: {}, guardianOfPatientId: {} });

  React.useEffect(() => {
    const tenantId = db.getActiveTenantId();
    if (!tenantId) return;
    SupabaseService.getPatientGuardianSummaries(tenantId)
      .then(setGuardianSummaries)
      .catch(() => {});
  }, [refreshKey, patients.length]);

  const [guardianFilter, setGuardianFilter] = useState<GuardianFilter>('ALL');

  const filteredPatients = useMemo(() => {
    const searched = searchPatientsWithGuardian(patients, guardianSummaries, searchTerm);
    return filterPatientsByGuardian(searched, guardianSummaries, guardianFilter);
  }, [patients, searchTerm, guardianFilter, guardianSummaries]);

  const [patientSort, setPatientSort] = useState<'AZ' | 'ZA' | 'RECENT'>('AZ');

  const sortedPatients = useMemo(() => {
    return [...filteredPatients].sort((a, b) => {
      if (patientSort === 'AZ') {
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
      }
      if (patientSort === 'ZA') {
        return (b.name || '').localeCompare(a.name || '', 'pt-BR');
      }
      return (b.createdAt || b.id || '').localeCompare(a.createdAt || a.id || '');
    });
  }, [filteredPatients, patientSort]);

  // Paciente Ativo
  const activePatient = useMemo(() => {
    if (!selectedPatientId && sortedPatients.length > 0) {
      return sortedPatients[0];
    }
    return patients.find((p) => p.id === selectedPatientId) || sortedPatients[0] || null;
  }, [patients, sortedPatients, selectedPatientId]);

  // Responsável do paciente ativo e pacientes dos quais ele é responsável —
  // derivados da MESMA guardianSummaries usada na listagem/filtros/busca
  // (fonte única de verdade, ver PatientSummaryTab.tsx). Nomes dos
  // dependentes resolvidos localmente contra `patients`, sem query extra.
  const activeGuardianInfo = useMemo(() => {
    if (!activePatient) return null;
    const g = guardianSummaries.byPatientId[activePatient.id];
    if (!g) return null;
    return { name: g.guardianName, phone: g.guardianPhone, email: g.guardianEmail, relationshipType: g.relationshipType };
  }, [activePatient, guardianSummaries]);

  const activeDependents = useMemo(() => {
    if (!activePatient) return [];
    const entry = guardianSummaries.guardianOfPatientId[activePatient.id];
    if (!entry) return [];
    return entry.dependents.map((dep) => ({
      patientId: dep.patientId,
      name: patients.find((p) => p.id === dep.patientId)?.name || '—',
      relationshipType: dep.relationshipType,
    }));
  }, [activePatient, guardianSummaries, patients]);

  // Vendas do Paciente Ativo
  const patientSales = useMemo(() => {
    if (!activePatient) return [];
    return sales.filter((s) => s.patientId === activePatient.id);
  }, [sales, activePatient]);

  // Idade e Aniversário dinâmicos
  const patientAge = useMemo(() => calculateAge(activePatient?.birthDate), [activePatient?.birthDate]);
  const nextBirthday = useMemo(() => calculateNextBirthday(activePatient?.birthDate), [activePatient?.birthDate]);

  // Resumo Financeiro do Paciente (4 Cards Consolidados)
  const financialSummary = useMemo(() => {
    return calculatePatientFinancialSummary(patientSales);
  }, [patientSales]);

  // Histórico Enriquecido e Ordenação Decrescente por Data
  const enhancedHistoryItems = useMemo(() => {
    return patientSales
      .map((s) => enhanceSaleHistoryItem(s))
      .sort((a, b) => (b.serviceDate || '').localeCompare(a.serviceDate || ''));
  }, [patientSales]);

  type HistoryFilter = 'ALL' | 'PAID' | 'OPEN' | 'OVERDUE' | 'CPF' | 'CNPJ';
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('ALL');

  const filteredHistoryItems = useMemo(() => {
    switch (historyFilter) {
      case 'PAID':
        return enhancedHistoryItems.filter((i) => i.aggregatedStatus === 'PAGO');
      case 'OPEN':
        return enhancedHistoryItems.filter(
          (i) => i.aggregatedStatus === 'EM_ABERTO' || i.aggregatedStatus === 'PARCIAL'
        );
      case 'OVERDUE':
        return enhancedHistoryItems.filter((i) => i.aggregatedStatus === 'EM_ATRASO');
      case 'CPF':
        return enhancedHistoryItems.filter((i) => i.taxOrigin === 'CPF');
      case 'CNPJ':
        return enhancedHistoryItems.filter((i) => i.taxOrigin === 'CNPJ');
      default:
        return enhancedHistoryItems;
    }
  }, [enhancedHistoryItems, historyFilter]);

  const {
    sortedItems: displayHistoryItems,
    sortKey: historySortKey,
    sortDirection: historySortDirection,
    handleSort: handleHistorySort,
  } = useSortableData(filteredHistoryItems, {
    customComparators: {
      punctuality: (a, b) => (a.punctuality?.label || '').localeCompare(b.punctuality?.label || '', 'pt-BR'),
      totalValue: (a, b) => a.totalValue - b.totalValue,
    },
  });

  const handleOpenDetailsModal = (item: EnhancedSaleHistoryItem) => {
    setSelectedItemForDetails(item);
    setIsDetailsModalOpen(true);
  };

  // Carregamento dos dados clínicos do paciente ativo
  const patientClinicalRecords = useMemo(() => {
    if (!activePatient) return [];
    return db.getClinicalRecords(activePatient.id);
  }, [activePatient, refreshKey]);

  const patientAttachments = useMemo(() => {
    if (!activePatient) return [];
    return db.getClinicalAttachments(activePatient.id);
  }, [activePatient, refreshKey]);

  const patientBeforeAfterPairs = useMemo(() => {
    if (!activePatient) return [];
    return db.getBeforeAfterPairs(activePatient.id);
  }, [activePatient, refreshKey]);

  const handleFinalizeRecord = async (recordId: string) => {
    if (
      confirm(
        'Deseja realmente finalizar esta evolução clínica? Conforme exigência do CFO, após finalizado o registro torna-se imutável e correções deverão ser feitas via Adendo / Retificação.'
      )
    ) {
      const res = await db.finalizeClinicalRecord(recordId);
      if (!res.success) {
        toast.error(res.error || 'Erro ao finalizar evolução.');
      } else {
        toast.success('Evolução clínica finalizada e assinada com sucesso!');
        setRefreshKey((k) => k + 1);
      }
    }
  };

  const handleDeleteDraftRecord = async (recordId: string) => {
    if (confirm('Deseja realmente excluir este rascunho de evolução clínica?')) {
      const res = await db.deleteClinicalRecord(recordId);
      if (!res.success) {
        toast.error(res.error || 'Erro ao excluir rascunho.');
      } else {
        toast.success('Rascunho excluído com sucesso.');
        setRefreshKey((k) => k + 1);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header com Ações Globais */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            Gestão Integrada de Pacientes & Prontuário
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Prontuário clínico odontológico, anamnese, linha do tempo, antes/depois e controle financeiro
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Importar Planilha */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 shadow-2xs transition-all cursor-pointer"
            title="Importar pacientes e prontuários via planilha CSV ou Excel"
          >
            <UploadCloud className="w-4 h-4 text-teal-600" />
            <span>Importar Planilha</span>
          </button>

          {/* Exportar Base */}
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
            title="Exportar base de pacientes em CSV ou Excel"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Exportar</span>
          </button>

          {/* Cadastrar Paciente */}
          <button
            type="button"
            onClick={() => {
              setEditingPatient(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Paciente</span>
          </button>
        </div>
      </div>

      {/* Main Grid: List on Left, Detail on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Patient List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[680px] overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/50 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, CPF, tel. ou responsável..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] px-0.5">
              <span className="text-slate-400 font-medium">Ordem:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPatientSort('AZ')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    patientSort === 'AZ'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 bg-white border border-slate-200'
                  }`}
                  title="Ordenar Alfabeticamente A a Z"
                >
                  A → Z
                </button>
                <button
                  type="button"
                  onClick={() => setPatientSort('ZA')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    patientSort === 'ZA'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 bg-white border border-slate-200'
                  }`}
                  title="Ordenar Alfabeticamente Z a A"
                >
                  Z → A
                </button>
                <button
                  type="button"
                  onClick={() => setPatientSort('RECENT')}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    patientSort === 'RECENT'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 bg-white border border-slate-200'
                  }`}
                  title="Mais Recentes"
                >
                  Recentes
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] px-0.5">
              <span className="text-slate-400 font-medium">Responsável:</span>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {(
                  [
                    { key: 'ALL', label: 'Todos' },
                    { key: 'WITH_GUARDIAN', label: 'Com responsável' },
                    { key: 'WITHOUT_GUARDIAN', label: 'Sem responsável' },
                    { key: 'IS_GUARDIAN', label: 'Responsáveis' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setGuardianFilter(opt.key)}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                      guardianFilter === opt.key
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 bg-white border border-slate-200'
                    }`}
                    title={opt.label}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {sortedPatients.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Nenhum paciente encontrado.
              </div>
            ) : (
              sortedPatients.map((p) => {
                const isSelected = p.id === activePatient?.id;
                const initials = p.name
                  .split(' ')
                  .map((n) => n[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                const photoUrl = db.getEffectivePatientPhotoUrl(p);

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    className={`w-full p-3.5 text-left transition-all flex items-center justify-between cursor-pointer group ${
                      isSelected
                        ? 'bg-emerald-50/70 border-l-3 border-emerald-600'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden ${
                        isSelected ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={p.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          initials
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-xs text-slate-900 truncate">{p.name}</span>
                          {guardianSummaries.guardianOfPatientId[p.id] && (
                            <span
                              className="px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[9px] font-bold uppercase tracking-wide shrink-0"
                              title={`Responsável por ${guardianSummaries.guardianOfPatientId[p.id].dependents.length} paciente(s)`}
                            >
                              Responsável
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                          {p.documentType === 'CNPJ' ? 'CNPJ' : 'CPF'}: {formatCpfOrCnpj(p.cpf, maskCpf)}
                        </div>
                        {guardianSummaries.byPatientId[p.id] && (
                          <div className="text-[11px] text-emerald-700 mt-0.5 truncate">
                            Resp.: {guardianSummaries.byPatientId[p.id].guardianName}
                            {guardianSummaries.byPatientId[p.id].relationshipType
                              ? ` • ${guardianSummaries.byPatientId[p.id].relationshipType}`
                              : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      {p.phone && (
                        <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">{formatPhone(p.phone)}</span>
                      )}
                      {p.phoneOwner === 'RESPONSIBLE' && (
                        <span className="text-[9px] text-emerald-600 font-semibold hidden sm:inline">Tel. responsável</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingPatient(p);
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                        title="Editar paciente"
                        aria-label="Editar paciente"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Patient Details (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          {activePatient ? (
            <div className="space-y-6">
              {/* Profile Card Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-5 border-b border-slate-100 gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                    {db.getEffectivePatientPhotoUrl(activePatient) ? (
                      <img
                        src={db.getEffectivePatientPhotoUrl(activePatient)}
                        alt={activePatient.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      activePatient.name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-slate-900">{activePatient.name}</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Paciente Ativo
                      </span>

                      {/* Badge Comemorativo de Aniversário Próximo (dentro de 7 dias ou hoje) */}
                      {nextBirthday?.isUpcoming && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">
                          <Cake className="w-3 h-3 text-amber-600 shrink-0" />
                          {nextBirthday.daysUntil === 0
                            ? '🎉 Aniversário hoje!'
                            : nextBirthday.daysUntil === 1
                            ? '🎂 Aniversário amanhã!'
                            : `🎂 Aniversário em ${nextBirthday.daysUntil} dias`}
                        </span>
                      )}
                    </div>

                    {activePatient.phoneOwner === 'RESPONSIBLE' && guardianSummaries.byPatientId[activePatient.id] && (
                      <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200/70 text-[11px] text-emerald-800 font-sans w-fit">
                        <span className="font-bold">Contato principal:</span>{' '}
                        {guardianSummaries.byPatientId[activePatient.id].guardianName}
                        {guardianSummaries.byPatientId[activePatient.id].relationshipType
                          ? ` — ${guardianSummaries.byPatientId[activePatient.id].relationshipType}`
                          : ''}
                        {activePatient.phone && (
                          <span className="ml-1.5 font-mono">({formatPhone(activePatient.phone)})</span>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 mt-2 font-mono">
                      <span>{activePatient.documentType === 'CNPJ' ? 'CNPJ' : 'CPF'}: {formatCpfOrCnpj(activePatient.cpf, maskCpf)}</span>
                      {activePatient.phone && activePatient.phoneOwner !== 'RESPONSIBLE' && (
                        <span>Tel: {formatPhone(activePatient.phone)}</span>
                      )}
                      {activePatient.documentType === 'CNPJ' ? (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] font-sans font-semibold">
                          Pessoa Jurídica
                        </span>
                      ) : activePatient.birthDate ? (
                        <>
                          <span>Nascimento: {formatDateBr(activePatient.birthDate)}</span>
                          {patientAge !== null && <span>Idade: {patientAge} anos</span>}
                          {nextBirthday && (
                            <span className="text-slate-600 font-medium">
                              Próximo aniversário: {nextBirthday.formattedDate}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-[11px] font-sans">
                          Nascimento não informado (exigido ao editar)
                        </span>
                      )}
                      {activePatient.email && <span>Email: {activePatient.email}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPatient(activePatient);
                      setIsModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900 shadow-2xs cursor-pointer transition-all"
                    title="Editar paciente"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-500" />
                    <span>Editar Paciente</span>
                  </button>

                  {/* Botão de WhatsApp direto */}
                  {activePatient.phone && (
                    <a
                      href={`https://wa.me/55${activePatient.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 shadow-2xs cursor-pointer transition-all"
                      title="Conversar via WhatsApp"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      <span>WhatsApp</span>
                    </a>
                  )}

                  {onOpenNewSaleForPatient && (
                    <button
                      type="button"
                      onClick={() => onOpenNewSaleForPatient(activePatient.id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs hover:shadow cursor-pointer transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Nova Receita / Atendimento</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Navegação entre as 4 Abas Principais da Ficha do Paciente */}
              <div className="flex items-center gap-1 border-b border-slate-200 pb-0 overflow-x-auto text-xs font-bold scrollbar-none">
                <button
                  type="button"
                  onClick={() => setPatientTab('RESUMO')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    patientTab === 'RESUMO'
                      ? 'border-emerald-600 text-emerald-800 bg-emerald-50/40 rounded-t-lg'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <User className="w-4 h-4 text-emerald-600" />
                  <span>Resumo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPatientTab('CLINICAL')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    patientTab === 'CLINICAL'
                      ? 'border-teal-600 text-teal-800 bg-teal-50/40 rounded-t-lg'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-4 h-4 text-teal-600" />
                  <span>Prontuário Clínico ({patientClinicalRecords.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPatientTab('FINANCIAL')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    patientTab === 'FINANCIAL'
                      ? 'border-emerald-600 text-emerald-800 bg-emerald-50/40 rounded-t-lg'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  <span>Financeiro ({enhancedHistoryItems.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPatientTab('DOCUMENTS')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    patientTab === 'DOCUMENTS'
                      ? 'border-teal-600 text-teal-800 bg-teal-50/40 rounded-t-lg'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Paperclip className="w-4 h-4 text-blue-600" />
                  <span>Documentos ({patientAttachments.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPatientTab('BEFORE_AFTER')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    patientTab === 'BEFORE_AFTER'
                      ? 'border-teal-600 text-teal-800 bg-teal-50/40 rounded-t-lg'
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Antes / Depois ({patientBeforeAfterPairs.length})</span>
                </button>
              </div>

              {/* CONTEÚDO DA ABA RESUMO */}
              {patientTab === 'RESUMO' && (
                <PatientSummaryTab
                  patient={activePatient}
                  clinicalRecords={patientClinicalRecords}
                  attachments={patientAttachments}
                  beforeAfterPairs={patientBeforeAfterPairs}
                  onOpenNewRecordModal={() => {
                    setEditingClinicalRecord(null);
                    setContinuationClinicalRecord(null);
                    setIsClinicalRecordModalOpen(true);
                  }}
                  onOpenNewAttachmentModal={() => setPatientTab('DOCUMENTS')}
                  onNavigateToTab={(tabId) => {
                    if (tabId === 'clinical') setPatientTab('CLINICAL');
                    else if (tabId === 'documents') setPatientTab('DOCUMENTS');
                    else if (tabId === 'before_after') setPatientTab('BEFORE_AFTER');
                    else setPatientTab('RESUMO');
                  }}
                  onSelectRecordDetails={(rec) => setSelectedRecordForDetails(rec)}
                  onSelectPatient={(patientId) => setSelectedPatientId(patientId)}
                  guardianInfo={activeGuardianInfo}
                  dependents={activeDependents}
                />
              )}

              {/* CONTEÚDO DA ABA PRONTUÁRIO CLÍNICO */}
              {patientTab === 'CLINICAL' && (
                <PatientClinicalTimeline
                  patient={activePatient}
                  records={patientClinicalRecords}
                  attachments={patientAttachments}
                  onOpenNewRecordModal={() => {
                    setEditingClinicalRecord(null);
                    setContinuationClinicalRecord(null);
                    setIsClinicalRecordModalOpen(true);
                  }}
                  onEditDraftRecord={(rec) => {
                    setEditingClinicalRecord(rec);
                    setContinuationClinicalRecord(null);
                    setIsClinicalRecordModalOpen(true);
                  }}
                  onFinalizeRecord={handleFinalizeRecord}
                  onDeleteDraftRecord={(rec) => setRecordForDeleteDraft(rec)}
                  onOpenAmendmentModal={(rec) => setRecordForAmendment(rec)}
                  onOpenVoidModal={(rec) => setRecordForVoid(rec)}
                  onFollowUpRecord={(rec) => {
                    setEditingClinicalRecord(null);
                    setContinuationClinicalRecord(rec);
                    setIsClinicalRecordModalOpen(true);
                  }}
                  onSelectRecordDetails={(rec) => setSelectedRecordForDetails(rec)}
                />
              )}

              {/* CONTEÚDO DA ABA DOCUMENTOS & ANEXOS */}
              {patientTab === 'DOCUMENTS' && (
                <ClinicalDocumentsView
                  patient={activePatient}
                  attachments={patientAttachments}
                  onReload={() => setRefreshKey((k) => k + 1)}
                />
              )}

              {/* CONTEÚDO DA ABA ANTES / DEPOIS */}
              {patientTab === 'BEFORE_AFTER' && (
                <ClinicalBeforeAfterView
                  patient={activePatient}
                  pairs={patientBeforeAfterPairs}
                  attachments={patientAttachments}
                  onReload={() => setRefreshKey((k) => k + 1)}
                />
              )}

              {/* CONTEÚDO DA ABA FINANCEIRO */}
              {patientTab === 'FINANCIAL' && (
                <div className="space-y-6">
                  {/* Resumo Financeiro (4 Cards Elegantes) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3 h-3" /> Faturado via CPF
                  </div>
                  <div className="text-lg font-black text-emerald-950 mt-1.5 font-mono tabular-nums">
                    {formatCurrency(financialSummary.totalCpf)}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Receita Saúde (PF)</span>
                </div>

                <div className="p-4 bg-blue-50/50 border border-blue-200/80 rounded-2xl">
                  <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Building className="w-3 h-3" /> Faturado via CNPJ
                  </div>
                  <div className="text-lg font-black text-blue-950 mt-1.5 font-mono tabular-nums">
                    {formatCurrency(financialSummary.totalCnpj)}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">NFS-e Emitidas (PJ)</span>
                </div>

                <div className="p-4 bg-indigo-50/50 border border-indigo-200/80 rounded-2xl">
                  <div className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3" /> Total Recebido
                  </div>
                  <div className="text-lg font-black text-indigo-950 mt-1.5 font-mono tabular-nums">
                    {formatCurrency(financialSummary.totalReceived)}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Valores liquidados</span>
                </div>

                <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-2xl">
                  <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Receipt className="w-3 h-3" /> Saldo em Aberto
                  </div>
                  <div className="text-lg font-black text-amber-950 mt-1.5 font-mono tabular-nums">
                    {formatCurrency(financialSummary.totalBalance)}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Parcelas a receber</span>
                </div>
              </div>

              {/* Seção: COMPORTAMENTO DE PAGAMENTO (100% Métricas Objetivas) */}
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                      Comportamento de Pagamento
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Métricas puramente objetivas derivadas dos recebimentos liquidados e vencimentos
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Forma mais usada
                    </span>
                    <span className="text-xs font-black text-slate-800 block mt-1 truncate" title={financialSummary.behavior.mostUsedPaymentMethod}>
                      {financialSummary.behavior.mostUsedPaymentMethod}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Pago no prazo
                    </span>
                    <span className="text-xs font-black text-emerald-700 block mt-1">
                      {financialSummary.behavior.onTimeRate}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Atraso médio
                    </span>
                    <span className="text-xs font-black text-slate-800 block mt-1">
                      {financialSummary.behavior.averageDelayDays}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Pagamentos em atraso
                    </span>
                    <span className={`text-xs font-black block mt-1 ${
                      financialSummary.behavior.overdueCount > 0 ? 'text-rose-600' : 'text-slate-700'
                    }`}>
                      {financialSummary.behavior.overdueCount === 0 ? 'Sem atrasos' : `${financialSummary.behavior.overdueCount} em atraso`}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Saldo em aberto
                    </span>
                    <span className="text-xs font-black text-amber-900 block mt-1 font-mono">
                      {formatCurrency(financialSummary.behavior.openBalance)}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                      Último pagamento
                    </span>
                    <span className="text-xs font-black text-slate-800 block mt-1 font-mono">
                      {financialSummary.behavior.lastPaymentDate}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabela de Histórico de Procedimentos e Pagamentos */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    Histórico de Procedimentos e Documentos Fiscais
                  </h4>

                  {/* Filtros do Histórico */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('ALL')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                        historyFilter === 'ALL'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      Todos ({enhancedHistoryItems.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('PAID')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                        historyFilter === 'PAID'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      Pagos ({enhancedHistoryItems.filter((i) => i.aggregatedStatus === 'PAGO').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('OPEN')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                        historyFilter === 'OPEN'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      Em aberto ({enhancedHistoryItems.filter((i) => i.aggregatedStatus === 'EM_ABERTO' || i.aggregatedStatus === 'PARCIAL').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('OVERDUE')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                        historyFilter === 'OVERDUE'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                      }`}
                    >
                      Em atraso ({enhancedHistoryItems.filter((i) => i.aggregatedStatus === 'EM_ATRASO').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('CPF')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                        historyFilter === 'CPF'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      CPF ({enhancedHistoryItems.filter((i) => i.taxOrigin === 'CPF').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('CNPJ')}
                      className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                        historyFilter === 'CNPJ'
                          ? 'bg-blue-700 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      CNPJ ({enhancedHistoryItems.filter((i) => i.taxOrigin === 'CNPJ').length})
                    </button>
                  </div>
                </div>

                {filteredHistoryItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                    Nenhum procedimento encontrado com o filtro selecionado.
                  </div>
                ) : (
                  <div className="border border-slate-200/80 rounded-2xl overflow-x-auto shadow-2xs bg-white scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                    <table className="w-full min-w-[1120px] text-left text-xs border-collapse">
                      <thead className="bg-slate-50/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200/80 sticky top-0 z-10">
                        <tr>
                          <SortableHeader
                            label="Data"
                            sortKey="serviceDate"
                            currentSortKey={historySortKey}
                            currentDirection={historySortDirection}
                            onSort={handleHistorySort}
                            align="left"
                            className="w-[105px] min-w-[105px]"
                          />
                          <SortableHeader
                            label="Procedimento"
                            sortKey="procedureName"
                            currentSortKey={historySortKey}
                            currentDirection={historySortDirection}
                            onSort={handleHistorySort}
                            align="left"
                            className="w-[240px] min-w-[200px]"
                          />
                          <SortableHeader
                            label="Origem"
                            sortKey="taxOrigin"
                            currentSortKey={historySortKey}
                            currentDirection={historySortDirection}
                            onSort={handleHistorySort}
                            align="left"
                            className="w-[90px] min-w-[90px]"
                          />
                          <SortableHeader
                            label="Valor"
                            sortKey="totalValue"
                            currentSortKey={historySortKey}
                            currentDirection={historySortDirection}
                            onSort={handleHistorySort}
                            align="left"
                            className="w-[120px] min-w-[110px]"
                          />
                          <SortableHeader
                            label="Forma de Pagamento"
                            sortKey="paymentMethod"
                            currentSortKey={historySortKey}
                            currentDirection={historySortDirection}
                            onSort={handleHistorySort}
                            align="left"
                            className="w-[150px] min-w-[140px]"
                          />
                          <SortableHeader
                            label="Situação"
                            sortKey="status"
                            currentSortKey={historySortKey}
                            currentDirection={historySortDirection}
                            onSort={handleHistorySort}
                            align="left"
                            className="w-[120px] min-w-[110px]"
                          />
                          <SortableHeader
                            label="Pontualidade"
                            sortKey="punctuality"
                            currentSortKey={historySortKey}
                            currentDirection={historySortDirection}
                            onSort={handleHistorySort}
                            align="left"
                            className="w-[170px] min-w-[160px]"
                          />
                          <th className="p-3.5 w-[120px] min-w-[110px] text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayHistoryItems.map((item) => (
                          <tr
                            key={item.sale.id}
                            onClick={() => handleOpenDetailsModal(item)}
                            className="hover:bg-emerald-50/40 transition-colors cursor-pointer group"
                            title="Clique para ver os detalhes completos deste atendimento"
                          >
                            <td className="p-3.5 font-mono text-slate-600 text-xs whitespace-nowrap">
                              {formatDateBr(item.serviceDate)}
                            </td>
                            <td className="p-3.5">
                              <span className="font-bold text-slate-900 block group-hover:text-emerald-700 transition-colors line-clamp-2">
                                {item.procedureName}
                              </span>
                              <span className="text-[10.5px] text-slate-400 font-mono block truncate">
                                {item.nfseOrReceiptSummary}
                              </span>
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              {item.taxOrigin === 'CPF' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  CPF
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                  CNPJ
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 font-mono tabular-nums text-xs whitespace-nowrap">
                              <div className="font-bold text-slate-900 whitespace-nowrap">
                                {formatCurrency(item.totalValue)}
                              </div>
                              {item.installmentsCount > 1 && (
                                <span className="text-[10px] text-slate-400 block whitespace-nowrap">
                                  {item.installmentsCount} parcelas
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-slate-700 text-xs whitespace-nowrap">
                              {item.effectivePaymentMethod}
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${
                                  item.aggregatedStatus === 'PAGO'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : item.aggregatedStatus === 'PARCIAL'
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : item.aggregatedStatus === 'EM_ATRASO'
                                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                    : 'bg-amber-50 text-amber-900 border border-amber-200'
                                }`}
                              >
                                {item.statusBadgeLabel}
                              </span>
                            </td>
                            <td className="p-3.5 text-xs whitespace-nowrap">
                              <span
                                className={`font-medium whitespace-nowrap ${
                                  item.timelinessVariant === 'success'
                                    ? 'text-emerald-700'
                                    : item.timelinessVariant === 'danger'
                                    ? 'text-rose-700 font-bold'
                                    : item.timelinessVariant === 'warning'
                                    ? 'text-amber-800 font-semibold'
                                    : 'text-slate-600'
                                }`}
                              >
                                {item.timelinessLabel}
                              </span>
                            </td>
                            <td className="p-3.5 text-right whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 group-hover:text-emerald-800 underline-offset-2 group-hover:underline">
                                Ver detalhes
                                <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
            </div>
          ) : (
            <div className="text-center py-20 text-slate-400 text-xs">
              Selecione um paciente na lista ao lado para ver o histórico financeiro e clínico.
            </div>
          )}
        </div>
      </div>

      {/* Modal Central de Detalhes do Atendimento Financeiro */}
      <PatientProcedureModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedItemForDetails(null);
        }}
        item={selectedItemForDetails}
        patientName={activePatient?.name || ''}
        patientCpf={activePatient?.cpf || ''}
        maskCpf={maskCpf}
      />

      {/* Modern Patient Modal with Validation, Duplicate Check and Modes create/edit */}
      <PatientModal
        isOpen={isModalOpen}
        mode={editingPatient ? 'edit' : 'create'}
        patient={editingPatient}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPatient(null);
        }}
        onSave={(savedPatient) => {
          setSelectedPatientId(savedPatient.id);
          if (!editingPatient) {
            setSearchTerm(''); // limpa a busca para exibir o paciente recém-criado
          }
          setIsModalOpen(false);
          setEditingPatient(null);
          // Força refetch canônico do resumo de responsável (guardianSummaries)
          // após QUALQUER save — criação, edição, reaproveitamento de guardian
          // existente, troca de parentesco, troca ou remoção de responsável.
          // Sem isso, edições (patients.length inalterado) deixavam a UI com
          // o guardian antigo até F5 — bug corrigido nesta sessão.
          setRefreshKey((k) => k + 1);
        }}
      />

      {/* Modal Central para Nova Evolução ou Edição de Rascunho */}
      {activePatient && (
        <ClinicalRecordModal
          isOpen={isClinicalRecordModalOpen}
          onClose={() => {
            setIsClinicalRecordModalOpen(false);
            setEditingClinicalRecord(null);
            setContinuationClinicalRecord(null);
          }}
          patient={activePatient}
          recordToEdit={editingClinicalRecord}
          continuationRecord={continuationClinicalRecord}
          onSaved={() => {
            setRefreshKey((k) => k + 1);
            setContinuationClinicalRecord(null);
          }}
        />
      )}

      {/* Modal de Detalhes de Evolução Clínica Selecionada */}
      {activePatient && (
        <ClinicalRecordDetailsModal
          isOpen={Boolean(selectedRecordForDetails)}
          onClose={() => setSelectedRecordForDetails(null)}
          record={selectedRecordForDetails}
          patient={activePatient}
          attachments={patientAttachments}
        />
      )}

      {/* Modal para Registro de Adendo / Retificação Formal */}
      <ClinicalAmendmentModal
        isOpen={Boolean(recordForAmendment)}
        onClose={() => setRecordForAmendment(null)}
        record={recordForAmendment}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />

      {/* Modal para Invalidação Segura de Registro Clínico */}
      <ClinicalVoidModal
        isOpen={Boolean(recordForVoid)}
        onClose={() => setRecordForVoid(null)}
        record={recordForVoid}
        onVoided={() => {
          setRefreshKey((k) => k + 1);
          setRecordForVoid(null);
          toast.success('Registro clínico invalidado.');
        }}
      />

      {/* Modal para Exclusão Customizada de Rascunho */}
      <ClinicalDeleteDraftModal
        isOpen={Boolean(recordForDeleteDraft)}
        onClose={() => setRecordForDeleteDraft(null)}
        record={recordForDeleteDraft}
        onDeleted={() => {
          setRefreshKey((k) => k + 1);
          setRecordForDeleteDraft(null);
          toast.success('Rascunho excluído com sucesso.');
        }}
      />

      {/* Modal de Importação de Pacientes e Prontuários (CSV/Excel/Sheets) */}
      <PatientImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={() => {
          setRefreshKey((k) => k + 1);
          toast.success('Pacientes e prontuários importados com sucesso!');
        }}
      />

      {/* Modal de Exportação da Base de Pacientes */}
      <PatientExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        patients={filteredPatients}
      />
    </div>
  );
};
