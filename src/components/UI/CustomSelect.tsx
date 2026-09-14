import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { Portal } from './Portal';
import { useFloatingPosition } from './useFloatingPosition';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  error?: string;
  helperText?: string;
  searchable?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = 'Selecione uma opção...',
  disabled = false,
  required = false,
  className = '',
  error,
  helperText,
  searchable,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const shouldSearch = searchable ?? options.length > 5;

  const { coords } = useFloatingPosition(triggerRef, isOpen, {
    estimatedHeight: Math.min(320, options.length * 40 + (shouldSearch ? 50 : 20)),
    matchWidth: true,
    gap: 6,
  });

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = useMemo(() => {
    if (!shouldSearch || !searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        (opt.description && opt.description.toLowerCase().includes(term))
    );
  }, [options, shouldSearch, searchTerm]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(-1);
      if (shouldSearch) {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    } else {
      setSearchTerm('');
    }
  }, [isOpen, shouldSearch]);

  // Handle outside click & escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        setIsOpen(false);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredOptions.length - 1
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleSelect(filteredOptions[highlightedIndex].value);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, filteredOptions, highlightedIndex]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className={`relative space-y-1.5 ${className}`} ref={triggerRef}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-xs font-medium transition-all text-left shadow-2xs ${
          error
            ? 'border-rose-500 ring-3 ring-rose-500/15'
            : isOpen
            ? 'border-emerald-600 ring-3 ring-emerald-500/15'
            : 'border-slate-200/90 hover:border-slate-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          {selectedOption?.icon && (
            <span className="text-slate-500 flex-shrink-0">{selectedOption.icon}</span>
          )}
          <span className={`truncate ${selectedOption ? 'text-slate-900 font-semibold' : 'text-slate-400 font-normal'}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-emerald-600' : ''
          }`}
        />
      </button>

      {/* Helper text or error */}
      {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}
      {!error && helperText && (
        <p className="text-[11px] text-slate-500">{helperText}</p>
      )}

      {/* Popover Dropdown rendered via Portal */}
      {isOpen && (
        <Portal>
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: `${coords.left}px`,
              width: coords.width ? `${coords.width}px` : 'auto',
              minWidth: '240px',
              maxWidth: '90vw',
              zIndex: 99999,
            }}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-1.5 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-72"
          >
            {/* Search Filter if options > 5 */}
            {shouldSearch && (
              <div className="px-2.5 pb-2 pt-1 border-b border-slate-100">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Filtrar opções..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-500"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
              {filteredOptions.length === 0 ? (
                <div className="px-3.5 py-4 text-xs text-slate-400 text-center">
                  Nenhuma opção encontrada
                </div>
              ) : (
                filteredOptions.map((opt, index) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = highlightedIndex === index;

                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => handleSelect(opt.value)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full px-3.5 py-2.5 text-xs text-left flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50/80 text-emerald-950 font-bold'
                          : isHighlighted
                          ? 'bg-slate-100/70 text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        {opt.icon && (
                          <span className={isSelected ? 'text-emerald-700' : 'text-slate-400'}>
                            {opt.icon}
                          </span>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{opt.label}</span>
                            {opt.badge && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          {opt.description && (
                            <span className="block text-[11px] text-slate-400 font-normal leading-tight mt-0.5">
                              {opt.description}
                            </span>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};
