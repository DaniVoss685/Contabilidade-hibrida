import React, { useState, useMemo } from 'react';
import {
  Building2,
  Search,
  Filter,
  ArrowRight,
  LogIn,
  Eye,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  Receipt,
} from 'lucide-react';
import { ConsultingClientSummary } from '../../types';

interface ConsultingClinicsViewProps {
  clients: ConsultingClientSummary[];
  onInspectSummary: (client: ConsultingClientSummary) => void;
  onAccessClinic: (tenantId: string, clinicName: string) => void;
  competencyLabel: string;
}

export const ConsultingClinicsView: React.FC<ConsultingClinicsViewProps> = ({
  clients,
  onInspectSummary,
  onAccessClinic,
  competencyLabel,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAnnex, setFilterAnnex] = useState<'ALL' | 'III' | 'V'>('ALL');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  const filteredClinics = useMemo(() => {
    return clients.filter((c) => {
      const matchSearch =
        c.clinic_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.trade_name && c.trade_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.cnpj && c.cnpj.includes(searchTerm)) ||
        c.owner_name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchAnnex =
        filterAnnex === 'ALL' ||
        (filterAnnex === 'III' && c.annex === 'III') ||
        (filterAnnex === 'V' && c.annex === 'V');

      return matchSearch && matchAnnex;
    });
  }, [clients, searchTerm, filterAnnex]);

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200/80">
              Gestão da Carteira
            </span>
            <span className="text-xs text-slate-500">
              Competência: <strong>{competencyLabel}</strong>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Clínicas Clientes Supervisionadas
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Visualize o panorama geral de cada clínica ou acesse o ambiente operacional completo.
          </p>
        </div>

        {/* Filtros e Busca */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar clínica ou CNPJ..."
              className="pl-8.5 pr-3 py-1.5 text-xs bg-white border border-slate-200/90 focus:border-emerald-500 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 w-48 sm:w-64"
            />
          </div>

          <div className="flex items-center bg-white border border-slate-200 p-0.5 rounded-xl text-xs">
            <button
              onClick={() => setFilterAnnex('ALL')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterAnnex === 'ALL' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterAnnex('III')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterAnnex === 'III' ? 'bg-emerald-100 text-emerald-900' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Anexo III
            </button>
            <button
              onClick={() => setFilterAnnex('V')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterAnnex === 'V' ? 'bg-amber-100 text-amber-900' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Anexo V
            </button>
          </div>
        </div>
      </div>

      {/* Grid de Cards de Clínicas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClinics.map((clinic) => {
          const resultado = clinic.monthly_revenue - clinic.monthly_expenses;
          return (
            <div
              key={clinic.tenant_id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:border-emerald-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 shrink-0 font-bold text-sm">
                      {clinic.clinic_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 text-sm truncate">
                        {clinic.clinic_name}
                      </h3>
                      <p className="text-[11px] text-slate-400 truncate">
                        {clinic.cnpj || 'CNPJ não informado'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                      clinic.health_status === 'HEALTHY'
                        ? 'bg-emerald-100 text-emerald-800'
                        : clinic.health_status === 'WARNING'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {clinic.health_status === 'HEALTHY'
                      ? 'Saudável'
                      : clinic.health_status === 'WARNING'
                      ? 'Atenção'
                      : 'Crítica'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 space-y-2 mb-4 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Responsável:</span>
                    <strong className="text-slate-800">{clinic.owner_name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Faturamento:</span>
                    <strong className="text-slate-900 font-mono">{formatCurrency(clinic.monthly_revenue)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Despesas:</span>
                    <strong className="text-slate-700 font-mono">{formatCurrency(clinic.monthly_expenses)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fator R:</span>
                    <span className="font-bold flex items-center gap-1">
                      <strong className="text-slate-900">{clinic.r_factor.toFixed(1)}%</strong>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold ${
                        clinic.annex === 'III' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        Anexo {clinic.annex}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Atrasos a Pagar:</span>
                    <strong className={`font-mono ${clinic.overdue_payables > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                      {formatCurrency(clinic.overdue_payables)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => onInspectSummary(clinic)}
                  className="flex-1 py-2 px-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700 hover:text-emerald-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Ver dados cadastrais e resumo contábil"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Ver Resumo</span>
                </button>

                <button
                  onClick={() => onAccessClinic(clinic.tenant_id, clinic.clinic_name)}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  title="Entrar no Dental Finance completo da clínica"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Acessar Clínica</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
