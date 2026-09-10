import React from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { formatCurrency } from '../../lib/masks';

export const MONTHS_LIST = [
  { value: 'ALL' as const, label: 'Ano Inteiro (Todos os Meses)', short: 'Todos' },
  { value: 1, label: '01 - Janeiro', short: 'Jan' },
  { value: 2, label: '02 - Fevereiro', short: 'Fev' },
  { value: 3, label: '03 - Março', short: 'Mar' },
  { value: 4, label: '04 - Abril', short: 'Abr' },
  { value: 5, label: '05 - Maio', short: 'Mai' },
  { value: 6, label: '06 - Junho', short: 'Jun' },
  { value: 7, label: '07 - Julho', short: 'Jul' },
  { value: 8, label: '08 - Agosto', short: 'Ago' },
  { value: 9, label: '09 - Setembro', short: 'Set' },
  { value: 10, label: '10 - Outubro', short: 'Out' },
  { value: 11, label: '11 - Novembro', short: 'Nov' },
  { value: 12, label: '12 - Dezembro', short: 'Dez' },
];

export const YEARS_LIST = [2024, 2025, 2026, 2027];

interface PeriodFilterBarProps {
  selectedYear: number;
  selectedMonth: number | 'ALL';
  onChangePeriod: (year: number, month: number | 'ALL') => void;
  periodSalesValue?: number;
  periodSalesCount?: number;
  periodExpensesValue?: number;
  periodExpensesCount?: number;
  periodReceivablesValue?: number;
}

export const PeriodFilterBar: React.FC<PeriodFilterBarProps> = ({
  selectedYear,
  selectedMonth,
  onChangePeriod,
  periodSalesValue = 0,
  periodSalesCount = 0,
  periodExpensesValue = 0,
  periodExpensesCount = 0,
  periodReceivablesValue = 0,
}) => {
  const currentMonthObj =
    typeof selectedMonth === 'number'
      ? MONTHS_LIST.find((m) => m.value === selectedMonth)
      : MONTHS_LIST[0];

  const handlePrevMonth = () => {
    if (selectedMonth === 'ALL') {
      onChangePeriod(selectedYear, 12);
      return;
    }
    if (selectedMonth === 1) {
      onChangePeriod(selectedYear - 1, 12);
    } else {
      onChangePeriod(selectedYear, selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 'ALL') {
      onChangePeriod(selectedYear, 1);
      return;
    }
    if (selectedMonth === 12) {
      onChangePeriod(selectedYear + 1, 1);
    } else {
      onChangePeriod(selectedYear, selectedMonth + 1);
    }
  };

  const isDemoMonth = selectedYear === 2025 && selectedMonth === 5;

  const netBalance = periodSalesValue - periodExpensesValue;

  return (
    <div className="sticky top-[61px] z-20 bg-slate-900 text-white border-b border-slate-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Left Side: Period Selectors */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-teal-400 font-bold text-xs uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filtro Global:</span>
          </div>

          {/* Stepper buttons */}
          <div className="flex items-center rounded-lg bg-slate-800 border border-slate-700 p-0.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              title="Mês Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-bold text-slate-200 select-none min-w-[70px] text-center">
              {currentMonthObj?.short || 'Todos'} / {selectedYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              title="Próximo Mês"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Month Dropdown */}
          <select
            value={selectedMonth}
            onChange={(e) => {
              const val = e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value, 10);
              onChangePeriod(selectedYear, val);
            }}
            className="text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 text-white p-1.5 sm:p-2 focus:ring-2 focus:ring-teal-400 focus:outline-none cursor-pointer"
          >
            {MONTHS_LIST.map((m) => (
              <option key={String(m.value)} value={m.value} className="bg-slate-900 text-white">
                {m.label}
              </option>
            ))}
          </select>

          {/* Year Dropdown */}
          <select
            value={selectedYear}
            onChange={(e) => onChangePeriod(parseInt(e.target.value, 10), selectedMonth)}
            className="text-xs font-bold rounded-lg border border-slate-700 bg-slate-800 text-white p-1.5 sm:p-2 focus:ring-2 focus:ring-teal-400 focus:outline-none cursor-pointer"
          >
            {YEARS_LIST.map((y) => (
              <option key={y} value={y} className="bg-slate-900 text-white">
                Ano {y}
              </option>
            ))}
          </select>

          {/* Quick reset to Demo Base if not on May 2025 */}
          {!isDemoMonth && (
            <button
              type="button"
              onClick={() => onChangePeriod(2025, 5)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-teal-300 bg-teal-950/70 hover:bg-teal-900 border border-teal-700/60 transition-colors cursor-pointer"
              title="Voltar para Maio/2025 (onde estão concentrados os lançamentos cadastrados)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Base Maio/2025</span>
            </button>
          )}
        </div>

        {/* Right Side: Reactive Period Summary Indicators */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs w-full md:w-auto justify-start md:justify-end">
          {/* Receitas Badge */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80"
            title={`Total de Receitas no período (${periodSalesCount} vendas)`}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span className="text-slate-400">Receitas:</span>
            <span className="font-bold text-emerald-400">{formatCurrency(periodSalesValue)}</span>
            <span className="text-[10px] text-slate-500">({periodSalesCount})</span>
          </div>

          {/* Despesas Badge */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/90 border border-slate-700/80"
            title={`Total de Despesas no período (${periodExpensesCount} despesas)`}
          >
            <div className="w-2 h-2 rounded-full bg-rose-400"></div>
            <span className="text-slate-400">Despesas:</span>
            <span className="font-bold text-rose-400">{formatCurrency(periodExpensesValue)}</span>
            <span className="text-[10px] text-slate-500">({periodExpensesCount})</span>
          </div>

          {/* Saldo do Período */}
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold ${
              netBalance >= 0
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                : 'bg-rose-950/60 text-rose-300 border-rose-800/60'
            }`}
            title="Saldo Operacional do período filtrado (Receitas - Despesas)"
          >
            {netBalance >= 0 ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span className="text-slate-300 font-normal">Saldo:</span>
            <span className="font-bold">{formatCurrency(netBalance)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
