import React, { useState, useEffect, useMemo } from 'react';
import { db } from './lib/db';
import { Sidebar, NavTab } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
import { ConsultingBar } from './components/Layout/ConsultingBar';
import { PeriodFilterBar } from './components/Layout/PeriodFilterBar';
import { DashboardView } from './components/Dashboard/DashboardView';
import { SalesView } from './components/Sales/SalesView';
import { ProceduresView } from './components/Procedures/ProceduresView';
import { SuppliesView } from './components/Supplies/SuppliesView';
import { ReceivablesView } from './components/Receivables/ReceivablesView';
import { ExpensesView } from './components/Expenses/ExpensesView';
import { PatientsView } from './components/Patients/PatientsView';
import { ChartOfAccountsView } from './components/ChartOfAccounts/ChartOfAccountsView';
import { TaxesView } from './components/Taxes/TaxesView';
import { ReportsView } from './components/Reports/ReportsView';
import { SettingsView } from './components/Settings/SettingsView';
import { FinancialDashboard } from './components/Financial/FinancialDashboard';
import { FiscalSimulatorView } from './components/Simulator/FiscalSimulatorView';
import { BankAccountsView } from './components/BankAccounts/BankAccountsView';
import { AppointmentsView } from './components/Appointments/AppointmentsView';
import { LoginView } from './components/Auth/LoginView';
import { AppLoadingSkeleton } from './components/UI/AppLoadingSkeleton';

import { NewSaleModal } from './components/Modals/NewSaleModal';
import { NewExpenseModal } from './components/Modals/NewExpenseModal';
import { SettlePaymentModal } from './components/Modals/SettlePaymentModal';
import { AccountReceivableItem, DentalTenantOption } from './types';
import { SupabaseService, supabase, mapDbAppointmentToApp } from './lib/supabaseClient';
import { ToastProvider, useToast } from './components/UI/ToastContext';
import { WhatsAppMainView } from './components/WhatsApp/WhatsAppMainView';
import { ToastContainer } from './components/UI/Toast';
import { GlobalNotificationHub } from './components/Notifications/GlobalNotificationHub';
import { GlobalPatientSearchModal } from './components/Navigation/GlobalPatientSearchModal';
import { getEffectivePayableStatus, getEffectiveReceivableStatus } from './lib/statusHelper';
import { Patient, ConsultingPortfolioData, ConsultingClientSummary, ConsultingNavTab } from './types';
import { ShieldAlert, ShieldCheck, ArrowLeft } from 'lucide-react';
import { canAccessTab } from './lib/permissions';
import { ConsultingHeader } from './components/Consulting/ConsultingHeader';
import { ConsultingSidebar } from './components/Consulting/ConsultingSidebar';
import { ConsultingPortfolioDashboard } from './components/Consulting/ConsultingPortfolioDashboard';
import { ConsultingClinicsView } from './components/Consulting/ConsultingClinicsView';
import { ConsultingFinancialIndicatorsView } from './components/Consulting/ConsultingFinancialIndicatorsView';
import { ConsultingTaxesView } from './components/Consulting/ConsultingTaxesView';
import { ConsultingOverdueView } from './components/Consulting/ConsultingOverdueView';
import { ConsultingAlertsView } from './components/Consulting/ConsultingAlertsView';
import { ConsultingIntegrationsView } from './components/Consulting/ConsultingIntegrationsView';
import { ConsultingComparativeView } from './components/Consulting/ConsultingComparativeView';
import { ConsultingReportsView } from './components/Consulting/ConsultingReportsView';
import { ConsultingSettingsView } from './components/Consulting/ConsultingSettingsView';
import { ConsultingClientSummaryModal } from './components/Consulting/ConsultingClientSummaryModal';

