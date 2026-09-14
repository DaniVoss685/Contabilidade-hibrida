import React from 'react';
import {
  Menu,
  PlusCircle,
  AlertTriangle,
  Building2,
  Sparkles,
  Search,
  Plus,
  LogOut,
} from 'lucide-react';
import { Professional, Organization } from '../../types';
import { formatCpf, formatCnpj } from '../../lib/masks';

interface HeaderProps {
  organization: Organization;
  professional: Professional;
  onOpenMobileMenu: () => void;
  onOpenNewSale: () => void;
  onOpenNewExpense: () => void;
  maskCpf?: boolean;
  onToggleMaskCpf?: () => void;
  pendingReceitaSaudeCount: number;
  onNavigateToTab: (tab: any) => void;
  onQuickToggleFatorR?: () => void;
  isDemo?: boolean;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  organization,
  professional,
  onOpenMobileMenu,
  onOpenNewSale,
  onOpenNewExpense,
  maskCpf,
  onToggleMaskCpf,
  pendingReceitaSaudeCount,
  onNavigateToTab,
  onQuickToggleFatorR,
  isDemo,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
      <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Left Side: Clinic Identity */}
        <div className="flex items-center space-x-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-1.5 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
            title="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-snug truncate">
                {professional.name}
              </h1>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/70">
                CRO-{professional.croUf} {professional.cro}
              </span>
              {isDemo && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs" title="Ambiente com dados fictícios para demonstração">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  Modo Demonstração
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-medium truncate">
              {organization.name} • {professional.municipio}
            </p>
          </div>
        </div>

        {/* Center: Search Bar Shortcut (Prodex / TradoX style) */}
        <div className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100/70 border border-slate-200/70 text-slate-400 text-xs w-64 lg:w-80 select-none">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 text-xs truncate">Buscar paciente, procedimento...</span>
          <kbd className="ml-auto text-[10px] font-mono font-semibold bg-white border border-slate-200/80 px-1.5 py-0.5 rounded text-slate-500 shadow-2xs">
            ⌘K
          </kbd>
        </div>

        {/* Right Side: Primary and Secondary Action Hierarchy */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">

          {/* Pending Receita Saúde Notification Pill */}
          {pendingReceitaSaudeCount > 0 && (
            <button
              onClick={() => onNavigateToTab('receivables')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100 transition-colors cursor-pointer"
              title={`${pendingReceitaSaudeCount} recebimentos em CPF possuem Receita Saúde pendente!`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{pendingReceitaSaudeCount} {pendingReceitaSaudeCount === 1 ? 'pendência' : 'pendências'}</span>
            </button>
          )}

          <div className="h-5 w-px bg-slate-200/80 mx-1 hidden sm:block"></div>

          {/* Secondary Action: Nova Despesa */}
          <button
            id="btn-nova-despesa"
            onClick={onOpenNewExpense}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50/80 hover:bg-rose-100 border border-rose-200/80 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden sm:inline">Nova Despesa</span>
            <span className="sm:hidden">Despesa</span>
          </button>

          {/* Primary Action: + NOVA RECEITA (Clear Primary Accent) */}
          <button
            id="btn-nova-receita"
            onClick={onOpenNewSale}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Receita</span>
          </button>

          {/* Logout Action */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer ml-1"
              title="Encerrar Sessão / Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
