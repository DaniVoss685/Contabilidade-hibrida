import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { AnnualCashFlowSummary, CashFlowDisplayMode } from '../../types/financial';
import { getOperationalGroup } from '../../lib/chartOfAccountsData';

interface CashFlowTableProps {
  data: AnnualCashFlowSummary;
  displayMode: CashFlowDisplayMode;
  onDisplayModeChange: (mode: CashFlowDisplayMode) => void;
  onSelectMonth?: (monthIndex: number) => void;
}

export const CashFlowTable: React.FC<CashFlowTableProps> = ({
  data,
  displayMode,
  onDisplayModeChange,
  onSelectMonth,
}) => {
  const [expandInflows, setExpandInflows] = useState(true);
  const [expandOutflows, setExpandOutflows] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    '01': true,
    '02': true,
    '04': true,
  });

  const toggleGroup = (groupCode: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupCode]: !prev[groupCode],
    }));
  };

  const expandAll = () => {
    setExpandInflows(true);
    setExpandOutflows(true);
    const allGroups: Record<string, boolean> = {};
    data.allExpenseGroups.forEach((g) => {
      allGroups[g.code] = true;
    });
    setExpandedGroups(allGroups);
  };

  const collapseAll = () => {
    setExpandInflows(false);
    setExpandOutflows(false);
    setExpandedGroups({});
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  const getInflowValue = (
    item: { realized: number; projected: number; total: number } | undefined
  ) => {
    if (!item) return 0;
    if (displayMode === 'REALIZED_ONLY') return item.realized;
    if (displayMode === 'PROJECTED_ONLY') return item.projected;
    return item.total;
  };

  const getOutflowValue = (
    item: { realized: number; projected: number; total: number } | undefined
  ) => {
    if (!item) return 0;
    if (displayMode === 'REALIZED_ONLY') return item.realized;
    if (displayMode === 'PROJECTED_ONLY') return item.projected;
    return item.total;
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Visão:
          </span>
          <div className="inline-flex rounded-xl border border-slate-200/80 p-0.5 bg-slate-100/80 text-xs font-medium">
            <button
              onClick={() => onDisplayModeChange('ALL')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                displayMode === 'ALL'
                  ? 'bg-white text-slate-900 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Realizado + Previsto
            </button>
            <button
              onClick={() => onDisplayModeChange('REALIZED_ONLY')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                displayMode === 'REALIZED_ONLY'
                  ? 'bg-white text-emerald-800 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Apenas Realizado
            </button>
            <button
              onClick={() => onDisplayModeChange('PROJECTED_ONLY')}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                displayMode === 'PROJECTED_ONLY'
                  ? 'bg-white text-blue-800 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Apenas Previsto
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shadow-2xs cursor-pointer transition-colors"
          >
            Expandir Tudo
          </button>
          <button
            onClick={collapseAll}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shadow-2xs cursor-pointer transition-colors"
          >
            Recolher Tudo
          </button>
        </div>
      </div>

      {/* Main Month-by-Month Side-by-Side Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-xs text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50/95 text-slate-600 font-semibold border-b border-slate-200/90 divide-x divide-slate-200/70 text-[11px] uppercase tracking-wider">
                <th className="p-3 w-72 sticky left-0 z-20 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)] text-slate-700 font-bold">
                  Conta / Indicador de Caixa
                </th>
                {data.months.map((m) => (
                  <th
                    key={m.monthKey}
                    onClick={() => onSelectMonth && onSelectMonth(m.monthIndex)}
                    className="p-2.5 text-right w-24 hover:bg-slate-100/80 cursor-pointer transition-colors"
                  >
                    <div className="font-bold text-slate-800">{m.monthLabel}</div>
                    <div className="text-[10px] font-normal text-slate-400 lowercase">
                      {m.monthKey.substring(5, 7)}/{data.year}
                    </div>
                  </th>
                ))}
                <th className="p-3 text-right w-28 bg-slate-100/90 font-bold text-teal-800 border-l border-slate-200">
                  Total {data.year}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-sans">
              {/* ============================================================ */}
              {/* 1. ENTRADAS DE CAIXA (INFLOWS)                               */}
              {/* ============================================================ */}
              <tr className="bg-emerald-50/80 font-bold text-emerald-950 hover:bg-emerald-100/70 transition-colors">
                <td className="p-2.5 sticky left-0 z-10 bg-emerald-50/90 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandInflows(!expandInflows)}
                      className="p-0.5 hover:bg-emerald-200 rounded text-emerald-800"
                    >
                      {expandInflows ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <ArrowUpRight className="w-4 h-4 text-emerald-700" />
                    <span>(+) ENTRADAS DE CAIXA</span>
                  </div>
                </td>
                {data.months.map((m) => {
                  const val =
                    displayMode === 'REALIZED_ONLY'
                      ? m.realizedInflow
                      : displayMode === 'PROJECTED_ONLY'
                      ? m.projectedInflow
                      : m.totalInflow;
                  return (
                    <td key={m.monthKey} className="p-2.5 text-right font-bold text-emerald-900">
                      {formatCurrency(val)}
                    </td>
                  );
                })}
                <td className="p-2.5 text-right font-black text-emerald-900 bg-emerald-100/60">
                  {formatCurrency(
                    displayMode === 'REALIZED_ONLY'
                      ? data.totalRealizedInflow
                      : displayMode === 'PROJECTED_ONLY'
                      ? data.totalProjectedInflow
                      : data.totalInflow
                  )}
                </td>
              </tr>

              {/* Sub-rows for Inflows */}
              {expandInflows && (
                <>
                  {/* Realized Inflow sub-row */}
                  {(displayMode === 'ALL' || displayMode === 'REALIZED_ONLY') && (
                    <tr className="bg-emerald-50/20 text-slate-700 hover:bg-emerald-50/40">
                      <td className="p-2 pl-9 sticky left-0 z-10 bg-white/95 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-slate-600">
                        • Recebimentos Realizados (Efetivados)
                      </td>
                      {data.months.map((m) => (
                        <td key={m.monthKey} className="p-2 text-right text-emerald-700 font-medium">
                          {formatCurrency(m.realizedInflow)}
                        </td>
                      ))}
                      <td className="p-2 text-right font-bold text-emerald-800 bg-slate-50">
                        {formatCurrency(data.totalRealizedInflow)}
                      </td>
                    </tr>
                  )}

                  {/* Projected Inflow sub-row */}
                  {(displayMode === 'ALL' || displayMode === 'PROJECTED_ONLY') && (
                    <tr className="bg-blue-50/20 text-slate-700 hover:bg-blue-50/40">
                      <td className="p-2 pl-9 sticky left-0 z-10 bg-white/95 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-slate-600">
                        • Recebimentos Previstos (Contas a Receber)
                      </td>
                      {data.months.map((m) => (
                        <td key={m.monthKey} className="p-2 text-right text-blue-700 font-medium">
                          {formatCurrency(m.projectedInflow)}
                        </td>
                      ))}
                      <td className="p-2 text-right font-bold text-blue-800 bg-slate-50">
                        {formatCurrency(data.totalProjectedInflow)}
                      </td>
                    </tr>
                  )}

                  {/* Origin CPF vs CNPJ breakdown */}
                  <tr className="text-[11px] text-slate-500 bg-slate-50/40 font-medium">
                    <td className="p-1.5 pl-12 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      └ Particular PF (Carnê-Leão)
                    </td>
                    {data.months.map((m) => {
                      const v =
                        displayMode === 'REALIZED_ONLY'
                          ? m.inflowByOrigin.cpfRealized
                          : displayMode === 'PROJECTED_ONLY'
                          ? m.inflowByOrigin.cpfProjected
                          : m.inflowByOrigin.cpfRealized + m.inflowByOrigin.cpfProjected;
                      return (
                        <td key={m.monthKey} className="p-1.5 text-right">
                          {formatCurrency(v)}
                        </td>
                      );
                    })}
                    <td className="p-1.5 text-right font-semibold bg-slate-100/50">
                      {formatCurrency(
                        data.months.reduce((acc, m) => {
                          const v =
                            displayMode === 'REALIZED_ONLY'
                              ? m.inflowByOrigin.cpfRealized
                              : displayMode === 'PROJECTED_ONLY'
                              ? m.inflowByOrigin.cpfProjected
                              : m.inflowByOrigin.cpfRealized + m.inflowByOrigin.cpfProjected;
                          return acc + v;
                        }, 0)
                      )}
                    </td>
                  </tr>

                  <tr className="text-[11px] text-slate-500 bg-slate-50/40 font-medium">
                    <td className="p-1.5 pl-12 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      └ Clínica PJ (NFS-e / Convênios)
                    </td>
                    {data.months.map((m) => {
                      const v =
                        displayMode === 'REALIZED_ONLY'
                          ? m.inflowByOrigin.cnpjRealized
                          : displayMode === 'PROJECTED_ONLY'
                          ? m.inflowByOrigin.cnpjProjected
                          : m.inflowByOrigin.cnpjRealized + m.inflowByOrigin.cnpjProjected;
                      return (
                        <td key={m.monthKey} className="p-1.5 text-right">
                          {formatCurrency(v)}
                        </td>
                      );
                    })}
                    <td className="p-1.5 text-right font-semibold bg-slate-100/50">
                      {formatCurrency(
                        data.months.reduce((acc, m) => {
                          const v =
                            displayMode === 'REALIZED_ONLY'
                              ? m.inflowByOrigin.cnpjRealized
                              : displayMode === 'PROJECTED_ONLY'
                              ? m.inflowByOrigin.cnpjProjected
                              : m.inflowByOrigin.cnpjRealized + m.inflowByOrigin.cnpjProjected;
                          return acc + v;
                        }, 0)
                      )}
                    </td>
                  </tr>
                </>
              )}

              {/* ============================================================ */}
              {/* 2. SAÍDAS DE CAIXA (OUTFLOWS)                                */}
              {/* ============================================================ */}
              <tr className="bg-rose-50/80 font-bold text-rose-950 hover:bg-rose-100/70 transition-colors">
                <td className="p-2.5 sticky left-0 z-10 bg-rose-50/90 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandOutflows(!expandOutflows)}
                      className="p-0.5 hover:bg-rose-200 rounded text-rose-800"
                    >
                      {expandOutflows ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <ArrowDownRight className="w-4 h-4 text-rose-700" />
                    <span>(-) SAÍDAS DE CAIXA</span>
                  </div>
                </td>
                {data.months.map((m) => {
                  const val =
                    displayMode === 'REALIZED_ONLY'
                      ? m.realizedOutflow
                      : displayMode === 'PROJECTED_ONLY'
                      ? m.projectedOutflow
                      : m.totalOutflow;
                  return (
                    <td key={m.monthKey} className="p-2.5 text-right font-bold text-rose-900">
                      {formatCurrency(val)}
                    </td>
                  );
                })}
                <td className="p-2.5 text-right font-black text-rose-900 bg-rose-100/60">
                  {formatCurrency(
                    displayMode === 'REALIZED_ONLY'
                      ? data.totalRealizedOutflow
                      : displayMode === 'PROJECTED_ONLY'
                      ? data.totalProjectedOutflow
                      : data.totalOutflow
                  )}
                </td>
              </tr>

              {/* Sub-rows for Outflows by Groups of Chart of Accounts */}
              {expandOutflows &&
                data.allExpenseGroups.map((group) => {
                  const isGroupExpanded = expandedGroups[group.code];
                  const groupCats = data.allExpenseCategories.filter(
                    (c) => c.groupCode === group.code
                  );

                  return (
                    <React.Fragment key={group.code}>
                      {/* Group Header Row */}
                      <tr className="bg-slate-50/70 hover:bg-slate-100/70 transition-colors font-medium">
                        <td className="p-2 pl-6 sticky left-0 z-10 bg-white/95 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-slate-800 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => toggleGroup(group.code)}
                              className="p-0.5 hover:bg-slate-200 rounded text-slate-600"
                            >
                              {isGroupExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </button>
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800">
                                {group.name.startsWith(group.code)
                                  ? group.name
                                  : `${group.code} - ${group.name}`}
                              </span>
                              <span className="text-[10px] text-slate-400 font-normal">
                                {getOperationalGroup(group.code).description}
                              </span>
                            </div>
                          </div>
                        </td>
                        {data.months.map((m) => {
                          const gVal = getOutflowValue(m.outflowByGroup[group.code]);
                          return (
                            <td key={m.monthKey} className="p-2 text-right text-slate-700">
                              {gVal > 0 ? formatCurrency(gVal) : '-'}
                            </td>
                          );
                        })}
                        <td className="p-2 text-right font-bold text-slate-900 bg-slate-50">
                          {formatCurrency(
                            data.months.reduce(
                              (acc, m) => acc + getOutflowValue(m.outflowByGroup[group.code]),
                              0
                            )
                          )}
                        </td>
                      </tr>

                      {/* Categories inside this Group */}
                      {isGroupExpanded &&
                        groupCats.map((cat) => {
                          const hasAnyVal = data.months.some(
                            (m) => getOutflowValue(m.outflowByCategory[cat.id]) > 0
                          );
                          if (!hasAnyVal) return null;

                          return (
                            <tr
                              key={cat.id}
                              className="text-[11px] text-slate-600 bg-white hover:bg-slate-50"
                            >
                              <td className="p-1.5 pl-12 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] truncate max-w-[280px]">
                                <span className="font-mono text-[10px] text-slate-400 mr-1.5">
                                  {cat.code}
                                </span>
                                {cat.name}
                              </td>
                              {data.months.map((m) => {
                                const cVal = getOutflowValue(m.outflowByCategory[cat.id]);
                                return (
                                  <td key={m.monthKey} className="p-1.5 text-right text-slate-600">
                                    {cVal > 0 ? formatCurrency(cVal) : '-'}
                                  </td>
                                );
                              })}
                              <td className="p-1.5 text-right font-semibold text-slate-800 bg-slate-50">
                                {formatCurrency(
                                  data.months.reduce(
                                    (acc, m) =>
                                      acc + getOutflowValue(m.outflowByCategory[cat.id]),
                                    0
                                  )
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                })}

              {/* ============================================================ */}
              {/* 3. GERAÇÃO LÍQUIDA DE CAIXA (NET CASH FLOW)                   */}
              {/* ============================================================ */}
              <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <td className="p-3 sticky left-0 z-10 bg-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-teal-700" />
                  <span>(=) GERAÇÃO LÍQUIDA DE CAIXA DO MÊS</span>
                </td>
                {data.months.map((m) => {
                  const netVal =
                    displayMode === 'REALIZED_ONLY'
                      ? m.netRealized
                      : displayMode === 'PROJECTED_ONLY'
                      ? m.netProjected
                      : m.netCashFlow;
                  const isPositive = netVal >= 0;
                  return (
                    <td
                      key={m.monthKey}
                      className={`p-3 text-right font-black ${
                        isPositive ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatCurrency(netVal)}
                    </td>
                  );
                })}
                <td
                  className={`p-3 text-right font-black bg-slate-200 text-sm ${
                    data.netTotalCashFlow >= 0 ? 'text-emerald-800' : 'text-rose-800'
                  }`}
                >
                  {formatCurrency(data.netTotalCashFlow)}
                </td>
              </tr>

              {/* Saldo Inicial */}
              <tr className="bg-slate-50/70 text-slate-600 font-medium">
                <td className="p-2 pl-6 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  Saldo Inicial de Caixa (Contas Bancárias)
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-2 text-right font-medium text-slate-700">
                    {formatCurrency(m.initialBalance)}
                  </td>
                ))}
                <td className="p-2 text-right font-bold text-slate-700 bg-slate-100">
                  {formatCurrency(data.initialBalanceYear)}
                </td>
              </tr>

              {/* Saldo Final de Caixa */}
              <tr className="bg-teal-900 text-white font-black text-xs">
                <td className="p-3 sticky left-0 z-10 bg-teal-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                  (=) SALDO FINAL DE CAIXA ACUMULADO
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-3 text-right text-teal-200 font-bold">
                    {formatCurrency(m.finalBalance)}
                  </td>
                ))}
                <td className="p-3 text-right font-black bg-teal-950 text-emerald-400 text-sm">
                  {formatCurrency(data.finalBalanceYear)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
