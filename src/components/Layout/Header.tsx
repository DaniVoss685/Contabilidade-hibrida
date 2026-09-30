import React, { useEffect, useRef, useState } from 'react';
import {
  Menu,
  PlusCircle,
  AlertTriangle,
  Building2,
  Sparkles,
  Search,
  Plus,
  LogOut,
  MoreVertical,
} from 'lucide-react';
import { Professional, Organization } from '../../types';
import { formatCpf, formatCnpj } from '../../lib/masks';
import { NotificationBellDropdown } from '../Notifications/NotificationBellDropdown';

interface HeaderProps {
  organization: Organization;
  professional: Professional;
  clinicDisplayName?: string;
  tenantId?: string;
  currentUserId?: string;
  onOpenConversation?: (conversationId: string, contactId?: string, targetTenantId?: string) => void;
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
  onOpenGlobalSearch?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  organization,
  professional,
  clinicDisplayName,
  tenantId,
  currentUserId,
  onOpenConversation,
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
  onOpenGlobalSearch,
}) => {
  // Menu "..." (mobile/tablet): ações secundárias que não cabem na barra
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isMoreOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setIsMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [isMoreOpen]);

  const clinicTitle =
    (clinicDisplayName && clinicDisplayName !== 'Clínica sem nome' ? clinicDisplayName : '') ||
    (organization?.name && organization.name !== 'Clínica sem nome' && organization.name !== 'Clínica Odontológica' ? organization.name : '') ||
    (professional?.nomeFantasia && professional.nomeFantasia !== 'Clínica sem nome' ? professional.nomeFantasia : '') ||
    (professional?.razaoSocial && professional.razaoSocial !== 'Clínica sem nome' ? professional.razaoSocial : '') ||
    organization?.tradeName ||
    'Clínica sem nome';

  return (
    <header data-app-topbar className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-[env(safe-area-inset-top)] lg:static z-30">
      <div className="px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left Side: Clinic Identity */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden tap-target -ml-1 shrink-0 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Abrir menu"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-snug truncate max-w-full">
                {clinicTitle}
              </h1>
              {isDemo && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs" title="Ambiente com dados fictícios para demonstração">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  Modo Demonstração
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1.5">
              <span>{professional.name}</span>
              {professional.cro && (
                <>
                  <span className="opacity-40">•</span>
                  <span>CRO-{professional.croUf} {professional.cro}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Busca compacta (mobile/tablet) */}
        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="xl:hidden tap-target shrink-0 rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
          aria-label="Buscar paciente"
          title="Buscar paciente"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Center: Search Bar Shortcut (Prodex / TradoX style) */}
        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="hidden xl:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/70 border border-slate-200/80 hover:border-slate-300 text-slate-400 hover:text-slate-600 text-xs w-64 2xl:w-80 select-none transition-all cursor-pointer shadow-2xs group"
          title="Buscar paciente por nome, CPF ou telefone (Ctrl+K ou ⌘K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
          <span className="text-slate-500 text-xs truncate">Buscar paciente...</span>
          <kbd className="ml-auto text-[10px] font-mono font-semibold bg-white border border-slate-200/90 px-1.5 py-0.5 rounded text-slate-500 shadow-2xs group-hover:border-emerald-300 group-hover:text-emerald-700 transition-colors">
            ⌘K
          </kbd>
        </button>

        {/* Right Side: Primary and Secondary Action Hierarchy */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">

          {/* Pending Receita Saúde Notification Pill */}
          {pendingReceitaSaudeCount > 0 && (
            <button
              onClick={() => onNavigateToTab('receivables')}
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100 transition-colors cursor-pointer"
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
            className="hidden xl:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50/80 hover:bg-rose-100 border border-rose-200/80 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-rose-600" />
            <span>Nova Despesa</span>
          </button>

          {/* Primary Action: + NOVA RECEITA (Clear Primary Accent) */}
          <button
            id="btn-nova-receita"
            onClick={onOpenNewSale}
            aria-label="Nova Receita"
            className="flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] xl:min-h-0 px-3 xl:px-4 xl:py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-5 h-5 xl:w-3.5 xl:h-3.5" />
            <span className="hidden xl:inline">Nova Receita</span>
          </button>

          {/* Notification Bell Dropdown */}
          {tenantId && onOpenConversation && (
            <div className="sm:ml-1">
              <NotificationBellDropdown
                tenantId={tenantId}
                userId={currentUserId}
                onOpenConversation={onOpenConversation}
              />
            </div>
          )}

          {/* Logout Action */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="hidden xl:inline-flex p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer ml-0.5"
              title="Encerrar Sessão / Sair"
              aria-label="Encerrar sessão"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          {/* Menu de ações secundárias (mobile/tablet) */}
          <div className="relative xl:hidden" ref={moreRef}>
            <button
              type="button"
              onClick={() => setIsMoreOpen((v) => !v)}
              aria-label="Mais ações"
              aria-expanded={isMoreOpen}
              className="tap-target relative rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <MoreVertical className="w-5 h-5" />
              {pendingReceitaSaudeCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
              )}
            </button>
            {isMoreOpen && (
              <div className="absolute right-0 top-full mt-1 w-[min(15rem,calc(100vw-1.5rem))] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-150">
                {pendingReceitaSaudeCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreOpen(false);
                      onNavigateToTab('receivables');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-amber-900 hover:bg-amber-50 text-left cursor-pointer"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{pendingReceitaSaudeCount} {pendingReceitaSaudeCount === 1 ? 'pendência' : 'pendências'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsMoreOpen(false);
                    onOpenNewExpense();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-rose-700 hover:bg-rose-50 text-left cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Nova Despesa</span>
                </button>
                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMoreOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>Sair</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
