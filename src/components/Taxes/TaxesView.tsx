import React, { useState, useMemo, useEffect } from 'react';
import {
  Calculator,
  User,
  Building,
  Calendar,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  SlidersHorizontal,
  Edit3,
  History,
  Layers,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Check,
  DollarSign,
  Briefcase,
  Info,
  ExternalLink,
  Lock,
  ArrowLeft,
  RefreshCw,
  FileText,
  AlertCircle,
  Link2,
  Unlink,
  Loader2,
} from 'lucide-react';
import {
  Sale,
  Expense,
  Professional,
  PayrollHistoryEntry,
  MonthlyFiscalHistoryEntry,
  TaxRulesPf,
  TaxRulesSimples,
  FiscalSourceType,
  TenantAuthStatus,
  AuthSession,
} from '../../types';
import {
  calculateCpfMonthlyTax,
  calculateSimplesNacionalMonthlyTax,
  computeRolling12MonthsData,
  getRolling12Months,
  calculateSimplesForParameters,
  DEFAULT_SIMPLES_ANNEX_III,
  DEFAULT_SIMPLES_ANNEX_V,
} from '../../lib/taxEngine';
import { formatCurrency, formatPercent, formatMonthYear, formatMonthYearShort } from '../../lib/masks';
import { db } from '../../lib/db';
import { PeriodPicker, CurrencyInput, useToast, ConfirmDialog } from '../UI';
import { ContabilexIntegrationService } from '../../services/contabilexIntegrationService';
import {
  IntegrationClientLink,
  ContabilexSnapshotPayload,
  CompetencyConfirmationRecord,
  formatCnpj,
  normalizeCnpj,
  competencyToDisplay,
} from '../../types/contabilexIntegration';

interface TaxesViewProps {
  sales: Sale[];
  expenses: Expense[];
  professional: Professional;
  payrollHistory: PayrollHistoryEntry[];
  taxRulesPf: TaxRulesPf;
  taxRulesSimples: TaxRulesSimples;
  selectedYear?: number;
  selectedMonth?: number | 'ALL';
  onChangePeriod?: (year: number, month: number | 'ALL') => void;
  onNavigateTab?: (tab: any) => void;
  initialOpenBasesModal?: boolean;
  onClearAction?: () => void;
}

