import React, { useState, useMemo } from 'react';
import {
  Building2,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Receipt,
  ArrowRight,
  Search,
  Filter,
  ArrowUpDown,
  ShieldCheck,
  Percent,
  RefreshCw,
  Eye,
  LogIn,
} from 'lucide-react';
import {
  ConsultingPortfolioData,
  ConsultingClientSummary,
  ConsultingHealthStatus,
} from '../../types';

interface ConsultingPortfolioDashboardProps {
  portfolioData: ConsultingPortfolioData;
  isLoading?: boolean;
  onRefresh?: () => void;
  onInspectSummary: (client: ConsultingClientSummary) => void;
  onAccessClinic: (tenantId: string, clinicName: string) => void;
  competencyLabel: string;
}

type SortField =
  | 'name'
  | 'revenue'
  | 'expenses'
  | 'rf'
  | 'overdue_pay'
  | 'overdue_rec';

export const ConsultingPortfolioDashboard: React.FC<
  ConsultingPortfolioDashboardProps
> = ({
  portfolioData,
  isLoading = false,
  onRefresh,
  onInspectSummary,
  onAccessClinic,
  competencyLabel,
}) => {
  const { portfolio_summary, clients, priority_alerts } = portfolioData;

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | ConsultingHealthStatus | 'ANNEX_III' | 'ANNEX_V' | 'OVERDUE'
  >('ALL');
  const [sortField, setSortField] = useState<SortField>('overdue_pay');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val || 0);
  };

  const filteredAndSortedClients = useMemo(() => {
    let result = [...clients];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.clinic_name.toLowerCase().includes(term) ||
          (c.trade_name && c.trade_name.toLowerCase().includes(term)) ||
          (c.cnpj && c.cnpj.includes(term)) ||
          c.owner_name.toLowerCase().includes(term)
      );
    }

    if (statusFilter === 'HEALTHY') {
      result = result.filter((c) => c.health_status === 'HEALTHY');
    } else if (statusFilter === 'WARNING') {
      result = result.filter((c) => c.health_status === 'WARNING');
    } else if (statusFilter === 'CRITICAL') {
      result = result.filter((c) => c.health_status === 'CRITICAL');
    } else if (statusFilter === 'ANNEX_III') {
      result = result.filter((c) => c.annex === 'III');
    } else if (statusFilter === 'ANNEX_V') {
      result = result.filter((c) => c.annex === 'V');
    } else if (statusFilter === 'OVERDUE') {
      result = result.filter(
        (c) => c.overdue_payables > 0 || c.overdue_receivables > 0
      );
    }

    result.sort((a, b) => {
      let aVal = 0;
      let bVal = 0;
      if (sortField === 'name') {
        const compare = a.clinic_name.localeCompare(b.clinic_name);
        return sortDirection === 'asc' ? compare : -compare;
      } else if (sortField === 'revenue') {
        aVal = a.monthly_revenue;
        bVal = b.monthly_revenue;
      } else if (sortField === 'expenses') {
        aVal = a.monthly_expenses;
        bVal = b.monthly_expenses;
      } else if (sortField === 'rf') {
        aVal = a.r_factor;
        bVal = b.r_factor;
      } else if (sortField === 'overdue_pay') {
        aVal = a.overdue_payables;
        bVal = b.overdue_payables;
      } else if (sortField === 'overdue_rec') {
        aVal = a.overdue_receivables;
        bVal = b.overdue_receivables;
      }
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [clients, searchTerm, statusFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner de Contexto da Carteira - Harmonizado no padrão Dental Finance */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200/80">
              Painel Executivo
            </span>
            <span className="text-xs text-slate-500">
              Competência Contábil: <strong className="text-slate-900">{competencyLabel}</strong>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Central de Supervisão da Carteira
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Acompanhamento fiscal, financeiro e tributário integrado das clínicas clientes sob assessoria do Escritório Contaju.
          </p>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="self-start md:self-auto px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar Carteira</span>
          </button>
        )}
      </div>

      {/* 1ª LINHA: KPIs GERAIS DA CARTEIRA */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Clínicas */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Clínicas Ativas</span>
            <Building2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900">
            {portfolio_summary.total_active_clinics}
          </p>
          <span className="text-[11px] text-slate-400">100% monitoradas</span>
        </div>

        {/* Faturamento Total */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Faturamento Total</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900 truncate">
            {formatCurrency(portfolio_summary.total_portfolio_revenue)}
          </p>
          <span className="text-[11px] text-emerald-600 font-medium">Na competência</span>
        </div>

        {/* Despesas Totais */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Despesas Totais</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900 truncate">
            {formatCurrency(portfolio_summary.total_portfolio_expenses)}
          </p>
          <span className="text-[11px] text-slate-400">Na competência</span>
        </div>

        {/* Total a Receber em Aberto */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">A Receber Aberto</span>
            <Receipt className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900 truncate">
            {formatCurrency(portfolio_summary.total_portfolio_open_receivables)}
          </p>
          <span className="text-[11px] text-blue-600 font-medium">Fluxo previsto</span>
        </div>

        {/* Total a Pagar em Aberto */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">A Pagar Aberto</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-slate-900 truncate">
            {formatCurrency(portfolio_summary.total_portfolio_open_payables)}
          </p>
          <span className="text-[11px] text-slate-400">Compromissos</span>
        </div>

        {/* Total de Contas em Atraso */}
        <div className="bg-white p-4 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-2xs">
          <div className="flex items-center justify-between text-rose-700 mb-1">
            <span className="text-xs font-semibold">Total em Atraso</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-lg sm:text-xl font-black text-rose-700 truncate">
            {formatCurrency(portfolio_summary.total_portfolio_overdue)}
          </p>
          <span className="text-[11px] text-rose-600 font-bold">Pagar + Receber</span>
        </div>
      </div>

      {/* 2ª LINHA: SAÚDE DA CARTEIRA */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Saúde Global da Carteira
            </h3>
            <p className="text-xs text-slate-500">
              Classificação objetiva baseada em enquadramento no Fator R, inadimplência e pendências contábeis.
            </p>
          </div>
          <div className="text-xs text-slate-400 font-medium">
            Total avaliado: <strong>{portfolio_summary.total_active_clinics} clínicas</strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Saudáveis */}
          <div
            onClick={() => setStatusFilter('HEALTHY')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'HEALTHY'
                ? 'bg-emerald-100/70 border-emerald-500 shadow-2xs ring-2 ring-emerald-500/20'
                : 'bg-emerald-50/50 border-emerald-200/80 hover:bg-emerald-100/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-950">Saudáveis</span>
              </div>
              <span className="text-lg font-black text-emerald-700">
                {portfolio_summary.healthy_count}
              </span>
            </div>
            <p className="text-[11px] text-emerald-800/90 mt-1.5 leading-snug">
              Fator R ≥ 28% (Anexo III) e sem atrasos financeiros críticos.
            </p>
          </div>

          {/* Em Atenção */}
          <div
            onClick={() => setStatusFilter('WARNING')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'WARNING'
                ? 'bg-amber-100/70 border-amber-500 shadow-2xs ring-2 ring-amber-500/20'
                : 'bg-amber-50/50 border-amber-200/80 hover:bg-amber-100/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-950">Em Atenção</span>
              </div>
              <span className="text-lg font-black text-amber-700">
                {portfolio_summary.warning_count}
              </span>
            </div>
            <p className="text-[11px] text-amber-800/90 mt-1.5 leading-snug">
              Fator R entre 20% e 28% ou atrasos pontuais de pagamento/recebimento.
            </p>
          </div>

          {/* Críticas */}
          <div
            onClick={() => setStatusFilter('CRITICAL')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              statusFilter === 'CRITICAL'
                ? 'bg-rose-100/70 border-rose-500 shadow-2xs ring-2 ring-rose-500/20'
                : 'bg-rose-50/50 border-rose-200/80 hover:bg-rose-100/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span className="text-xs font-bold text-rose-950">Críticas</span>
              </div>
              <span className="text-lg font-black text-rose-700">
                {portfolio_summary.critical_count}
              </span>
            </div>
            <p className="text-[11px] text-rose-800/90 mt-1.5 leading-snug">
              Fator R &lt; 20% (Anexo V - carga pesada) ou atrasos &gt; R$ 5.000.
            </p>
          </div>
        </div>
      </div>

      {/* 3ª LINHA: RESUMO TRIBUTÁRIO DA CARTEIRA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Distribuição do Fator R (Sem somar percentuais!) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-600" />
                Distribuição Tributária do Fator R
              </h3>
              <span className="text-[11px] text-slate-400">
                Regra: Folha 12m ÷ Faturamento 12m
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Cada clínica possui seu próprio índice individual. O painel consolida o número de clientes enquadrados na alíquota reduzida versus alíquota onerosa.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div
                onClick={() => setStatusFilter('ANNEX_III')}
                className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 cursor-pointer hover:bg-emerald-100/60 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">Anexo III (≥ 28%)</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-emerald-200 text-emerald-900">
                    {portfolio_summary.annex_iii_count}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Alíquota inicial reduzida de <strong>6,0%</strong>
                </p>
              </div>

              <div
                onClick={() => setStatusFilter('ANNEX_V')}
                className="p-3 bg-amber-50 rounded-xl border border-amber-200 cursor-pointer hover:bg-amber-100/60 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900">Anexo V (&lt; 28%)</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-amber-200 text-amber-900">
                    {portfolio_summary.annex_v_count}
                  </span>
                </div>
                <p className="text-[11px] text-amber-700 mt-1">
                  Alíquota inicial majorada de <strong>15,5%</strong>
                </p>
              </div>
            </div>

            {/* Barra Visual de Proporção */}
            <div className="w-full bg-slate-100 rounded-full h-3 flex overflow-hidden">
              <div
                style={{
                  width: `${
                    portfolio_summary.total_active_clinics > 0
                      ? (portfolio_summary.annex_iii_count /
                          portfolio_summary.total_active_clinics) *
                        100
                      : 0
                  }%`,
                }}
                className="bg-emerald-500 h-full transition-all duration-500"
                title="Clínicas no Anexo III"
              />
              <div
                style={{
                  width: `${
                    portfolio_summary.total_active_clinics > 0
                      ? (portfolio_summary.annex_v_count /
                          portfolio_summary.total_active_clinics) *
                        100
                      : 0
                  }%`,
                }}
                className="bg-amber-500 h-full transition-all duration-500"
                title="Clínicas no Anexo V"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
            <span>Verde: Anexo III garantido</span>
            <span>Laranja: Anexo V (potencial de economia com ajuste de folha)</span>
          </div>
        </div>

        {/* DAS Estimado & Fechamentos */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
              <Receipt className="w-4 h-4 text-emerald-600" />
              Arrecadação Fiscal Prevista
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Estimativa agregada de imposto Simples Nacional a recolher pela carteira.
            </p>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 mb-3">
              <span className="text-xs font-semibold text-slate-500">DAS Total Estimado</span>
              <p className="text-2xl font-black text-slate-900 mt-0.5">
                {formatCurrency(portfolio_summary.estimated_total_das)}
              </p>
              <span className="text-[11px] text-slate-400">
                Vencimento padrão: dia 20 do mês seguinte
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
              <span className="text-xs font-semibold text-emerald-950">
                Pendências de Fechamento:
              </span>
              <span className="text-xs font-black text-emerald-800">
                {portfolio_summary.pending_closing_count === 0
                  ? 'Todas em dia'
                  : `${portfolio_summary.pending_closing_count} pendente(s)`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4ª LINHA: TABELA PRINCIPAL DOS CLIENTES COM AÇÕES DUPLAS (RESUMO & ACESSAR CLÍNICA) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {/* Barra Superior da Tabela */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Carteira de Clínicas Supervisionadas
            </h3>
            <p className="text-xs text-slate-500">
              Listagem analítica com opções de inspeção rápida de resumo ou acesso integral ao Dental Finance da clínica.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrar nesta lista..."
                className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 w-44 sm:w-56"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs overflow-x-auto">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas ({clients.length})
              </button>
              <button
                onClick={() => setStatusFilter('HEALTHY')}
                className={`px-2 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  statusFilter === 'HEALTHY'
                    ? 'bg-emerald-500 text-slate-950 shadow-2xs'
                    : 'text-emerald-700 hover:bg-emerald-100/50'
                }`}
              >
                Saudáveis
              </button>
              <button
                onClick={() => setStatusFilter('WARNING')}
                className={`px-2 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  statusFilter === 'WARNING'
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'text-amber-700 hover:bg-amber-100/50'
                }`}
              >
                Atenção
              </button>
              <button
                onClick={() => setStatusFilter('CRITICAL')}
                className={`px-2 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  statusFilter === 'CRITICAL'
                    ? 'bg-rose-500 text-white shadow-2xs'
                    : 'text-rose-700 hover:bg-rose-100/50'
                }`}
              >
                Críticas
              </button>
              <button
                onClick={() => setStatusFilter('OVERDUE')}
                className={`px-2 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  statusFilter === 'OVERDUE'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-200/50'
                }`}
              >
                Com Atrasos
              </button>
            </div>
          </div>
        </div>

        {/* Tabela de Clientes */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80">
              <tr>
                <th
                  onClick={() => handleSort('name')}
                  className="p-3.5 pl-5 cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Clínica / CNPJ</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="p-3.5 select-none">Responsável</th>
                <th
                  onClick={() => handleSort('revenue')}
                  className="p-3.5 cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Faturamento Mês</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('expenses')}
                  className="p-3.5 cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Despesas Mês</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('rf')}
                  className="p-3.5 cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Fator R (%)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('overdue_pay')}
                  className="p-3.5 cursor-pointer hover:text-slate-900 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Atrasos (Pagar / Rec.)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="p-3.5 select-none">Integração Contaju</th>
                <th className="p-3.5 select-none">Status Geral</th>
                <th className="p-3.5 pr-5 text-right select-none">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSortedClients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 text-xs">
                    Nenhuma clínica localizada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredAndSortedClients.map((client) => {
                  const hasOverdue =
                    client.overdue_payables > 0 || client.overdue_receivables > 0;

                  return (
                    <tr
                      key={client.tenant_id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Clínica */}
                      <td className="p-3.5 pl-5">
                        <div className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                          {client.clinic_name}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          <span>{client.cnpj || 'CNPJ não informado'}</span>
                          {client.trade_name && client.trade_name !== client.clinic_name && (
                            <span className="text-slate-300">• {client.trade_name}</span>
                          )}
                        </div>
                      </td>

                      {/* Responsável */}
                      <td className="p-3.5">
                        <div className="font-medium text-slate-800">{client.owner_name}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                          {client.owner_email || client.owner_phone || 'Sem contato'}
                        </div>
                      </td>

                      {/* Faturamento */}
                      <td className="p-3.5 font-bold text-slate-900">
                        {formatCurrency(client.monthly_revenue)}
                      </td>

                      {/* Despesas */}
                      <td className="p-3.5 text-slate-700">
                        {formatCurrency(client.monthly_expenses)}
                      </td>

                      {/* Fator R */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-slate-900">
                            {client.r_factor.toFixed(1)}%
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                              client.annex === 'III'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {client.annex === 'III' ? 'Anexo III' : 'Anexo V'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Folha: {formatCurrency(client.payroll_amount)}
                        </div>
                      </td>

                      {/* Atrasos */}
                      <td className="p-3.5">
                        {hasOverdue ? (
                          <div className="space-y-0.5">
                            {client.overdue_payables > 0 && (
                              <div className="text-rose-600 font-bold text-[11px]">
                                Pagar: {formatCurrency(client.overdue_payables)}
                              </div>
                            )}
                            {client.overdue_receivables > 0 && (
                              <div className="text-amber-600 font-semibold text-[11px]">
                                Rec.: {formatCurrency(client.overdue_receivables)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Em dia
                          </span>
                        )}
                      </td>

                      {/* Status Integração Contaju */}
                      <td className="p-3.5">
                        {client.contaju_sync_status === 'SYNCED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                            Sincronizado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Pendente
                          </span>
                        )}
                      </td>

                      {/* Status Geral */}
                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            client.health_status === 'HEALTHY'
                              ? 'bg-emerald-100 text-emerald-800'
                              : client.health_status === 'WARNING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                          title={client.health_reasons.join(' | ')}
                        >
                          {client.health_status === 'HEALTHY' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          {client.health_status === 'WARNING' && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          )}
                          {client.health_status === 'CRITICAL' && (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          {client.health_status === 'HEALTHY'
                            ? 'Saudável'
                            : client.health_status === 'WARNING'
                            ? 'Atenção'
                            : 'Crítica'}
                        </span>
                      </td>

                      {/* AÇÕES: VER RESUMO & ACESSAR CLÍNICA */}
                      <td className="p-3.5 pr-5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => onInspectSummary(client)}
                            className="px-2.5 py-1.5 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700 hover:text-emerald-900 rounded-xl font-semibold text-xs inline-flex items-center gap-1 transition-all cursor-pointer"
                            title="Visualizar resumo de supervisão"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Resumo</span>
                          </button>

                          <button
                            onClick={() => onAccessClinic(client.tenant_id, client.clinic_name)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow-2xs hover:shadow-xs cursor-pointer group/btn"
                            title="Entrar no ambiente completo da clínica no Dental Finance"
                          >
                            <LogIn className="w-3.5 h-3.5" />
                            <span>Acessar Clínica</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5ª LINHA: ALERTAS PRIORITÁRIOS DA CARTEIRA */}
      {priority_alerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Alertas Prioritários de Acompanhamento ({priority_alerts.length})
            </h3>
            <span className="text-xs text-slate-400">Requerem contato ou ajuste</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {priority_alerts.map((alert, idx) => {
              const matchedClient = clients.find((c) => c.tenant_id === alert.tenant_id);

              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-rose-50/60 border-rose-200 text-rose-950'
                      : 'bg-amber-50/60 border-amber-200 text-amber-950'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-bold text-xs truncate">{alert.clinic_name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-rose-200 text-rose-800'
                            : 'bg-amber-200 text-amber-800'
                        }`}
                      >
                        {alert.severity === 'CRITICAL' ? 'Crítico' : 'Atenção'}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">{alert.message}</p>
                  </div>

                  {matchedClient && (
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => onInspectSummary(matchedClient)}
                        className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver Resumo</span>
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        onClick={() => onAccessClinic(matchedClient.tenant_id, matchedClient.clinic_name)}
                        className="text-xs font-bold text-slate-800 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Acessar Clínica</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
