import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  ReceiptText,
  TrendingDown,
  Users,
  FolderTree,
  Calculator,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  Stethoscope,
  Activity,
  FlaskConical,
  Landmark,
  SlidersHorizontal,
  Wallet,
  Calendar,
  LogOut,
  Repeat,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'sales'
  | 'procedures'
  | 'supplies'
  | 'receivables'
  | 'expenses'
  | 'recurrent_expenses'
  | 'financial'
  | 'bank_accounts'
  | 'patients'
  | 'agenda'
  | 'chart_of_accounts'
  | 'taxes'
  | 'fiscal_simulator'
  | 'reports'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingReceitaSaudeCount: number;
  overdueReceivablesCount: number;
  overdueExpensesCount: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  pendingReceitaSaudeCount,
  overdueReceivablesCount,
  overdueExpensesCount,
  isOpenMobile,
  onCloseMobile,
  onLogout,
}) => {
  interface NavSection {
    title: string;
    items: {
      id: NavTab;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      badge?: number;
      badgeColor?: string;
    }[];
  }

  const sections: NavSection[] = [
    {
      title: 'VISÃO GERAL',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'financial', label: 'Gestão Financeira', icon: Landmark },
        { id: 'bank_accounts', label: 'Contas Bancárias', icon: Wallet },
      ],
    },
    {
      title: 'OPERAÇÃO CLÍNICA',
      items: [
        { id: 'patients', label: 'Pacientes', icon: Users },
        { id: 'agenda', label: 'Agenda', icon: Calendar },
        { id: 'procedures', label: 'Procedimentos & Custos', icon: Activity },
        { id: 'supplies', label: 'Insumos & Estoque', icon: FlaskConical },
      ],
    },
    {
      title: 'MOVIMENTAÇÃO',
      items: [
        {
          id: 'sales',
          label: 'Receitas / Vendas',
          icon: TrendingUp,
          badge: pendingReceitaSaudeCount > 0 ? pendingReceitaSaudeCount : undefined,
          badgeColor: 'bg-amber-100 text-amber-800 border border-amber-200',
        },
        {
          id: 'receivables',
          label: 'Contas a Receber',
          icon: ReceiptText,
          badge: overdueReceivablesCount > 0 ? overdueReceivablesCount : undefined,
          badgeColor: 'bg-rose-100 text-rose-800 border border-rose-200',
        },
        {
          id: 'expenses',
          label: 'Despesas / A Pagar',
          icon: TrendingDown,
          badge: overdueExpensesCount > 0 ? overdueExpensesCount : undefined,
          badgeColor: 'bg-rose-100 text-rose-800 border border-rose-200',
        },
        {
          id: 'recurrent_expenses',
          label: 'Despesas Recorrentes',
          icon: Repeat,
        },
      ],
    },
    {
      title: 'FISCAL & ESTRATÉGICO',
      items: [
        { id: 'taxes', label: 'Impostos & Fator R', icon: Calculator },
        { id: 'fiscal_simulator', label: 'Simulador Fiscal', icon: SlidersHorizontal },
        { id: 'chart_of_accounts', label: 'Plano de Contas', icon: FolderTree },
        { id: 'reports', label: 'Relatórios & DRE', icon: FileSpreadsheet },
        { id: 'settings', label: 'Configurações', icon: Settings },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-68 bg-white text-slate-800 border-r border-slate-200/80 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-xs">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-tight text-slate-900 flex items-center gap-1.5">
                <span>Dental</span>
                <span className="text-emerald-700">Finance</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 ml-0.5">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Contabilidade Híbrida</p>
            </div>
          </div>
        </div>

        {/* Navigation Menu with Semantic Sections */}
        <nav className="flex-1 px-3.5 py-3.5 space-y-4 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2 pb-1.5">
                {section.title}
              </div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    onClick={() => {
                      onSelectTab(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between py-2.5 text-xs transition-all cursor-pointer group ${
                      isActive
                        ? 'bg-slate-100/90 text-slate-900 font-bold pl-3.5 pr-2.5 rounded-xl relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-emerald-600 before:rounded-r-full shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/90 px-3 rounded-xl font-medium'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-emerald-700' : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold shadow-2xs ${
                          item.badgeColor || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Executive Fiscal Card Footer */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50">
          <div className="p-3 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-bold text-slate-800">Motor Fiscal Ativo</span>
              </div>
              <span className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                2026
              </span>
            </div>
            <p className="text-[10.5px] text-slate-500 font-medium leading-tight">
              Simples Nacional • Carnê-Leão
            </p>
            <div className="text-[9.5px] text-slate-400 mt-1 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>Conforme RIR/2018 & LC 123</span>
            </div>
          </div>

          {onLogout && (
            <button
              onClick={onLogout}
              className="mt-2.5 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair do Sistema</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
