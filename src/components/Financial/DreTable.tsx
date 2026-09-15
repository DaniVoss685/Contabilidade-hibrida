import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Percent,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Info,
} from 'lucide-react';
import { AnnualDreSummary } from '../../types/financial';
import { getOperationalGroup } from '../../lib/chartOfAccountsData';

interface DreTableProps {
  data: AnnualDreSummary;
  onSelectMonth?: (monthIndex: number) => void;
}

export const DreTable: React.FC<DreTableProps> = ({ data, onSelectMonth }) => {
  const [expandRevenue, setExpandRevenue] = useState(true);
  const [expandVariable, setExpandVariable] = useState(true);
  const [expandFixed, setExpandFixed] = useState(true);
  const [expandedFixedGroups, setExpandedFixedGroups] = useState<Record<string, boolean>>({
    '01': true,
    '02': true,
  });
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({
    'cat_01_01': true,
  });

  const toggleFixedGroup = (code: string) => {
    setExpandedFixedGroups((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const toggleCategory = (catId: string) => {
    setExpandedCats((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const expandAll = () => {
    setExpandRevenue(true);
    setExpandVariable(true);
    setExpandFixed(true);
    const all: Record<string, boolean> = {};
    data.allFixedGroups.forEach((g) => {
      all[g.code] = true;
    });
    setExpandedFixedGroups(all);
    const allCats: Record<string, boolean> = {};
    data.allExpenseCategories.forEach((c) => {
      allCats[c.id] = true;
    });
    setExpandedCats(allCats);
  };

  const collapseAll = () => {
    setExpandRevenue(false);
    setExpandVariable(false);
    setExpandFixed(false);
    setExpandedFixedGroups({});
    setExpandedCats({});
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
            <Percent className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">
              DRE Gerencial Anual (Regime de Competência)
            </h4>
            <p className="text-[11px] text-slate-500">
              Mês a mês lado a lado de acordo com a data de realização dos procedimentos e competência das despesas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50"
          >
            Expandir Tudo
          </button>
          <button
            onClick={collapseAll}
            className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50"
          >
            Recolher Tudo
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-xs text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-900 text-white font-semibold divide-x divide-slate-800">
                <th className="p-3 w-72 sticky left-0 z-20 bg-slate-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                  Conta / Rubrica Econômica
                </th>
                {data.months.map((m) => (
                  <th
                    key={m.monthKey}
                    onClick={() => onSelectMonth && onSelectMonth(m.monthIndex)}
                    className="p-2.5 text-right w-24 hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <div className="font-bold">{m.monthLabel}</div>
                    <div className="text-[10px] font-normal text-slate-400">
                      {m.monthKey.substring(5, 7)}/{data.year}
                    </div>
                  </th>
                ))}
                <th className="p-3 text-right w-28 bg-slate-950 font-bold text-teal-400">
                  Total {data.year}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-sans">
              {/* ============================================================ */}
              {/* 1. RECEITA BRUTA OPERACIONAL                                 */}
              {/* ============================================================ */}
              <tr className="bg-slate-50/90 font-bold text-slate-900 hover:bg-slate-100/80 transition-colors">
                <td className="p-2.5 sticky left-0 z-10 bg-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandRevenue(!expandRevenue)}
                      className="p-0.5 hover:bg-slate-200 rounded text-slate-700"
                    >
                      {expandRevenue ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span>(=) RECEITA BRUTA OPERACIONAL</span>
                  </div>
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right font-bold text-slate-900">
                    {formatCurrency(m.grossRevenue)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black text-slate-900 bg-slate-200">
                  {formatCurrency(data.totalGrossRevenue)}
                </td>
              </tr>

              {/* Sub-rows for Revenue */}
              {expandRevenue && (
                <>
                  <tr className="text-slate-600 bg-white hover:bg-slate-50">
                    <td className="p-2 pl-9 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      • Receita Operação CPF (Particular / Carnê-Leão)
                    </td>
                    {data.months.map((m) => (
                      <td key={m.monthKey} className="p-2 text-right text-slate-600 font-medium">
                        {formatCurrency(m.cpfGrossRevenue)}
                      </td>
                    ))}
                    <td className="p-2 text-right font-bold text-slate-700 bg-slate-50">
                      {formatCurrency(data.totalCpfGrossRevenue)}
                    </td>
                  </tr>

                  <tr className="text-slate-600 bg-white hover:bg-slate-50">
                    <td className="p-2 pl-9 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      • Receita Operação CNPJ (NFS-e / Convênios)
                    </td>
                    {data.months.map((m) => (
                      <td key={m.monthKey} className="p-2 text-right text-slate-600 font-medium">
                        {formatCurrency(m.cnpjGrossRevenue)}
                      </td>
                    ))}
                    <td className="p-2 text-right font-bold text-slate-700 bg-slate-50">
                      {formatCurrency(data.totalCnpjGrossRevenue)}
                    </td>
                  </tr>

                  {/* Procedures detail preview */}
                  {data.allProcedures.slice(0, 4).map((proc) => {
                    const hasVal = data.months.some((m) => (m.revenueByProcedure[proc] || 0) > 0);
                    if (!hasVal) return null;
                    return (
                      <tr key={proc} className="text-[11px] text-slate-500 bg-slate-50/30">
                        <td className="p-1.5 pl-12 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] truncate max-w-[280px]">
                          └ {proc}
                        </td>
                        {data.months.map((m) => (
                          <td key={m.monthKey} className="p-1.5 text-right">
                            {formatCurrency(m.revenueByProcedure[proc] || 0)}
                          </td>
                        ))}
                        <td className="p-1.5 text-right font-semibold bg-slate-100/50">
                          {formatCurrency(
                            data.months.reduce((acc, m) => acc + (m.revenueByProcedure[proc] || 0), 0)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}

              {/* ============================================================ */}
              {/* 2. DEDUÇÕES E TRIBUTOS DIRETOS                               */}
              {/* ============================================================ */}
              <tr className="text-rose-700 bg-rose-50/40 font-semibold hover:bg-rose-50/70">
                <td className="p-2.5 pl-6 sticky left-0 z-10 bg-rose-50/70 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                  (-) Tributos Diretos sobre Receita (DAS / Carnê-Leão)
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right text-rose-700 font-semibold">
                    - {formatCurrency(m.directTaxes)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-bold text-rose-800 bg-rose-100/60">
                  - {formatCurrency(data.totalDirectTaxes)}
                </td>
              </tr>

              {/* ============================================================ */}
              {/* 3. RECEITA LÍQUIDA OPERACIONAL                               */}
              {/* ============================================================ */}
              <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                <td className="p-2.5 sticky left-0 z-10 bg-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  (=) RECEITA LÍQUIDA OPERACIONAL
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right font-bold text-slate-900">
                    {formatCurrency(m.netRevenue)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black text-slate-900 bg-slate-200">
                  {formatCurrency(data.totalNetRevenue)}
                </td>
              </tr>

              {/* ============================================================ */}
              {/* 4. CUSTOS VARIÁVEIS / CPV (Insumos + Prótese)                */}
              {/* ============================================================ */}
              <tr className="bg-amber-50/60 text-amber-950 font-bold hover:bg-amber-100/60">
                <td className="p-2.5 sticky left-0 z-10 bg-amber-50/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandVariable(!expandVariable)}
                      className="p-0.5 hover:bg-amber-200 rounded text-amber-800"
                    >
                      {expandVariable ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span>(-) Custos Variáveis dos Procedimentos (CPV)</span>
                  </div>
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right font-bold text-amber-900">
                    - {formatCurrency(m.variableCosts)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black text-amber-900 bg-amber-100/60">
                  - {formatCurrency(data.totalVariableCosts)}
                </td>
              </tr>

              {expandVariable &&
                data.allVariableGroups.map((group) => {
                  const hasVal = data.months.some(
                    (m) => (m.variableCostsByGroup[group.code] || 0) > 0
                  );
                  if (!hasVal) return null;

                  const groupDef = getOperationalGroup(group.code);
                  const displayName = `${group.code} - ${groupDef.shortName || group.name.replace(/^\d+\s*-\s*/, '')}`;

                  return (
                    <tr key={group.code} className="text-[11px] text-slate-700 bg-white hover:bg-amber-50/40">
                      <td className="p-2 pl-9 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800">
                            • {displayName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {groupDef.description}
                          </span>
                        </div>
                      </td>
                      {data.months.map((m) => (
                        <td key={m.monthKey} className="p-2 text-right text-slate-700 font-medium">
                          {(m.variableCostsByGroup[group.code] || 0) > 0
                            ? `- ${formatCurrency(m.variableCostsByGroup[group.code] || 0)}`
                            : '-'}
                        </td>
                      ))}
                      <td className="p-2 text-right font-bold text-amber-950 bg-slate-50">
                        -{' '}
                        {formatCurrency(
                          data.months.reduce(
                            (acc, m) => acc + (m.variableCostsByGroup[group.code] || 0),
                            0
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}

              {/* ============================================================ */}
              {/* 5. MARGEM DE CONTRIBUIÇÃO / LUCRO BRUTO                       */}
              {/* ============================================================ */}
              <tr className="bg-emerald-50/50 font-black text-emerald-950 border-t border-b border-emerald-200">
                <td className="p-2.5 sticky left-0 z-10 bg-emerald-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center justify-between">
                  <span>(=) MARGEM DE CONTRIBUIÇÃO (LUCRO BRUTO)</span>
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right font-black text-emerald-900">
                    <div>{formatCurrency(m.contributionMargin)}</div>
                    <div className="text-[10px] font-medium text-emerald-700">
                      {m.contributionMarginPercent.toFixed(1)}%
                    </div>
                  </td>
                ))}
                <td className="p-2.5 text-right font-black text-emerald-900 bg-emerald-100/70">
                  <div>{formatCurrency(data.totalContributionMargin)}</div>
                  <div className="text-[10px] font-bold text-emerald-800">
                    {data.averageContributionMarginPercent.toFixed(1)}%
                  </div>
                </td>
              </tr>

              {/* ============================================================ */}
              {/* 6. DESPESAS OPERACIONAIS FIXAS & ADMINISTRATIVAS             */}
              {/* ============================================================ */}
              <tr className="bg-slate-50/90 font-bold text-slate-900 hover:bg-slate-100/80">
                <td className="p-2.5 sticky left-0 z-10 bg-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandFixed(!expandFixed)}
                      className="p-0.5 hover:bg-slate-200 rounded text-slate-700"
                    >
                      {expandFixed ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span>(-) Despesas Operacionais Fixas & Administrativas</span>
                  </div>
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right font-bold text-rose-800">
                    - {formatCurrency(m.fixedExpenses)}
                  </td>
                ))}
                <td className="p-2.5 text-right font-black text-rose-900 bg-slate-200">
                  - {formatCurrency(data.totalFixedExpenses)}
                </td>
              </tr>

              {/* Groups inside Fixed Expenses */}
              {expandFixed &&
                data.allFixedGroups.map((group) => {
                  const hasVal = data.months.some((m) => (m.fixedExpensesByGroup[group.code] || 0) > 0);
                  if (!hasVal) return null;

                  const isGroupExpanded = Boolean(expandedFixedGroups[group.code]);
                  const groupDef = getOperationalGroup(group.code);
                  const displayName = `${group.code} - ${groupDef.shortName || group.name.replace(/^\d+\s*-\s*/, '')}`;
                  const groupCats = data.allExpenseCategories.filter((c) => c.groupCode === group.code);

                  return (
                    <React.Fragment key={group.code}>
                      <tr className="text-[11px] text-slate-700 bg-slate-50/70 hover:bg-slate-100/70 font-medium">
                        <td className="p-2 pl-6 sticky left-0 z-10 bg-white/95 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleFixedGroup(group.code)}
                              className="p-0.5 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
                              title={isGroupExpanded ? 'Recolher subcategorias' : 'Expandir subcategorias'}
                            >
                              {isGroupExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                            </button>
                            <span className="font-semibold text-slate-800">
                              {displayName}
                            </span>
                          </div>
                        </td>
                        {data.months.map((m) => (
                          <td key={m.monthKey} className="p-2 text-right text-slate-600">
                            {(m.fixedExpensesByGroup[group.code] || 0) > 0
                              ? `- ${formatCurrency(m.fixedExpensesByGroup[group.code] || 0)}`
                              : '-'}
                          </td>
                        ))}
                        <td className="p-2 text-right font-bold text-slate-700 bg-slate-50">
                          -{' '}
                          {formatCurrency(
                            data.months.reduce((acc, m) => acc + (m.fixedExpensesByGroup[group.code] || 0), 0)
                          )}
                        </td>
                      </tr>

                      {/* Subcategorias do Grupo */}
                      {isGroupExpanded &&
                        groupCats.map((cat) => {
                          const hasCatVal = data.months.some(
                            (m) => (m.fixedExpensesByCategory[cat.id] || 0) > 0
                          );
                          if (!hasCatVal) return null;

                          const catItems = (data.allFixedItems || []).filter(
                            (it) => it.categoryId === cat.id
                          );
                          const isCatExpanded = Boolean(expandedCats[cat.id]);

                          return (
                            <React.Fragment key={cat.id}>
                              <tr className="text-[11px] text-slate-700 bg-white hover:bg-slate-50 font-medium">
                                <td className="p-1.5 pl-10 sticky left-0 z-10 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] truncate max-w-[280px]">
                                  <div className="flex items-center gap-1.5">
                                    {catItems.length > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleCategory(cat.id)}
                                        className="p-0.5 hover:bg-slate-200 rounded text-slate-500 cursor-pointer"
                                        title={isCatExpanded ? 'Recolher lançamentos' : 'Expandir lançamentos'}
                                      >
                                        {isCatExpanded ? (
                                          <ChevronDown className="w-2.5 h-2.5" />
                                        ) : (
                                          <ChevronRight className="w-2.5 h-2.5" />
                                        )}
                                      </button>
                                    ) : (
                                      <span className="w-3" />
                                    )}
                                    <span className="font-mono text-[10px] text-slate-400">
                                      {cat.code}
                                    </span>
                                    <span>{cat.name}</span>
                                  </div>
                                </td>
                                {data.months.map((m) => {
                                  const cVal = m.fixedExpensesByCategory[cat.id] || 0;
                                  return (
                                    <td key={m.monthKey} className="p-1.5 text-right text-slate-600">
                                      {cVal > 0 ? `- ${formatCurrency(cVal)}` : '-'}
                                    </td>
                                  );
                                })}
                                <td className="p-1.5 text-right font-semibold text-slate-800 bg-slate-50">
                                  -{' '}
                                  {formatCurrency(
                                    data.months.reduce(
                                      (acc, m) => acc + (m.fixedExpensesByCategory[cat.id] || 0),
                                      0
                                    )
                                  )}
                                </td>
                              </tr>

                              {/* Nível 3: Contas / Despesas individuais lançadas */}
                              {isCatExpanded &&
                                catItems.map((item) => {
                                  const hasItemVal = data.months.some(
                                    (m) => (m.fixedExpensesByItem?.[item.itemKey] || 0) > 0
                                  );
                                  if (!hasItemVal) return null;

                                  return (
                                    <tr
                                      key={item.itemKey}
                                      className="text-[10.5px] text-slate-500 bg-slate-50/60 hover:bg-slate-100/50"
                                    >
                                      <td className="p-1 pl-16 sticky left-0 z-10 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] truncate max-w-[280px]">
                                        <span className="text-slate-400 font-mono text-[9px] mr-1.5">└─</span>
                                        <span className="font-normal text-slate-600">{item.itemName}</span>
                                      </td>
                                      {data.months.map((m) => {
                                        const iVal = m.fixedExpensesByItem?.[item.itemKey] || 0;
                                        return (
                                          <td key={m.monthKey} className="p-1 text-right text-slate-500 font-mono">
                                            {iVal > 0 ? `- ${formatCurrency(iVal)}` : '-'}
                                          </td>
                                        );
                                      })}
                                      <td className="p-1 text-right font-medium text-slate-700 bg-slate-100/60 font-mono">
                                        -{' '}
                                        {formatCurrency(
                                          data.months.reduce(
                                            (acc, m) =>
                                              acc + (m.fixedExpensesByItem?.[item.itemKey] || 0),
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
                    </React.Fragment>
                  );
                })}

              {/* ============================================================ */}
              {/* 7. RESULTADO OPERACIONAL (EBITDA)                            */}
              {/* ============================================================ */}
              <tr className="bg-slate-100 font-bold text-slate-900 border-t border-slate-300">
                <td className="p-2.5 sticky left-0 z-10 bg-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  (=) RESULTADO OPERACIONAL (EBITDA)
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-2.5 text-right font-bold text-slate-900">
                    <div>{formatCurrency(m.ebitda)}</div>
                    <div className="text-[10px] text-slate-500 font-normal">
                      {m.ebitdaMarginPercent.toFixed(1)}%
                    </div>
                  </td>
                ))}
                <td className="p-2.5 text-right font-black text-slate-900 bg-slate-200">
                  <div>{formatCurrency(data.totalEbitda)}</div>
                  <div className="text-[10px] font-bold text-slate-600">
                    {data.totalGrossRevenue > 0
                      ? `${((data.totalEbitda / data.totalGrossRevenue) * 100).toFixed(1)}%`
                      : '0%'}
                  </div>
                </td>
              </tr>

              {/* ============================================================ */}
              {/* 8. RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO / PREJUÍZO LÍQUIDO)  */}
              {/* ============================================================ */}
              <tr className="bg-teal-900 text-white font-black text-xs">
                <td className="p-3 sticky left-0 z-10 bg-teal-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)]">
                  (=) RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO LÍQUIDO)
                </td>
                {data.months.map((m) => (
                  <td key={m.monthKey} className="p-3 text-right text-teal-100 font-bold">
                    <div className="text-sm">{formatCurrency(m.netResult)}</div>
                    <div className="text-[10px] text-teal-300 font-medium">
                      Margem {m.netMarginPercent.toFixed(1)}%
                    </div>
                  </td>
                ))}
                <td className="p-3 text-right font-black bg-teal-950 text-emerald-400 text-sm">
                  <div className="text-base">{formatCurrency(data.totalNetResult)}</div>
                  <div className="text-xs text-emerald-300">
                    Margem {data.averageNetMarginPercent.toFixed(1)}%
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
