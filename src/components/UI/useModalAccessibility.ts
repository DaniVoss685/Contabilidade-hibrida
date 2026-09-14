import React, { useEffect, useRef, useState, useCallback, RefObject } from 'react';

export interface UseModalAccessibilityOptions {
  isOpen: boolean;
  onClose: () => void;
  isDirty?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  containerRef?: RefObject<HTMLElement | null>;
  onDiscardConfirm?: () => void;
}

export interface UseModalAccessibilityReturn {
  /** Disparado pelo botão X, Cancelar, ESC ou clique fora */
  requestClose: () => void;
  /** Indica se o diálogo "Descartar alterações?" deve ser exibido */
  showDiscardConfirm: boolean;
  /** Confirma o descarte de dados e fecha o modal */
  confirmDiscard: () => void;
  /** Cancela o descarte e mantém o formulário aberto */
  cancelDiscard: () => void;
  /** Props para espalhar no container de fundo (overlay/backdrop) */
  backdropProps: {
    onClick: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseDown: (e: React.MouseEvent<HTMLElement>) => void;
  };
  /** Props para espalhar no container de conteúdo do modal */
  containerProps: {
    role: 'dialog';
    'aria-modal': true;
    onClick: (e: React.MouseEvent) => void;
  };
}

export function useModalAccessibility({
  isOpen,
  onClose,
  isDirty = false,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  containerRef,
  onDiscardConfirm,
}: UseModalAccessibilityOptions): UseModalAccessibilityReturn {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
    if (onDiscardConfirm) {
      onDiscardConfirm();
    } else {
      onClose();
    }
  }, [onDiscardConfirm, onClose]);

  const cancelDiscard = useCallback(() => {
    setShowDiscardConfirm(false);
  }, []);

  // Acessibilidade de teclado: Tecla ESC e Focus Trap
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Foco inicial no primeiro elemento interativo
    const timer = setTimeout(() => {
      if (containerRef?.current) {
        const firstInput = containerRef.current.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
        );
        if (firstInput) {
          firstInput.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Se houver um ConfirmDialog de descarte ativo, deixa-o tratar o ESC
      if (showDiscardConfirm) return;

      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
        return;
      }

      if (e.key === 'Tab' && containerRef?.current) {
        const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, closeOnEscape, requestClose, showDiscardConfirm, containerRef]);

  const handleBackdropMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
    mouseDownTargetRef.current = e.target;
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (
        closeOnBackdropClick &&
        e.target === e.currentTarget &&
        mouseDownTargetRef.current === e.currentTarget
      ) {
        requestClose();
      }
    },
    [closeOnBackdropClick, requestClose]
  );

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return {
    requestClose,
    showDiscardConfirm,
    confirmDiscard,
    cancelDiscard,
    backdropProps: {
      onClick: handleBackdropClick,
      onMouseDown: handleBackdropMouseDown,
    },
    containerProps: {
      role: 'dialog',
      'aria-modal': true,
      onClick: handleContainerClick,
    },
  };
}
