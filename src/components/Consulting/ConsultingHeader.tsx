import React, { useState, useRef, useEffect } from 'react';
import {
  Briefcase,
  Search,
  LogOut,
  Building2,
  ChevronDown,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Eye,
  Check,
} from 'lucide-react';
import { ConsultingClientSummary } from '../../types';
import { PeriodPicker } from '../UI';

interface ConsultingHeaderProps {
  selectedYear: number;
  selectedMonth: number | 'ALL';
  onChangePeriod: (year: number, month: number | 'ALL') => void;
  clients: ConsultingClientSummary[];
  onInspectSummary: (client: ConsultingClientSummary) => void;
  onAccessClinic: (tenantId: string, clinicName: string) => void;
  title?: string;
  onLogout?: () => void;
}

export const ConsultingHeader: React.FC<ConsultingHeaderProps> = ({
  selectedYear,
  selectedMonth,
  onChangePeriod,
  clients,
  onInspectSummary,
  onAccessClinic,
  title = 'Visão da Carteira',
  onLogout,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isClinicDropdownOpen, setIsClinicDropdownOpen] = useState(false);

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const clinicDropdownRef = useRef<HTMLDivElement>(null);

  // Fechar popovers ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchBoxRef.current && !searchBoxRef.current.contains(target)) {
        setIsSearchOpen(false);
      }
      if (clinicDropdownRef.current && !clinicDropdownRef.current.contains(target)) {
        setIsClinicDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Camada defensiva: garantir que a lista de clientes autorizados seja estritamente única por tenant_id
  const uniqueClients = React.useMemo(() => {
    const seen = new Set<string>();
    return (clients || []).filter((client) => {
      if (!client?.tenant_id || seen.has(client.tenant_id)) return false;
      seen.add(client.tenant_id);
      return true;
    });
  }, [clients]);

  // Filtragem de clientes para a busca
  const filteredClients = React.useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return uniqueClients.filter(
      (c) =>
        c.clinic_name.toLowerCase().includes(term) ||
        (c.trade_name && c.trade_name.toLowerCase().includes(term)) ||
        (c.cnpj && c.cnpj.includes(term)) ||
        c.owner_name.toLowerCase().includes(term)
    );
  }, [uniqueClients, searchTerm]);

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 sm:px-6 lg:px-8 py-3 sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
        {/* Lado Esquerdo: Identificação & Título */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-xl shadow-xs shrink-0 flex items-center justify-center">
            <Briefcase className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
                Modo Consultoria
              </span>
              <span className="text-[11px] text-slate-400 font-medium hidden md:inline">
                Supervisão de Clientes Contaju
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 truncate leading-tight mt-0.5">
              {title}
            </h1>
          </div>
        </div>

        {/* Lado Direito: Seletor de Clínicas, Busca, Seletor de Período Oficial & Operador */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 flex-wrap justify-end">
          {/* Seletor Rápido de Clínicas Autorizadas */}
          <div className="relative" ref={clinicDropdownRef}>
            <button
              type="button"
              onClick={() => setIsClinicDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200/90 hover:border-emerald-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 transition-all cursor-pointer shadow-2xs"
              title="Acesso rápido às clínicas autorizadas"
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline text-slate-500 font-normal">Clínica:</span>
              <span className="truncate max-w-[130px]">Selecionar Clínica</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isClinicDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 text-xs">
                <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  Clínicas Autorizadas ({uniqueClients.length})
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 mt-1">
                  {uniqueClients.map((client) => (
                    <div
                      key={client.tenant_id}
                      className="p-2 hover:bg-emerald-50/70 rounded-xl transition-colors flex items-center justify-between gap-2 group"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 group-hover:text-emerald-900 truncate">
                          {client.clinic_name}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {client.owner_name} {client.cnpj ? `• ${client.cnpj}` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          onAccessClinic(client.tenant_id, client.clinic_name);
                          setIsClinicDropdownOpen(false);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shrink-0 transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                        title="Entrar no sistema completo da clínica"
                      >
                        <span>Entrar</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Busca Rápida de Clínicas ou CNPJ */}
          <div className="relative" ref={searchBoxRef}>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Buscar clínica ou CNPJ..."
                className="w-36 sm:w-52 md:w-60 pl-8.5 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200/90 focus:border-emerald-500 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 placeholder-slate-400"
              />
            </div>

            {/* Dropdown de Busca com Dupla Ação (Ver Resumo & Acessar Clínica) */}
            {isSearchOpen && searchTerm.trim() && (
              <div className="absolute right-0 mt-1.5 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 text-xs">
                <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  Resultados da Busca ({filteredClients.length})
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 mt-1">
                  {filteredClients.length === 0 ? (
                    <div className="p-3 text-center text-slate-500 text-xs">
                      Nenhuma clínica encontrada para "{searchTerm}"
                    </div>
                  ) : (
                    filteredClients.map((client) => (
                      <div
                        key={client.tenant_id}
                        className="p-2.5 rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            {client.clinic_name}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {client.owner_name} {client.cnpj ? `• ${client.cnpj}` : ''}
                          </p>
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[9.5px] font-bold mt-1 ${
                              client.annex === 'III'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {client.annex === 'III' ? 'Anexo III (6%)' : 'Anexo V (15,5%)'}
                          </span>
                        </div>

                        {/* Dupla Ação: Ver Resumo vs Acessar Clínica */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => {
                              onInspectSummary(client);
                              setIsSearchOpen(false);
                              setSearchTerm('');
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700 hover:text-emerald-900 font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                            title="Ver resumo de supervisão sem sair do Modo Consultoria"
                          >
                            <Eye className="w-3 h-3 text-emerald-600" />
                            <span>Resumo</span>
                          </button>
                          <button
                            onClick={() => {
                              onAccessClinic(client.tenant_id, client.clinic_name);
                              setIsSearchOpen(false);
                              setSearchTerm('');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                            title="Entrar no ambiente completo da clínica"
                          >
                            <span>Acessar</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SELETOR DE COMPETÊNCIA PADRÃO DENTAL FINANCE (PeriodPicker sem select nativo) */}
          <PeriodPicker
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onChange={onChangePeriod}
            allowAllMonths={true}
          />

          {/* Identificação do Operador / Escritório Contaju */}
          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
              CJ
            </div>
            <div className="text-left text-xs leading-tight">
              <p className="font-semibold text-slate-900">Escritório Contaju</p>
              <p className="text-[10px] text-emerald-600 font-medium">Supervisor Tributário</p>
            </div>
          </div>

          {/* Logout */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              title="Sair do sistema"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
