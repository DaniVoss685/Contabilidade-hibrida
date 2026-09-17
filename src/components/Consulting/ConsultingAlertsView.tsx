import React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Building2,
  LogIn,
  Eye,
} from 'lucide-react';
import { ConsultingPriorityAlert, ConsultingClientSummary } from '../../types';

interface ConsultingAlertsViewProps {
  alerts: ConsultingPriorityAlert[];
  clients: ConsultingClientSummary[];
  onInspectSummary: (client: ConsultingClientSummary) => void;
  onAccessClinic: (tenantId: string, clinicName: string) => void;
  competencyLabel: string;
}

export const ConsultingAlertsView: React.FC<ConsultingAlertsViewProps> = ({
  alerts,
  clients,
  onInspectSummary,
  onAccessClinic,
  competencyLabel,
}) => {
  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-50 text-amber-800 border border-amber-200/80">
            Painel de Monitoramento Preventivo
          </span>
          <span className="text-xs text-slate-500">
            Competência: <strong>{competencyLabel}</strong>
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Alertas & Pendências da Carteira
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Centralização de inconformidades tributárias, atrasos financeiros e pendências contábeis que requerem atenção da assessoria.
        </p>
      </div>

      {/* Grid de Alertas */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200/80 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="font-bold text-slate-900 text-sm">
              Nenhuma pendência crítica identificada na competência!
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Todas as clínicas clientes estão enquadradas no Anexo III e sem contas atrasadas relevantes.
            </p>
          </div>
        ) : (
          alerts.map((alert, idx) => {
            const client = clients.find((c) => c.tenant_id === alert.tenant_id);

            return (
              <div
                key={idx}
                className={`p-4.5 rounded-2xl border bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  alert.severity === 'CRITICAL'
                    ? 'border-rose-200 bg-rose-50/20'
                    : 'border-amber-200 bg-amber-50/20'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {alert.severity === 'CRITICAL' ? (
                      <AlertCircle className="w-5 h-5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">{alert.clinic_name}</h4>
                      <span
                        className={`px-2 py-0.2 rounded text-[10px] font-extrabold uppercase ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {alert.severity === 'CRITICAL' ? 'Risco Crítico' : 'Atenção Preventiva'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{alert.message}</p>
                  </div>
                </div>

                {client && (
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <button
                      onClick={() => onInspectSummary(client)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700 hover:text-emerald-900 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ver Resumo</span>
                    </button>

                    <button
                      onClick={() => onAccessClinic(client.tenant_id, client.clinic_name)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Acessar Clínica</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
