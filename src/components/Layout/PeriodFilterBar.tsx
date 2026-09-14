import React from 'react';
import {
  RotateCcw,
} from 'lucide-react';
import { formatCurrency } from '../../lib/masks';
import { PeriodPicker } from '../UI';

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

const curSystemYear = new Date().getFullYear();
export const YEARS_LIST = [curSystemYear - 2, curSystemYear - 1, curSystemYear, curSystemYear + 1];

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
  const now = new Date();
  const currentSysYear = now.getFullYear();
  const currentSysMonth = now.getMonth() + 1;
  const isCurrentMonth = selectedYear === currentSysYear && selectedMonth === currentSysMonth;

  const netBalance = periodSalesValue - periodExpensesValue;

  return (
    <div className="sticky top-[49px] z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
        {/* Left Side: Unified Period Picker */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <PeriodPicker
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onChange={onChangePeriod}
            allowAllMonths={true}
          />

          {/* Quick return to Current Month if on another period */}
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => onChangePeriod(currentSysYear, currentSysMonth)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 transition-colors cursor-pointer"
              title="Ir para o mês atual"
            >
              <RotateCcw className="w-3 h-3 text-emerald-600" />
              <span>Mês Atual</span>
            </button>
          )}
        </div>

        {/* Right Side: Silent, Integrated Contextual Summary Strip */}
        <div className="flex items-center flex-wrap gap-2 text-xs w-full md:w-auto justify-start md:justify-end">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-100/70 border border-slate-200/80 text-xs shadow-2xs">
            <span className="text-slate-500 text-[11px] flex items-center gap-1">
              <span>Rec:</span>
              <strong className="font-bold text-slate-900 font-mono">{formatCurrency(periodSalesValue)}</strong>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500 text-[11px] flex items-center gap-1">
              <span>Desp:</span>
              <strong className="font-bold text-slate-900 font-mono">{formatCurrency(periodExpensesValue)}</strong>
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500 text-[11px] flex items-center gap-1">
              <span>Saldo:</span>
              <strong className={`font-bold font-mono ${netBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {formatCurrency(netBalance)}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
