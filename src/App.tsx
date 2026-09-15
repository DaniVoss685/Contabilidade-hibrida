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
import { AccountReceivableItem } from './types';
import { ToastProvider, useToast } from './components/UI/ToastContext';
import { ToastContainer } from './components/UI/Toast';
import { ShieldAlert } from 'lucide-react';

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

  useEffect(() => {
    setIsAuthenticated(!!db.getCurrentSession());
  }, [tick]);

  const handleLogout = () => {
    db.logout();
    setIsAuthenticated(false);
    toast.info('Sessão encerrada com sucesso.');
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

  // Filtered sales based on global period
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (sale.serviceDate && sale.serviceDate.startsWith(periodPrefix)) {
        return true;
      }
      const hasInstInPeriod = sale.installments?.some(
        (i) =>
          (i.paymentDate && i.paymentDate.startsWith(periodPrefix)) ||
          (i.dueDate && i.dueDate.startsWith(periodPrefix))
      );
      return hasInstInPeriod;
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50">
        <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />
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
      {/* Platform Admin Audited Support Session Banner */}
      {currentSession?.supportSession && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-xs sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-slate-950 shrink-0" />
            <span>
              <strong>MODO SUPORTE ATIVO:</strong> Você está acessando a clínica <u>{currentSession.supportSession.targetTenantName || organization.name}</u> como suporte ({currentSession.supportSession.originalAdminName}). Motivo: "{currentSession.supportSession.reason}". Todas as ações são auditadas.
            </span>
          </div>
          <button
            onClick={() => {
              db.endSupportSession();
              toast.info('Sessão de suporte encerrada com sucesso.');
            }}
            className="px-3 py-1 bg-slate-950 text-white rounded-lg hover:bg-slate-900 transition-colors cursor-pointer text-xs font-bold shrink-0 ml-4"
          >
            Sair do modo suporte
          </button>
        </div>
      )}

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
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
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
