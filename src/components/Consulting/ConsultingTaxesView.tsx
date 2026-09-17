import React from 'react';
import {
  Receipt,
  Percent,
  Calculator,
  ShieldCheck,
  AlertTriangle,
  LogIn,
  CheckCircle2,
} from 'lucide-react';
import { ConsultingPortfolioTotals, ConsultingClientSummary } from '../../types';

interface ConsultingTaxesViewProps {
  summary: ConsultingPortfolioTotals;
  clients: ConsultingClientSummary[];
  onAccessClinic: (tenantId: string, clinicName: string) => void;
  competencyLabel: string;
}

export const ConsultingTaxesView: React.FC<ConsultingTaxesViewProps> = ({
  summary,
  clients,
  onAccessClinic,
  competencyLabel,
}) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200/80">
            Inteligência Fiscal Odontológica
          </span>
          <span className="text-xs text-slate-500">
            Competência: <strong>{competencyLabel}</strong>
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Supervisão Tributária & Fator R da Carteira
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Monitoramento preventivo do gatilho legal dos 28% do Simples Nacional e estimativa de arrecadação do DAS.
        </p>
      </div>

      {/* Cards de Resumo Tributário */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-900 mb-1">
            <span className="text-xs font-bold">Enquadradas no Anexo III</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-800">
            {summary.annex_iii_count} clínicas
          </p>
          <span className="text-[11px] text-emerald-700">Fator R ≥ 28,0% (Alíquota base 6,0%)</span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-2xs">
          <div className="flex items-center justify-between text-amber-900 mb-1">
            <span className="text-xs font-bold">Enquadradas no Anexo V</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-800">
            {summary.annex_v_count} clínicas
          </p>
          <span className="text-[11px] text-amber-700">Fator R &lt; 28,0% (Alíquota base 15,5%)</span>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-semibold">DAS Consolidado Estimado</span>
            <Receipt className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(summary.estimated_total_das)}
          </p>
          <span className="text-[11px] text-slate-400">Guia única Simples Nacional</span>
        </div>
      </div>

      {/* Tabela de Fator R por Clínica */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">
            Auditoria de Fator R e Alíquotas por Clínica
          </h3>
          <p className="text-xs text-slate-500">
            Proporção real de folha de pagamento e impacto tributário direto na competência.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5 pl-5">Clínica / CNPJ</th>
                <th className="p-3.5">RBT12 (12 meses)</th>
                <th className="p-3.5">Valor da Folha (12m)</th>
                <th className="p-3.5">Fator R Atual</th>
                <th className="p-3.5">Enquadramento</th>
                <th className="p-3.5">Alíquota Efetiva</th>
                <th className="p-3.5">Faturamento no Mês</th>
                <th className="p-3.5">DAS Estimado</th>
                <th className="p-3.5 pr-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.map((clinic) => {
                const rbt12Val = clinic.rbt12 ?? 0;
                const fs12Val = clinic.fs12 ?? clinic.payroll_amount ?? 0;
                const effectiveRateVal =
                  clinic.effective_rate !== undefined && clinic.effective_rate > 0
                    ? clinic.effective_rate
                    : clinic.annex === 'III'
                    ? 6.0
                    : 15.5;
                const dasEstimado =
                  clinic.estimated_das !== undefined && clinic.estimated_das > 0
                    ? clinic.estimated_das
                    : clinic.monthly_revenue * (effectiveRateVal / 100);

                return (
                  <tr key={clinic.tenant_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3.5 pl-5">
                      <div className="font-bold text-slate-900">{clinic.clinic_name}</div>
                      <div className="text-[11px] text-slate-400">{clinic.cnpj || 'CNPJ não informado'}</div>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-900" title="Receita Bruta dos últimos 12 meses anteriores">
                      {formatCurrency(rbt12Val)}
                    </td>
                    <td className="p-3.5 font-mono font-medium text-slate-700" title="Folha acumulada dos últimos 12 meses anteriores (FS12)">
                      {formatCurrency(fs12Val)}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black ${
                          clinic.r_factor >= 28.0
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                            : 'bg-amber-50 text-amber-800 border border-amber-200/80'
                        }`}
                      >
                        {clinic.r_factor.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          clinic.annex === 'III'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        Anexo {clinic.annex}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-700 font-mono">
                      {effectiveRateVal.toFixed(2)}%
                    </td>
                    <td className="p-3.5 font-mono text-slate-800">{formatCurrency(clinic.monthly_revenue)}</td>
                    <td className="p-3.5 font-mono font-bold text-slate-900">{formatCurrency(dasEstimado)}</td>
                    <td className="p-3.5 pr-5 text-right">
                      <button
                        onClick={() => onAccessClinic(clinic.tenant_id, clinic.clinic_name)}
                        className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-600 text-slate-700 hover:text-white font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-1"
                        title="Acessar painel fiscal da clínica"
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
