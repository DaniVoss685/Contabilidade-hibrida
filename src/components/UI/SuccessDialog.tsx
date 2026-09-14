import React, { useEffect, useRef, useCallback } from 'react';
import { Check } from 'lucide-react';
import { Portal } from './Portal';

export interface SuccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  primaryActionLabel?: string;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export const SuccessDialog: React.FC<SuccessDialogProps> = ({
  isOpen,
  onClose,
  title,
  message,
  primaryActionLabel = 'Concluir',
  secondaryAction,
}) => {
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = setTimeout(() => {
      primaryBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="success-dialog-title"
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs animate-in fade-in duration-150"
        onMouseDown={(e) => {
          mouseDownTargetRef.current = e.target;
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && mouseDownTargetRef.current === e.currentTarget) {
            handleClose();
          }
        }}
      >
        <div
          ref={dialogRef}
          className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-emerald-100 overflow-hidden animate-in zoom-in-95 duration-200"
        >
          <div className="p-6 text-center space-y-3.5">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
              <Check className="w-7 h-7 stroke-[2.5]" />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100/80 text-emerald-800 text-[11px] font-bold tracking-wide uppercase mb-1">
                ✓ Concluído
              </div>
              <h3
                id="success-dialog-title"
                className="text-base font-black text-slate-900 tracking-tight"
              >
                {title}
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">
                {message}
              </p>
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-center gap-2.5">
            {secondaryAction && (
              <button
                type="button"
                onClick={() => {
                  secondaryAction.onClick();
                  handleClose();
                }}
                className="w-full px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                {secondaryAction.label}
              </button>
            )}
            <button
              ref={primaryBtnRef}
              type="button"
              onClick={handleClose}
              className="w-full px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl transition-all cursor-pointer shadow-xs hover:shadow"
            >
              {primaryActionLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
};
