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
 * Converte string bruta (com dígitos, pontos ou vírgulas) em número e string formatada suavemente
 */
export function parseAndFormatTyping(rawInput: string): { display: string; numeric: number } {
  if (!rawInput) {
    return { display: '', numeric: 0 };
  }

  // Remove caracteres que não sejam dígitos, vírgula ou ponto
  const sanitized = rawInput.replace(/[^\d,\.]/g, '');
  if (!sanitized) {
    return { display: '', numeric: 0 };
  }

  let integerPartRaw = '';
  let decimalPartRaw: string | null = null;

  if (sanitized.includes(',')) {
    const parts = sanitized.split(',');
    integerPartRaw = parts[0].replace(/\D/g, '');
    decimalPartRaw = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);
  } else if (sanitized.includes('.')) {
    const dotParts = sanitized.split('.');
    if (dotParts.length === 2 && dotParts[1].length <= 2 && !dotParts[0].includes('.')) {
      integerPartRaw = dotParts[0].replace(/\D/g, '');
      decimalPartRaw = dotParts[1].replace(/\D/g, '').slice(0, 2);
    } else {
      integerPartRaw = sanitized.replace(/\D/g, '');
    }
  } else {
    integerPartRaw = sanitized.replace(/\D/g, '');
  }

  if (!integerPartRaw && decimalPartRaw === null) {
    return { display: '', numeric: 0 };
  }

  const intNum = parseInt(integerPartRaw || '0', 10);
  const formattedInt = integerPartRaw ? intNum.toLocaleString('pt-BR') : '0';

  let display = '';
  let numeric = 0;

  if (decimalPartRaw !== null) {
    display = `${formattedInt},${decimalPartRaw}`;
    const decimalNum = parseFloat(`${intNum}.${decimalPartRaw || '0'}`);
    numeric = isNaN(decimalNum) ? 0 : decimalNum;
  } else {
    display = formattedInt;
    numeric = intNum;
  }

  return { display, numeric };
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
        // Ignora caso elemento não suporte
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

    // Contar dígitos antes do cursor no texto anterior para preservar a posição
    const charsBeforeCursor = rawValue.slice(0, oldCursor);
    const digitsBeforeCursor = charsBeforeCursor.replace(/\D/g, '').length;
    const hasCommaBeforeCursor = charsBeforeCursor.includes(',');

    // Parser suave
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

    nextCursorPosRef.current = targetPos;
    setTextValue(display);
    onChange(numeric);
  };

  // Suporte a Paste limpo
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;

    const cleaned = pasted.replace(/[^\d,\.]/g, '');
    if (cleaned) {
      e.preventDefault();
      const { display, numeric } = parseAndFormatTyping(cleaned);
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
