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
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'sales'
  | 'procedures'
  | 'supplies'
  | 'receivables'
  | 'expenses'
  | 'financial'
  | 'patients'
  | 'chart_of_accounts'
  | 'taxes'
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
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  pendingReceitaSaudeCount,
  overdueReceivablesCount,
  overdueExpensesCount,
  isOpenMobile,
  onCloseMobile,
}) => {
  const menuItems: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'sales',
      label: 'Receitas / Vendas',
      icon: TrendingUp,
      badge: pendingReceitaSaudeCount > 0 ? pendingReceitaSaudeCount : undefined,
      badgeColor: 'bg-amber-500 text-white',
    },
    {
      id: 'procedures',
      label: 'Procedimentos & Custos',
      icon: Activity,
    },
    {
      id: 'supplies',
      label: 'Insumos & Materiais',
      icon: FlaskConical,
    },
    {
      id: 'receivables',
      label: 'Contas a Receber',
      icon: ReceiptText,
      badge: overdueReceivablesCount > 0 ? overdueReceivablesCount : undefined,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'expenses',
      label: 'Despesas / Contas a Pagar',
      icon: TrendingDown,
      badge: overdueExpensesCount > 0 ? overdueExpensesCount : undefined,
      badgeColor: 'bg-rose-500 text-white',
    },
    {
      id: 'financial',
      label: 'Gestão Financeira',
      icon: Landmark,
    },
    { id: 'patients', label: 'Pacientes', icon: Users },
    { id: 'chart_of_accounts', label: 'Plano de Contas', icon: FolderTree },
    { id: 'taxes', label: 'Impostos (Tributos)', icon: Calculator },
    { id: 'reports', label: 'Relatórios', icon: FileSpreadsheet },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center text-white shadow-md">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
                Dental Finance
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Híbrido
                </span>
              </div>
              <p className="text-xs text-slate-400">CPF & CNPJ para Dentistas</p>
            </div>
          </div>
        </div>

        {/* Legal/Compliance Safe Badge */}
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-700/80 text-[11px] text-slate-300 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Separação Fiscal Real & LGPD Compliance</span>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-700/30'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold shadow-xs ${
                      item.badgeColor || 'bg-slate-700 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer Info */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 text-xs text-slate-400">
          <div className="flex justify-between items-center mb-1">
            <span className="text-slate-500 font-medium">Regime Atual</span>
            <span className="text-emerald-400 font-semibold">Simples + Carnê-Leão</span>
          </div>
          <div className="text-[11px] text-slate-500 leading-tight">
            Estimativas tributárias estritamente baseadas em movimentações reais registradas.
          </div>
        </div>
      </aside>
    </>
  );
};
