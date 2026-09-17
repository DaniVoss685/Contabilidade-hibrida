import React from 'react';
import {
  Layers,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Building2,
  LogIn,
} from 'lucide-react';
import { ConsultingClientSummary } from '../../types';

interface ConsultingIntegrationsViewProps {
  clients: ConsultingClientSummary[];
  onAccessClinic: (tenantId: string, clinicName: string) => void;
  competencyLabel: string;
}

export const ConsultingIntegrationsView: React.FC<
  ConsultingIntegrationsViewProps
> = ({ clients, onAccessClinic, competencyLabel }) => {
  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-teal-50 text-teal-800 border border-teal-200/80">
            Conectividade & Sincronização
          </span>
          <span className="text-xs text-slate-500">
            Competência: <strong>{competencyLabel}</strong>
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Integrações Contaju / Contábilex
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Acompanhamento do fluxo contínuo de snapshots fiscais, societários e fechamento contábil mensal.
        </p>
      </div>

      {/* Cards de Clínicas Integradas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((clinic) => {
          const isSynced = clinic.contaju_sync_status === 'SYNCED';

          return (
            <div
              key={clinic.tenant_id}
              className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm truncate">
                      {clinic.clinic_name}
                    </h3>
                    <p className="text-[11px] text-slate-400 truncate">
                      {clinic.cnpj || 'CNPJ não informado'}
                    </p>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                      isSynced
                        ? 'bg-teal-50 text-teal-800 border border-teal-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {isSynced ? 'Conectada & Sincronizada' : 'Pendente de Vínculo'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2 mb-4 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Motor Contábil:</span>
                    <strong className="text-slate-800">Contábilex Core</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Snapshots Realtime:</span>
                    <span className="font-semibold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ativo
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Competências:</span>
                    <strong className="text-slate-700">{competencyLabel}</strong>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Canal Seguro RLS</span>
                <button
                  onClick={() => onAccessClinic(clinic.tenant_id, clinic.clinic_name)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-600 text-slate-700 hover:text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
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
