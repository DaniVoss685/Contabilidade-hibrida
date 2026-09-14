import React, { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Trash2, X, AlertCircle, HelpCircle } from 'lucide-react';
import { Portal } from './Portal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  message?: string;
  consequence?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  icon?: React.ReactNode;
  extraAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'secondary';
  };
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title,
  description,
  message,
  consequence,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  icon,
  extraAction,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Unifica onClose e onCancel com total retrocompatibilidade
  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    } else if (onCancel) {
      onCancel();
    }
  }, [onClose, onCancel]);

  const handleConfirm = useCallback(() => {
    onConfirm();
    handleClose();
  }, [onConfirm, handleClose]);

  // Acessibilidade: ESC, Focus Trap e restauração de foco
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco inicial: botão de cancelar para perigo (evita Enter acidental) ou confirmar
    const timer = setTimeout(() => {
      if (variant === 'danger' && cancelBtnRef.current) {
        cancelBtnRef.current.focus();
      } else if (confirmBtnRef.current) {
        confirmBtnRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = originalOverflow;
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, handleClose, variant]);

  if (!isOpen) return null;

  // Clique seguro fora: requer que mousedown e click ocorram no mesmo backdrop
  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownTargetRef.current = e.target;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget) {
      handleClose();
    }
  };

  const resolvedText = description || message || '';

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-rose-50 text-rose-600 border-rose-100',
          confirmBtn: 'bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs',
          defaultIcon: <Trash2 className="w-5 h-5 text-rose-600" />,
        };
      case 'warning':
        return {
          iconBg: 'bg-amber-50 text-amber-600 border-amber-100',
          confirmBtn: 'bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs',
          defaultIcon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
        };
      case 'primary':
      default:
        return {
          iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
          confirmBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs',
          defaultIcon: <HelpCircle className="w-5 h-5 text-emerald-600" />,
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <Portal>
      <div
        onMouseDown={handleBackdropMouseDown}
        onClick={handleBackdropClick}
        className="fixed inset-0 z-[100000] bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      >
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200/80 overflow-hidden animate-in zoom-in-95 duration-200"
        >
          {/* Header */}
          <div className="p-5 flex items-start gap-3.5">
            <div className={`p-2.5 rounded-xl border flex-shrink-0 ${styles.iconBg}`}>
              {icon || styles.defaultIcon}
            </div>

            <div className="flex-1">
              <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900 tracking-tight">
                {title}
              </h3>
              {resolvedText && (
                <p id="confirm-dialog-description" className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {resolvedText}
                </p>
              )}

              {consequence && (
                <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <span>{consequence}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Fechar diálogo"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Footer */}
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              ref={cancelBtnRef}
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmBtnRef}
              type="button"
              onClick={handleConfirm}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-98 ${styles.confirmBtn}`}
            >
              {confirmLabel}
            </button>
            {extraAction && (
              <button
                type="button"
                onClick={() => {
                  extraAction.onClick();
                  handleClose();
                }}
                disabled={extraAction.disabled}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer active:scale-98 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {extraAction.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};
