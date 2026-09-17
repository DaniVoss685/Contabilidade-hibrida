import React, { useState } from 'react';
import {
  X,
  Building2,
  Receipt,
  TrendingUp,
  AlertTriangle,
  Clock,
  Layers,
  ShieldCheck,
  CheckCircle2,
  LogIn,
  Info,
} from 'lucide-react';
import { ConsultingClientSummary } from '../../types';

interface ConsultingClientSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ConsultingClientSummary | null;
  competency: string;
  onAccessClinic: (tenantId: string, clinicName: string) => void;
}

export const ConsultingClientSummaryModal: React.FC<
  ConsultingClientSummaryModalProps
> = ({ isOpen, onClose, client, competency, onAccessClinic }) => {
  const [activeTab, setActiveTab] = useState<'cadastral' | 'financial' | 'taxes' | 'alerts'>('cadastral');

  if (!isOpen || !client) return null;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header do Modal */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 font-black text-base shadow-2xs">
              {client.clinic_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-slate-900 truncate">
                  {client.clinic_name}
                </h3>
                <span
                  className={`px-2 py-0.2 rounded text-[10px] font-extrabold shrink-0 ${
                    client.health_status === 'HEALTHY'
                      ? 'bg-emerald-100 text-emerald-800'
                      : client.health_status === 'WARNING'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {client.health_status === 'HEALTHY' ? 'Saudável' : client.health_status === 'WARNING' ? 'Atenção' : 'Crítica'}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                CNPJ: <strong>{client.cnpj || 'Não informado'}</strong> • Competência: <strong>{competency}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Fechar resumo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas Internas do Resumo */}
        <div className="flex items-center gap-1 border-b border-slate-100 px-6 pt-3 bg-white overflow-x-auto">
          {[
            { id: 'cadastral', label: 'Dados & Diagnóstico', icon: Building2 },
            { id: 'financial', label: 'Financeiro', icon: TrendingUp },
            { id: 'taxes', label: 'Impostos & Fator R', icon: Receipt },
            { id: 'alerts', label: 'Pendências', icon: AlertTriangle },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                  isActive
                    ? 'border-emerald-600 text-emerald-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Conteúdo do Modal */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'cadastral' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-400 block">Faturamento</span>
                  <strong className="text-sm font-black text-slate-900 font-mono">
                    {formatCurrency(client.monthly_revenue)}
                  </strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-400 block">Despesas</span>
                  <strong className="text-sm font-black text-slate-900 font-mono">
                    {formatCurrency(client.monthly_expenses)}
                  </strong>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-400 block">Fator R</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <strong className="text-sm font-black text-slate-900">
                      {client.r_factor.toFixed(1)}%
                    </strong>
                    <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-extrabold ${
                      client.annex === 'III' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      Anexo {client.annex}
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-400 block">Atrasos a Pagar</span>
                  <strong className={`text-sm font-black font-mono ${client.overdue_payables > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                    {formatCurrency(client.overdue_payables)}
                  </strong>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 mb-2">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  Informações Societárias & Contato
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block">Razão Social:</span>
                    <span className="font-semibold text-slate-800">{client.clinic_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Responsável Clínico:</span>
                    <span className="font-semibold text-slate-800">{client.owner_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">E-mail:</span>
                    <span className="text-slate-700">{client.owner_email || 'Não informado'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Telefone:</span>
                    <span className="text-slate-700">{client.owner_phone || 'Não informado'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 text-xs space-y-1.5">
                <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Diagnóstico Contábil Contaju
                </span>
                <p className="text-emerald-900 leading-relaxed">
                  {client.annex === 'III'
                    ? 'A clínica encontra-se devidamente enquadrada no Anexo III (6,0%). Recomenda-se manter a folha de pagamento na média atual.'
                    : 'A clínica está no Anexo V (15,5%). Recomenda-se ajuste no pró-labore para atingir os 28% e obter economia tributária expressiva.'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'financial' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <span className="text-slate-500">Receitas</span>
                  <p className="text-base font-black text-emerald-800 font-mono mt-1">
                    {formatCurrency(client.monthly_revenue)}
                  </p>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                  <span className="text-slate-500">Despesas</span>
                  <p className="text-base font-black text-rose-800 font-mono mt-1">
                    {formatCurrency(client.monthly_expenses)}
                  </p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-slate-500">Resultado</span>
                  <p className="text-base font-black text-slate-900 font-mono mt-1">
                    {formatCurrency(client.monthly_revenue - client.monthly_expenses)}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Contas a Receber em Aberto:</span>
                  <strong className="font-mono text-blue-600">{formatCurrency(client.open_receivables)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Contas a Pagar em Aberto:</span>
                  <strong className="font-mono text-amber-600">{formatCurrency(client.open_payables)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Contas a Pagar Vencidas:</span>
                  <strong className="font-mono text-rose-600">{formatCurrency(client.overdue_payables)}</strong>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'taxes' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Receita Bruta Acumulada (RBT12):</span>
                  <strong className="font-mono text-slate-900 text-sm font-bold">
                    {formatCurrency(client.rbt12 || 0)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Folha de Salários Acumulada (FS12):</span>
                  <strong className="font-mono text-slate-900 text-sm">
                    {formatCurrency(client.fs12 ?? client.payroll_amount)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fator R Oficial:</span>
                  <strong className="text-slate-900 text-sm font-black text-emerald-700">
                    {client.r_factor.toFixed(1)}%
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Alíquota Efetiva Simples Nacional:</span>
                  <strong className="text-slate-900">
                    {client.effective_rate !== undefined && client.effective_rate > 0
                      ? `${client.effective_rate.toFixed(2)}% (Anexo ${client.annex})`
                      : client.annex === 'III'
                      ? '6,00% (Anexo III)'
                      : '15,50% (Anexo V)'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Faturamento no Mês:</span>
                  <strong className="font-mono text-slate-900">{formatCurrency(client.monthly_revenue)}</strong>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <span className="text-slate-700 font-bold">DAS Estimado na Competência:</span>
                  <strong className="font-mono text-emerald-700 text-sm font-black">
                    {formatCurrency(
                      client.estimated_das !== undefined && client.estimated_das > 0
                        ? client.estimated_das
                        : client.monthly_revenue *
                            ((client.effective_rate || (client.annex === 'III' ? 6 : 15.5)) / 100)
                    )}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-2 text-xs">
              {client.health_reasons.map((reason, idx) => (
                <div key={idx} className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5 text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé do Modal com Botão Explícito para Acessar Clínica */}
        <div className="p-4 sm:p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>

          <button
            onClick={() => {
              onAccessClinic(client.tenant_id, client.clinic_name);
              onClose();
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-2xs cursor-pointer"
            title="Entrar no sistema completo da clínica"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Acessar Clínica Completa</span>
          </button>
        </div>
      </div>
    </div>
  );
};
