import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Portal } from './Portal';
import { useFloatingPosition } from './useFloatingPosition';

interface MonthYearPickerProps {
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

export const MonthYearPicker: React.FC<MonthYearPickerProps> = ({
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

  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { coords } = useFloatingPosition(triggerRef, isOpen, {
    estimatedHeight: 260,
    estimatedWidth: 260,
    gap: 6,
  });

  // Keep viewYear in sync when prop changes externally
  useEffect(() => {
    setViewYear(selectedYear);
  }, [selectedYear]);

  // Handle outside click & escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
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

  const currentMonthObj = typeof selectedMonth === 'number'
    ? MONTHS.find((m) => m.num === selectedMonth)
    : null;

  const displayLabel = selectedMonth === 'ALL'
    ? `Ano Inteiro (${selectedYear})`
    : `${currentMonthObj?.name || 'Mês'} de ${selectedYear}`;

  return (
    <div className={`relative ${className}`} ref={triggerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
          isOpen
            ? 'border-emerald-600 bg-white ring-3 ring-emerald-500/15 text-slate-900'
            : 'border-slate-200/90 bg-white hover:border-slate-300 text-slate-800'
        }`}
      >
        <Calendar className={`w-3.5 h-3.5 ${isOpen ? 'text-emerald-600' : 'text-slate-400'}`} />
        <span className="font-bold tracking-tight">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-emerald-600' : ''
          }`}
        />
      </button>

      {/* Floating Popover rendered in Portal */}
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
            className="p-3 bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-64 animate-in fade-in zoom-in-95 duration-150 select-none"
          >
            {/* Year Stepper Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setViewYear((y) => Math.max(minYear, y - 1))}
                disabled={viewYear <= minYear}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold font-mono text-slate-900">
                {viewYear}
              </span>

              <button
                type="button"
                onClick={() => setViewYear((y) => Math.min(maxYear, y + 1))}
                disabled={viewYear >= maxYear}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Optional "Ano Inteiro" button */}
            {allowAllMonths && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={handleSelectAllYear}
                  className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                    selectedMonth === 'ALL' && selectedYear === viewYear
                      ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                  }`}
                >
                  Ano Completo de {viewYear}
                </button>
              </div>
            )}

            {/* 3x4 Month Grid */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {MONTHS.map((m) => {
                const isSelected = selectedMonth === m.num && selectedYear === viewYear;
                const isCurrentCalendar = currentCalendarMonth === m.num && currentCalendarYear === viewYear;

                return (
                  <button
                    key={m.num}
                    type="button"
                    onClick={() => handleSelectMonth(m.num)}
                    className={`py-2 px-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : isCurrentCalendar
                        ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {m.short}
                  </button>
                );
              })}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};
