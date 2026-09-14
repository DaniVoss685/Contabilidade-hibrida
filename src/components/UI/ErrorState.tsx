import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Não foi possível carregar as informações',
  message = 'Ocorreu uma instabilidade local ao processar os dados deste módulo.',
  onRetry,
  retryLabel = 'Tentar novamente',
  compact = false,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center select-none ${
        compact ? 'py-6 px-4' : 'py-12 sm:py-16 px-6'
      } ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center mb-3 text-rose-600 shadow-2xs">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-bold text-slate-800 tracking-tight">
        {title}
      </h4>
      <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-3.5 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-98"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>{retryLabel}</span>
        </button>
      )}
    </div>
  );
};
