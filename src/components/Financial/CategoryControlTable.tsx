import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Info,
  Layers,
} from 'lucide-react';
import { CategoryAnnualControlItem } from '../../types/financial';

interface CategoryControlTableProps {
  categoriesData: CategoryAnnualControlItem[];
  year: number;
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const CategoryControlTable: React.FC<CategoryControlTableProps> = ({
  categoriesData,
  year,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'WITH_TRANSACTIONS' | 'PENDING_PAYMENT'>('ALL');
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  // Unique groups
  const groupsList = useMemo(() => {
    const map = new Map<string, string>();
    categoriesData.forEach((c) => {
      if (!map.has(c.groupCode)) {
        map.set(c.groupCode, c.groupName);
      }
    });
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [categoriesData]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    return categoriesData.filter((c) => {
      if (selectedGroup !== 'ALL' && c.groupCode !== selectedGroup) return false;

      if (filterType === 'WITH_TRANSACTIONS' && c.totalCompetence === 0 && c.totalPaid === 0) {
        return false;
      }

      if (filterType === 'PENDING_PAYMENT' && c.totalToPay === 0) {
        return false;
      }

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        return (
          c.name.toLowerCase().includes(query) ||
          c.code.toLowerCase().includes(query) ||
          c.groupName.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [categoriesData, selectedGroup, filterType, searchTerm]);

  // Overall totals
  const totals = useMemo(() => {
    return categoriesData.reduce(
      (acc, c) => ({
        competence: acc.competence + c.totalCompetence,
        paid: acc.paid + c.totalPaid,
        toPay: acc.toPay + c.totalToPay,
        overdue: acc.overdue + c.totalOverdue,
      }),
      { competence: 0, paid: 0, toPay: 0, overdue: 0 }
    );
  }, [categoriesData]);

  return (
    <div className="space-y-4">
      {/* KPI Cards for Categories Control */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Lançado (DRE Competência)
          </span>
          <div className="text-xl font-black text-slate-900 mt-1">
            {formatCurrency(totals.competence)}
          </div>
          <span className="text-[11px] text-slate-500">
            Ano {year} • Realização dos procedimentos e compras
          </span>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-emerald-200 shadow-sm bg-emerald-50/20">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Total Pago (Caixa Realizado)
          </span>
          <div className="text-xl font-black text-emerald-900 mt-1">
            {formatCurrency(totals.paid)}
          </div>
          <span className="text-[11px] text-emerald-700">
            {totals.competence > 0
              ? `${((totals.paid / totals.competence) * 100).toFixed(1)}% do total lançado`
              : 'Sem lançamentos'}
          </span>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-blue-200 shadow-sm bg-blue-50/20">
          <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            Total a Pagar (Previsto)
          </span>
          <div className="text-xl font-black text-blue-900 mt-1">
            {formatCurrency(totals.toPay)}
          </div>
          <span className="text-[11px] text-blue-700">
            Compromissos agendados no fluxo futuro
          </span>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-rose-200 shadow-sm bg-rose-50/20">
          <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Contas Vencidas
          </span>
          <div className="text-xl font-black text-rose-900 mt-1">
            {formatCurrency(totals.overdue)}
          </div>
          <span className="text-[11px] text-rose-700">
            {totals.overdue > 0 ? 'Exige regularização imediata' : 'Nenhuma conta vencida'}
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar categoria ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
            />
          </div>

          {/* Group Filter */}
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="ALL">Todos os Grupos Operacionais</option>
            {groupsList.map((g) => (
              <option key={g.code} value={g.code}>
                {g.name.startsWith(g.code) ? g.name : `${g.code} - ${g.name}`}
              </option>
            ))}
          </select>

          {/* Transaction status filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white"
          >
            <option value="ALL">Todas as Categorias Cadastradas</option>
            <option value="WITH_TRANSACTIONS">Apenas com Movimentação no Ano</option>
            <option value="PENDING_PAYMENT">Apenas com Valores a Pagar</option>
          </select>
        </div>

        <span className="text-xs text-slate-500 font-medium">
          {filteredCategories.length} categorias listadas
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white font-semibold divide-x divide-slate-800">
                <th className="p-3 w-72">Código & Nome da Categoria</th>
                <th className="p-3 w-40">Grupo Contábil</th>
                <th className="p-3 text-right w-28">Total Lançado (DRE)</th>
                <th className="p-3 text-right w-28 text-emerald-400">Total Pago (Caixa)</th>
                <th className="p-3 text-right w-28 text-blue-400">A Pagar (Previsto)</th>
                <th className="p-3 text-center w-36">Progresso de Quitação</th>
                <th className="p-3 text-center w-32">Atributos Fiscais</th>
                <th className="p-3 text-center w-16">Ação</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    Nenhuma categoria encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((cat) => {
                  const isExpanded = expandedCategoryId === cat.id;
                  const percentPaid =
                    cat.totalCompetence > 0
                      ? Math.min(100, (cat.totalPaid / cat.totalCompetence) * 100)
                      : cat.totalPaid > 0
                      ? 100
                      : 0;

                  return (
                    <React.Fragment key={cat.id}>
                      <tr
                        onClick={() =>
                          setExpandedCategoryId(isExpanded ? null : cat.id)
                        }
                        className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                          isExpanded ? 'bg-slate-50 font-medium' : ''
                        }`}
                      >
                        <td className="p-3 text-slate-900 font-medium flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedCategoryId(isExpanded ? null : cat.id);
                            }}
                            className="p-1 hover:bg-slate-200 rounded text-slate-500"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <div>
                            <div className="font-semibold text-slate-900">{cat.name}</div>
                            <span className="font-mono text-[10px] text-slate-400">
                              {cat.code}
                            </span>
                          </div>
                        </td>

                        <td className="p-3 text-slate-600 truncate max-w-[160px]">
                          {cat.groupName}
                        </td>

                        <td className="p-3 text-right font-bold text-slate-900">
                          {cat.totalCompetence > 0 ? formatCurrency(cat.totalCompetence) : '-'}
                        </td>

                        <td className="p-3 text-right font-bold text-emerald-700 bg-emerald-50/10">
                          {cat.totalPaid > 0 ? formatCurrency(cat.totalPaid) : '-'}
                        </td>

                        <td className="p-3 text-right font-bold text-blue-700 bg-blue-50/10">
                          {cat.totalToPay > 0 ? formatCurrency(cat.totalToPay) : '-'}
                        </td>

                        <td className="p-3 text-center">
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${
                                percentPaid >= 100
                                  ? 'bg-emerald-500'
                                  : percentPaid > 0
                                  ? 'bg-amber-500'
                                  : 'bg-slate-200'
                              }`}
                              style={{ width: `${percentPaid}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500 mt-1 block">
                            {percentPaid.toFixed(0)}% pago
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {cat.dedutivelLivroCaixaPf === 'SIM' && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold" title="Dedutível no Livro Caixa (PF)">
                                LC-SIM
                              </span>
                            )}
                            {cat.dedutivelLivroCaixaPf === 'CONDICIONAL' && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold" title="Dedução condicional no Livro Caixa">
                                COND
                              </span>
                            )}
                            {cat.impactaFatorRPj && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold" title="Impacta no Fator R da folha de salários PJ">
                                FATOR-R
                              </span>
                            )}
                            {cat.despesaOperacionalPj && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-bold" title="Despesa operacional PJ">
                                OP-PJ
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedCategoryId(isExpanded ? null : cat.id);
                            }}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px]"
                          >
                            {isExpanded ? 'Ocultar' : 'Mês a Mês'}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable 12-Month breakdown for this Category */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 border-y border-slate-200">
                          <td colSpan={8} className="p-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-inner space-y-3">
                              <div className="flex items-center justify-between">
                                <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                  <Layers className="w-4 h-4 text-teal-600" />
                                  Visão Mês a Mês da Categoria {cat.code} - {cat.name} ({year})
                                </h5>
                                <span className="text-[11px] text-slate-500">
                                  {cat.countTransactions} lançamentos vinculados no ano
                                </span>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                                      <th className="p-2 w-36">Visão</th>
                                      {MONTH_LABELS.map((m) => (
                                        <th key={m} className="p-2 text-right">
                                          {m}
                                        </th>
                                      ))}
                                      <th className="p-2 text-right bg-slate-200 font-bold">
                                        Total Ano
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    <tr>
                                      <td className="p-2 font-semibold text-slate-800">
                                        Lançado (Competência / DRE)
                                      </td>
                                      {cat.monthsCompetence.map((val, idx) => (
                                        <td key={idx} className="p-2 text-right text-slate-700">
                                          {val > 0 ? formatCurrency(val) : '-'}
                                        </td>
                                      ))}
                                      <td className="p-2 text-right font-black text-slate-900 bg-slate-50">
                                        {formatCurrency(cat.totalCompetence)}
                                      </td>
                                    </tr>

                                    <tr className="bg-emerald-50/20">
                                      <td className="p-2 font-semibold text-emerald-800">
                                        Pago (Caixa Realizado)
                                      </td>
                                      {cat.monthsPaid.map((val, idx) => (
                                        <td
                                          key={idx}
                                          className="p-2 text-right font-medium text-emerald-700"
                                        >
                                          {val > 0 ? formatCurrency(val) : '-'}
                                        </td>
                                      ))}
                                      <td className="p-2 text-right font-black text-emerald-900 bg-emerald-50">
                                        {formatCurrency(cat.totalPaid)}
                                      </td>
                                    </tr>

                                    <tr className="bg-blue-50/20">
                                      <td className="p-2 font-semibold text-blue-800">
                                        A Pagar (Previsto)
                                      </td>
                                      {cat.monthsToPay.map((val, idx) => (
                                        <td
                                          key={idx}
                                          className="p-2 text-right font-medium text-blue-700"
                                        >
                                          {val > 0 ? formatCurrency(val) : '-'}
                                        </td>
                                      ))}
                                      <td className="p-2 text-right font-black text-blue-900 bg-blue-50">
                                        {formatCurrency(cat.totalToPay)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