function AppContent() {
  const toast = useToast();
  // Database state sync
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => unsubscribe();
  }, []);

  const currentSession = db.getCurrentSession();
  const isDemoMode = db.getIsDemoMode();
  // UI state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!db.getCurrentSession());
  const [hasRecoveryUrlParams, setHasRecoveryUrlParams] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const pathname = window.location.pathname || '';
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    return (
      pathname.includes('/auth/recovery') ||
      hash.includes('type=recovery') ||
      hash.includes('otp_expired') ||
      hash.includes('access_denied') ||
      search.includes('type=recovery') ||
      search.includes('otp_expired') ||
      search.includes('access_denied')
    );
  });

  useEffect(() => {
    setIsAuthenticated(!!db.getCurrentSession());
  }, [tick]);

  const handleLogout = () => {
    db.logout();
    setIsAuthenticated(false);
    toast.info('Sessão encerrada com sucesso.');
  };

  const isPrimaryAccount = Boolean(
    currentSession?.user?.isPrimary ||
    currentSession?.user?.role === 'SUPER_ADMIN' ||
    currentSession?.user?.role === 'PLATFORM_ADMIN'
  );

  const [availableClinics, setAvailableClinics] = useState<DentalTenantOption[]>([]);
  const [isSwitchingClinic, setIsSwitchingClinic] = useState(false);

  useEffect(() => {
    if (isPrimaryAccount) {
      SupabaseService.getAllTenantsForSupport()
        .then((tenants) => {
          if (tenants && tenants.length > 0) {
            // Filtrar rigorosamente clínicas de demonstração e teste para manter apenas reais
            const filtered = tenants.filter(
              (t) =>
                t.tenant_id !== 'tenant_demo' &&
                !t.clinic_name.toLowerCase().includes('demo') &&
                !t.clinic_name.toLowerCase().includes('teste')
            );
            // Deduplicação defensiva por tenant_id
            const seen = new Set<string>();
            const unique = filtered.filter((t) => {
              if (!t.tenant_id || seen.has(t.tenant_id)) return false;
              seen.add(t.tenant_id);
              return true;
            });
            setAvailableClinics(unique);
          }
        })
        .catch((err) => {
          console.warn('Erro ao listar clínicas para suporte:', err);
        });
    }
  }, [isPrimaryAccount, tick]);

  const handleSelectClinic = async (targetTenantId: string, clinicName?: string) => {
    if (!targetTenantId) return;
    if (currentSession?.supportSession?.targetTenantId === targetTenantId) return;

    setSummaryClient(null);
    setIsSwitchingClinic(true);
    try {
      const selected = availableClinics.find((c) => c.tenant_id === targetTenantId);
      const name = clinicName || selected?.clinic_name || targetTenantId;
      const res = await db.startSupportSessionAsync(
        targetTenantId,
        name,
        'Acesso gerencial e suporte contábil/consultoria'
      );
      if (res.success) {
        toast.success(`Acessando clínica: ${name}`);
      } else {
        toast.error(res.error || 'Não foi possível alternar de clínica.');
      }
    } catch (err: any) {
      toast.error('Erro ao alternar de clínica.');
    } finally {
      setIsSwitchingClinic(false);
    }
  };

  const handleReturnToPrimary = async () => {
    setSummaryClient(null);
    setIsSwitchingClinic(true);
    try {
      db.endSupportSession();
      toast.info('Retornado para a Visão da Carteira.');
    } finally {
      setTimeout(() => setIsSwitchingClinic(false), 200);
    }
  };

  // Estados exclusivos da Central de Supervisão de Consultoria (Escritório Contaju)
  const [consultingCompetency, setConsultingCompetency] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [consultingData, setConsultingData] = useState<ConsultingPortfolioData | null>(null);
  const [isConsultingLoading, setIsConsultingLoading] = useState(false);
  const [consultingTab, setConsultingTab] = useState<ConsultingNavTab>('portfolio');
  const [summaryClient, setSummaryClient] = useState<ConsultingClientSummary | null>(null);
  const [isConsultingSidebarCollapsed, setIsConsultingSidebarCollapsed] = useState(false);

  const fetchConsultingData = async () => {
    if (!isPrimaryAccount) return;
    setIsConsultingLoading(true);
    try {
      const data = await SupabaseService.getConsultingPortfolioSummary(consultingCompetency);
      if (data) {
        setConsultingData(data);
        if (summaryClient) {
          const updated = data.clients.find((c) => c.tenant_id === summaryClient.tenant_id);
          if (updated) setSummaryClient(updated);
        }
      }
    } catch (err) {
      console.error('[Consulting] Falha ao carregar carteira de supervisão:', err);
    } finally {
      setIsConsultingLoading(false);
    }
  };

  useEffect(() => {
    if (isPrimaryAccount) {
      fetchConsultingData();
    }
  }, [isPrimaryAccount, consultingCompetency, tick]);

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [newExpenseInitialType, setNewExpenseInitialType] = useState<
    'UNICA' | 'PARCELADA' | 'RECORRENTE' | undefined
  >(undefined);

  const handleNavigateTab = (tab: NavTab, action?: string) => {
    const role = currentSession?.user?.role || 'OWNER';
    const userPermissions = currentSession?.user?.permissions;
    const isPrimary = currentSession?.user?.isPrimary;
    if (!canAccessTab(role, tab, userPermissions, isPrimary)) {
      toast.error('Acesso restrito: seu perfil não possui autorização para acessar esta seção.');
      return;
    }

    setCurrentTab(tab);
    if (action) {
      if (action === 'new_sale') {
        setIsNewSaleOpen(true);
      } else if (action === 'new_expense') {
        setNewExpenseInitialType('UNICA');
        setIsNewExpenseOpen(true);
      } else if (action === 'new_recurrent_expense') {
        setNewExpenseInitialType('RECORRENTE');
        setIsNewExpenseOpen(true);
      } else {
        setPendingAction(action);
      }
    }
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [maskCpf, setMaskCpf] = useState(false); // CPF always displayed completely as required

  // Tenant ativo (suporte ou próprio)
  const activeTenantId =
    currentSession?.supportSession?.targetTenantId ||
    currentSession?.tenantId ||
    '';

  // Contador de mensagens WhatsApp não lidas em tempo real
  const [whatsappUnreadCount, setWhatsappUnreadCount] = useState<number>(0);

  // Navegação cruzada entre Notificações, Agenda, Pacientes e WhatsApp
  const [initialWhatsAppConversationId, setInitialWhatsAppConversationId] = useState<string | undefined>(undefined);
  const [initialWhatsAppContactId, setInitialWhatsAppContactId] = useState<string | undefined>(undefined);
  const [initialWhatsAppPatientId, setInitialWhatsAppPatientId] = useState<string | undefined>(undefined);
  const [initialAgendaDate, setInitialAgendaDate] = useState<string | undefined>(undefined);
  const [initialAgendaPatientId, setInitialAgendaPatientId] = useState<string | undefined>(undefined);

  const handleOpenConversationFromNotification = async (
    conversationId: string,
    contactId?: string,
    targetTenantId?: string
  ) => {
    if (targetTenantId && targetTenantId !== activeTenantId && isPrimaryAccount) {
      await handleSelectClinic(targetTenantId);
    }
    setInitialWhatsAppConversationId(conversationId);
    if (contactId) setInitialWhatsAppContactId(contactId);
    setCurrentTab('whatsapp');
  };

  // Redirecionamento defensivo se o perfil do usuário não tiver permissão para a aba atual
  useEffect(() => {
    const role = currentSession?.user?.role;
    if (!role) return;
    const userPermissions = currentSession?.user?.permissions;
    const isPrimary = currentSession?.user?.isPrimary;

    if (!canAccessTab(role, currentTab, userPermissions, isPrimary)) {
      const candidateTabs: NavTab[] = [
        'dashboard',
        'whatsapp',
        'agenda',
        'patients',
        'sales',
        'receivables',
        'expenses',
        'financial',
        'bank_accounts',
        'chart_of_accounts',
        'taxes',
        'fiscal_simulator',
        'reports',
        'procedures',
        'supplies',
        'settings',
      ];
      const firstAllowed = candidateTabs.find((t) => canAccessTab(role, t, userPermissions, isPrimary));
      if (firstAllowed) {
        setCurrentTab(firstAllowed);
        toast.info('Seu acesso a este módulo foi atualizado.');
      }
    }
  }, [currentSession?.user?.role, currentSession?.user?.permissions, currentSession?.user?.isPrimary, currentTab]);

  useEffect(() => {
    if (!activeTenantId) return;

    const fetchWhatsappUnread = async () => {
      try {
        const { data, error } = await supabase
          .from('df_wa_conversations')
          .select('unread_count')
          .eq('tenant_id', activeTenantId);

        if (!error && data) {
          const total = data.reduce((acc, row) => acc + (row.unread_count || 0), 0);
          setWhatsappUnreadCount(total);
        }
      } catch (e) {
        console.warn('Erro ao calcular unread do WhatsApp:', e);
      }
    };

    fetchWhatsappUnread();

    const channel = supabase
      .channel(`app_realtime_${activeTenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'df_wa_conversations',
          filter: `tenant_id=eq.${activeTenantId}`,
        },
        () => {
          fetchWhatsappUnread();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'df_appointments',
          filter: `tenant_id=eq.${activeTenantId}`,
        },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            if (payload.old?.id) {
              db.deleteAppointmentFromRemote(payload.old.id);
            }
          } else if (payload.new) {
            const appt = mapDbAppointmentToApp(payload.new);
            db.syncAppointmentFromRemote(appt);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTenantId, tick]);

  // Global Period Filter State - Mês civil atual dinâmico por padrão
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    return new Date().getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>(() => {
    return new Date().getMonth() + 1;
  });

  const handleChangePeriod = (year: number, month: number | 'ALL') => {
    setSelectedYear(year);
    setSelectedMonth(month);
    const m = month === 'ALL' ? '12' : String(month).padStart(2, '0');
    setConsultingCompetency(`${year}-${m}`);
  };

  const handleResetPeriod = () => {
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
    setConsultingCompetency(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  // Modals state
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(false);
  const [newSalePatientId, setNewSalePatientId] = useState<string | undefined>(undefined);
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  const [settleItem, setSettleItem] = useState<AccountReceivableItem | null>(null);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [selectedPatientForViewId, setSelectedPatientForViewId] = useState<string | undefined>(undefined);

  // Global Ctrl+K / Cmd+K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectPatientFromSearch = (patient: Patient) => {
    setSelectedPatientForViewId(patient.id);
    setCurrentTab('patients');
    setIsGlobalSearchOpen(false);
    setMobileMenuOpen(false);
  };

  // Loaded database data
  const organization = db.getOrg();
  const professional = db.getProfessional();
  const patients = db.getPatients();
  const sales = db.getSales();
  const expenses = db.getExpenses();
  const categories = db.getCategories();
  const bankAccounts = db.getBankAccounts();
  const payrollHistory = db.getPayrollHistory();
  const auditLogs = db.getAuditLogs();
  const taxRulesPf = db.getTaxRulesPf(selectedYear);
  const taxRulesSimples = db.getTaxRulesSimples(selectedYear);
  const receivablesList = db.getAccountsReceivable();
  const procedures = db.getProcedures();

  // Period Prefix for Filtering
  const periodPrefix = useMemo(() => {
    if (selectedMonth === 'ALL') {
      return `${selectedYear}`;
    }
    return `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  // Filtered sales based on global period (strictly by sale date / serviceDate)
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      return Boolean(sale.serviceDate && sale.serviceDate.startsWith(periodPrefix));
    });
  }, [sales, periodPrefix]);

  // Filtered expenses based on global period
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      return (
        (exp.competenceDate && exp.competenceDate.startsWith(periodPrefix)) ||
        (exp.dueDate && exp.dueDate.startsWith(periodPrefix)) ||
        (exp.paymentDate && exp.paymentDate.startsWith(periodPrefix))
      );
    });
  }, [expenses, periodPrefix]);

  // Filtered receivables based on global period (strictly by installment due date or receipt date)
  const filteredReceivables = useMemo(() => {
    return receivablesList.filter((item) => {
      const targetDate =
        item.status === 'RECEBIDO' && item.paymentDate
          ? item.paymentDate
          : item.dueDate;
      return Boolean(targetDate && targetDate.startsWith(periodPrefix));
    });
  }, [receivablesList, periodPrefix]);

  // Period KPI stats for the global bar
  const periodSalesValue = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + s.totalValue, 0);
  }, [filteredSales]);

  const periodExpensesValue = useMemo(() => {
    return filteredExpenses.reduce((acc, e) => acc + e.value, 0);
  }, [filteredExpenses]);

  const periodReceivablesValue = useMemo(() => {
    return filteredReceivables
      .filter((r) => r.status !== 'RECEBIDO' && r.status !== 'CANCELADO')
      .reduce((acc, r) => acc + r.balance, 0);
  }, [filteredReceivables]);

  // Pending and Alert Counters
  const pendingReceitaSaudeCount = sales
    .filter((s) => s.taxOrigin === 'CPF')
    .reduce((acc, sale) => {
      return (
        acc +
        sale.installments.filter(
          (i) => i.status === 'RECEBIDO' && i.receitaSaudeStatus !== 'EMITIDO'
        ).length
      );
    }, 0);

  const overdueReceivablesCount = receivablesList.filter(
    (r) => getEffectiveReceivableStatus(r) === 'EM_ATRASO' || r.status === 'EM_ATRASO' || r.status === 'VENCIDO'
  ).length;
  const overdueExpensesCount = expenses.filter(
    (e) => getEffectivePayableStatus(e) === 'EM_ATRASO'
  ).length;

  const handleQuickToggleFatorR = () => {
    const currentFatorR =
      professional.rbt12Inicial > 0
        ? professional.folha12MesesInicial / professional.rbt12Inicial
        : 0;
    const targetAbove = currentFatorR < 0.28;
    db.setFatorRScenario(targetAbove);
    toast.info(
      targetAbove
        ? 'Cenário Fator R ajustado para >= 28% (Anexo III).'
        : 'Cenário Fator R ajustado para < 28% (Anexo V).'
    );
  };

  const handleOpenNewSaleForPatient = (patientId: string) => {
    setNewSalePatientId(patientId);
    setIsNewSaleOpen(true);
  };

  const isRecoveryMode = db.getIsPasswordRecovery();

  if (!isAuthenticated || isRecoveryMode || hasRecoveryUrlParams) {
    return (
      <div className="min-h-screen bg-slate-50">
        <LoginView
          onLoginSuccess={() => {
            setHasRecoveryUrlParams(false);
            if (typeof window !== 'undefined' && window.location.pathname.includes('/auth/recovery')) {
              try {
                window.history.replaceState({}, document.title, '/');
              } catch (e) {}
            }
            setIsAuthenticated(true);
          }}
          onRecoveryDone={() => {
            setHasRecoveryUrlParams(false);
            if (typeof window !== 'undefined' && window.location.pathname.includes('/auth/recovery')) {
              try {
                window.history.replaceState({}, document.title, '/');
              } catch (e) {}
            }
          }}
        />
        <ToastContainer />
      </div>
    );
  }

  const isHydrating = db.getIsHydrating();
  const isAuthReady = db.getIsAuthReady();
  if (isHydrating || !isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppLoadingSkeleton />
        <ToastContainer />
      </div>
    );
  }

  const activeTenantIdTarget = currentSession?.supportSession?.targetTenantId || currentSession?.tenantId;
  const clinicMatch = availableClinics.find((c) => c.tenant_id === activeTenantIdTarget);

  const activeClinicDisplayName =
    (clinicMatch?.clinic_name && clinicMatch.clinic_name !== 'Clínica sem nome' ? clinicMatch.clinic_name : '') ||
    (clinicMatch?.trade_name && clinicMatch.trade_name !== 'Clínica sem nome' ? clinicMatch.trade_name : '') ||
    (currentSession?.supportSession?.targetTenantName && currentSession.supportSession.targetTenantName !== 'Clínica sem nome'
      ? currentSession.supportSession.targetTenantName
      : '') ||
    (db.getActiveClinicDisplayName?.() && db.getActiveClinicDisplayName?.() !== 'Clínica sem nome'
      ? db.getActiveClinicDisplayName()
      : '') ||
    (organization?.name && organization.name !== 'Clínica sem nome' ? organization.name : '') ||
    (professional?.nomeFantasia && professional.nomeFantasia !== 'Clínica sem nome' ? professional.nomeFantasia : '') ||
    professional?.razaoSocial ||
    'Clínica Ativa';

  // Se o usuário for da Consultoria (Escritório Contaju / Assessoria) e NÃO estiver com suporte ativo em uma clínica:
  // Renderiza a Central de Supervisão de Clientes (NÍVEL 1: Visão da Carteira)
  if (isPrimaryAccount && !currentSession?.supportSession) {
    const [compYear, compMonth] = consultingCompetency.split('-');
    const compDate = new Date(Number(compYear), Number(compMonth) - 1, 1);
    const compLabel =
      compDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).charAt(0).toUpperCase() +
      compDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).slice(1);

    const defaultTotals = {
      competency: consultingCompetency,
      total_active_clinics: 0,
      total_portfolio_revenue: 0,
      total_portfolio_expenses: 0,
      total_portfolio_open_receivables: 0,
      total_portfolio_open_payables: 0,
      total_portfolio_overdue: 0,
      healthy_count: 0,
      warning_count: 0,
      critical_count: 0,
      annex_iii_count: 0,
      annex_v_count: 0,
      estimated_total_das: 0,
      pending_closing_count: 0,
    };

    const portfolioDataSafe: ConsultingPortfolioData = consultingData || {
      portfolio_summary: defaultTotals,
      clients: [],
      priority_alerts: [],
    };

    const getConsultingTitle = (tab: ConsultingNavTab) => {
      switch (tab) {
        case 'portfolio':
          return 'Visão da Carteira';
        case 'clients':
          return 'Clínicas Supervisionadas';
        case 'financial_indicators':
          return 'Indicadores Financeiros da Carteira';
        case 'taxes_fator_r':
          return 'Inteligência Fiscal & Fator R';
        case 'overdue_accounts':
          return 'Contas em Atraso da Carteira';
        case 'alerts_pending':
          return 'Central de Alertas & Pendências';
        case 'contaju_integrations':
          return 'Integrações Contaju / Contábilex';
        case 'comparative':
          return 'Comparativo de Clínicas';
        case 'reports':
          return 'Relatórios Gerenciais da Carteira';
        case 'consulting_settings':
          return 'Configurações da Consultoria';
        default:
          return 'Visão da Carteira';
      }
    };

    return (
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans antialiased">
        <div className="flex-1 flex min-w-0">
          <ConsultingSidebar
            currentTab={consultingTab}
            onSelectTab={(tab) => setConsultingTab(tab)}
            pendingAlertsCount={portfolioDataSafe.priority_alerts?.length || 0}
            overdueClinicsCount={
              portfolioDataSafe.clients?.filter(
                (c) => c.overdue_payables > 0 || c.overdue_receivables > 0
              )?.length || 0
            }
            isCollapsed={isConsultingSidebarCollapsed}
            onToggleCollapse={setIsConsultingSidebarCollapsed}
            onLogout={handleLogout}
          />

          <div
            className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
              isConsultingSidebarCollapsed ? 'lg:pl-[112px]' : 'lg:pl-[280px]'
            }`}
          >
            <ConsultingHeader
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onChangePeriod={handleChangePeriod}
              clients={portfolioDataSafe.clients}
              onInspectSummary={(client) => setSummaryClient(client)}
              onAccessClinic={(tenantId, clinicName) => handleSelectClinic(tenantId, clinicName)}
              title={getConsultingTitle(consultingTab)}
              onLogout={handleLogout}
            />

            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
              {consultingTab === 'portfolio' && (
                <ConsultingPortfolioDashboard
                  portfolioData={portfolioDataSafe}
                  isLoading={isConsultingLoading}
                  onRefresh={fetchConsultingData}
                  onInspectSummary={(client) => setSummaryClient(client)}
                  onAccessClinic={(tenantId, clinicName) => handleSelectClinic(tenantId, clinicName)}
                  competencyLabel={compLabel}
                />
              )}

              {consultingTab === 'clients' && (
                <ConsultingClinicsView
                  clients={portfolioDataSafe.clients}
                  onInspectSummary={(client) => setSummaryClient(client)}
                  onAccessClinic={(tenantId, clinicName) => handleSelectClinic(tenantId, clinicName)}
                  competencyLabel={compLabel}
                />
              )}

              {consultingTab === 'financial_indicators' && (
                <ConsultingFinancialIndicatorsView
                  summary={portfolioDataSafe.portfolio_summary}
                  clients={portfolioDataSafe.clients}
                  onAccessClinic={(tenantId, clinicName) => handleSelectClinic(tenantId, clinicName)}
                  competencyLabel={compLabel}
                />
              )}

              {consultingTab === 'taxes_fator_r' && (
                <ConsultingTaxesView
                  summary={portfolioDataSafe.portfolio_summary}
                  clients={portfolioDataSafe.clients}
                  onAccessClinic={(tenantId, clinicName) => handleSelectClinic(tenantId, clinicName)}
                  competencyLabel={compLabel}
                />
              )}

              {consultingTab === 'overdue_accounts' && (
                <ConsultingOverdueView
                  clients={portfolioDataSafe.clients}
                  onAccessClinic={(tenantId, clinicName) => handleSelectClinic(tenantId, clinicName)}
                  competencyLabel={compLabel}
                />
              )}

              {consultingTab === 'alerts_pending' && (
                <ConsultingAlertsView
                  alerts={portfolioDataSafe.priority_alerts}
                  clients={portfolioDataSafe.clients}
                  onInspectSummary={(client) => setSummaryClient(client)}
                  onAccessClinic={(tenantId, clinicName) => handleSelectClinic(tenantId, clinicName)}
                  competencyLabel={compLabel}
                />
              )}

              {consultingTab === 'contaju_integrations' && (
                <ConsultingIntegrationsView
                  clients={portfolioDataSafe.clients}
                  onAccessClinic={(tenantId, clinicName) => handleSelectClinic(tenantId, clinicName)}
                  competencyLabel={compLabel}
                />
              )}

              {consultingTab === 'comparative' && (
                <ConsultingComparativeView
                  clients={portfolioDataSafe.clients}
                  onAccessClinic={(tenantId, clinicName) => handleSelectClinic(tenantId, clinicName)}
                  competencyLabel={compLabel}
                />
              )}

              {consultingTab === 'reports' && (
                <ConsultingReportsView
                  summary={portfolioDataSafe.portfolio_summary}
                  clients={portfolioDataSafe.clients}
                  competencyLabel={compLabel}
                />
              )}

              {consultingTab === 'consulting_settings' && (
                <ConsultingSettingsView />
              )}
            </main>
          </div>
        </div>

        {/* Modal de Inspeção Rápida da Clínica */}
        <ConsultingClientSummaryModal
          isOpen={Boolean(summaryClient)}
          onClose={() => setSummaryClient(null)}
          client={summaryClient}
          competency={consultingCompetency}
          onAccessClinic={(tenantId, clinicName) => {
            setSummaryClient(null);
            handleSelectClinic(tenantId, clinicName);
          }}
        />

        {/* Global WhatsApp Realtime Notification Hub */}
        <GlobalNotificationHub
          tenantId={activeTenantId}
          userId={currentSession?.user?.id}
          onOpenConversation={handleOpenConversationFromNotification}
        />

        <ToastContainer />
      </div>
    );
  }

  return (
    <div
      className={`bg-slate-50/70 text-slate-900 flex flex-col font-sans antialiased ${
        currentTab === 'whatsapp' ? 'h-screen max-h-screen overflow-hidden' : 'min-h-screen'
      }`}
    >
      <div className={`flex-1 flex min-w-0 ${currentTab === 'whatsapp' ? 'h-full overflow-hidden' : ''}`}>
        {/* Sidebar Navigation */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={handleNavigateTab}
          pendingReceitaSaudeCount={pendingReceitaSaudeCount}
          overdueReceivablesCount={overdueReceivablesCount}
          overdueExpensesCount={overdueExpensesCount}
          whatsappUnreadCount={whatsappUnreadCount}
          isOpenMobile={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          onLogout={handleLogout}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={setIsSidebarCollapsed}
          userRole={currentSession?.user?.role}
          userIsPrimary={currentSession?.user?.isPrimary}
          userPermissions={currentSession?.user?.permissions}
        />

        {/* Main Content Area */}
        <div
          className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
            currentTab === 'whatsapp' ? 'h-full min-h-0 overflow-hidden' : ''
          } ${
            isSidebarCollapsed ? 'lg:pl-[112px]' : 'lg:pl-[280px]'
          }`}
        >
          {/* Top Bar Container (Modo Consultoria / Suporte + Header) */}
          <div className="sticky top-0 z-30 flex flex-col shrink-0">
            {isPrimaryAccount && (
              <ConsultingBar
                activeClinicName={activeClinicDisplayName}
                activeProfessionalName={professional.name}
                availableClinics={availableClinics}
                currentTenantId={
                  currentSession?.supportSession?.targetTenantId ||
                  currentSession?.tenantId ||
                  ''
                }
                isSupportActive={Boolean(currentSession?.supportSession)}
                isSwitching={isSwitchingClinic}
                onSelectClinic={handleSelectClinic}
                onReturnToPrimary={handleReturnToPrimary}
              />
            )}

            {/* Non-Primary Support Banner */}
            {!isPrimaryAccount && currentSession?.supportSession && (
              <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs relative z-40">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-slate-950 shrink-0" />
                  <span>
                    <strong>MODO SUPORTE ATIVO:</strong> Visualizando{' '}
                    <u>{currentSession.supportSession.targetTenantName || organization.name}</u>
                  </span>
                </div>
                <button
                  onClick={() => {
                    db.endSupportSession();
                    toast.info('Sessão de suporte encerrada com sucesso.');
                  }}
                  className="px-3 py-1 bg-slate-950 text-white rounded-lg hover:bg-slate-900 transition-colors cursor-pointer text-xs font-bold shrink-0 ml-4 shadow-xs"
                >
                  Sair do modo suporte
                </button>
              </div>
            )}

            {/* Top Header */}
            <Header
              organization={organization}
              professional={professional}
              clinicDisplayName={activeClinicDisplayName}
              tenantId={activeTenantId}
              currentUserId={currentSession?.user?.id}
              onOpenConversation={handleOpenConversationFromNotification}
              onOpenMobileMenu={() => setMobileMenuOpen(true)}
              onOpenNewSale={() => setIsNewSaleOpen(true)}
              onOpenNewExpense={() => setIsNewExpenseOpen(true)}
              pendingReceitaSaudeCount={pendingReceitaSaudeCount}
              onNavigateToTab={handleNavigateTab}
              onQuickToggleFatorR={handleQuickToggleFatorR}
              isDemo={isDemoMode}
              onLogout={handleLogout}
              onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
            />
          </div>

        {isSwitchingClinic ? (
          <div className="flex-1 p-6 sm:p-10 max-w-7xl w-full mx-auto flex flex-col items-center justify-center min-h-[450px]">
            <AppLoadingSkeleton />
          </div>
        ) : (
          <>
            {/* Global Period Filter Bar */}
            {currentTab !== 'whatsapp' && (
              <PeriodFilterBar
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                onChangePeriod={handleChangePeriod}
                periodSalesValue={periodSalesValue}
                periodSalesCount={filteredSales.length}
                periodExpensesValue={periodExpensesValue}
                periodExpensesCount={filteredExpenses.length}
                periodReceivablesValue={periodReceivablesValue}
              />
            )}

            {/* View Switcher */}
            <main
              className={`flex-1 min-h-0 ${
                currentTab === 'whatsapp'
                  ? 'p-2 sm:p-3 max-w-[1600px] w-full mx-auto flex flex-col overflow-hidden h-full'
                  : 'p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto'
              }`}
            >
          {!canAccessTab(
            currentSession?.user?.role || 'OWNER',
            currentTab,
            currentSession?.user?.permissions,
            currentSession?.user?.isPrimary
          ) ? (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center max-w-lg mx-auto my-12 shadow-xs">
              <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-800 mb-1">Acesso Restrito</h3>
              <p className="text-sm text-slate-500 mb-6">
                Seu perfil de usuário não possui autorização para acessar esta funcionalidade.
              </p>
              <button
                type="button"
                onClick={() => {
                  const candidateTabs: NavTab[] = [
                    'dashboard',
                    'whatsapp',
                    'agenda',
                    'patients',
                    'sales',
                    'financial',
                    'settings',
                    'reports',
                    'expenses',
                    'procedures',
                    'supplies',
                  ];
                  const allowed = candidateTabs.find((t) =>
                    canAccessTab(
                      currentSession?.user?.role || 'OWNER',
                      t,
                      currentSession?.user?.permissions,
                      currentSession?.user?.isPrimary
                    )
                  );
                  if (allowed) setCurrentTab(allowed);
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer inline-flex items-center gap-2 shadow-xs"
              >
                Voltar para área permitida
              </button>
            </div>
          ) : (
            <>
          {currentTab === 'whatsapp' && (
            <WhatsAppMainView
              tenantId={activeTenantId}
              currentUserId={currentSession?.user?.id}
              currentUserName={currentSession?.user?.name}
              currentUserRole={currentSession?.user?.role}
              initialPatientId={initialWhatsAppPatientId}
              initialConversationId={initialWhatsAppConversationId}
              initialContactId={initialWhatsAppContactId}
              onConsumedInitialConversation={() => {
                setInitialWhatsAppConversationId(undefined);
                setInitialWhatsAppContactId(undefined);
                setInitialWhatsAppPatientId(undefined);
              }}
              onNavigateToAgenda={(date, patientId) => {
                if (date) setInitialAgendaDate(date);
                if (patientId) setInitialAgendaPatientId(patientId);
                setCurrentTab('agenda');
              }}
              onNavigateToPatient={(patientId) => {
                setSelectedPatientForViewId(patientId);
                setCurrentTab('patients');
              }}
            />
          )}

          {currentTab === 'dashboard' && (
            <DashboardView
              sales={sales}
              expenses={expenses}
              professional={professional}
              payrollHistory={payrollHistory}
              taxRulesPf={taxRulesPf}
              taxRulesSimples={taxRulesSimples}
              categories={categories}
              onNavigateTab={handleNavigateTab}
              onOpenNewSale={() => setIsNewSaleOpen(true)}
              onOpenNewExpense={() => setIsNewExpenseOpen(true)}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onChangePeriod={handleChangePeriod}
            />
          )}

          {currentTab === 'sales' && (
            <SalesView
              sales={filteredSales}
              maskCpf={maskCpf}
              onOpenNewSale={() => setIsNewSaleOpen(true)}
              onOpenSettleModal={(item) => setSettleItem(item)}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onResetPeriod={handleResetPeriod}
            />
          )}

          {currentTab === 'procedures' && (
            <ProceduresView
              procedures={procedures}
              initialOpenNewModal={pendingAction === 'new_procedure'}
              onClearAction={() => setPendingAction(null)}
            />
          )}

          {currentTab === 'supplies' && (
            <SuppliesView
              initialOpenNewModal={pendingAction === 'new_supply'}
              onClearAction={() => setPendingAction(null)}
            />
          )}

          {currentTab === 'receivables' && (
            <ReceivablesView
              items={filteredReceivables}
              onOpenSettleModal={(item) => setSettleItem(item)}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onResetPeriod={handleResetPeriod}
            />
          )}

          {currentTab === 'expenses' && (
            <ExpensesView
              expenses={filteredExpenses}
              categories={categories}
              onOpenNewExpense={() => {
                setNewExpenseInitialType('UNICA');
                setIsNewExpenseOpen(true);
              }}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onResetPeriod={handleResetPeriod}
            />
          )}

          {currentTab === 'recurrent_expenses' && (
            <ExpensesView
              expenses={filteredExpenses}
              categories={categories}
              onOpenNewExpense={() => {
                setNewExpenseInitialType('RECORRENTE');
                setIsNewExpenseOpen(true);
              }}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onResetPeriod={handleResetPeriod}
              initialFilter="RECORRENTE"
              viewMode="recurrent"
            />
          )}

          {currentTab === 'financial' && (
            <FinancialDashboard
              selectedYear={selectedYear}
              onSelectYear={(y) => handleChangePeriod(y, selectedMonth)}
            />
          )}

          {currentTab === 'bank_accounts' && (
            <BankAccountsView
              bankAccounts={bankAccounts}
              onRefreshData={() => setTick((t) => t + 1)}
            />
          )}

          {currentTab === 'patients' && (
            <PatientsView
              patients={patients}
              sales={filteredSales}
              maskCpf={maskCpf}
              onOpenNewSaleForPatient={handleOpenNewSaleForPatient}
              onNavigateToWhatsApp={(patientId) => {
                setInitialWhatsAppPatientId(patientId);
                setCurrentTab('whatsapp');
              }}
              initialOpenNewModal={pendingAction === 'new_patient'}
              onClearAction={() => setPendingAction(null)}
              initialSelectedPatientId={selectedPatientForViewId}
            />
          )}

          {currentTab === 'agenda' && (
            <AppointmentsView
              initialDate={initialAgendaDate}
              initialPatientId={initialAgendaPatientId}
              activeTenantId={activeTenantId}
              onLaunchSale={(appointment) => {
                handleOpenNewSaleForPatient(appointment.patientId);
              }}
              onNavigateToWhatsApp={(patientId) => {
                setInitialWhatsAppPatientId(patientId);
                setCurrentTab('whatsapp');
              }}
            />
          )}

          {currentTab === 'chart_of_accounts' && (
            <ChartOfAccountsView categories={categories} />
          )}

          {currentTab === 'taxes' && (
            <TaxesView
              sales={sales}
              expenses={expenses}
              professional={professional}
              payrollHistory={payrollHistory}
              taxRulesPf={taxRulesPf}
              taxRulesSimples={taxRulesSimples}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onChangePeriod={handleChangePeriod}
              onNavigateTab={handleNavigateTab}
              initialOpenBasesModal={pendingAction === 'configure_fiscal'}
              onClearAction={() => setPendingAction(null)}
            />
          )}

          {currentTab === 'fiscal_simulator' && (
            <FiscalSimulatorView
              professional={professional}
              payrollHistory={payrollHistory}
              sales={sales}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onNavigateTab={handleNavigateTab}
            />
          )}

          {currentTab === 'reports' && (
            <ReportsView
              sales={sales}
              expenses={expenses}
              professional={professional}
              payrollHistory={payrollHistory}
              taxRulesPf={taxRulesPf}
              taxRulesSimples={taxRulesSimples}
              categories={categories}
              patients={patients}
              maskCpf={maskCpf}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onChangePeriod={handleChangePeriod}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              professional={professional}
              organization={organization}
              bankAccounts={bankAccounts}
              payrollHistory={payrollHistory}
              auditLogs={auditLogs}
              maskCpf={maskCpf}
              onRefreshData={() => setTick((t) => t + 1)}
              onNavigateTab={handleNavigateTab}
            />
          )}
            </>
          )}
        </main>
          </>
        )}
      </div>
      </div>

      {/* Global Modals */}
      <NewSaleModal
        isOpen={isNewSaleOpen}
        onClose={() => {
          setIsNewSaleOpen(false);
          setNewSalePatientId(undefined);
        }}
        patients={patients}
        initialPatientId={newSalePatientId}
        onSaleCreated={() => {
          setTick((t) => t + 1);
        }}
      />

      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => {
          setIsNewExpenseOpen(false);
          setNewExpenseInitialType(undefined);
        }}
        categories={categories}
        bankAccounts={bankAccounts}
        initialExpenseType={newExpenseInitialType}
        onExpenseCreated={() => {
          setTick((t) => t + 1);
        }}
      />

      <SettlePaymentModal
        isOpen={!!settleItem}
        onClose={() => setSettleItem(null)}
        item={settleItem}
        bankAccounts={bankAccounts}
      />

      {/* Global Patient Search Modal (Ctrl+K / Cmd+K) */}
      <GlobalPatientSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        patients={patients}
        sales={sales}
        onSelectPatient={handleSelectPatientFromSearch}
        clinicDisplayName={activeClinicDisplayName}
      />

      {/* Global WhatsApp Realtime Notification Hub */}
      <GlobalNotificationHub
        tenantId={activeTenantId}
        userId={currentSession?.user?.id}
        onOpenConversation={handleOpenConversationFromNotification}
      />

      {/* Global Toaster Mount */}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
