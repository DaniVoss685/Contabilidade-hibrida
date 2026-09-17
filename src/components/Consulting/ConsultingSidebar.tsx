import React from 'react';
import {
  LayoutDashboard,
  Building2,
  TrendingUp,
  Receipt,
  AlertTriangle,
  Clock,
  Layers,
  FileBarChart2,
  Settings,
  GitCompare,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Stethoscope,
} from 'lucide-react';
import { ConsultingNavTab } from '../../types';

interface ConsultingSidebarProps {
  currentTab: ConsultingNavTab;
  onSelectTab: (tab: ConsultingNavTab) => void;
  pendingAlertsCount?: number;
  overdueClinicsCount?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  onLogout?: () => void;
}

interface NavSection {
  title: string;
  items: {
    id: ConsultingNavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeColor?: string;
  }[];
}

export const ConsultingSidebar: React.FC<ConsultingSidebarProps> = ({
  currentTab,
  onSelectTab,
  pendingAlertsCount = 0,
  overdueClinicsCount = 0,
  isCollapsed = false,
  onToggleCollapse,
  onLogout,
}) => {
  const sections: NavSection[] = [
    {
      title: 'VISÃO GERAL',
      items: [
        {
          id: 'portfolio',
          label: 'Visão da Carteira',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: 'CLIENTES',
      items: [
        {
          id: 'clients',
          label: 'Clínicas',
          icon: Building2,
        },
        {
          id: 'financial_indicators',
          label: 'Indicadores Financeiros',
          icon: TrendingUp,
        },
        {
          id: 'taxes_fator_r',
          label: 'Impostos & Fator R',
          icon: Receipt,
        },
      ],
    },
    {
      title: 'ACOMPANHAMENTO',
      items: [
        {
          id: 'overdue_accounts',
          label: 'Contas em Atraso',
          icon: Clock,
          badge: overdueClinicsCount > 0 ? overdueClinicsCount : undefined,
          badgeColor: 'bg-rose-100 text-rose-800 border border-rose-200',
        },
        {
          id: 'alerts_pending',
          label: 'Alertas & Pendências',
          icon: AlertTriangle,
          badge: pendingAlertsCount > 0 ? pendingAlertsCount : undefined,
          badgeColor: 'bg-amber-100 text-amber-800 border border-amber-200',
        },
        {
          id: 'contaju_integrations',
          label: 'Integrações Contaju',
          icon: Layers,
        },
      ],
    },
    {
      title: 'ANÁLISE',
      items: [
        {
          id: 'comparative',
          label: 'Comparativo',
          icon: GitCompare,
        },
        {
          id: 'reports',
          label: 'Relatórios da Carteira',
          icon: FileBarChart2,
        },
      ],
    },
    {
      title: 'CONTA',
      items: [
        {
          id: 'consulting_settings',
          label: 'Configurações Consultoria',
          icon: Settings,
        },
      ],
    },
  ];

  return (
    <aside
      className={`fixed top-0 bottom-0 left-0 bg-white text-slate-800 z-40 flex flex-col transition-all duration-300 border-r border-slate-200/90 select-none shadow-xs ${
        isCollapsed ? 'w-[112px]' : 'w-[280px]'
      }`}
    >
      {/* Botão de alternância flutuante de colapso */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={() => onToggleCollapse(!isCollapsed)}
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
            onClick={() => onToggleCollapse?.(false)}
            title="Clique para expandir o menu lateral"
            className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-xs hover:scale-105 transition-transform cursor-pointer"
          >
            <Stethoscope className="w-4.5 h-4.5" />
          </button>
          <span className="text-[8.5px] uppercase font-black tracking-wider px-1.5 py-0.2 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60">
            CONSU
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
                  CONSULTORIA
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                Supervisão & Carteira Contaju
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Menu */}
      <nav
        className={`flex-1 py-3 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200 ${
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
                    onClick={() => onSelectTab(item.id)}
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
                          isActive
                            ? 'text-emerald-700'
                            : 'text-slate-400 group-hover:text-slate-700'
                        }`}
                      />
                      {item.badge !== undefined && (
                        <span className="absolute -top-1 -right-2 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-[10px] leading-tight text-center break-words max-w-full px-0.5 ${
                        isActive
                          ? 'text-emerald-950 font-bold'
                          : 'text-slate-700 group-hover:text-slate-900 font-medium'
                      }`}
                    >
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
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between py-2.5 text-xs transition-all cursor-pointer group ${
                    isActive
                      ? 'bg-slate-100/90 text-slate-900 font-bold pl-3.5 pr-2.5 rounded-xl relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-emerald-600 before:rounded-r-full shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/90 px-3 rounded-xl font-medium'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive
                          ? 'text-emerald-700'
                          : 'text-slate-400 group-hover:text-slate-600'
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

      {/* Rodapé: Logout */}
      {onLogout && (
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={onLogout}
            className={`w-full text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer ${
              isCollapsed
                ? 'flex flex-col items-center justify-center p-2'
                : 'flex items-center gap-2.5 px-3 py-2 text-xs'
            }`}
            title="Sair do sistema"
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span className="font-medium">Encerrar Sessão</span>}
          </button>
        </div>
      )}
    </aside>
  );
};
