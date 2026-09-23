import React, { useState, useEffect, useRef } from 'react';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  error?: string;
  helperText?: string;
  id?: string;
}

/**
 * Converte valor numérico em string formatada em pt-BR completa (ex: 1621.5 -> "1.621,50")
 */
function formatToPtBrComplete(val: number): string {
  if (val === null || val === undefined || isNaN(val) || val === 0) {
    return '';
  }
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formata parte inteira com separadores de milhar pt-BR (ex: "1500" -> "1.500")
 */
function formatIntPtBr(intStr: string): string {
  if (!intStr) return '';
  const num = parseInt(intStr, 10);
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-BR');
}

/**
 * Converte string de digitação natural em número BRL e string formatada suavemente
 */
export function parseAndFormatTyping(rawInput: string): { display: string; numeric: number } {
  if (!rawInput) {
    return { display: '', numeric: 0 };
  }

  // Remove R$ e espaços
  const cleaned = rawInput.replace(/R\$/g, '').trim();
  if (!cleaned) {
    return { display: '', numeric: 0 };
  }

  // Se tem vírgula, a vírgula é o separador decimal oficial
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    const integerPart = parts[0].replace(/\D/g, '');
    const decimalPart = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);

    const formattedInt = integerPart ? formatIntPtBr(integerPart) : '';
    const display = `${formattedInt},${decimalPart}`;
    const num = parseFloat(`${integerPart || '0'}.${decimalPart || '0'}`);
    const rounded = Math.round((isNaN(num) ? 0 : num) * 100) / 100;
    return { display, numeric: rounded };
  }

  // Se não tem vírgula, todos os pontos são considerados separadores de milhar na digitação
  const integerPart = cleaned.replace(/\D/g, '');
  if (!integerPart) {
    return { display: '', numeric: 0 };
  }

  const formattedInt = formatIntPtBr(integerPart);
  const num = parseInt(integerPart, 10);
  return {
    display: formattedInt,
    numeric: isNaN(num) ? 0 : num,
  };
}

/**
 * Normaliza valores colados (ex: "R$ 2.500,50", "2500.50", "2.500,50")
 */
