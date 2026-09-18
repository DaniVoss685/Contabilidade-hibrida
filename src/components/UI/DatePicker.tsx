import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown, X } from 'lucide-react';
import { Portal } from './Portal';
import { useFloatingPosition } from './useFloatingPosition';

interface DatePickerProps {
  value: string; // ISO date format: YYYY-MM-DD
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  minDate?: string;
  maxDate?: string;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT_NAMES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

type ViewMode = 'days' | 'months' | 'years';

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'DD/MM/AAAA',
  disabled = false,
  required = false,
  className = '',
  minDate,
  maxDate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('days');
  const [yearBlockStart, setYearBlockStart] = useState<number>(1990);

  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { coords } = useFloatingPosition(triggerRef, isOpen, {
    estimatedHeight: 340,
    estimatedWidth: 320,
    gap: 6,
  });

  // Parse initial date or default to current date
  const selectedDate = value ? new Date(value + 'T00:00:00') : null;
  const [viewDate, setViewDate] = useState<Date>(
    selectedDate && !isNaN(selectedDate.getTime()) ? selectedDate : new Date()
  );

  useEffect(() => {
    if (value) {
      const parsed = new Date(value + 'T00:00:00');
      if (!isNaN(parsed.getTime())) {
        setViewDate(parsed);
      }
    }
  }, [value]);

