import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Portal } from './Portal';
import { useToast, ToastItem, ToastType } from './ToastContext';

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const getToastStyles = (type: ToastType) => {
  switch (type) {
    case 'success':
      return {
        cardBg: 'bg-white/95 border-emerald-200/90 text-emerald-950 shadow-emerald-900/5',
        iconContainer: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        progressBar: 'bg-emerald-500',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />,
      };
    case 'error':
      return {
        cardBg: 'bg-white/95 border-rose-200/90 text-rose-950 shadow-rose-900/5',
        iconContainer: 'bg-rose-50 text-rose-600 border-rose-100',
        progressBar: 'bg-rose-500',
        icon: <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />,
      };
    case 'warning':
      return {
        cardBg: 'bg-white/95 border-amber-200/90 text-amber-950 shadow-amber-900/5',
        iconContainer: 'bg-amber-50 text-amber-600 border-amber-100',
        progressBar: 'bg-amber-500',
        icon: <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />,
      };
    case 'info':
    default:
      return {
        cardBg: 'bg-white/95 border-sky-200/90 text-sky-950 shadow-sky-900/5',
        iconContainer: 'bg-sky-50 text-sky-600 border-sky-100',
        progressBar: 'bg-sky-500',
        icon: <Info className="w-4 h-4 text-sky-600 flex-shrink-0" />,
      };
  }
};

export const ToastCard: React.FC<ToastCardProps> = ({ toast, onDismiss }) => {
  const styles = getToastStyles(toast.type);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const remainingTimeRef = useRef(toast.duration);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    if (toast.duration <= 0 || toast.duration === Infinity) return;

    const interval = 50; // Atualiza a barra suavemente
    const timer = setInterval(() => {
      if (!isPaused) {
        const now = Date.now();
        const delta = now - lastTickRef.current;
        remainingTimeRef.current -= delta;

        if (remainingTimeRef.current <= 0) {
          clearInterval(timer);
          onDismiss(toast.id);
        } else {
          setProgress((remainingTimeRef.current / toast.duration) * 100);
        }
      }
      lastTickRef.current = Date.now();
    }, interval);

    return () => clearInterval(timer);
  }, [toast.id, toast.duration, isPaused, onDismiss]);

  const role = toast.type === 'error' ? 'alert' : 'status';

  return (
    <div
      role={role}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => {
        setIsPaused(true);
        lastTickRef.current = Date.now();
      }}
      onMouseLeave={() => {
        setIsPaused(false);
        lastTickRef.current = Date.now();
      }}
      className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border shadow-xl backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-top-3 ${styles.cardBg}`}
    >
      <div className="flex items-start gap-3 p-3.5 sm:p-4">
        <div className={`p-2 rounded-xl border flex-shrink-0 mt-0.5 ${styles.iconContainer}`}>
          {styles.icon}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <p className="text-xs font-semibold text-slate-800 leading-relaxed break-words">
            {toast.message}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer flex-shrink-0"
          aria-label="Dispensar notificação"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Barra de progresso visual do auto-dismiss */}
      {toast.duration > 0 && toast.duration < Infinity && (
        <div className="h-0.5 w-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full transition-all duration-75 ease-linear ${styles.progressBar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <Portal>
      <div
        className="fixed top-4 right-4 z-[999999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none sm:top-5 sm:right-5 px-3 sm:px-0"
        tabIndex={-1}
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </Portal>
  );
};

export default ToastContainer;
