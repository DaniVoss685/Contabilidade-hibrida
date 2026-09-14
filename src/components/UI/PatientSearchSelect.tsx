import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, User, Phone, X, Plus } from 'lucide-react';
import { Patient } from '../../types';
import { formatCpf, formatPhone, normalizeSearchText } from '../../lib/masks';
import { Portal } from './Portal';
import { useFloatingPosition } from './useFloatingPosition';

interface PatientSearchSelectProps {
  patients: Patient[];
  value: string; // Patient ID
  onChange: (patient: Patient) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string;
  onAddNew?: () => void;
}

export const PatientSearchSelect: React.FC<PatientSearchSelectProps> = ({
  patients,
  value,
  onChange,
  label = 'Paciente / Beneficiário',
  placeholder = 'Buscar por nome, CPF ou telefone...',
  required = false,
  disabled = false,
  className = '',
  error,
  onAddNew,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedPatient = patients.find((p) => p.id === value);

  const { coords } = useFloatingPosition(triggerRef, isOpen, {
    estimatedHeight: 280,
    matchWidth: true,
    gap: 6,
  });

  // Filter patients based on query with diacritics normalization & safe CPF digits
  const filteredPatients = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return patients;

    const normQuery = normalizeSearchText(trimmed);
    const digitsOnly = trimmed.replace(/\D/g, '');

    return patients.filter((p) => {
      const nameMatch = normalizeSearchText(p.name).includes(normQuery);
      const cleanCpf = p.cpf.replace(/\D/g, '');
      const cpfMatch = digitsOnly.length >= 3 && cleanCpf.includes(digitsOnly);
      const cleanPhone = (p.phone || '').replace(/\D/g, '');
      const phoneMatch = digitsOnly.length >= 3 && cleanPhone.length > 0 && cleanPhone.includes(digitsOnly);

      return nameMatch || cpfMatch || phoneMatch;
    });
  }, [patients, query]);

  // Sync display with selection or reset
  useEffect(() => {
    if (selectedPatient && !isOpen) {
      setQuery('');
    }
  }, [selectedPatient, isOpen]);

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
          prev < filteredPatients.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredPatients.length - 1
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredPatients.length) {
          handleSelect(filteredPatients[highlightedIndex]);
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
  }, [isOpen, filteredPatients, highlightedIndex]);

  const handleSelect = (patient: Patient) => {
    onChange(patient);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuery('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className={`relative space-y-1.5 ${className}`} ref={triggerRef}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-700">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          {onAddNew && (
            <button
              type="button"
              onClick={onAddNew}
              className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Paciente</span>
            </button>
          )}
        </div>
      )}

      {/* Trigger & Search Input */}
      <div
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            inputRef.current?.focus();
          }
        }}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-white border rounded-xl text-xs font-medium transition-all cursor-text shadow-2xs ${
          error
            ? 'border-rose-500 ring-3 ring-rose-500/15'
            : isOpen
            ? 'border-emerald-600 ring-3 ring-emerald-500/15'
            : 'border-slate-200/90 hover:border-slate-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden flex-1">
          <Search className={`w-4 h-4 flex-shrink-0 ${isOpen ? 'text-emerald-600' : 'text-slate-400'}`} />

          {isOpen ? (
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              placeholder={selectedPatient ? `${selectedPatient.name} — digite para buscar...` : placeholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              className="w-full bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none text-xs font-medium"
            />
          ) : selectedPatient ? (
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-slate-900 truncate">{selectedPatient.name}</span>
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md flex-shrink-0">
                CPF: {formatCpf(selectedPatient.cpf, false)}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 font-normal truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-emerald-600' : ''
            }`}
          />
        </div>
      </div>

      {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}

      {/* Floating Popover List */}
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
              minWidth: '280px',
              maxWidth: '90vw',
              zIndex: 99999,
            }}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-1.5 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-72 overflow-hidden"
          >
            {/* Live Count Header */}
            <div className="px-3.5 py-1.5 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <span>{filteredPatients.length} {filteredPatients.length === 1 ? 'paciente' : 'pacientes'}</span>
              <span>Busca por Nome ou CPF</span>
            </div>

            {/* Patients list */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
              {filteredPatients.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-slate-500 font-medium">Nenhum paciente encontrado para "{query}"</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tente buscar por partes do nome ou números do CPF</p>
                  {onAddNew && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onAddNew();
                      }}
                      className="mt-3 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-emerald-100 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Cadastrar Novo Paciente</span>
                    </button>
                  )}
                </div>
              ) : (
                filteredPatients.map((patient, index) => {
                  const isSelected = patient.id === value;
                  const isHighlighted = highlightedIndex === index;

                  const initials = patient.name
                    .split(' ')
                    .map((n) => n[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <button
                      type="button"
                      key={patient.id}
                      onClick={() => handleSelect(patient)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`w-full px-3.5 py-2.5 text-xs text-left flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50/80 text-emerald-950 font-bold'
                          : isHighlighted
                          ? 'bg-slate-100/70 text-slate-900'
                          : 'text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                            isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {initials}
                        </div>

                        <div className="truncate">
                          <div className="font-bold text-slate-900 truncate text-xs">{patient.name}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-mono">
                            <span>CPF: {formatCpf(patient.cpf, false)}</span>
                            {patient.phone && (
                              <>
                                <span>•</span>
                                <span>{formatPhone(patient.phone)}</span>
                              </>
                            )}
                          </div>
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
