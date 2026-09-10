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
  const [internalYear, setInternalYear] = useState<number>(propYear || 2025);
  const [internalMonth, setInternalMonth] = useState<number | 'ALL'>(propMonth !== undefined ? propMonth : 5);
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

  // Calculate CNPJ Simples Nacional Tax
  const cnpjTax = useMemo(() => {
    return calculateSimplesNacionalMonthlyTax(
      sales,
      competenceStr,
      effectiveYear,
      taxRulesSimples,
      payrollHistory,
      professional.rbt12Inicial,
      professional.folha12MesesInicial
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

  return (
    <div className="space-y-6 pb-12">
      {/* Top Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
            <Calendar className="w-4 h-4 text-teal-600" />
            <span>Competência:</span>
          </div>

          <select
            value={effectiveMonth}
            onChange={(e) => {
              const val = e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10);
              handleMonthChange(val);
            }}
            className="text-sm font-semibold rounded-lg border border-slate-300 p-2 bg-slate-50 focus:ring-2 focus:ring-teal-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Ano Inteiro (Todos os Meses)</option>
            {months.map((m, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {String(idx + 1).padStart(2, '0')} - {m}
              </option>
            ))}
          </select>

          <select
            value={effectiveYear}
            onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
            className="text-sm font-semibold rounded-lg border border-slate-300 p-2 bg-slate-50 focus:ring-2 focus:ring-teal-500 focus:outline-none cursor-pointer"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                Ano {y}
              </option>
            ))}
          </select>
        </div>

        {/* Realizado vs Projetado Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setViewMode('REALIZADO')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === 'REALIZADO'
                ? 'bg-white text-teal-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Realizado (Caixa)
          </button>
          <button
            onClick={() => setViewMode('PROJETADO')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === 'PROJETADO'
                ? 'bg-white text-teal-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Projetado (+ A Vencer)
          </button>
        </div>
      </div>

      {/* Main KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Receitas Totais */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Receitas {viewMode === 'REALIZADO' ? 'Recebidas' : 'Totais'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>CPF: {formatCurrency(receivablesSummary.cpfReceived)}</span>
            <span>CNPJ: {formatCurrency(receivablesSummary.cnpjReceived)}</span>
          </div>
        </div>

        {/* Despesas Totais */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Despesas {viewMode === 'REALIZADO' ? 'Pagas' : 'Totais'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {formatCurrency(totalExpenses)}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>Dedutível PF: {formatCurrency(expensesSummary.cpfDeductiblePaid)}</span>
            <span>PJ: {formatCurrency(expensesSummary.cnpjOperationalPaid)}</span>
          </div>
        </div>

        {/* Provisão Tributária Total */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Impostos Estimados
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Calculator className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-indigo-900 mt-2">
            {formatCurrency(totalTaxesEstimated)}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
            <span>Carnê-Leão: {formatCurrency(cpfTax.carneLeaoEstimated)}</span>
            <span>DAS PJ: {formatCurrency(cnpjTax.dasEstimated)}</span>
          </div>
        </div>

        {/* Resultado Líquido Final */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Resultado Líquido (após impostos)
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black mt-2 ${netResultAfterTax >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
            {formatCurrency(netResultAfterTax)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Margem Líquida:{' '}
            <span className="font-bold text-slate-700">
              {totalRevenue > 0 ? formatPercent((netResultAfterTax / totalRevenue) * 100) : '0%'}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 3 REQUIREMENT: BOXES TRIBUTÁRIOS SEPARADOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BOX 1: OPERAÇÃO PESSOA FÍSICA (CPF) */}
        <div className="bg-white rounded-2xl border-2 border-emerald-500/30 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-emerald-100">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Operação Pessoa Física (CPF)</h3>
                  <p className="text-xs text-emerald-800 font-medium">
                    Regime de Caixa • Carnê-Leão Obrigatório
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Receita Saúde
              </span>
            </div>

            {/* Metrics Grid CPF */}
            <div className="grid grid-cols-2 gap-4 my-5">
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <span className="text-xs text-slate-600 block">Receitas Recebidas no Mês</span>
                <span className="text-lg font-bold text-emerald-950 block mt-0.5">
                  {formatCurrency(cpfTax.grossRevenueReceived)}
                </span>
                <span className="text-[11px] text-slate-500">Regime de Caixa</span>
              </div>

              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <span className="text-xs text-slate-600 block">Despesas Dedutíveis (Livro Caixa)</span>
                <span className="text-lg font-bold text-slate-900 block mt-0.5">
                  {formatCurrency(cpfTax.deductibleExpensesLivroCaixa)}
                </span>
                <span className="text-[11px] text-slate-500">Comprovadas e pagas</span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs text-slate-600 block">Base de Cálculo Carnê-Leão</span>
                <span className="text-lg font-bold text-slate-900 block mt-0.5">
                  {formatCurrency(cpfTax.taxBase)}
                </span>
                <span className="text-[11px] text-slate-500">Após deduções legais</span>
              </div>

              <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs">
                <span className="text-xs text-emerald-100 block">IRPF Estimado (Carnê-Leão)</span>
                <span className="text-xl font-black block mt-0.5">
                  {formatCurrency(cpfTax.carneLeaoEstimated)}
                </span>
                <span className="text-[11px] text-emerald-200">
                  Alíquota Efetiva: {formatPercent(cpfTax.effectiveTaxRate)}
                </span>
              </div>
            </div>

            {/* Receita Saúde Compliance Alert */}
            <div className="p-3.5 rounded-xl border text-xs space-y-1.5 transition-colors bg-amber-50 border-amber-200 text-amber-900">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-amber-600" />
                  Status Receita Saúde (Recebimentos CPF)
                </span>
                {cpfTax.pendingReceitaSaudeCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white">
                    {cpfTax.pendingReceitaSaudeCount} Pendente{cpfTax.pendingReceitaSaudeCount > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    100% Emitidos
                  </span>
                )}
              </div>
              <p className="leading-relaxed text-[11px]">
                {cpfTax.pendingReceitaSaudeCount > 0
                  ? 'Existem recebimentos em dinheiro/PIX/cartão no CPF sem o registro do documento Receita Saúde vinculado. Registre no Contas a Receber para manter conformidade com o Fisco.'
                  : 'Todos os recebimentos em CPF deste mês possuem identificador do Receita Saúde registrado.'}
              </p>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={() => onNavigateTab('taxes')}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
            >
              Ver Memória de Cálculo do Carnê-Leão <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigateTab('receivables')}
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Acessar Recebíveis
            </button>
          </div>
        </div>

        {/* BOX 2: OPERAÇÃO PESSOA JURÍDICA (CNPJ) */}
        <div className="bg-white rounded-2xl border-2 border-blue-500/30 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-blue-100">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Operação Pessoa Jurídica (CNPJ)</h3>
                  <p className="text-xs text-blue-800 font-medium">
                    Simples Nacional • Enquadramento por Fator R
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  cnpjTax.effectiveAnnex === 'ANEXO_III'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}
              >
                {cnpjTax.effectiveAnnex === 'ANEXO_III' ? 'Anexo III (6%~)' : 'Anexo V (15.5%~)'}
              </span>
            </div>

            {/* Metrics Grid CNPJ */}
            <div className="grid grid-cols-2 gap-4 my-5">
              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                <span className="text-xs text-slate-600 block">Faturamento Bruto no Mês</span>
                <span className="text-lg font-bold text-blue-950 block mt-0.5">
                  {formatCurrency(cnpjTax.monthlyRevenueNfse)}
                </span>
                <span className="text-[11px] text-slate-500">NFS-e Emitidas no período</span>
              </div>

              <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                <span className="text-xs text-slate-600 block">RBT12 Acumulado (12m)</span>
                <span className="text-lg font-bold text-slate-900 block mt-0.5">
                  {formatCurrency(cnpjTax.rbt12)}
                </span>
                <span className="text-[11px] text-slate-500">Faixa {cnpjTax.bracketNumber} do Simples</span>
              </div>

              {/* Fator R Box Highlight */}
              <div
                className={`p-3 rounded-xl border ${
                  cnpjTax.fatorR >= 0.28
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Fator R (FS12 / RBT12)</span>
                  <span>{cnpjTax.fatorR >= 0.28 ? '≥ 28%' : '< 28%'}</span>
                </div>
                <div className="text-xl font-black mt-0.5">
                  {formatPercent(cnpjTax.fatorRPercent)}
                </div>
                <div className="text-[11px] mt-0.5">
                  FS12: {formatCurrency(cnpjTax.fs12)}
                </div>
              </div>

              <div className="p-3 bg-blue-600 text-white rounded-xl shadow-xs">
                <span className="text-xs text-blue-100 block">DAS Estimado do Mês</span>
                <span className="text-xl font-black block mt-0.5">
                  {formatCurrency(cnpjTax.dasEstimated)}
                </span>
                <span className="text-[11px] text-blue-200">
                  Alíquota Efetiva: {formatPercent(cnpjTax.effectiveTaxRate)}
                </span>
              </div>
            </div>

            {/* Official Formula Details */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between font-mono text-[11px]">
                <span>Fórmula Oficial:</span>
                <span className="text-slate-800 font-semibold">(RBT12 × Alíq.Nominal - Deducao) / RBT12</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Alíquota Nominal da Faixa: {formatPercent(cnpjTax.nominalRate * 100)}</span>
                <span>Parcela a Deduzir: {formatCurrency(cnpjTax.deductionAmount)}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={() => onNavigateTab('taxes')}
              className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1"
            >
              Simulador de Pró-labore e Fator R <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigateTab('sales')}
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Consultar NFS-e
            </button>
          </div>
        </div>
      </div>

      {/* CONSOLIDATED TAX COMPARISON BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-2xl shadow-lg border border-slate-700">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Layers className="w-3.5 h-3.5" />
              Consolidação Tributária Híbrida
            </div>
            <h4 className="text-lg font-bold text-white tracking-tight">
              Carga Tributária Efetiva Global: {formatPercent(totalRevenue > 0 ? (totalTaxesEstimated / totalRevenue) * 100 : 0)}
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              O sistema consolida as estimativas apuradas separadamente para CPF e CNPJ de acordo com a natureza real de cada lançamento. <strong>Importante:</strong> Esta é uma ferramenta gerencial e estimativa preventiva; não substitui o trabalho do seu contador nem a emissão dos DARF e DAS oficiais.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 shrink-0 bg-white/5 p-4 rounded-xl border border-white/10">
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-slate-400">Carnê-Leão (PF)</span>
              <span className="text-base font-bold text-emerald-400">{formatCurrency(cpfTax.carneLeaoEstimated)}</span>
            </div>
            <div className="text-slate-500 text-lg">+</div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-slate-400">DAS Simples (PJ)</span>
              <span className="text-base font-bold text-blue-400">{formatCurrency(cnpjTax.dasEstimated)}</span>
            </div>
            <div className="text-slate-500 text-lg">=</div>
            <div>
              <span className="block text-[11px] uppercase tracking-wider text-indigo-300 font-bold">Total Estimado</span>
              <span className="text-xl font-black text-white">{formatCurrency(totalTaxesEstimated)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* QUICK PENDING ALERTS SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contas a Receber Vencidas / Alertas */}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Alertas de Recebimento
            </h5>
            <button
              onClick={() => onNavigateTab('receivables')}
              className="text-xs text-teal-700 font-semibold hover:underline"
            >
              Ver Todas
            </button>
          </div>
          {receivablesSummary.overdueItemsCount > 0 ? (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center justify-between">
              <span>{receivablesSummary.overdueItemsCount} parcelas vencidas aguardando liquidação</span>
              <span className="font-bold">{formatCurrency(receivablesSummary.overdueAmount)}</span>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              Nenhuma parcela vencida no momento. Fluxo de recebimento em dia!
            </div>
          )}
        </div>

        {/* Despesas a Vencer */}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              Contas a Pagar do Mês
            </h5>
            <button
              onClick={() => onNavigateTab('expenses')}
              className="text-xs text-teal-700 font-semibold hover:underline"
            >
              Ver Todas
            </button>
          </div>
          <div className="flex items-center justify-between text-xs p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <span className="text-slate-500 block">Total a Pagar na Competência</span>
              <span className="font-bold text-slate-800 text-sm">{formatCurrency(expensesSummary.totalToPay)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Já Liquidado</span>
              <span className="font-bold text-emerald-700 text-sm">{formatCurrency(expensesSummary.totalPaid)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
