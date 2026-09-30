import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { Portal } from './Portal';
import { useModalAccessibility } from './useModalAccessibility';
import { ConfirmDialog } from './ConfirmDialog';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  className?: string;
  isDirty?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  discardTitle?: string;
  discardDescription?: string;
}

const MAX_WIDTH_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  eyebrow,
  icon,
  children,
  footer,
  maxWidth = '2xl',
  className = '',
  isDirty = false,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  discardTitle = 'Descartar alterações?',
  discardDescription = 'Você possui alterações não salvas no formulário. Se fechar agora, todas as informações preenchidas serão perdidas.',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    requestClose,
    showDiscardConfirm,
    confirmDiscard,
    cancelDiscard,
    backdropProps,
    containerProps,
  } = useModalAccessibility({
    isOpen,
    onClose,
    isDirty,
    closeOnBackdropClick,
    closeOnEscape,
    containerRef,
  });

  if (!isOpen) return null;

  return (
    <Portal>
      <div
        {...backdropProps}
        className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
      >
        <div
          ref={containerRef}
          {...containerProps}
          className={`bg-white rounded-2xl w-full ${MAX_WIDTH_CLASSES[maxWidth]} shadow-2xl border border-slate-200/80 overflow-hidden animate-in zoom-in-95 duration-200 my-auto flex flex-col max-h-[90vh] ${className}`}
        >
          {/* Standardized Header */}
          <div className="px-4 sm:px-6 py-3.5 sm:py-4.5 border-b border-slate-100 flex items-center justify-between gap-2 flex-shrink-0 bg-white">
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-700 flex-shrink-0">
                  {icon}
                </div>
              )}
              <div>
                {eyebrow && (
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                    {eyebrow}
                  </span>
                )}
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={requestClose}
              aria-label="Fechar modal"
              className="tap-target -mr-2 sm:mr-0 sm:min-w-0 sm:min-h-0 sm:p-1.5 shrink-0 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {/* Body with Scroll */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">{children}</div>

          {/* Standardized Footer */}
          {footer && (
            <div className="px-4 sm:px-6 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2.5 flex-shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>

      {/* Confirmação de Descarte de Alterações (Dirty State) */}
      {showDiscardConfirm && (
        <ConfirmDialog
          isOpen={showDiscardConfirm}
          title={discardTitle}
          description={discardDescription}
          confirmLabel="Descartar"
          cancelLabel="Continuar Editando"
          variant="danger"
          onConfirm={confirmDiscard}
          onClose={cancelDiscard}
        />
      )}
    </Portal>
  );
};
