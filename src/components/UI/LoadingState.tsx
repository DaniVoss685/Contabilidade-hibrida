import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingStateProps {
  message?: string;
  description?: string;
  compact?: boolean;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Carregando informações...',
  description,
  compact = false,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center select-none ${
        compact ? 'py-6 px-4' : 'py-12 sm:py-16 px-6'
      } ${className}`}
    >
      <Loader2 className="w-8 h-8 text-teal-600 animate-spin mb-3" />
      <h4 className="text-xs sm:text-sm font-semibold text-slate-800">
        {message}
      </h4>
      {description && (
        <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
};
