import React from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
}

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  title: string;
  description: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className = '',
}) => {
  const renderIcon = () => {
    if (!icon) return <Inbox className="w-6 h-6 text-slate-400" />;
    if (React.isValidElement(icon)) return icon;
    const IconComponent = icon as React.ComponentType<{ className?: string }>;
    return <IconComponent className="w-6 h-6 text-slate-400" />;
  };

  const renderActionIcon = (actionIcon?: React.ComponentType<{ className?: string }> | React.ReactNode) => {
    if (!actionIcon) return null;
    if (React.isValidElement(actionIcon)) return actionIcon;
    const IconComp = actionIcon as React.ComponentType<{ className?: string }>;
    return <IconComp className="w-3.5 h-3.5" />;
  };

  return (
    <div
      className={`flex flex-col items-center justify-center text-center select-none ${
        compact ? 'py-6 px-4' : 'py-12 sm:py-16 px-6'
      } ${className}`}
    >
      {/* Container do Ícone */}
      <div
        className={`rounded-2xl bg-slate-100/80 border border-slate-200/80 flex items-center justify-center mb-3.5 text-slate-400 shadow-2xs ${
          compact ? 'w-10 h-10' : 'w-13 h-13'
        }`}
      >
        {renderIcon()}
      </div>

      {/* Título */}
      <h3 className="text-sm sm:text-base font-bold text-slate-800 tracking-tight">
        {title}
      </h3>

      {/* Descrição */}
      <p className="text-xs text-slate-500 max-w-sm sm:max-w-md mt-1 leading-relaxed">
        {description}
      </p>

      {/* Botões de Ação */}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-98 ${
                action.variant === 'secondary'
                  ? 'bg-slate-800 hover:bg-slate-900 text-white'
                  : action.variant === 'outline'
                  ? 'border border-slate-300 hover:bg-slate-100 text-slate-700'
                  : 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/10'
              }`}
            >
              {renderActionIcon(action.icon)}
              <span>{action.label}</span>
            </button>
          )}

          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/90 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {renderActionIcon(secondaryAction.icon)}
              <span>{secondaryAction.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
