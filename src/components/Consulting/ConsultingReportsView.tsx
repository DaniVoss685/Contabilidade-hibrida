import React from 'react';
import {
  FileBarChart2,
  Printer,
  Download,
  Receipt,
  TrendingUp,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { ConsultingPortfolioTotals, ConsultingClientSummary } from '../../types';

interface ConsultingReportsViewProps {
  summary: ConsultingPortfolioTotals;
  clients: ConsultingClientSummary[];
  competencyLabel: string;
}

export const ConsultingReportsView: React.FC<ConsultingReportsViewProps> = ({
  summary,
  clients,
  competencyLabel,
}) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200/80">
              Relatórios Consolidados
            </span>
            <span className="text-xs text-slate-500">
              Competência: <strong>{competencyLabel}</strong>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Relatórios da Carteira Contaju
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Emissão de relatórios consolidados para fechamento contábil e auditoria periódica.
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs self-start sm:self-auto"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Imprimir Relatório</span>
        </button>
      </div>

      {/* Relatório Sintético Consolidado */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-6">
        <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Fechamento Gerencial e Fiscal — Competência {competencyLabel}
            </h3>
            <p className="text-xs text-slate-500">
              Escritório Contaju • Contabilidade Híbrida & Assessoria Odontológica
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Documento Oficial
          </span>
        </div>

        {/* Quadro Síntese */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block">Total de Clínicas</span>
            <strong className="text-base font-black text-slate-900">{summary.total_active_clinics}</strong>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block">Faturamento Agregado</span>
            <strong className="text-base font-black text-slate-900 font-mono">
              {formatCurrency(summary.total_portfolio_revenue)}
            </strong>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block">Despesas Agregadas</span>
            <strong className="text-base font-black text-slate-900 font-mono">
              {formatCurrency(summary.total_portfolio_expenses)}
            </strong>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-slate-400 block">Arrecadação DAS Prevista</span>
            <strong className="text-base font-black text-emerald-700 font-mono">
              {formatCurrency(summary.estimated_total_das)}
            </strong>
          </div>
        </div>

        {/* Detalhamento por Cliente */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3 pl-4">Clínica</th>
                <th className="p-3">CNPJ</th>
                <th className="p-3">Faturamento</th>
                <th className="p-3">Folha</th>
                <th className="p-3">Fator R</th>
                <th className="p-3">Anexo</th>
                <th className="p-3">DAS Previsto</th>
                <th className="p-3 pr-4">Status Geral</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((clinic) => (
                <tr key={clinic.tenant_id} className="hover:bg-slate-50/70">
                  <td className="p-3 pl-4 font-bold text-slate-900">{clinic.clinic_name}</td>
                  <td className="p-3 text-slate-500">{clinic.cnpj || '-'}</td>
                  <td className="p-3 font-mono font-bold text-slate-900">{formatCurrency(clinic.monthly_revenue)}</td>
                  <td className="p-3 font-mono text-slate-700">{formatCurrency(clinic.payroll_amount)}</td>
                  <td className="p-3 font-black text-slate-900">{clinic.r_factor.toFixed(1)}%</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.2 rounded text-[10px] font-extrabold ${
                      clinic.annex === 'III' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      Anexo {clinic.annex}
                    </span>
                  </td>
                  <td className="p-3 font-mono font-bold text-slate-900">
                    {formatCurrency(clinic.monthly_revenue * (clinic.annex === 'III' ? 0.06 : 0.155))}
                  </td>
                  <td className="p-3 pr-4">
                    <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                      clinic.health_status === 'HEALTHY' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
                    }`}>
                      {clinic.health_status === 'HEALTHY' ? 'Regular' : 'Com Pendências'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