export function normalizePaste(pastedText: string): string {
  if (!pastedText) return '';
  let cleaned = pastedText.replace(/R\$/g, '').trim();

  // Se contém ponto e vírgula (ex: "2.500,50" ou "2,500.50")
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Formato BRL: 2.500,50 -> remove os pontos de milhar
      cleaned = cleaned.replace(/\./g, '');
    } else {
      // Formato US: 2,500.50 -> remove vírgulas e troca ponto por vírgula
      cleaned = cleaned.replace(/,/g, '').replace('.', ',');
    }
  } else if (cleaned.includes('.')) {
    // Apenas ponto: pode ser decimal americano (ex: "2500.50" ou "1.5") ou milhar ("2.500")
    const dotParts = cleaned.split('.');
    if (dotParts.length === 2 && dotParts[1].length <= 2) {
      cleaned = `${dotParts[0].replace(/\D/g, '')},${dotParts[1].replace(/\D/g, '')}`;
    } else {
      cleaned = cleaned.replace(/\./g, '');
    }
  }

  return cleaned;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  label,
  placeholder = '0,00',
  disabled = false,
  required = false,
  className = '',
  error,
  helperText,
  id,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [textValue, setTextValue] = useState<string>(() => (value ? formatToPtBrComplete(value) : ''));
  const inputRef = useRef<HTMLInputElement>(null);
  const nextCursorPosRef = useRef<number | null>(null);

  // Sincroniza com valor externo quando NÃO estiver com foco
  useEffect(() => {
    if (!isFocused) {
      setTextValue(value ? formatToPtBrComplete(value) : '');
    }
  }, [value, isFocused]);

  // Restaura posição do cursor após renderização
  useEffect(() => {
    if (nextCursorPosRef.current !== null && inputRef.current && isFocused) {
      const pos = Math.max(0, Math.min(nextCursorPosRef.current, textValue.length));
      try {
        inputRef.current.setSelectionRange(pos, pos);
      } catch {
        // Ignora caso elemento não suporte seleção
      }
      nextCursorPosRef.current = null;
    }
  }, [textValue, isFocused]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (!value || value === 0) {
      setTextValue('');
    } else {
      setTextValue(formatToPtBrComplete(value));
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.select();
        }
      });
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (value && value > 0) {
      setTextValue(formatToPtBrComplete(value));
    } else {
      setTextValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = inputRef.current;
    if (!input) return;

    // Se o usuário digitou '.' no teclado (ex: teclado numérico), converter para vírgula decimal
    if (e.key === '.') {
      e.preventDefault();
      const { selectionStart, selectionEnd, value: currentVal } = input;
      if (selectionStart !== null && selectionEnd !== null) {
        if (!currentVal.includes(',')) {
          const newVal = currentVal.slice(0, selectionStart) + ',' + currentVal.slice(selectionEnd);
          const { display, numeric } = parseAndFormatTyping(newVal);
          setTextValue(display);
          onChange(numeric);
          nextCursorPosRef.current = display.indexOf(',') + 1;
        }
      }
      return;
    }

    // Interceptar Backspace sobre ponto separador de milhar (ex: "1.|500" -> apaga '1')
    if (e.key === 'Backspace') {
      const { selectionStart, selectionEnd, value: currentVal } = input;
      if (selectionStart !== null && selectionStart === selectionEnd && selectionStart > 0) {
        const charBefore = currentVal[selectionStart - 1];
        if (charBefore === '.') {
          e.preventDefault();
          const newVal = currentVal.slice(0, selectionStart - 2) + currentVal.slice(selectionStart);
          const { display, numeric } = parseAndFormatTyping(newVal);
          setTextValue(display);
          onChange(numeric);
          nextCursorPosRef.current = Math.max(0, selectionStart - 2);
          return;
        }
      }
    }

    // Interceptar Delete sobre ponto separador de milhar (ex: "1|.500" -> apaga '5')
    if (e.key === 'Delete') {
      const { selectionStart, selectionEnd, value: currentVal } = input;
      if (selectionStart !== null && selectionStart === selectionEnd && selectionStart < currentVal.length) {
        const charAfter = currentVal[selectionStart];
        if (charAfter === '.') {
          e.preventDefault();
          const newVal = currentVal.slice(0, selectionStart) + currentVal.slice(selectionStart + 2);
          const { display, numeric } = parseAndFormatTyping(newVal);
          setTextValue(display);
          onChange(numeric);
          nextCursorPosRef.current = selectionStart;
          return;
        }
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const oldCursor = e.target.selectionStart ?? rawValue.length;

    // Se o usuário apagou tudo (Backspace, Delete ou Ctrl+A + Backspace)
    if (!rawValue.trim()) {
      setTextValue('');
      onChange(0);
      nextCursorPosRef.current = 0;
      return;
    }

    // Rastreamento preciso de dígitos antes do cursor
    const charsBeforeCursor = rawValue.slice(0, oldCursor);
    const digitsBeforeCursor = charsBeforeCursor.replace(/\D/g, '').length;
    const hasCommaBeforeCursor = charsBeforeCursor.includes(',');

    // Parser suave sem mutação indevida
    const { display, numeric } = parseAndFormatTyping(rawValue);

    // Calcular nova posição do cursor no texto formatado
    let targetPos = 0;
    if (hasCommaBeforeCursor) {
      const commaIdx = display.indexOf(',');
      if (commaIdx !== -1) {
        const decDigitsCount = charsBeforeCursor.split(',')[1]?.replace(/\D/g, '').length || 0;
        targetPos = commaIdx + 1 + decDigitsCount;
      } else {
        targetPos = display.length;
      }
    } else {
      if (digitsBeforeCursor === 0) {
        targetPos = 0;
      } else {
        let foundDigits = 0;
        for (let i = 0; i < display.length; i++) {
          if (display[i] >= '0' && display[i] <= '9') {
            foundDigits++;
          }
          if (foundDigits === digitsBeforeCursor) {
            targetPos = i + 1;
            break;
          }
        }
        if (foundDigits < digitsBeforeCursor) {
          targetPos = display.indexOf(',') !== -1 ? display.indexOf(',') : display.length;
        }
      }
    }

    nextCursorPosRef.current = targetPos;
    setTextValue(display);
    onChange(numeric);
  };

  // Suporte a Paste limpo e normalizado
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;

    const normalized = normalizePaste(pasted);
    if (normalized) {
      e.preventDefault();
      const { display, numeric } = parseAndFormatTyping(normalized);
      setTextValue(display);
      onChange(numeric);
      nextCursorPosRef.current = display.length;
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div
        className={`flex items-center rounded-xl border bg-white shadow-2xs transition-all ${
          error
            ? 'border-rose-500 ring-3 ring-rose-500/15'
            : isFocused
            ? 'border-emerald-600 ring-3 ring-emerald-500/15'
            : 'border-slate-200/90 hover:border-slate-300'
        } ${disabled ? 'opacity-50 bg-slate-50 cursor-not-allowed' : ''}`}
      >
        <span className="pl-3.5 pr-1.5 text-xs font-bold text-slate-500 select-none font-mono">
          R$
        </span>

        <input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={textValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full py-2.5 pr-3.5 bg-transparent text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none font-mono tabular-nums"
        />
      </div>

      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
      {helperText && !error && (
        <p className="text-[11px] text-slate-500">{helperText}</p>
      )}
    </div>
  );
};
