import React, { useState, useEffect, useMemo } from 'react';
import { db } from './lib/db';
import { Sidebar, NavTab } from './components/Layout/Sidebar';
import { Header } from './components/Layout/Header';
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
import { SupabaseService } from './lib/supabaseClient';
import { ToastProvider, useToast } from './components/UI/ToastContext';
import { ToastContainer } from './components/UI/Toast';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

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
            setAvailableClinics(filtered);
          }
        })
        .catch((err) => {
          console.warn('Erro ao listar clínicas para suporte:', err);
        });
    }
  }, [isPrimaryAccount, tick]);

  const handleSelectClinic = async (targetTenantId: string) => {
    if (!targetTenantId) return;
    if (currentSession?.tenantId === targetTenantId && !currentSession?.supportSession) return;
    if (currentSession?.supportSession?.targetTenantId === targetTenantId) return;

    setIsSwitchingClinic(true);
    try {
      const selected = availableClinics.find((c) => c.tenant_id === targetTenantId);
      const res = await db.startSupportSessionAsync(
        targetTenantId,
        selected?.clinic_name,
        'Acesso gerencial e suporte contábil/consultoria'
      );
      if (res.success) {
        toast.success(`Acessando clínica: ${selected?.clinic_name || targetTenantId}`);
      } else {
        toast.error(res.error || 'Não foi possível alternar de clínica.');
      }
    } catch (err: any) {
      toast.error('Erro ao alternar de clínica.');
    } finally {
      setIsSwitchingClinic(false);
    }
  };

  const handleReturnToPrimary = () => {
    db.endSupportSession();
    toast.info('Retornado para sua conta primária.');
  };

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [newExpenseInitialType, setNewExpenseInitialType] = useState<
    'UNICA' | 'PARCELADA' | 'RECORRENTE' | undefined
  >(undefined);

  const handleNavigateTab = (tab: NavTab, action?: string) => {
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

  // Global Period Filter State - Dynamic real environment date
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>(() => new Date().getMonth() + 1);

  const handleChangePeriod = (year: number, month: number | 'ALL') => {
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const handleResetPeriod = () => {
    const now = new Date();
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
  };

  // Modals state
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(false);
  const [newSalePatientId, setNewSalePatientId] = useState<string | undefined>(undefined);
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  const [settleItem, setSettleItem] = useState<AccountReceivableItem | null>(null);

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

  const overdueReceivablesCount = receivablesList.filter((r) => r.status === 'VENCIDO').length;
  const overdueExpensesCount = expenses.filter(
    (e) => e.status === 'A_PAGAR' && e.dueDate < new Date().toISOString().split('T')[0]
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

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans antialiased">
      <div className="flex-1 flex min-w-0">
        {/* Sidebar Navigation */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={handleNavigateTab}
          pendingReceitaSaudeCount={pendingReceitaSaudeCount}
          overdueReceivablesCount={overdueReceivablesCount}
          overdueExpensesCount={overdueExpensesCount}
          isOpenMobile={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          onLogout={handleLogout}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={setIsSidebarCollapsed}
        />

        {/* Main Content Area */}
        <div
          className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
            isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-68'
          }`}
        >
          {/* Primary Account Consulting Switcher Bar (sem corte de layout e sem exibição de email) */}
          {isPrimaryAccount && (
            <div
              className={`px-4 py-2.5 text-xs font-semibold flex flex-wrap items-center justify-between gap-3 shadow-xs sticky top-0 z-40 transition-colors ${
                currentSession?.supportSession
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-900 text-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {currentSession?.supportSession ? (
                  <ShieldAlert className="w-4 h-4 text-slate-950 shrink-0" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <div className="flex items-center gap-2 truncate">
                  {currentSession?.supportSession ? (
                    <span>
                      <strong className="uppercase font-bold tracking-wide">Modo Consultoria Ativo:</strong>{' '}
                      Gerenciando <u>{currentSession.supportSession.targetTenantName || organization.name}</u>
                    </span>
                  ) : (
                    <span>
                      <strong className="uppercase font-bold tracking-wide text-emerald-400">
                        Consultoria & Acesso Contábil
                      </strong>
                      <span className="mx-2 opacity-50">•</span>
                      <span className="opacity-90">Clínica Ativa:</span>{' '}
                      <strong className="text-white font-bold">{organization.name}</strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto shrink-0">
                <label className="text-[11px] opacity-90 hidden sm:inline">
                  Alternar Clínica:
                </label>
                <select
                  value={
                    currentSession?.supportSession?.targetTenantId ||
                    currentSession?.tenantId ||
                    ''
                  }
                  onChange={(e) => handleSelectClinic(e.target.value)}
                  disabled={isSwitchingClinic}
                  className={`text-xs rounded-lg px-3 py-1.5 font-semibold cursor-pointer border shadow-xs focus:outline-none transition-all ${
                    currentSession?.supportSession
                      ? 'bg-white text-slate-900 border-amber-600 focus:ring-2 focus:ring-amber-800'
                      : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-750 focus:ring-2 focus:ring-emerald-500'
                  }`}
                >
                  <option value="" disabled>
                    Selecione uma clínica...
                  </option>
                  {availableClinics.map((c) => {
                    const subtitle =
                      c.owner_name || c.owner_email
                        ? ` — ${c.owner_name || c.owner_email}`
                        : '';
                    return (
                      <option key={c.tenant_id} value={c.tenant_id}>
                        {c.clinic_name}
                        {subtitle}
                      </option>
                    );
                  })}
                </select>

                {currentSession?.supportSession && (
                  <button
                    onClick={handleReturnToPrimary}
                    disabled={isSwitchingClinic}
                    className="px-3 py-1.5 bg-slate-950 text-white rounded-lg hover:bg-slate-900 transition-colors cursor-pointer text-xs font-bold shrink-0 shadow-xs"
                  >
                    Voltar à Minha Conta
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Non-Primary Support Banner */}
          {!isPrimaryAccount && currentSession?.supportSession && (
            <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs sticky top-0 z-40">
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
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenNewSale={() => setIsNewSaleOpen(true)}
            onOpenNewExpense={() => setIsNewExpenseOpen(true)}
            pendingReceitaSaudeCount={pendingReceitaSaudeCount}
            onNavigateToTab={handleNavigateTab}
            onQuickToggleFatorR={handleQuickToggleFatorR}
            isDemo={isDemoMode}
            onLogout={handleLogout}
          />

        {/* Global Period Filter Bar - Always active across all tabs */}
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

        {/* View Switcher */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
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
              initialOpenNewModal={pendingAction === 'new_patient'}
              onClearAction={() => setPendingAction(null)}
            />
          )}

          {currentTab === 'agenda' && (
            <AppointmentsView
              onLaunchSale={(appointment) => {
                handleOpenNewSaleForPatient(appointment.patientId);
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
        </main>
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