export const TaxesView: React.FC<TaxesViewProps> = ({
  sales,
  expenses,
  professional,
  payrollHistory,
  taxRulesPf,
  taxRulesSimples,
  selectedYear: propYear,
  selectedMonth: propMonth,
  onChangePeriod,
  onNavigateTab,
  initialOpenBasesModal = false,
  onClearAction,
}) => {
  const toast = useToast();
  const [internalYear, setInternalYear] = useState<number>(propYear || new Date().getFullYear());
  const [internalMonth, setInternalMonth] = useState<number | 'ALL'>(
    propMonth !== undefined ? propMonth : new Date().getMonth() + 1
  );

  const activeFiscalMode: FiscalSourceType =
    professional.fiscalSourceType ||
    (professional.initialFiscalHistory && professional.initialFiscalHistory.length > 0
      ? 'MANUAL_MONTHLY'
      : professional.rbt12Inicial > 0
      ? 'MANUAL_TOTAL'
      : 'MANUAL_TOTAL');

  // Modal: Configuração das Bases Fiscais (3 Modos: Total Consolidado, Mês a Mês, Contábilex)
  const [isBasesModalOpen, setIsBasesModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<'choose_mode' | 'form'>('choose_mode');
  const [modalMode, setModalMode] = useState<FiscalSourceType>('MANUAL_TOTAL');

  // Inputs do Modo Total Consolidado
  const [totalRbt12Input, setTotalRbt12Input] = useState<number>(0);
  const [totalFs12Input, setTotalFs12Input] = useState<number>(0);
  const [proLaboreInputVal, setProLaboreInputVal] = useState<number>(0);

  // Entradas do Modo Detalhado Mês a Mês (12 meses anteriores)
  const [modalEntries, setModalEntries] = useState<MonthlyFiscalHistoryEntry[]>([]);

  // Diálogo de confirmação de troca de modo
  const [isConfirmSwitchOpen, setIsConfirmSwitchOpen] = useState(false);
  const [pendingSwitchMode, setPendingSwitchMode] = useState<FiscalSourceType | null>(null);

  // Gaveta retrátil: Ver composição da base
  const [showComposition, setShowComposition] = useState(false);

  const effectiveYear = propYear !== undefined ? propYear : internalYear;
  const effectiveMonth = propMonth !== undefined ? propMonth : internalMonth;

  const handlePeriodChange = (year: number, month: number | 'ALL') => {
    setInternalYear(year);
    setInternalMonth(month);
    if (onChangePeriod) onChangePeriod(year, month);
  };

  const competenceStr =
    effectiveMonth === 'ALL'
      ? `${effectiveYear}`
      : `${effectiveYear}-${String(effectiveMonth).padStart(2, '0')}`;

  // --- Contábilex Integration State ---
  const [tenantAuthStatus, setTenantAuthStatus] = useState<TenantAuthStatus>(() => db.getTenantAuthStatus());
  const [activeTenantId, setActiveTenantId] = useState<string>(() => db.getActiveTenantId());
  const [currentSession, setCurrentSession] = useState<AuthSession | null>(() => db.getCurrentSession());

  useEffect(() => {
    const syncAuth = () => {
      setTenantAuthStatus(db.getTenantAuthStatus());
      setActiveTenantId(db.getActiveTenantId());
      setCurrentSession(db.getCurrentSession());
    };
    syncAuth();
    return db.subscribe(syncAuth);
  }, []);

  const clinicTenant = currentSession?.clinic;
  const clinicName = clinicTenant?.tradeName || clinicTenant?.name || professional.razaoSocial || professional.name;

  const [contabilexLink, setContabilexLink] = useState<IntegrationClientLink | null>(null);
  const [isLoadingLink, setIsLoadingLink] = useState(false);
  const [isRequestingLink, setIsRequestingLink] = useState(false);
  const [contabilexCnpjInput, setContabilexCnpjInput] = useState(() => {
    const raw = (professional.cnpj || clinicTenant?.cnpj || '').replace(/\D/g, '');
    return raw.length === 14 ? formatCnpj(raw) : '';
  });
  const [contabilexSnapshots, setContabilexSnapshots] = useState<ContabilexSnapshotPayload[]>([]);
  const [contabilexConfirmations, setContabilexConfirmations] = useState<Record<string, CompetencyConfirmationRecord>>({});
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);

  // Regra Oficial baselineConfigured:
  // Se CONTABILEX: só é considerada configurada se ACTIVE E existirem snapshots válidos (snapshots.length > 0).
  const isBaselineConfigured = useMemo(() => {
    if (activeFiscalMode === 'CONTABILEX') {
      return contabilexLink?.status === 'ACTIVE' && contabilexSnapshots.length > 0;
    }
    return Boolean(professional.baselineConfigured);
  }, [activeFiscalMode, contabilexLink?.status, contabilexSnapshots.length, professional.baselineConfigured]);

  // Review & Confirmation Modal
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedReviewSnapshot, setSelectedReviewSnapshot] = useState<ContabilexSnapshotPayload | null>(null);
  const [snapshotHistory, setSnapshotHistory] = useState<ContabilexSnapshotPayload[]>([]);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isConfirmCompetencyDialogOpen, setIsConfirmCompetencyDialogOpen] = useState(false);

  const loadContabilexData = async (tenantId: string) => {
    if (!tenantId || tenantId === 'tenant_demo') return;
    setIsLoadingLink(true);
    const linkRes = await ContabilexIntegrationService.getLinkStatus(tenantId);
    setIsLoadingLink(false);
    if (linkRes.link) {
      setContabilexLink(linkRes.link);
      if (linkRes.link.status === 'ACTIVE') {
        setIsLoadingSnapshots(true);
        const [snapRes, confRes] = await Promise.all([
          ContabilexIntegrationService.getPublishedSnapshots(tenantId),
          ContabilexIntegrationService.getConfirmations(tenantId),
        ]);
        setIsLoadingSnapshots(false);
        if (snapRes.snapshots) {
          setContabilexSnapshots(snapRes.snapshots);
          if (activeFiscalMode === 'CONTABILEX' && snapRes.snapshots.length > 0 && !professional.baselineConfigured) {
            db.updateProfessional({ baselineConfigured: true });
          }
        }
        if (confRes.confirmations) {
          setContabilexConfirmations(confRes.confirmations);
        }
      } else {
        setContabilexSnapshots([]);
        setContabilexConfirmations({});
      }
    } else {
      setContabilexLink(null);
      setContabilexSnapshots([]);
      setContabilexConfirmations({});
    }
  };

  useEffect(() => {
    loadContabilexData(activeTenantId);
  }, [activeTenantId]);

  // Atualização por foco na janela quando PENDING ou CONTABILEX ativo
  useEffect(() => {
    const handleFocus = () => {
      if (contabilexLink?.status === 'PENDING' || activeFiscalMode === 'CONTABILEX') {
        loadContabilexData(activeTenantId);
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [activeTenantId, contabilexLink?.status, activeFiscalMode]);

  const latestSnapshotPublishedAt = useMemo(() => {
    if (!contabilexSnapshots || contabilexSnapshots.length === 0) return null;
    const sorted = [...contabilexSnapshots].sort((a, b) => {
      const dateA = a.updated_at || a.published_at || '';
      const dateB = b.updated_at || b.published_at || '';
      return dateB.localeCompare(dateA);
    });
    return sorted[0].updated_at || sorted[0].published_at || null;
  }, [contabilexSnapshots]);

  const contabilexFactorR = useMemo(() => {
    if (activeFiscalMode !== 'CONTABILEX' || contabilexSnapshots.length === 0) {
      return null;
    }
    return ContabilexIntegrationService.calculateFactorR(contabilexSnapshots, competenceStr);
  }, [activeFiscalMode, contabilexSnapshots, competenceStr]);

  const handleRequestContabilexLink = async () => {
    const clean = normalizeCnpj(contabilexCnpjInput);
    if (!clean || clean.length !== 14 || /^0+$/.test(clean)) {
      toast.error('Informe um CNPJ válido com 14 dígitos.');
      return;
    }

    const currentStatus = db.getTenantAuthStatus();
    const resolvedTenant = db.getActiveTenantId();

    if (currentStatus === 'AUTH_LOADING') {
      toast.error('Identificando clínica no Dental Finance... Aguarde um instante.');
      return;
    }

    if (currentStatus === 'DEMO') {
      toast.error('Vínculo oficial requer uma clínica autenticada no Dental Finance.');
      return;
    }

    if (currentStatus !== 'AUTHENTICATED_WITH_TENANT' || !resolvedTenant || resolvedTenant === 'tenant_demo') {
      toast.error('Seu acesso ainda não está vinculado a uma clínica. Conclua a configuração da clínica antes de conectar ao Escritório Contaju.');
      return;
    }

    setIsRequestingLink(true);
    const res = await ContabilexIntegrationService.requestLink(resolvedTenant, clean, clinicName);
    setIsRequestingLink(false);
    if (!res.success) {
      toast.error('Erro ao solicitar vínculo: ' + (res.error || 'Verifique os dados.'));
      return;
    }
    db.log(
      'CONTABILEX_LINK_REQUESTED',
      'INTEGRATION',
      resolvedTenant,
      `Solicitado vínculo com Contábilex para CNPJ ${formatCnpj(clean)}.`
    );
    toast.success('Solicitação enviada ao Escritório Contaju! Aguardando aprovação contábil.');
    loadContabilexData(resolvedTenant);
  };

  const handleActivateContabilex = async () => {
    setIsSavingBases(true);
    const hasSnapshots = contabilexSnapshots.length > 0;
    const res = await db.switchFiscalModeAsync('CONTABILEX', hasSnapshots);
    setIsSavingBases(false);
    if (!res.success) {
      toast.error('Erro ao ativar Contábilex: ' + (res.error || 'Falha ao salvar.'));
      return;
    }
    db.log(
      'CONTABILEX_LINK_ACTIVE',
      'INTEGRATION',
      activeTenantId,
      'Contábilex ativado como fonte oficial de dados fiscais.'
    );
    toast.success('Contábilex ativado como a Fonte Oficial de Dados Contábeis!');
    setIsBasesModalOpen(false);
    loadContabilexData(activeTenantId);
  };

  const handleDisconnectContabilex = async () => {
    if (!confirm('Deseja realmente desconectar a integração com o Contábilex? As bases fiscais passarão para modo manual.')) {
      return;
    }
    const res = await ContabilexIntegrationService.disconnectLink(activeTenantId);
    if (!res.success) {
      toast.error('Erro ao desconectar: ' + (res.error || 'Falha ao processar.'));
      return;
    }
    db.log(
      'CONTABILEX_DISCONNECTED',
      'INTEGRATION',
      activeTenantId,
      'Vínculo com Contábilex desconectado.'
    );
    await db.switchFiscalModeAsync('MANUAL_TOTAL');
    toast.info('Integração desconectada. A apuração fiscal retornou ao modo manual.');
    loadContabilexData(activeTenantId);
  };

  const handleOpenReviewModal = async (snapshot: ContabilexSnapshotPayload) => {
    setSelectedReviewSnapshot(snapshot);
    setReviewNotes('');
    setIsReviewModalOpen(true);
    const history = await ContabilexIntegrationService.getSnapshotHistory(activeTenantId, snapshot.competency);
    setSnapshotHistory(history);
  };

  const handleConfirmReview = async () => {
    if (!selectedReviewSnapshot) return;
    setIsSubmittingReview(true);
    const res = await ContabilexIntegrationService.confirmCompetency(
      activeTenantId,
      selectedReviewSnapshot.competency,
      selectedReviewSnapshot.version,
      currentSession?.user?.name || professional.name || 'Dentista Titular',
      reviewNotes
    );
    setIsSubmittingReview(false);
    if (!res.success) {
      toast.error('Erro ao registrar confirmação: ' + (res.error || 'Falha de conexão.'));
      return;
    }
    db.log(
      'ACCOUNTING_COMPETENCY_CONFIRMED',
      'INTEGRATION',
      selectedReviewSnapshot.id,
      `Competência ${competencyToDisplay(selectedReviewSnapshot.competency)} v${selectedReviewSnapshot.version} confirmada pelo usuário.`
    );
    toast.success(`Competência ${competencyToDisplay(selectedReviewSnapshot.competency)} revisada e confirmada com sucesso!`);
    setIsReviewModalOpen(false);
    const confRes = await ContabilexIntegrationService.getConfirmations(activeTenantId);
    if (confRes.confirmations) {
      setContabilexConfirmations(confRes.confirmations);
    }
  };

  // Seção Folha & Pró-labore da Competência Atual
  const [salariesInput, setSalariesInput] = useState<number>(0);
  const [chargesInput, setChargesInput] = useState<number>(0);
  const [proLaboreInput, setProLaboreInput] = useState<number>(0);
  const [isSavingBases, setIsSavingBases] = useState<boolean>(false);
  const [isSavingPayroll, setIsSavingPayroll] = useState<boolean>(false);

  // Sincronizar inputs de folha quando a competência mudar
  useEffect(() => {
    if (effectiveMonth !== 'ALL') {
      const existing = db.getMonthlyPayroll(competenceStr);
      if (existing) {
        setSalariesInput(existing.salaries || 0);
        setChargesInput(existing.charges || 0);
        setProLaboreInput(existing.proLabore || 0);
      } else {
        setSalariesInput(0);
        setChargesInput(0);
        setProLaboreInput(professional.proLaboreMensal || 0);
      }
    }
  }, [competenceStr, effectiveMonth, professional.proLaboreMensal]);

  const totalMonthlyPayroll = salariesInput + chargesInput + proLaboreInput;

  const handleSaveMonthlyPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveMonth === 'ALL') {
      toast.error('Selecione um mês específico para registrar a folha da competência.');
      return;
    }

    setIsSavingPayroll(true);
    const res = await db.upsertMonthlyPayrollAsync({
      month: competenceStr,
      salaries: salariesInput,
      charges: chargesInput,
      proLabore: proLaboreInput,
      totalPayroll: totalMonthlyPayroll,
    });
    setIsSavingPayroll(false);

    if (!res.success) {
      toast.error('Não foi possível salvar. Tente novamente.');
      return;
    }

    toast.success(`Folha e pró-labore de ${formatMonthYear(competenceStr)} registrados com sucesso!`);
  };

  // CPF Calculation (Carnê-Leão) — 100% segregado de PJ/RBT12/FS12
  const cpfTax = useMemo(() => {
    return calculateCpfMonthlyTax(
      sales,
      expenses,
      competenceStr,
      effectiveYear,
      taxRulesPf,
      professional.numDependentes,
      professional.inssProprioMensal
    );
  }, [sales, expenses, competenceStr, effectiveYear, taxRulesPf, professional]);

  const isConsolidatedActive = activeFiscalMode === 'MANUAL_TOTAL';

  // Apuração dos 12 meses da Janela Móvel
  const rollingComposition = useMemo(() => {
    return computeRolling12MonthsData(
      sales,
      competenceStr,
      payrollHistory,
      professional.initialFiscalHistory,
      professional.rbt12Inicial || 0,
      professional.folha12MesesInicial || 0,
      isConsolidatedActive
    );
  }, [sales, competenceStr, payrollHistory, professional, isConsolidatedActive]);

  // CNPJ Calculation (Simples Nacional)
  const cnpjTax = useMemo(() => {
    return calculateSimplesNacionalMonthlyTax(
      sales,
      competenceStr,
      effectiveYear,
      taxRulesSimples,
      payrollHistory,
      professional.rbt12Inicial || 0,
      professional.folha12MesesInicial || 0,
      professional.initialFiscalHistory,
      isConsolidatedActive
    );
  }, [sales, competenceStr, effectiveYear, taxRulesSimples, payrollHistory, professional, isConsolidatedActive]);

  // Inicializar e abrir modal das bases fiscais
  const handleOpenBasesModal = (forceChooseMode = false) => {
    if (!isBaselineConfigured || forceChooseMode) {
      setModalStep('choose_mode');
    } else {
      setModalStep('form');
    }

    setModalMode(activeFiscalMode);
    setTotalRbt12Input(professional.rbt12Inicial || 0);
    setTotalFs12Input(professional.folha12MesesInicial || 0);
    setProLaboreInputVal(professional.proLaboreMensal || 0);

    const windowMonths = getRolling12Months(competenceStr);
    const existingMap = new Map<string, MonthlyFiscalHistoryEntry>();
    if (professional.initialFiscalHistory && professional.initialFiscalHistory.length > 0) {
      for (const item of professional.initialFiscalHistory) {
        existingMap.set(item.month, item);
      }
    }

    const generated: MonthlyFiscalHistoryEntry[] = windowMonths.map((m) => {
      if (existingMap.has(m)) {
        return { ...existingMap.get(m)! };
      }
      return {
        month: m,
        cnpjRevenue: 0,
        payroll: 0,
      };
    });

    setModalEntries(generated);
    setIsBasesModalOpen(true);
  };

  useEffect(() => {
    if (initialOpenBasesModal) {
      handleOpenBasesModal(true);
      if (onClearAction) onClearAction();
    }
  }, [initialOpenBasesModal, onClearAction]);

  // Atalho: Clínica sem histórico anterior (preenche todos com 0 no modo detalhado)
  const handleSetZeroHistoryModal = () => {
    setModalEntries((prev) =>
      prev.map((item) => ({
        ...item,
        cnpjRevenue: 0,
        payroll: 0,
      }))
    );
    toast.info('Valores dos 12 meses definidos como R$ 0,00 (início de atividade).');
  };

  // Atualizar entrada individual no modal detalhado
  const handleUpdateModalEntry = (
    index: number,
    field: 'cnpjRevenue' | 'payroll',
    value: number
  ) => {
    setModalEntries((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        [field]: value,
      };
      return copy;
    });
  };

  // Cálculos do modal Mês a Mês em tempo real
  const modalTotalRbt12 = modalEntries.reduce((sum, e) => sum + (e.cnpjRevenue || 0), 0);
  const modalTotalFs12 = modalEntries.reduce((sum, e) => sum + (e.payroll || 0), 0);
  const modalFatorR = modalTotalRbt12 > 0 ? modalTotalFs12 / modalTotalRbt12 : 0;
  const modalFatorRPercent = modalFatorR * 100;
  const modalIsAnexoIII = modalFatorRPercent >= 28;

  // Cálculos do modal Total Consolidado em tempo real
  const consolidatedFatorR = totalRbt12Input > 0 ? totalFs12Input / totalRbt12Input : 0;
  const consolidatedFatorRPercent = consolidatedFatorR * 100;
  const consolidatedIsAnexoIII = consolidatedFatorRPercent >= 28;
  const consolidatedSimplesCalc = calculateSimplesForParameters(
    totalRbt12Input,
    totalFs12Input,
    10000,
    effectiveYear,
    taxRulesSimples
  );
  const consolidatedEffectiveRate = consolidatedSimplesCalc.effectiveTaxRate;

  // Salvamento: Modo Total Consolidado
  const handleSaveTotalConsolidated = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBases(true);
    const res = await db.saveInitialFiscalTotalAsync(
      totalRbt12Input,
      totalFs12Input,
      proLaboreInputVal,
      competenceStr
    );
    setIsSavingBases(false);

    if (!res.success) {
      toast.error(res.error || 'Não foi possível salvar as bases fiscais. Tente novamente.');
      return;
    }

    toast.success('Bases fiscais (Total Consolidado) salvas com sucesso!');
    setIsBasesModalOpen(false);
  };

  // Salvamento: Modo Detalhado Mês a Mês
  const handleSaveModalHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBases(true);
    const res = await db.saveInitialFiscalHistoryAsync(modalEntries, competenceStr);
    setIsSavingBases(false);

    if (!res.success) {
      toast.error(res.error || 'Não foi possível salvar o histórico fiscal. Tente novamente.');
      return;
    }

    toast.success('Histórico fiscal inicial dos 12 meses configurado com sucesso! Bases recalculadas.');
    setIsBasesModalOpen(false);
  };

  // Troca de modo solicitada
  const handleRequestSwitchMode = (newMode: FiscalSourceType) => {
    setPendingSwitchMode(newMode);
    setIsConfirmSwitchOpen(true);
  };

  const handleConfirmSwitchMode = () => {
    if (pendingSwitchMode) {
      setModalMode(pendingSwitchMode);
      setModalStep('form');
      setIsConfirmSwitchOpen(false);
      setPendingSwitchMode(null);
    }
  };

  // Valores oficiais a exibir no Card Principal de Bases:
  // Se não configurado: estritamente R$ 0,00 e status "Bases fiscais não configuradas"
  const isContabilexActive = activeFiscalMode === 'CONTABILEX' && contabilexLink?.status === 'ACTIVE';
  const displayRbt12 = isBaselineConfigured
    ? isContabilexActive && contabilexFactorR
      ? contabilexFactorR.rbt12
      : cnpjTax.rbt12
    : 0;
  const displayFs12 = isBaselineConfigured
    ? isContabilexActive && contabilexFactorR
      ? contabilexFactorR.fs12
      : cnpjTax.fs12
    : 0;
  const displayFatorRPercent = isBaselineConfigured && displayRbt12 > 0
    ? isContabilexActive && contabilexFactorR
      ? contabilexFactorR.factorRPercent
      : cnpjTax.fatorRPercent
    : 0;
  const isAnexoIIIEffective = isContabilexActive && contabilexFactorR
    ? contabilexFactorR.isAnexoIII
    : cnpjTax.isAnexoIII;

  const currentMonthSnapshot = useMemo(() => {
    return contabilexSnapshots.find((s) => s.competency === competenceStr);
  }, [contabilexSnapshots, competenceStr]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Calculator className="w-5 h-5 text-teal-600" />
            Motores de Cálculo Tributário (CPF & CNPJ)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Demonstrativos analíticos, apuração oficial e memória de cálculo segundo as normas da Receita Federal
          </p>
        </div>

        {/* Competence Selector */}
        <PeriodPicker
          selectedYear={effectiveYear}
          selectedMonth={effectiveMonth}
          onChange={handlePeriodChange}
          allowAllMonths={true}
        />
      </div>

      {/* 5. UNIFICAÇÃO DE CTA DE ONBOARDING:
          Antes de configurar: APENAS o banner grande no topo com "Configurar Bases Fiscais".
          Depois de configurar: O banner desaparece e o card ganha o botão discreto "Editar Histórico Fiscal". */}
      {/* 5. UNIFICAÇÃO DE CTA DE ONBOARDING:
          Antes de configurar: APENAS o banner grande no topo com "Configurar Bases Fiscais".
          Depois de configurar: O banner desaparece e o card ganha o botão discreto "Editar Histórico Fiscal". */}
      {!isBaselineConfigured && (
        activeFiscalMode === 'CONTABILEX' && contabilexLink?.status === 'ACTIVE' ? (
          <div className="p-5 rounded-2xl bg-teal-50/80 border-2 border-teal-300/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <Layers className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-teal-950">
                    Conexão Ativa com Escritório Contaju
                  </h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-200/90 text-teal-900">
                    Aguardando Publicação
                  </span>
                </div>
                <p className="text-xs text-teal-800 leading-relaxed max-w-2xl">
                  Conexão ativa. Aguardando primeira competência publicada pelo escritório.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadContabilexData(activeTenantId)}
              disabled={isLoadingSnapshots}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingSnapshots ? 'animate-spin' : ''}`} />
              <span>Verificar Publicações</span>
            </button>
          </div>
        ) : activeFiscalMode === 'CONTABILEX' && contabilexLink?.status === 'PENDING' ? (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50 border-2 border-amber-300/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-amber-950">
                    Vínculo com Escritório Contaju em Análise
                  </h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-200/90 text-amber-900">
                    Aguardando Aprovação
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed max-w-2xl">
                  Sua solicitação de conexão para o CNPJ <strong className="font-mono">{formatCnpj(contabilexLink.cnpj)}</strong> está aguardando homologação do operador contábil no Contábilex.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadContabilexData(activeTenantId)}
              disabled={isLoadingLink}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingLink ? 'animate-spin' : ''}`} />
              <span>Verificar aprovação</span>
            </button>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50 border-2 border-amber-300/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-amber-950">
                    Configuração Fiscal Necessária
                  </h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-200/90 text-amber-900">
                    Onboarding Fiscal
                  </span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed max-w-2xl">
                  Para calcular o Fator R real e a alíquota efetiva do Simples Nacional, configure o histórico fiscal dos 12 meses anteriores da sua clínica.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenBasesModal}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Configurar Bases Fiscais</span>
            </button>
          </div>
        )
      )}

      {/* 6. CARD PRINCIPAL UNIFICADO: Base utilizada no cálculo */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>{isContabilexActive && isBaselineConfigured ? 'Base Fiscal Sincronizada' : 'Base Utilizada no Cálculo (Simples Nacional & Fator R)'}</span>
              </h3>
              {!isBaselineConfigured ? (
                activeFiscalMode === 'CONTABILEX' && contabilexLink?.status === 'ACTIVE' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                    Contábilex — Conexão ativa (Aguardando publicações)
                  </span>
                ) : activeFiscalMode === 'CONTABILEX' && contabilexLink?.status === 'PENDING' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                    Contábilex — Solicitação pendente de aprovação
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                    Bases fiscais não configuradas
                  </span>
                )
              ) : displayRbt12 === 0 && activeFiscalMode !== 'CONTABILEX' ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Sem histórico anterior (início de atividade)
                </span>
              ) : activeFiscalMode === 'MANUAL_TOTAL' ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Origem da base: Total consolidado informado manualmente
                </span>
              ) : activeFiscalMode === 'CONTABILEX' ? (
                <>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                    Contábilex conectado
                  </span>
                  {contabilexSnapshots.length < 12 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      Histórico contábil parcial ({contabilexSnapshots.length}/12)
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      12 competências completas
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Origem dos dados: Manual — Detalhado por Competência
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeFiscalMode === 'CONTABILEX' && isContabilexActive ? (
                contabilexSnapshots.length === 0 ? (
                  'Conexão ativa. Aguardando primeira competência publicada pelo escritório.'
                ) : (
                  <>
                    Escritório Contaju • Última atualização:{' '}
                    {latestSnapshotPublishedAt
                      ? `${new Date(latestSnapshotPublishedAt).toLocaleDateString('pt-BR')} às ${new Date(latestSnapshotPublishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Recente'}{' '}
                    • Histórico: {contabilexSnapshots.length} de 12 competências disponíveis
                  </>
                )
              ) : (
                `Receita e folha dos 12 meses anteriores à competência ${formatMonthYear(competenceStr)}`
              )}
            </p>
          </div>

          {/* Botão no card aparece SOMENTE se já configurado */}
          {isBaselineConfigured && (
            <button
              type="button"
              onClick={() => handleOpenBasesModal(false)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
              <span>Editar Bases Fiscais</span>
            </button>
          )}
        </div>

        {/* Grade compacta com os 5 indicadores essenciais da base */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          {/* 1. RBT12 */}
          <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              RBT12 (12 Meses)
            </span>
            <div className="text-sm sm:text-base font-bold font-mono text-slate-900">
              {formatCurrency(displayRbt12)}
            </div>
            <span className="text-[10px] text-slate-400 block">Receita Bruta PJ</span>
          </div>

          {/* 2. FS12 */}
          <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              FS12 — BASE DA FOLHA
            </span>
            <div className="text-sm sm:text-base font-bold font-mono text-slate-900">
              {formatCurrency(displayFs12)}
            </div>
            <span className="text-[10px] text-slate-400 block">Folha consolidada utilizada para apuração do Fator R.</span>
          </div>

          {/* 3. Fator R */}
          <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Fator R
            </span>
            <div className="text-sm sm:text-base font-bold font-mono text-slate-900">
              {formatPercent(displayFatorRPercent)}
            </div>
            <span className="text-[10px] text-slate-400 block">FS12 ÷ RBT12</span>
          </div>

          {/* 4. Enquadramento */}
          <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Enquadramento
            </span>
            <div className="pt-0.5">
              {!isBaselineConfigured ? (
                <span className="text-xs font-bold text-slate-400">Pendente</span>
              ) : displayRbt12 === 0 ? (
                <span className="text-xs font-bold text-blue-700">Anexo III (Início)</span>
              ) : isAnexoIIIEffective ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Anexo III
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Anexo V
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 block">
              {isBaselineConfigured && isAnexoIIIEffective ? 'Alíquota reduzida' : 'Alíquota padrão'}
            </span>
          </div>

          {/* 5. Alíquota Efetiva */}
          <div className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Alíquota Efetiva
            </span>
            <div className="text-sm sm:text-base font-bold font-mono text-blue-900">
              {isBaselineConfigured
                ? isContabilexActive && currentMonthSnapshot?.effective_rate !== null && currentMonthSnapshot?.effective_rate !== undefined
                  ? formatPercent(currentMonthSnapshot.effective_rate)
                  : formatPercent(cnpjTax.effectiveTaxRate)
                : '0,00%'}
            </div>
            <span className="text-[10px] text-slate-400 block">
              {isContabilexActive ? 'Oficial Contábilex' : 'Simples Nacional'}
            </span>
          </div>
        </div>

        {/* Botão Retrátil / Accordion: Ver composição da base */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowComposition(!showComposition)}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer py-1"
          >
            {showComposition ? (
              <>
                <ChevronUp className="w-4 h-4" />
                <span>Ocultar composição da base</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                <span>Ver composição da base (12 meses anteriores)</span>
              </>
            )}
          </button>

          {showComposition && (
            <div className="mt-3 p-4 bg-slate-50/90 rounded-xl border border-slate-200/80 animate-in fade-in duration-150 space-y-3">
              {activeFiscalMode === 'CONTABILEX' ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-teal-600 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Composição dos Meses Sincronizados (Contábilex — Escritório Contaju)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {contabilexSnapshots.length} competência{contabilexSnapshots.length !== 1 ? 's' : ''} disponível{contabilexSnapshots.length !== 1 ? 'is' : ''} na origem contábil oficial
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadContabilexData(activeTenantId)}
                      disabled={isLoadingSnapshots}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-teal-50 border border-teal-300 text-teal-900 text-xs font-bold shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSnapshots ? 'animate-spin' : ''}`} />
                      <span>{isLoadingSnapshots ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
                    </button>
                  </div>

                  {contabilexSnapshots.length === 0 ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                      Nenhuma competência contábil foi publicada ainda pelo Escritório Contaju para esta clínica.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                            <th className="py-2.5 px-3">Competência</th>
                            <th className="py-2.5 px-3">Receita Bruta</th>
                            <th className="py-2.5 px-3">Base Fator R</th>
                            <th className="py-2.5 px-3">Guia DAS</th>
                            <th className="py-2.5 px-3">Alíquota Efetiva</th>
                            <th className="py-2.5 px-2 text-center">Versão</th>
                            <th className="py-2.5 px-3 text-center">Status de Revisão</th>
                            <th className="py-2.5 px-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-xs">
                          {contabilexSnapshots.map((s) => {
                            const conf = contabilexConfirmations[s.competency];
                            const revStatus = ContabilexIntegrationService.evaluateReviewStatus(s, conf);

                            return (
                              <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-3 font-bold text-slate-800">
                                  {competencyToDisplay(s.competency)}
                                </td>
                                <td className="py-2.5 px-3 text-slate-900">
                                  {formatCurrency(s.gross_revenue)}
                                </td>
                                <td className="py-2.5 px-3 text-teal-800 font-bold">
                                  {formatCurrency(s.factor_r_payroll_base)}
                                </td>
                                <td className="py-2.5 px-3 text-slate-800">
                                  {s.das_total !== null ? formatCurrency(s.das_total) : 'Em apuração'}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700">
                                  {s.effective_rate !== null ? `${s.effective_rate.toFixed(2)}%` : '-'}
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    v{s.version}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center font-sans">
                                  {revStatus === 'CONFIRMED' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      Confirmada
                                    </span>
                                  ) : revStatus === 'REVISION_REQUIRED' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                                      Retificação Disponível
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                      <Info className="w-3 h-3 text-blue-500" />
                                      Pendente de Revisão
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-sans">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReviewModal(s)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                      revStatus === 'REVISION_REQUIRED'
                                        ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                                        : revStatus === 'PENDING_REVIEW'
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {revStatus === 'REVISION_REQUIRED'
                                      ? 'Revisar Retificação'
                                      : revStatus === 'PENDING_REVIEW'
                                      ? 'Revisar e Confirmar'
                                      : 'Ver Detalhes'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-200/60 flex items-center gap-2 text-xs text-teal-900">
                    <Info className="w-4 h-4 text-teal-600 shrink-0" />
                    <span>
                      <strong>Base Oficial Contábilex:</strong> A apuração do Fator R utiliza a base da folha consolidada e homologada oficialmente pela contabilidade.
                    </span>
                  </div>
                </div>
              ) : rollingComposition.isConsolidatedTotal || rollingComposition.months.length === 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-800">
                        Composição mensal não disponível neste modo
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Competência de apuração: {formatMonthYear(competenceStr)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    O Simples Nacional e o Fator R estão sendo calculados diretamente com base no <strong>Total Consolidado dos últimos 12 meses</strong> informado manualmente (RBT12: {formatCurrency(displayRbt12)} | FS12: {formatCurrency(displayFs12)}). O sistema não inventa parcelas mensais fictícias dividindo o total por 12.
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        handleRequestSwitchMode('MANUAL_MONTHLY');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <History className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Adicionar detalhamento mensal</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Detalhamento da Janela Móvel de 12 Meses
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Base acumulada: {formatMonthYear(competenceStr)}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                          <th className="py-2 px-2.5 font-bold">Mês</th>
                          <th className="py-2 px-2.5 font-bold">Receita PJ (R$)</th>
                          <th className="py-2 px-2.5 font-bold">Origem Receita</th>
                          <th className="py-2 px-2.5 font-bold">Base da Folha (R$)</th>
                          <th className="py-2 px-2.5 font-bold">Origem Folha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 font-mono text-[11px]">
                        {rollingComposition.months.map((m) => (
                          <tr key={m.month} className="hover:bg-slate-100/60">
                            <td className="py-1.5 px-2.5 font-semibold text-slate-800">{formatMonthYearShort(m.month)}</td>
                            <td className="py-1.5 px-2.5 text-slate-900">{formatCurrency(m.cnpjRevenue)}</td>
                            <td className="py-1.5 px-2.5 font-sans">
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  m.revenueSource === 'SISTEMA'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : m.revenueSource === 'HISTORICO'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {m.revenueSource === 'SISTEMA'
                                  ? 'Vendas Sistema'
                                  : m.revenueSource === 'HISTORICO'
                                  ? 'Histórico Inicial'
                                  : 'Sem registro'}
                              </span>
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-900">{formatCurrency(m.payroll)}</td>
                            <td className="py-1.5 px-2.5 font-sans">
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  m.payrollSource === 'SISTEMA'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : m.payrollSource === 'HISTORICO'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {m.payrollSource === 'SISTEMA'
                                  ? 'Folha Sistema'
                                  : m.payrollSource === 'HISTORICO'
                                  ? 'Histórico Inicial'
                                  : 'Sem registro'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 font-mono font-bold text-xs bg-slate-100/80">
                          <td className="py-2.5 px-2.5 text-slate-900 font-sans">TOTAL ACUMULADO</td>
                          <td className="py-2.5 px-2.5 text-emerald-800">
                            {formatCurrency(rollingComposition.totalRbt12)}
                          </td>
                          <td className="py-2.5 px-2.5 font-sans text-slate-500 text-[10px]">RBT12</td>
                          <td className="py-2.5 px-2.5 text-emerald-800">
                            {formatCurrency(rollingComposition.totalFs12)}
                          </td>
                          <td className="py-2.5 px-2.5 font-sans text-slate-500 text-[10px]">FS12</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 8. ÁREA "FOLHA & PRÓ-LABORE DA COMPETÊNCIA" */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Folha & Pró-labore da Competência ({formatMonthYear(competenceStr)})
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Componentes de remuneração deste mês que alimentam dinamicamente a janela móvel do Fator R
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-bold">Total do Mês</span>
            <span className="text-sm font-bold font-mono text-emerald-700">
              {formatCurrency(totalMonthlyPayroll)}
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveMonthlyPayroll} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <CurrencyInput
                label="Pró-labore dos Sócios (R$)"
                value={proLaboreInput}
                onChange={setProLaboreInput}
                placeholder="R$ 0,00"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Remuneração oficial dos cirurgiões-dentistas sócios
              </span>
            </div>

            <div>
              <CurrencyInput
                label="Salários da Equipe CLT (R$)"
                value={salariesInput}
                onChange={setSalariesInput}
                placeholder="R$ 0,00"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Auxiliares, secretárias e equipe contratada
              </span>
            </div>

            <div>
              <CurrencyInput
                label="Encargos Trabalhistas (R$)"
                value={chargesInput}
                onChange={setChargesInput}
                placeholder="R$ 0,00"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                INSS patronal, FGTS e provisões legais
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-500">
              Esta folha compõe o FS12 dos próximos 12 meses, garantindo o enquadramento no Anexo III.
            </span>
            <button
              type="submit"
              disabled={isSavingPayroll}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSavingPayroll ? 'Salvando folha no banco...' : 'Salvar Folha da Competência'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Grid com CPF à Esquerda, CNPJ à Direita */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ================= MOTOR TRIBUTÁRIO CPF (CARNÊ-LEÃO) ================= */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center justify-center font-bold shadow-2xs">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Carnê-Leão (Pessoa Física)
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Regime de Caixa • Competência {formatMonthYear(competenceStr)}
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                Tabela Progressiva RFB
              </span>
            </div>

            {/* Step-by-Step Narrative */}
            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-700">
                  <span className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono font-bold text-xs flex items-center justify-center">
                    +
                  </span>
                  <span className="font-semibold text-slate-900">Receitas Recebidas no CPF:</span>
                </div>
                <span className="font-bold text-slate-900 font-mono text-sm">
                  {formatCurrency(cpfTax.grossRevenueReceived)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 text-slate-600">
                <div className="flex items-center gap-2 pl-2">
                  <span className="w-5 h-5 rounded-md bg-rose-50 text-rose-600 font-mono font-bold text-xs flex items-center justify-center">
                    −
                  </span>
                  <span>Despesas Dedutíveis (Livro Caixa):</span>
                </div>
                <span className="font-mono font-medium text-rose-600">
                  {formatCurrency(cpfTax.deductibleExpensesLivroCaixa)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 text-slate-600">
                <div className="flex items-center gap-2 pl-2">
                  <span className="w-5 h-5 rounded-md bg-rose-50 text-rose-600 font-mono font-bold text-xs flex items-center justify-center">
                    −
                  </span>
                  <span>Dedução de Dependentes ({cpfTax.dependentCount}):</span>
                </div>
                <span className="font-mono font-medium text-rose-600">
                  {formatCurrency(cpfTax.dependentDeductionTotal)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 text-slate-600">
                <div className="flex items-center gap-2 pl-2">
                  <span className="w-5 h-5 rounded-md bg-rose-50 text-rose-600 font-mono font-bold text-xs flex items-center justify-center">
                    −
                  </span>
                  <span>INSS Próprio Recolhido:</span>
                </div>
                <span className="font-mono font-medium text-rose-600">
                  {formatCurrency(cpfTax.inssDeductionTotal)}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-slate-100 text-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-700 font-mono font-bold text-xs flex items-center justify-center">
                    =
                  </span>
                  <span className="font-semibold">Base de Cálculo do IRPF:</span>
                </div>
                <span className="font-bold text-slate-900 font-mono text-sm">
                  {formatCurrency(cpfTax.taxBase)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 text-slate-600">
                <div className="flex items-center gap-2 pl-2">
                  <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 font-mono font-bold text-xs flex items-center justify-center">
                    ×
                  </span>
                  <span>Alíquota da Faixa {cpfTax.bracketNumber}:</span>
                </div>
                <span className="font-mono font-medium text-indigo-900">
                  {formatPercent(cpfTax.nominalRate * 100)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 text-slate-600">
                <div className="flex items-center gap-2 pl-2">
                  <span className="w-5 h-5 rounded-md bg-emerald-50 text-emerald-700 font-mono font-bold text-xs flex items-center justify-center">
                    −
                  </span>
                  <span>Parcela a Deduzir da Faixa:</span>
                </div>
                <span className="font-mono font-medium text-emerald-700">
                  {formatCurrency(cpfTax.deductionAmount)}
                </span>
              </div>

              {/* Final IRPF */}
              <div className="flex items-center justify-between py-3 px-3.5 bg-emerald-50/90 text-emerald-950 border border-emerald-200/80 rounded-xl font-bold mt-2 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-mono font-bold text-sm flex items-center justify-center">
                    =
                  </span>
                  <div>
                    <span className="block text-xs text-emerald-900 font-bold">
                      Imposto Carnê-Leão Estimado:
                    </span>
                    <span className="text-[10px] text-emerald-700 font-normal">
                      Alíquota Efetiva: {formatPercent(cpfTax.effectiveTaxRate)}
                    </span>
                  </div>
                </div>
                <span className="text-lg font-bold font-mono text-emerald-900">
                  {formatCurrency(cpfTax.carneLeaoEstimated)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
            <strong>Fundamentação Legal:</strong> Artigo 75 do Regulamento do Imposto de Renda (RIR/2018).
            O Carnê-Leão aplica-se estritamente às receitas de pessoa física e não utiliza RBT12 ou FS12.
          </div>
        </div>

        {/* ================= MOTOR TRIBUTÁRIO CNPJ (SIMPLES NACIONAL COM FATOR R) ================= */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 border border-blue-200/60 flex items-center justify-center font-bold shadow-2xs">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Simples Nacional & Fator R (Pessoa Jurídica)
                  </h3>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Regime de Competência (NFS-e) • {formatMonthYear(competenceStr)}
                  </span>
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                  !isBaselineConfigured
                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                    : cnpjTax.isAnexoIII
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {!isBaselineConfigured
                  ? 'Bases Pendentes'
                  : cnpjTax.isAnexoIII
                  ? 'Anexo III (Alíquota Reduzida)'
                  : 'Anexo V (Alíquota Majorada)'}
              </span>
            </div>

            {/* Narrative Calculation */}
            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1.5 text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 font-mono font-bold text-xs flex items-center justify-center">
                    ∑
                  </span>
                  <span className="font-semibold text-slate-900">RBT12 Efetivo:</span>
                </div>
                <span className="font-bold text-slate-900 font-mono">
                  {formatCurrency(displayRbt12)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 font-mono font-bold text-xs flex items-center justify-center">
                    ∑
                  </span>
                  <span className="font-semibold text-slate-900">FS12 Efetivo (Base da Folha):</span>
                </div>
                <span className="font-bold text-slate-900 font-mono">
                  {formatCurrency(displayFs12)}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 bg-slate-50 px-2.5 rounded-xl border border-slate-200/80">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 font-mono font-bold text-xs flex items-center justify-center">
                    ÷
                  </span>
                  <span className="font-bold text-slate-800">Fator R Apurado (FS12 ÷ RBT12):</span>
                </div>
                <span className="font-bold text-slate-900 font-mono text-sm">
                  {formatPercent(displayFatorRPercent)}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-mono font-bold text-xs flex items-center justify-center">
                    fx
                  </span>
                  <span className="font-medium">Faixa Enquadrada:</span>
                </div>
                <span className="font-bold text-slate-800 font-mono">
                  {isBaselineConfigured
                    ? `Faixa ${cnpjTax.bracketNumber} (${formatPercent(cnpjTax.nominalRate * 100)} nominal)`
                    : 'Aguardando configuração'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-mono font-bold text-xs flex items-center justify-center">
                    %
                  </span>
                  <span className="font-medium">Alíquota Efetiva Apurada:</span>
                </div>
                <span className="font-bold text-blue-900 text-sm font-mono">
                  {isBaselineConfigured ? formatPercent(cnpjTax.effectiveTaxRate) : '0,00%'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 text-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 font-mono font-bold text-xs flex items-center justify-center">
                    ×
                  </span>
                  <span className="font-medium">Faturamento do Mês (NFS-e):</span>
                </div>
                <span className="font-bold text-slate-900 font-mono">
                  {formatCurrency(cnpjTax.monthlyRevenueNfse)}
                </span>
              </div>

              {/* Final DAS */}
              <div className="flex items-center justify-between py-3 px-3.5 bg-blue-50/90 text-blue-950 border border-blue-200/80 rounded-xl font-bold mt-2 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-mono font-bold text-sm flex items-center justify-center">
                    =
                  </span>
                  <div>
                    <span className="block text-xs text-blue-900 font-bold">DAS Estimado do Mês:</span>
                    <span className="text-[10px] text-blue-700 font-normal">
                      {formatCurrency(cnpjTax.monthlyRevenueNfse)} ×{' '}
                      {isBaselineConfigured ? formatPercent(cnpjTax.effectiveTaxRate) : '0,00%'}
                    </span>
                  </div>
                </div>
                <span className="text-lg font-bold font-mono text-blue-900">
                  {formatCurrency(isBaselineConfigured ? cnpjTax.dasEstimated : 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
            <strong>Fundamentação Legal:</strong> Artigo 18, § 5º-J e 5º-M da Lei Complementar nº 123/2006.
            Atividades odontológicas (CNAE 8630-5/04) são tributadas originariamente pelo Anexo V, mas
            migram para o benéfico Anexo III caso a razão entre folha e faturamento seja igual ou superior a 28%.
          </div>
        </div>
      </div>

      {/* Card Central de Simulações Fiscais */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 border border-indigo-900/60 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Central Única de Simulações
            </span>
            {isBaselineConfigured && displayRbt12 > 0 && (
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                  cnpjTax.isAnexoIII
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                Fator R Vigente: {cnpjTax.fatorRPercent.toFixed(1)}% (
                {cnpjTax.isAnexoIII ? 'Anexo III' : 'Anexo V'})
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Simulador Estratégico de Fator R e Economia Tributária
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Deseja testar cenários de pró-labore, verificar o enquadramento no Anexo III, comparar economias e
            salvar snapshots de planejamento sem alterar a base real?
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab('fiscal_simulator')}
          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 active:scale-98"
        >
          <SlidersHorizontal className="w-4 h-4 text-slate-950" />
          <span>Abrir Simulador Fiscal Completo</span>
        </button>
      </div>

      {/* 7. MODAL: Configurar Bases Fiscais (3 Modalidades Disponíveis) */}
      {isBasesModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Header do Modal */}
            <div className="px-6 py-4.5 bg-white border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <span>Configuração das Bases Fiscais (Simples Nacional & Fator R)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Competência de apuração: {formatMonthYear(competenceStr)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBasesModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ETAPA 1: ESCOLHA DA MODALIDADE */}
            {modalStep === 'choose_mode' ? (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-800">
                    Como você prefere informar as bases dos 12 meses anteriores?
                  </h4>
                  <p className="text-xs text-slate-500">
                    Escolha a modalidade mais conveniente para a sua rotina fiscal. Você pode alternar quando quiser sem perder dados.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 pt-1">
                  {/* Opção 1: Total Consolidado */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isBaselineConfigured && activeFiscalMode !== 'MANUAL_TOTAL') {
                        handleRequestSwitchMode('MANUAL_TOTAL');
                      } else {
                        setModalMode('MANUAL_TOTAL');
                        setModalStep('form');
                      }
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-4 group ${
                      modalMode === 'MANUAL_TOTAL'
                        ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Calculator className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            Total dos últimos 12 meses
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                            Recomendado • Ágil
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Informe diretamente o faturamento acumulado e a folha total dos 12 meses anteriores. O cálculo do Fator R e da alíquota é realizado em tempo real.
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                  </button>

                  {/* Opção 2: Detalhar Mês a Mês */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isBaselineConfigured && activeFiscalMode !== 'MANUAL_MONTHLY') {
                        handleRequestSwitchMode('MANUAL_MONTHLY');
                      } else {
                        setModalMode('MANUAL_MONTHLY');
                        setModalStep('form');
                      }
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-4 group ${
                      modalMode === 'MANUAL_MONTHLY'
                        ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <History className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            Detalhar mês a mês (12 competências)
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            Acompanhamento analítico
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Preencha a receita e a folha individual de cada uma das 12 competências anteriores para evolução contínua da janela móvel.
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                  </button>

                  {/* Opção 3: Sincronizar com Contábilex */}
                  <button
                    type="button"
                    onClick={() => {
                      setModalMode('CONTABILEX');
                      setModalStep('form');
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-4 group ${
                      modalMode === 'CONTABILEX'
                        ? 'border-teal-500 bg-teal-50/40 ring-2 ring-teal-500/20'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            Sincronizar com Contábilex
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Em preparação
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Importação automática das apurações do Escritório Contaju LTDA (app-contaju.vercel.app) diretamente via CNPJ da clínica.
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all shrink-0 mt-2" />
                  </button>
                </div>
              </div>
            ) : (
              /* ETAPA 2: FORMULÁRIO DO MODO SELECIONADO */
              <div className="p-6 space-y-5">
                {/* Barra superior de navegação entre modalidades */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalStep('choose_mode')}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Escolher outra forma de preenchimento</span>
                  </button>

                  <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {modalMode === 'MANUAL_TOTAL'
                      ? 'Total Consolidado'
                      : modalMode === 'MANUAL_MONTHLY'
                      ? 'Detalhamento Mês a Mês'
                      : 'Contábilex'}
                  </span>
                </div>

                {/* FORMULÁRIO 1: TOTAL CONSOLIDADO */}
                {modalMode === 'MANUAL_TOTAL' && (
                  <form onSubmit={handleSaveTotalConsolidated} className="space-y-4 text-xs">
                    <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 text-indigo-950 space-y-1">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span className="font-bold">Total dos últimos 12 meses informado diretamente</span>
                      </div>
                      <p className="text-[11px] text-indigo-900 leading-relaxed">
                        Informe o montante acumulado de receita e folha dos 12 meses anteriores. O cálculo é feito instantaneamente e o sistema não inventa parcelas mensais artificiais.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Receita Bruta Total dos 12 Meses — RBT12 (R$)
                        </label>
                        <CurrencyInput
                          placeholder="Ex: 300.000,00"
                          value={totalRbt12Input}
                          onChange={(val) => setTotalRbt12Input(val)}
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Soma de todo o faturamento PJ dos 12 meses anteriores
                        </span>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Base Total da Folha dos 12 Meses — FS12 (R$)
                        </label>
                        <CurrencyInput
                          placeholder="Ex: 75.000,00"
                          value={totalFs12Input}
                          onChange={(val) => setTotalFs12Input(val)}
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Base consolidada da folha (salários, encargos e pró-labore) dos 12 meses anteriores
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Pró-labore Mensal Atual Previsto (R$)
                      </label>
                      <div className="max-w-xs">
                        <CurrencyInput
                          placeholder="Ex: 5.000,00"
                          value={proLaboreInputVal}
                          onChange={(val) => setProLaboreInputVal(val)}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Valor de referência para a remuneração mensal do sócio dentista
                      </span>
                    </div>

                    {/* CARD DE RESULTADOS EM TEMPO REAL (SEM BOTÃO CALCULAR) */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                          Apuração em Tempo Real
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Simulação instantânea
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">
                            Fator R Resultante
                          </span>
                          <strong className="text-base font-bold font-mono text-slate-900 block">
                            {formatPercent(consolidatedFatorRPercent)}
                          </strong>
                          <span className="text-[10px] text-slate-400">FS12 ÷ RBT12</span>
                        </div>

                        <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">
                            Enquadramento
                          </span>
                          <div className="pt-0.5">
                            {totalRbt12Input === 0 ? (
                              <span className="text-xs font-bold text-slate-400">Aguardando dados</span>
                            ) : consolidatedIsAnexoIII ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Anexo III (Reduzido)
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Anexo V (Padrão)
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {consolidatedFatorRPercent >= 28 ? 'Meta atingida (≥ 28%)' : 'Abaixo da meta (< 28%)'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase block">
                            Alíquota Estimada
                          </span>
                          <strong className="text-base font-bold font-mono text-blue-900 block">
                            {totalRbt12Input > 0 ? formatPercent(consolidatedEffectiveRate) : '0,00%'}
                          </strong>
                          <span className="text-[10px] text-slate-400">Simples Nacional</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsBasesModalOpen(false)}
                        className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingBases}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isSavingBases ? 'Salvando no banco...' : 'Salvar Bases Fiscais'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* FORMULÁRIO 2: DETALHADO MÊS A MÊS */}
                {modalMode === 'MANUAL_MONTHLY' && (
                  <form onSubmit={handleSaveModalHistory} className="space-y-4 text-xs">
                    {/* Botão Rápido de Início de Atividade */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200/80">
                      <div className="space-y-0.5">
                        <span className="font-bold text-emerald-950 block">Clínica recém-aberta?</span>
                        <span className="text-[11px] text-emerald-800">
                          Preencha rapidamente os 12 meses com R$ 0,00 para clínicas em início de atividade.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleSetZeroHistoryModal}
                        className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl font-bold text-[11px] transition-all cursor-pointer shadow-2xs shrink-0"
                      >
                        Preencher com R$ 0,00
                      </button>
                    </div>

                    {/* Tabela dos 12 Meses Anteriores */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-slate-600 font-semibold px-1">
                        <span>12 Meses Anteriores à Competência {formatMonthYear(competenceStr)}</span>
                        <span className="text-[10px] text-slate-400">Preenchimento mês a mês</span>
                      </div>

                      <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-2xl divide-y divide-slate-100 p-2 space-y-1">
                        {modalEntries.map((entry, idx) => (
                          <div
                            key={entry.month}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2 rounded-xl hover:bg-slate-50 transition-colors"
                          >
                            <div className="sm:col-span-3 font-mono font-bold text-slate-800 text-xs">
                              {formatMonthYearShort(entry.month)}
                            </div>

                            <div className="sm:col-span-4">
                              <CurrencyInput
                                placeholder="Receita PJ (R$)"
                                value={entry.cnpjRevenue}
                                onChange={(val) => handleUpdateModalEntry(idx, 'cnpjRevenue', val)}
                              />
                            </div>

                            <div className="sm:col-span-5">
                              <CurrencyInput
                                placeholder="Base da Folha (R$)"
                                value={entry.payroll}
                                onChange={(val) => handleUpdateModalEntry(idx, 'payroll', val)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Totais do Modal em Tempo Real */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Total RBT12</span>
                          <strong className="text-sm font-bold font-mono text-slate-900">
                            {formatCurrency(modalTotalRbt12)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Total FS12</span>
                          <strong className="text-sm font-bold font-mono text-slate-900">
                            {formatCurrency(modalTotalFs12)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Fator R Resultante</span>
                          <div className="flex items-center gap-1.5">
                            <strong className="text-sm font-bold font-mono text-slate-900">
                              {formatPercent(modalFatorRPercent)}
                            </strong>
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                modalIsAnexoIII
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {modalIsAnexoIII ? 'Anexo III' : 'Anexo V'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsBasesModalOpen(false)}
                        className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingBases}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>{isSavingBases ? 'Gravando no banco...' : 'Gravar Histórico & Confirmar Bases'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* FORMULÁRIO 3: CONTABILEX (FLUXO OFICIAL DE INTEGRAÇÃO) */}
                {modalMode === 'CONTABILEX' && (
                  <div className="space-y-4 text-xs">
                    <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200/80 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-200 text-teal-900 border border-teal-300">
                          Fonte Contábil Oficial
                        </span>
                        <h4 className="text-xs font-bold text-teal-950">
                          Conectar ao Escritório Contaju (Contábilex)
                        </h4>
                      </div>
                      <p className="text-xs text-teal-900 leading-relaxed">
                        A integração oficial com a plataforma Contábilex sincroniza automaticamente as apurações de faturamento, folha de pagamento, base do Fator R e guias DAS emitidas pela contabilidade.
                      </p>
                    </div>

                    {/* ESTADOS DO VÍNCULO */}
                    {contabilexLink?.status === 'PENDING' ? (
                      <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                          <span className="font-bold text-amber-950 text-xs">
                            Aguardando aprovação do Escritório Contaju
                          </span>
                        </div>
                        <p className="text-xs text-amber-800 leading-relaxed">
                          Sua solicitação de conexão para o CNPJ <strong className="font-mono">{formatCnpj(contabilexLink.cnpj)}</strong> foi registrada com sucesso e está aguardando homologação pelo operador contábil no Contábilex.
                        </p>
                        <div className="pt-2 flex items-center justify-between border-t border-amber-200/70">
                          <span className="text-[11px] text-amber-700">
                            Enviada em: {new Date(contabilexLink.requested_at).toLocaleString('pt-BR')}
                          </span>
                          <button
                            type="button"
                            onClick={() => loadContabilexData(activeTenantId)}
                            disabled={isLoadingLink}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLink ? 'animate-spin' : ''}`} />
                            <span>Verificar aprovação</span>
                          </button>
                        </div>
                      </div>
                    ) : contabilexLink?.status === 'ACTIVE' ? (
                      <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span className="font-bold text-emerald-950 text-xs">
                              Conectado ao Contábilex
                            </span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Vínculo Ativo
                          </span>
                        </div>
                        <p className="text-xs text-emerald-900 leading-relaxed">
                          Sua clínica está formalmente vinculada ao Escritório Contaju para o CNPJ <strong className="font-mono">{formatCnpj(contabilexLink.cnpj)}</strong>. Os demonstrativos mensais são disponibilizados pela contabilidade.
                        </p>
                        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t border-emerald-200/70">
                          <span className="text-[11px] text-emerald-700">
                            {contabilexSnapshots.length} competência{contabilexSnapshots.length !== 1 ? 's' : ''} disponível{contabilexSnapshots.length !== 1 ? 'is' : ''}
                          </span>
                          <div className="flex items-center gap-2">
                            {activeFiscalMode !== 'CONTABILEX' ? (
                              <button
                                type="button"
                                onClick={handleActivateContabilex}
                                disabled={isSavingBases}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{isSavingBases ? 'Ativando...' : 'Ativar Contábilex como Fonte Oficial'}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={handleDisconnectContabilex}
                                className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                                <span>Desconectar Integração</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : contabilexLink?.status === 'DISCONNECTED' ? (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-2">
                        <div className="flex items-center gap-2 text-slate-800 font-bold">
                          <Unlink className="w-4 h-4 text-slate-500" />
                          <span>Conexão com o Escritório Contaju inativa</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          O vínculo com o Contábilex foi desativado. Todo o histórico de competências e confirmações anteriores permanece preservado com segurança. Para restabelecer o vínculo, envie uma nova solicitação abaixo.
                        </p>
                      </div>
                    ) : contabilexLink?.status === 'REJECTED' ? (
                      <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 space-y-2">
                        <div className="flex items-center gap-2 text-rose-900 font-bold">
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                          <span>Solicitação não aprovada</span>
                        </div>
                        <p className="text-xs text-rose-800 leading-relaxed">
                          O Escritório Contaju não homologou a solicitação para o CNPJ <strong className="font-mono">{formatCnpj(contabilexLink.cnpj)}</strong>. Motivo: {contabilexLink.reject_reason || 'CNPJ não localizado na carteira de clientes ativos da contabilidade'}.
                        </p>
                      </div>
                    ) : null}

                    {/* FORMULÁRIO DE SOLICITAÇÃO (QUANDO NÃO ESTIVER ATIVO) */}
                    {contabilexLink?.status !== 'ACTIVE' && (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                        <span className="text-[11px] font-bold text-slate-700 block">
                          Solicitar Vínculo Contábil
                        </span>

                        {/* AVISOS ESPECÍFICOS DE STATUS DE AUTENTICAÇÃO */}
                        {tenantAuthStatus === 'AUTH_LOADING' && (
                          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                            <span>Identificando clínica no Dental Finance...</span>
                          </div>
                        )}

                        {tenantAuthStatus === 'DEMO' && (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-bold block">Modo Demonstração Ativo</span>
                              <p className="text-[11px] text-amber-800 leading-relaxed">
                                O vínculo oficial com o Escritório Contaju está disponível exclusivamente para clínicas com cadastro autenticado no Dental Finance. Para solicitar a conexão real, faça login com a conta da sua clínica.
                              </p>
                            </div>
                          </div>
                        )}

                        {tenantAuthStatus === 'AUTHENTICATED_WITHOUT_TENANT' && (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-amber-800 leading-relaxed">
                              Seu acesso ainda não está vinculado a uma clínica. Conclua a configuração da clínica antes de conectar ao Escritório Contaju.
                            </p>
                          </div>
                        )}

                        {tenantAuthStatus === 'UNAUTHENTICATED' && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-rose-800 leading-relaxed">
                              Sessão não identificada. Realize o login no Dental Finance para solicitar o vínculo contábil.
                            </p>
                          </div>
                        )}

                        <div>
                          <label className="text-[10px] text-slate-500 block uppercase font-bold mb-1">
                            CNPJ da Clínica (14 dígitos)
                          </label>
                          <input
                            type="text"
                            value={contabilexCnpjInput}
                            onChange={(e) => setContabilexCnpjInput(formatCnpj(e.target.value))}
                            placeholder="00.000.000/0000-00"
                            maxLength={18}
                            disabled={tenantAuthStatus === 'AUTH_LOADING' || tenantAuthStatus === 'DEMO' || tenantAuthStatus === 'AUTHENTICATED_WITHOUT_TENANT' || tenantAuthStatus === 'UNAUTHENTICATED'}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-60 disabled:bg-slate-100"
                          />
                          <span className="text-[10px] text-slate-400 block mt-1">
                            A correspondência é realizada estritamente pelo CNPJ cadastrado no Contábilex.
                          </span>
                        </div>

                        <div className="pt-2 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={handleRequestContabilexLink}
                            disabled={
                              isRequestingLink ||
                              tenantAuthStatus !== 'AUTHENTICATED_WITH_TENANT' ||
                              normalizeCnpj(contabilexCnpjInput).length !== 14
                            }
                            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:cursor-not-allowed"
                          >
                            {tenantAuthStatus === 'AUTH_LOADING' ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Identificando clínica...</span>
                              </>
                            ) : (
                              <>
                                <Link2 className="w-4 h-4" />
                                <span>{isRequestingLink ? 'Enviando solicitação...' : 'Conectar ao Escritório Contaju'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setIsBasesModalOpen(false)}
                        className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer transition-colors"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE REVISÃO E CONFIRMAÇÃO DE COMPETÊNCIA CONTÁBILEX */}
      {isReviewModalOpen && selectedReviewSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200 text-xs">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Dados Recebidos do Escritório Contaju
                  </h3>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Competência {competencyToDisplay(selectedReviewSnapshot.competency)} • Versão {selectedReviewSnapshot.version}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Aviso quando houver retificação (nova versão) */}
            {selectedReviewSnapshot.version > 1 && snapshotHistory.length > 1 && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Retificação Contábil Detectada (v{selectedReviewSnapshot.version})</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  O Escritório Contaju emitiu uma nova versão para esta competência. Compare as alterações abaixo antes de confirmar:
                </p>
                {(() => {
                  const prev = snapshotHistory.find((s) => s.version === selectedReviewSnapshot.version - 1) || snapshotHistory[1];
                  if (!prev) return null;
                  return (
                    <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white font-mono text-[11px]">
                      <table className="w-full text-left">
                        <thead className="bg-amber-100/60 text-amber-900 text-[10px] uppercase font-bold">
                          <tr>
                            <th className="p-2">Indicador</th>
                            <th className="p-2 text-slate-600">Versão confirmada anteriormente (v{prev.version})</th>
                            <th className="p-2 text-teal-900 font-bold">Nova versão do Escritório Contaju (v{selectedReviewSnapshot.version})</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          <tr>
                            <td className="p-2 font-sans font-semibold text-slate-700">Receita Bruta</td>
                            <td className="p-2 text-slate-500">{formatCurrency(prev.gross_revenue)}</td>
                            <td className="p-2 text-slate-900 font-bold">{formatCurrency(selectedReviewSnapshot.gross_revenue)}</td>
                          </tr>
                          <tr>
                            <td className="p-2 font-sans font-semibold text-slate-700">Base Fator R</td>
                            <td className="p-2 text-slate-500">{formatCurrency(prev.factor_r_payroll_base)}</td>
                            <td className="p-2 text-teal-800 font-bold">{formatCurrency(selectedReviewSnapshot.factor_r_payroll_base)}</td>
                          </tr>
                          <tr>
                            <td className="p-2 font-sans font-semibold text-slate-700">Guia DAS</td>
                            <td className="p-2 text-slate-500">{prev.das_total !== null ? formatCurrency(prev.das_total) : '-'}</td>
                            <td className="p-2 text-slate-900 font-bold">{selectedReviewSnapshot.das_total !== null ? formatCurrency(selectedReviewSnapshot.das_total) : '-'}</td>
                          </tr>
                          <tr>
                            <td className="p-2 font-sans font-semibold text-slate-700">Alíquota Efetiva</td>
                            <td className="p-2 text-slate-500">{prev.effective_rate !== null ? `${prev.effective_rate.toFixed(2)}%` : '-'}</td>
                            <td className="p-2 text-slate-900 font-bold">{selectedReviewSnapshot.effective_rate !== null ? `${selectedReviewSnapshot.effective_rate.toFixed(2)}%` : '-'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Fatos Contábeis Oficiais */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Receita Bruta Apurada</span>
                <span className="text-sm font-bold text-slate-900">{formatCurrency(selectedReviewSnapshot.gross_revenue)}</span>
              </div>
              <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-200">
                <span className="text-[10px] uppercase font-bold text-teal-700 font-sans block">Base Fator R (Folha Consolidada)</span>
                <span className="text-sm font-bold text-teal-950">{formatCurrency(selectedReviewSnapshot.factor_r_payroll_base)}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Guia DAS Emitida</span>
                <span className="text-sm font-bold text-slate-900">{selectedReviewSnapshot.das_total !== null ? formatCurrency(selectedReviewSnapshot.das_total) : 'Apurando'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-sans block">Alíquota Efetiva do Mês</span>
                <span className="text-sm font-bold text-blue-900">{selectedReviewSnapshot.effective_rate !== null ? `${selectedReviewSnapshot.effective_rate.toFixed(2)}%` : '-'}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-slate-600">
              <div className="flex items-center justify-between text-[11px]">
                <span>Salário Bruto Funcionários:</span>
                <strong className="font-mono">{formatCurrency(selectedReviewSnapshot.payroll_total)}</strong>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span>FGTS da Competência:</span>
                <strong className="font-mono">{selectedReviewSnapshot.fgts !== null ? formatCurrency(selectedReviewSnapshot.fgts) : '-'}</strong>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span>INSS da Competência:</span>
                <strong className="font-mono">{selectedReviewSnapshot.inss !== null ? formatCurrency(selectedReviewSnapshot.inss) : '-'}</strong>
              </div>
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                <span>Pró-labore dos Sócios:</span>
                <em className="text-slate-500 font-sans">Consolidado na base contábil oficial</em>
              </div>
            </div>

            {/* Campo opcional de anotações */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">
                Observações de Conferência (Opcional)
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Ex: Dados conferidos com o extrato bancário e guia paga."
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setIsConfirmCompetencyDialogOpen(true)}
                disabled={isSubmittingReview}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmittingReview ? 'Gravando Confirmação...' : 'Revisar e Confirmar Competência'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO DE CONFIRMAÇÃO PARA REVISÃO DE COMPETÊNCIA CONTÁBIL */}
      <ConfirmDialog
        isOpen={isConfirmCompetencyDialogOpen}
        title={selectedReviewSnapshot ? `Confirmar competência de ${formatMonthYear(selectedReviewSnapshot.competency)}?` : 'Confirmar competência?'}
        message="Você confirma que revisou os dados enviados pelo Escritório Contaju."
        confirmLabel="Confirmar Competência"
        cancelLabel="Voltar"
        variant="info"
        onConfirm={async () => {
          setIsConfirmCompetencyDialogOpen(false);
          await handleConfirmReview();
        }}
        onCancel={() => setIsConfirmCompetencyDialogOpen(false)}
      />

      {/* DIÁLOGO DE CONFIRMAÇÃO PARA ALTERAÇÃO DE MODALIDADE FISCAL */}
      <ConfirmDialog
        isOpen={isConfirmSwitchOpen}
        title="Alterar modalidade de preenchimento fiscal?"
        message="Ao alternar entre modalidades, os dados cadastrados anteriormente permanecerão preservados no histórico de snapshots da sua conta sem perda de informações. O cálculo ativo passará a considerar a nova modalidade selecionada. Deseja prosseguir?"
        confirmLabel="Confirmar Alteração"
        cancelLabel="Voltar"
        variant="warning"
        onConfirm={handleConfirmSwitchMode}
        onCancel={() => {
          setIsConfirmSwitchOpen(false);
          setPendingSwitchMode(null);
        }}
      />
    </div>
  );
};


