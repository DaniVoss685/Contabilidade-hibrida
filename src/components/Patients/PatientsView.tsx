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
} from 'lucide-react';
import { Patient, Sale } from '../../types';
import {
  formatCpf,
  formatCurrency,
  formatDateBr,
  normalizeSearchText,
  matchDocumentSearch,
  calculateAge,
  calculateNextBirthday,
} from '../../lib/masks';
import {
  calculatePatientFinancialSummary,
  enhanceSaleHistoryItem,
  EnhancedSaleHistoryItem,
} from '../../lib/patientHistory';
import { db } from '../../lib/db';
import { useToast } from '../UI';
import { PatientModal } from '../Modals/PatientModal';
import { PatientProcedureDrawer } from './PatientProcedureDrawer';

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

  // Sync with external selection (e.g. from Ctrl+K global search)
  React.useEffect(() => {
    if (initialSelectedPatientId) {
      setSelectedPatientId(initialSelectedPatientId);
    }
  }, [initialSelectedPatientId]);

  // Modal state (create or edit)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(initialOpenNewModal);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  // Drawer de Detalhes do Atendimento
  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<EnhancedSaleHistoryItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  React.useEffect(() => {
    if (initialOpenNewModal) {
      setEditingPatient(null);
      setIsModalOpen(true);
      if (onClearAction) onClearAction();
    }
  }, [initialOpenNewModal, onClearAction]);

  const filteredPatients = useMemo(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return patients;

    const normQuery = normalizeSearchText(trimmed);

    return patients.filter((p) => {
      const nameMatch = normalizeSearchText(p.name).includes(normQuery);
      const cpfMatch = matchDocumentSearch(p.cpf, trimmed);
      const phoneDigits = (p.phone || '').replace(/\D/g, '');
      const searchDigits = trimmed.replace(/\D/g, '');
      const phoneMatch = searchDigits.length >= 3 && phoneDigits.includes(searchDigits);

      return nameMatch || cpfMatch || phoneMatch;
    });
  }, [patients, searchTerm]);

  const activePatient = patients.find((p) => p.id === selectedPatientId) || patients[0];

  // Financial history for active patient
  const patientSales = useMemo(() => {
    if (!activePatient) return [];
    return sales.filter((s) => s.patientId === activePatient.id || s.patientName === activePatient.name);
  }, [sales, activePatient]);

  // Idade e Aniversário dinâmicos
  const patientAge = useMemo(() => calculateAge(activePatient?.birthDate), [activePatient?.birthDate]);
  const nextBirthday = useMemo(() => calculateNextBirthday(activePatient?.birthDate), [activePatient?.birthDate]);

  // Resumo Financeiro e Comportamento de Pagamento (Métricas 100% Objetivas)
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

  const handleOpenDrawer = (item: EnhancedSaleHistoryItem) => {
    setSelectedItemForDrawer(item);
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            Cadastro e Prontuário Financeiro de Pacientes
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Histórico consolidado por paciente com segregação de documentos emitidos em CPF e CNPJ
          </p>
        </div>

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

      {/* Main Grid: List on Left, Detail on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Patient List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[680px] overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, CPF ou tel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredPatients.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Nenhum paciente encontrado.
              </div>
            ) : (
              filteredPatients.map((p) => {
                const isSelected = p.id === activePatient?.id;
                const initials = p.name
                  .split(' ')
                  .map((n) => n[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

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
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">{p.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                          CPF: {formatCpf(p.cpf, maskCpf)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.phone && (
                        <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">{p.phone}</span>
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
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                    {activePatient.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
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

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 mt-2 font-mono">
                      <span>CPF: {formatCpf(activePatient.cpf, maskCpf)}</span>
                      {activePatient.phone && <span>Tel: {activePatient.phone}</span>}
                      {activePatient.birthDate ? (
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
                  <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200/80">
                        <tr>
                          <th className="p-3">Data</th>
                          <th className="p-3">Procedimento</th>
                          <th className="p-3">Origem</th>
                          <th className="p-3">Valor</th>
                          <th className="p-3">Forma de Pagamento</th>
                          <th className="p-3">Situação</th>
                          <th className="p-3">Pontualidade</th>
                          <th className="p-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredHistoryItems.map((item) => (
                          <tr
                            key={item.sale.id}
                            onClick={() => handleOpenDrawer(item)}
                            className="hover:bg-emerald-50/40 transition-colors cursor-pointer group"
                            title="Clique para ver os detalhes completos deste atendimento"
                          >
                            <td className="p-3 font-mono text-slate-600 text-xs whitespace-nowrap">
                              {formatDateBr(item.serviceDate)}
                            </td>
                            <td className="p-3">
                              <span className="font-bold text-slate-900 block group-hover:text-emerald-700 transition-colors">
                                {item.procedureName}
                              </span>
                              <span className="text-[10.5px] text-slate-400 font-mono">
                                {item.nfseOrReceiptSummary}
                              </span>
                            </td>
                            <td className="p-3">
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
                            <td className="p-3 font-mono tabular-nums text-xs whitespace-nowrap">
                              <div className="font-bold text-slate-900">
                                {formatCurrency(item.totalValue)}
                              </div>
                              {item.installmentsCount > 1 && (
                                <span className="text-[10px] text-slate-400 block">
                                  {item.installmentsCount} parcelas
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-slate-700 text-xs">
                              {item.effectivePaymentMethod}
                            </td>
                            <td className="p-3">
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
                            <td className="p-3 text-xs whitespace-nowrap">
                              <span
                                className={`font-medium ${
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
                            <td className="p-3 text-right">
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
          ) : (
            <div className="text-center py-20 text-slate-400 text-xs">
              Selecione um paciente na lista ao lado para ver o histórico financeiro.
            </div>
          )}
        </div>
      </div>

      {/* Drawer de Detalhes do Atendimento */}
      <PatientProcedureDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedItemForDrawer(null);
        }}
        item={selectedItemForDrawer}
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
        }}
      />
    </div>
  );
};
