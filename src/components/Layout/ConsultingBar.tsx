import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Building2,
  ChevronDown,
  Search,
  Check,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { DentalTenantOption } from '../../types';

interface ConsultingBarProps {
  activeClinicName: string;
  activeProfessionalName?: string;
  availableClinics: DentalTenantOption[];
  currentTenantId?: string;
  isSupportActive: boolean;
  isSwitching: boolean;
  onSelectClinic: (tenantId: string) => void;
  onReturnToPrimary: () => void;
}

export const ConsultingBar: React.FC<ConsultingBarProps> = ({
  activeClinicName,
  availableClinics,
  currentTenantId,
  isSupportActive,
  isSwitching,
  onSelectClinic,
  onReturnToPrimary,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Camada defensiva: garantir que a coleção de clínicas seja estritamente única por tenant_id
  const uniqueClinics = useMemo(() => {
    const seen = new Set<string>();
    return availableClinics.filter((clinic) => {
      if (!clinic?.tenant_id || seen.has(clinic.tenant_id)) return false;
      seen.add(clinic.tenant_id);
      return true;
    });
  }, [availableClinics]);

  const filteredClinics = uniqueClinics.filter((clinic) => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return true;
    const matchClinic = (clinic.clinic_name || '').toLowerCase().includes(query);
    const matchTrade = (clinic.trade_name || '').toLowerCase().includes(query);
    const matchOwner = (clinic.owner_name || '').toLowerCase().includes(query);
    const matchEmail = (clinic.owner_email || '').toLowerCase().includes(query);
    return matchClinic || matchTrade || matchOwner || matchEmail;
  });

  return (
    <div className="bg-gradient-to-r from-emerald-50/90 via-slate-50/95 to-emerald-50/80 border-b border-emerald-200/80 px-4 sm:px-6 py-2 min-h-[52px] flex items-center justify-between relative z-40 backdrop-blur-xs">
      {/* Bloco Central Unificado */}
      <div className="w-full flex items-center justify-between gap-3">
        {/* Lado Esquerdo / Central: Badge e Contexto */}
        <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap justify-center">
          {/* Pill Verde: Modo Consultoria ativado */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100/90 text-emerald-900 border border-emerald-300 shadow-2xs shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>Modo Consultoria ativado</span>
          </div>

          <span className="hidden sm:inline text-emerald-300 select-none">•</span>

          {/* Seletor Integrado da Clínica Ativa */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => !isSwitching && setIsOpen((prev) => !prev)}
              disabled={isSwitching}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer shadow-2xs ${
                isOpen
                  ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'bg-white/95 hover:bg-white border-emerald-200 hover:border-emerald-300'
              } ${isSwitching ? 'opacity-70 cursor-wait' : ''}`}
              title="Clique para alternar de clínica"
            >
              <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shrink-0">
                {isSwitching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                ) : (
                  <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                )}
              </div>

              <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                Clínica ativa:
              </span>

              {(() => {
                const found = availableClinics.find((c) => c.tenant_id === currentTenantId);
                const resolvedName =
                  (activeClinicName && activeClinicName !== 'Clínica sem nome' ? activeClinicName : '') ||
                  found?.clinic_name ||
                  found?.trade_name ||
                  (activeClinicName ? activeClinicName : 'Selecione uma clínica');

                return (
                  <span className="text-xs font-bold text-slate-900 truncate max-w-[180px] sm:max-w-[240px]">
                    {resolvedName}
                  </span>
                );
              })()}

              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ml-0.5 ${
                  isOpen ? 'rotate-180 text-emerald-600' : ''
                }`}
              />
            </button>

            {/* Popover Customizado com Busca */}
            {isOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 top-full mt-2 w-[310px] sm:w-[350px] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="p-3 border-b border-slate-100 bg-slate-50/70">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 tracking-tight">Trocar Clínica</span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded-md">
                      {uniqueClinics.length} autorizada{uniqueClinics.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar por clínica ou responsável..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto p-1.5 divide-y divide-slate-100/60">
                  {filteredClinics.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      Nenhuma clínica encontrada para &ldquo;{searchTerm}&rdquo;.
                    </div>
                  ) : (
                    filteredClinics.map((clinic) => {
                      const isCurrent =
                        clinic.tenant_id === currentTenantId ||
                        (clinic.clinic_name && clinic.clinic_name === activeClinicName);

                      return (
                        <button
                          key={clinic.tenant_id}
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            if (!isCurrent) {
                              onSelectClinic(clinic.tenant_id);
                            }
                          }}
                          className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2.5 group ${
                            isCurrent
                              ? 'bg-emerald-50/80 border border-emerald-200/80 text-emerald-950 font-semibold'
                              : 'hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                              {clinic.clinic_name}
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                              {clinic.owner_name || clinic.trade_name || clinic.owner_email || 'Cirurgião-Dentista'}
                            </div>
                          </div>

                          {isCurrent && (
                            <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Ação de Retorno à Carteira */}
        {isSupportActive && (
          <button
            type="button"
            onClick={onReturnToPrimary}
            disabled={isSwitching}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-white hover:bg-emerald-600 text-emerald-800 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 border border-emerald-300 hover:border-emerald-600 shadow-2xs group"
            title="Encerrar acesso à clínica e retornar à visão consolidada da carteira"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform text-emerald-700 group-hover:text-white" />
            <span>Voltar para Carteira</span>
          </button>
        )}
      </div>
    </div>
  );
};
