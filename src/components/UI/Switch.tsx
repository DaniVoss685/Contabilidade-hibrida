import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  showStatusBadge?: boolean;
  className?: string;
  // Só o toggle (sem card/borda/label) para encaixar dentro de um campo de formulário já com rótulo próprio.
  bare?: boolean;
  ariaLabel?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  showStatusBadge = true,
  className = '',
  bare = false,
  ariaLabel,
}) => {
  const switchId = id || `switch_${Math.random().toString(36).substring(2, 8)}`;

  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const toggle = (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={checked}
      aria-label={ariaLabel || label}
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
        checked ? 'bg-emerald-600' : 'bg-slate-300'
      } ${disabled ? 'cursor-not-allowed' : ''}`}
    >
      <span className="sr-only">{ariaLabel || label || 'Alternar'}</span>
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  if (bare) return toggle;

  return (
    <div
      className={`flex items-center justify-between gap-4 p-3 rounded-xl border transition-all ${
        checked
          ? 'bg-emerald-50/40 border-emerald-200/70'
          : 'bg-slate-50/70 border-slate-200/80'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
    >
      {(label || description) && (
        <div className="space-y-0.5 select-none flex-1">
          {label && (
            <label
              htmlFor={switchId}
              className="font-bold text-slate-900 block text-xs cursor-pointer"
            >
              {label}
            </label>
          )}
          {description && (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 shrink-0">
        {showStatusBadge && (
          <span
            className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wider select-none ${
              checked
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-slate-200/80 text-slate-600 border-slate-300'
            }`}
          >
            {checked ? 'ON' : 'OFF'}
          </span>
        )}

        <button
          type="button"
          role="switch"
          id={switchId}
          aria-checked={checked}
          disabled={disabled}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
            checked ? 'bg-emerald-600' : 'bg-slate-300'
          } ${disabled ? 'cursor-not-allowed' : ''}`}
        >
          <span className="sr-only">{label || 'Alternar'}</span>
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
};
