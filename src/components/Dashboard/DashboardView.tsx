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
  ChevronDown,
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
  getMonthlyReceivablesSummary,
  getMonthlyExpensesSummary,
  calculateDashboardProjection,
} from '../../lib/taxEngine';
import { CARNE_LEAO_RULES_2026 } from '../../lib/carneLeaoRules';
import { selectCarneLeaoScenario, calculateZeroTaxIncomeLimit } from '../../lib/carneLeaoCalculation';
import { formatCurrency, formatPercent } from '../../lib/masks';
import { db } from '../../lib/db';
import { addMonthsToCompetency, estimateSimplesFromBase, fiscalBaseStatusLabel, formatCompetencyShortName } from '../../lib/fiscalBase';
import { getLastClosedCompetence } from '../../lib/statusHelper';
import { useFiscalBase } from '../../hooks/useFiscalBase';
import { FirstStepsChecklist } from './FirstStepsChecklist';
import { FatorRProgress } from './FatorRProgress';
import { LivroCaixaExcessModal } from './LivroCaixaExcessModal';
import { HybridSavingsCard } from './HybridSavingsCard';
import { computeHybridSavings } from '../../lib/hybridSavings';
import { getLivroCaixaMonthlyHistory } from '../../lib/taxEngine';
import { normalizeIgnoredMonths, setMonthIgnored } from '../../lib/carneLeaoExcessSettings';
import { hasPermission } from '../../lib/permissions';

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

  const handleViewModeSelect = (mode: 'REALIZADO' | 'PROJETADO') => {
    setViewMode(mode);
  };

  // Month competence string
  const competenceStr =
    effectiveMonth === 'ALL'
      ? `${effectiveYear}`
      : `${effectiveYear}-${String(effectiveMonth).padStart(2, '0')}`;

  // Regime de CAIXA: o que a clínica recebeu/pagou no mês selecionado já mostra o imposto daquele mesmo
  // mês (a guia só é paga no mês seguinte, mas o valor é calculado sobre o mês exibido).
  // Em “Todos os meses”, o painel mantém o resumo anual e a guia segue a última competência fechada.
  const isAnnualPeriod = effectiveMonth === 'ALL';
  const dueCompetenceStr = isAnnualPeriod
    ? getLastClosedCompetence().competenceStr
    : competenceStr;
  const dueCompetenceYear = Number(dueCompetenceStr.slice(0, 4));

  // CPF (Carnê-Leão): em uma competência mensal, painel, memória resumida e guia usam o mesmo mês.
  // No resumo anual, os detalhes continuam acumulados no ano selecionado.
  // Meses desativados no excesso de Livro Caixa (receitas ainda não lançadas). Salvo nas preferências da clínica.
  const [ignoredExcessMonths, setIgnoredExcessMonths] = useState<string[]>(() =>
    normalizeIgnoredMonths(db.getPreferences().carneLeaoSettings?.excessIgnoredMonths)
  );
  const ignoredExcessKey = ignoredExcessMonths.join(',');
  // Meses anteriores (do mesmo ano) que estão desativados no excesso: a linha do excesso precisa continuar
  // visível mesmo com o valor zerado, senão não haveria como reativar.
  const ignoredBeforeCount = isAnnualPeriod
    ? 0
    : ignoredExcessMonths.filter((m) => m.startsWith(`${dueCompetenceYear}-`) && m < dueCompetenceStr).length;
  const currentUserForExcess = db.getUser();
  const canManageExcessMonths = hasPermission(
    currentUserForExcess?.role,
    'taxes:view',
    currentUserForExcess?.permissions,
    currentUserForExcess?.isPrimary
  );
  const handleToggleExcessMonth = (monthKey: string, ignored: boolean) => {
    const next = setMonthIgnored(ignoredExcessMonths, monthKey, ignored);
    setIgnoredExcessMonths(next);
    db.updatePreferences({ carneLeaoSettings: { ...(db.getPreferences().carneLeaoSettings || {}), excessIgnoredMonths: next } });
  };

  const cpfTax = useMemo(() => {
    return calculateCpfMonthlyTax(
      sales,
      expenses,
      isAnnualPeriod ? competenceStr : dueCompetenceStr,
      isAnnualPeriod ? effectiveYear : dueCompetenceYear,
      taxRulesPf,
      professional.numDependentes,
      professional.inssProprioMensal,
      ignoredExcessMonths
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, expenses, competenceStr, dueCompetenceStr, dueCompetenceYear, isAnnualPeriod, effectiveYear, taxRulesPf, professional, ignoredExcessKey]);
  // Histórico mês a mês do Livro Caixa (para explicar o excesso trazido). Só faz sentido em mês único.
  const [isExcessModalOpen, setIsExcessModalOpen] = useState(false);
  // "Mais informações" do card de recibos (Livro Caixa usado, DARF, alíquota): recolhido por padrão.
  const [showCpfMoreInfo, setShowCpfMoreInfo] = useState(false);
  const livroCaixaHistory = useMemo(
    () =>
      isAnnualPeriod
        ? []
        : getLivroCaixaMonthlyHistory(
            sales,
            expenses,
            dueCompetenceStr,
            dueCompetenceYear,
            taxRulesPf,
            professional.numDependentes,
            professional.inssProprioMensal,
            ignoredExcessMonths
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sales, expenses, dueCompetenceStr, dueCompetenceYear, isAnnualPeriod, taxRulesPf, professional, ignoredExcessKey]
  );
  const isCpfProjected = viewMode === 'PROJETADO';
  const cpfCalculationDisplayed = selectCarneLeaoScenario(
    cpfTax.monthlyCalculation,
    cpfTax.projectedCalculation,
    viewMode
  );
  // Pergunta principal do Carnê-Leão: quanto ainda cabe em recibos SEM pagar imposto neste mês?
  const zeroTaxLimit = useMemo(() => {
    if (cpfTax.isAnnualSummary) return null;
    const c = cpfCalculationDisplayed;
    return calculateZeroTaxIncomeLimit({
      year: c.year,
      month: c.month,
      taxableIncome: c.rendimentosTributaveis,
      livroCaixaExpensesPaid: c.despesasLivroCaixaMes,
      previousLivroCaixaExcess: c.excessoLivroCaixaAnterior,
      deductibleInss: c.inssDedutivel,
      deductibleDependents: c.dependentesDedutiveis,
      deductibleAlimony: c.pensaoDedutivel,
      otherLegalDeductions: c.outrasDeducoesLegais,
      taxRules: taxRulesPf,
    });
  }, [cpfTax.isAnnualSummary, cpfCalculationDisplayed, taxRulesPf]);
  const cpfTaxAmountDisplayed = cpfTax.isAnnualSummary
    ? (isCpfProjected ? cpfTax.annualSummary.projectedFinalTax : cpfTax.annualSummary.finalTax)
    : cpfCalculationDisplayed.impostoFinal;
  const cpfIncomeDisplayed = cpfTax.isAnnualSummary
    ? (isCpfProjected ? cpfTax.annualSummary.projectedGrossRevenue : cpfTax.annualSummary.grossRevenueReceived)
    : cpfCalculationDisplayed.rendimentosTributaveis;
  const cpfEffectiveRateDisplayed = cpfIncomeDisplayed > 0 ? (cpfTaxAmountDisplayed / cpfIncomeDisplayed) * 100 : 0;

  const patientsCount = useMemo(() => db.getPatients().length, [sales]);
  const appointmentsCount = useMemo(() => db.getAppointments().length, [sales]);

  // Simples Nacional: no mês selecionado, o faturamento é o do próprio mês (caixa); a base fiscal
  // (RBT12/Fator R) usa os 12 meses anteriores a ele. “Todos os meses” mantém a última competência fechada.
  const fiscalBase = useFiscalBase({
    professional,
    sales,
    payrollHistory,
    taxRulesSimples,
    year: isAnnualPeriod ? effectiveYear : dueCompetenceYear,
    referenceCompetencyOverride: isAnnualPeriod ? null : dueCompetenceStr,
  });

  // O modo Realizado/Projetado seleciona um cenário único do motor, usado no card e nos detalhes.
  const cnpjTax = useMemo(
    () =>
      estimateSimplesFromBase(fiscalBase, {
        sales,
        revenueCompetence: isAnnualPeriod ? fiscalBase.referenceCompetency : dueCompetenceStr,
        year: isAnnualPeriod ? effectiveYear : dueCompetenceYear,
        taxRules: taxRulesSimples,
      }),
    [fiscalBase, sales, dueCompetenceStr, dueCompetenceYear, isAnnualPeriod, effectiveYear, taxRulesSimples]
  );
  const fiscalBaseLabel = formatCompetencyShortName(fiscalBase.referenceCompetency);

  // Economia do modelo híbrido: imposto do mês se tudo fosse só PF, só PJ, e como está hoje (híbrido).
  const hybridSavings = useMemo(() => {
    if (cpfTax.isAnnualSummary) return null;
    const result = computeHybridSavings({
      cpf: cpfCalculationDisplayed,
      cnpjRevenue: cnpjTax.monthlyRevenueNfse,
      hybridDas: cnpjTax.available ? cnpjTax.dasEstimated : 0,
      simplesEffectiveRatePct: cnpjTax.available ? cnpjTax.effectiveTaxRate : null,
      taxRules: taxRulesPf,
    });
    return result.receitaTotal > 0 ? result : null;
  }, [cpfTax.isAnnualSummary, cpfCalculationDisplayed, cnpjTax, taxRulesPf]);
  const dueCompetenceLabel = formatCompetencyShortName(dueCompetenceStr);
  // A guia do mês é paga no mês seguinte.
  const dueMonthLabel = formatCompetencyShortName(addMonthsToCompetency(dueCompetenceStr, 1));
  const fiscalBaseSourceLabel =
    fiscalBase.source === 'CONTABILEX' ? 'Base oficial Contaju' : fiscalBase.source === 'NONE' ? '' : 'Base informada manualmente';

  // A provisão de CPF acompanha o cenário selecionado; DAS continua baseado na competência fiscal.
  const totalTaxesEstimated = cpfTaxAmountDisplayed + cnpjTax.dasEstimated;

  const projection = useMemo(() => {
    return calculateDashboardProjection({
      sales,
      expenses,
      competence: competenceStr,
      viewMode,
      taxesEstimated: totalTaxesEstimated,
    });
  }, [sales, expenses, competenceStr, viewMode, totalTaxesEstimated]);

  const receivablesSummary = useMemo(() => {
    return getMonthlyReceivablesSummary(sales, competenceStr);
  }, [sales, competenceStr]);

  const expensesSummary = useMemo(() => {
    return getMonthlyExpensesSummary(expenses, competenceStr);
  }, [expenses, competenceStr]);

  // General Totals
  const totalRevenue = projection.activeRevenue.total;
  const totalExpenses = projection.activeExpenses.total;
  const operatingResult = projection.operatingResult;
  const netResultAfterTax = projection.netResult;

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
              onClick={() => handleViewModeSelect('REALIZADO')}
              aria-pressed={viewMode === 'REALIZADO'}
              className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'REALIZADO'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Realizado (Caixa)
            </button>
            <button
              onClick={() => handleViewModeSelect('PROJETADO')}
              aria-pressed={viewMode === 'PROJETADO'}
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
                  ? formatPercent(projection.netMarginPercent)
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
                {projection.activeRevenue.salesCount} {projection.activeRevenue.salesCount === 1 ? 'venda' : 'vendas'}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight tabular-nums">
              {formatCurrency(totalRevenue)}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-emerald-100/70">
              <span>
                CPF: <strong className="text-slate-800 font-mono">{formatCurrency(projection.activeRevenue.cpf)}</strong>
              </span>
              <span className="text-emerald-300">•</span>
              <span>
                PJ: <strong className="text-slate-800 font-mono">{formatCurrency(projection.activeRevenue.cnpj)}</strong>
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
                {projection.activeExpenses.count} {projection.activeExpenses.count === 1 ? 'lançamento' : 'lançamentos'}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight tabular-nums">
              {formatCurrency(totalExpenses)}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1 border-t border-rose-100/70">
              <span>
                Pessoa Física: <strong className="text-slate-800 font-mono">{formatCurrency(projection.activeExpenses.cpfDeductible)}</strong>
              </span>
              <span className="text-rose-300">•</span>
              <span>
                PJ: <strong className="text-slate-800 font-mono">{formatCurrency(projection.activeExpenses.cnpjOperational)}</strong>
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
                Carnê-Leão: <strong className="text-slate-800 font-mono">{formatCurrency(cpfTaxAmountDisplayed)}</strong>
              </span>
              <span className="text-indigo-300">•</span>
              <span>
                DAS PJ:{' '}
                <strong className="text-slate-800 font-mono" data-testid="provision-das">
                  {cnpjTax.available ? formatCurrency(cnpjTax.dasEstimated) : 'indisponível'}
                </strong>
              </span>
            </div>
            {!cnpjTax.available && (
              <p className="text-[10.5px] text-amber-700 leading-snug">
                Total sem o DAS: {fiscalBase.status === 'LOADING' ? 'carregando a base fiscal…' : 'base fiscal indisponível.'}
              </p>
            )}
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

            {/* Indicador principal: no mês, a pergunta é "quanto ainda posso emitir de recibo sem pagar imposto?".
                No resumo anual continua o IRPF a recolher. */}
            {zeroTaxLimit ? (() => {
              const over = zeroTaxLimit.folga < 0;
              const limite = zeroTaxLimit.limiteReceita;
              const atual = zeroTaxLimit.receitaAtual;
              // Escala da barra: sempre mostra o limite (marca) e a receita atual; passou do limite => trecho vermelho.
              const scale = Math.max(limite, atual, 0.01);
              const okPct = Math.min(100, (Math.min(atual, limite) / scale) * 100);
              const overPct = over ? ((atual - limite) / scale) * 100 : 0;
              const limitMarkPct = (limite / scale) * 100;
              // O que passa do limite do Carnê-Leão vai para nota fiscal (PJ), que gera DAS.
              const paraNota = over ? Math.abs(zeroTaxLimit.folga) : 0;
              const dasSobreNota =
                over && cnpjTax.available ? Math.round(paraNota * (cnpjTax.effectiveTaxRate / 100) * 100) / 100 : null;
              return (
                <div data-testid="cpf-zero-tax-room" className="@container my-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="grid grid-cols-1 gap-3 @[460px]:grid-cols-2">
                    <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3.5">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-teal-800">
                        Pode fazer de recibo no mês, sem imposto
                      </span>
                      <span data-testid="cpf-zero-tax-limit" className="mt-1 block whitespace-nowrap text-2xl sm:text-[26px] font-black text-teal-950 font-mono tabular-nums tracking-tight">
                        {formatCurrency(limite)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-teal-800/80">Limite do Carnê-Leão em {dueCompetenceLabel} (de acordo com as despesas)</span>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        {isCpfProjected ? 'Receita prevista no mês' : 'Receita atual do mês'}
                      </span>
                      <span data-testid="cpf-zero-tax-current" className="mt-1 block whitespace-nowrap text-2xl sm:text-[26px] font-black text-slate-900 font-mono tabular-nums tracking-tight">
                        {formatCurrency(atual)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">Total recebido como pessoa física</span>
                    </div>
                  </div>

                  {/* Barra: limite × receita atual */}
                  <div className="mt-4" data-testid="cpf-zero-tax-bar">
                    <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img"
                      aria-label={over ? `${formatCurrency(paraNota)} da receita vai para nota fiscal` : `Ainda cabem ${formatCurrency(zeroTaxLimit.folga)} em recibos`}>
                      <div className="absolute inset-y-0 left-0 bg-teal-500" style={{ width: `${okPct}%` }} />
                      {over && (
                        <div className="absolute inset-y-0 bg-blue-500" style={{ left: `${limitMarkPct}%`, width: `${overPct}%` }} />
                      )}
                      {over && <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${limitMarkPct}%` }} />}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      {over ? (
                        <span className="font-bold text-blue-700" data-testid="cpf-zero-tax-gap">
                          {formatCurrency(paraNota)} vão para nota fiscal
                        </span>
                      ) : (
                        <span className="font-bold text-teal-700" data-testid="cpf-zero-tax-gap">
                          Ainda cabem {formatCurrency(zeroTaxLimit.folga)} em recibos
                        </span>
                      )}
                      <span className="text-slate-500">
                        {over
                          ? `${formatCurrency(limite)} em recibo (sem imposto) • a diferença sai em nota fiscal e gera DAS.`
                          : 'Acima disso, o restante da receita sai em nota fiscal.'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCpfMoreInfo((v) => !v)}
                    aria-expanded={showCpfMoreInfo}
                    data-testid="cpf-zero-tax-more"
                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {showCpfMoreInfo ? 'Menos informações' : 'Mais informações (DARF, Livro Caixa)'}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCpfMoreInfo ? 'rotate-180' : ''}`} />
                  </button>
                  {showCpfMoreInfo && (
                    <dl className="mt-2 space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-600" data-testid="cpf-zero-tax-more-panel">
                      <div className="flex justify-between gap-3">
                        <dt>Livro Caixa disponível para deduzir</dt>
                        <dd className="font-mono font-bold tabular-nums text-slate-900">{formatCurrency(cpfCalculationDisplayed.livroCaixaDisponivel)}</dd>
                      </div>
                      {dasSobreNota !== null && (
                        <div className="flex justify-between gap-3" data-testid="cpf-zero-tax-das-estimate">
                          <dt>DAS estimado sobre a nota ({formatPercent(cnpjTax.effectiveTaxRate)})</dt>
                          <dd className="whitespace-nowrap font-mono font-bold tabular-nums text-slate-900">{formatCurrency(dasSobreNota)}</dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-3">
                        <dt>DARF que seria pago se tudo ficasse em recibo ({dueCompetenceLabel}, paga em {dueMonthLabel})</dt>
                        <dd data-testid="cpf-irpf-value" className="whitespace-nowrap font-mono font-bold tabular-nums text-slate-900">{formatCurrency(cpfTaxAmountDisplayed)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Alíquota efetiva do Carnê-Leão (se fosse tudo recibo)</dt>
                        <dd className="font-mono font-bold tabular-nums text-slate-900">{formatPercent(cpfEffectiveRateDisplayed)}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              );
            })() : (
            <div className="my-5 p-4.5 rounded-2xl bg-teal-600 text-white shadow-sm flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-48">
                <span className="text-xs font-bold text-teal-100 uppercase tracking-wider block">
                  IRPF {isCpfProjected ? 'PROJETADO' : 'REALIZADO'} A RECOLHER:
                </span>
                <span className="text-[11px] text-teal-100/80 font-medium mt-0.5 block">
                  DARF Cód. 0190 • Sobre recebimentos de {dueCompetenceLabel} (paga em {dueMonthLabel})
                </span>
              </div>
              <div className="text-right shrink-0">
                <span data-testid="cpf-irpf-value" className="block whitespace-nowrap text-2xl font-black text-white font-mono tabular-nums tracking-tight">
                  {formatCurrency(cpfTaxAmountDisplayed)}
                </span>
                <span className="block text-[11px] text-teal-200 font-medium mt-0.5">
                  Alíquota Efetiva: {formatPercent(cpfEffectiveRateDisplayed)}
                </span>
              </div>
            </div>
            )}

            {/* Faixa da redução especial, sem somar Livro Caixa ao limite de rendimentos. */}
            <div className="mb-4 p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2 border-b border-teal-200/60 pb-2">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
                  <span className="font-bold text-teal-950 text-xs">
                    Redução Especial do IRPF 2026
                  </span>
                </div>

                <div className="inline-flex items-center bg-teal-100/80 p-0.5 rounded-lg border border-teal-200 text-[10.5px] font-bold shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleViewModeSelect('REALIZADO')}
                    aria-pressed={viewMode === 'REALIZADO'}
                    className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                      viewMode === 'REALIZADO'
                        ? 'bg-white text-teal-950 shadow-2xs font-extrabold'
                        : 'text-teal-700 hover:text-teal-950'
                    }`}
                    title="Apuração realizada com valores efetivamente recebidos e despesas pagas"
                  >
                    Realizado
                  </button>
                  <button
                    type="button"
                    onClick={() => handleViewModeSelect('PROJETADO')}
                    aria-pressed={viewMode === 'PROJETADO'}
                    className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                      viewMode === 'PROJETADO'
                        ? 'bg-white text-teal-950 shadow-2xs font-extrabold'
                        : 'text-teal-700 hover:text-teal-950'
                    }`}
                    title="Projeção para planejamento com recebimentos e despesas previstos no mês"
                  >
                    Projeção
                  </button>
                </div>
              </div>

              {(() => {
                const isProjected = isCpfProjected;
                const calculation = cpfCalculationDisplayed;
                const annual = cpfTax.isAnnualSummary ? cpfTax.annualSummary : null;
                const revenueInScope = annual
                  ? (isProjected ? annual.projectedGrossRevenue : annual.grossRevenueReceived)
                  : (isProjected ? cpfTax.grossRevenueProjected : cpfTax.grossRevenueReceived);
                const band = calculation.faixaReducao2026;
                const reductionRules = CARNE_LEAO_RULES_2026.specialReduction;
                const bandDescription = annual
                  ? 'A redução especial e o Carnê-Leão são calculados separadamente em cada competência.'
                  : band === 'INTEGRAL'
                  ? `Até ${formatCurrency(reductionRules.fullReductionIncomeLimit)}: redução limitada ao imposto calculado e a ${formatCurrency(reductionRules.fullReductionMaximum)}.`
                  : band === 'PARCIAL'
                  ? `De ${formatCurrency(reductionRules.fullReductionIncomeLimit + 0.01)} a ${formatCurrency(reductionRules.partialReductionIncomeLimit)}: redução parcial calculada sobre os rendimentos do mês.`
                  : band === 'SEM_REDUCAO'
                  ? `Acima de ${formatCurrency(reductionRules.partialReductionIncomeLimit)}: sem redução especial.`
                  : 'A redução especial de 2026 não se aplica a este ano-calendário.';

                return (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                    <div>
                      <span className="block font-semibold text-teal-950">{annual
                        ? `Rendimentos ${isProjected ? 'projetados' : 'realizados'} no ano (soma mensal)`
                        : `Rendimentos ${isProjected ? 'projetados' : 'realizados'} no mês`}</span>
                      <span className="font-mono text-teal-800">{formatCurrency(revenueInScope)}</span>
                      <span className="block text-teal-800 mt-1">{bandDescription}</span>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <span className="block text-teal-800">Redução especial {isProjected ? 'projetada' : 'aplicada — realizado'}</span>
                      <span className="font-mono font-black text-teal-950 text-sm">
                        {formatCurrency(annual ? (isProjected ? annual.projectedSpecialReduction : annual.specialReduction) : calculation.reducaoEspecial)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Valores da mesma apuração central exibida na tela fiscal. */}
            <div className="space-y-2 text-xs">
              {(() => {
                const isProjected = isCpfProjected;
                if (cpfTax.isAnnualSummary) {
                  const annual = cpfTax.annualSummary;
                  const income = isProjected ? annual.projectedGrossRevenue : annual.grossRevenueReceived;
                  const bookUsed = isProjected ? annual.projectedLivroCaixaUsed : annual.livroCaixaUsed;
                  const legalDeductions = isProjected ? annual.projectedLegalDeductions : annual.legalDeductions;
                  const simplified = isProjected ? annual.projectedSimplifiedDiscountsAvailable : annual.simplifiedDiscountsAvailable;
                  const applied = isProjected ? annual.projectedAppliedDeductions : annual.appliedDeductions;
                  const base = isProjected ? annual.projectedTaxableBase : annual.taxableBase;
                  return <>
                    <div className="flex justify-between items-center py-1 text-slate-600">
                      <span>Rendimentos tributáveis no ano (soma mensal):</span>
                      <span className="font-bold text-slate-900 font-mono tabular-nums">{formatCurrency(income)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 text-slate-600">
                      <span>Livro Caixa utilizado nas competências:</span>
                      <span className="font-bold text-rose-700 font-mono tabular-nums">− {formatCurrency(bookUsed)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 text-slate-600">
                      <span>Soma das deduções legais:</span>
                      <span className="font-bold text-slate-700 font-mono tabular-nums">{formatCurrency(legalDeductions)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 text-slate-600">
                      <span>Soma do desconto simplificado disponível:</span>
                      <span className="font-bold text-slate-700 font-mono tabular-nums">{formatCurrency(simplified)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 text-slate-600">
                      <span>Deduções escolhidas separadamente por competência:</span>
                      <span className="font-bold text-slate-700 font-mono tabular-nums">− {formatCurrency(applied)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-t border-slate-100 font-bold text-slate-900">
                      <span>Soma das bases de cálculo mensais:</span>
                      <span className="font-mono tabular-nums">{formatCurrency(base)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 text-emerald-900 font-bold">
                      <span>Soma do Carnê-Leão mensal:</span>
                      <span className="font-mono tabular-nums">{formatCurrency(isProjected ? annual.projectedFinalTax : annual.finalTax)}</span>
                    </div>
                  </>;
                }
                const calculation = cpfCalculationDisplayed;
                const deductionType = calculation.tipoDeducaoEscolhida === 'DEDUCOES_LEGAIS'
                  ? 'Deduções legais'
                  : 'Desconto simplificado';
                return <>
                  <div className="flex justify-between items-center py-1 text-slate-600">
                    <span>{isProjected ? 'Rendimentos projetados no mês:' : 'Rendimentos realizados no mês:'}</span>
                    <span className="font-bold text-slate-900 font-mono tabular-nums">{formatCurrency(calculation.rendimentosTributaveis)}</span>
                  </div>
                  {isProjected && <>
                    <div className="flex justify-between items-center py-1 pl-3 text-slate-500">
                      <span>Receitas já recebidas:</span>
                      <span className="font-mono tabular-nums">{formatCurrency(cpfTax.grossRevenueReceived)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 pl-3 text-slate-500">
                      <span>+ Receitas previstas:</span>
                      <span className="font-mono tabular-nums">{formatCurrency(Math.max(0, cpfTax.grossRevenueProjected - cpfTax.grossRevenueReceived))}</span>
                    </div>
                  </>}
                  <div className="flex justify-between items-center py-1 text-slate-600">
                    <span>{isProjected ? 'Livro Caixa projetado/utilizado:' : 'Livro Caixa utilizado — realizado:'}</span>
                    <span className="font-bold text-rose-700 font-mono tabular-nums">− {formatCurrency(calculation.livroCaixaUtilizado)}</span>
                  </div>
                  {(calculation.despesasLivroCaixaMes > 0 || calculation.excessoLivroCaixaAnterior > 0 || ignoredBeforeCount > 0) && (
                    <div className="rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-2 space-y-1 text-[11px] text-slate-500" data-testid="livro-caixa-breakdown">
                      <div className="flex justify-between">
                        <span>Despesas do Livro Caixa lançadas no mês:</span>
                        <span className="font-mono tabular-nums text-slate-700">{formatCurrency(calculation.despesasLivroCaixaMes)}</span>
                      </div>
                      {(calculation.excessoLivroCaixaAnterior > 0 || ignoredBeforeCount > 0) && (
                        <button
                          type="button"
                          onClick={() => setIsExcessModalOpen(true)}
                          data-testid="open-excess-details"
                          className="group flex w-full items-center justify-between gap-2 rounded-md px-1 -mx-1 py-0.5 text-left hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 cursor-pointer"
                          title="Ver de onde veio o excesso, mês a mês"
                        >
                          <span className="underline decoration-dotted underline-offset-2 group-hover:text-teal-800">
                            + Excesso trazido de meses anteriores
                            <span className="ml-1.5 rounded-full bg-teal-100 px-1.5 py-0.5 text-[9.5px] font-bold text-teal-800 no-underline">
                              {ignoredBeforeCount > 0 ? 'ver detalhes / reativar' : 'ver detalhes'}
                            </span>
                          </span>
                          <span className="font-mono tabular-nums text-slate-700">{formatCurrency(calculation.excessoLivroCaixaAnterior)}</span>
                        </button>
                      )}
                      <div className="flex justify-between font-semibold text-slate-600">
                        <span>= Disponível para deduzir:</span>
                        <span className="font-mono tabular-nums">{formatCurrency(calculation.livroCaixaDisponivel)}</span>
                      </div>
                      {ignoredBeforeCount > 0 && (
                        <div className="text-amber-700" data-testid="excess-ignored-warning">
                          {ignoredBeforeCount === 1 ? '1 mês desativado' : `${ignoredBeforeCount} meses desativados`} no excesso (receitas ainda não lançadas). O valor pode mudar quando {ignoredBeforeCount === 1 ? 'for reativado' : 'forem reativados'}.{' '}
                          <button
                            type="button"
                            onClick={() => setIsExcessModalOpen(true)}
                            data-testid="reactivate-excess-months"
                            className="font-bold underline underline-offset-2 hover:text-amber-900 cursor-pointer"
                          >
                            Reativar meses
                          </button>
                        </div>
                      )}
                      {calculation.excessoLivroCaixaProximoMes > 0 && (
                        <div className="flex justify-between text-amber-700">
                          <span>Passa para o mês seguinte (a dedução não pode passar dos rendimentos):</span>
                          <span className="font-mono tabular-nums font-semibold">{formatCurrency(calculation.excessoLivroCaixaProximoMes)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {isProjected && <>
                    <div className="flex justify-between items-center py-1 pl-3 text-slate-500">
                      <span>Despesas já pagas:</span>
                      <span className="font-mono tabular-nums">{formatCurrency(cpfTax.deductibleExpensesLivroCaixa)}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 pl-3 text-slate-500">
                      <span>+ Despesas previstas:</span>
                      <span className="font-mono tabular-nums">{formatCurrency(cpfTax.deductibleExpensesToPay)}</span>
                    </div>
                  </>}
                  <div className="flex justify-between items-center py-1 text-slate-600">
                    <span>Deduções legais (inclui Livro Caixa):</span>
                    <span className="font-bold text-slate-700 font-mono tabular-nums">{formatCurrency(calculation.deducoesLegais)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 text-slate-600">
                    <span>Desconto simplificado disponível:</span>
                    <span className="font-bold text-slate-700 font-mono tabular-nums">{formatCurrency(calculation.descontoSimplificado)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 text-slate-600">
                    <span>Opção escolhida: {deductionType}</span>
                    <span className="font-bold text-slate-700 font-mono tabular-nums">− {formatCurrency(calculation.deducaoAplicada)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-t border-slate-100 font-bold text-slate-900">
                    <span>{isProjected ? 'Base de cálculo projetada:' : 'Base de cálculo realizada:'}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(calculation.baseCalculo)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 text-slate-600">
                    <span>Imposto pela tabela progressiva:</span>
                    <span className="font-mono tabular-nums">{formatCurrency(calculation.impostoTabela)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 text-emerald-900 font-bold">
                    <span>IRPF {isProjected ? 'projetado' : 'realizado'} a recolher:</span>
                    <span className="font-mono tabular-nums">{formatCurrency(calculation.impostoFinal)}</span>
                  </div>
                </>;
              })()}
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
                data-testid="pj-annex-badge"
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs ${
                  !cnpjTax.available
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : cnpjTax.effectiveAnnex === 'ANEXO_III'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                    : 'bg-amber-50 text-amber-800 border-amber-200/80'
                }`}
              >
                {!cnpjTax.available
                  ? fiscalBaseStatusLabel(fiscalBase)
                  : cnpjTax.effectiveAnnex === 'ANEXO_III'
                  ? 'Anexo III'
                  : 'Anexo V'}
              </span>
            </div>

            {/* Primary Indicator: DAS estimado sobre o mês selecionado (caixa). */}
            <div className="my-5 p-4.5 rounded-2xl bg-blue-600 text-white shadow-sm flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-48">
                <span className="text-xs font-bold text-blue-100 uppercase tracking-wider block">
                  DAS Estimado (Simples):
                </span>
                <span className="text-[11px] text-blue-100/80 font-medium mt-0.5 block">
                  Guia Única DAS • Vence dia 20 de {dueMonthLabel} • Sobre {dueCompetenceLabel}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span data-testid="pj-das-value" className="block whitespace-nowrap text-2xl font-black text-white font-mono tabular-nums tracking-tight">
                  {cnpjTax.available ? formatCurrency(cnpjTax.dasEstimated) : '—'}
                </span>
                <span data-testid="pj-effective-rate" className="block text-[11px] text-blue-200 font-medium mt-0.5">
                  {cnpjTax.available
                    ? `Alíquota Efetiva: ${formatPercent(cnpjTax.effectiveTaxRate)}`
                    : 'Sem estimativa de DAS'}
                </span>
              </div>
            </div>

            {/* Fator R contra a META (28%): régua única, check quando já bateu, "faltam N pontos" quando não */}
            <FatorRProgress
              base={fiscalBase}
              footer={
                <div data-testid="pj-base-note" className="text-[10.5px] text-slate-500 leading-snug">
                  {cnpjTax.available ? (
                    <>
                      <strong className="text-slate-700">Base: competência fiscal ({fiscalBaseLabel})</strong>
                      {fiscalBaseSourceLabel ? ` • ${fiscalBaseSourceLabel}` : ''}
                      {fiscalBase.isPartialHistory && fiscalBase.source === 'CONTABILEX' ? ' • histórico parcial' : ''}
                    </>
                  ) : (
                    <span>{fiscalBase.reasonMessage}</span>
                  )}
                </div>
              }
            />

            {/* Progressive Calculation Metrics Strip */}
            <div className="space-y-2 text-xs mt-4">
              <div className="flex justify-between items-center text-slate-600">
                <span>Faturamento em {fiscalBaseLabel} (NFS-e):</span>
                <span className="font-bold text-slate-900 font-mono tabular-nums">
                  {formatCurrency(cnpjTax.monthlyRevenueNfse)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>RBT12 (Receita Bruta 12 Meses):</span>
                <span data-testid="pj-rbt12" className="font-bold text-slate-700 font-mono tabular-nums">
                  {cnpjTax.available ? formatCurrency(cnpjTax.rbt12) : '—'}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>FS12 (Folha de Pagamento 12 Meses):</span>
                <span data-testid="pj-fs12" className="font-bold text-slate-700 font-mono tabular-nums">
                  {cnpjTax.available ? formatCurrency(cnpjTax.fs12) : '—'}
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
              <span className="text-sm font-bold text-emerald-800 font-mono">{formatCurrency(cpfTaxAmountDisplayed)}</span>
            </div>
            <div className="text-slate-300 text-base font-bold">+</div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-medium">DAS Simples (PJ)</span>
              <span className="text-sm font-bold text-blue-800 font-mono">
                {cnpjTax.available ? formatCurrency(cnpjTax.dasEstimated) : '—'}
              </span>
            </div>
            <div className="text-slate-300 text-base font-bold">=</div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total Estimado</span>
              <span className="text-base font-black text-slate-900 font-mono">{formatCurrency(totalTaxesEstimated)}</span>
            </div>
          </div>
        </div>
      </div>

      {hybridSavings && (
        <HybridSavingsCard savings={hybridSavings} monthLabel={dueCompetenceLabel} isProjected={isCpfProjected} />
      )}

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
      <LivroCaixaExcessModal
        isOpen={isExcessModalOpen}
        onClose={() => setIsExcessModalOpen(false)}
        year={dueCompetenceYear}
        history={livroCaixaHistory}
        canManage={canManageExcessMonths}
        onToggleMonth={handleToggleExcessMonth}
      />
    </div>
  );
};
