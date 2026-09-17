import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Receipt,
  Clock,
  Building2,
  LogIn,
  ArrowRight,
} from 'lucide-react';
import { ConsultingPortfolioTotals, ConsultingClientSummary } from '../../types';

interface ConsultingFinancialIndicatorsViewProps {
  summary: ConsultingPortfolioTotals;
  clients: ConsultingClientSummary[];
  onAccessClinic: (tenantId: string, clinicName: string) => void;
  competencyLabel: string;
}

export const ConsultingFinancialIndicatorsView: React.FC<
  ConsultingFinancialIndicatorsViewProps
> = ({ summary, clients, onAccessClinic, competencyLabel }) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  const netResult = summary.total_portfolio_revenue - summary.total_portfolio_expenses;
  const margin =
    summary.total_portfolio_revenue > 0
      ? ((netResult / summary.total_portfolio_revenue) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200/80">
            DRE & Fluxo Consolidado
          </span>
          <span className="text-xs text-slate-500">
            Competência: <strong>{competencyLabel}</strong>
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Indicadores Financeiros da Carteira
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Análise agregada de rentabilidade, receitas operacionais, custos e liquidez das clínicas clientes.
        </p>
      </div>

      {/* KPIs da Carteira */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Receita Total Carteira</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {formatCurrency(summary.total_portfolio_revenue)}
          </p>
          <span className="text-[11px] text-emerald-600 font-medium">Lançamentos faturados</span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Despesas Totais</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {formatCurrency(summary.total_portfolio_expenses)}
          </p>
          <span className="text-[11px] text-slate-400">Custos operacionais</span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold">Resultado Líquido</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className={`text-xl sm:text-2xl font-black ${netResult >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {formatCurrency(netResult)}
          </p>
          <span className="text-[11px] text-slate-500 font-medium">Margem agregada: {margin}%</span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-2xs">
          <div className="flex items-center justify-between text-rose-700 mb-1">
            <span className="text-xs font-semibold">Inadimplência / Atrasos</span>
            <Clock className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-rose-700">
            {formatCurrency(summary.total_portfolio_overdue)}
          </p>
          <span className="text-[11px] text-rose-600 font-bold">A receber + A pagar</span>
        </div>
      </div>

      {/* Tabela de Indicadores por Clínica */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">
            Detalhamento Financeiro por Clínica
          </h3>
          <p className="text-xs text-slate-500">
            Comparação direta de volume, margem de contribuição e pontualidade financeira.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5 pl-5">Clínica</th>
                <th className="p-3.5">Faturamento</th>
                <th className="p-3.5">Despesas</th>
                <th className="p-3.5">Resultado Líquido</th>
                <th className="p-3.5">Margem (%)</th>
                <th className="p-3.5">A Receber</th>
                <th className="p-3.5">A Pagar</th>
                <th className="p-3.5">Atrasos</th>
                <th className="p-3.5 pr-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((clinic) => {
                const res = clinic.monthly_revenue - clinic.monthly_expenses;
                const m = clinic.monthly_revenue > 0 ? ((res / clinic.monthly_revenue) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={clinic.tenant_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 pl-5">
                      <div className="font-bold text-slate-900">{clinic.clinic_name}</div>
                      <div className="text-[11px] text-slate-400">{clinic.owner_name}</div>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-900">{formatCurrency(clinic.monthly_revenue)}</td>
                    <td className="p-3.5 font-mono text-slate-700">{formatCurrency(clinic.monthly_expenses)}</td>
                    <td className={`p-3.5 font-mono font-bold ${res >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {formatCurrency(res)}
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800">{m}%</td>
                    <td className="p-3.5 font-mono text-blue-600">{formatCurrency(clinic.open_receivables)}</td>
                    <td className="p-3.5 font-mono text-amber-600">{formatCurrency(clinic.open_payables)}</td>
                    <td className="p-3.5 font-mono">
                      {clinic.overdue_payables > 0 ? (
                        <span className="text-rose-600 font-bold">{formatCurrency(clinic.overdue_payables)}</span>
                      ) : (
                        <span className="text-emerald-600 font-medium">Em dia</span>
                      )}
                    </td>
                    <td className="p-3.5 pr-5 text-right">
                      <button
                        onClick={() => onAccessClinic(clinic.tenant_id, clinic.clinic_name)}
                        className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-600 text-slate-700 hover:text-white font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-1"
                        title="Acessar painel financeiro da clínica"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Acessar</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
