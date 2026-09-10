import React from 'react';
import {
  Menu,
  PlusCircle,
  Eye,
  EyeOff,
  AlertTriangle,
  FileText,
  Building2,
  Sparkles,
} from 'lucide-react';
import { Professional, Organization } from '../../types';
import { formatCpf, formatCnpj } from '../../lib/masks';

interface HeaderProps {
  organization: Organization;
  professional: Professional;
  onOpenMobileMenu: () => void;
  onOpenNewSale: () => void;
  onOpenNewExpense: () => void;
  maskCpf: boolean;
  onToggleMaskCpf: () => void;
  pendingReceitaSaudeCount: number;
  onNavigateToTab: (tab: any) => void;
  onQuickToggleFatorR: () => void;
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
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Left Side: Mobile Menu Button & Clinic Info */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            title="Abrir menu"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight leading-none">
                {organization.name}
              </h1>
              <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                <Building2 className="w-3 h-3 mr-1 text-slate-500" />
                {professional.municipio}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="font-medium text-slate-700">{professional.name}</span>
              <span>•</span>
              <span>CRO-{professional.croUf} {professional.cro}</span>
              <span>•</span>
              <span className="font-mono">
                CPF: {formatCpf(professional.cpf, maskCpf)}
              </span>
              {professional.cnpj && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline font-mono">
                    CNPJ: {formatCnpj(professional.cnpj)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: LGPD Toggle, Alerts, Action Buttons */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Fator R Simulation Shortcut */}
          <button
            onClick={onQuickToggleFatorR}
            className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer"
            title="Alternar rapidamente entre Fator R >= 28% (Anexo III) e < 28% (Anexo V) para testes"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Testar Fator R (III / V)</span>
          </button>

          {/* LGPD Mask CPF Toggle */}
          <button
            onClick={onToggleMaskCpf}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              maskCpf
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
            title="LGPD: Ocultar ou exibir CPFs na interface e relatórios"
          >
            {maskCpf ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CPF Mascarado</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CPF Visível</span>
              </>
            )}
          </button>

          {/* Pending Receita Saúde Notification Pill */}
          {pendingReceitaSaudeCount > 0 && (
            <button
              onClick={() => onNavigateToTab('receivables')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors animate-pulse cursor-pointer"
              title={`${pendingReceitaSaudeCount} recebimentos em CPF possuem Receita Saúde pendente de emissão!`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden md:inline">Receita Saúde:</span>
              <span className="bg-amber-500 text-white px-1.5 py-0.2 rounded-full text-[10px]">
                {pendingReceitaSaudeCount} pendente{pendingReceitaSaudeCount > 1 ? 's' : ''}
              </span>
            </button>
          )}

          {/* Secondary Action: Nova Despesa */}
          <button
            id="btn-nova-despesa"
            onClick={onOpenNewExpense}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-slate-500" />
            <span>Nova Despesa</span>
          </button>

          {/* Primary Action: + NOVA RECEITA (Prominently styled) */}
          <button
            id="btn-nova-receita"
            onClick={onOpenNewSale}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-700/20 active:scale-98 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ NOVA RECEITA</span>
          </button>
        </div>
      </div>
    </header>
  );
};
