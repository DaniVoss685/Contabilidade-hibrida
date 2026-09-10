import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { AnnualCashFlowSummary, AnnualDreSummary } from '../../types/financial';

interface ComparisonViewProps {
  cashFlow: AnnualCashFlowSummary;
  dre: AnnualDreSummary;
  year: number;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({ cashFlow, dre, year }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  // Find max value across months to scale bar charts
  const maxMonthValue = Math.max(
    ...dre.months.map((m) => Math.max(m.grossRevenue, m.netResult)),
    ...cashFlow.months.map((m) => Math.max(m.totalInflow, m.netCashFlow)),
    10000
  );

  return (
    <div className="space-y-6">
      {/* Educational Banner explaining the difference */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white rounded-2xl p-5 border border-teal-800/40 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-teal-400 font-semibold text-xs tracking-wider uppercase flex items-center gap-1.5">
              <Scale className="w-4 h-4" />
              Gestão Financeira Avançada
            </span>
            <h3 className="text-lg font-bold text-white">
              Por que o Caixa da clínica é diferente do Lucro da DRE?
            </h3>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              O <strong>Regime de Competência (DRE)</strong> registra os procedimentos e despesas no mês em que ocorreram,
              mostrando a verdadeira <em>rentabilidade econômica</em> da clínica. Já o <strong>Regime de Caixa</strong>{' '}
              acompanha o momento exato em que o dinheiro entrou ou saiu da conta bancária, considerando parcelamentos no cartão, boletos futuros e compras a prazo de insumos.
            </p>
          </div>

          <div className="flex flex-row md:flex-col gap-2 shrink-0">
            <div className="px-3 py-2 rounded-lg bg-teal-900/60 border border-teal-700/50 text-center">
              <span className="text-[10px] uppercase text-teal-300 font-bold block">
                Lucro DRE (Ano {year})
              </span>
              <span className="text-base font-black text-white">
                {formatCurrency(dre.totalNetResult)}
              </span>
            </div>
            <div className="px-3 py-2 rounded-lg bg-emerald-900/60 border border-emerald-700/50 text-center">
              <span className="text-[10px] uppercase text-emerald-300 font-bold block">
                Geração Líquida Caixa
              </span>
              <span className="text-base font-black text-emerald-300">
                {formatCurrency(cashFlow.netTotalCashFlow)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Side-by-Side Comparison Bars */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900">
            Comparativo Mês a Mês: Faturamento (DRE) vs Entradas de Caixa
          </h4>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-indigo-700">
              <span className="w-3 h-3 rounded-sm bg-indigo-600 inline-block" />
              Receita DRE (Competência)
            </span>
            <span className="flex items-center gap-1.5 text-teal-700">
              <span className="w-3 h-3 rounded-sm bg-teal-500 inline-block" />
              Entradas de Caixa
            </span>
          </div>
        </div>

        {/* 12-Month Mini Bar Chart */}
        <div className="grid grid-cols-12 gap-2 pt-4 border-t border-slate-100">
          {dre.months.map((m, idx) => {
            const cfMonth = cashFlow.months[idx];
            const dreHeight = (m.grossRevenue / maxMonthValue) * 120;
            const cfHeight = ((cfMonth?.totalInflow || 0) / maxMonthValue) * 120;

            return (
              <div key={m.monthKey} className="flex flex-col items-center gap-1">
                <div className="h-32 flex items-end justify-center gap-1 w-full">
                  {/* DRE bar */}
                  <div
                    style={{ height: `${Math.max(4, dreHeight)}px` }}
                    className="w-3 sm:w-4 bg-indigo-600 rounded-t-sm transition-all hover:bg-indigo-700"
                    title={`DRE ${m.monthLabel}: ${formatCurrency(m.grossRevenue)}`}
                  />
                  {/* Cash Flow bar */}
                  <div
                    style={{ height: `${Math.max(4, cfHeight)}px` }}
                    className="w-3 sm:w-4 bg-teal-500 rounded-t-sm transition-all hover:bg-teal-600"
                    title={`Caixa ${m.monthLabel}: ${formatCurrency(cfMonth?.totalInflow || 0)}`}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-600">{m.monthLabel}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side-by-Side Detailed Comparison Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Tabela de Confronto: Competência x Caixa (Ano {year})
          </h4>
        </div>
        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-xs text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-900 text-white font-semibold divide-x divide-slate-800">
                <th className="p-3 w-64 sticky left-0 z-20 bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                  Indicador
                </th>
                {dre.months.map((m) => (
                  <th key={m.monthKey} className="p-2.5 text-right w-24">
                    {m.monthLabel}
                  </th>
                ))}
                <th className="p-3 text-right w-28 bg-slate-950 font-bold text-teal-400">
                  Total {year}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-sans">
              {/* 1. Faturamento */}
              <tr className="bg-slate-50/50 font-bold text-slate-900">
                <td className="p-2.5 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  (1) Receita Bruta DRE
                </td>
                {dre.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right text-indigo-900">
                    {formatCurrency(m.grossRevenue)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black text-indigo-900 bg-slate-100">
                  {formatCurrency(dre.totalGrossRevenue)}
                </td>
              </tr>

              <tr className="text-slate-700 bg-white">
                <td className="p-2.5 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  (2) Entradas de Caixa
                </td>
                {cashFlow.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right text-teal-800 font-medium">
                    {formatCurrency(m.totalInflow)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-bold text-teal-900 bg-slate-50">
                  {formatCurrency(cashFlow.totalInflow)}
                </td>
              </tr>

              <tr className="text-[11px] bg-slate-50/80 font-semibold text-slate-500">
                <td className="p-1.5 pl-6 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  Δ Diferença (Caixa - DRE)
                </td>
                {dre.months.map((m, idx) => {
                  const diff = (cashFlow.months[idx]?.totalInflow || 0) - m.grossRevenue;
                  return (
                    <td
                      key={m.monthKey}
                      className={`p-1.5 text-right ${
                        diff >= 0 ? 'text-teal-700' : 'text-amber-700'
                      }`}
                    >
                      {formatCurrency(diff)}
                    </td>
                  );
                })}
                <td className="p-1.5 text-right font-bold text-slate-700 bg-slate-100">
                  {formatCurrency(cashFlow.totalInflow - dre.totalGrossRevenue)}
                </td>
              </tr>

              {/* 2. Despesas / Saídas */}
              <tr className="bg-slate-50/50 font-bold text-slate-900 border-t border-slate-200">
                <td className="p-2.5 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  (3) Custos + Despesas DRE
                </td>
                {dre.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right text-rose-800">
                    {formatCurrency(m.variableCosts + m.fixedExpenses)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black text-rose-900 bg-slate-100">
                  {formatCurrency(dre.totalVariableCosts + dre.totalFixedExpenses)}
                </td>
              </tr>

              <tr className="text-slate-700 bg-white">
                <td className="p-2.5 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  (4) Saídas Totais de Caixa
                </td>
                {cashFlow.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right text-rose-800 font-medium">
                    {formatCurrency(m.totalOutflow)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-bold text-rose-900 bg-slate-50">
                  {formatCurrency(cashFlow.totalOutflow)}
                </td>
              </tr>

              {/* 3. Lucro Líquido vs Geração de Caixa */}
              <tr className="bg-teal-50/80 font-black text-teal-950 border-t-2 border-teal-300">
                <td className="p-3 sticky left-0 z-10 bg-teal-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  Lucro Líquido DRE (Econômico)
                </td>
                {dre.months.map((m) => (
                  <td key={m.monthKey} className="p-3 text-right font-black text-teal-900">
                    {formatCurrency(m.netResult)}
                  </td>
                ))}
                <td className="p-3 text-right font-black text-teal-950 bg-teal-100">
                  {formatCurrency(dre.totalNetResult)}
                </td>
              </tr>

              <tr className="bg-emerald-50/80 font-black text-emerald-950">
                <td className="p-3 sticky left-0 z-10 bg-emerald-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  Geração Líquida Caixa (Financeiro)
                </td>
                {cashFlow.months.map((m) => (
                  <td key={m.monthKey} className="p-3 text-right font-black text-emerald-900">
                    {formatCurrency(m.netCashFlow)}
                  </td>
                ))}
                <td className="p-3 text-right font-black text-emerald-950 bg-emerald-100">
                  {formatCurrency(cashFlow.netTotalCashFlow)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
