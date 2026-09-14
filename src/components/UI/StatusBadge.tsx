import React from 'react';

export type StatusVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'cpf'
  | 'cnpj';

interface StatusBadgeProps {
  label: string;
  variant?: StatusVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'neutral',
  size = 'md',
  dot = true,
  className = '',
}) => {
  const getStyles = () => {
    switch (variant) {
      case 'success':
        return {
          badge: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
          dot: 'bg-emerald-500 ring-2 ring-emerald-500/20',
        };
      case 'warning':
        return {
          badge: 'bg-amber-50 text-amber-800 border-amber-200/80',
          dot: 'bg-amber-500 ring-2 ring-amber-500/20',
        };
      case 'danger':
        return {
          badge: 'bg-rose-50 text-rose-800 border-rose-200/80',
          dot: 'bg-rose-500 ring-2 ring-rose-500/20',
        };
      case 'info':
      case 'cnpj':
        return {
          badge: 'bg-blue-50 text-blue-800 border-blue-200/80',
          dot: 'bg-blue-500 ring-2 ring-blue-500/20',
        };
      case 'cpf':
        return {
          badge: 'bg-teal-50 text-teal-800 border-teal-200/80',
          dot: 'bg-teal-500 ring-2 ring-teal-500/20',
        };
      case 'neutral':
      default:
        return {
          badge: 'bg-slate-100 text-slate-700 border-slate-200/80',
          dot: 'bg-slate-400',
        };
    }
  };

  const styles = getStyles();
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-2xs ${styles.badge} ${sizeClasses} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />}
      <span>{label}</span>
    </span>
  );
};
