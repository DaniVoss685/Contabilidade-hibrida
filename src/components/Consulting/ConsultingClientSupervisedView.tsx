import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Receipt,
  TrendingUp,
  AlertTriangle,
  Clock,
  Layers,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  ExternalLink,
  Info,
} from 'lucide-react';
import {
  ConsultingClientSummary,
  ConsultingSupervisedTab,
} from '../../types';

interface ConsultingClientSupervisedViewProps {
  client: ConsultingClientSummary;
  competency: string; // formato YYYY-MM
  onBackToPortfolio: () => void;
  onOpenFiscalSimulator?: () => void;
}

export const ConsultingClientSupervisedView: React.FC<
  ConsultingClientSupervisedViewProps
> = ({ client, competency, onBackToPortfolio, onOpenFiscalSimulator }) => {
  const [activeTab, setActiveTab] = useState<ConsultingSupervisedTab>('summary');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner de Supervisão Executiva com Botão de Retorno */}
      <div className="bg-white rounded-2xl border-2 border-emerald-500/30 p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToPortfolio}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-900 transition-colors flex items-center gap-2 text-xs font-bold cursor-pointer shrink-0"
              title="Voltar para a Carteira de Clientes"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-600" />
              <span>Voltar para Carteira</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Visão Supervisionada (Somente Leitura)
                </span>
                <span className="text-xs text-slate-400">
                  Competência: <strong>{competency}</strong>
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 truncate mt-0.5">
                {client.clinic_name}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                CNPJ: <strong>{client.cnpj || 'Não informado'}</strong> • Responsável:{' '}
                <strong>{client.owner_name}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                client.health_status === 'HEALTHY'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : client.health_status === 'WARNING'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {client.health_status === 'HEALTHY' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
              {client.health_status === 'WARNING' && (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
              {client.health_status === 'CRITICAL' && (
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              )}
              <span>
                {client.health_status === 'HEALTHY'
                  ? 'Status Saudável'
                  : client.health_status === 'WARNING'
                  ? 'Status Atenção'
                  : 'Status Crítico'}
              </span>
            </span>
          </div>
        </div>

        {/* Abas Supervisionadas */}
        <div className="flex items-center gap-1 border-t border-slate-100 mt-4 pt-3 overflow-x-auto">
          {[
            { id: 'summary', label: 'Resumo do Cliente', icon: Building2 },
            { id: 'financial', label: 'Financeiro Supervisionado', icon: TrendingUp },
            { id: 'taxes', label: 'Impostos & Fator R', icon: Receipt },
            { id: 'pending', label: 'Pendências & Alertas', icon: AlertTriangle },
            { id: 'contaju', label: 'Integração Contaju', icon: Layers },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ConsultingSupervisedTab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo da Aba Ativa */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Cards de Métricas Principais da Clínica */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-400">Faturamento no Mês</span>
              <p className="text-xl font-black text-slate-900 mt-1">
                {formatCurrency(client.monthly_revenue)}
              </p>
              <span className="text-[11px] text-emerald-600 font-medium">Receitas registradas</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-400">Despesas no Mês</span>
              <p className="text-xl font-black text-slate-900 mt-1">
                {formatCurrency(client.monthly_expenses)}
              </p>
              <span className="text-[11px] text-slate-400">Total operacional</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-400">Fator R Atual</span>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xl font-black text-slate-900">
                  {client.r_factor.toFixed(1)}%
                </p>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    client.annex === 'III'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {client.annex === 'III' ? 'Anexo III' : 'Anexo V'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Valor da folha: {formatCurrency(client.payroll_amount)}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <span className="text-xs font-semibold text-slate-400">Atrasos a Pagar</span>
              <p
                className={`text-xl font-black mt-1 ${
                  client.overdue_payables > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {formatCurrency(client.overdue_payables)}
              </p>
              <span className="text-[11px] text-slate-400">
                A receber em atraso: {formatCurrency(client.overdue_receivables)}
              </span>
            </div>
          </div>

          {/* Dados Cadastrais & Diagnóstico */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <Building2 className="w-4 h-4 text-emerald-600" />
                Dados Cadastrais e Societários
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Razão Social:</span>
                  <strong className="text-slate-800">{client.clinic_name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Nome Fantasia:</span>
                  <strong className="text-slate-800">{client.trade_name || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">CNPJ:</span>
                  <strong className="text-slate-800">{client.cnpj || 'Não informado'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Responsável Clínico:</span>
                  <strong className="text-slate-800">{client.owner_name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">E-mail:</span>
                  <span className="text-slate-800">{client.owner_email || 'Não informado'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Telefone:</span>
                  <span className="text-slate-800">{client.owner_phone || 'Não informado'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Diagnóstico de Supervisão Tributária
              </h3>
              <div className="space-y-2.5">
                {client.health_reasons.map((reason, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 flex items-start gap-2.5 border border-slate-200/60"
                  >
                    <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </div>
                ))}

                <div className="pt-2">
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-950">
                    <strong>Recomendação Contaju:</strong>{' '}
                    {client.annex === 'III'
                      ? 'Manter a folha mensal atual para preservar o enquadramento no Anexo III (6,0%).'
                      : 'Ajustar o pró-labore mensal para alcançar 28% do faturamento e migrar para o Anexo III com redução de 9,5% de alíquota.'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aba Financeiro */}
      {activeTab === 'financial' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Demonstrativo Financeiro Supervisionado ({competency})
            </h3>
            <p className="text-xs text-slate-500">
              Visão auditada dos fluxos de entrada, saída e posição de contas em aberto do cliente.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/80">
              <span className="text-xs font-semibold text-emerald-900">Entradas / Receitas</span>
              <p className="text-2xl font-black text-emerald-800 mt-1">
                {formatCurrency(client.monthly_revenue)}
              </p>
              <span className="text-[11px] text-emerald-700">A receber: {formatCurrency(client.open_receivables)}</span>
            </div>

            <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-200/80">
              <span className="text-xs font-semibold text-rose-900">Saídas / Despesas</span>
              <p className="text-2xl font-black text-rose-800 mt-1">
                {formatCurrency(client.monthly_expenses)}
              </p>
              <span className="text-[11px] text-rose-700">A pagar: {formatCurrency(client.open_payables)}</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-600">Resultado Operacional</span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {formatCurrency(client.monthly_revenue - client.monthly_expenses)}
              </p>
              <span className="text-[11px] text-slate-400">Margem antes de tributos</span>
            </div>
          </div>

          <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Atrasos Financeiros Identificados:</strong> R$ {client.overdue_payables.toFixed(2)} em contas a pagar e R$ {client.overdue_receivables.toFixed(2)} em contas a receber.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Aba Impostos & Fator R */}
      {activeTab === 'taxes' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Painel do Fator R & Tributação ({competency})
              </h3>
              <p className="text-xs text-slate-500">
                Memória de cálculo fiscal da competência e análise de enquadramento do Simples Nacional.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-black ${
                  client.annex === 'III'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                Enquadramento: {client.annex === 'III' ? 'Anexo III (6%)' : 'Anexo V (15,5%)'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-500">Valor da Folha</span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {formatCurrency(client.payroll_amount)}
              </p>
              <span className="text-[11px] text-slate-400">Pró-labore e encargos consolidados</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-500">Fator R Calculado</span>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                {client.r_factor.toFixed(1)}%
              </p>
              <span className="text-[11px] text-slate-400">Gatilho legal: 28,00%</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-500">DAS Estimado</span>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {formatCurrency(
                  client.monthly_revenue * (client.annex === 'III' ? 0.06 : 0.155)
                )}
              </p>
              <span className="text-[11px] text-slate-400">
                Alíquota efetiva estimada: {client.annex === 'III' ? '6,0%' : '15,5%'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Aba Pendências & Alertas */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            Pendências e Alertas Operacionais da Clínica
          </h3>
          <p className="text-xs text-slate-500">
            Itens que demandam intervenção ou regularização cadastral/contábil.
          </p>

          <div className="space-y-3 mt-4">
            {client.health_reasons.map((reason, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 flex items-start gap-3 text-xs text-amber-950"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-bold">Item de Atenção Tributária / Operacional</p>
                  <p className="mt-0.5">{reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aba Integração Contaju */}
      {activeTab === 'contaju' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Status de Integração Contaju / Contábilex
              </h3>
              <p className="text-xs text-slate-500">
                Sincronização bidirecional de lançamentos contábeis, fechamentos e dados societários.
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                client.contaju_sync_status === 'SYNCED'
                  ? 'bg-teal-100 text-teal-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {client.contaju_sync_status === 'SYNCED' ? 'Conectado e Sincronizado' : 'Pendente de Vínculo'}
            </span>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
            <p>
              <strong>Vínculo Contábil:</strong> Contrato ativo no sistema Contaju.
            </p>
            <p>
              <strong>Transmissão de Snapshots:</strong> Snapshots contábeis e fiscais automáticos a cada fechamento de folha e apuração de faturamento.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
