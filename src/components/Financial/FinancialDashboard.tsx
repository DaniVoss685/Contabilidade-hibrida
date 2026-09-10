import React, { useState, useEffect, useMemo } from 'react';
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  Filter,
  DollarSign,
  Scale,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { DentalFinanceDB } from '../../lib/db';
import {
  FinancialEntityFilter,
  FinancialSubTab,
  CashFlowDisplayMode,
} from '../../types/financial';
import {
  buildAnnualCashFlow,
  buildAnnualDre,
  buildCategoryAnnualControl,
} from '../../lib/financialEngine';
import {
  exportCashFlowToCsv,
  exportDreToCsv,
  exportCategoriesControlToCsv,
} from '../../lib/financialExport';
import { CashFlowTable } from './CashFlowTable';
import { DreTable } from './DreTable';
import { CategoryControlTable } from './CategoryControlTable';
import { ComparisonView } from './ComparisonView';

interface FinancialDashboardProps {
  selectedYear?: number;
  onSelectYear?: (year: number) => void;
}

export const FinancialDashboard: React.FC<FinancialDashboardProps> = ({
  selectedYear: initialYear = 2025,
  onSelectYear,
}) => {
  const db = DentalFinanceDB.getInstance();
  const [, setTick] = useState(0);

  useEffect(() => {
    return db.subscribe(() => setTick((t) => t + 1));
  }, [db]);

  // Filters state
  const [year, setYear] = useState<number>(initialYear);
  const [entityFilter, setEntityFilter] = useState<FinancialEntityFilter>('ALL');
  const [activeTab, setActiveTab] = useState<FinancialSubTab>('CASH_FLOW');
  const [cashFlowDisplayMode, setCashFlowDisplayMode] = useState<CashFlowDisplayMode>('ALL');

  // Keep year in sync if prop changes
  useEffect(() => {
    if (initialYear && initialYear !== year) {
      setYear(initialYear);
    }
  }, [initialYear]);

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    if (onSelectYear) {
      onSelectYear(newYear);
    }
  };

  // Raw database tables
  const sales = db.getSales();
  const expenses = db.getExpenses();
  const bankAccounts = db.getBankAccounts();
  const categories = db.getCategories();
  const professional = db.getProfessional();
  const payrollHistory = db.getPayrollHistory();
  const taxRulesPf = db.getTaxRulesPf(year);
  const taxRulesSimples = db.getTaxRulesSimples(year);

  // Computed Summaries
  const cashFlowSummary = useMemo(() => {
    return buildAnnualCashFlow(year, sales, expenses, bankAccounts, entityFilter);
  }, [year, sales, expenses, bankAccounts, entityFilter]);

  const dreSummary = useMemo(() => {
    return buildAnnualDre(
      year,
      sales,
      expenses,
      taxRulesPf,
      taxRulesSimples,
      professional,
      payrollHistory,
      entityFilter
    );
  }, [year, sales, expenses, taxRulesPf, taxRulesSimples, professional, payrollHistory, entityFilter]);

  const categoryControlItems = useMemo(() => {
    return buildCategoryAnnualControl(year, sales, expenses, categories, entityFilter);
  }, [year, sales, expenses, categories, entityFilter]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  // Export handlers
  const handleExport = () => {
    if (activeTab === 'CASH_FLOW') {
      exportCashFlowToCsv(cashFlowSummary, year);
    } else if (activeTab === 'DRE') {
      exportDreToCsv(dreSummary, year);
    } else if (activeTab === 'CATEGORIES_CONTROL') {
      exportCategoriesControlToCsv(categoryControlItems, year);
    } else {
      exportCashFlowToCsv(cashFlowSummary, year);
      exportDreToCsv(dreSummary, year);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Gestão Financeira Anual & Fluxo de Caixa
              </h2>
              <p className="text-xs text-slate-500">
                Visão mês a mês lado a lado de Fluxo de Caixa (Realizado e Previsto), DRE por Competência e Controle por Categoria do Plano de Contas
              </p>
            </div>
          </div>
        </div>

        {/* Global Selectors */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Year selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <Calendar className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            {[2024, 2025, 2026].map((y) => (
              <button
                key={y}
                onClick={() => handleYearChange(y)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  year === y
                    ? 'bg-white text-teal-800 shadow-sm font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Entity Filter (PF, PJ, ALL) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setEntityFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                entityFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consolidado (PF + PJ)
            </button>
            <button
              onClick={() => setEntityFilter('CNPJ')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                entityFilter === 'CNPJ'
                  ? 'bg-white text-teal-800 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Clínica (CNPJ)
            </button>
            <button
              onClick={() => setEntityFilter('CPF')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                entityFilter === 'CPF'
                  ? 'bg-white text-indigo-800 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consultório (CPF)
            </button>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        {/* 1. Receita Bruta DRE */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
            Receita Bruta DRE (Ano {year})
          </span>
          <div className="text-lg font-black text-slate-900 mt-1">
            {formatCurrency(dreSummary.totalGrossRevenue)}
          </div>
          <span className="text-[10px] text-indigo-700 font-medium">
            Regime de Competência
          </span>
        </div>

        {/* 2. Entradas de Caixa */}
        <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
          <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider block">
            Entradas de Caixa (Ano {year})
          </span>
          <div className="text-lg font-black text-emerald-900 mt-1">
            {formatCurrency(cashFlowSummary.totalInflow)}
          </div>
          <span className="text-[10px] text-emerald-700">
            {formatCurrency(cashFlowSummary.totalRealizedInflow)} recebidos
          </span>
        </div>

        {/* 3. Despesas & Custos DRE */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
            Custos & Despesas DRE
          </span>
          <div className="text-lg font-black text-slate-900 mt-1">
            {formatCurrency(dreSummary.totalVariableCosts + dreSummary.totalFixedExpenses)}
          </div>
          <span className="text-[10px] text-slate-500">
            CPV: {formatCurrency(dreSummary.totalVariableCosts)}
          </span>
        </div>

        {/* 4. Saídas Totais de Caixa */}
        <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/20 shadow-sm">
          <span className="text-[10px] font-semibold text-rose-800 uppercase tracking-wider block">
            Saídas Totais de Caixa
          </span>
          <div className="text-lg font-black text-rose-900 mt-1">
            {formatCurrency(cashFlowSummary.totalOutflow)}
          </div>
          <span className="text-[10px] text-rose-700">
            {formatCurrency(cashFlowSummary.totalRealizedOutflow)} pagas
          </span>
        </div>

        {/* 5. Lucro Líquido DRE */}
        <div className="bg-white p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-sm">
          <span className="text-[10px] font-semibold text-indigo-800 uppercase tracking-wider block">
            Lucro Líquido DRE
          </span>
          <div className="text-lg font-black text-indigo-950 mt-1">
            {formatCurrency(dreSummary.totalNetResult)}
          </div>
          <span className="text-[10px] font-bold text-indigo-700">
            Margem Líquida {dreSummary.averageNetMarginPercent.toFixed(1)}%
          </span>
        </div>

        {/* 6. Saldo Final Caixa */}
        <div className="bg-white p-3.5 rounded-xl border border-teal-200 bg-teal-50/20 shadow-sm">
          <span className="text-[10px] font-semibold text-teal-800 uppercase tracking-wider block">
            Saldo Final de Caixa
          </span>
          <div className="text-lg font-black text-teal-900 mt-1">
            {formatCurrency(cashFlowSummary.finalBalanceYear)}
          </div>
          <span className="text-[10px] text-teal-700">
            Geração Líquida: {formatCurrency(cashFlowSummary.netTotalCashFlow)}
          </span>
        </div>
      </div>

      {/* Navigation Sub-tabs */}
      <div className="flex border-b border-slate-200 gap-1 bg-white p-1 rounded-xl shadow-sm">
        <button
          onClick={() => setActiveTab('CASH_FLOW')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'CASH_FLOW'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>1. Fluxo de Caixa Mensal (Ano {year})</span>
        </button>

        <button
          onClick={() => setActiveTab('DRE')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'DRE'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>2. DRE Gerencial Anual (Competência)</span>
        </button>

        <button
          onClick={() => setActiveTab('CATEGORIES_CONTROL')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'CATEGORIES_CONTROL'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>3. Controle por Categoria do Plano de Contas</span>
        </button>

        <button
          onClick={() => setActiveTab('COMPARISON')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'COMPARISON'
              ? 'bg-teal-700 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>4. Comparativo Caixa x Competência</span>
        </button>
      </div>

      {/* Tab Content Display */}
      {activeTab === 'CASH_FLOW' && (
        <CashFlowTable
          data={cashFlowSummary}
          displayMode={cashFlowDisplayMode}
          onDisplayModeChange={setCashFlowDisplayMode}
        />
      )}

      {activeTab === 'DRE' && <DreTable data={dreSummary} />}

      {activeTab === 'CATEGORIES_CONTROL' && (
        <CategoryControlTable categoriesData={categoryControlItems} year={year} />
      )}

      {activeTab === 'COMPARISON' && (
        <ComparisonView cashFlow={cashFlowSummary} dre={dreSummary} year={year} />
      )}
    </div>
  );
};
