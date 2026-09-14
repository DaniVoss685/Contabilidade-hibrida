import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Portal } from './Portal';
import { useFloatingPosition } from './useFloatingPosition';

export interface PeriodPickerProps {
  selectedYear: number;
  selectedMonth: number | 'ALL';
  onChange: (year: number, month: number | 'ALL') => void;
  allowAllMonths?: boolean;
  className?: string;
  minYear?: number;
  maxYear?: number;
}

const MONTHS = [
  { num: 1, short: 'Jan', name: 'Janeiro' },
  { num: 2, short: 'Fev', name: 'Fevereiro' },
  { num: 3, short: 'Mar', name: 'Março' },
  { num: 4, short: 'Abr', name: 'Abril' },
  { num: 5, short: 'Mai', name: 'Maio' },
  { num: 6, short: 'Jun', name: 'Junho' },
  { num: 7, short: 'Jul', name: 'Julho' },
  { num: 8, short: 'Ago', name: 'Agosto' },
  { num: 9, short: 'Set', name: 'Setembro' },
  { num: 10, short: 'Out', name: 'Outubro' },
  { num: 11, short: 'Nov', name: 'Novembro' },
  { num: 12, short: 'Dez', name: 'Dezembro' },
];

export const PeriodPicker: React.FC<PeriodPickerProps> = ({
  selectedYear,
  selectedMonth,
  onChange,
  allowAllMonths = true,
  className = '',
  minYear = 2023,
  maxYear = 2030,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(selectedYear);

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { coords } = useFloatingPosition(containerRef, isOpen, {
    estimatedHeight: 270,
    estimatedWidth: 280,
    gap: 6,
  });

  useEffect(() => {
    setViewYear(selectedYear);
  }, [selectedYear]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedMonth === 'ALL') {
      onChange(selectedYear, 12);
      return;
    }
    if (selectedMonth === 1) {
      onChange(selectedYear - 1, 12);
    } else {
      onChange(selectedYear, selectedMonth - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedMonth === 'ALL') {
      onChange(selectedYear, 1);
      return;
    }
    if (selectedMonth === 12) {
      onChange(selectedYear + 1, 1);
    } else {
      onChange(selectedYear, selectedMonth + 1);
    }
  };

  const currentCalendarMonth = new Date().getMonth() + 1;
  const currentCalendarYear = new Date().getFullYear();

  const handleSelectMonth = (monthNum: number) => {
    onChange(viewYear, monthNum);
    setIsOpen(false);
  };

  const handleSelectAllYear = () => {
    onChange(viewYear, 'ALL');
    setIsOpen(false);
  };

  const currentMonthObj =
    typeof selectedMonth === 'number'
      ? MONTHS.find((m) => m.num === selectedMonth)
      : null;

  const displayLabel =
    selectedMonth === 'ALL'
      ? `Ano Inteiro (${selectedYear})`
      : `${currentMonthObj?.name || 'Mês'} de ${selectedYear}`;

  return (
    <div className={`relative inline-flex items-center ${className}`} ref={containerRef}>
      <div
        className={`inline-flex items-center rounded-xl border transition-all shadow-2xs ${
          isOpen
            ? 'border-emerald-600 bg-white ring-3 ring-emerald-500/15'
            : 'border-slate-200/90 bg-white hover:border-slate-300'
        }`}
      >
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1.5 rounded-l-xl text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
          title="Competência anterior"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:text-slate-950 transition-colors cursor-pointer border-x border-slate-100"
          aria-expanded={isOpen}
          title="Clique para escolher mês ou ano"
        >
          <Calendar className={`w-3.5 h-3.5 ${isOpen ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className="font-bold tracking-tight select-none">{displayLabel}</span>
          <ChevronDown
            className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-emerald-600' : ''
            }`}
          />
        </button>

        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1.5 rounded-r-xl text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
          title="Próxima competência"
          aria-label="Próximo mês"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {isOpen && (
        <Portal>
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: `${coords.left}px`,
              zIndex: 99999,
            }}
            className="w-68 bg-white rounded-2xl border border-slate-200/90 shadow-xl p-3 text-slate-800 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setViewYear((y) => Math.max(minYear, y - 1))}
                disabled={viewYear <= minYear}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Ano anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold text-slate-900 font-mono tracking-wider">
                {viewYear}
              </span>

              <button
                type="button"
                onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
                disabled={viewYear >= maxYear}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Próximo ano"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {MONTHS.map((m) => {
                const isSelected = selectedYear === viewYear && selectedMonth === m.num;
                const isCurrentMonth =
                  currentCalendarYear === viewYear && currentCalendarMonth === m.num;

                return (
                  <button
                    key={m.num}
                    type="button"
                    onClick={() => handleSelectMonth(m.num)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-medium transition-all text-center relative cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : isCurrentMonth
                        ? 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200/80 hover:bg-emerald-100'
                        : 'text-slate-700 hover:bg-slate-100/80'
                    }`}
                  >
                    {m.short}
                    {isSelected && (
                      <Check className="w-3 h-3 absolute top-1 right-1 text-emerald-100" />
                    )}
                  </button>
                );
              })}
            </div>

            {allowAllMonths && (
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleSelectAllYear}
                  className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-semibold text-center transition-all cursor-pointer ${
                    selectedYear === viewYear && selectedMonth === 'ALL'
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'text-indigo-700 hover:bg-indigo-50 border border-indigo-100'
                  }`}
                >
                  Visualizar Ano Inteiro ({viewYear})
                </button>
              </div>
            )}
          </div>
        </Portal>
      )}
    </div>
  );
};
