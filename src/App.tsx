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

import { NewSaleModal } from './components/Modals/NewSaleModal';
import { NewExpenseModal } from './components/Modals/NewExpenseModal';
import { SettlePaymentModal } from './components/Modals/SettlePaymentModal';
import { AccountReceivableItem } from './types';

export default function App() {
  // Database state sync
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => unsubscribe();
  }, []);

  // UI state
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [maskCpf, setMaskCpf] = useState(true); // LGPD default: masked

  // Global Period Filter State
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>(5); // Default Maio/2025 where dataset is populated

  const handleChangePeriod = (year: number, month: number | 'ALL') => {
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const handleResetPeriod = () => {
    setSelectedYear(2025);
    setSelectedMonth('ALL');
  };

  // Modals state
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(false);
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

  // Filtered receivables based on global period
  const filteredReceivables = useMemo(() => {
    return receivablesList.filter((item) => {
      return (
        (item.dueDate && item.dueDate.startsWith(periodPrefix)) ||
        (item.competenceDate && item.competenceDate.startsWith(periodPrefix))
      );
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
  };

  const handleOpenNewSaleForPatient = (patientId: string) => {
    setIsNewSaleOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex font-sans antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        pendingReceitaSaudeCount={pendingReceitaSaudeCount}
        overdueReceivablesCount={overdueReceivablesCount}
        overdueExpensesCount={overdueExpensesCount}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
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
          maskCpf={maskCpf}
          onToggleMaskCpf={() => setMaskCpf(!maskCpf)}
          pendingReceitaSaudeCount={pendingReceitaSaudeCount}
          onNavigateToTab={setCurrentTab}
          onQuickToggleFatorR={handleQuickToggleFatorR}
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
              onNavigateTab={setCurrentTab}
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
            <ProceduresView procedures={procedures} />
          )}

          {currentTab === 'supplies' && (
            <SuppliesView />
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
              onOpenNewExpense={() => setIsNewExpenseOpen(true)}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              onResetPeriod={handleResetPeriod}
            />
          )}

          {currentTab === 'financial' && (
            <FinancialDashboard
              selectedYear={selectedYear}
              onSelectYear={(y) => handleChangePeriod(y, selectedMonth)}
            />
          )}

          {currentTab === 'patients' && (
            <PatientsView
              patients={patients}
              sales={filteredSales}
              maskCpf={maskCpf}
              onOpenNewSaleForPatient={handleOpenNewSaleForPatient}
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
            />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <NewSaleModal
        isOpen={isNewSaleOpen}
        onClose={() => setIsNewSaleOpen(false)}
        patients={patients}
      />

      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => setIsNewExpenseOpen(false)}
        categories={categories}
        bankAccounts={bankAccounts}
      />

      <SettlePaymentModal
        isOpen={!!settleItem}
        onClose={() => setSettleItem(null)}
        item={settleItem}
        bankAccounts={bankAccounts}
      />
    </div>
  );
}
