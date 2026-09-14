import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  AlertTriangle,
  FileCheck,
  Building,
  User,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from 'lucide-react';
import {
  Sale,
  Expense,
  Professional,
  PayrollHistoryEntry,
  TaxRulesPf,
  TaxRulesSimples,
  ExpenseCategory,
} from '../../types';
import {
  calculateCpfMonthlyTax,
  calculateSimplesNacionalMonthlyTax,
  getMonthlyReceivablesSummary,
  getMonthlyExpensesSummary,
} from '../../lib/taxEngine';
import { formatCurrency, formatPercent } from '../../lib/masks';
import { db } from '../../lib/db';
import { FirstStepsChecklist } from './FirstStepsChecklist';

interface DashboardViewProps {
  sales: Sale[];
  expenses: Expense[];
  professional: Professional;
  payrollHistory: PayrollHistoryEntry[];
  taxRulesPf: TaxRulesPf;
  taxRulesSimples: TaxRulesSimples;
  categories: ExpenseCategory[];
  onNavigateTab: (tab: any) => void;
  onOpenNewSale: () => void;
  onOpenNewExpense: () => void;
  selectedYear?: number;
  selectedMonth?: number | 'ALL';
  onChangePeriod?: (year: number, month: number | 'ALL') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  sales,
  expenses,
  professional,
  payrollHistory,
  taxRulesPf,
  taxRulesSimples,
  categories,
  onNavigateTab,
  onOpenNewSale,
  onOpenNewExpense,
  selectedYear: propYear,
  selectedMonth: propMonth,
  onChangePeriod,
}) => {
  // Competence Selector synced with global period if provided
  const [internalYear, setInternalYear] = useState<number>(propYear || new Date().getFullYear());
  const [internalMonth, setInternalMonth] = useState<number | 'ALL'>(
    propMonth !== undefined ? propMonth : (new Date().getMonth() + 1)
  );
  const [viewMode, setViewMode] = useState<'REALIZADO' | 'PROJETADO'>('REALIZADO');

  const effectiveYear = propYear !== undefined ? propYear : internalYear;
  const effectiveMonth = propMonth !== undefined ? propMonth : internalMonth;

  const handleMonthChange = (val: number | 'ALL') => {
    setInternalMonth(val);
    if (onChangePeriod) {
      onChangePeriod(effectiveYear, val);
    }
  };

  const handleYearChange = (val: number) => {
    setInternalYear(val);
    if (onChangePeriod) {
      onChangePeriod(val, effectiveMonth);
    }
  };

  // Month competence string
  const competenceStr =
    effectiveMonth === 'ALL'
      ? `${effectiveYear}`
      : `${effectiveYear}-${String(effectiveMonth).padStart(2, '0')}`;

  // Calculate CPF Tax
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

  // Baseline configuration state
  const isBaselineConfigured = Boolean(professional.baselineConfigured);
  const patientsCount = useMemo(() => db.getPatients().length, [sales]);
  const appointmentsCount = useMemo(() => db.getAppointments().length, [sales]);

  // Calculate CNPJ Simples Nacional Tax
  const cnpjTax = useMemo(() => {
    return calculateSimplesNacionalMonthlyTax(
      sales,
      competenceStr,
      effectiveYear,
      taxRulesSimples,
      payrollHistory,
      professional.rbt12Inicial || 0,
      professional.folha12MesesInicial || 0
    );
  }, [sales, competenceStr, effectiveYear, taxRulesSimples, payrollHistory, professional]);

  // Cash flow summaries
  const receivablesSummary = useMemo(() => {
    return getMonthlyReceivablesSummary(sales, competenceStr);
  }, [sales, competenceStr]);

  const expensesSummary = useMemo(() => {
    return getMonthlyExpensesSummary(expenses, competenceStr);
  }, [expenses, competenceStr]);

  // General Totals
  const totalRevenue =
    viewMode === 'REALIZADO'
      ? receivablesSummary.totalReceived
      : receivablesSummary.totalReceived + receivablesSummary.totalToReceive;

  const totalExpenses =
    viewMode === 'REALIZADO'
      ? expensesSummary.totalPaid
      : expensesSummary.totalPaid + expensesSummary.totalToPay;

  const operatingResult = totalRevenue - totalExpenses;
  const totalTaxesEstimated = cpfTax.carneLeaoEstimated + cnpjTax.dasEstimated;
  const netResultAfterTax = operatingResult - totalTaxesEstimated;

  // Month names in Portuguese
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const suppliesCount = db.getClinicalInputs().length;
  const proceduresCount = db.getProcedures().length;

  return (
    <div className="space-y-6 pb-12">
      {/* 0. FIRST STEPS CHECKLIST */}
      <FirstStepsChecklist
        professional={professional}
        patientsCount={patientsCount}
        suppliesCount={suppliesCount}
        proceduresCount={proceduresCount}
        salesCount={sales.length}
        expensesCount={expenses.length}
        onNavigateTab={onNavigateTab}
        onOpenNewSale={onOpenNewSale}
        onOpenNewExpense={onOpenNewExpense}
      />

      {/* 1. HERO EXECUTIVE SUMMARY CARD (Finexy & Prodex standard) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-xs">
        {/* Top Bar: Title & Realizado vs Projetado Switcher */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Resultado Consolidado da Operação
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
              Visão Geral Executiva
            </h2>
          </div>

          {/* Segmented Control: Realizado vs Projetado */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 text-xs font-semibold self-stretch sm:self-auto shadow-2xs">
            <button
              onClick={() => setViewMode('REALIZADO')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'REALIZADO'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Realizado (Caixa)
            </button>
            <button
              onClick={() => setViewMode('PROJETADO')}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'PROJETADO'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Projetado (+ A Vencer)
            </button>
          </div>
        </div>

        {/* Hero KPI Number Display */}
        <div className="py-6 flex flex-col md:flex-row md:items-baseline justify-between gap-4">
          <div>
            <span className="text-xs text-slate-400 font-medium block">
              Resultado Líquido do Período (após impostos estimados):
            </span>
            <div className="flex flex-wrap items-baseline gap-3 mt-1">
              <span
                className={`text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-mono tabular-nums ${
                  netResultAfterTax >= 0 ? 'text-slate-900' : 'text-rose-600'
                }`}
              >
                {formatCurrency(netResultAfterTax)}
              </span>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full border shadow-2xs flex items-center gap-1 ${
                  netResultAfterTax >= 0
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                    : 'bg-rose-50 text-rose-800 border-rose-200/80'
                }`}
              >
                {netResultAfterTax >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />
                )}
                Margem Líquida Real:{' '}
                {totalRevenue > 0
                  ? formatPercent((netResultAfterTax / totalRevenue) * 100)
                  : '0%'}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Segregação ativa: <strong className="text-slate-700">CPF (Carnê-Leão)</strong> +{' '}
            <strong className="text-slate-700">CNPJ (Simples Nacional)</strong>
          </div>
        </div>

        {/* 3-Column Supporting Metrics Strip with High-Contrast Distinctions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-slate-100">
          {/* Col 1: Receitas */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100/90 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Receitas {viewMode === 'REALIZADO' ? 'Efetivadas' : 'Totais'}
              </span>
              <span className="text-emerald-700 font-bold font-mono text-[11px] bg-white px-2 py-0.5 rounded-full border border-emerald-200/80 shadow-2xs">
                {receivablesSummary.countTotal ?? 0} {receivablesSummary.countTotal === 1 ? 'venda' : 'vendas'}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight tabular-nums">
              {formatCurrency(totalRevenue)}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-emerald-100/70">
              <span>
                CPF: <strong className="text-slate-800 font-mono">{formatCurrency(receivablesSummary.cpfReceived)}</strong>
              </span>
              <span className="text-emerald-300">•</span>
              <span>
                PJ: <strong className="text-slate-800 font-mono">{formatCurrency(receivablesSummary.cnpjReceived)}</strong>
              </span>
            </div>
          </div>

          {/* Col 2: Despesas */}
          <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-100/90 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-rose-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Despesas {viewMode === 'REALIZADO' ? 'Pagas' : 'Totais'}
              </span>
              <span className="text-rose-700 font-bold font-mono text-[11px] bg-white px-2 py-0.5 rounded-full border border-rose-200/80 shadow-2xs">
                {expensesSummary.totalCount} {expensesSummary.totalCount === 1 ? 'lançamento' : 'lançamentos'}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight tabular-nums">
              {formatCurrency(totalExpenses)}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-rose-100/70">
              <span>
                Dedutível PF: <strong className="text-slate-800 font-mono">{formatCurrency(expensesSummary.cpfDeductiblePaid)}</strong>
              </span>
              <span className="text-rose-300">•</span>
              <span>
                PJ: <strong className="text-slate-800 font-mono">{formatCurrency(expensesSummary.cnpjOperationalPaid)}</strong>
              </span>
            </div>
          </div>

          {/* Col 3: Tributos Estimados */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/90 flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                Provisão Tributária Estimada
              </span>
              <span className="text-indigo-700 font-bold font-mono text-[11px] bg-white px-2 py-0.5 rounded-full border border-indigo-200/80 shadow-2xs">
                2 Guias Fiscais
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight tabular-nums">
              {formatCurrency(totalTaxesEstimated)}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-indigo-100/70">
              <span>
                Carnê-Leão: <strong className="text-slate-800 font-mono">{formatCurrency(cpfTax.carneLeaoEstimated)}</strong>
              </span>
              <span className="text-indigo-300">•</span>
              <span>
                DAS PJ: <strong className="text-slate-800 font-mono">{formatCurrency(cnpjTax.dasEstimated)}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. DUAL TAX ANALYTICAL PANELS (CPF vs CNPJ - Progressive Reading) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL 1: PESSOA FÍSICA (CPF - Carnê-Leão) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200/70 flex items-center justify-center font-bold">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Operação Pessoa Física (CPF)</h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Livro-Caixa Digital • Carnê-Leão Oficial
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200/80 shadow-2xs">
                Receita Saúde
              </span>
            </div>

            {/* Primary Indicator: IRPF Estimado (Solid Teal Highlight) */}
            <div className="my-5 p-4.5 rounded-2xl bg-teal-600 text-white shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-teal-100 uppercase tracking-wider block">
                  IRPF Estimado a Recolher (Mês):
                </span>
                <span className="text-[11px] text-teal-100/80 font-medium mt-0.5 block">
                  DARF Cód. 0190 • Regime de Caixa Estrito
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-white font-mono tabular-nums tracking-tight">
                  {formatCurrency(cpfTax.carneLeaoEstimated)}
                </span>
                <span className="block text-[11px] text-teal-200 font-medium mt-0.5">
                  Alíquota Efetiva: {formatPercent(cpfTax.effectiveTaxRate)}
                </span>
              </div>
            </div>

            {/* Progressive Calculation Metrics Strip */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 text-slate-600">
                <span>Receitas Recebidas no Caixa:</span>
                <span className="font-bold text-slate-900 font-mono tabular-nums">
                  {formatCurrency(cpfTax.grossRevenueReceived)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 text-slate-600">
                <span>(-) Despesas Dedutíveis Homologadas:</span>
                <span className="font-bold text-rose-700 font-mono tabular-nums">
                  - {formatCurrency(cpfTax.deductibleExpensesLivroCaixa)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1 text-slate-600">
                <span>(-) Dedução Legal (Dependentes / INSS):</span>
                <span className="font-bold text-slate-700 font-mono tabular-nums">
                  - {formatCurrency(cpfTax.legalDeductionsTotal - cpfTax.deductibleExpensesLivroCaixa)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-t border-slate-100 font-bold text-slate-900">
                <span>(=) Base de Cálculo do IRPF:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatCurrency(cpfTax.taxBase)}
                </span>
              </div>
            </div>

            {/* Receita Saúde Compliance Indicator */}
            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <FileCheck className={`w-4 h-4 ${cpfTax.pendingReceitaSaudeCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
                <span className="text-slate-700 font-medium">Status Documental Receita Saúde:</span>
              </div>
              {cpfTax.pendingReceitaSaudeCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                  {cpfTax.pendingReceitaSaudeCount} Pendente{cpfTax.pendingReceitaSaudeCount > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                  100% Regular
                </span>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 mt-5 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              onClick={() => onNavigateTab('taxes')}
              className="font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 cursor-pointer"
            >
              Ver Memória de Cálculo IRPF <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigateTab('receivables')}
              className="font-medium text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              Acessar Recebíveis →
            </button>
          </div>
        </div>

        {/* PANEL 2: PESSOA JURÍDICA (CNPJ - Simples Nacional) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 border border-blue-200/70 flex items-center justify-center font-bold">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Operação Pessoa Jurídica (CNPJ)</h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Simples Nacional • NFS-e Municipal
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs ${
                  cnpjTax.effectiveAnnex === 'ANEXO_III'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                    : 'bg-amber-50 text-amber-800 border-amber-200/80'
                }`}
              >
                {cnpjTax.effectiveAnnex === 'ANEXO_III' ? 'Anexo III (6%~)' : 'Anexo V (15.5%~)'}
              </span>
            </div>

            {/* Primary Indicator: DAS Estimado (Solid Blue Highlight) */}
            <div className="my-5 p-4.5 rounded-2xl bg-blue-600 text-white shadow-sm flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-blue-100 uppercase tracking-wider block">
                  DAS Estimado do Mês (Simples):
                </span>
                <span className="text-[11px] text-blue-100/80 font-medium mt-0.5 block">
                  Guia Única DAS • Vencimento dia 20
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-white font-mono tabular-nums tracking-tight">
                  {formatCurrency(cnpjTax.dasEstimated)}
                </span>
                <span className="block text-[11px] text-blue-200 font-medium mt-0.5">
                  Alíquota Efetiva: {formatPercent(cnpjTax.effectiveTaxRate)}
                </span>
              </div>
            </div>

            {/* FATOR R VISUAL PROGRESS BAR GAUGE */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">Razão Fator R (FS12 ÷ RBT12):</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-slate-900 font-mono tabular-nums">
                    {isBaselineConfigured ? formatPercent(cnpjTax.fatorRPercent) : '0,0%'}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      !isBaselineConfigured
                        ? 'bg-slate-200 text-slate-700'
                        : cnpjTax.fatorR >= 0.28
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {!isBaselineConfigured
                      ? 'Bases Pendentes'
                      : cnpjTax.fatorR >= 0.28
                      ? 'Meta ≥ 28% Atingida'
                      : 'Abaixo de 28%'}
                  </span>
                </div>
              </div>

              {/* Progress track */}
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden relative">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    !isBaselineConfigured
                      ? 'bg-slate-300'
                      : cnpjTax.fatorR >= 0.28
                      ? 'bg-emerald-600'
                      : 'bg-amber-500'
                  }`}
                  style={{
                    width: isBaselineConfigured
                      ? `${Math.min(Math.max(cnpjTax.fatorR * 100, 0), 100)}%`
                      : '0%',
                  }}
                ></div>
              </div>

              <div className="flex justify-between text-[10.5px] text-slate-400 font-mono">
                <span>0%</span>
                <span className="text-slate-600 font-bold">Meta: 28.0% (Anexo III)</span>
                <span>50%+</span>
              </div>
            </div>

            {/* Progressive Calculation Metrics Strip */}
            <div className="space-y-2 text-xs mt-4">
              <div className="flex justify-between items-center text-slate-600">
                <span>Faturamento no Mês (NFS-e):</span>
                <span className="font-bold text-slate-900 font-mono tabular-nums">
                  {formatCurrency(cnpjTax.monthlyRevenueNfse)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>RBT12 (Receita Bruta 12 Meses):</span>
                <span className="font-bold text-slate-700 font-mono tabular-nums">
                  {formatCurrency(cnpjTax.rbt12)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>FS12 (Folha de Pagamento 12 Meses):</span>
                <span className="font-bold text-slate-700 font-mono tabular-nums">
                  {formatCurrency(cnpjTax.fs12)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 mt-5 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              onClick={() => onNavigateTab('taxes')}
              className="font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              Simular Otimização Fator R <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigateTab('sales')}
              className="font-medium text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              Ver NFS-e Emitidas →
            </button>
          </div>
        </div>
      </div>

      {/* CONSOLIDATED TAX COMPARISON BANNER (Finetech light card) */}
      <div className="bg-white p-6 rounded-3xl shadow-xs border border-slate-200/80">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-1 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
              <Layers className="w-3.5 h-3.5 text-emerald-600" />
              Consolidação Tributária Híbrida
            </div>
            <h4 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Carga Tributária Efetiva Global: {formatPercent(totalRevenue > 0 ? (totalTaxesEstimated / totalRevenue) * 100 : 0)}
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Consolidação analítica de estimativas apuradas separadamente para CPF e CNPJ de acordo com os lançamentos reais.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0 bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/80">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium">Carnê-Leão (PF)</span>
              <span className="text-sm font-bold text-emerald-800 font-mono">{formatCurrency(cpfTax.carneLeaoEstimated)}</span>
            </div>
            <div className="text-slate-300 text-base font-bold">+</div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium">DAS Simples (PJ)</span>
              <span className="text-sm font-bold text-blue-800 font-mono">{formatCurrency(cnpjTax.dasEstimated)}</span>
            </div>
            <div className="text-slate-300 text-base font-bold">=</div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total Estimado</span>
              <span className="text-base font-black text-slate-900 font-mono">{formatCurrency(totalTaxesEstimated)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK PENDING ALERTS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contas a Receber Vencidas / Alertas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Alertas de Recebimento
            </h5>
            <button
              onClick={() => onNavigateTab('receivables')}
              className="text-xs text-teal-700 font-semibold hover:underline cursor-pointer"
            >
              Ver Todas
            </button>
          </div>
          {receivablesSummary.overdueItemsCount > 0 ? (
            <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/80 text-xs text-rose-900 flex items-center justify-between">
              <span>{receivablesSummary.overdueItemsCount} parcelas vencidas aguardando liquidação</span>
              <span className="font-bold font-mono">{formatCurrency(receivablesSummary.overdueAmount)}</span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-xs text-emerald-900">
              Nenhuma parcela vencida no momento. Fluxo em dia!
            </div>
          )}
        </div>

        {/* Despesas a Vencer */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              Contas a Pagar do Mês
            </h5>
            <button
              onClick={() => onNavigateTab('expenses')}
              className="text-xs text-teal-700 font-semibold hover:underline cursor-pointer"
            >
              Ver Todas
            </button>
          </div>
          <div className="flex items-center justify-between text-xs p-3 rounded-xl bg-slate-50/70 border border-slate-200/70">
            <div>
              <span className="text-slate-500 block text-[11px]">Total a Pagar</span>
              <span className="font-bold text-slate-800 text-sm font-mono">{formatCurrency(expensesSummary.totalToPay)}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block text-[11px]">Já Liquidado</span>
              <span className="font-bold text-emerald-700 text-sm font-mono">{formatCurrency(expensesSummary.totalPaid)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
