import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  computeRolling12MonthsData,
  getRolling12Months,
  calculateSimplesForParameters,
  DEFAULT_SIMPLES_ANNEX_III,
  DEFAULT_SIMPLES_ANNEX_V,
} from '../../lib/taxEngine';
import { CARNE_LEAO_RULES_2026 } from '../../lib/carneLeaoRules';
import { selectCarneLeaoScenario } from '../../lib/carneLeaoCalculation';
import { formatCurrency, formatPercent, formatMonthYear, formatMonthYearShort } from '../../lib/masks';
import { db } from '../../lib/db';
import { supabase } from '../../lib/supabaseClient';
import { getLastClosedCompetence, getTodayCivilDate } from '../../lib/statusHelper';
import { PeriodPicker, CurrencyInput, useToast, ConfirmDialog } from '../UI';
import { ContabilexIntegrationService } from '../../services/contabilexIntegrationService';
import { publishFiscalContabilex } from '../../services/fiscalBaseStore';
import {
  estimateSimplesFromBase,
  fiscalBaseStatusLabel,
  formatCompetencyShortName,
  isCompetency,
  resolveFiscalBase,
} from '../../lib/fiscalBase';
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

  // Regra Contábil Oficial: O fechamento fiscal e a apuração do Fator R/Simples ocorrem SEMPRE
  // sobre a competência encerrada (mês anterior ao mês civil atual).
  // Exemplo: Em 16/09/2026, apura-se Agosto/2026. Em Outubro/2026, apura-se Setembro/2026.
  const lastClosed = getLastClosedCompetence();

  const isCurrentOrFutureMonth = (y: number, m: number | 'ALL'): boolean => {
    if (m === 'ALL') return false;
    const todayStr = getTodayCivilDate();
    const [curY, curM] = todayStr.split('-').map(Number);
    return y > curY || (y === curY && m >= curM);
  };

  const [internalYear, setInternalYear] = useState<number>(() => {
    if (propYear !== undefined && propMonth !== undefined && propMonth !== 'ALL') {
      if (isCurrentOrFutureMonth(propYear, propMonth)) {
        return lastClosed.year;
      }
      return propYear;
    }
    return lastClosed.year;
  });

  const [internalMonth, setInternalMonth] = useState<number | 'ALL'>(() => {
    if (propYear !== undefined && propMonth !== undefined && propMonth !== 'ALL') {
      if (isCurrentOrFutureMonth(propYear, propMonth)) {
        return lastClosed.month;
      }
      return propMonth;
    }
    return lastClosed.month;
  });

  // Sincroniza se a seleção externa mudar
  useEffect(() => {
    if (propYear !== undefined && propMonth !== undefined) {
      if (propMonth === 'ALL') {
        setInternalYear(propYear);
        setInternalMonth('ALL');
      } else if (isCurrentOrFutureMonth(propYear, propMonth)) {
        setInternalYear(lastClosed.year);
        setInternalMonth(lastClosed.month);
      } else {
        setInternalYear(propYear);
        setInternalMonth(propMonth);
      }
    }
  }, [propYear, propMonth]);

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

  const effectiveYear = internalYear;
  const effectiveMonth = internalMonth;

  const handlePeriodChange = (year: number, month: number | 'ALL') => {
    if (month !== 'ALL' && isCurrentOrFutureMonth(year, month)) {
      const todayStr = getTodayCivilDate();
      toast.info(
        `A competência atual (${formatMonthYear(todayStr.substring(0, 7))}) ainda está em andamento. O fechamento contábil e Fator R são apurados sobre a competência encerrada (${formatMonthYear(lastClosed.competenceStr)}).`
      );
      setInternalYear(lastClosed.year);
      setInternalMonth(lastClosed.month);
      return;
    }
    setInternalYear(year);
    setInternalMonth(month);
    if (onChangePeriod) onChangePeriod(year, month);
  };

  const competenceStr =
    effectiveMonth === 'ALL'
      ? `${effectiveYear}`
      : `${effectiveYear}-${String(effectiveMonth).padStart(2, '0')}`;
  const competenceLabel = effectiveMonth === 'ALL'
    ? `Ano-calendário ${effectiveYear}`
    : formatMonthYear(competenceStr);

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
  const savedCnpj = useMemo(() => {
    const raw = (professional.cnpj || clinicTenant?.cnpj || '').replace(/\D/g, '');
    return raw.length === 14 ? raw : '';
  }, [professional.cnpj, clinicTenant?.cnpj]);

  const hasSavedCnpj = Boolean(savedCnpj);

  const [contabilexCnpjInput, setContabilexCnpjInput] = useState(() => {
    return savedCnpj ? formatCnpj(savedCnpj) : '';
  });

  useEffect(() => {
    if (savedCnpj) {
      setContabilexCnpjInput(formatCnpj(savedCnpj));
    }
  }, [savedCnpj]);

  const [contabilexSnapshots, setContabilexSnapshots] = useState<ContabilexSnapshotPayload[]>([]);
  const [contabilexConfirmations, setContabilexConfirmations] = useState<Record<string, CompetencyConfirmationRecord>>({});
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  // A base oficial só é considerada "carregada" depois da primeira leitura da clínica ATIVA (nunca zeros por padrão).
  const [contabilexLoaded, setContabilexLoaded] = useState(false);
  const [contabilexLoadError, setContabilexLoadError] = useState(false);
  // Clínica ativa "agora": respostas atrasadas de uma clínica anterior são descartadas.
  const activeTenantRef = useRef(activeTenantId);
  activeTenantRef.current = activeTenantId;

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
  const [isIrpfMemoryModalOpen, setIsIrpfMemoryModalOpen] = useState(false);
  const [cpfCalculationMode, setCpfCalculationMode] = useState<'REALIZADO' | 'PROJETADO'>('REALIZADO');
  const [isSyncingWithContaju, setIsSyncingWithContaju] = useState(false);

  const loadContabilexData = async (tenantId: string) => {
    if (!tenantId || tenantId === 'tenant_demo') {
      setContabilexLoaded(true);
      return;
    }
    setIsLoadingLink(true);
    const linkRes = await ContabilexIntegrationService.getLinkStatus(tenantId);
    if (activeTenantRef.current !== tenantId) return; // trocou de clínica durante a leitura
    setIsLoadingLink(false);
    if (linkRes.error) {
      // Falha de leitura: mantém a última base conhecida em vez de zerar a tela.
      setContabilexLoadError(true);
      setContabilexLoaded(true);
      return;
    }
    if (linkRes.link) {
      setContabilexLink(linkRes.link);
      if (linkRes.link.status === 'ACTIVE') {
        setIsLoadingSnapshots(true);
        const [snapRes, confRes] = await Promise.all([
          ContabilexIntegrationService.getPublishedSnapshots(tenantId, 12),
          ContabilexIntegrationService.getConfirmations(tenantId),
        ]);
        if (activeTenantRef.current !== tenantId) return;
        setIsLoadingSnapshots(false);
        if (snapRes.error) {
          setContabilexLoadError(true);
          setContabilexLoaded(true);
          return;
        }
        setContabilexLoadError(false);
        if (snapRes.snapshots) {
          setContabilexSnapshots(snapRes.snapshots);
          // Mantém Dashboard / Simulador / Relatórios / DRE na MESMA base que esta tela acabou de ler.
          publishFiscalContabilex(tenantId, linkRes.link, snapRes.snapshots);
          // Regra Oficial: Ao concluir integração com sucesso e ter snapshots,
          // o Contaju vira AUTOMATICAMENTE a fonte fiscal oficial sem qualquer ação manual.
          if (snapRes.snapshots.length > 0) {
            if (activeFiscalMode !== 'CONTABILEX') {
              await db.switchFiscalModeAsync('CONTABILEX', true);
            }
            if (!professional.baselineConfigured) {
              db.updateProfessional({ baselineConfigured: true });
            }
          }
        }
        if (confRes.confirmations) {
          setContabilexConfirmations(confRes.confirmations);
        }
      } else {
        setContabilexSnapshots([]);
        setContabilexConfirmations({});
        publishFiscalContabilex(tenantId, linkRes.link, []);
      }
    } else {
      setContabilexLink(null);
      setContabilexSnapshots([]);
      setContabilexConfirmations({});
      publishFiscalContabilex(tenantId, null, []);
    }
    setContabilexLoadError(false);
    setContabilexLoaded(true);
  };

  const handleSyncWithContaju = async () => {
    if (!activeTenantId || activeTenantId === 'tenant_demo') {
      toast.error('Clínica não autenticada para sincronização.');
      return;
    }
    setIsSyncingWithContaju(true);
    try {
      const syncRes = await ContabilexIntegrationService.syncTenantSnapshots(activeTenantId);
      if (!syncRes.success) {
        toast.error('Não foi possível sincronizar agora. Tente novamente em instantes.');
      } else if (syncRes.changed) {
        toast.success('Dados atualizados com sucesso.');
      } else {
        toast.info('Dados já estão atualizados.');
      }
      await loadContabilexData(activeTenantId);
    } catch {
      toast.error('Não foi possível sincronizar agora. Tente novamente em instantes.');
    } finally {
      setIsSyncingWithContaju(false);
    }
  };

  // Garante estritamente que apenas os últimos 12 meses dinâmicos sejam exibidos na interface
  const displayedSnapshots = useMemo(() => {
    return (contabilexSnapshots || []).slice(0, 12);
  }, [contabilexSnapshots]);

  // 1. Carregamento inicial ao alternar de clínica — nunca exibe a base da clínica anterior enquanto lê a nova
  useEffect(() => {
    setContabilexLink(null);
    setContabilexSnapshots([]);
    setContabilexConfirmations({});
    setContabilexLoaded(false);
    setContabilexLoadError(false);
    loadContabilexData(activeTenantId);
  }, [activeTenantId]);

  // 2. Atualização em tempo real (Supabase Realtime) + polling silencioso de fallback
  useEffect(() => {
    if (!activeTenantId || activeTenantId === 'tenant_demo') return;

    // Escuta alterações em accounting_monthly_snapshots publicadas pelo Contaju
    const channel = supabase
      .channel(`realtime_tax_snapshots_${activeTenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounting_monthly_snapshots',
          filter: `dental_tenant_id=eq.${activeTenantId}`,
        },
        () => {
          // Atualização automática e transparente para o dentista
          loadContabilexData(activeTenantId);
        }
      )
      .subscribe();

    // Fallback silencioso a cada 45s se o modo contábil do Contaju estiver ativo
    const fallbackTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && activeFiscalMode === 'CONTABILEX') {
        loadContabilexData(activeTenantId);
      }
    }, 45000);

    // Atualização imediata quando o dentista volta o foco para a aba do navegador
    const handleFocus = () => {
      if (contabilexLink?.status === 'PENDING' || activeFiscalMode === 'CONTABILEX') {
        loadContabilexData(activeTenantId);
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(fallbackTimer);
      window.removeEventListener('focus', handleFocus);
    };
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

  const handleRequestContabilexLink = async () => {
    const targetCnpj = savedCnpj || normalizeCnpj(contabilexCnpjInput);
    const clean = normalizeCnpj(targetCnpj);
    if (!clean || clean.length !== 14 || /^0+$/.test(clean)) {
      toast.error('Informe um CNPJ válido com 14 dígitos nas Configurações da clínica.');
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

    // Se o CNPJ ainda não estava cadastrado nos Dados Profissionais, persiste automaticamente
    if (!professional.cnpj) {
      await db.updateProfessionalAsync({ cnpj: formatCnpj(clean) });
    }

    db.log(
      'CONTABILEX_LINK_REQUESTED',
      'INTEGRATION',
      resolvedTenant,
      `Solicitado vínculo com Escritório Contaju para CNPJ ${formatCnpj(clean)}.`
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
      toast.error('Erro ao ativar Contaju: ' + (res.error || 'Falha ao salvar.'));
      return;
    }
    db.log(
      'CONTABILEX_LINK_ACTIVE',
      'INTEGRATION',
      activeTenantId,
      'Contaju ativado como fonte oficial de dados fiscais.'
    );
    toast.success('Contaju ativado como a Fonte Oficial de Dados Contábeis!');
    setIsBasesModalOpen(false);
    loadContabilexData(activeTenantId);
  };

  const handleDisconnectContabilex = async () => {
    if (!confirm('Deseja realmente desconectar a integração com o Escritório Contaju? As bases fiscais passarão para modo manual.')) {
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
      'Vínculo com Escritório Contaju desconectado.'
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

  const [isSavingBases, setIsSavingBases] = useState<boolean>(false);

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
  const isCpfProjected = cpfCalculationMode === 'PROJETADO';
  const cpfCalculationDisplayed = selectCarneLeaoScenario(
    cpfTax.monthlyCalculation,
    cpfTax.projectedCalculation,
    cpfCalculationMode
  );

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

  // CNPJ (Simples Nacional): BASE FISCAL CANÔNICA — a mesma função que o Dashboard usa. Só quando o usuário
  // escolhe uma competência DIFERENTE da última fechada ela vira competência de referência explícita;
  // no caso padrão a resolução é a canônica (última competência oficial fechada disponível).
  const fiscalBase = useMemo(
    () =>
      resolveFiscalBase({
        todayStr: getTodayCivilDate(),
        professional,
        sales,
        payrollHistory,
        taxRules: taxRulesSimples,
        year: effectiveYear,
        contabilex: {
          loaded: contabilexLoaded,
          loadError: contabilexLoadError,
          linkStatus: contabilexLink?.status ?? null,
          snapshots: contabilexSnapshots,
        },
        referenceCompetencyOverride:
          isCompetency(competenceStr) && competenceStr !== lastClosed.competenceStr ? competenceStr : null,
      }),
    [
      professional,
      sales,
      payrollHistory,
      taxRulesSimples,
      effectiveYear,
      contabilexLoaded,
      contabilexLoadError,
      contabilexLink?.status,
      contabilexSnapshots,
      competenceStr,
      lastClosed.competenceStr,
    ]
  );
  const cnpjTax = useMemo(
    () =>
      estimateSimplesFromBase(fiscalBase, {
        sales,
        revenueCompetence: competenceStr,
        year: effectiveYear,
        taxRules: taxRulesSimples,
      }),
    [fiscalBase, sales, competenceStr, effectiveYear, taxRulesSimples]
  );

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
  const displayRbt12 = isBaselineConfigured ? fiscalBase.rbt12 : 0;
  const displayFs12 = isBaselineConfigured ? fiscalBase.fs12 : 0;
  const displayFatorRPercent =
    isBaselineConfigured && fiscalBase.status === 'AVAILABLE' && displayRbt12 > 0
      ? fiscalBase.factorRPercent ?? 0
      : 0;
  const isAnexoIIIEffective = fiscalBase.isAnexoIII === true;
  const fiscalBaseLabel = formatCompetencyShortName(fiscalBase.referenceCompetency);
  // O Contaju publica a própria alíquota da competência; só destacamos quando difere da apurada pelo motor.
  const officialRateNote =
    isContabilexActive &&
    cnpjTax.available &&
    fiscalBase.officialEffectiveRate !== null &&
    Math.abs(fiscalBase.officialEffectiveRate - cnpjTax.effectiveTaxRate) > 0.005
      ? ` • Contaju publicou ${formatPercent(fiscalBase.officialEffectiveRate, 2)}`
      : '';

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
              onClick={handleSyncWithContaju}
              disabled={isSyncingWithContaju || isLoadingSnapshots}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingWithContaju || isLoadingSnapshots ? 'animate-spin' : ''}`} />
              <span>{isSyncingWithContaju ? 'Sincronizando...' : 'Verificar Publicações'}</span>
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
                  Sua solicitação de conexão para o CNPJ <strong className="font-mono">{formatCnpj(contabilexLink.cnpj)}</strong> está aguardando homologação pelo Escritório Contaju.
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
                    Contaju — Conexão ativa (Aguardando publicações)
                  </span>
                ) : activeFiscalMode === 'CONTABILEX' && contabilexLink?.status === 'PENDING' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                    Contaju — Solicitação pendente de aprovação
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
                    Contaju conectado
                  </span>
                  {displayedSnapshots.length < 12 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                      Histórico contábil parcial ({displayedSnapshots.length}/12)
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
                displayedSnapshots.length === 0 ? (
                  'Conexão ativa. Aguardando primeira competência publicada pelo escritório.'
                ) : (
                  <>
                    Escritório Contaju • Última atualização:{' '}
                    {latestSnapshotPublishedAt
                      ? `${new Date(latestSnapshotPublishedAt).toLocaleDateString('pt-BR')} às ${new Date(latestSnapshotPublishedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Recente'}{' '}
                    • Histórico: {displayedSnapshots.length} de 12 competências disponíveis
                    {fiscalBase.status === 'AVAILABLE' ? ` • Competência-base: ${fiscalBaseLabel}` : ''}
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
              {isBaselineConfigured && fiscalBase.status !== 'AVAILABLE' ? '—' : formatPercent(displayFatorRPercent)}
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
              ) : fiscalBase.status === 'LOADING' ? (
                <span className="text-xs font-bold text-slate-400">Carregando…</span>
              ) : fiscalBase.status !== 'AVAILABLE' ? (
                <span className="text-xs font-bold text-amber-700" title={fiscalBase.reasonMessage || undefined}>Base insuficiente</span>
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
              {isBaselineConfigured && cnpjTax.available ? formatPercent(cnpjTax.effectiveTaxRate) : '—'}
            </div>
            <span className="text-[10px] text-slate-400 block">
              {(isContabilexActive ? 'Base oficial Contaju' : 'Simples Nacional') + officialRateNote}
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
                          Composição dos Meses Sincronizados (Escritório Contaju)
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {displayedSnapshots.length} competência{displayedSnapshots.length !== 1 ? 's' : ''} disponível{displayedSnapshots.length !== 1 ? 'is' : ''} na origem contábil oficial (últimos 12 meses)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-100/70 border border-teal-200/80 text-[11px] font-semibold text-teal-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Sincronização Automática Ativa
                      </span>
                      <button
                        type="button"
                        onClick={handleSyncWithContaju}
                        disabled={isSyncingWithContaju || isLoadingSnapshots}
                        title="Atualizar dados manualmente se necessário"
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-medium shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingWithContaju || isLoadingSnapshots ? 'animate-spin' : ''}`} />
                        <span>{isSyncingWithContaju ? 'Atualizando...' : 'Atualizar dados'}</span>
                      </button>
                    </div>
                  </div>

                  {displayedSnapshots.length === 0 ? (
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
                            <th className="py-2.5 px-3">Valor da Folha</th>
                            <th className="py-2.5 px-3">Guia DAS</th>
                            <th className="py-2.5 px-3">Alíquota do Mês</th>
                            <th className="py-2.5 px-3 text-right">Relação Folha/Receita</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-xs">
                          {displayedSnapshots.map((s) => {
                            const revenue = Number(s.gross_revenue) || 0;
                            const payroll = Number(s.factor_r_payroll_base) || 0;
                            const ratio = revenue > 0 ? (payroll / revenue) * 100 : null;

                            return (
                              <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-3 font-bold text-slate-800">
                                  {competencyToDisplay(s.competency)}
                                </td>
                                <td className="py-2.5 px-3 text-slate-900">
                                  {formatCurrency(revenue)}
                                </td>
                                <td className="py-2.5 px-3 text-teal-800 font-bold">
                                  {formatCurrency(payroll)}
                                </td>
                                <td className="py-2.5 px-3 text-slate-800">
                                  {s.das_total !== null ? formatCurrency(s.das_total) : 'Em apuração'}
                                </td>
                                <td className="py-2.5 px-3 text-blue-950 font-medium">
                                  {s.effective_rate !== null && s.effective_rate !== undefined ? formatPercent(s.effective_rate, 2) : '—'}
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-900 font-bold">
                                  {ratio !== null ? `${ratio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—'}
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
                      <strong>Base Oficial Contaju:</strong> A apuração do Fator R utiliza a base da folha consolidada e homologada oficialmente pelo Escritório Contaju.
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
                      Período de apuração: {competenceLabel}
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
                    Regime de Caixa • {competenceLabel}
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                Tabela Progressiva RFB
              </span>
            </div>

            {/* Resumo prático: imposto e valores que explicam a apuração. */}
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-600">Cenário da apuração</span>
                <div className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 p-0.5 text-[10px] font-bold">
                  {(['REALIZADO', 'PROJETADO'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      data-testid={`cpf-mode-${mode.toLowerCase()}`}
                      aria-pressed={cpfCalculationMode === mode}
                      onClick={() => setCpfCalculationMode(mode)}
                      className={`rounded-md px-3 py-1 transition-colors ${cpfCalculationMode === mode ? 'bg-white text-emerald-950 shadow-2xs' : 'text-emerald-700 hover:text-emerald-950'}`}
                    >
                      {mode === 'REALIZADO' ? 'Realizado' : 'Projeção'}
                    </button>
                  ))}
                </div>
              </div>
              {cpfTax.isAnnualSummary ? (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-700 px-4 py-3 text-white shadow-sm">
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-100">IRPF {isCpfProjected ? 'projetado' : 'realizado'} no ano</span>
                      <span className="mt-0.5 block text-[10px] text-emerald-100/80">Soma das apurações mensais em {effectiveYear}</span>
                    </div>
                    <span className="shrink-0 font-mono text-xl font-black tabular-nums">{formatCurrency(isCpfProjected ? cpfTax.annualSummary.projectedFinalTax : cpfTax.annualSummary.finalTax)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <span className="block text-[10px] text-slate-500">Rendimentos {isCpfProjected ? 'projetados' : 'realizados'}</span>
                      <span className="mt-1 block font-mono font-bold tabular-nums text-slate-900">{formatCurrency(isCpfProjected ? cpfTax.annualSummary.projectedGrossRevenue : cpfTax.annualSummary.grossRevenueReceived)}</span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <span className="block text-[10px] text-slate-500">Livro Caixa {isCpfProjected ? 'projetado/utilizado' : 'pago/utilizado'}</span>
                      <span className="mt-1 block font-mono font-bold tabular-nums text-slate-900">{formatCurrency(isCpfProjected ? cpfTax.annualSummary.projectedLivroCaixaUsed : cpfTax.annualSummary.livroCaixaUsed)}</span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <span className="block text-[10px] text-slate-500">Deduções {isCpfProjected ? 'projetadas' : 'realizadas'}</span>
                      <span className="mt-1 block font-mono font-bold tabular-nums text-slate-900">{formatCurrency(isCpfProjected ? cpfTax.annualSummary.projectedAppliedDeductions : cpfTax.annualSummary.appliedDeductions)}</span>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                      <span className="block text-[10px] text-amber-800">Excesso encerrado em dezembro</span>
                      <span className="mt-1 block font-mono font-bold tabular-nums text-amber-950">{formatCurrency(cpfTax.annualSummary.excessClosedAtYearEnd)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-slate-500">
                    <span>Soma das bases {isCpfProjected ? 'projetadas' : 'realizadas'} mensais</span>
                    <span className="font-mono tabular-nums">{formatCurrency(isCpfProjected ? cpfTax.annualSummary.projectedTaxableBase : cpfTax.annualSummary.taxableBase)}</span>
                  </div>
                </>
              ) : (() => {
                const monthly = cpfCalculationDisplayed;
                const carriedExcessLabel = monthly.month === 12
                  ? 'Excesso encerrado em dezembro'
                  : 'Excesso para o próximo mês';

                return <>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-700 px-4 py-3 text-white shadow-sm">
                    <div>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-100">IRPF {isCpfProjected ? 'projetado' : 'realizado'} a recolher</span>
                      <span className="mt-0.5 block text-[10px] text-emerald-100/80">DARF 0190 • {competenceLabel}</span>
                    </div>
                    <span data-testid="cpf-tax-selected-amount" className="shrink-0 font-mono text-xl font-black tabular-nums">{formatCurrency(monthly.impostoFinal)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <span className="block text-[10px] text-slate-500">Rendimentos {isCpfProjected ? 'projetados' : 'realizados'}</span>
                      <span className="mt-1 block font-mono font-bold tabular-nums text-slate-900">{formatCurrency(monthly.rendimentosTributaveis)}</span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <span className="block text-[10px] text-slate-500">Livro Caixa {isCpfProjected ? 'projetado/utilizado' : 'pago/utilizado'}</span>
                      <span className="mt-1 block font-mono font-bold tabular-nums text-slate-900">{formatCurrency(monthly.despesasLivroCaixaMes)}</span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <span className="block text-[10px] text-slate-500">Dedução mais vantajosa aplicada</span>
                      <span className="mt-1 block font-mono font-bold tabular-nums text-slate-900">{formatCurrency(monthly.deducaoAplicada)}</span>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                      <span className="block text-[10px] text-amber-800">{carriedExcessLabel}</span>
                      <span className="mt-1 block font-mono font-bold tabular-nums text-amber-950">{formatCurrency(monthly.excessoLivroCaixaProximoMes)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-slate-500">
                    <span>Base de cálculo {isCpfProjected ? 'projetada' : 'realizada'}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(monthly.baseCalculo)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Imposto pela tabela progressiva</span>
                    <span className="font-mono tabular-nums">{formatCurrency(monthly.impostoTabela)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Redução especial {isCpfProjected ? 'projetada' : 'aplicada — realizado'}</span>
                    <span className="font-mono tabular-nums">− {formatCurrency(monthly.reducaoEspecial)}</span>
                  </div>
                  {isCpfProjected && <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between"><span>Receitas já recebidas</span><strong>{formatCurrency(cpfTax.grossRevenueReceived)}</strong></div>
                    <div className="flex justify-between"><span>+ Receitas previstas</span><strong>{formatCurrency(Math.max(0, cpfTax.grossRevenueProjected - cpfTax.grossRevenueReceived))}</strong></div>
                    <div className="flex justify-between border-t border-blue-100 pt-1.5"><span>= Rendimentos projetados</span><strong>{formatCurrency(cpfTax.grossRevenueProjected)}</strong></div>
                    <div className="flex justify-between"><span>Despesas já pagas</span><strong>{formatCurrency(cpfTax.deductibleExpensesLivroCaixa)}</strong></div>
                    <div className="flex justify-between"><span>+ Despesas previstas</span><strong>{formatCurrency(cpfTax.deductibleExpensesToPay)}</strong></div>
                    <div className="flex justify-between border-t border-blue-100 pt-1.5"><span>= Despesas projetadas</span><strong>{formatCurrency(cpfTax.deductibleExpensesProjected)}</strong></div>
                  </div>}
                </>;
              })()}
              <button
                type="button"
                onClick={() => setIsIrpfMemoryModalOpen(true)}
                className="w-full mt-2.5 py-2 px-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-900 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>Ver Memória de Cálculo & Fontes Oficiais 2026</span>
              </button>
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
                    Regime de Competência (NFS-e) • {competenceLabel}
                  </span>
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                  !isBaselineConfigured || !cnpjTax.available
                    ? 'bg-slate-100 text-slate-600 border border-slate-200'
                    : cnpjTax.isAnexoIII
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {!isBaselineConfigured
                  ? 'Bases Pendentes'
                  : !cnpjTax.available
                  ? fiscalBaseStatusLabel(fiscalBase)
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
                  {isBaselineConfigured && fiscalBase.status !== 'AVAILABLE' ? '—' : formatPercent(displayFatorRPercent)}
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
                  {isBaselineConfigured && cnpjTax.available
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
                  {isBaselineConfigured && cnpjTax.available ? formatPercent(cnpjTax.effectiveTaxRate) : '—'}
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
                      {isBaselineConfigured && cnpjTax.available ? formatPercent(cnpjTax.effectiveTaxRate) : '—'}
                    </span>
                  </div>
                </div>
                <span className="text-lg font-bold font-mono text-blue-900">
                  {isBaselineConfigured && cnpjTax.available ? formatCurrency(cnpjTax.dasEstimated) : '—'}
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
                    Período de apuração: {competenceLabel}
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

                  {/* Opção 3: Sincronizar com Escritório Contaju */}
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
                            Sincronizar com Escritório Contaju
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                            Oficial Contaju
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Importação automática das apurações do Escritório Contaju LTDA diretamente via CNPJ da clínica.
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
                      : 'Escritório Contaju'}
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
                          placeholder="0,00"
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
                          placeholder="0,00"
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
                          placeholder="0,00"
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
                          Conectar ao Escritório Contaju
                        </h4>
                      </div>
                      <p className="text-xs text-teal-900 leading-relaxed">
                        A integração oficial com o Escritório Contaju sincroniza automaticamente as apurações de faturamento, folha de pagamento, base do Fator R e guias DAS emitidas pela contabilidade.
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
                          Sua solicitação de conexão para o CNPJ <strong className="font-mono">{formatCnpj(contabilexLink.cnpj)}</strong> foi registrada com sucesso e está aguardando homologação pelo Escritório Contaju.
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
                              Conectado ao Escritório Contaju
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
                            {displayedSnapshots.length} competência{displayedSnapshots.length !== 1 ? 's' : ''} disponível{displayedSnapshots.length !== 1 ? 'is' : ''} (últimos 12 meses)
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
                                <span>{isSavingBases ? 'Ativando...' : 'Ativar Contaju como Fonte Oficial'}</span>
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
                          O vínculo com o Escritório Contaju foi desativado. Todo o histórico de competências e confirmações anteriores permanece preservado com segurança. Para restabelecer o vínculo, envie uma nova solicitação abaixo.
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

                        {hasSavedCnpj ? (
                          <div className="p-3.5 rounded-xl bg-teal-50/80 border border-teal-200 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-teal-800 uppercase font-bold tracking-wider flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                                CNPJ Identificado nos Dados Profissionais
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                                Preenchido em Configurações
                              </span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                              <div>
                                <span className="font-mono text-base font-bold text-slate-900 block">
                                  {formatCnpj(savedCnpj)}
                                </span>
                                <span className="text-xs text-slate-600">
                                  Clínica: <strong>{clinicName}</strong>
                                </span>
                              </div>
                            </div>
                            <p className="text-[11px] text-teal-900 leading-relaxed border-t border-teal-200/60 pt-2">
                              A integração com o Escritório Contaju utilizará diretamente o CNPJ salvo nos dados profissionais da sua clínica.
                            </p>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] text-slate-500 uppercase font-bold">
                                CNPJ da Clínica (14 dígitos)
                              </label>
                              <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Não cadastrado em Configurações
                              </span>
                            </div>
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
                              Dica: cadastre o CNPJ da clínica na aba <strong>Configurações</strong> para não precisar digitá-lo novamente.
                            </span>
                          </div>
                        )}

                        <div className="pt-2 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={handleRequestContabilexLink}
                            disabled={
                              isRequestingLink ||
                              tenantAuthStatus !== 'AUTHENTICATED_WITH_TENANT' ||
                              normalizeCnpj(savedCnpj || contabilexCnpjInput).length !== 14
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
                placeholder=""
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

      {/* 8. MODAL: Memória de Cálculo & Fontes Oficiais — IRPF / Carnê-Leão 2026 */}
      {isIrpfMemoryModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Memória de Cálculo — {isCpfProjected ? 'Projeção' : 'Realizado'} • Carnê-Leão {effectiveYear}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      {effectiveYear === CARNE_LEAO_RULES_2026.year
                        ? `Tabela Oficial ${CARNE_LEAO_RULES_2026.year}`
                        : `Regras cadastradas ${effectiveYear}`}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300">
                    Tipo de cálculo: {isCpfProjected ? 'PROJEÇÃO' : 'REALIZADO'} • Período: {competenceLabel} • Regime de Caixa PF
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsIrpfMemoryModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-slate-700 text-xs leading-relaxed">
              
              {/* 1. Resumo da Apuração do Mês */}
              <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {cpfTax.isAnnualSummary ? `Resumo anual ${effectiveYear} (soma das apurações mensais)` : `Demonstração Sintética do Mês (${formatMonthYear(competenceStr)})`}
                  </span>
                  <span className="font-mono font-bold text-emerald-900 text-sm">
                    IRPF {isCpfProjected ? 'projetado' : 'realizado'}: {formatCurrency(cpfTax.isAnnualSummary
                      ? (isCpfProjected ? cpfTax.annualSummary.projectedFinalTax : cpfTax.annualSummary.finalTax)
                      : cpfCalculationDisplayed.impostoFinal)}
                  </span>
                </div>

                {cpfTax.isAnnualSummary ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-center">
                    <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                      <span className="block text-[10px] text-slate-500 font-sans">Rendimentos {isCpfProjected ? 'projetados' : 'realizados'} no ano</span>
                      <span className="font-bold text-slate-900">{formatCurrency(isCpfProjected ? cpfTax.annualSummary.projectedGrossRevenue : cpfTax.annualSummary.grossRevenueReceived)}</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                      <span className="block text-[10px] text-slate-500 font-sans">Livro Caixa {isCpfProjected ? 'projetado/utilizado' : 'realizado/utilizado'}</span>
                      <span className="font-bold text-rose-600">{formatCurrency(isCpfProjected ? cpfTax.annualSummary.projectedLivroCaixaUsed : cpfTax.annualSummary.livroCaixaUsed)}</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                      <span className="block text-[10px] text-slate-500 font-sans">Soma das bases {isCpfProjected ? 'projetadas' : 'realizadas'}</span>
                      <span className="font-bold text-slate-900">{formatCurrency(isCpfProjected ? cpfTax.annualSummary.projectedTaxableBase : cpfTax.annualSummary.taxableBase)}</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                      <span className="block text-[10px] text-slate-500 font-sans">Excesso encerrado em dezembro</span>
                      <span className="font-bold text-slate-900">{formatCurrency(cpfTax.annualSummary.excessClosedAtYearEnd)}</span>
                    </div>
                  </div>
                ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-center">
                  <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                    <span className="block text-[10px] text-slate-500 font-sans">Rendimentos {isCpfProjected ? 'projetados' : 'realizados'}</span>
                    <span className="font-bold text-slate-900">{formatCurrency(cpfCalculationDisplayed.rendimentosTributaveis)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                    <span className="block text-[10px] text-slate-500 font-sans">Livro Caixa {isCpfProjected ? 'projetado/utilizado' : 'utilizado — realizado'}</span>
                    <span className="font-bold text-rose-600">− {formatCurrency(cpfCalculationDisplayed.livroCaixaUtilizado)}</span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                    <span className="block text-[10px] text-slate-500 font-sans">(-) Dedução Aplicada</span>
                    <span className="font-bold text-emerald-700">
                      − {formatCurrency(cpfCalculationDisplayed.deducaoAplicada)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border border-emerald-100">
                    <span className="block text-[10px] text-slate-500 font-sans">Base de cálculo {isCpfProjected ? 'projetada' : 'realizada'}</span>
                    <span className="font-bold text-slate-900">{formatCurrency(cpfCalculationDisplayed.baseCalculo)}</span>
                  </div>
                </div>
                )}
                {isCpfProjected && !cpfTax.isAnnualSummary && (
                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-[11px] space-y-1.5">
                    <strong className="block text-blue-950">Composição da projeção</strong>
                    <div className="flex justify-between"><span>Receitas já recebidas</span><span className="font-mono">{formatCurrency(cpfTax.grossRevenueReceived)}</span></div>
                    <div className="flex justify-between"><span>+ Receitas previstas</span><span className="font-mono">{formatCurrency(Math.max(0, cpfTax.grossRevenueProjected - cpfTax.grossRevenueReceived))}</span></div>
                    <div className="flex justify-between border-t border-blue-200 pt-1"><strong>= Rendimentos projetados</strong><strong className="font-mono">{formatCurrency(cpfTax.grossRevenueProjected)}</strong></div>
                    <div className="flex justify-between"><span>Despesas já pagas</span><span className="font-mono">{formatCurrency(cpfTax.deductibleExpensesLivroCaixa)}</span></div>
                    <div className="flex justify-between"><span>+ Despesas previstas</span><span className="font-mono">{formatCurrency(cpfTax.deductibleExpensesToPay)}</span></div>
                    <div className="flex justify-between border-t border-blue-200 pt-1"><strong>= Despesas projetadas</strong><strong className="font-mono">{formatCurrency(cpfTax.deductibleExpensesProjected)}</strong></div>
                  </div>
                )}
              </div>

              {/* Memória integral do cálculo, na mesma ordem do motor tributário. */}
              {cpfTax.isAnnualSummary ? (
                <div className="space-y-3">
                  <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Apurações mensais e transporte do Livro Caixa</h4>
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="p-2">Mês</th><th className="p-2 text-right">Rendimentos</th>
                          <th className="p-2 text-right">Despesas pagas</th><th className="p-2 text-right">Saldo anterior</th>
                          <th className="p-2 text-right">Disponível</th><th className="p-2 text-right">Usado</th>
                          <th className="p-2 text-right">Excesso</th><th className="p-2 text-right">Deduções legais</th>
                          <th className="p-2 text-right">Simplificado</th><th className="p-2 text-right">Base</th>
                          <th className="p-2 text-right">Tabela</th><th className="p-2 text-right">Redução</th>
                          <th className="p-2 text-right">Final</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cpfTax.monthlyResults.map((result) => {
                          const calculation = isCpfProjected ? result.projectedCalculation : result.monthlyCalculation;
                          return (
                            <tr key={result.month}>
                              <td className="p-2">{formatMonthYear(result.month)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.rendimentosTributaveis)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.despesasLivroCaixaMes)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.excessoLivroCaixaAnterior)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.livroCaixaDisponivel)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.livroCaixaUtilizado)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.excessoLivroCaixaProximoMes)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.deducoesLegais)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.descontoSimplificado)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.baseCalculo)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.impostoTabela)}</td>
                              <td className="p-2 text-right font-mono">{formatCurrency(calculation.reducaoEspecial)}</td>
                              <td className="p-2 text-right font-mono font-bold">{formatCurrency(calculation.impostoFinal)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-slate-500">O excesso de dezembro é demonstrado para auditoria, mas não é transportado para janeiro.</p>
                </div>
              ) : (() => {
                const monthly = cpfCalculationDisplayed;
                const reductionRules = CARNE_LEAO_RULES_2026.specialReduction;
                const deductionLabel = monthly.tipoDeducaoEscolhida === 'DEDUCOES_LEGAIS'
                  ? 'Deduções legais'
                  : 'Desconto simplificado';
                const carryLabel = monthly.month === 12
                  ? 'Excesso de dezembro encerrado no ano (não segue para janeiro)'
                  : 'Excesso transportado para o próximo mês';
                const reductionExplanation = monthly.faixaReducao2026 === 'INTEGRAL'
                  ? `Faixa integral: rendimentos até ${formatCurrency(reductionRules.fullReductionIncomeLimit)}; redução limitada a ${formatCurrency(reductionRules.fullReductionMaximum)} e ao imposto apurado.`
                  : monthly.faixaReducao2026 === 'PARCIAL'
                  ? `Faixa parcial: ${formatCurrency(reductionRules.partialReductionConstant)} − (${reductionRules.partialReductionIncomeFactor} × rendimentos tributáveis do mês).`
                  : monthly.faixaReducao2026 === 'SEM_REDUCAO'
                  ? `Rendimentos acima de ${formatCurrency(reductionRules.partialReductionIncomeLimit)}; sem redução especial.`
                  : 'Sem redução especial neste ano-calendário.';
                const steps = [
                  {
                    title: isCpfProjected ? '1. Rendimentos projetados no mês' : '1. Rendimentos realizados no mês',
                    detail: isCpfProjected
                      ? 'Receitas recebidas no mês + recebimentos pendentes previstos até o fechamento.'
                      : 'Regime de caixa: considera somente receitas CPF tributáveis efetivamente recebidas.',
                    value: formatCurrency(monthly.rendimentosTributaveis),
                  },
                  {
                    title: isCpfProjected ? '2. Despesas de Livro Caixa projetadas' : '2. Despesas de Livro Caixa pagas no mês',
                    detail: isCpfProjected
                      ? 'Despesas dedutíveis pagas + despesas dedutíveis previstas até o fechamento.'
                      : 'Despesas CPF dedutíveis efetivamente pagas nesta competência.',
                    value: formatCurrency(monthly.despesasLivroCaixaMes),
                  },
                  {
                    title: '3. Excesso de Livro Caixa trazido do mês anterior',
                    detail: 'Saldo acumulado somente dentro do mesmo ano-calendário.',
                    value: formatCurrency(monthly.excessoLivroCaixaAnterior),
                  },
                  {
                    title: '4. Livro Caixa disponível',
                    detail: 'Despesas pagas no mês + excesso do mês anterior.',
                    value: formatCurrency(monthly.livroCaixaDisponivel),
                  },
                  {
                    title: '5. Livro Caixa efetivamente utilizado',
                    detail: 'Limitado aos rendimentos sujeitos ao limite do Livro Caixa neste mês.',
                    value: formatCurrency(monthly.livroCaixaUtilizado),
                  },
                  {
                    title: '6. ' + carryLabel,
                    detail: monthly.month === 12
                      ? 'O excedente de dezembro não é levado ao próximo ano-calendário.'
                      : 'Disponível para compensação no mês seguinte do mesmo ano.',
                    value: formatCurrency(monthly.excessoLivroCaixaProximoMes),
                  },
                  {
                    title: '7. Outras deduções legais',
                    detail:
                      'INSS ' + formatCurrency(monthly.inssDedutivel) +
                      ' + dependentes ' + formatCurrency(monthly.dependentesDedutiveis) +
                      ' + pensão ' + formatCurrency(monthly.pensaoDedutivel) +
                      ' + outras ' + formatCurrency(monthly.outrasDeducoesLegais),
                    value: formatCurrency(
                      monthly.inssDedutivel +
                      monthly.dependentesDedutiveis +
                      monthly.pensaoDedutivel +
                      monthly.outrasDeducoesLegais
                    ),
                  },
                  {
                    title: '8. Total das deduções legais',
                    detail: 'Livro Caixa utilizado + INSS + dependentes + pensão + demais deduções legais.',
                    value: formatCurrency(monthly.deducoesLegais),
                  },
                  {
                    title: '9. Desconto simplificado mensal disponível',
                    detail: 'Alternativa às deduções legais; não é somado ao Livro Caixa.',
                    value: formatCurrency(monthly.descontoSimplificado),
                  },
                  {
                    title: '10. Opção mais vantajosa',
                    detail: 'Comparação entre o total das deduções legais e o desconto simplificado.',
                    value: deductionLabel,
                  },
                  {
                    title: '11. Dedução efetivamente aplicada',
                    detail: 'Maior opção, limitada aos rendimentos para evitar base negativa.',
                    value: formatCurrency(monthly.deducaoAplicada),
                  },
                  {
                    title: '12. Base de cálculo do IRPF',
                    detail: 'Rendimentos tributáveis menos somente a dedução escolhida.',
                    value: formatCurrency(monthly.baseCalculo),
                  },
                  {
                    title: '13. Faixa da tabela progressiva mensal',
                    detail: 'Tabela mensal oficial vigente no ano-calendário.',
                    value: 'Faixa ' + monthly.faixaTabela,
                  },
                  {
                    title: '14. Alíquota da faixa',
                    detail: 'Alíquota nominal aplicada à base de cálculo.',
                    value: formatPercent(monthly.aliquota * 100),
                  },
                  {
                    title: '15. Parcela a deduzir',
                    detail: 'Valor fixo correspondente à faixa da tabela.',
                    value: formatCurrency(monthly.parcelaDeduzir),
                  },
                  {
                    title: '16. Imposto calculado pela tabela progressiva',
                    detail: 'Base × alíquota − parcela a deduzir, sem resultado negativo.',
                    value: formatCurrency(monthly.impostoTabela),
                  },
                  {
                    title: '17. Rendimentos usados para testar a redução especial',
                    detail: 'A faixa legal usa os rendimentos tributáveis, não a base nem as despesas.',
                    value: formatCurrency(monthly.rendimentosTributaveis),
                  },
                  {
                    title: '18. Redução especial — ' + reductionRules.law,
                    detail: reductionExplanation,
                    value: '− ' + formatCurrency(monthly.reducaoEspecial),
                  },
                  {
                    title: '19. Carnê-Leão final a recolher',
                    detail: 'Imposto da tabela menos redução especial, limitado a zero.',
                    value: formatCurrency(monthly.impostoFinal),
                  },
                ];

                return (
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-emerald-600" />
                      Passo a Passo da Memória de Cálculo
                    </h4>
                    <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                      {steps.map((step) => (
                        <div key={step.title} className="p-3 bg-white flex items-center justify-between gap-4">
                          <div>
                            <span className="font-bold text-slate-900">{step.title}</span>
                            <p className="text-[11px] text-slate-500">{step.detail}</p>
                          </div>
                          <span className="font-mono font-bold text-slate-900 shrink-0">{step.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* 3. Tabela carregada da configuração tributária central do ano */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  Tabela Progressiva Mensal Oficial {effectiveYear} (RFB)
                </h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Faixa</th>
                        <th className="py-2 px-3">Base de Cálculo Mensal (R$)</th>
                        <th className="py-2 px-3 text-center">Alíquota</th>
                        <th className="py-2 px-3 text-right">Parcela a Deduzir (R$)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {cpfTax.rules.brackets.map((bracket, index) => {
                        const lastBracket = index === cpfTax.rules.brackets.length - 1;
                        const rangeLabel = index === 0
                          ? `Até ${formatCurrency(bracket.max)}`
                          : lastBracket
                          ? `Acima de ${formatCurrency(bracket.min)}`
                          : `De ${formatCurrency(bracket.min)} até ${formatCurrency(bracket.max)}`;
                        return (
                          <tr key={`${bracket.min}-${index}`} className={cpfCalculationDisplayed.faixaTabela === index + 1 ? 'bg-emerald-50/80 font-bold text-emerald-950' : ''}>
                            <td className="py-2 px-3 font-sans">{index + 1}ª Faixa</td>
                            <td className="py-2 px-3">{rangeLabel}</td>
                            <td className="py-2 px-3 text-center">{formatPercent(bracket.rate * 100)}</td>
                            <td className="py-2 px-3 text-right">{formatCurrency(bracket.deduction)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Fontes Oficiais & Legislação Aplicável */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Fontes Oficiais & Fundamentação Jurídica
                </span>
                <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside">
                  <li>
                    <strong>Lei Federal nº 15.191/2025:</strong> Atualiza a tabela progressiva mensal de 2026. A redução especial de imposto até {formatCurrency(CARNE_LEAO_RULES_2026.specialReduction.partialReductionIncomeLimit)} decorre da {CARNE_LEAO_RULES_2026.specialReduction.law}.
                  </li>
                  <li>
                    <strong>Artigo 75 do Regulamento do Imposto de Renda (Decreto nº 9.580/2018):</strong> Disciplina a escrituração do Livro Caixa e o recolhimento mensal obrigatório via Carnê-Leão pelo profissional liberal da odontologia.
                  </li>
                  <li>
                    <strong>Instrução Normativa RFB nº 1.500/2014:</strong> Normatiza a tributação dos rendimentos do trabalho não assalariado e a sistemática do desconto simplificado mensal ({formatCurrency(CARNE_LEAO_RULES_2026.simplifiedDiscountMonthly)} em {CARNE_LEAO_RULES_2026.year}).
                  </li>
                  <li>
                    <strong>Lei Complementar nº 123/2006:</strong> Garante a independência e segregação das bases tributárias de pessoa física (Carnê-Leão) em relação às bases de pessoa jurídica (Simples Nacional / Fator R).
                  </li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsIrpfMemoryModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                Fechar Memória de Cálculo
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