  // Handle outside click & Escape key
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
        setViewMode('days');
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewMode !== 'days') {
          setViewMode('days');
        } else {
          setIsOpen(false);
        }
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
  }, [isOpen, viewMode]);

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  const minYear = minDate ? parseInt(minDate.split('-')[0], 10) : 1900;
  const maxYear = maxDate ? parseInt(maxDate.split('-')[0], 10) : new Date().getFullYear();

  // Navigation
  const prevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const openYearSelector = () => {
    const blockStart = Math.floor(currentYear / 12) * 12;
    setYearBlockStart(Math.max(minYear, blockStart));
    setViewMode('years');
  };

  const prevYearBlock = () => {
    setYearBlockStart((prev) => Math.max(minYear, prev - 12));
  };

  const nextYearBlock = () => {
    setYearBlockStart((prev) => (prev + 12 <= maxYear ? prev + 12 : prev));
  };

  const handleSelectMonth = (mIndex: number) => {
    setViewDate(new Date(currentYear, mIndex, 1));
    setViewMode('days');
  };

  const handleSelectYear = (year: number) => {
    setViewDate(new Date(year, currentMonth, 1));
    setViewMode('days');
  };

  // Days matrix
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const days: { day: number; isCurrentMonth: boolean; dateString: string }[] = [];

  // Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = currentMonth === 0 ? 11 : currentMonth - 1;
    const y = currentMonth === 0 ? currentYear - 1 : currentYear;
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, isCurrentMonth: false, dateString: dateStr });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    days.push({ day: i, isCurrentMonth: true, dateString: dateStr });
  }

  // Next month leading days to complete 35 or 42 grid
  const remaining = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const m = currentMonth === 11 ? 0 : currentMonth + 1;
    const y = currentMonth === 11 ? currentYear + 1 : currentYear;
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    days.push({ day: i, isCurrentMonth: false, dateString: dateStr });
  }

  const handleSelectDay = (dateStr: string) => {
    onChange(dateStr);
    setIsOpen(false);
    setViewMode('days');
  };

  const handleSelectToday = () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    onChange(todayStr);
    setViewDate(today);
    setIsOpen(false);
    setViewMode('days');
  };

  // Format display date: DD/MM/AAAA
  const formattedDisplay = value ? (() => {
    const parts = value.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return value;
  })() : '';

  const todayStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  return (
    <div className={`relative ${className}`} ref={triggerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setViewMode('days');
          }
        }}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-xs font-medium text-slate-800 transition-all text-left shadow-2xs ${
          isOpen
            ? 'border-emerald-600 ring-3 ring-emerald-500/15'
            : 'border-slate-200/90 hover:border-slate-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2.5">
          <CalendarIcon className={`w-4 h-4 ${isOpen ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className={formattedDisplay ? 'text-slate-900 font-semibold font-mono' : 'text-slate-400 font-normal'}>
            {formattedDisplay || placeholder}
          </span>
        </div>
        {value && !disabled && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            title="Limpar data"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {/* Popover Calendar rendered in Portal to avoid overflow clipping */}
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
            className="p-4 bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-80 animate-in fade-in zoom-in-95 duration-150 select-none"
          >
            {/* VIEW MODE: DAYS */}
            {viewMode === 'days' && (
              <>
                {/* Header with Custom Month & Year Buttons (No native selects) */}
                <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100 gap-1.5">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    title="Mês anterior"
                    aria-label="Mês anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {/* Botão de Mês Customizado */}
                    <button
                      type="button"
                      onClick={() => setViewMode('months')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-800 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200/80 hover:border-emerald-300 transition-all cursor-pointer"
                      title="Selecionar mês"
                    >
                      <span>{MONTH_NAMES[currentMonth]}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    {/* Botão de Ano Customizado */}
                    <button
                      type="button"
                      onClick={openYearSelector}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold font-mono text-slate-800 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200/80 hover:border-emerald-300 transition-all cursor-pointer"
                      title="Selecionar ano"
                    >
                      <span>{currentYear}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={nextMonth}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    title="Próximo mês"
                    aria-label="Próximo mês"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-1 text-center mb-1">
                  {WEEK_DAYS.map((wd, i) => (
                    <span
                      key={wd}
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        i === 0 ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {wd}
                    </span>
                  ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1 text-center">
                  {days.map((item, index) => {
                    const isSelected = value === item.dateString;
                    const isToday = todayStr === item.dateString;
                    const isBeforeMin = minDate ? item.dateString < minDate : false;
                    const isAfterMax = maxDate ? item.dateString > maxDate : false;
                    const isDisabledDay = isBeforeMin || isAfterMax;

                    return (
                      <button
                        type="button"
                        key={`${item.dateString}-${index}`}
                        disabled={isDisabledDay}
                        onClick={() => !isDisabledDay && handleSelectDay(item.dateString)}
                        className={`h-7 w-7 mx-auto rounded-lg text-xs font-mono font-medium flex items-center justify-center transition-all ${
                          isDisabledDay
                            ? 'text-slate-200 cursor-not-allowed opacity-30'
                            : isSelected
                            ? 'bg-emerald-600 text-white font-bold shadow-xs cursor-pointer'
                            : isToday
                            ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 cursor-pointer'
                            : item.isCurrentMonth
                            ? 'text-slate-800 hover:bg-slate-100 cursor-pointer'
                            : 'text-slate-300 hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        {item.day}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* VIEW MODE: MONTHS (Grid 3x4 Customizado) */}
            {viewMode === 'months' && (
              <div>
                <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800">
                    Selecione o Mês ({currentYear})
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMode('days')}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    Voltar aos dias
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 py-1">
                  {MONTH_SHORT_NAMES.map((mName, idx) => {
                    const isSelectedMonth = currentMonth === idx;
                    // Checagem de maxDate / minDate para desabilitar mês futuro
                    let isDisabledMonth = false;
                    if (maxDate) {
                      const maxYearNum = parseInt(maxDate.split('-')[0], 10);
                      const maxMonthNum = parseInt(maxDate.split('-')[1], 10) - 1;
                      if (currentYear > maxYearNum || (currentYear === maxYearNum && idx > maxMonthNum)) {
                        isDisabledMonth = true;
                      }
                    }
                    if (minDate) {
                      const minYearNum = parseInt(minDate.split('-')[0], 10);
                      const minMonthNum = parseInt(minDate.split('-')[1], 10) - 1;
                      if (currentYear < minYearNum || (currentYear === minYearNum && idx < minMonthNum)) {
                        isDisabledMonth = true;
                      }
                    }

                    return (
                      <button
                        key={mName}
                        type="button"
                        disabled={isDisabledMonth}
                        onClick={() => !isDisabledMonth && handleSelectMonth(idx)}
                        className={`py-2.5 rounded-xl text-xs font-semibold transition-all ${
                          isDisabledMonth
                            ? 'text-slate-300 cursor-not-allowed opacity-30 bg-slate-50'
                            : isSelectedMonth
                            ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-300 ring-2 ring-emerald-500/20 shadow-2xs cursor-pointer'
                            : 'text-slate-700 bg-slate-50/70 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60 cursor-pointer'
                        }`}
                      >
                        {mName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW MODE: YEARS (Navegação em Blocos de 12 Anos) */}
            {viewMode === 'years' && (
              <div>
                <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100 gap-1.5">
                  <button
                    type="button"
                    onClick={prevYearBlock}
                    disabled={yearBlockStart <= minYear}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    title="Bloco anterior"
                    aria-label="Bloco anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="text-xs font-bold font-mono text-slate-800">
                    {yearBlockStart} – {Math.min(maxYear, yearBlockStart + 11)}
                  </span>

                  <button
                    type="button"
                    onClick={nextYearBlock}
                    disabled={yearBlockStart + 11 >= maxYear}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    title="Próximo bloco"
                    aria-label="Próximo bloco"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 py-1">
                  {Array.from({ length: 12 }, (_, i) => yearBlockStart + i).map((year) => {
                    const isSelectedYear = currentYear === year;
                    const isDisabledYear = year < minYear || year > maxYear;

                    return (
                      <button
                        key={year}
                        type="button"
                        disabled={isDisabledYear}
                        onClick={() => !isDisabledYear && handleSelectYear(year)}
                        className={`py-2 rounded-xl text-xs font-mono font-medium transition-all ${
                          isDisabledYear
                            ? 'text-slate-300 cursor-not-allowed opacity-30 bg-slate-50'
                            : isSelectedYear
                            ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-300 ring-2 ring-emerald-500/20 shadow-2xs cursor-pointer'
                            : 'text-slate-700 bg-slate-50/70 hover:bg-slate-100 hover:text-slate-900 border border-slate-200/60 cursor-pointer'
                        }`}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => setViewMode('days')}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    Voltar aos dias
                  </button>
                </div>
              </div>
            )}

            {/* Footer with Today Shortcut */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleSelectToday}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                Hoje
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setViewMode('days');
                }}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};
