import React, { useEffect, useRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
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
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
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
  isCollapsed = false,
  onToggleCollapse,
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

  // Controle inteligente de auto-collapse:
  // Recolhe automaticamente após 5s somente no primeiro carregamento.
  // Se o usuário clicar manualmente para expandir ou recolher, respeita a decisão do usuário durante a sessão.
  const hasUserInteractedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleManualToggle = (collapsed: boolean) => {
    hasUserInteractedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onToggleCollapse?.(collapsed);
  };

  useEffect(() => {
    if (!isCollapsed && onToggleCollapse && !hasUserInteractedRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!hasUserInteractedRef.current) {
          onToggleCollapse?.(true);
        }
      }, 5000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isCollapsed, onToggleCollapse]);

  const handleMouseEnter = () => {
    if (timerRef.current && !hasUserInteractedRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  const handleMouseLeave = () => {
    if (!isCollapsed && onToggleCollapse && !hasUserInteractedRef.current) {
      timerRef.current = setTimeout(() => {
        if (!hasUserInteractedRef.current) {
          onToggleCollapse?.(true);
        }
      }, 5000);
    }
  };

  const sections: NavSection[] = [
    {
      title: 'VISÃO GERAL',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
      ],
    },
    {
      title: 'PACIENTES & AGENDA',
      items: [
        { id: 'patients', label: 'Pacientes', icon: Users },
        { id: 'agenda', label: 'Agenda', icon: Calendar },
      ],
    },
    {
      title: 'FISCAL & ESTRATÉGICO',
      items: [
        { id: 'taxes', label: 'Impostos & Fator R', icon: Calculator },
        { id: 'fiscal_simulator', label: 'Simulador Fiscal', icon: SlidersHorizontal },
        { id: 'reports', label: 'Relatórios & DRE', icon: FileSpreadsheet },
      ],
    },
    {
      title: 'CADASTROS & GESTÃO',
      items: [
        { id: 'procedures', label: 'Procedimentos & Custos', icon: Activity },
        { id: 'supplies', label: 'Insumos & Estoque', icon: FlaskConical },
        { id: 'financial', label: 'Gestão Financeira', icon: Landmark },
        { id: 'bank_accounts', label: 'Contas Bancárias', icon: Wallet },
        { id: 'chart_of_accounts', label: 'Plano de Contas', icon: FolderTree },
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

      {/* Sidebar Container:
          - Modo Compacto Vertical: w-[112px] com ícone em cima e nome completo embaixo
          - Modo Expandido: w-[280px]
      */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`fixed top-0 bottom-0 left-0 z-50 bg-white text-slate-800 border-r border-slate-200/80 flex flex-col transition-all duration-300 ${
          isCollapsed ? 'w-[112px]' : 'w-[280px]'
        } ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Botão de Toggle SEMPRE visível na borda direita externa */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={() => handleManualToggle(!isCollapsed)}
            title={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            aria-label={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            className="hidden lg:flex items-center justify-center absolute -right-3.5 top-5 w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 shadow-md transition-all hover:scale-110 cursor-pointer z-50 focus:outline-none"
          >
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
          </button>
        )}

        {/* Brand Header */}
        {isCollapsed ? (
          <div className="p-2.5 border-b border-slate-100 flex flex-col items-center justify-center gap-1 min-h-[65px]">
            <button
              onClick={() => handleManualToggle(false)}
              title="Clique para expandir o menu lateral"
              className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-xs hover:scale-105 transition-transform cursor-pointer"
            >
              <Stethoscope className="w-4.5 h-4.5" />
            </button>
            <span className="text-[8.5px] uppercase font-black tracking-wider px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60">
              PRO
            </span>
          </div>
        ) : (
          <div className="p-4 border-b border-slate-100 flex items-center justify-between min-h-[65px]">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-xs shrink-0">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-extrabold text-sm tracking-tight text-slate-900 flex items-center gap-1.5">
                  <span>Dental</span>
                  <span className="text-emerald-700">Finance</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 ml-0.5">
                    PRO
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium truncate">Contabilidade Híbrida</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Menu */}
        <nav
          className={`flex-1 py-3 overflow-y-auto overflow-x-hidden ${
            isCollapsed ? 'px-1.5 space-y-2' : 'px-3.5 space-y-4'
          }`}
        >
          {sections.map((section, idx) => (
            <div key={section.title} className="space-y-1">
              {isCollapsed ? (
                idx > 0 && <div className="h-px bg-slate-200/60 my-2 mx-1" />
              ) : (
                <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2 pb-1.5 whitespace-nowrap">
                  {section.title}
                </div>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                // 1. MODO COMPACTO VERTICAL: Ícone em cima + Nome integral embaixo centralizado
                if (isCollapsed) {
                  return (
                    <button
                      key={item.id}
                      id={`nav-${item.id}`}
                      onClick={() => {
                        onSelectTab(item.id);
                        onCloseMobile();
                      }}
                      title={item.label}
                      className={`w-full flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer group relative text-center ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-300 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                      }`}
                    >
                      <div className="relative flex items-center justify-center mb-1">
                        <Icon
                          className={`w-5 h-5 shrink-0 transition-colors ${
                            isActive ? 'text-emerald-700' : 'text-slate-400 group-hover:text-slate-700'
                          }`}
                        />
                        {item.badge !== undefined && (
                          <span className="absolute -top-1 -right-2 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                          </span>
                        )}
                      </div>

                      {/* Nome completo legível, centralizado, sem nenhuma abreviação */}
                      <span className={`text-[10px] leading-tight text-center break-words max-w-full px-0.5 ${
                        isActive ? 'text-emerald-950 font-bold' : 'text-slate-700 group-hover:text-slate-900 font-medium'
                      }`}>
                        {item.label}
                      </span>
                    </button>
                  );
                }

                // 2. MODO EXPANDIDO: Ícone à esquerda + Nome integral à direita
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
                      <span className="whitespace-nowrap font-medium">{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold shadow-2xs shrink-0 ml-2 ${
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

        {/* Footer */}
        {isCollapsed ? (
          <div className="p-2 border-t border-slate-100 bg-slate-50/50 flex flex-col items-center gap-1.5">
            <div
              className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center cursor-default"
              title="Motor Fiscal Ativo (2026)"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                title="Sair do Sistema"
                className="w-full py-2 px-1 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors flex flex-col items-center justify-center cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-[10px] font-semibold text-slate-700 hover:text-rose-600 mt-0.5">
                  Sair
                </span>
              </button>
            )}
          </div>
        ) : (
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
                className="mt-2.5 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair do Sistema</span>
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
