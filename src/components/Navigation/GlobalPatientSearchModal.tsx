import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, User, Phone, Calendar, X, CornerDownLeft } from 'lucide-react';
import { Patient, Sale } from '../../types';
import { formatCpf, normalizeSearchText, matchDocumentSearch } from '../../lib/masks';

interface GlobalPatientSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  sales: Sale[];
  onSelectPatient: (patient: Patient) => void;
  clinicDisplayName?: string;
}

export const GlobalPatientSearchModal: React.FC<GlobalPatientSearchModalProps> = ({
  isOpen,
  onClose,
  patients,
  sales,
  onSelectPatient,
  clinicDisplayName,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input automatically when opened and reset search
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Pre-calculate patient sales metadata for quick lookup (last sale / consultation)
  const patientMetadata = useMemo(() => {
    const meta = new Map<string, { lastDate?: string; salesCount: number }>();
    for (const sale of sales) {
      const existing = meta.get(sale.patientId) || { salesCount: 0 };
      existing.salesCount += 1;
      if (!existing.lastDate || sale.date > existing.lastDate) {
        existing.lastDate = sale.date;
      }
      meta.set(sale.patientId, existing);
    }
    return meta;
  }, [sales]);

  // Filtered patients (strict scoped to current clinic's patients)
  const filteredPatients = useMemo(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      // Show first 8 most recent or alphabetical patients
      return patients.slice(0, 8);
    }

    const normQuery = normalizeSearchText(trimmed);
    const searchDigits = trimmed.replace(/\D/g, '');

    return patients.filter((p) => {
      const nameMatch = normalizeSearchText(p.name).includes(normQuery);
      const cpfMatch = matchDocumentSearch(p.cpf, trimmed);
      const phoneDigits = (p.phone || '').replace(/\D/g, '');
      const phoneMatch = searchDigits.length >= 3 && phoneDigits.includes(searchDigits);
      return nameMatch || cpfMatch || phoneMatch;
    }).slice(0, 15);
  }, [patients, searchTerm]);

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && listRef.current.children[selectedIndex]) {
      const element = listRef.current.children[selectedIndex] as HTMLElement;
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (filteredPatients.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredPatients.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredPatients.length) % filteredPatients.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const patient = filteredPatients[selectedIndex];
      if (patient) {
        onSelectPatient(patient);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="relative border-b border-slate-200 px-4 py-3.5 flex items-center gap-3 bg-white">
          <Search className="w-5 h-5 text-emerald-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, CPF ou telefone do paciente..."
            className="w-full text-sm text-slate-900 placeholder:text-slate-400 bg-transparent outline-none font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-semibold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-500">
            ESC para fechar
          </kbd>
        </div>

        {/* Scope context pill */}
        <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Buscando em: <strong className="text-slate-800 font-semibold">{clinicDisplayName || 'Clínica Atual'}</strong>
          </span>
          <span>{filteredPatients.length} {filteredPatients.length === 1 ? 'paciente' : 'pacientes'}</span>
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 p-1.5">
          {filteredPatients.length === 0 ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <User className="w-8 h-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Nenhum paciente encontrado</p>
              <p className="text-xs text-slate-400 max-w-xs">
                {searchTerm
                  ? `Nenhum registro corresponde a "${searchTerm}". Tente buscar por outros termos.`
                  : 'Nenhum paciente cadastrado nesta clínica.'}
              </p>
            </div>
          ) : (
            filteredPatients.map((patient, idx) => {
              const isSelected = idx === selectedIndex;
              const meta = patientMetadata.get(patient.id);

              return (
                <div
                  key={patient.id}
                  onClick={() => {
                    onSelectPatient(patient);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full px-3.5 py-3 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-emerald-50/90 text-emerald-950' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {patient.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm truncate">{patient.name}</span>
                        {patient.cpf && (
                          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                            {formatCpf(patient.cpf)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                        {patient.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{patient.phone}</span>
                          </span>
                        )}
                        {meta && meta.lastDate && (
                          <span className="flex items-center gap-1 text-[11px] text-slate-400 hidden sm:flex">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>Último proc.: {meta.lastDate.split('-').reverse().join('/')}</span>
                          </span>
                        )}
                        {meta && meta.salesCount > 0 && (
                          <span className="text-[11px] text-emerald-700 font-semibold hidden sm:inline">
                            {meta.salesCount} {meta.salesCount === 1 ? 'atendimento' : 'atendimentos'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isSelected && (
                      <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                        <span>Acessar</span>
                        <CornerDownLeft className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded text-[10px] text-slate-600">↑</kbd>{' '}
              <kbd className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded text-[10px] text-slate-600">↓</kbd> navegar
            </span>
            <span>
              <kbd className="font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-600">Enter</kbd> abrir
            </span>
          </div>
          <span>Dental Finance • Busca Rápida</span>
        </div>
      </div>
    </div>
  );
};
