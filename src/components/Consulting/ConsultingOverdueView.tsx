import React, { useState, useMemo } from 'react';
import {
  Clock,
  AlertTriangle,
  Building2,
  Filter,
  LogIn,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { ConsultingClientSummary } from '../../types';

interface ConsultingOverdueViewProps {
  clients: ConsultingClientSummary[];
  onAccessClinic: (tenantId: string, clinicName: string) => void;
  competencyLabel: string;
}

export const ConsultingOverdueView: React.FC<ConsultingOverdueViewProps> = ({
  clients,
  onAccessClinic,
  competencyLabel,
}) => {
  const [selectedClinicFilter, setSelectedClinicFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PAY' | 'REC'>('ALL');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  // Gerar lista agregada de itens em atraso a partir dos dados consolidados
  const overdueItems = useMemo(() => {
    const list: {
      id: string;
      tenantId: string;
      clinicName: string;
      type: 'PAY' | 'REC';
      title: string;
      value: number;
      status: string;
    }[] = [];

    clients.forEach((c) => {
      if (c.overdue_payables > 0) {
        list.push({
          id: `pay_${c.tenant_id}`,
          tenantId: c.tenant_id,
          clinicName: c.clinic_name,
          type: 'PAY',
          title: 'Despesas e fornecedores operacionais vencidos',
          value: c.overdue_payables,
          status: 'VENCIDO EM ATRASO',
        });
      }
      if (c.overdue_receivables > 0) {
        list.push({
          id: `rec_${c.tenant_id}`,
          tenantId: c.tenant_id,
          clinicName: c.clinic_name,
          type: 'REC',
          title: 'Parcelas de procedimentos de pacientes em aberto',
          value: c.overdue_receivables,
          status: 'EM ATRASO',
        });
      }
    });

    return list.filter((item) => {
      const matchClinic = selectedClinicFilter === 'ALL' || item.tenantId === selectedClinicFilter;
      const matchType = typeFilter === 'ALL' || item.type === typeFilter;
      return matchClinic && matchType;
    });
  }, [clients, selectedClinicFilter, typeFilter]);

  const totalOverdueFiltered = overdueItems.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-50 text-rose-800 border border-rose-200/80">
              Controle de Inadimplência
            </span>
            <span className="text-xs text-slate-500">
              Competência: <strong>{competencyLabel}</strong>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Contas em Atraso na Carteira
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Acompanhamento centralizado de obrigações a pagar vencidas e recebimentos atrasados de pacientes.
          </p>
        </div>

        {/* Total em Atraso */}
        <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-bold text-rose-900">Total em Atraso Filtrado</span>
            <p className="text-xl font-black text-rose-700 font-mono">
              {formatCurrency(totalOverdueFiltered)}
            </p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500">Filtrar por Clínica:</span>
          <select
            value={selectedClinicFilter}
            onChange={(e) => setSelectedClinicFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="ALL">Todas as Clínicas ({clients.length})</option>
            {clients.map((c) => (
              <option key={c.tenant_id} value={c.tenant_id}>
                {c.clinic_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              typeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setTypeFilter('PAY')}
            className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              typeFilter === 'PAY' ? 'bg-rose-500 text-white shadow-2xs' : 'text-rose-700 hover:bg-rose-100'
            }`}
          >
            A Pagar
          </button>
          <button
            onClick={() => setTypeFilter('REC')}
            className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
              typeFilter === 'REC' ? 'bg-amber-500 text-slate-950 shadow-2xs' : 'text-amber-800 hover:bg-amber-100'
            }`}
          >
            A Receber
          </button>
        </div>
      </div>

      {/* Tabela de Atrasos */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5 pl-5">Clínica</th>
                <th className="p-3.5">Tipo de Movimentação</th>
                <th className="p-3.5">Descrição</th>
                <th className="p-3.5">Valor em Atraso</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 pr-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overdueItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Nenhuma pendência financeira em atraso encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                overdueItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 pl-5 font-bold text-slate-900">{item.clinicName}</td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          item.type === 'PAY'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {item.type === 'PAY' ? 'Contas a Pagar' : 'Contas a Receber'}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600">{item.title}</td>
                    <td className="p-3.5 font-mono font-bold text-rose-600 text-sm">
                      {formatCurrency(item.value)}
                    </td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3.5 pr-5 text-right">
                      <button
                        onClick={() => onAccessClinic(item.tenantId, item.clinicName)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                        title="Entrar na clínica para verificar as contas em atraso"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Acessar Clínica</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
