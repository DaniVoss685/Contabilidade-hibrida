import React, { useState } from 'react';
import {
  GitCompare,
  CheckSquare,
  Square,
  Building2,
  TrendingUp,
  TrendingDown,
  Percent,
  LogIn,
} from 'lucide-react';
import { ConsultingClientSummary } from '../../types';

interface ConsultingComparativeViewProps {
  clients: ConsultingClientSummary[];
  onAccessClinic: (tenantId: string, clinicName: string) => void;
  competencyLabel: string;
}

export const ConsultingComparativeView: React.FC<
  ConsultingComparativeViewProps
> = ({ clients, onAccessClinic, competencyLabel }) => {
  // Inicialmente selecionar até 3 clínicas
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    clients.slice(0, 3).map((c) => c.tenant_id)
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length <= 2) return; // Mínimo 2
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    } else {
      if (selectedIds.length >= 5) return; // Máximo 5
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  const comparedClinics = clients.filter((c) => selectedIds.includes(c.tenant_id));

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-50 text-purple-800 border border-purple-200/80">
            Análise Comparativa
          </span>
          <span className="text-xs text-slate-500">
            Competência: <strong>{competencyLabel}</strong>
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Comparativo Direto de Clínicas
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Selecione de 2 a 5 clínicas para comparar métricas operacionais, faturamento e enquadramento tributário lado a lado.
        </p>
      </div>

      {/* Seletor de Clínicas com Checkboxes */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <span className="text-xs font-bold text-slate-700 block mb-2">
          Selecione as clínicas para comparar (mínimo 2, máximo 5):
        </span>
        <div className="flex flex-wrap gap-2">
          {clients.map((c) => {
            const isSelected = selectedIds.includes(c.tenant_id);
            return (
              <button
                key={c.tenant_id}
                onClick={() => toggleSelect(c.tenant_id)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {isSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{c.clinic_name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabela de Comparação Lado a Lado */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5 pl-5 w-48">Métrica de Análise</th>
                {comparedClinics.map((c) => (
                  <th key={c.tenant_id} className="p-3.5 font-bold text-slate-900 text-sm">
                    {c.clinic_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Responsável */}
              <tr>
                <td className="p-3.5 pl-5 font-semibold text-slate-500">Cirurgião Responsável</td>
                {comparedClinics.map((c) => (
                  <td key={c.tenant_id} className="p-3.5 text-slate-800">{c.owner_name}</td>
                ))}
              </tr>

              {/* Faturamento */}
              <tr>
                <td className="p-3.5 pl-5 font-semibold text-slate-500">Faturamento no Mês</td>
                {comparedClinics.map((c) => (
                  <td key={c.tenant_id} className="p-3.5 font-mono font-bold text-slate-900">
                    {formatCurrency(c.monthly_revenue)}
                  </td>
                ))}
              </tr>

              {/* Despesas */}
              <tr>
                <td className="p-3.5 pl-5 font-semibold text-slate-500">Despesas no Mês</td>
                {comparedClinics.map((c) => (
                  <td key={c.tenant_id} className="p-3.5 font-mono text-slate-700">
                    {formatCurrency(c.monthly_expenses)}
                  </td>
                ))}
              </tr>

              {/* Resultado Líquido */}
              <tr>
                <td className="p-3.5 pl-5 font-semibold text-slate-500">Resultado Líquido</td>
                {comparedClinics.map((c) => {
                  const res = c.monthly_revenue - c.monthly_expenses;
                  return (
                    <td key={c.tenant_id} className={`p-3.5 font-mono font-bold ${res >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {formatCurrency(res)}
                    </td>
                  );
                })}
              </tr>

              {/* Margem */}
              <tr>
                <td className="p-3.5 pl-5 font-semibold text-slate-500">Margem Operacional</td>
                {comparedClinics.map((c) => {
                  const res = c.monthly_revenue - c.monthly_expenses;
                  const m = c.monthly_revenue > 0 ? ((res / c.monthly_revenue) * 100).toFixed(1) : '0.0';
                  return (
                    <td key={c.tenant_id} className="p-3.5 font-semibold text-slate-800">
                      {m}%
                    </td>
                  );
                })}
              </tr>

              {/* Fator R */}
              <tr>
                <td className="p-3.5 pl-5 font-semibold text-slate-500">Fator R (%)</td>
                {comparedClinics.map((c) => (
                  <td key={c.tenant_id} className="p-3.5 font-black text-slate-900">
                    <div className="flex items-center gap-1.5">
                      <span>{c.r_factor.toFixed(1)}%</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-extrabold ${
                        c.annex === 'III' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        Anexo {c.annex}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* DAS Estimado */}
              <tr>
                <td className="p-3.5 pl-5 font-semibold text-slate-500">DAS Estimado</td>
                {comparedClinics.map((c) => (
                  <td key={c.tenant_id} className="p-3.5 font-mono font-bold text-slate-900">
                    {formatCurrency(c.monthly_revenue * (c.annex === 'III' ? 0.06 : 0.155))}
                  </td>
                ))}
              </tr>

              {/* Atrasos a Pagar */}
              <tr>
                <td className="p-3.5 pl-5 font-semibold text-slate-500">Contas a Pagar em Atraso</td>
                {comparedClinics.map((c) => (
                  <td key={c.tenant_id} className="p-3.5 font-mono">
                    {c.overdue_payables > 0 ? (
                      <span className="text-rose-600 font-bold">{formatCurrency(c.overdue_payables)}</span>
                    ) : (
                      <span className="text-emerald-700 font-medium">Em dia</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Ação */}
              <tr>
                <td className="p-3.5 pl-5 font-semibold text-slate-500">Ação</td>
                {comparedClinics.map((c) => (
                  <td key={c.tenant_id} className="p-3.5">
                    <button
                      onClick={() => onAccessClinic(c.tenant_id, c.clinic_name)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Acessar</span>
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
