import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Clock, ChevronDown, Sparkles } from 'lucide-react';
import { Portal } from './Portal';
import { useFloatingPosition } from './useFloatingPosition';

export interface TimePickerProps {
  value: string; // Format "HH:mm" (ex: "08:30")
  onChange: (time: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  error?: string;
  helperText?: string;
  minTime?: string; // default: "07:00"
  maxTime?: string; // default: "20:45"
  stepMinutes?: number; // default: 15
}

// Generate slot list between min and max
function generateTimeSlots(min: string = '07:00', max: string = '20:45', step: number = 15): string[] {
  const [minH, minM] = min.split(':').map(Number);
  const [maxH, maxM] = max.split(':').map(Number);
  const startMinutes = minH * 60 + minM;
  const endMinutes = maxH * 60 + maxM;

  const slots: string[] = [];
  for (let m = startMinutes; m <= endMinutes; m += step) {
    const h = Math.floor(m / 60);
    const minPart = m % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(minPart).padStart(2, '0')}`);
  }
  return slots;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  value,
  onChange,
  label,
  placeholder = 'Selecione o horário',
  disabled = false,
  required = false,
  className = '',
  error,
  helperText,
  minTime = '07:00',
  maxTime = '20:45',
  stepMinutes = 15,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<'ALL' | 'MANHA' | 'TARDE' | 'NOITE'>('ALL');
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeSlotRef = useRef<HTMLButtonElement>(null);

  const { coords } = useFloatingPosition(triggerRef, isOpen, {
    estimatedHeight: 320,
    estimatedWidth: 280,
    gap: 6,
  });

  const slots = useMemo(
    () => generateTimeSlots(minTime, maxTime, stepMinutes),
    [minTime, maxTime, stepMinutes]
  );

  const filteredSlots = useMemo(() => {
    if (selectedPeriod === 'MANHA') {
      return slots.filter((s) => {
        const h = parseInt(s.split(':')[0], 10);
        return h >= 7 && h < 12;
      });
    }
    if (selectedPeriod === 'TARDE') {
      return slots.filter((s) => {
        const h = parseInt(s.split(':')[0], 10);
        return h >= 12 && h < 18;
      });
    }
    if (selectedPeriod === 'NOITE') {
      return slots.filter((s) => {
        const h = parseInt(s.split(':')[0], 10);
        return h >= 18;
      });
    }
    return slots;
  }, [slots, selectedPeriod]);

  // Outside click & Escape
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
      // Auto-scroll to active slot if visible
      setTimeout(() => {
        activeSlotRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectSlot = (slot: string) => {
    onChange(slot);
    setIsOpen(false);
  };

  const handleSelectNow = () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const roundedMin = Math.round(m / stepMinutes) * stepMinutes;
    const finalH = roundedMin === 60 ? h + 1 : h;
    const finalM = roundedMin === 60 ? 0 : roundedMin;
    const slot = `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
    onChange(slot);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <div
        ref={triggerRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-xl bg-white cursor-pointer transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:border-slate-300'
        } ${
          isOpen ? 'ring-2 ring-emerald-500/20 border-emerald-500 shadow-xs' : 'border-slate-200'
        } ${error ? 'border-rose-300 bg-rose-50/20 ring-2 ring-rose-500/10' : ''}`}
      >
        <div className="flex items-center gap-2.5 truncate">
          <Clock className={`w-4 h-4 shrink-0 ${value ? 'text-emerald-600' : 'text-slate-400'}`} />
          <span className={value ? 'text-slate-900 font-semibold' : 'text-slate-400'}>
            {value ? `${value}h` : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${
            isOpen ? 'rotate-180 text-emerald-600' : ''
          }`}
        />
      </div>

      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
      {helperText && !error && <p className="mt-1 text-xs text-slate-400">{helperText}</p>}

      {/* Popover */}
      {isOpen && (
        <Portal>
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${Math.max(coords.width, 280)}px`,
              zIndex: 9999,
            }}
            className="bg-white rounded-2xl shadow-xl border border-slate-200/90 p-3 animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header: Periods filter */}
            <div className="flex items-center justify-between gap-1 pb-2 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setSelectedPeriod('ALL')}
                  className={`px-2 py-0.5 rounded-md transition-all ${
                    selectedPeriod === 'ALL' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPeriod('MANHA')}
                  className={`px-2 py-0.5 rounded-md transition-all ${
                    selectedPeriod === 'MANHA' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  Manhã
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPeriod('TARDE')}
                  className={`px-2 py-0.5 rounded-md transition-all ${
                    selectedPeriod === 'TARDE' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  Tarde
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPeriod('NOITE')}
                  className={`px-2 py-0.5 rounded-md transition-all ${
                    selectedPeriod === 'NOITE' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  Noite
                </button>
              </div>

              <button
                type="button"
                onClick={handleSelectNow}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                title="Horário atual aproximado"
              >
                <Sparkles className="w-3 h-3" />
                <span>Agora</span>
              </button>
            </div>

            {/* Slots Grid */}
            <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto pr-1">
              {filteredSlots.map((slot) => {
                const isSelected = slot === value;
                return (
                  <button
                    key={slot}
                    ref={isSelected ? activeSlotRef : undefined}
                    type="button"
                    onClick={() => handleSelectSlot(slot)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs font-bold ring-2 ring-emerald-600/20'
                        : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-100'
                    }`}
                  >
                    {slot}
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
