import React from 'react';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  valueFormatter?: (value: number) => string;
  marks?: Array<{ value: number; label: string }>;
  disabled?: boolean;
  className?: string;
  color?: 'emerald' | 'indigo' | 'blue';
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  valueFormatter = (val) => `${val}`,
  marks,
  disabled = false,
  className = '',
  color = 'indigo',
}) => {
  const percentage = Math.min(
    100,
    Math.max(0, ((value - min) / (max - min)) * 100)
  );

  const colorStyles = {
    indigo: {
      track: 'bg-indigo-600',
      thumb: 'border-indigo-600 focus-visible:ring-indigo-500/30',
      badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    },
    emerald: {
      track: 'bg-emerald-600',
      thumb: 'border-emerald-600 focus-visible:ring-emerald-500/30',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    },
    blue: {
      track: 'bg-blue-600',
      thumb: 'border-blue-600 focus-visible:ring-blue-500/30',
      badge: 'bg-blue-50 text-blue-700 border-blue-200/80',
    },
  }[color];

  return (
    <div className={`space-y-2 select-none ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-slate-700">{label}</label>
          <span
            className={`font-bold font-mono px-2 py-0.5 rounded-lg border text-[11px] shadow-2xs ${colorStyles.badge}`}
          >
            {valueFormatter(value)}
          </span>
        </div>
      )}

      <div className="relative py-2 flex items-center">
        {/* Track Container */}
        <div className="relative w-full h-2 rounded-full bg-slate-200/80 overflow-hidden">
          {/* Filled active track */}
          <div
            className={`h-full transition-all duration-75 rounded-full ${colorStyles.track}`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Real Native Range Input layered directly on top with zero opacity for accessibility & pointer handling */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-20"
          aria-label={label || 'Slider'}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
        />

        {/* Custom Visual Thumb */}
        <div
          className={`absolute pointer-events-none top-1/2 -translate-y-1/2 -translate-x-1/2 w-4.5 h-4.5 rounded-full bg-white border-2 shadow-sm transition-transform duration-75 z-10 ${colorStyles.thumb}`}
          style={{ left: `${percentage}%` }}
        />
      </div>

      {/* Optional Marks */}
      {marks && marks.length > 0 && (
        <div className="relative w-full h-4 text-[10px] text-slate-400 font-medium px-0.5">
          {marks.map((mark) => {
            const markPercent = Math.min(100, Math.max(0, ((mark.value - min) / (max - min)) * 100));
            let transformClass = '-translate-x-1/2';
            if (markPercent <= 0) transformClass = 'translate-x-0';
            else if (markPercent >= 100) transformClass = '-translate-x-full';

            return (
              <span
                key={mark.value}
                onClick={() => !disabled && onChange(mark.value)}
                className={`absolute ${transformClass} cursor-pointer hover:text-slate-700 transition-colors whitespace-nowrap`}
                style={{ left: `${markPercent}%` }}
              >
                {mark.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
