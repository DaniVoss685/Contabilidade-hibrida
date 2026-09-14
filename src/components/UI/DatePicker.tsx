import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
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

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'DD/MM/AAAA',
  disabled = false,
  required = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { coords } = useFloatingPosition(triggerRef, isOpen, {
    estimatedHeight: 330,
    estimatedWidth: 288,
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

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  // Navigation
  const prevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
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
  };

  const handleSelectToday = () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    onChange(todayStr);
    setViewDate(today);
    setIsOpen(false);
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
        onClick={() => !disabled && setIsOpen(!isOpen)}
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
            className="p-3.5 bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-72 animate-in fade-in zoom-in-95 duration-150 select-none"
          >
            {/* Month & Year Navigation */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs font-bold text-slate-800 font-mono">
                {MONTH_NAMES[currentMonth]} {currentYear}
              </span>

              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
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

                return (
                  <button
                    type="button"
                    key={`${item.dateString}-${index}`}
                    onClick={() => handleSelectDay(item.dateString)}
                    className={`h-7 w-7 mx-auto rounded-lg text-xs font-mono font-medium flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white font-bold shadow-xs'
                        : isToday
                        ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200'
                        : item.isCurrentMonth
                        ? 'text-slate-800 hover:bg-slate-100'
                        : 'text-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {item.day}
                  </button>
                );
              })}
            </div>

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
                onClick={() => setIsOpen(false)}
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
